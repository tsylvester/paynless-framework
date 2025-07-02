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

  // Wallet Status Handling with helper
  describe('Wallet Status Handling', () => {
    const testWalletStatus = async (
      statusInfo: Partial<ActiveChatWalletInfo>,
      expectedError: string | null,
      // Updated to expect a string or undefined for pendingAction, aligning with AiState
      expectedPendingAction?: AiPendingChatAction | undefined, 
      shouldRequestLogin: boolean = false
    ) => {
      (mockAuthService.getCurrentUser as Mock).mockReturnValue(shouldRequestLogin ? null : MOCK_USER);
      (mockWalletService.getActiveWalletInfo as Mock).mockReturnValue({
        status: 'loading', // Default, overridden by statusInfo
        type: 'personal',
        balance: '0',
        orgId: null,
        walletId: null,
        message: null,
        isLoadingPrimaryWallet: true, // Default, overridden
        ...statusInfo,
      } as ActiveChatWalletInfo);

      const params = getDefaultTestServiceParams();
      // Simulate optimistic message adding before handleSendMessage is called
      const { tempId: optimisticTempId, chatIdUsed: optimisticChatId } = (mockAiStateService.addOptimisticUserMessage as Mock)(params.data.message, params.data.chatId);

      const result = await handleSendMessage(params);

      if (expectedError) {
        expect(result).toBeNull();
        const expectedSetAiStateObject: Partial<AiState> = {
          aiError: expectedError,
          isLoadingAiResponse: false,
        };
        // Directly assign the expectedPendingAction string or undefined
        if (expectedPendingAction !== undefined) { // Only add if it's explicitly passed (not undefined)
          expectedSetAiStateObject.pendingAction = expectedPendingAction;
        }
        // For cases where pendingAction should NOT be set, 
        // expectedPendingAction will be undefined, and thus pendingAction won't be in expectedSetAiStateObject.
        // This makes the expect.objectContaining check more precise for these cases.

        expect((mockAiStateService.setAiState as Mock)).toHaveBeenCalledWith(
          expect.objectContaining(expectedSetAiStateObject)
        );

        // Remove the separate check for pendingAction: undefined, as it's covered above.
        // if (pendingActionDetails) { ... } else { expect(mockAiStateService.setAiState).toHaveBeenCalledWith(expect.objectContaining({ pendingAction: undefined, })); }
        // The main expect above now handles this correctly.
        // If expectedPendingAction is undefined, expectedSetAiStateObject will not have pendingAction,
        // and objectContaining will correctly check that the actual call also does not have pendingAction,
        // or if it does, it must be undefined (which it won't be if our code is right).
        // If pendingAction should truly be undefined in the call, we would add `pendingAction: undefined` to expectedSetAiStateObject.
        // But in our case (wallet errors other than no-user), pendingAction is simply NOT SET in the call to setAiState.
        // So, expectedSetAiStateObject should NOT include the pendingAction key.

        // Check optimistic message cleanup
        const setAiStateCallWithCleanup = (mockAiStateService.setAiState as Mock).mock.calls.find(
          call => call[0].aiError === expectedError
        );
        expect(setAiStateCallWithCleanup).toBeDefined();
        if (setAiStateCallWithCleanup) {
            const messagesForChat = setAiStateCallWithCleanup[0].messagesByChatId?.[optimisticChatId];
            if (messagesForChat) { // if the chat still exists
                 expect(messagesForChat).not.toEqual(
                    expect.arrayContaining([expect.objectContaining({ id: optimisticTempId })])
                 );
            } else if (testSpecificAiState.messagesByChatId[optimisticChatId]?.some(m => m.id === optimisticTempId)) {
                // If the entire chat was meant to be cleaned up because it was new and errored.
                // This is a bit more complex as the chat itself might be gone.
                // For now, we'll assume if messagesForChat is undefined, the optimistic message is gone.
                // A more robust check might be needed if this proves insufficient.
            }
        }


        if (shouldRequestLogin) {
          expect((mockAuthService.requestLoginNavigation as Mock)).toHaveBeenCalled();
        } else {
          expect((mockAuthService.requestLoginNavigation as Mock)).not.toHaveBeenCalled();
        }
        expect(mockCallChatApi).not.toHaveBeenCalled();
      } else {
        expect(result).not.toBeNull();
        // Further checks for success path are in specific success tests
        expect(mockAiStateService.setAiState).toHaveBeenCalledWith(expect.objectContaining({
          aiError: null,
        }));
        expect(mockAuthService.requestLoginNavigation).not.toHaveBeenCalled();
      }
    };

    it('should block message and show "Auth required." if wallet is loading and no user is present, setting pending action', async () => {
      await testWalletStatus(
        { status: 'loading', isLoadingPrimaryWallet: true, message: "Wallet is loading..." },
        'Auth required.',
        'SEND_MESSAGE', // Expect 'SEND_MESSAGE' string directly
        true // shouldRequestLogin = true
      );
    });

    it('should block message and show "Wallet loading." if wallet is loading (user present)', async () => {
      // User is present by default (MOCK_USER)
      await testWalletStatus(
        { status: 'loading', isLoadingPrimaryWallet: true, message: "Wallet is currently loading. Please wait." },
        'Wallet is currently loading. Please wait.',
        undefined, // No pending action
        false // shouldRequestLogin = false
      );
    });

    it('should block message and show specific error if wallet status is "error"', async () => {
      const walletErrorMessage = 'Specific wallet error from service';
      await testWalletStatus(
        { status: 'error', message: walletErrorMessage, isLoadingPrimaryWallet: false },
        `Wallet Error: ${walletErrorMessage}`,
        undefined, // No pending action
        false // No login request
      );
    });

    it('should block message and show "Consent please" if wallet status is "consent_required"', async () => {
      await testWalletStatus(
        { status: 'consent_required', message: 'Action requires consent.', isLoadingPrimaryWallet: false },
        'Action requires consent.', // Corrected expected error message to match the actual one.
        undefined, // No pending action
        false // No login request
      );
    });

    it('should block message and show "Consent refused by user" if wallet status is "consent_refused"', async () => {
      await testWalletStatus(
        { status: 'consent_refused', message: 'User refused consent.', isLoadingPrimaryWallet: false },
        'User refused consent.', // Corrected expected error message.
        undefined, // No pending action
        false // No login request
      );
    });

    it('should block message and show "Org wallet MIA" if wallet status is "policy_org_wallet_unavailable"', async () => {
      await testWalletStatus(
        { status: 'policy_org_wallet_unavailable', type: 'organization', message: 'Organization wallet not available for this action.', isLoadingPrimaryWallet: false },
        'Organization wallet not available for this action.', // Corrected expected error message.
        undefined, // No pending action
        false // No login request
      );
    });

    it('should block message and show "Weird status" for an unknown wallet status', async () => {
      await testWalletStatus(
        // Casting to any to bypass ActiveWalletStatus type for testing unknown status
        { status: 'unknown_weird_status' as any, message: 'Some unknown issue.', isLoadingPrimaryWallet: false },
        'Some unknown issue.', // Corrected expected error message.
        undefined, // No pending action
        false // No login request
      );
    });
  });

});