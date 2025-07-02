import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { handleSendMessage } from './ai.SendMessage';
import type {
  HandleSendMessageServiceParams,
  ChatMessage,
  MessageForTokenCounting,
  ChatApiRequest,
  User,
  Session,
  AiState,
  ActiveChatWalletInfo,
  AiModelExtendedConfig,
  ChatHandlerSuccessResponse,
  AiProvider,
  ChatMessageRow,
  Chat,
  ApiResponse,
  ErrorResponse // Added ErrorResponse
} from '@paynless/types';

// Import mocks from the centralized location
import {
  mockLogger, 
  resetMockLogger,
  mockAiStateService, 
  resetMockAiStateService, 
  getDefaultMockAiState,
  mockAuthService, 
  resetMockAuthService,
  mockWalletService, 
  resetMockWalletService,
  createMockAiApiClient,
  resetMockAiApiClient,
  type MockedAiApiClient
} from '../../api/src/mocks';

// --- Mock Utility Function Implementations ---
const mockEstimateInputTokensFn = vi.fn<[string | MessageForTokenCounting[], AiModelExtendedConfig], Promise<number>>();
const mockGetMaxOutputTokensFn = vi.fn<[number, number, AiModelExtendedConfig, number], number>();

let mockCallChatApi: Mock<[ChatApiRequest, RequestInit], Promise<ApiResponse<ChatHandlerSuccessResponse> | ErrorResponse>>;

let mockAiApiClientInstance: MockedAiApiClient;

// --- Default Mock Data ---
const MOCK_USER: User = { id: 'user-test-123', email: 'test@example.com', role: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
const MOCK_SESSION: Session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expiresAt: Date.now() + 3600000, token_type: 'bearer' };

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
    hard_cap_output_tokens: 2048,
    provider_max_input_tokens: 4096, // This is a valid field
    provider_max_output_tokens: 2048, // This is a valid field
    context_window_tokens: 4096, // Added to satisfy AiModelExtendedConfig
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base', is_chatml_model: true },
};

const MOCK_AI_PROVIDER: AiProvider = {
  id: 'test-provider',
  name: 'Test Provider',
  api_identifier: 'test-provider',
  config: { ...MOCK_MODEL_CONFIG, model_id: 'test-model' }, // Embed AiModelExtendedConfig here, model_id for this provider's specific model mapping
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: 'Test Provider',
  is_active: true,
  is_enabled: true,
  provider: 'test-provider',
};

const getDefaultTestServiceParams = (overrides: Partial<HandleSendMessageServiceParams['data']> = {}): HandleSendMessageServiceParams => ({
  data: { message: 'Hello', chatId: null, contextMessages: undefined, ...overrides },
  aiStateService: mockAiStateService,
  authService: mockAuthService,
  walletService: mockWalletService,
  logger: mockLogger,
  callChatApi: mockCallChatApi, // Assign the new mock directly
});


