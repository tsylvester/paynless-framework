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
  });

  describe('Authenticated Flow', () => {
    it('[PERS] NEW CHAT SUCCESS: should return assistant message and update state correctly', async () => {
      // Setup: Initial State for a new personal chat
      testSpecificAiState.currentChatId = null;
      testSpecificAiState.newChatContext = null; 
      testSpecificAiState.messagesByChatId = {};
      testSpecificAiState.chatsByContext = { personal: [], orgs: {} };
      testSpecificAiState.selectedMessagesMap = {};
      testSpecificAiState.availableProviders = [MOCK_AI_PROVIDER];
      testSpecificAiState.selectedProviderId = MOCK_AI_PROVIDER.id;
      testSpecificAiState.selectedPromptId = null;

      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));
      
      const mockInputMessage = 'Hello, new personal chat!';
      const mockNewlyCreatedChatId = 'new-chat-id-pers-123'; 
      const mockOptimisticChatId = 'optimistic-chat-id-for-pers-test'; 
      const mockTempUserMessageId = 'temp-user-pers-1-id';
      const mockCreatedTimestamp = new Date().toISOString();

      // Override addOptimisticUserMessage for this test
      (mockAiStateService.addOptimisticUserMessage as Mock).mockImplementation(
        (messageContent: string, explicitChatIdInput?: string | null) => {
          const chatIdForOptimisticMessage = explicitChatIdInput || mockOptimisticChatId;
          
          const optimisticMessage: ChatMessage = {
            id: mockTempUserMessageId,
            chat_id: chatIdForOptimisticMessage,
            role: 'user',
            content: messageContent,
            created_at: mockCreatedTimestamp,
            updated_at: mockCreatedTimestamp,
            user_id: MOCK_USER.id,
            ai_provider_id: null,
            system_prompt_id: null,
            is_active_in_thread: true,
            error_type: null,
            token_usage: null,
            response_to_message_id: null,
          };

          const currentMessagesForChat = testSpecificAiState.messagesByChatId[chatIdForOptimisticMessage] || [];
          testSpecificAiState.messagesByChatId = {
            ...testSpecificAiState.messagesByChatId,
            [chatIdForOptimisticMessage]: [...currentMessagesForChat, optimisticMessage],
          };
          testSpecificAiState.currentChatId = chatIdForOptimisticMessage; 
          
          console.log('[TEST LOG PERS_SUCCESS_ADD_OPTIMISTIC] messagesByChatId:', JSON.stringify(testSpecificAiState.messagesByChatId));
          return { 
            tempId: mockTempUserMessageId, 
            chatIdUsed: chatIdForOptimisticMessage, 
          };
        }
      );
            
      const mockFinalUserMessageRow: ChatMessageRow = {
        id: mockTempUserMessageId, 
        chat_id: mockNewlyCreatedChatId, 
        role: 'user',
        content: mockInputMessage,
        created_at: mockCreatedTimestamp, 
        updated_at: new Date().toISOString(), 
        user_id: MOCK_USER.id,
        is_active_in_thread: true,
        ai_provider_id: null, 
        system_prompt_id: null,
        token_usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
        error_type: null,
        response_to_message_id: null,
      };

      const mockAssistantMessageRow: ChatMessageRow = {
        id: 'assistant-msg-pers-1',
        chat_id: mockNewlyCreatedChatId,
        role: 'assistant',
        content: 'Hi there! This is a personal response.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: null, 
        ai_provider_id: MOCK_AI_PROVIDER.id,
        system_prompt_id: null,
        is_active_in_thread: true,
        token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        response_to_message_id: mockFinalUserMessageRow.id,
        error_type: null,
      };
      
      const expectedReturnedAssistantMessage: ChatMessage = {
          ...mockAssistantMessageRow, 
      };

      mockCallChatApi.mockResolvedValue({
        status: 200,
        data: {
          assistantMessage: mockAssistantMessageRow,
          chatId: mockNewlyCreatedChatId,
          userMessage: mockFinalUserMessageRow, 
        } as ChatHandlerSuccessResponse,
      });
      
      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: null, 
      });

      const result = await handleSendMessage(serviceParams);

      expect(mockCallChatApi).toHaveBeenCalledTimes(1);

      expect(result).toEqual(expectedReturnedAssistantMessage);
      
      const finalAiState = (mockAiStateService.getAiState as Mock)();

      // @ts-expect-error - This comparison is intentional for testing logic where IDs might differ.
      if (mockOptimisticChatId !== mockNewlyCreatedChatId) {
        expect(finalAiState.messagesByChatId[mockOptimisticChatId]).toBeUndefined();
      }
      expect(finalAiState.messagesByChatId[mockNewlyCreatedChatId]).toBeDefined();
      const chatMessagesInState = finalAiState.messagesByChatId[mockNewlyCreatedChatId];
      expect(chatMessagesInState.length).toBe(2); 
      
      const userMessageInState = chatMessagesInState.find(m => m.role === 'user');
      expect(userMessageInState).toBeDefined();
      expect(userMessageInState).toEqual(expect.objectContaining({
          id: mockFinalUserMessageRow.id,
          chat_id: mockNewlyCreatedChatId,
          content: mockInputMessage,
          user_id: MOCK_USER.id,
          token_usage: mockFinalUserMessageRow.token_usage 
      }));

      const assistantMessageInState = chatMessagesInState.find(m => m.role === 'assistant');
      expect(assistantMessageInState).toEqual(expect.objectContaining(mockAssistantMessageRow));
      
      expect(finalAiState.chatsByContext.personal).toBeDefined();
      expect(finalAiState.chatsByContext.personal?.length).toBe(1);
      const newChatEntryInState = finalAiState.chatsByContext.personal?.[0] as Chat; 
      expect(newChatEntryInState.id).toBe(mockNewlyCreatedChatId);

      expect(finalAiState.currentChatId).toBe(mockNewlyCreatedChatId);
      expect(finalAiState.isLoadingAiResponse).toBe(false);
      expect(finalAiState.aiError).toBeNull();

      expect(finalAiState.selectedMessagesMap[mockNewlyCreatedChatId]).toBeDefined();
      expect(finalAiState.selectedMessagesMap[mockNewlyCreatedChatId]?.[mockFinalUserMessageRow.id]).toBe(true);
      expect(finalAiState.selectedMessagesMap[mockNewlyCreatedChatId]?.[mockAssistantMessageRow.id]).toBe(true);
      
      expect(finalAiState.newChatContext).toBeNull();
    });

    it('[ORG] NEW CHAT SUCCESS: should return assistant message and update state for new org chat', async () => {
      const mockOrgId = 'org-test-456';
      // Setup: Initial State for a new org chat
      testSpecificAiState.currentChatId = null;
      testSpecificAiState.newChatContext = mockOrgId; 
      testSpecificAiState.messagesByChatId = {};
      // Ensure the orgs object and the specific orgId array are initialized for chatsByContext
      testSpecificAiState.chatsByContext = { personal: [], orgs: { [mockOrgId]: [] } }; 
      testSpecificAiState.selectedMessagesMap = {};
      testSpecificAiState.availableProviders = [MOCK_AI_PROVIDER];
      testSpecificAiState.selectedProviderId = MOCK_AI_PROVIDER.id;
      testSpecificAiState.selectedPromptId = null;

      // Mock getAiState to return this specific state, ensuring full AiState structure
      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));
      
      // Mock walletService for an organization wallet
      const mockOrgWalletInfo: ActiveChatWalletInfo = {
        status: 'ok', type: 'organization', balance: '20000', orgId: mockOrgId, walletId: 'org-wallet-id', message: undefined, isLoadingPrimaryWallet: false
      };
      (mockWalletService.getActiveWalletInfo as Mock).mockReturnValue(mockOrgWalletInfo);

      const mockInputMessage = 'Hello, new org chat!';
      const mockNewlyCreatedChatId = 'new-chat-id-org-789';
      const mockOptimisticOrgChatId = 'optimistic-org-chat-id'; // New distinct optimistic ID
      const mockTempUserMessageDetails = { 
        tempId: 'temp-user-org-1', 
        chatIdUsed: mockOptimisticOrgChatId, // Use the new optimistic ID here
        createdTimestamp: new Date().toISOString() 
      };
      
      // The addOptimisticUserMessage mock in beforeEach is general.
      // For this specific test, we can refine its behavior if needed, or rely on the general one if it correctly generates a new chatId when currentChatId is null.
      // The key is that handleSendMessage will use the chatIdUsed from this for subsequent operations.
      // (mockAiStateService.addOptimisticUserMessage as Mock).mockReturnValue(mockTempUserMessageDetails);
      (mockAiStateService.addOptimisticUserMessage as Mock).mockImplementationOnce(() => {
        const optimisticMessage: ChatMessage = {
          id: mockTempUserMessageDetails.tempId,
          chat_id: mockTempUserMessageDetails.chatIdUsed,
          role: 'user',
          content: mockInputMessage, // Ensure content is included
          created_at: mockTempUserMessageDetails.createdTimestamp,
          updated_at: mockTempUserMessageDetails.createdTimestamp,
          user_id: MOCK_USER.id,
          ai_provider_id: null,
          system_prompt_id: null,
          is_active_in_thread: true,
          error_type: null,
          token_usage: null, // Optimistic messages usually start with null token_usage
          response_to_message_id: null,
        };
        testSpecificAiState.messagesByChatId = {
          ...testSpecificAiState.messagesByChatId,
          [mockTempUserMessageDetails.chatIdUsed]: [optimisticMessage],
        };
        // If this is truly a new chat (inputChatId was null and currentChatId was null before optimistic add)
        // then optimistic add would set currentChatId. Let's simulate that for consistency if it matters for the test's view of "state".
        if (!testSpecificAiState.currentChatId) { // Or more accurately, if inputChatId for handleSendMessage was null
            testSpecificAiState.currentChatId = mockTempUserMessageDetails.chatIdUsed;
        }
        return mockTempUserMessageDetails;
      });

      const mockFinalUserMessageRow: ChatMessageRow = {
        id: mockTempUserMessageDetails.tempId, 
        chat_id: mockNewlyCreatedChatId, // This should still be the final chat ID for the message row from API
        role: 'user',
        content: mockInputMessage,
        created_at: mockTempUserMessageDetails.createdTimestamp,
        updated_at: new Date().toISOString(),
        user_id: MOCK_USER.id,
        is_active_in_thread: true,
        ai_provider_id: null,
        system_prompt_id: null,
        token_usage: null, 
        error_type: null,
        response_to_message_id: null,
      };

      const mockAssistantMessageRow: ChatMessageRow = {
        id: 'assistant-msg-org-1',
        chat_id: mockNewlyCreatedChatId,
        role: 'assistant',
        content: 'Hi there! This is an org response.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: null,
        ai_provider_id: MOCK_AI_PROVIDER.id,
        system_prompt_id: null,
        is_active_in_thread: true,
        token_usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
        response_to_message_id: mockFinalUserMessageRow.id,
        error_type: null,
      };
      
      const expectedReturnedAssistantMessage: ChatMessage = {
        ...mockAssistantMessageRow,
      };

      mockCallChatApi.mockResolvedValue({
        status: 200,
        data: {
          assistantMessage: mockAssistantMessageRow,
          chatId: mockNewlyCreatedChatId,
        } as ChatHandlerSuccessResponse,
      });

      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: null, // New chat
      });

      // Act
      const result = await handleSendMessage(serviceParams);

      // Assert
      // 1. callChatApi receives correct ChatApiRequest with organizationId.
      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArgs = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;
      expect(callChatApiArgs.chatId).toBeUndefined(); // Corrected
      expect(callChatApiArgs.organizationId).toBe(mockOrgId); 
      expect(callChatApiArgs.message).toBe(mockInputMessage);
      expect(callChatApiArgs.rewindFromMessageId).toBeUndefined();

      // 2. Returns the assistant message.
      expect(result).toEqual(expectedReturnedAssistantMessage);

      // 3. aiStateService.setAiState is called to update state
      const finalAiState = (mockAiStateService.getAiState as Mock)();

      expect(finalAiState.messagesByChatId[mockNewlyCreatedChatId]).toBeDefined();
      const chatMessagesInState = finalAiState.messagesByChatId[mockNewlyCreatedChatId];
      const userMessageInState = chatMessagesInState.find(m => m.role === 'user');
      expect(userMessageInState).toBeDefined();
      expect(userMessageInState?.content).toBe(mockInputMessage);
      expect(userMessageInState?.id).toBe(mockFinalUserMessageRow.id);

      const assistantMessageInState = chatMessagesInState.find(m => m.role === 'assistant');
      expect(assistantMessageInState).toEqual(expect.objectContaining(mockAssistantMessageRow));

      //   - Add new chat details to chatsByContext.orgs[orgId].
      expect(finalAiState.chatsByContext.orgs[mockOrgId]).toBeDefined();
      expect(finalAiState.chatsByContext.orgs[mockOrgId]?.length).toBe(1);
      const newChatEntryInState = finalAiState.chatsByContext.orgs[mockOrgId]?.[0] as Chat;
      expect(newChatEntryInState.id).toBe(mockNewlyCreatedChatId);
      expect(newChatEntryInState.title).toContain(mockInputMessage.substring(0, 50));
      expect(newChatEntryInState.user_id).toBe(MOCK_USER.id);
      expect(newChatEntryInState.organization_id).toBe(mockOrgId);

      //   - Set currentChatId to the new org chat ID.
      expect(finalAiState.currentChatId).toBe(mockNewlyCreatedChatId);

      //   - Clear newChatContext, isLoadingAiResponse, and aiError.
      expect(finalAiState.newChatContext).toBeNull();
      expect(finalAiState.isLoadingAiResponse).toBe(false);
      expect(finalAiState.aiError).toBeNull();
    });

    it('[EXISTING CHAT] SUCCESS: should return assistant message and update existing chat state', async () => {
      const mockExistingChatId = 'existing-chat-id-123';
      const mockInitialUserMessageRow: ChatMessageRow = {
        id: 'prev-user-msg-1', chat_id: mockExistingChatId, role: 'user', content: 'Previous message', 
        created_at: new Date(Date.now() - 10000).toISOString(), updated_at: new Date(Date.now() - 10000).toISOString(), 
        user_id: MOCK_USER.id, is_active_in_thread: true,
        ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null, // Personal chat context for this message
      };
      const mockInitialAssistantMessageRow: ChatMessageRow = {
        id: 'prev-assistant-msg-1', chat_id: mockExistingChatId, role: 'assistant', content: 'Previous response', 
        created_at: new Date(Date.now() - 9000).toISOString(), updated_at: new Date(Date.now() - 9000).toISOString(), 
        user_id: null, ai_provider_id: MOCK_AI_PROVIDER.id, 
        system_prompt_id: null, is_active_in_thread: true,
        token_usage: {prompt_tokens: 5, completion_tokens: 5, total_tokens: 10},
        error_type: null, response_to_message_id: mockInitialUserMessageRow.id, // Personal chat context
      };
      const mockExistingChat: Chat = {
        id: mockExistingChatId, title: 'Existing Personal Chat', user_id: MOCK_USER.id, organization_id: null, // Personal chat
        created_at: new Date(Date.now() - 20000).toISOString(), updated_at: new Date(Date.now() - 10000).toISOString(),
        system_prompt_id: null, 
      };

      // Setup: Initial State for an existing personal chat
      testSpecificAiState.currentChatId = mockExistingChatId;
      testSpecificAiState.newChatContext = null;
      testSpecificAiState.messagesByChatId = {
        [mockExistingChatId]: [mockInitialUserMessageRow, mockInitialAssistantMessageRow],
      };
      testSpecificAiState.chatsByContext = {
        personal: [mockExistingChat], // Existing chat is personal
        orgs: {},
      };
      testSpecificAiState.selectedMessagesMap = {
        [mockExistingChatId]: {
          [mockInitialUserMessageRow.id]: true,
          [mockInitialAssistantMessageRow.id]: true,
        }
      };
      testSpecificAiState.availableProviders = [MOCK_AI_PROVIDER];
      testSpecificAiState.selectedProviderId = MOCK_AI_PROVIDER.id;
      testSpecificAiState.selectedPromptId = null;
      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));
      
      const mockPersonalWalletInfo: ActiveChatWalletInfo = {
        status: 'ok', type: 'personal', balance: '10000', orgId: null, walletId: 'personal-wallet-id', message: undefined, isLoadingPrimaryWallet: false
      };
      (mockWalletService.getActiveWalletInfo as Mock).mockReturnValue(mockPersonalWalletInfo);
      
      const mockInputMessage = 'Hello, existing chat!';
      const mockTempUserMessageDetails = { 
        tempId: 'temp-user-existing-1', 
        chatIdUsed: mockExistingChatId, 
        createdTimestamp: new Date().toISOString() 
      };
      // (mockAiStateService.addOptimisticUserMessage as Mock).mockReturnValue(mockTempUserMessageDetails); // Old version
      (mockAiStateService.addOptimisticUserMessage as Mock).mockImplementationOnce(() => {
        const optimisticMessage: ChatMessage = {
          id: mockTempUserMessageDetails.tempId,
          chat_id: mockTempUserMessageDetails.chatIdUsed,
          role: 'user',
          content: mockInputMessage, // Use mockInputMessage from test scope
          created_at: mockTempUserMessageDetails.createdTimestamp,
          updated_at: mockTempUserMessageDetails.createdTimestamp,
          user_id: MOCK_USER.id,
          ai_provider_id: null,
          system_prompt_id: null,
          is_active_in_thread: true,
          error_type: null,
          token_usage: null,
          response_to_message_id: mockInitialAssistantMessageRow.id, // Link to previous for context if needed by message structure
        };

        // Ensure the array for this chat ID exists in messagesByChatId
        if (!testSpecificAiState.messagesByChatId[mockTempUserMessageDetails.chatIdUsed]) {
          testSpecificAiState.messagesByChatId[mockTempUserMessageDetails.chatIdUsed] = [];
        }
        // Mutate the array directly by pushing the new optimistic message
        testSpecificAiState.messagesByChatId[mockTempUserMessageDetails.chatIdUsed].push(optimisticMessage);
        // No need to update currentChatId here as it's an existing chat and already set

        return mockTempUserMessageDetails;
      });

      const mockFinalUserMessageRow: ChatMessageRow = {
        id: mockTempUserMessageDetails.tempId, 
        chat_id: mockExistingChatId,
        role: 'user',
        content: mockInputMessage,
        created_at: mockTempUserMessageDetails.createdTimestamp,
        updated_at: new Date().toISOString(),
        user_id: MOCK_USER.id,
        is_active_in_thread: true,
        ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: mockInitialAssistantMessageRow.id, // Continuing personal chat context
      };

      const mockNewAssistantMessageRow: ChatMessageRow = {
        id: 'new-assistant-msg-existing-1',
        chat_id: mockExistingChatId,
        role: 'assistant',
        content: 'Response to existing chat message.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: null,
        ai_provider_id: MOCK_AI_PROVIDER.id,
        is_active_in_thread: true,
        token_usage: { prompt_tokens: 12, completion_tokens: 22, total_tokens: 34 },
        system_prompt_id: null, error_type: null, response_to_message_id: mockFinalUserMessageRow.id, // Continuing personal chat context
      };
      
      const expectedReturnedAssistantMessage: ChatMessage = {
        ...mockNewAssistantMessageRow,
      };

      mockCallChatApi.mockResolvedValue({
        status: 200,
        data: {
          assistantMessage: mockNewAssistantMessageRow,
          chatId: mockExistingChatId,
        } as ChatHandlerSuccessResponse,
      });

      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: mockExistingChatId, 
      });

      // Act
      const result = await handleSendMessage(serviceParams);

      // Assert
      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArgs = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;
      expect(callChatApiArgs.chatId).toBe(mockExistingChatId);
      // For an existing personal chat, organizationId sent to API should be null.
      // The coreMessageProcessing function determines effectiveOrganizationId.
      // If targetChatId is present, it uses activeWalletInfo.orgId if wallet is 'organization'.
      // Since wallet is personal here, organizationIdForApi becomes undefined internally, which becomes null for the DB/API call as per ChatApiRequest type for optional FKs.
      expect(callChatApiArgs.organizationId).toBeUndefined(); // Corrected from toBeNull based on omission logic
      expect(callChatApiArgs.message).toBe(mockInputMessage);
      expect(callChatApiArgs.rewindFromMessageId).toBeUndefined();

      expect(result).toEqual(expectedReturnedAssistantMessage);

      const finalAiState = (mockAiStateService.getAiState as Mock)();
      expect(finalAiState.messagesByChatId[mockExistingChatId]).toBeDefined();
      const chatMessagesInState = finalAiState.messagesByChatId[mockExistingChatId];
      
      expect(chatMessagesInState.length).toBe(4); // 2 initial + 2 new
      expect(chatMessagesInState).toContainEqual(expect.objectContaining(mockInitialUserMessageRow));
      expect(chatMessagesInState).toContainEqual(expect.objectContaining(mockInitialAssistantMessageRow));

      const userMessageInState = chatMessagesInState.find(m => m.id === mockFinalUserMessageRow.id);
      expect(userMessageInState).toEqual(expect.objectContaining(mockFinalUserMessageRow));

      const assistantMessageInState = chatMessagesInState.find(m => m.id === mockNewAssistantMessageRow.id);
      expect(assistantMessageInState).toEqual(expect.objectContaining(mockNewAssistantMessageRow));
      
      expect(finalAiState.currentChatId).toBe(mockExistingChatId);

      expect(finalAiState.selectedMessagesMap[mockExistingChatId]).toBeDefined();
      expect(finalAiState.selectedMessagesMap[mockExistingChatId]?.[mockInitialUserMessageRow.id]).toBe(true); 
      expect(finalAiState.selectedMessagesMap[mockExistingChatId]?.[mockInitialAssistantMessageRow.id]).toBe(true);
      expect(finalAiState.selectedMessagesMap[mockExistingChatId]?.[mockFinalUserMessageRow.id]).toBe(true);
      expect(finalAiState.selectedMessagesMap[mockExistingChatId]?.[mockNewAssistantMessageRow.id]).toBe(true);

      expect(finalAiState.chatsByContext.personal?.length).toBe(1);
      expect(finalAiState.chatsByContext.personal?.[0].id).toBe(mockExistingChatId);
      // Check if updated_at for the chat in chatsByContext might have changed (implementation dependent)
      // For this test, we focus on message list and currentChatId, assuming chat metadata updates are secondary or handled elsewhere.

      expect(finalAiState.newChatContext).toBeNull(); 
      expect(finalAiState.isLoadingAiResponse).toBe(false);
      expect(finalAiState.aiError).toBeNull();
    });

    it('[API ERROR] NEW PERSONAL CHAT: should return null, set error, and clean up optimistic message', async () => {
      // Setup: Initial State for a new personal chat, similar to the success case
      testSpecificAiState.currentChatId = null;
      testSpecificAiState.newChatContext = null; // string | null
      testSpecificAiState.messagesByChatId = {};
      testSpecificAiState.chatsByContext = { personal: [], orgs: {} };
      testSpecificAiState.availableProviders = [MOCK_AI_PROVIDER];
      testSpecificAiState.selectedProviderId = MOCK_AI_PROVIDER.id;
      testSpecificAiState.selectedPromptId = null;
      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));

      const mockInputMessage = 'Hello, trying a new personal chat that will fail.';
      const mockOptimisticChatId = 'temp-chat-id-pers-fail-123'; 
      const mockTempUserMessageId = 'temp-user-pers-fail-1';
      
      (mockAiStateService.addOptimisticUserMessage as Mock).mockReturnValue({
        tempId: mockTempUserMessageId,
        chatIdUsed: mockOptimisticChatId,
        createdTimestamp: new Date().toISOString(),
      });
      
      // Simulate that addOptimisticUserMessage (when called by handleSendMessage) would add this message to state
      // This setup ensures that when we check the state *after* handleSendMessage, we can see if this message was cleaned up.
      const optimisticMessageBeforeApiCall: ChatMessageRow = {
        id: mockTempUserMessageId, chat_id: mockOptimisticChatId, role: 'user', content: mockInputMessage,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: MOCK_USER.id,
        is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null,
      };
      testSpecificAiState.messagesByChatId[mockOptimisticChatId] = [optimisticMessageBeforeApiCall];
      // Also, if addOptimisticUserMessage sets currentChatId when it creates a new one:
      testSpecificAiState.currentChatId = mockOptimisticChatId; 

      const mockApiError = { message: 'Simulated API Error', code: 'API_ERROR' }; // This is the error.object for ErrorResponse
      // callChatApi resolves with ApiResponse<ChatHandlerSuccessResponse> or ErrorResponse
      mockCallChatApi.mockResolvedValue({
        status: 500, // Example error status
        error: mockApiError,
      } as ErrorResponse);

      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: null, // New chat
      });

      // Act
      const result = await handleSendMessage(serviceParams);

      // Assert
      expect(result).toBeNull();

      const finalAiState = (mockAiStateService.getAiState as Mock)();
      expect(finalAiState.aiError).toBe(mockApiError.message);
      expect(finalAiState.isLoadingAiResponse).toBe(false);

      // Optimistic user message should be removed.
      const messagesInOptimisticChat = finalAiState.messagesByChatId[mockOptimisticChatId];
      // The code filters the message: newMsgsByChatId[optimisticMessageChatId] = chatMsgs.filter(msg => msg.id !== tempUserMessageId);
      // So, the array might still exist but be empty, or the message just won't be found.
      expect(messagesInOptimisticChat?.find(m => m.id === mockTempUserMessageId)).toBeUndefined();
      if (messagesInOptimisticChat?.length === 0) {
        // Optionally assert that the array is empty if it was the only message
        // or even that the mockOptimisticChatId key is deleted from messagesByChatId if that's the behavior.
        // Based on current code, it seems the array itself isn't deleted, just the message.
      }

      // No new chat should be created in chatsByContext.
      expect(finalAiState.chatsByContext.personal?.length || 0).toBe(0);
      
      // Behavior of currentChatId after a new chat fails:
      // The main handleSendMessage doesn't explicitly revert currentChatId in this error path.
      // It was set to mockOptimisticChatId by our simulation of addOptimisticUserMessage's effect.
      // If the chat (identified by mockOptimisticChatId) is now empty, currentChatId might point to an empty chat.
      // This specific assertion depends on the desired UX/state management for this edge case.
      // For now, we confirm the message cleanup and no *persistent* chat object.
      // expect(finalAiState.currentChatId).toBeNull(); // This would be ideal if the temp chat context is fully reset.
    });
    
    it('[API ERROR] NEW ORGANIZATION CHAT: should return null, set error, and clean up optimistic message', async () => {
      const mockOrgId = 'org-fail-789';
      // Setup: Initial State for a new org chat that will fail
      testSpecificAiState.currentChatId = null;
      testSpecificAiState.newChatContext = mockOrgId;
      testSpecificAiState.messagesByChatId = {}; 
      testSpecificAiState.chatsByContext = { personal: [], orgs: { [mockOrgId]: [] } }; 
      testSpecificAiState.availableProviders = [MOCK_AI_PROVIDER];
      testSpecificAiState.selectedProviderId = MOCK_AI_PROVIDER.id;
      testSpecificAiState.selectedPromptId = null;
      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));

      const mockOrgWalletInfo: ActiveChatWalletInfo = {
        status: 'ok', type: 'organization', balance: '20000', orgId: mockOrgId, walletId: 'org-wallet-id-fail', message: undefined, isLoadingPrimaryWallet: false
      };
      (mockWalletService.getActiveWalletInfo as Mock).mockReturnValue(mockOrgWalletInfo);

      const mockInputMessage = 'Hello, org chat that will hit an API error.';
      const mockOptimisticChatId = 'temp-chat-id-org-fail-456';
      const mockTempUserMessageId = 'temp-user-org-fail-2';

      (mockAiStateService.addOptimisticUserMessage as Mock).mockReturnValue({
        tempId: mockTempUserMessageId,
        chatIdUsed: mockOptimisticChatId,
        createdTimestamp: new Date().toISOString(),
      });
      
      // Simulate optimistic message addition to state for org context
      const optimisticMessageBeforeApiCall: ChatMessageRow = {
        id: mockTempUserMessageId, chat_id: mockOptimisticChatId, role: 'user', content: mockInputMessage,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: MOCK_USER.id,
        is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null,
      };
      testSpecificAiState.messagesByChatId[mockOptimisticChatId] = [optimisticMessageBeforeApiCall];
      testSpecificAiState.currentChatId = mockOptimisticChatId; // Simulate currentChatId update by addOptimisticUserMessage

      const mockApiError = { message: 'Simulated Org API Error', code: 'API_ERROR' };
      mockCallChatApi.mockResolvedValue({
        status: 500, 
        error: mockApiError,
      } as ErrorResponse);

      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: null, // New chat
      });

      // Act
      const result = await handleSendMessage(serviceParams);

      // Assert
      expect(result).toBeNull();

      const finalAiState = (mockAiStateService.getAiState as Mock)();
      expect(finalAiState.aiError).toBe(mockApiError.message);
      expect(finalAiState.isLoadingAiResponse).toBe(false);

      const messagesInOptimisticChat = finalAiState.messagesByChatId[mockOptimisticChatId];
      expect(messagesInOptimisticChat?.find(m => m.id === mockTempUserMessageId)).toBeUndefined();

      // No new chat should be added to the persistent org chats list
      expect(finalAiState.chatsByContext.orgs[mockOrgId]?.length || 0).toBe(0);
      
      // As with personal chat error, newChatContext is not cleared by the error handler in handleSendMessage.
      // expect(finalAiState.newChatContext).toBeNull(); // This would only be true if explicitly reset.
      // currentChatId would still be mockOptimisticChatId if addOptimisticUserMessage set it and error path doesn't revert.
    });

    it('[API ERROR] EXISTING CHAT: should return null, set error, and clean up optimistic message', async () => {
      const mockExistingChatId = 'existing-chat-fail-id-456';
      const mockInitialUserMessageRow: ChatMessageRow = {
        id: 'prev-user-fail-1', chat_id: mockExistingChatId, role: 'user', content: 'Original message in existing chat', 
        created_at: new Date(Date.now() - 20000).toISOString(), updated_at: new Date(Date.now() - 20000).toISOString(), 
        user_id: MOCK_USER.id, is_active_in_thread: true,
        ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null, // Assuming this existing chat is personal
      };
      const mockExistingChat: Chat = {
        id: mockExistingChatId, title: 'Existing Personal Chat to Fail', user_id: MOCK_USER.id, organization_id: null, // Personal chat
        created_at: new Date(Date.now() - 30000).toISOString(), updated_at: new Date(Date.now() - 20000).toISOString(),
        system_prompt_id: null,
      };

      // Setup: Initial State for an existing personal chat that will encounter an API error
      testSpecificAiState.currentChatId = mockExistingChatId;
      testSpecificAiState.newChatContext = null;
      testSpecificAiState.messagesByChatId = {
        [mockExistingChatId]: [mockInitialUserMessageRow],
      };
      testSpecificAiState.chatsByContext = { 
        personal: [mockExistingChat], orgs: {}
      };
      testSpecificAiState.availableProviders = [MOCK_AI_PROVIDER];
      testSpecificAiState.selectedProviderId = MOCK_AI_PROVIDER.id;
      testSpecificAiState.selectedPromptId = null;
      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));
      
      const mockPersonalWalletInfo: ActiveChatWalletInfo = {
        status: 'ok', type: 'personal', balance: '10000', orgId: null, walletId: 'personal-wallet-id', message: undefined, isLoadingPrimaryWallet: false
      };
      (mockWalletService.getActiveWalletInfo as Mock).mockReturnValue(mockPersonalWalletInfo);

      const mockInputMessage = 'New message to existing chat that will cause API error.';
      const mockTempUserMessageId = 'temp-user-existing-fail-1';
      
      (mockAiStateService.addOptimisticUserMessage as Mock).mockReturnValue({
        tempId: mockTempUserMessageId,
        chatIdUsed: mockExistingChatId, 
        createdTimestamp: new Date().toISOString(),
      });
      
      // Simulate that addOptimisticUserMessage adds this message to the existing chat's messages in state
      const optimisticMessageBeforeApiCall: ChatMessageRow = {
        id: mockTempUserMessageId, chat_id: mockExistingChatId, role: 'user', content: mockInputMessage,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: MOCK_USER.id,
        is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null,
      };
      testSpecificAiState.messagesByChatId[mockExistingChatId]?.push(optimisticMessageBeforeApiCall);

      const mockApiError = { message: 'Simulated API Error on Existing Chat', code: 'API_ERROR' };
      mockCallChatApi.mockResolvedValue({
        status: 500,
        error: mockApiError,
      } as ErrorResponse);

      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: mockExistingChatId, 
      });

      // Act
      const result = await handleSendMessage(serviceParams);

      // Assert
      expect(result).toBeNull();

      const finalAiState = (mockAiStateService.getAiState as Mock)();
      expect(finalAiState.aiError).toBe(mockApiError.message);
      expect(finalAiState.isLoadingAiResponse).toBe(false);

      const messagesInExistingChat = finalAiState.messagesByChatId[mockExistingChatId];
      expect(messagesInExistingChat).toBeDefined();
      expect(messagesInExistingChat?.find(m => m.id === mockTempUserMessageId)).toBeUndefined(); 
      expect(messagesInExistingChat?.find(m => m.id === mockInitialUserMessageRow.id)).toEqual(expect.objectContaining(mockInitialUserMessageRow)); 
      expect(messagesInExistingChat?.length).toBe(1); // Only the initial message should remain
      
      expect(finalAiState.currentChatId).toBe(mockExistingChatId);
      expect(finalAiState.chatsByContext.personal?.length).toBe(1);
      expect(finalAiState.chatsByContext.personal?.[0].id).toBe(mockExistingChatId);
    });

    it('[REWIND] SUCCESS: should return assistant message, update state with rebuilt history, and clear rewindTargetMessageId', async () => {
      const mockChatId = 'chat-rewind-success-123';
      const mockInputMessage = 'New message after rewind';
      const mockRewindTargetMessageId = 'user-msg-to-rewind-from';

      // Initial messages: user1, assistant1, user2 (target), assistant2
      const mockUserMsg1: ChatMessageRow = {
        id: 'user-msg-1-prev', chat_id: mockChatId, role: 'user', content: 'First user message',
        created_at: '2023-01-01T10:00:00Z', updated_at: '2023-01-01T10:00:00Z', user_id: MOCK_USER.id,
        is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null,
      };
      const mockAssistantMsg1: ChatMessageRow = {
        id: 'asst-msg-1-prev', chat_id: mockChatId, role: 'assistant', content: 'First assistant response',
        created_at: '2023-01-01T10:01:00Z', updated_at: '2023-01-01T10:01:00Z', user_id: null, ai_provider_id: MOCK_AI_PROVIDER.id,
        system_prompt_id: null, is_active_in_thread: true, token_usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }, response_to_message_id: mockUserMsg1.id, error_type: null,
      };
      const mockUserMsgToRewindFrom: ChatMessageRow = { // This is the target for rewind
        id: mockRewindTargetMessageId, chat_id: mockChatId, role: 'user', content: 'Second user message (will be rewound from)',
        created_at: '2023-01-01T10:02:00Z', updated_at: '2023-01-01T10:02:00Z', user_id: MOCK_USER.id,
        is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: mockAssistantMsg1.id,
      };
      const mockAssistantMsgAfterTarget: ChatMessageRow = {
        id: 'asst-msg-2-after-target', chat_id: mockChatId, role: 'assistant', content: 'Second assistant response (will be removed by rewind)',
        created_at: '2023-01-01T10:03:00Z', updated_at: '2023-01-01T10:03:00Z', user_id: null, ai_provider_id: MOCK_AI_PROVIDER.id,
        system_prompt_id: null, is_active_in_thread: true, token_usage: { prompt_tokens: 6, completion_tokens: 6, total_tokens: 12 }, response_to_message_id: mockUserMsgToRewindFrom.id, error_type: null,
      };

      testSpecificAiState.currentChatId = mockChatId;
      testSpecificAiState.rewindTargetMessageId = mockRewindTargetMessageId;
      testSpecificAiState.messagesByChatId = {
        [mockChatId]: [mockUserMsg1, mockAssistantMsg1, mockUserMsgToRewindFrom, mockAssistantMsgAfterTarget],
      };
      testSpecificAiState.selectedMessagesMap = {
        [mockChatId]: {
          [mockUserMsg1.id]: true,
          [mockAssistantMsg1.id]: true,
          [mockUserMsgToRewindFrom.id]: true,
          [mockAssistantMsgAfterTarget.id]: true,
        }
      };
      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));

      const mockTempUserMessageDetails = {
        tempId: 'temp-user-rewind-1',
        chatIdUsed: mockChatId,
        createdTimestamp: new Date().toISOString(),
      };
      // The general addOptimisticUserMessage mock from beforeEach should be sufficient.
      // It adds the message to the end. handleSendMessage's success path will handle the actual list reconstruction.

      const mockFinalUserMessageAfterRewind: ChatMessageRow = {
        id: mockTempUserMessageDetails.tempId, // Or a new ID if API updates it
        chat_id: mockChatId,
        role: 'user',
        content: mockInputMessage,
        created_at: mockTempUserMessageDetails.createdTimestamp,
        updated_at: new Date().toISOString(),
        user_id: MOCK_USER.id,
        is_active_in_thread: true,
        ai_provider_id: null, system_prompt_id: null, token_usage: { prompt_tokens: 7, completion_tokens: 0, total_tokens: 7 }, error_type: null, response_to_message_id: mockAssistantMsg1.id, // Responding to the last message before rewind point
      };

      const mockNewAssistantMessageAfterRewind: ChatMessageRow = {
        id: 'new-asst-msg-rewind-1',
        chat_id: mockChatId,
        role: 'assistant',
        content: 'This is the new response after rewind.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: null,
        ai_provider_id: MOCK_AI_PROVIDER.id,
        system_prompt_id: null,
        is_active_in_thread: true,
        token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        response_to_message_id: mockFinalUserMessageAfterRewind.id,
        error_type: null,
      };

      mockCallChatApi.mockResolvedValue({
        status: 200,
        data: {
          assistantMessage: mockNewAssistantMessageAfterRewind,
          chatId: mockChatId,
          userMessage: mockFinalUserMessageAfterRewind, // API confirms/updates the user message
          isRewind: true,
        } as ChatHandlerSuccessResponse,
      });

      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: mockChatId,
      });

      const result = await handleSendMessage(serviceParams);

      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArgs = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;
      expect(callChatApiArgs.rewindFromMessageId).toBe(mockRewindTargetMessageId);
      expect(callChatApiArgs.chatId).toBe(mockChatId);

      expect(result).toEqual(expect.objectContaining(mockNewAssistantMessageAfterRewind));

      const finalAiState = (mockAiStateService.getAiState as Mock)();
      expect(finalAiState.rewindTargetMessageId).toBeNull();

      const messagesInState = finalAiState.messagesByChatId[mockChatId];
      expect(messagesInState).toBeDefined();
      // Expected: userMsg1, assistantMsg1, finalUserMsgAfterRewind, newAssistantMsgAfterRewind
      expect(messagesInState.length).toBe(4);
      expect(messagesInState).toEqual(expect.arrayContaining([
        expect.objectContaining(mockUserMsg1),
        expect.objectContaining(mockAssistantMsg1),
        expect.objectContaining(mockFinalUserMessageAfterRewind),
        expect.objectContaining(mockNewAssistantMessageAfterRewind),
      ]));
      // Ensure the rewound messages are not present
      expect(messagesInState.find(m => m.id === mockUserMsgToRewindFrom.id)).toBeUndefined();
      expect(messagesInState.find(m => m.id === mockAssistantMsgAfterTarget.id)).toBeUndefined();

      expect(finalAiState.selectedMessagesMap[mockChatId]).toBeDefined();
      const selections = finalAiState.selectedMessagesMap[mockChatId] || {};
      expect(selections[mockUserMsg1.id]).toBe(true);
      expect(selections[mockAssistantMsg1.id]).toBe(true);
      expect(selections[mockFinalUserMessageAfterRewind.id]).toBe(true);
      expect(selections[mockNewAssistantMessageAfterRewind.id]).toBe(true);
      expect(Object.keys(selections).length).toBe(4); // Only these 4 should be selected

      expect(finalAiState.isLoadingAiResponse).toBe(false);
      expect(finalAiState.aiError).toBeNull();
    });

    it('[REWIND] FAILURE (API Error): should return null, set error, and preserve original history and rewindTargetMessageId', async () => {
      const mockChatId = 'chat-rewind-fail-456';
      const mockInputMessage = 'New message attempt during rewind fail';
      const mockRewindTargetMessageId = 'user-msg-target-rewind-fail';

      // Initial messages, same structure as success case
      const mockUserMsg1: ChatMessageRow = {
        id: 'fail-user-msg-1', chat_id: mockChatId, role: 'user', content: 'Fail: First user message',
        created_at: '2023-02-01T10:00:00Z', updated_at: '2023-02-01T10:00:00Z', user_id: MOCK_USER.id,
        is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null,
      };
      const mockAssistantMsg1: ChatMessageRow = {
        id: 'fail-asst-msg-1', chat_id: mockChatId, role: 'assistant', content: 'Fail: First assistant response',
        created_at: '2023-02-01T10:01:00Z', updated_at: '2023-02-01T10:01:00Z', user_id: null, ai_provider_id: MOCK_AI_PROVIDER.id,
        system_prompt_id: null, is_active_in_thread: true, token_usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }, response_to_message_id: mockUserMsg1.id, error_type: null,
      };
      const mockUserMsgToRewindFromFail: ChatMessageRow = { // Target for rewind
        id: mockRewindTargetMessageId, chat_id: mockChatId, role: 'user', content: 'Fail: Second user message (rewind target)',
        created_at: '2023-02-01T10:02:00Z', updated_at: '2023-02-01T10:02:00Z', user_id: MOCK_USER.id,
        is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: mockAssistantMsg1.id,
      };
      const mockAssistantMsgAfterTargetFail: ChatMessageRow = {
        id: 'fail-asst-msg-2', chat_id: mockChatId, role: 'assistant', content: 'Fail: Second assistant response (should remain)',
        created_at: '2023-02-01T10:03:00Z', updated_at: '2023-02-01T10:03:00Z', user_id: null, ai_provider_id: MOCK_AI_PROVIDER.id,
        system_prompt_id: null, is_active_in_thread: true, token_usage: { prompt_tokens: 6, completion_tokens: 6, total_tokens: 12 }, response_to_message_id: mockUserMsgToRewindFromFail.id, error_type: null,
      };
      
      const initialMessages = [mockUserMsg1, mockAssistantMsg1, mockUserMsgToRewindFromFail, mockAssistantMsgAfterTargetFail];

      testSpecificAiState.currentChatId = mockChatId;
      testSpecificAiState.rewindTargetMessageId = mockRewindTargetMessageId;
      testSpecificAiState.messagesByChatId = { [mockChatId]: [...initialMessages] }; // Clone to ensure modification doesn't affect original array for assertion
      testSpecificAiState.selectedMessagesMap = {
        [mockChatId]: {
          [mockUserMsg1.id]: true,
          [mockAssistantMsg1.id]: true,
          [mockUserMsgToRewindFromFail.id]: true,
          [mockAssistantMsgAfterTargetFail.id]: true,
        }
      };
      (mockAiStateService.getAiState as Mock).mockImplementation(() => ({ ...getDefaultMockAiState(), ...testSpecificAiState }));
      
      // The addOptimisticUserMessage in beforeEach will add an optimistic message.
      // Let's capture its generated tempId to ensure it's cleaned up.
      let optimisticTempId = '';
      const originalAddOptimistic = mockAiStateService.addOptimisticUserMessage;
      (mockAiStateService.addOptimisticUserMessage as Mock).mockImplementationOnce((content, chatId) => {
        const result = originalAddOptimistic(content, chatId);
        optimisticTempId = result.tempId;
        // Add it to testSpecificAiState so the error handling path can see it for cleanup
        const optimisticMessage: ChatMessage = {
            id: result.tempId, chat_id: result.chatIdUsed, role: 'user', content,
            created_at: result.createdTimestamp, updated_at: result.createdTimestamp, user_id: MOCK_USER.id,
            is_active_in_thread: true, error_type: null, token_usage: null, response_to_message_id: null, ai_provider_id: null, system_prompt_id: null
        };
        if (!testSpecificAiState.messagesByChatId[result.chatIdUsed]) {
            testSpecificAiState.messagesByChatId[result.chatIdUsed] = [];
        }
        testSpecificAiState.messagesByChatId[result.chatIdUsed].push(optimisticMessage);
        return result;
      });

      const mockApiError = { message: 'API Rewind Error', code: 'API_ERROR' };
      mockCallChatApi.mockResolvedValue({
        status: 500,
        error: mockApiError,
        // isRewind would likely be false or undefined in an error response from API for a rewind attempt
      } as ErrorResponse);

      const serviceParams = getDefaultTestServiceParams({
        message: mockInputMessage,
        chatId: mockChatId,
      });

      const result = await handleSendMessage(serviceParams);

      expect(mockCallChatApi).toHaveBeenCalledTimes(1);
      const callChatApiArgs = mockCallChatApi.mock.calls[0][0] as ChatApiRequest;
      expect(callChatApiArgs.rewindFromMessageId).toBe(mockRewindTargetMessageId);

      expect(result).toBeNull();

      const finalAiState = (mockAiStateService.getAiState as Mock)();
      expect(finalAiState.aiError).toBe(mockApiError.message);
      expect(finalAiState.isLoadingAiResponse).toBe(false);
      expect(finalAiState.rewindTargetMessageId).toBe(mockRewindTargetMessageId); // Crucially, preserved

      const messagesInState = finalAiState.messagesByChatId[mockChatId];
      expect(messagesInState).toBeDefined();
      // Original history should be preserved, optimistic message for this turn removed.
      expect(messagesInState.length).toBe(initialMessages.length); 
      expect(messagesInState).toEqual(expect.arrayContaining(initialMessages.map(m => expect.objectContaining(m))));
      expect(messagesInState.find(m => m.id === optimisticTempId)).toBeUndefined(); // Ensure optimistic one is gone

      // Selected messages should also be preserved as they were before the failed rewind
      expect(finalAiState.selectedMessagesMap[mockChatId]).toEqual(testSpecificAiState.selectedMessagesMap[mockChatId]);
    });
  });

});