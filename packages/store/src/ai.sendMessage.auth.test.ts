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

  describe('Authentication and Authorization', () => {
    it('should require login if no session token is present and set pending action', async () => {
      (mockAuthService.getSession as any).mockReturnValueOnce(null);

      const result = await handleSendMessage(getDefaultTestServiceParams());

      expect(result).toBeNull();

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls;
      expect(setAiStateCalls.length).toBeGreaterThan(0);
      const lastSetAiStateCallArg = setAiStateCalls[setAiStateCalls.length - 1][0];

      const expectedStateChanges: Partial<AiState> = {
        isLoadingAiResponse: false,
        aiError: 'Auth required.',
        pendingAction: 'SEND_MESSAGE', // Already correct here, as AiPendingChatAction
      };

      if (typeof lastSetAiStateCallArg === 'function') {
        const prevState = getDefaultMockAiState(); // A default previous state for the updater
        const updatedState = lastSetAiStateCallArg(prevState);
        expect(updatedState).toMatchObject(expectedStateChanges);
      } else {
        expect(lastSetAiStateCallArg).toMatchObject(expectedStateChanges);
      }

      expect(mockAuthService.requestLoginNavigation).toHaveBeenCalledTimes(1);
    });

    it('should handle API error indicating auth required (e.g. token expired) by requesting login and setting pending action', async () => {
      const optimisticTempId = 'temp-auth-err-msg';
      const optimisticChatId = 'chat-auth-err';

      // Ensure the optimistic message is added to testSpecificAiState so cleanup can find it
      (mockAiStateService.addOptimisticUserMessage as any).mockImplementationOnce(() => {
        const optimisticMessage: ChatMessageRow = {
          id: optimisticTempId, chat_id: optimisticChatId, role: 'user', content: 'test message', error_type: null, response_to_message_id: null,
          created_at: 'now', updated_at: 'now', user_id: MOCK_USER.id, is_active_in_thread: true, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, system_prompt_id: null, ai_provider_id: null,
        };
        testSpecificAiState = {
            ...testSpecificAiState,
            messagesByChatId: { 
              ...(testSpecificAiState.messagesByChatId || {}),
              [optimisticChatId]: [optimisticMessage] 
            },
            currentChatId: optimisticChatId
        };
        return { tempId: optimisticTempId, chatIdUsed: optimisticChatId, createdTimestamp: 'now' };
      });

      mockCallChatApi.mockResolvedValueOnce({ 
        status: 401, // Or other appropriate error status for AUTH_REQUIRED
        error: { message: 'API Authentication Required', code: 'AUTH_REQUIRED' }, 
        // data is implicitly undefined for ErrorResponse if not specified
      } as ErrorResponse); // Cast to ErrorResponse

      const result = await handleSendMessage(getDefaultTestServiceParams({ message: 'test message' }));

      expect(result).toBeNull();

      const setAiStateCalls = (mockAiStateService.setAiState as any).mock.calls;
      expect(setAiStateCalls.length).toBeGreaterThan(0);
      const lastSetAiStateCallArg = setAiStateCalls[setAiStateCalls.length - 1][0];

      let finalState: Partial<AiState> = {};
      if (typeof lastSetAiStateCallArg === 'function') {
        // Pass testSpecificAiState as it would have been modified by the addOptimisticUserMessage mock
        finalState = lastSetAiStateCallArg(testSpecificAiState);
      } else {
        finalState = lastSetAiStateCallArg;
      }

      expect(finalState.isLoadingAiResponse).toBe(false);
      expect(finalState.aiError).toBe('API Authentication Required');
      expect(finalState.pendingAction).toBe('SEND_MESSAGE'); // Already correct here
      
      // Check optimistic message cleanup
      expect(finalState.messagesByChatId?.[optimisticChatId]).toBeDefined();
      expect(finalState.messagesByChatId?.[optimisticChatId]?.find(m => m.id === optimisticTempId)).toBeUndefined();

      expect(mockAuthService.requestLoginNavigation).toHaveBeenCalledTimes(1);
    });
  });

});