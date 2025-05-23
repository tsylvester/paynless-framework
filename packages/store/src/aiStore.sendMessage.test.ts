import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance, type Mock, beforeAll } from 'vitest';
import { useAiStore } from './aiStore';
import { act } from '@testing-library/react';
import {
    AiState,
    ChatMessage,
    ChatApiRequest,
    User,
    Session,
    AuthRequiredError,
} from '@paynless/types';
import { ActiveChatWalletInfo } from '@paynless/types';
import {
    initializeMockWalletStore,
    useWalletStore,
    selectActiveChatWalletInfo
} from '../../../apps/web/src/mocks/walletStore.mock';
import { useOrganizationStore } from '../../../apps/web/src/mocks/organizationStore.mock';
import { getMockAiClient, resetApiMock } from '../../api/src/mocks/api.mock';
import {
    useAuthStore,
    resetAuthStoreMock,
    mockSetAuthUser,
    mockSetAuthSession,
    mockSetAuthNavigate
} from '../../../apps/web/src/mocks/authStore.mock';

let mockSelectActiveChatWalletInfoProxy: Mock<[any], ActiveChatWalletInfo>;

// Define a well-typed initial state for these tests, matching AiState
const initialTestSendMessageState: AiState = {
    availableProviders: [],
    availablePrompts: [],
    messagesByChatId: {}, // New state structure
    chatsByContext: { personal: [], orgs: {} }, // New state structure
    currentChatId: null,
    isLoadingAiResponse: false,
    isConfigLoading: false,
    isLoadingHistoryByContext: { personal: false, orgs: {} }, // New state structure
    isDetailsLoading: false,
    newChatContext: null, // New state property
    rewindTargetMessageId: null, // New state property
    aiError: null,
    historyErrorByContext: { personal: null, orgs: {} },
    selectedProviderId: null,
    selectedPromptId: null,
    selectedMessagesMap: {},
    chatParticipantsProfiles: {},
    pendingAction: null, // Added to satisfy AiState
};

// Updated resetAiStore to use the new initial state and merge (preserve actions)
const resetAiStore = (initialOverrides: Partial<AiState> = {}) => {
    useAiStore.setState({ ...initialTestSendMessageState, ...initialOverrides }, false);
};

// Define a global navigate mock consistent with authStore tests
const mockNavigateGlobal = vi.fn();

// Declare mockSendChatMessage at the top level of the describe block
let mockSendChatMessage: Mock<any, any>; 

// When any code (like aiStore.ts) imports from '@paynless/api',
// tell Vitest to resolve it to our mock module.
// Our mock module ('../../api/src/mocks/api.mock') exports an 'api' object,
// which matches what aiStore.ts expects.
vi.mock('@paynless/api', () => import('../../api/src/mocks/api.mock'));

// Mock the local './authStore' path that aiStore.ts uses
// This will re-export all named exports from the mock file, including useAuthStore
vi.mock('./authStore', () => import('../../../apps/web/src/mocks/authStore.mock'));

// Mock './walletStore.selectors' to provide the exports from the central walletStore.mock.ts
// This ensures that when aiStore.ts (SUT) imports selectActiveChatWalletInfo from './walletStore.selectors',
// it gets the vi.fn() instance defined in and exported from '../../../apps/web/src/mocks/walletStore.mock.ts'.
vi.mock('./walletStore.selectors', () => import('../../../apps/web/src/mocks/walletStore.mock'));

