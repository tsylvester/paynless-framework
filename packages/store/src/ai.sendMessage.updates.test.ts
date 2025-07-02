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
  AiPendingChatAction,
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
  
  describe('Optimistic Updates and State Management', () => {
    it('should call addOptimisticUserMessage with message and inputChatId', async () => {
      const messageContent = 'Test optimistic message';
      const explicitChatId = 'test-chat-id-123';
      const serviceParams = getDefaultTestServiceParams({ 
        message: messageContent, 
        chatId: explicitChatId 
      });

      // Mock a successful API response to allow the function to proceed
      const mockApiResponse: ChatHandlerSuccessResponse = {
        chatId: explicitChatId,
        assistantMessage: { 
          error_type: null, response_to_message_id: null,
          id: 'asst-msg-optimistic-call', 
          chat_id: explicitChatId, 
          role: 'assistant', 
          content: 'Assistant response',
          token_usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
        } as ChatMessageRow,
        isRewind: false,
      };

      mockCallChatApi.mockResolvedValue({ status: 200, data: mockApiResponse });
      await handleSendMessage(serviceParams);

      expect(mockAiStateService.addOptimisticUserMessage).toHaveBeenCalledTimes(1);
      expect(mockAiStateService.addOptimisticUserMessage).toHaveBeenCalledWith(
        messageContent, // serviceParams.data.message
        explicitChatId  // serviceParams.data.chatId
      );
    });

    it('should set isLoadingAiResponse to true before async operations and false after (on success and failure)', async () => {
      const messageContent = 'Test loading state message';
      const chatId = 'test-chat-loading';
      const serviceParams = getDefaultTestServiceParams({ message: messageContent, chatId });

      // --- Success Path ---
      const mockSuccessResponse: ChatHandlerSuccessResponse = {
        chatId: chatId,
        assistantMessage: { 
          error_type: null, response_to_message_id: null,
          id: 'asst-msg-loading-success', chat_id: chatId, role: 'assistant', content: 'Success!',
          token_usage: { total_tokens: 10 }, created_at: 'now', updated_at: 'now', user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true
        } as ChatMessageRow,
        isRewind: false,
      };
      mockCallChatApi.mockResolvedValue({ status: 200, data: mockSuccessResponse });

      await handleSendMessage(serviceParams);

      // Check calls to setAiState
      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls;
      expect(setAiStateCalls.length).toBeGreaterThanOrEqual(2); // At least one for loading=true, one for loading=false

      // Expectation 1: isLoadingAiResponse: true, aiError: null (or a function that sets this)
      // This is set just before coreMessageProcessing
      const callBeforeApi = setAiStateCalls.find(call => {
        if (typeof call[0] === 'function') return false; // Ignore functional updates for this specific check
        return call[0].isLoadingAiResponse === true && call[0].aiError === null;
      });
      expect(callBeforeApi).toBeDefined();

      // Expectation 2: Final call sets isLoadingAiResponse: false (functional update or direct object)
      const lastCallArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      if (typeof lastCallArg === 'function') {
        const finalState = lastCallArg(testSpecificAiState); // testSpecificAiState would be after optimistic add
        expect(finalState.isLoadingAiResponse).toBe(false);
      } else {
        expect(lastCallArg.isLoadingAiResponse).toBe(false);
      }

      // --- Reset mocks for Failure Path ---
      mockCallChatApi.mockReset();
      (mockAiStateService.setAiState as any).mockClear(); // Clear calls from success path
      // Reset testSpecificAiState for the failure path to avoid contamination if needed, though for this test it might not be critical
      testSpecificAiState = { ...getDefaultMockAiState(), availableProviders: [MOCK_AI_PROVIDER], selectedProviderId: MOCK_AI_PROVIDER.id, currentChatId: chatId };
      // Ensure the optimistic message from addOptimisticUserMessage (called inside handleSendMessage) is in state for error cleanup
      const tempErrorMsgId = 'temp-err-msg';
      const errorOptimisticChatId = `error-${chatId}`;
      (mockAiStateService.addOptimisticUserMessage as any).mockImplementationOnce(() => { // Specific for this failure case
        const optimisticMessage: ChatMessage = {
          id: tempErrorMsgId, chat_id: errorOptimisticChatId, role: 'user', content: messageContent,
          created_at: 'now', updated_at: 'now', user_id: MOCK_USER.id,
          ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
          error_type: null, response_to_message_id: null, token_usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        };
        testSpecificAiState = {
            ...testSpecificAiState,
            messagesByChatId: { [errorOptimisticChatId]: [optimisticMessage] },
            currentChatId: errorOptimisticChatId
        };
        return { tempId: tempErrorMsgId, chatIdUsed: errorOptimisticChatId, createdTimestamp: 'now' };
      });


      // --- Failure Path ---
      const mockErrorDetails = { message: 'API Error', code: 'API_ERROR' }; 
      // Ensure this mockResolvedValue is:
      mockCallChatApi.mockResolvedValue({ 
        status: 401, // Or another relevant error status like 500
        error: mockErrorDetails, 
      } as ErrorResponse );

      await handleSendMessage(serviceParams); // serviceParams can be reused or redefined if necessary

      const setAiStateCallsAfterError = (mockAiStateService.setAiState as any).mock.calls;
      expect(setAiStateCallsAfterError.length).toBeGreaterThanOrEqual(2);

      const callBeforeApiError = setAiStateCallsAfterError.find(call => {
        if (typeof call[0] === 'function') return false;
        return call[0].isLoadingAiResponse === true && call[0].aiError === null;
      });
      expect(callBeforeApiError).toBeDefined();
      
      const lastCallAfterErrorArg = setAiStateCallsAfterError[setAiStateCallsAfterError.length - 1][0];
      if (typeof lastCallAfterErrorArg === 'function') {
        const finalErrorState = lastCallAfterErrorArg(testSpecificAiState); // testSpecificAiState has the optimistic msg
        expect(finalErrorState.isLoadingAiResponse).toBe(false);
        expect(finalErrorState.aiError).toBe(mockErrorDetails.message);
      } else {
        expect(lastCallAfterErrorArg.isLoadingAiResponse).toBe(false);
        expect(lastCallAfterErrorArg.aiError).toBe(mockErrorDetails.message);
      }
    });

    it('should correctly update messagesByChatId when a new chat is created (optimistic chatId vs actual chatId)', async () => {
      console.log('[TEST LOG] Starting test: should correctly update messagesByChatId...');
      const messageContent = 'Message for new chat with ID switch';
      const serviceParams = getDefaultTestServiceParams({ message: messageContent, chatId: null }); // New chat

      const optimisticChatIdGeneratedByMock = 'new-chat-from-optimistic-mock'; // Known ID for easier check
      const tempUserMessageId = 'temp-user-msg-id-switch';
      const createdTimestamp = new Date().toISOString();

      // Specific mock for addOptimisticUserMessage for this test
      // This ensures we know the optimisticChatId and tempId
      (mockAiStateService.addOptimisticUserMessage as any).mockImplementationOnce(() => {
        console.log('[TEST LOG] mockImplementationOnce for addOptimisticUserMessage CALLED');
        console.log('[TEST LOG] Before addOptimisticUserMessage mock execution - testSpecificAiState.messagesByChatId:', JSON.stringify(testSpecificAiState.messagesByChatId));
        const optimisticMessage: ChatMessage = {
          id: tempUserMessageId, chat_id: optimisticChatIdGeneratedByMock, role: 'user', content: messageContent,
          created_at: createdTimestamp, updated_at: createdTimestamp, user_id: MOCK_USER.id, 
          ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
          error_type: null, response_to_message_id: null, token_usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        };
        testSpecificAiState.messagesByChatId = {
          ...(testSpecificAiState.messagesByChatId),
          [optimisticChatIdGeneratedByMock]: [optimisticMessage]
        };
        testSpecificAiState.currentChatId = optimisticChatIdGeneratedByMock;
        testSpecificAiState.newChatContext = 'personal';
        console.log('[TEST LOG] After addOptimisticUserMessage mock execution - testSpecificAiState.messagesByChatId:', JSON.stringify(testSpecificAiState.messagesByChatId));
        return { tempId: tempUserMessageId, chatIdUsed: optimisticChatIdGeneratedByMock, createdTimestamp };
      });

      const actualNewChatIdFromApi = 'actual-chat-id-from-api';
      const mockApiResponse: ChatHandlerSuccessResponse = {
        chatId: actualNewChatIdFromApi, // API returns a *different* ID
        assistantMessage: { 
          error_type: null, response_to_message_id: null,
          id: 'asst-msg-id-switch', chat_id: actualNewChatIdFromApi, role: 'assistant', content: 'Assistant response for ID switch',
          token_usage: { total_tokens: 20 }, created_at: 'now', updated_at: 'now', user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true
        } as ChatMessageRow,
        isRewind: false,
        // Assuming no finalUserMessage from API, so optimistic user message is updated by handleSendMessage
      };
      mockCallChatApi.mockResolvedValue({ status: 200, data: mockApiResponse });
      console.log('[TEST LOG] About to call handleSendMessage in test: should correctly update messagesByChatId...');
      await handleSendMessage(serviceParams);
      console.log('[TEST LOG] After call to handleSendMessage in test: should correctly update messagesByChatId...');

      //const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls;
      //const lastCallArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      //const lastCallArg = mockAiStateService.setAiState.mock.calls[mockAiStateService.setAiState.mock.calls.length - 1][0];
      //let finalState: Partial<AiState> = {};

      //if (typeof lastCallArg === 'function') {
        // testSpecificAiState here was updated by the addOptimisticUserMessage.mockImplementationOnce
        //finalState = lastCallArg(testSpecificAiState); 
      //} else {
        //finalState = lastCallArg;
      //}

      const finalState = mockAiStateService.getAiState();

      // 1. Messages should be under the new actualChatIdFromApi
      expect(finalState.messagesByChatId?.[actualNewChatIdFromApi]).toBeDefined();
      const messagesInNewChat = finalState.messagesByChatId?.[actualNewChatIdFromApi] || [];
      expect(messagesInNewChat.length).toBe(2); // User message + Assistant message

      // Check for the (updated) user message
      const userMessageInNewChat = messagesInNewChat.find(m => m.id === tempUserMessageId);
      expect(userMessageInNewChat).toBeDefined();
      expect(userMessageInNewChat?.content).toBe(messageContent);
      expect(userMessageInNewChat?.chat_id).toBe(actualNewChatIdFromApi); // Important: chat_id updated

      // Check for the assistant message
      expect(messagesInNewChat).toContainEqual(expect.objectContaining(mockApiResponse.assistantMessage));

      // 2. Entry for the optimisticChatIdGeneratedByMock should be deleted
      expect(finalState.messagesByChatId?.[optimisticChatIdGeneratedByMock]).toBeUndefined();

      // 3. currentChatId in state should be the actualNewChatIdFromApi
      expect(finalState.currentChatId).toBe(actualNewChatIdFromApi);
      
      // 4. newChatContext should be cleared
      expect(finalState.newChatContext).toBeNull();
    });

    it('should correctly update selectedMessagesMap when a new chat is created', async () => {
      const messageContent = 'Message for new chat selection';
      const serviceParams = getDefaultTestServiceParams({ message: messageContent, chatId: null }); // New chat

      const optimisticChatIdGeneratedByMock = 'select-optimistic-chat-id';
      const tempUserMessageId = 'select-temp-user-msg';
      const createdTimestamp = new Date().toISOString();

      (mockAiStateService.addOptimisticUserMessage as any).mockImplementationOnce(() => {
        const optimisticMessage: ChatMessage = {
          id: tempUserMessageId, chat_id: optimisticChatIdGeneratedByMock, role: 'user', content: messageContent,
          created_at: createdTimestamp, updated_at: createdTimestamp, user_id: MOCK_USER.id, 
          ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
          error_type: null, response_to_message_id: null, token_usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        };
        testSpecificAiState = {
          ...testSpecificAiState,
          messagesByChatId: { [optimisticChatIdGeneratedByMock]: [optimisticMessage] },
          selectedMessagesMap: { [optimisticChatIdGeneratedByMock]: { 'some-other-msg': true } }, // Pre-existing selection for optimistic (if any)
          currentChatId: optimisticChatIdGeneratedByMock,
          newChatContext: 'personal',
        };
        return { tempId: tempUserMessageId, chatIdUsed: optimisticChatIdGeneratedByMock, createdTimestamp };
      });

      const actualNewChatIdFromApi = 'select-actual-chat-id';
      const assistantMessageId = 'select-asst-msg';
      const mockApiResponse: ChatHandlerSuccessResponse = {
        chatId: actualNewChatIdFromApi,
        assistantMessage: { 
          error_type: null, response_to_message_id: null,
          id: assistantMessageId, chat_id: actualNewChatIdFromApi, role: 'assistant', content: 'Selected assistant response',
          token_usage: { total_tokens: 10 }, created_at: 'now', updated_at: 'now', user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true
        } as ChatMessageRow,
        isRewind: false,
        // For this test, let's assume API returns a finalUserMessage to see how it's handled for selection
        userMessage: { 
          error_type: null, response_to_message_id: null,
          id: 'final-user-msg-id', chat_id: actualNewChatIdFromApi, role: 'user', content: messageContent, 
            created_at: createdTimestamp, updated_at:createdTimestamp, user_id: MOCK_USER.id, is_active_in_thread: true, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, system_prompt_id: null, ai_provider_id: null,
        } as ChatMessage,
      };
      mockCallChatApi.mockResolvedValue({ status: 200, data: mockApiResponse });

      await handleSendMessage(serviceParams);

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls;
      const lastCallArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      let finalState: Partial<AiState> = {};

      if (typeof lastCallArg === 'function') {
        finalState = lastCallArg(testSpecificAiState);
      } else {
        finalState = lastCallArg;
      }

      // 1. Entry for optimisticChatIdGeneratedByMock should be deleted from selectedMessagesMap
      expect(finalState.selectedMessagesMap?.[optimisticChatIdGeneratedByMock]).toBeUndefined();

      // 2. New entry for actualNewChatIdFromApi should exist
      expect(finalState.selectedMessagesMap?.[actualNewChatIdFromApi]).toBeDefined();
      const selectionsForNewChat = finalState.selectedMessagesMap?.[actualNewChatIdFromApi] || {};

      // 3. The finalUserMessage (from API) and assistantMessage should be selected
      const finalUserMessageIdFromApi = mockApiResponse.userMessage!.id; // Already asserted as ChatMessageRow
      expect(selectionsForNewChat[finalUserMessageIdFromApi]).toBe(true);
      expect(selectionsForNewChat[assistantMessageId]).toBe(true);
      
      // 4. Ensure no other unexpected selections (e.g. from the old optimistic map)
      expect(Object.keys(selectionsForNewChat).length).toBe(2);
    });

    it('should clear newChatContext when a new chat is successfully created from it', async () => {
      const messageContent = 'Message creating new chat from newChatContext';
      const serviceParams = getDefaultTestServiceParams({ message: messageContent, chatId: null });

      const initialNewChatContextValue = 'org-for-new-chat-clearing'; // Example org ID
      const optimisticChatIdGeneratedByMock = 'clear-optimistic-chat-id';
      const tempUserMessageId = 'clear-temp-user-msg';
      const createdTimestamp = new Date().toISOString();

      testSpecificAiState = {
        ...testSpecificAiState, // Base from beforeEach
        currentChatId: null,    // Explicitly no current chat
        newChatContext: initialNewChatContextValue, // This is what we expect to be cleared
        messagesByChatId: {},   // Clean slate for messages
        selectedMessagesMap: {},
      };

      (mockAiStateService.addOptimisticUserMessage as any).mockImplementationOnce(() => {
        // Simulate optimistic message addition which also sets currentChatId optimistically
        const optimisticMessage: ChatMessage = {
          id: tempUserMessageId, chat_id: optimisticChatIdGeneratedByMock, role: 'user', content: messageContent,
          created_at: createdTimestamp, updated_at: createdTimestamp, user_id: MOCK_USER.id, 
          ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true,
          error_type: null, response_to_message_id: null, token_usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        };
        testSpecificAiState = {
          ...testSpecificAiState,
          messagesByChatId: { [optimisticChatIdGeneratedByMock]: [optimisticMessage] },
          currentChatId: optimisticChatIdGeneratedByMock, 
        };
        return { tempId: tempUserMessageId, chatIdUsed: optimisticChatIdGeneratedByMock, createdTimestamp };
      });

      const actualNewChatIdFromApi = 'clear-actual-chat-id'; // Different from optimisticChatId
      const mockApiResponse: ChatHandlerSuccessResponse = {
        chatId: actualNewChatIdFromApi,
        assistantMessage: { 
          error_type: null, response_to_message_id: null,
          id: 'clear-asst-msg', chat_id: actualNewChatIdFromApi, role: 'assistant', content: 'Assistant response for new chat',
          token_usage: { total_tokens: 5 }, created_at: 'now', updated_at: 'now', user_id: null, ai_provider_id: null, system_prompt_id: null, is_active_in_thread: true
        } as ChatMessageRow,
        isRewind: false,
      };
      mockCallChatApi.mockResolvedValue({ status: 200, data: mockApiResponse });

      await handleSendMessage(serviceParams);

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls;
      const lastCallArg = setAiStateCalls[setAiStateCalls.length - 1][0];
      let finalState: Partial<AiState> = {};

      if (typeof lastCallArg === 'function') {
        // testSpecificAiState has been updated by addOptimisticUserMessage mock
        finalState = lastCallArg(testSpecificAiState);
      } else {
        finalState = lastCallArg;
      }

      // Key assertion: newChatContext should be cleared because a new chat was formed
      // (optimisticMessageChatId !== actualNewChatIdFromApi)
      expect(finalState.newChatContext).toBeNull();
      
      // Also verify other things like currentChatId update
      expect(finalState.currentChatId).toBe(actualNewChatIdFromApi);
      expect(finalState.messagesByChatId?.[actualNewChatIdFromApi]).toBeDefined();
    });
  });

});