describe('handleSendMessage', () => {
  let testSpecificAiState: AiState; // This will serve the role of currentTestAiState

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockLogger();
    resetMockAiStateService(); // Resets the vi.fn() mocks themselves
    resetMockAuthService();
    resetMockWalletService();
    // ... other resets like mockAiApiClientInstance, mockCallChatApi, mockEstimateInputTokensFn, mockGetMaxOutputTokensFn ...
    mockAiApiClientInstance = createMockAiApiClient();
    resetMockAiApiClient(mockAiApiClientInstance);
    mockCallChatApi = vi.fn(); 


    (mockAuthService.getCurrentUser as Mock).mockReturnValue(MOCK_USER);
    (mockAuthService.getSession as Mock).mockReturnValue(MOCK_SESSION); // Use corrected session
    (mockWalletService.getActiveWalletInfo as Mock).mockReturnValue({
      status: 'ok', type: 'personal', balance: '10000', orgId: null, walletId: 'personal-wallet-id', message: undefined, isLoadingPrimaryWallet: false
    } as ActiveChatWalletInfo); // Ensure message is explicitly undefined if not present, or null
    
    // Initialize testSpecificAiState for each test using the helper
    testSpecificAiState = getDefaultMockAiState();
    // Apply any test-suite wide default overrides to testSpecificAiState here
    testSpecificAiState.availableProviders = [MOCK_AI_PROVIDER];
    testSpecificAiState.selectedProviderId = MOCK_AI_PROVIDER.id;
    

    // Configure the imported mockAiStateService's methods to use testSpecificAiState
    (mockAiStateService.getAiState as Mock).mockImplementation(() => testSpecificAiState);

    (mockAiStateService.setAiState as Mock).mockImplementation(
      (updaterOrPartialState) => {
        const prevState = { ...testSpecificAiState }; 
        let changes: Partial<AiState>;

        if (typeof updaterOrPartialState === 'function') {
          changes = updaterOrPartialState(prevState);
        } else {
          changes = updaterOrPartialState;
        }

        // Apply changes by mutating the existing testSpecificAiState object
        for (const key in changes) {
          if (Object.prototype.hasOwnProperty.call(changes, key)) {
            // For complex object properties that are intended to be fully replaced by the updater,
            // assign them directly. For other (potentially primitive) properties, direct assignment is also fine.
            if (key === 'messagesByChatId' || key === 'selectedMessagesMap' || key === 'chatsByContext') {
              (testSpecificAiState as any)[key] = (changes as any)[key];
            } else {
              // For other top-level properties in AiState (like currentChatId, isLoadingAiResponse, aiError, etc.)
              (testSpecificAiState as any)[key] = (changes as any)[key];
            }
          }
        }
      }
    );

    (mockAiStateService.addOptimisticUserMessage as Mock).mockImplementation(
      (messageContent, explicitChatId) => {
        console.log('[TEST LOG] General addOptimisticUserMessage mock in beforeEach CALLED. ExplicitChatId:', explicitChatId);
        const tempId = `temp-user-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const createdTimestamp = new Date().toISOString();
        
        // Capture currentChatId from testSpecificAiState *before* determining chatIdUsed for new chat logic
        const previousCurrentChatId = testSpecificAiState.currentChatId;

        // Use testSpecificAiState for determining currentChatId if explicitChatId is not provided
        const chatIdUsed = explicitChatId || previousCurrentChatId || `new-chat-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const optimisticMessage: ChatMessage = {
          id: tempId,
          chat_id: chatIdUsed,
          role: 'user',
          content: messageContent,
          created_at: createdTimestamp,
          updated_at: createdTimestamp,
          user_id: MOCK_USER.id, 
          ai_provider_id: null,
          system_prompt_id: null,
          is_active_in_thread: true,
          error_type: null,
          token_usage: null,
          response_to_message_id: null,
        };

        // Ensure the array for this chat ID exists in messagesByChatId
        if (!testSpecificAiState.messagesByChatId[chatIdUsed]) {
          testSpecificAiState.messagesByChatId[chatIdUsed] = [];
        }
        // Mutate the array directly by pushing the new optimistic message
        testSpecificAiState.messagesByChatId[chatIdUsed].push(optimisticMessage);
        
        // Only update currentChatId if it was a new chat being created by addOptimisticUserMessage
        // (i.e., no explicitChatId was given, and there was no currentChatId in the state before this message)
        if (!explicitChatId && !previousCurrentChatId) {
            testSpecificAiState.currentChatId = chatIdUsed;
        }

        return { tempId, chatIdUsed, createdTimestamp };
      }
    );

    mockEstimateInputTokensFn.mockResolvedValue(10);
    mockGetMaxOutputTokensFn.mockReturnValue(1000);
  });

  describe('Context Message Handling', () => {
    it('should use providedContextMessages if available in serviceParams.data', async () => {
      const chatId = 'existing-chat-id-for-provided-context';
      // Corrected: contextMessages in ChatApiRequest is MessageForTokenCounting[]
      const mockProvidedContextMessages: MessageForTokenCounting[] = [{ role: 'system', content: 'System prompt from params'}];
      const serviceParams = getDefaultTestServiceParams({ contextMessages: mockProvidedContextMessages, chatId: chatId });

      // --- Specific AI State Setup for this test ---
      const currentAiState = getDefaultMockAiState();
      (mockAiStateService.getAiState as Mock).mockReturnValue({ // Corrected
        ...currentAiState,
        availableProviders: [MOCK_AI_PROVIDER],
        selectedProviderId: MOCK_AI_PROVIDER.id,
        currentChatId: chatId, 
        messagesByChatId: {
          ...currentAiState.messagesByChatId, 
          [chatId]: [], 
        },
        chatsByContext: {
          ...currentAiState.chatsByContext,
          personal: [
            ...(currentAiState.chatsByContext?.personal || []),
            { 
              id: chatId, 
              title: 'Existing Chat For Provided Context', 
              user_id: MOCK_USER.id,
              organization_id: null,
              created_at: new Date().toISOString(), 
              updated_at: new Date().toISOString(),
              system_prompt_id: null, 
            } as Chat
          ]
        }
      });
      // --- End Specific AI State Setup ---
      
      const assistantMessageId = 'asst-msg-provided-ctx';
      const mockAssistantMessageForThisTest: ChatMessageRow = { // Renamed variable
        id: assistantMessageId, 
        chat_id: chatId, 
        role: 'assistant', 
        content: 'Response based on provided context',
        token_usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
        error_type: null, response_to_message_id: null,
      };
      mockCallChatApi.mockResolvedValue({ 
        status: 200, 
        data: { 
          chatId: chatId,
          assistantMessage: mockAssistantMessageForThisTest, // Used renamed variable
        } as ChatHandlerSuccessResponse 
      });

      const result = await handleSendMessage(serviceParams);

      expect(result).toEqual(expect.objectContaining(mockAssistantMessageForThisTest));
      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArg = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;
      expect(callChatApiArg.contextMessages).toEqual(mockProvidedContextMessages);
      expect(callChatApiArg.chatId).toBe('existing-chat-id-for-provided-context');

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls; // Corrected
      expect(setAiStateCalls.length).toBeGreaterThan(0);
      const lastSetAiStateCall = setAiStateCalls[setAiStateCalls.length - 1][0];
      if (typeof lastSetAiStateCall === 'function') {
        const prevState = mockAiStateService.getAiState();
        const updatedState = lastSetAiStateCall(prevState);
        expect(updatedState.isLoadingAiResponse).toBe(false);
        expect(updatedState.aiError).toBeNull();
        expect(updatedState.messagesByChatId?.[chatId]).toContainEqual(expect.objectContaining(mockAssistantMessageForThisTest));
      } else {
        expect(lastSetAiStateCall.isLoadingAiResponse).toBe(false);
        expect(lastSetAiStateCall.aiError).toBeNull();
        expect(lastSetAiStateCall.messagesByChatId?.[chatId]).toContainEqual(expect.objectContaining(mockAssistantMessageForThisTest));
      }
    });

    it('should build contextMessages from aiState if not provided in serviceParams.data and chat exists', async () => {
      const existingChatId = 'chat-with-history-123';
      const userMessageContent = 'New message for existing chat';

      const messageInHistory: ChatMessage = { id: 'msg1', chat_id: existingChatId, role: 'user', content: 'Previous message in history', created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', user_id: MOCK_USER.id, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true, token_usage: null, error_type: null, response_to_message_id: null }; // Removed status
      const anotherMessageInHistory: ChatMessage = { id: 'msg2', chat_id: existingChatId, role: 'assistant', content: 'Previous assistant response', created_at: '2023-01-01T00:00:01Z', updated_at: '2023-01-01T00:00:01Z', user_id: null, ai_provider_id: MOCK_AI_PROVIDER.id, system_prompt_id: null, is_active_in_thread: true, token_usage: null, error_type: null, response_to_message_id: null }; // Removed status
      
      // Set up initial state directly on testSpecificAiState
      testSpecificAiState = {
        ...testSpecificAiState, 
        currentChatId: existingChatId,
        messagesByChatId: {
          [existingChatId]: [messageInHistory, anotherMessageInHistory],
        },
        selectedMessagesMap: { 
          [existingChatId]: { 'msg1': true, 'msg2': true } 
        },
        chatsByContext: {
          ...testSpecificAiState.chatsByContext,
          personal: [
            ...(testSpecificAiState.chatsByContext?.personal || []),
            { id: existingChatId, title: 'Chat with History', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: MOCK_USER.id, organization_id: null, system_prompt_id: null } as Chat
          ]
        }
      };
      // At this point, getAiState() would return the state above.

      const serviceParams = getDefaultTestServiceParams({ chatId: existingChatId, contextMessages: undefined, message: userMessageContent }); // Corrected: null to undefined
      
      // IMPORTANT: Call addOptimisticUserMessage *before* handleSendMessage so testSpecificAiState is updated.
      // The return value tempUserMessageId will be used by handleSendMessage internally via its own call.
      // We don't need to capture its return here for the test logic itself, but we need it to have run.
      // However, handleSendMessage itself calls addOptimisticUserMessage. We need to ensure the one *inside* handleSendMessage operates on the same `testSpecificAiState`.
      // The mock in beforeEach already ensures that `mockAiStateService.addOptimisticUserMessage` will modify `testSpecificAiState`.
      // So, the call inside handleSendMessage *will* add the message to testSpecificAiState *before* setAiState is called.

      const assistantMessageId = 'asst-msg-state-history';
      const mockAssistantForStateHistory: ChatMessageRow = { 
        error_type: null, response_to_message_id: null,
        id: assistantMessageId, 
        chat_id: existingChatId, 
        role: 'assistant', 
        content: 'Response based on state history',
        token_usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
      };
      mockCallChatApi.mockResolvedValue({ 
        status: 200, 
        data: { 
          chatId: existingChatId,
          assistantMessage: mockAssistantForStateHistory, // Corrected variable name
        } as ChatHandlerSuccessResponse 
      });

      // When handleSendMessage is called, its internal call to addOptimisticUserMessage will modify testSpecificAiState.
      // Then, its call to setAiState(updater) will provide this modified testSpecificAiState to the updater.
      const result = await handleSendMessage(serviceParams);

      expect(result).toEqual(expect.objectContaining(mockAssistantForStateHistory));
      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArg = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;
      
      const expectedContextMessages: MessageForTokenCounting[] = [
        { role: messageInHistory.role as 'user' | 'assistant' | 'system', content: messageInHistory.content },
        { role: anotherMessageInHistory.role as 'user' | 'assistant' | 'system', content: anotherMessageInHistory.content }
      ];
      expect(callChatApiArg.contextMessages).toEqual(expectedContextMessages);
      expect(callChatApiArg.message).toBe(userMessageContent);
      expect(callChatApiArg.chatId).toBe(existingChatId);

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls; // Corrected
      expect(setAiStateCalls.length).toBeGreaterThan(0);
      
      const finalSetAiStateArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      let finalState: Partial<AiState>;
      // The `testSpecificAiState` here has been modified by the addOptimisticUserMessage *inside* handleSendMessage
      if (typeof finalSetAiStateArg === 'function') {
        finalState = finalSetAiStateArg(testSpecificAiState); // Pass the state as it would be when updater is called
      } else {
        finalState = finalSetAiStateArg;
      }

      expect(finalState.isLoadingAiResponse).toBe(false);
      expect(finalState.aiError).toBeNull();
      const chatMessages = finalState.messagesByChatId?.[existingChatId];
      expect(chatMessages).toBeDefined();
      expect(chatMessages).toContainEqual(expect.objectContaining(mockAssistantForStateHistory as ChatMessage)); 
      
      const userMessageInState = chatMessages?.find(m => m.role === 'user' && m.content === userMessageContent ); // Removed status check
      expect(userMessageInState).toBeDefined();
      expect(userMessageInState?.chat_id).toEqual(existingChatId); // Ensure chat_id was updated if necessary

      // 2 original history + 1 new user (processed) + 1 new assistant
      expect(chatMessages?.length).toBe(4); 
    });

    it('should build contextMessages from newChatContext if chat does not exist and newChatContext.contextMessages is available', async () => {
      // THIS TEST SCENARIO IS NO LONGER VALID as newChatContext is 'personal' | string | null
      // and AiState does not store contextMessages directly in newChatContext.
      // The code now handles this by resulting in an empty finalContextMessages.
      // The test is updated to reflect this.
      const userMessageContent = 'Hello for new chat with (no specific pre-set) context';
      const newChatIdFromApi = 'new-chat-id-from-api'; // API returns the actual new chat ID
      const optimisticChatId = `optimistic-${newChatIdFromApi}`;
      const tempUserMessageId = 'temp-new-chat-ctx';
      const createdTimestamp = new Date().toISOString();

      // Directly modify testSpecificAiState for this test setup
      testSpecificAiState.currentChatId = null; 
      testSpecificAiState.newChatContext = 'personal'; 
      testSpecificAiState.messagesByChatId = {};
      testSpecificAiState.chatsByContext = { personal: [], orgs: {} };
      testSpecificAiState.selectedMessagesMap = {};

      (mockAiStateService.addOptimisticUserMessage as any).mockImplementationOnce(() => {
        const optimisticMessage: ChatMessage = {
          id: tempUserMessageId,
          chat_id: optimisticChatId, 
          role: 'user',
          content: userMessageContent,
          created_at: createdTimestamp,
          updated_at: createdTimestamp,
          user_id: MOCK_USER.id,
          ai_provider_id: null,
          system_prompt_id: null,
          is_active_in_thread: true,
          token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          error_type: null, response_to_message_id: null,
        };
        // Directly modify testSpecificAiState properties
        testSpecificAiState.messagesByChatId = {
          ...(testSpecificAiState.messagesByChatId),
          [optimisticChatId]: [optimisticMessage],
        };
        testSpecificAiState.currentChatId = optimisticChatId;
        // newChatContext is already set above for the test setup

        return { tempId: tempUserMessageId, chatIdUsed: optimisticChatId, createdTimestamp };
      });

      const serviceParams = getDefaultTestServiceParams({ chatId: null, contextMessages: undefined, message: userMessageContent });
      
      const assistantMessageId = 'asst-msg-newchat-no-ctx';
      const mockAssistantMessageForNewChatNoCtx: ChatMessageRow = { 
        error_type: null, response_to_message_id: null,
        id: assistantMessageId, 
        chat_id: newChatIdFromApi, 
        role: 'assistant', 
        content: 'Response for new chat',
        token_usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
      };
      mockCallChatApi.mockResolvedValue({ 
        status: 200, // No 'type: success'
        data: { 
          chatId: newChatIdFromApi,
          assistantMessage: mockAssistantMessageForNewChatNoCtx, // Corrected variable name
        } as ChatHandlerSuccessResponse 
      });

      const result = await handleSendMessage(serviceParams);

      expect(result).toEqual(expect.objectContaining(mockAssistantMessageForNewChatNoCtx));
      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArg = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;

      expect(callChatApiArg.contextMessages).toEqual([]); 
      expect(callChatApiArg.message).toBe(userMessageContent); 
      expect(callChatApiArg.chatId).toBeUndefined(); 

      // Get the final state directly from the service after all operations
      const finalState = (mockAiStateService.getAiState as Mock)();

      // Removed older way of getting finalState:
      // const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls; 
      // expect(setAiStateCalls.length).toBeGreaterThan(0);
      // const finalSetAiStateArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      // let finalState: Partial<AiState>;
      // // testSpecificAiState here has been modified by the addOptimisticUserMessage mockImplementationOnce
      // if (typeof finalSetAiStateArg === 'function') {
      //   finalState = finalSetAiStateArg(testSpecificAiState);
      // } else {
      //   finalState = finalSetAiStateArg;
      // }

      expect(finalState.isLoadingAiResponse).toBe(false);
      expect(finalState.aiError).toBeNull();
      expect(finalState.currentChatId).toBe(newChatIdFromApi);
      expect(finalState.messagesByChatId?.[newChatIdFromApi]).toBeDefined();
      expect(finalState.messagesByChatId?.[newChatIdFromApi]).toContainEqual(expect.objectContaining(mockAssistantMessageForNewChatNoCtx));
      
      // The user message should have been moved to the newChatIdFromApi and status updated
      const userMessageInState = finalState.messagesByChatId?.[newChatIdFromApi]?.find(m => m.id === tempUserMessageId && m.role === 'user' && m.content === userMessageContent);
      expect(userMessageInState).toBeDefined();
      expect(userMessageInState?.chat_id).toBe(newChatIdFromApi);

      expect(finalState.messagesByChatId?.[newChatIdFromApi]?.length).toBe(2); // 1 new user + 1 new assistant
      expect(finalState.newChatContext).toBeNull(); 
      expect(finalState.chatsByContext?.personal?.find(c => c.id === newChatIdFromApi)).toBeDefined();
    });

    it('should use systemPrompt from modelConfig if no other context is provided for a new chat', async () => {
      // THIS TEST SCENARIO IS NO LONGER VALID as AiModelExtendedConfig does not have a systemPrompt field.
      // The code now handles this by resulting in an empty finalContextMessages.
      // Test is updated to reflect this.
      const modelConfigWithoutSystemPromptContent: AiModelExtendedConfig = { // MOCK_MODEL_CONFIG already has no systemPrompt content
        ...MOCK_MODEL_CONFIG,
        // systemPrompt: 'System prompt from model config', // This field doesn't exist on the type
      };

      const providerWithNoSystemPromptContent: AiProvider = {
        ...MOCK_AI_PROVIDER,
        config: modelConfigWithoutSystemPromptContent as any,
      };

      const currentAiState = getDefaultMockAiState();
      (mockAiStateService.getAiState as Mock).mockReturnValue({
        ...currentAiState,
        availableProviders: [providerWithNoSystemPromptContent],
        selectedProviderId: providerWithNoSystemPromptContent.id,
        currentChatId: null, // New chat
        newChatContext: null, // No newChatContext
        messagesByChatId: {},
        chatsByContext: { personal: [], orgs: {} },
      });

      const userMessageContent = 'Hello, (no model system prompt content) new chat';
      const serviceParams = getDefaultTestServiceParams({ chatId: null, contextMessages: undefined, message: userMessageContent });
      
      const newChatId = 'new-chat-no-model-prompt-content';
      (mockAiStateService.addOptimisticUserMessage as any).mockReturnValueOnce({ tempId: 'temp-no-model-prompt', chatIdUsed: `optimistic-${newChatId}`, createdTimestamp: new Date().toISOString() });

      const assistantMessageId = 'asst-msg-no-model-prompt-content';
      const mockAssistantMessageForNoModelPrompt: ChatMessageRow = { 
        error_type: null, response_to_message_id: null,
        id: assistantMessageId, 
        chat_id: newChatId, 
        role: 'assistant', 
        content: 'Response for new chat (no model system prompt content)',
        token_usage: { prompt_tokens: 25, completion_tokens: 10, total_tokens: 35 },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
      };
      mockCallChatApi.mockResolvedValue({ 
        status: 200, // No 'type: success'
        data: { 
          chatId: newChatId,
          assistantMessage: mockAssistantMessageForNoModelPrompt, // Corrected variable name
        } as ChatHandlerSuccessResponse 
      });

      const result = await handleSendMessage(serviceParams);

      expect(result).toEqual(expect.objectContaining(mockAssistantMessageForNoModelPrompt));
      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArg = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;

      // Expect contextMessages to be empty as modelConfig does not carry a systemPrompt string.
      expect(callChatApiArg.contextMessages).toEqual([]);
      expect(callChatApiArg.message).toBe(userMessageContent); // New user message
      expect(callChatApiArg.chatId).toBeUndefined(); // New chat

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls; // Corrected
      const finalSetAiStateArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      let finalState: Partial<AiState>;
      const stateFromGetAiState = mockAiStateService.getAiState();

      if (typeof finalSetAiStateArg === 'function') {
        finalState = finalSetAiStateArg(stateFromGetAiState);
      } else {
        finalState = finalSetAiStateArg;
      }

      expect(finalState.isLoadingAiResponse).toBe(false);
      expect(finalState.aiError).toBeNull();
      expect(finalState.currentChatId).toBe(newChatId);
      expect(finalState.messagesByChatId?.[newChatId]).toContainEqual(expect.objectContaining(mockAssistantMessageForNoModelPrompt));
      expect(finalState.newChatContext).toBeNull();
      expect(finalState.chatsByContext?.personal?.find(c => c.id === newChatId)).toBeDefined();
    });

    it('should not use any system/context prompt if none are available for a new chat (model config has no system prompt)', async () => {
      const currentAiState = getDefaultMockAiState();
      (mockAiStateService.getAiState as Mock).mockReturnValue({
        ...currentAiState,
        availableProviders: [MOCK_AI_PROVIDER], 
        selectedProviderId: MOCK_AI_PROVIDER.id,
        currentChatId: null, 
        newChatContext: null, 
        messagesByChatId: {},
        chatsByContext: { personal: [], orgs: {} },
      });

      const userMessageContent = 'Hello, no context here';
      const serviceParams = getDefaultTestServiceParams({ chatId: null, contextMessages: undefined, message: userMessageContent });
      
      const newChatId = 'new-chat-no-context';
      (mockAiStateService.addOptimisticUserMessage as any).mockReturnValueOnce({ tempId: 'temp-no-context', chatIdUsed: `optimistic-${newChatId}`, createdTimestamp: new Date().toISOString() });

      const assistantMessageId = 'asst-msg-no-ctx';
      const mockAssistantMessageForNoContext: ChatMessageRow = { 
        error_type: null, response_to_message_id: null,
        id: assistantMessageId, 
        chat_id: newChatId, 
        role: 'assistant', 
        content: 'Response with no context',
        token_usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
      };
      mockCallChatApi.mockResolvedValue({ 
        status: 200, // No 'type: success'
        data: { 
          chatId: newChatId,
          assistantMessage: mockAssistantMessageForNoContext, // Corrected variable name
        } as ChatHandlerSuccessResponse 
      });

      const result = await handleSendMessage(serviceParams);

      expect(result).toEqual(expect.objectContaining(mockAssistantMessageForNoContext));
      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArg = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;

      // Expect contextMessages to be an empty array
      expect(callChatApiArg.contextMessages).toEqual([]);
      // Check the `message` field for the user's new message content
      expect(callChatApiArg.message).toBe(userMessageContent);
      expect(callChatApiArg.chatId).toBeUndefined(); // New chat

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls; // Corrected
      const finalSetAiStateArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      let finalState: Partial<AiState>;
      const stateFromGetAiState = mockAiStateService.getAiState();

      if (typeof finalSetAiStateArg === 'function') {
        finalState = finalSetAiStateArg(stateFromGetAiState);
      } else {
        finalState = finalSetAiStateArg;
      }

      expect(finalState.isLoadingAiResponse).toBe(false);
      expect(finalState.aiError).toBeNull();
      expect(finalState.currentChatId).toBe(newChatId);
      expect(finalState.messagesByChatId?.[newChatId]).toContainEqual(expect.objectContaining(mockAssistantMessageForNoContext));
      expect(finalState.newChatContext).toBeNull();
      expect(finalState.chatsByContext?.personal?.find(c => c.id === newChatId)).toBeDefined();
    });
  });
  
});