describe('aiStore - sendMessage', () => {
    beforeAll(async () => {
        // mockSelectActiveChatWalletInfoProxy is assigned the selectActiveChatWalletInfo imported
        // at the top of this file. This import comes from the central mock file.
        // The vi.mock above ensures that any attempt by aiStore.ts to import this selector
        // from './walletStore.selectors' will also get this same mocked instance.
        mockSelectActiveChatWalletInfoProxy = selectActiveChatWalletInfo;
    });

    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks(); 
        vi.restoreAllMocks(); 

        resetApiMock(); 
        resetAuthStoreMock(); 
        const currentMockAiClient = getMockAiClient();
        mockSendChatMessage = currentMockAiClient.sendChatMessage;

        act(() => {
            resetAiStore();
            initializeMockWalletStore(); // Basic initialization
        });
        // Default mock for selectActiveChatWalletInfo for general cases
        // Individual describe blocks can override this
        mockSelectActiveChatWalletInfoProxy.mockReturnValue({
            status: 'ok',
            type: 'personal',
            walletId: 'mock-general-wallet-id',
            orgId: null,
            balance: '1000',
            isLoadingPrimaryWallet: false,
        });
    });

    // --- Tests for sendMessage (Authenticated) ---
    describe('sendMessage (Authenticated)', () => {
        // Define constants for mock data
        const mockToken = 'valid-token-for-send';
        const mockUser: User = { id: 'user-auth-send', email: 'test@test.com', created_at: 't', updated_at: 't', role: 'user' };
        const mockSession: Session = { access_token: mockToken, refresh_token: 'r', expiresAt: Date.now() / 1000 + 3600 };
        const messageData = { message: 'Hello', providerId: 'p1', promptId: 's1' };
        const mockAssistantResponse: ChatMessage = {
            id: 'm2',
            chat_id: 'c123',
            role: 'assistant',
            content: 'Hi there',
            user_id: null,
            ai_provider_id: messageData.providerId,
            system_prompt_id: messageData.promptId,
            token_usage: { total_tokens: 20 },
            created_at: '2024-01-01T12:00:00.000Z',
            is_active_in_thread: true,
            updated_at: '2024-01-01T12:00:00.000Z'
        };

        beforeEach(() => {
            // Mock for authenticated state
            mockSetAuthUser(mockUser);
            mockSetAuthSession(mockSession);
            mockSetAuthNavigate(mockNavigateGlobal);

            // Mock wallet selector for typical authenticated scenarios (personal wallet available)
            mockSelectActiveChatWalletInfoProxy.mockReturnValue({
                status: 'ok',
                type: 'personal',
                walletId: 'mock-auth-personal-wallet',
                orgId: null,
                balance: '500',
                isLoadingPrimaryWallet: false,
            });

            act(() => {
                resetAiStore({
                    currentChatId: null,
                    messagesByChatId: {},
                });
                useAiStore.setState({
                    selectedProviderId: messageData.providerId,
                    selectedPromptId: messageData.promptId
                });
                // Initialize wallet store with a state that would lead to the above mockReturnValue if the real selector was used.
                // For instance, a personal wallet being successfully loaded.
                initializeMockWalletStore({
                    personalWallet: { 
                        walletId: 'mock-auth-personal-wallet', 
                        balance: '500', 
                        createdAt: new Date(),
                        currency: 'AI_TOKEN',
                        updatedAt: new Date()
                    },
                    isLoadingPersonalWallet: false,
                    personalWalletError: null,
                    currentChatWalletDecision: { outcome: 'use_personal_wallet'}
                });
            });
        });

        it('[PERS] NEW CHAT SUCCESS: should update state and chatsByContext.personal', async () => {
            // Arrange
            // This mockAssistantResponse implies it's for a new chat, so its chat_id will be the new one.
            const newChatIdFromServer = 'c123';
            const mockAssistantResponseNewChat: ChatMessage = { ...mockAssistantResponse, chat_id: newChatIdFromServer };
            const mockConfirmedUserMessagePers: ChatMessage = {
                id: 'confirmed-user-id-pers',
                chat_id: newChatIdFromServer,
                role: 'user',
                content: messageData.message,
                created_at: 'mock-timestamp-pers',
                updated_at: 'mock-timestamp-pers',
                user_id: mockUser.id,
                ai_provider_id: null,
                system_prompt_id: null,
                token_usage: null,
                is_active_in_thread: true,
            };
            mockSendChatMessage.mockResolvedValue({ 
                data: { // This IS the ChatHandlerSuccessResponse
                    assistantMessage: mockAssistantResponseNewChat, 
                    userMessage: mockConfirmedUserMessagePers, 
                    chatDetails: { id: newChatIdFromServer, created_at: 'date', updated_at: 'date', user_id: mockUser.id, title: 'Test Chat', organization_id: null, system_prompt_id: null, last_message_content: null, last_message_at: null, model_provider_id: null } 
                }, 
                status: 200, 
                error: null 
            });

            // Store initial messagesByChatId for comparison if needed, though for a new chat it starts empty for this test.
            const initialMessagesByChatId = useAiStore.getState().messagesByChatId;
            expect(useAiStore.getState().currentChatId).toBeNull(); // Pre-condition for new chat

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData); // messageData has no chatId, implying new chat
                // Assertions immediately after dispatch (optimistic state)
                expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            });
            await promise; // Wait for the API call and subsequent state updates

            // Assert final state after success
            const expectedRequestData: ChatApiRequest = {
                message: messageData.message,
                providerId: messageData.providerId,
                promptId: messageData.promptId,
                chatId: undefined,
                organizationId: null // Added expectation: null for new personal chat
            };
            const expectedOptions = { token: mockToken };
            expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
            expect(mockSendChatMessage).toHaveBeenCalledWith(expectedRequestData, expectedOptions);

            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatId).toBe(newChatIdFromServer); // currentChatId is now set

            const messagesForNewChat = state.messagesByChatId[newChatIdFromServer];
            expect(messagesForNewChat).toBeDefined();
            expect(messagesForNewChat.length).toBe(2); // User's optimistic (now confirmed) + assistant's

            const userMessage = messagesForNewChat.find(m => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage?.content).toBe(messageData.message);
            expect(userMessage?.chat_id).toBe(newChatIdFromServer); // Important: user message's chat_id updated
            expect(userMessage?.id).toBe(mockConfirmedUserMessagePers.id); 

            expect(messagesForNewChat.find(m => m.id === mockAssistantResponseNewChat.id)).toEqual(mockAssistantResponseNewChat); // Corrected: find by assistant message ID
            expect(state.aiError).toBeNull();
            // Assert chatsByContext update for the new personal chat
            expect(state.chatsByContext?.personal?.length).toBe(1);
            expect(state.chatsByContext?.personal?.[0]?.id).toBe(newChatIdFromServer);
            expect(state.chatsByContext?.personal?.[0]?.organization_id).toBeNull();
            expect(state.chatsByContext?.personal?.[0]?.title).toBe(messageData.message.substring(0, 50));
        });

        it('[ORG] NEW CHAT SUCCESS: should update state and chatsByContext.orgs[orgId]', async () => {
            // Arrange
            const mockOrgId = 'org-new-chat-123';
            const newChatIdFromServer = 'c-org-456';
            // Mock response indicating it belongs to the org
            const mockAssistantResponseOrgChat: ChatMessage = {
                ...mockAssistantResponse,
                chat_id: newChatIdFromServer,
            };
            const mockConfirmedUserMessageOrg: ChatMessage = {
                id: 'confirmed-user-id-org',
                chat_id: newChatIdFromServer,
                role: 'user',
                content: messageData.message,
                created_at: 'mock-timestamp-org',
                updated_at: 'mock-timestamp-org',
                user_id: mockUser.id,
                ai_provider_id: null,
                system_prompt_id: null,
                token_usage: null,
                is_active_in_thread: true,
            };
            mockSendChatMessage.mockResolvedValue({ 
                data: { // This IS the ChatHandlerSuccessResponse
                    assistantMessage: mockAssistantResponseOrgChat, 
                    userMessage: mockConfirmedUserMessageOrg, 
                    chatDetails: { id: newChatIdFromServer, created_at: 'date', updated_at: 'date', user_id: mockUser.id, organization_id: mockOrgId, title: 'Org Chat', system_prompt_id: null, last_message_content: null, last_message_at: null, model_provider_id: null } 
                }, 
                status: 200, 
                error: null 
            });

            // Set context for a new organization chat
            act(() => {
                resetAiStore({
                    currentChatId: null,
                    messagesByChatId: {},
                    newChatContext: mockOrgId,
                    selectedProviderId: messageData.providerId,
                    selectedPromptId: messageData.promptId
                });
            });
            // For this specific test, ensure the wallet determination logic within aiStore.sendMessage
            // (which uses useWalletStore, useOrganizationStore, etc.) will allow the org chat to proceed.
            // This typically means ensuring the mocked states of those stores are set up correctly
            // for this test's scenario (e.g., org has a wallet, or personal wallet usage is allowed for this org context).

            expect(useAiStore.getState().currentChatId).toBeNull();
            expect(useAiStore.getState().newChatContext).toBe(mockOrgId);

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData); // messageData has no chatId
                expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            });
            await promise;

            // Assert final state
            const expectedRequestData: ChatApiRequest = {
                message: messageData.message,
                providerId: messageData.providerId,
                promptId: messageData.promptId,
                chatId: undefined,
                organizationId: mockOrgId // Expect orgId derived from newChatContext
            };
            const expectedOptions = { token: mockToken };
            expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
            expect(mockSendChatMessage).toHaveBeenCalledWith(expectedRequestData, expectedOptions);

            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatId).toBe(newChatIdFromServer);
            expect(state.newChatContext).toBeNull(); // Should be cleared after success

            const messagesForNewChat = state.messagesByChatId[newChatIdFromServer];
            expect(messagesForNewChat).toBeDefined();
            expect(messagesForNewChat.length).toBe(2);

            const userMessage = messagesForNewChat.find(m => m.role === 'user');
            expect(userMessage?.chat_id).toBe(newChatIdFromServer);

            expect(messagesForNewChat.find(m => m.id === mockAssistantResponseOrgChat.id)).toEqual(mockAssistantResponseOrgChat);
            expect(state.aiError).toBeNull();
            // Assert chatsByContext update for the new org chat
            expect(state.chatsByContext?.orgs?.[mockOrgId]).toBeDefined();
            expect(state.chatsByContext?.orgs?.[mockOrgId]?.length).toBe(1);
            expect(state.chatsByContext?.orgs?.[mockOrgId]?.[0]?.id).toBe(newChatIdFromServer);
            expect(state.chatsByContext?.orgs?.[mockOrgId]?.[0]?.organization_id).toBe(mockOrgId);
            expect(state.chatsByContext?.orgs?.[mockOrgId]?.[0]?.title).toBe(messageData.message.substring(0, 50));
        });

        it('[EXISTING] SUCCESS: should update messages and preserve currentChatId', async () => {
            // Arrange
            const existingChatId = 'old-chat-id-456';
            const serverResponseChatId = existingChatId; // For an existing chat, chat_id in response matches
            const assistantResponseForExistingChat: ChatMessage = { ...mockAssistantResponse, chat_id: serverResponseChatId };
            const newMessageDataForExisting = { ...messageData, message: "Follow up message" }; // Renamed from newMessageData to avoid conflict
            const mockConfirmedUserMessageForExisting: ChatMessage = {
                id: 'confirmed-user-existing-id',
                chat_id: existingChatId,
                role: 'user',
                content: newMessageDataForExisting.message, // Use the actual message content
                created_at: 'mock-timestamp-existing',
                updated_at: 'mock-timestamp-existing',
                user_id: mockUser.id,
                ai_provider_id: null,
                system_prompt_id: null,
                token_usage: null,
                is_active_in_thread: true,
            };
            mockSendChatMessage.mockResolvedValue({
                data: { // This IS ChatHandlerSuccessResponse
                    assistantMessage: assistantResponseForExistingChat,
                    userMessage: mockConfirmedUserMessageForExisting,
                    isRewind: false,
                    chatDetails: null // Or provide mock chatDetails if necessary
                },
                status: 200,
                error: null
            });

            const initialUserMessage: ChatMessage = {
                id: 'temp-user-old',
                chat_id: existingChatId,
                role: 'user',
                content: messageData.message,
                created_at: 't0',
                is_active_in_thread: true,
                ai_provider_id: null,
                system_prompt_id: null,
                token_usage: null,
                user_id: mockUser.id,
                updated_at: 't0'
            };
            act(() => {
                resetAiStore({
                    currentChatId: existingChatId,
                    messagesByChatId: {
                        [existingChatId]: [initialUserMessage] // Simulate an already existing optimistic message (e.g. from previous send attempt)
                    },
                    selectedProviderId: messageData.providerId,
                    selectedPromptId: messageData.promptId
                });
            });
             // Re-check after reset
            const initialMessagesForExistingChat = useAiStore.getState().messagesByChatId[existingChatId] || [];
            const initialMessagesLength = initialMessagesForExistingChat.length;


            // Act: Send a new message to this existing chat
            await act(async () => { await useAiStore.getState().sendMessage(newMessageDataForExisting); });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatId).toBe(existingChatId); // Stays the same

            const messagesForExistingChat = state.messagesByChatId[existingChatId];
            expect(messagesForExistingChat).toBeDefined();
            // Length should be initial + new optimistic user message + new assistant message
            expect(messagesForExistingChat.length).toBe(initialMessagesLength + 2);

            const newUserMessage = messagesForExistingChat.find(m => m.role === 'user' && m.content === newMessageDataForExisting.message);
            expect(newUserMessage).toBeDefined();
            expect(newUserMessage?.chat_id).toBe(existingChatId); // Chat ID is the existing one

            expect(messagesForExistingChat.find(m => m.id === assistantResponseForExistingChat.id)).toEqual(assistantResponseForExistingChat); // Corrected: find by assistant message ID
        });

        it('[PERS] NEW CHAT API ERROR: should clean up optimistic message and preserve newChatContext', async () => {
            // Arrange
            const errorMsg = 'AI failed to respond';
            mockSendChatMessage.mockResolvedValue({ data: null, status: 500, error: { message: errorMsg } });
            act(() => {
                resetAiStore({
                    currentChatId: null,
                    messagesByChatId: {},
                    selectedProviderId: messageData.providerId, 
                    selectedPromptId: messageData.promptId,   
                });
            });

            let capturedCurrentChatIdFromSpy: string | undefined;
            const originalSetState = useAiStore.setState; 

            const setStateSpy = vi.spyOn(useAiStore, 'setState').mockImplementation((update, replace) => {
                const localPrevState = useAiStore.getState(); 
                if (typeof update === 'function') {
                    originalSetState(update as (prevState: AiState) => AiState, replace);
                } else {
                    originalSetState(update as Partial<AiState>, replace);
                }
                const stateAfterUpdate = useAiStore.getState(); 

                if (localPrevState.currentChatId !== stateAfterUpdate.currentChatId && 
                    stateAfterUpdate.currentChatId && 
                    stateAfterUpdate.currentChatId.startsWith('temp-chat-') &&
                    !capturedCurrentChatIdFromSpy) { 
                    expect(stateAfterUpdate.isLoadingAiResponse).toBe(true); 
                    expect(stateAfterUpdate.pendingAction).toBe('SEND_MESSAGE');
                    capturedCurrentChatIdFromSpy = stateAfterUpdate.currentChatId;
                }
            });

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            });
            await promise;

            // Assert
            const finalState = useAiStore.getState();
            expect(finalState.isLoadingAiResponse).toBe(false);
            expect(finalState.aiError).toBe(errorMsg);
            
            expect(finalState.currentChatId).not.toBeNull(); 
            expect(finalState.currentChatId?.startsWith('temp-chat-')).toBe(true);
            
            const relevantChatIdForMessageCheck = finalState.currentChatId;
            if (relevantChatIdForMessageCheck) { 
                expect(finalState.messagesByChatId[relevantChatIdForMessageCheck] || []).toEqual([]); 
            } else {
                // This path should ideally not be hit if the above assertions pass
                throw new Error('finalState.currentChatId was unexpectedly null/undefined after error for message check');
            }
            expect(finalState.newChatContext).toBeNull();

            setStateSpy.mockRestore();
        });

        it('[PERS] NEW CHAT NETWORK ERROR: should clean up optimistic message and preserve newChatContext', async () => {
            // Arrange
            const errorMsg = 'Network connection failed';
            mockSendChatMessage.mockRejectedValue(new Error(errorMsg));
            act(() => {
                resetAiStore({
                    currentChatId: null,
                    messagesByChatId: {},
                    selectedProviderId: messageData.providerId, 
                    selectedPromptId: messageData.promptId,   
                });
            });

            let capturedCurrentChatIdFromSpy: string | undefined;
            const originalSetState = useAiStore.setState; 

            const setStateSpy = vi.spyOn(useAiStore, 'setState').mockImplementation((update, replace) => {
                const localPrevState = useAiStore.getState(); 
                if (typeof update === 'function') {
                    originalSetState(update as (prevState: AiState) => AiState, replace);
                } else {
                    originalSetState(update as Partial<AiState>, replace);
                }
                const stateAfterUpdate = useAiStore.getState(); 

                if (localPrevState.currentChatId !== stateAfterUpdate.currentChatId && 
                    stateAfterUpdate.currentChatId && 
                    stateAfterUpdate.currentChatId.startsWith('temp-chat-') &&
                    !capturedCurrentChatIdFromSpy) { 
                    expect(stateAfterUpdate.isLoadingAiResponse).toBe(true);
                    expect(stateAfterUpdate.pendingAction).toBe('SEND_MESSAGE');
                    capturedCurrentChatIdFromSpy = stateAfterUpdate.currentChatId;
                }
            });

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            });
            await promise;

            // Assert
            const finalState = useAiStore.getState();
            expect(finalState.isLoadingAiResponse).toBe(false);
            expect(finalState.aiError).toBe(errorMsg);

            expect(finalState.currentChatId).not.toBeNull(); 
            expect(finalState.currentChatId?.startsWith('temp-chat-')).toBe(true);

            const relevantChatIdForMessageCheck = finalState.currentChatId;
            if (relevantChatIdForMessageCheck) {
                expect(finalState.messagesByChatId[relevantChatIdForMessageCheck] || []).toEqual([]);
            } else {
                 // This path should ideally not be hit if the above assertions pass
                throw new Error('finalState.currentChatId was unexpectedly null/undefined after error for message check');
            }
            expect(finalState.newChatContext).toBeNull();

            setStateSpy.mockRestore();
        });

        it('[EXISTING] API ERROR: should clean up optimistic message and preserve currentChatId', async () => {
            // Arrange
            const existingChatId = 'existing-chat-fail-api';
            const errorMsg = 'API error on existing chat';
            mockSendChatMessage.mockResolvedValue({ data: null, status: 500, error: { message: errorMsg } });

            const initialUserMessageContent = "Original message in existing chat";
            act(() => {
                resetAiStore({
                    currentChatId: existingChatId,
                    messagesByChatId: {
                        // No initial messages needed for optimistic message addition test
                    },
                    newChatContext: null, // Ensure it's an existing chat context
                    selectedProviderId: messageData.providerId,
                    selectedPromptId: messageData.promptId
                });
            });

            let optimisticTempMessageId: string | undefined;
            const originalSetState = useAiStore.setState;
            vi.spyOn(useAiStore, 'setState').mockImplementation((updater, replace) => {
                if (typeof updater === 'function') {
                    const stateBeforeUpdate = useAiStore.getState();
                    const newState = updater(stateBeforeUpdate);
                    // Sniff the temporary message ID when the optimistic message is added
                    const messagesInChat = newState.messagesByChatId?.[existingChatId];
                    if (messagesInChat) {
                        const optimisticMsg = messagesInChat.find(m => m.id.startsWith('temp-user-') && m.role === 'user');
                        if (optimisticMsg) {
                            optimisticTempMessageId = optimisticMsg.id;
                        }
                    }
                    originalSetState(newState, replace);
                } else {
                    originalSetState(updater, replace);
                }
            });

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            });
            await promise;

            // Assert
            vi.mocked(useAiStore.setState).mockRestore(); // Clean up spy
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.aiError).toBe(errorMsg);
            expect(state.currentChatId).toBe(existingChatId); // Crucial: currentChatId preserved
            expect(state.newChatContext).toBeNull(); // Ensure newChatContext is not set

            const messagesForChat = state.messagesByChatId[existingChatId];
            if (optimisticTempMessageId) {
                expect(messagesForChat?.find(m => m.id === optimisticTempMessageId)).toBeUndefined(); // Optimistic message removed
            } else {
                // Fallback if ID wasn't sniffed, ensure no temporary user messages remain
                expect(messagesForChat?.some(m => m.role === 'user' && m.id.startsWith('temp-user-'))).toBe(false);
            }
            expect(messagesForChat?.length || 0).toBe(0); // Expecting the chat message list to be empty if the only message failed
        });

        it('[EXISTING] NETWORK ERROR: should clean up optimistic message and preserve currentChatId', async () => {
            // Arrange
            const existingChatId = 'existing-chat-fail-network';
            const errorMsg = 'Network error on existing chat';
            mockSendChatMessage.mockRejectedValue(new Error(errorMsg)); // Simulate network error

            const initialUserMessageContent = "Original message in existing chat for network fail";
            act(() => {
                resetAiStore({
                    currentChatId: existingChatId,
                    messagesByChatId: {},
                    newChatContext: null,
                    selectedProviderId: messageData.providerId,
                    selectedPromptId: messageData.promptId
                });
            });

            let optimisticTempMessageId: string | undefined;
            const originalSetState = useAiStore.setState;
            vi.spyOn(useAiStore, 'setState').mockImplementation((updater, replace) => {
                if (typeof updater === 'function') {
                    const stateBeforeUpdate = useAiStore.getState();
                    const newState = updater(stateBeforeUpdate);
                    const messagesInChat = newState.messagesByChatId?.[existingChatId];
                    if (messagesInChat) {
                        const optimisticMsg = messagesInChat.find(m => m.id.startsWith('temp-user-') && m.role === 'user');
                        if (optimisticMsg) {
                            optimisticTempMessageId = optimisticMsg.id;
                        }
                    }
                    originalSetState(newState, replace);
                } else {
                    originalSetState(updater, replace);
                }
            });

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            });
            await promise;

            // Assert
            vi.mocked(useAiStore.setState).mockRestore();
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.aiError).toBe(errorMsg);
            expect(state.currentChatId).toBe(existingChatId);
            expect(state.newChatContext).toBeNull();

            const messagesForChat = state.messagesByChatId[existingChatId];
            if (optimisticTempMessageId) {
                expect(messagesForChat?.find(m => m.id === optimisticTempMessageId)).toBeUndefined();
            } else {
                expect(messagesForChat?.some(m => m.role === 'user' && m.id.startsWith('temp-user-'))).toBe(false);
            }
            expect(messagesForChat?.length || 0).toBe(0);
        });

        it('[REWIND] SUCCESS: should rebuild history and clear rewindTargetMessageId', async () => {
            const chatId = 'chat-with-rewind';
            const rewindTargetId = 'msg2-user'; // Target this message for rewind
            const initialMessages: ChatMessage[] = [
                { id: 'msg1-user', chat_id: chatId, role: 'user', content: 'First message', created_at: 't1', is_active_in_thread: true, ai_provider_id: 'p-rewind', system_prompt_id: 's-rewind', token_usage: null, user_id: mockUser.id, updated_at: 't0' },
                { id: 'msg1-assist', chat_id: chatId, role: 'assistant', content: 'First response', created_at: 't2', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: null, updated_at: 't0' },
                { id: rewindTargetId, chat_id: chatId, role: 'user', content: 'Second message (to be rewound from)', created_at: 't3', is_active_in_thread: true, ai_provider_id: 'p-rewind', system_prompt_id: 's-rewind', token_usage: null, user_id: mockUser.id, updated_at: 't0' },
                { id: 'msg2-assist', chat_id: chatId, role: 'assistant', content: 'Second response (to be replaced)', created_at: 't4', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: null, updated_at: 't0' },
                { id: 'msg3-user', chat_id: chatId, role: 'user', content: 'Third message (to be replaced)', created_at: 't5', is_active_in_thread: true, ai_provider_id: 'p-rewind', system_prompt_id: 's-rewind', token_usage: null, user_id: mockUser.id, updated_at: 't0' },
            ];
            const newMessageContent = "New message after rewind";
            const newAssistantResponse: ChatMessage = {
                id: 'm-rewind-assist',
                chat_id: chatId,
                role: 'assistant',
                content: 'Response to rewinded message',
                created_at: 't6',
                token_usage: { total_tokens: 15 },
                ai_provider_id: 'p-rewind',
                system_prompt_id: 's-rewind',
                is_active_in_thread: true,
                user_id: null,
                updated_at: 't0'
            };
            const mockUserMessageForRewind: ChatMessage = {
                id: 'confirmed-user-rewind', 
                chat_id: chatId,
                role: 'user',
                content: newMessageContent, // Content of the new user message that initiated rewind
                created_at: 'mock-timestamp-rewind',
                updated_at: 'mock-timestamp-rewind',
                user_id: mockUser.id,
                ai_provider_id: 'p-rewind',
                system_prompt_id: 's-rewind',
                token_usage: null,
                is_active_in_thread: true,
            };

            act(() => {
                resetAiStore({
                    currentChatId: chatId,
                    messagesByChatId: { [chatId]: initialMessages },
                    rewindTargetMessageId: rewindTargetId,
                    newChatContext: null,
                    selectedProviderId: 'p-rewind',
                    selectedPromptId: 's-rewind'
                });
            });

            mockSendChatMessage.mockResolvedValue({ 
                data: { // This IS the ChatHandlerSuccessResponse
                    assistantMessage: newAssistantResponse,
                    userMessage: mockUserMessageForRewind, // Add confirmed userMessage for rewind
                    chatDetails: null, // Explicitly null
                    isRewind: true 
                    // userMessage can be mocked if needed, e.g. if backend returns the user message that initiated the rewind.
                    // chatDetails might not be relevant for a rewind on an existing chat.
                }, 
                status: 200, 
                error: null 
            });

            let optimisticUserMessageId: string | undefined;
            const originalSetState = useAiStore.setState;
            vi.spyOn(useAiStore, 'setState').mockImplementation((updater, replace) => {
                if (typeof updater === 'function') {
                    const stateBeforeUpdate = useAiStore.getState();
                    const newState = updater(stateBeforeUpdate);
                    const messagesInChat = newState.messagesByChatId?.[chatId];
                    if (messagesInChat) {
                        const optimisticMsg = messagesInChat.find(m => m.content === newMessageContent && m.role === 'user');
                        if (optimisticMsg) optimisticUserMessageId = optimisticMsg.id;
                    }
                    originalSetState(newState, replace);
                } else {
                    originalSetState(updater, replace);
                }
            });

            await act(async () => {
                await useAiStore.getState().sendMessage({ ...messageData, message: newMessageContent, providerId: 'p-rewind', promptId: 's-rewind' });
            });

            vi.mocked(useAiStore.setState).mockRestore();
            const state = useAiStore.getState();

            expect(mockSendChatMessage).toHaveBeenCalledWith(
                expect.objectContaining({ chatId, message: newMessageContent, rewindFromMessageId: rewindTargetId, providerId: 'p-rewind', promptId: 's-rewind' }),
                expect.anything()
            );

            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.aiError).toBeNull();
            expect(state.rewindTargetMessageId).toBeNull(); // Crucial: rewind target cleared
            expect(state.currentChatId).toBe(chatId);

            const finalMessages = state.messagesByChatId[chatId];
            expect(finalMessages).toBeDefined();

            // Expected: msg1-user, msg1-assist, <new optimistic user msg (confirmed)>, newAssistantResponse
            expect(finalMessages.length).toBe(4);
            expect(finalMessages[0].id).toBe('msg1-user');
            expect(finalMessages[1].id).toBe('msg1-assist');
            expect(finalMessages[2].content).toBe(newMessageContent);
            if (optimisticUserMessageId) expect(finalMessages[2].id).toBe(optimisticUserMessageId);
            expect(finalMessages[3].id).toBe(newAssistantResponse.id);

            // Ensure old messages from rewind point are gone
            expect(finalMessages.find(m => m.id === rewindTargetId)).toBeUndefined();
            expect(finalMessages.find(m => m.id === 'msg2-assist')).toBeUndefined();
            expect(finalMessages.find(m => m.id === 'msg3-user')).toBeUndefined();
        });

        it('[REWIND] FAILURE: should preserve original history and rewindTargetMessageId on API error', async () => {
            const chatId = 'chat-with-rewind-fail';
            const rewindTargetId = 'msg2-user-fail';
            const initialMessages: ChatMessage[] = [
                { id: 'msg1-user-f', chat_id: chatId, role: 'user', content: 'First message fail', created_at: 'tf1', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, updated_at: 't0' },
                { id: 'msg1-assist-f', chat_id: chatId, role: 'assistant', content: 'First response fail', created_at: 'tf2', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: null, updated_at: 't0' },
                { id: rewindTargetId, chat_id: chatId, role: 'user', content: 'Second message (to be rewound from)', created_at: 'tf3', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, updated_at: 't0' },
                { id: 'msg2-assist-f', chat_id: chatId, role: 'assistant', content: 'Second response (should remain)', created_at: 'tf4', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: null, updated_at: 't0' },
            ];
            const newMessageContent = "New message triggering failed rewind";
            const errorMsg = "API error during rewind";

            act(() => {
                resetAiStore({
                    currentChatId: chatId,
                    messagesByChatId: { [chatId]: [...initialMessages] }, // Store a copy
                    rewindTargetMessageId: rewindTargetId,
                    newChatContext: null,
                    selectedProviderId: messageData.providerId,
                    selectedPromptId: messageData.promptId
                });
            });

            mockSendChatMessage.mockResolvedValue({ data: null, status: 500, error: { message: errorMsg } });

            let optimisticTempMessageId: string | undefined;
            const originalSetState = useAiStore.setState;
            vi.spyOn(useAiStore, 'setState').mockImplementation((updater, replace) => {
                if (typeof updater === 'function') {
                    const stateBeforeUpdate = useAiStore.getState();
                    const newState = updater(stateBeforeUpdate);
                    const messagesInChat = newState.messagesByChatId?.[chatId];
                    if (messagesInChat) {
                        const optimisticMsg = messagesInChat.find(m => m.content === newMessageContent && m.role === 'user');
                        if (optimisticMsg) optimisticTempMessageId = optimisticMsg.id;
                    }
                    originalSetState(newState, replace);
                } else {
                    originalSetState(updater, replace);
                }
            });

            await act(async () => {
                 await useAiStore.getState().sendMessage({...messageData, message: newMessageContent });
            });

            vi.mocked(useAiStore.setState).mockRestore();
            const state = useAiStore.getState();

            expect(mockSendChatMessage).toHaveBeenCalledWith(
                expect.objectContaining({ chatId, message: newMessageContent, rewindFromMessageId: rewindTargetId }),
                expect.anything()
            );

            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.aiError).toBe(errorMsg);
            expect(state.rewindTargetMessageId).toBe(rewindTargetId); // Crucial: rewind target preserved
            expect(state.currentChatId).toBe(chatId);

            const finalMessages = state.messagesByChatId[chatId];
            expect(finalMessages).toBeDefined();
            // Optimistic message should be removed, original history preserved
            expect(finalMessages.length).toBe(initialMessages.length);
            initialMessages.forEach((initialMsg, index) => {
                expect(finalMessages[index]).toEqual(initialMsg);
            });
            if (optimisticTempMessageId) {
                expect(finalMessages.find(m => m.id === optimisticTempMessageId)).toBeUndefined();
            }
        });
    }); // End Authenticated describe

    describe('sendMessage (Anonymous Flow - Pending Action)', () => {
        const mockAnonymousUser: User | null = null;
        const mockAnonymousSession: Session | null = null;
        const messageDataAnon = { message: 'Hello from anon', providerId: 'p-anon', promptId: 's-anon' };
        const authError = new AuthRequiredError('Auth required.');
        const optimisticChatIdForAnonFlow: string | null = null;

        beforeEach(() => {
            act(() => {
                resetAiStore({
                    currentChatId: null,
                    messagesByChatId: {},
                    selectedProviderId: messageDataAnon.providerId,
                    selectedPromptId: messageDataAnon.promptId,
                });
                initializeMockWalletStore({
                    currentChatWalletDecision: { outcome: 'loading' } // Default for anon, _determineChatWalletAndProceed should hit auth check first
                });
            });
            
            mockSetAuthUser(mockAnonymousUser);
            mockSetAuthSession(mockAnonymousSession);
            mockSetAuthNavigate(null); // For [ANON] NAVIGATE NULL test

            // For anonymous tests, the wallet status might initially be loading or not determined,
            // but the auth check in `sendMessage` should be the primary gate.
            // The _determineChatWalletAndProceed will get this value.
            mockSelectActiveChatWalletInfoProxy.mockReturnValue({
                status: 'loading', // This will cause the function to return early with "Auth required" if user is null.
                type: null,
                walletId: null,
                orgId: null,
                balance: null,
                message: 'Determining wallet policy and consent...',
                isLoadingPrimaryWallet: true,
            });
        });

        afterEach(() => {
            // Removed mockLocalStorageSetItem.mockClear();
        });

        it('[ANON] NAVIGATE NULL: should store pendingAction and set error when auth navigate is null', async () => {
            mockSendChatMessage.mockRejectedValue(authError);

            await act(async () => {
                await useAiStore.getState().sendMessage(messageDataAnon);
            });

            const finalState = useAiStore.getState();
            expect(finalState.isLoadingAiResponse).toBe(false);
            expect(finalState.aiError).toBe(authError.message);

            if (optimisticChatIdForAnonFlow) {
                expect(finalState.messagesByChatId[optimisticChatIdForAnonFlow]?.length || 0).toBe(0);
            }

            const expectedPendingAction = {
                endpoint: 'chat',
                method: 'POST',
                body: { ...messageDataAnon, chatId: null, organizationId: null }, 
                returnPath: 'chat'
            };
            expect(finalState.pendingAction).toBe('SEND_MESSAGE'); // VERIFY PENDING ACTION TYPE IN STORE
            expect(mockNavigateGlobal).not.toHaveBeenCalled();
        });

        it('[ANON] LOCALSTORAGE FAIL: should set error and not navigate if localStorage.setItem fails', async () => {
            const simulatedNavErrorMsg = 'Simulated localStorage error during navigation setup';
            mockSendChatMessage.mockRejectedValue(authError); 
            const mockNavigateWithError = vi.fn(() => { throw new Error(simulatedNavErrorMsg); });

            mockSetAuthUser(null);
            mockSetAuthSession(null);
            mockSetAuthNavigate(mockNavigateWithError);

            // Wrap the sendMessage call in a try/catch if the error is expected to be thrown and not handled by the store
            try {
                await act(async () => {
                    await useAiStore.getState().sendMessage(messageDataAnon);
                });
            } catch (e: any) {
                // This catch block will catch the error thrown by mockNavigateWithError
                expect(e.message).toBe(simulatedNavErrorMsg);
            }

            const finalState = useAiStore.getState();
            expect(finalState.isLoadingAiResponse).toBe(false);
            // aiError in store should reflect the initial auth problem, 
            // as the navigation error happens outside the store's direct error handling for aiError field.
            expect(finalState.aiError).toBe(authError.message); 
            expect(mockNavigateWithError).toHaveBeenCalled(); 
            
            const tempChatId = Object.keys(finalState.messagesByChatId).find(id => id.startsWith('temp-chat-'));
            if (tempChatId) {
                 expect(finalState.messagesByChatId[tempChatId]?.length || 0).toBe(0);
            }
        });
    }); // End Anonymous describe

}); // End describe for aiStore - sendMessage
