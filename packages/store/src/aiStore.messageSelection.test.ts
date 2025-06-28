import { vi } from 'vitest';

// REMOVE individual hoisted mocks for IAiApiClient methods
// const mockGetAiProviders = vi.fn(); // REMOVED
// const mockGetSystemPrompts = vi.fn(); // REMOVED
// const mockSendChatMessage = vi.fn(); // REMOVED
// const mockGetChatHistory = vi.fn(); // REMOVED
// const mockGetChatWithMessages = vi.fn(); // REMOVED
// const mockDeleteChat = vi.fn(); // REMOVED

// Keep these if they are for a different API structure (e.g., api.users().getProfile)
const mockUsersGetProfile = vi.fn();
const mockApiPost = vi.fn();

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore'; // Assuming initialAiStateValues includes selectedMessagesMap: {}
import { act } from '@testing-library/react';
import type { ChatMessage, AiState, User, ChatHandlerSuccessResponse, ChatApiRequest, Chat } from '@paynless/types';
import { useAuthStore } from './authStore'; // Assuming useAuthStore is imported
// We might not need createMockAiApiClient directly if all mocking is through the hoisted functions
// import { createMockAiApiClient, type MockedAiApiClient } from '@paynless/api/mocks';
import type { MockedAiApiClient } from '@paynless/api/mocks';

// Module-scoped variables to hold the mock instances/functions retrieved from the mocked module
let testMockAiApiClient: MockedAiApiClient;
let testMockUsersGetProfile: ReturnType<typeof vi.fn>;
let testMockApiPost: ReturnType<typeof vi.fn>;

vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    
    // Dynamically import the mock creator and other utilities from '@paynless/api/mocks'
    // This ensures that these mock utilities are imported cleanly within the factory's scope.
    const { createMockAiApiClient: actualMockClientCreator } = await import('@paynless/api/mocks');
    
    const instance = actualMockClientCreator();
    const usersGetProfileFn = vi.fn();
    const apiPostFn = vi.fn();

    // This structure needs to match what the aiStore.ts expects when it calls api.ai(), api.users(), etc.
    return {
        ...actualApiModule, // Spread other exports from the original module if any are used directly by the store
        
        // Export the instances so tests can retrieve and configure them
        __testMockAiApiClient: instance,
        __testMockUsersGetProfile: usersGetProfileFn,
        __testMockApiPost: apiPostFn,
        
        // This is the primary way the store will access the mocked API parts
        api: {
            ...actualApiModule.api, // Spread other parts of the original api object if they exist and are used
            ai: () => instance,
            users: () => ({
                ...actualApiModule.api.users(), // Spread original users methods if any
                getProfile: usersGetProfileFn,
            }),
            post: apiPostFn,
        },
    };
});

// Helper to reset AiStore to initial state with optional overrides
const resetAiStore = (initialOverrides: Partial<AiState> = {}) => {
    // Ensure selectedMessagesMap and messagesByChatId are reset if not specifically overridden
    // and other initialAiStateValues are also applied.
    useAiStore.setState(
        {
            ...initialAiStateValues, // Apply all initial values first
            selectedMessagesMap: {},
            messagesByChatId: {},
            ...initialOverrides, // Then apply any specific overrides for the test
        },
        // false, or simply omit, to merge rather than replace
    );
};

// Mock ChatMessage data for tests
const mockMessage = (
    chatId: string,
    id: string,
    content = 'Test message',
    role: 'user' | 'assistant' = 'user', // Added role parameter
    userId = 'test-user' // Added userId parameter
): ChatMessage => ({
    id,
    chat_id: chatId,
    role,
    content,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: userId,
    ai_provider_id: null,
    system_prompt_id: null,
    token_usage: null,
    is_active_in_thread: true,
});

describe('aiStore - Message Selection Actions', () => {
    beforeEach(async () => {
        // Retrieve the exported mock instances/functions from the mocked '@paynless/api' module
        const mockedApiModule = await import('@paynless/api') as any;
        testMockAiApiClient = mockedApiModule.__testMockAiApiClient;
        testMockUsersGetProfile = mockedApiModule.__testMockUsersGetProfile;
        testMockApiPost = mockedApiModule.__testMockApiPost;

        // Clear all mocks
        vi.clearAllMocks(); // Clears call history, etc., for vi.fn()
        
        // If resetMockAiApiClient is available and applicable for the instance type
        // from createMockAiApiClient, use it. Otherwise, clear individual methods.
        // For example, if testMockAiApiClient has methods like sendChatMessage as vi.fn():
        if (testMockAiApiClient && typeof testMockAiApiClient.sendChatMessage?.mockClear === 'function') {
            testMockAiApiClient.sendChatMessage.mockClear();
        }
        if (testMockAiApiClient && typeof testMockAiApiClient.getChatWithMessages?.mockClear === 'function') {
            testMockAiApiClient.getChatWithMessages.mockClear();
        }
        // Add .mockClear() for other methods on testMockAiApiClient as needed by tests

        if (testMockUsersGetProfile && typeof testMockUsersGetProfile.mockClear === 'function') {
            testMockUsersGetProfile.mockClear();
        }
        if (testMockApiPost && typeof testMockApiPost.mockClear === 'function') {
            testMockApiPost.mockClear();
        }

        act(() => {
            resetAiStore();
            // Mocking useAuthStore's state for currentUser consistently
            useAuthStore.setState({ 
                user: { id: 'user-123', email: 'test@example.com', role: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as User, 
                session: { access_token: 'mock-token' } as any, 
                profile: {} as any 
            });
        });
    });

    afterEach(() => {
        vi.restoreAllMocks(); // Restores original implementations if any were spied on, good practice
    });

    describe('toggleMessageSelection', () => {
        const chatId1 = 'chat1';
        const messageId1 = 'msg1';
        const messageId2 = 'msg2';

        it('should add message to selectedMessagesMap with true if not present', () => {
            // RED: This test should initially fail until toggleMessageSelection is implemented
            act(() => {
                useAiStore.getState().toggleMessageSelection(chatId1, messageId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]?.[messageId1]).toBe(true); // Plan: "Defaults to true if the message isn't in the map."
        });

        it('should set an existing true message to false', () => {
            act(() => {
                // Initial state: msg1 is selected (true)
                useAiStore.setState({
                    selectedMessagesMap: { [chatId1]: { [messageId1]: true } },
                });
                useAiStore.getState().toggleMessageSelection(chatId1, messageId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]?.[messageId1]).toBe(false);
             // RED: This test should initially fail
        });

        it('should set an existing false message to true', () => {
            act(() => {
                 // Initial state: msg1 is not selected (false)
                useAiStore.setState({
                    selectedMessagesMap: { [chatId1]: { [messageId1]: false } },
                });
                useAiStore.getState().toggleMessageSelection(chatId1, messageId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]?.[messageId1]).toBe(true);
            // RED: This test should initially fail
        });

        it('should correctly toggle multiple messages in the same chat', () => {
            act(() => {
                useAiStore.getState().toggleMessageSelection(chatId1, messageId1); // msg1: true
                useAiStore.getState().toggleMessageSelection(chatId1, messageId2); // msg2: true
                useAiStore.getState().toggleMessageSelection(chatId1, messageId1); // msg1: false
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]?.[messageId1]).toBe(false);
            expect(selectedMessagesMap[chatId1]?.[messageId2]).toBe(true);
            // RED: This test should initially fail
        });

        it('should not affect selections in other chats', () => {
            const chatId2 = 'chat2';
            act(() => {
                useAiStore.getState().toggleMessageSelection(chatId1, messageId1); // chat1/msg1: true
                useAiStore.getState().toggleMessageSelection(chatId2, messageId1); // chat2/msg1: true (note: same message ID, different chat)
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]?.[messageId1]).toBe(true);
            expect(selectedMessagesMap[chatId2]?.[messageId1]).toBe(true);

            act(() => {
                useAiStore.getState().toggleMessageSelection(chatId1, messageId1); // chat1/msg1: false
            });
            const finalMap = useAiStore.getState().selectedMessagesMap;
            expect(finalMap[chatId1]?.[messageId1]).toBe(false);
            expect(finalMap[chatId2]?.[messageId1]).toBe(true); // Should remain unchanged
            // RED: This test should initially fail
        });
    });

    describe('selectAllMessages', () => {
        const chatId1 = 'chat1';
        const msg1 = mockMessage(chatId1, 'm1');
        const msg2 = mockMessage(chatId1, 'm2');
        const msg3 = mockMessage(chatId1, 'm3');

        it('should select all messages for a given chat if messages exist', () => {
            act(() => {
                // Setup initial state with messages and some pre-existing selections
                useAiStore.setState({
                    messagesByChatId: { [chatId1]: [msg1, msg2, msg3] },
                    selectedMessagesMap: { [chatId1]: { [msg1.id]: false, [msg2.id]: true } } // m1 deselected, m2 selected
                });
                useAiStore.getState().selectAllMessages(chatId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]?.[msg1.id]).toBe(true);
            expect(selectedMessagesMap[chatId1]?.[msg2.id]).toBe(true);
            expect(selectedMessagesMap[chatId1]?.[msg3.id]).toBe(true);
            // RED: This test should initially fail
        });

        it('should result in an empty selection map for the chat if no messages exist in messagesByChatId', () => {
            act(() => {
                 // Setup: chat1 has no messages in messagesByChatId, but might have old selections
                useAiStore.setState({
                    messagesByChatId: { }, // No messages for chatId1
                    selectedMessagesMap: { [chatId1]: { ['oldMsg']: true } }
                });
                useAiStore.getState().selectAllMessages(chatId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]).toEqual({}); // All old selections for this chat should be cleared, resulting in empty map
            // RED: This test should initially fail
        });

        it('should overwrite previous selections for the chat', () => {
            act(() => {
                useAiStore.setState({
                    messagesByChatId: { [chatId1]: [msg1] },
                    selectedMessagesMap: { [chatId1]: { [msg1.id]: false, ['otherMsg']: true } }
                });
                useAiStore.getState().selectAllMessages(chatId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]).toEqual({ [msg1.id]: true }); // only msg1 should be true, otherMsg gone
            // RED: This test should initially fail
        });
    });

    describe('deselectAllMessages', () => {
        const chatId1 = 'chat1';
        const msg1 = mockMessage(chatId1, 'm1');
        const msg2 = mockMessage(chatId1, 'm2');

        it('should deselect all messages for a given chat', () => {
            act(() => {
                useAiStore.setState({
                    messagesByChatId: { [chatId1]: [msg1, msg2] },
                    selectedMessagesMap: { [chatId1]: { [msg1.id]: true, [msg2.id]: true } }
                });
                useAiStore.getState().deselectAllMessages(chatId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]?.[msg1.id]).toBe(false);
            expect(selectedMessagesMap[chatId1]?.[msg2.id]).toBe(false);
            // RED: This test should initially fail
        });

        it('should result in an empty selection map (all false) for the chat if no messages exist in messagesByChatId', () => {
             act(() => {
                useAiStore.setState({
                    messagesByChatId: { },
                    selectedMessagesMap: { [chatId1]: { ['oldMsg']: true } }
                });
                useAiStore.getState().deselectAllMessages(chatId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]).toEqual({});
            // RED: This test should initially fail
        });


        it('should overwrite previous selections making them all false', () => {
            act(() => {
                useAiStore.setState({
                    messagesByChatId: { [chatId1]: [msg1] },
                    selectedMessagesMap: { [chatId1]: { [msg1.id]: true, ['otherMsg']: true } } // otherMsg selected
                });
                useAiStore.getState().deselectAllMessages(chatId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]).toEqual({ [msg1.id]: false }); // msg1 is false, otherMsg is gone
                                                                                // as deselectAll only considers messages in messagesByChatId
            // RED: This test should initially fail
        });
    });

    describe('clearMessageSelections', () => {
        const chatId1 = 'chat1';
        const chatId2 = 'chat2';
        const messageId1 = 'msg1';

        it('should remove the entry for a given chatId from selectedMessagesMap', () => {
            act(() => {
                useAiStore.setState({
                    selectedMessagesMap: {
                        [chatId1]: { [messageId1]: true },
                        [chatId2]: { [messageId1]: true }
                    }
                });
                useAiStore.getState().clearMessageSelections(chatId1);
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]).toBeUndefined();
            expect(selectedMessagesMap[chatId2]).toBeDefined(); // Other chat unaffected
            // RED: This test should initially fail
        });

        it('should not error if the chatId does not exist in selectedMessagesMap', () => {
            act(() => {
                useAiStore.setState({ selectedMessagesMap: { [chatId2]: { [messageId1]: true } } });
                // No expect an error, just that the call completes and state is as expected
                useAiStore.getState().clearMessageSelections(chatId1); // chatId1 doesn't exist
            });
            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[chatId1]).toBeUndefined();
            expect(selectedMessagesMap[chatId2]).toEqual({ [messageId1]: true }); // Unchanged
            // RED: This test should initially fail
        });
    });

    describe('_addOptimisticUserMessage', () => {
        const userId = 'user-123';
        const optimisticMessageContent = 'Hello, AI!';
        const existingChatId = 'existing-chat-001';
        const anotherChatId = 'another-chat-002';

        beforeEach(() => {
            act(() => {
                // Reset AiStore state
                resetAiStore({
                    currentChatId: existingChatId,
                    messagesByChatId: {
                        [existingChatId]: [mockMessage(existingChatId, 'msg-existing-1')],
                        [anotherChatId]: [mockMessage(anotherChatId, 'msg-another-1')],
                    },
                    selectedMessagesMap: {
                        [existingChatId]: { 'msg-existing-1': true },
                        [anotherChatId]: { 'msg-another-1': false },
                    },
                });
                // Set user in AuthStore as _addOptimisticUserMessage might use it for temp ID generation
                useAuthStore.setState({ 
                    user: { 
                        id: userId, 
                        email: 'test@example.com', 
                        role: 'user', // Assuming 'user' is a valid UserRole
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    } 
                });
            });
        });

        it('should select the new optimistic message when added to a new temporary chat', () => {
            act(() => {
                // Simulate starting a new chat (currentChatId is null or a temp id will be generated)
                useAiStore.setState({ currentChatId: null, newChatContext: 'personal' });
                (useAiStore.getState() as any)._addOptimisticUserMessage(optimisticMessageContent);
            });
            const state = useAiStore.getState();
            const tempChatId = Object.keys(state.messagesByChatId).find(id => id.startsWith('temp-chat-user-'));
            expect(tempChatId).toBeDefined();
            if (!tempChatId) return; // Guard for type checker

            const optimisticMessage = state.messagesByChatId[tempChatId]?.find(m => m.content === optimisticMessageContent);
            expect(optimisticMessage).toBeDefined();
            if (!optimisticMessage) return; // Guard

            expect(state.selectedMessagesMap[tempChatId]?.[optimisticMessage.id]).toBe(true);
             // RED: This test should initially fail until _addOptimisticUserMessage is updated
        });

        it('should select the new optimistic message when added to an existing chat', () => {
            act(() => {
                (useAiStore.getState() as any)._addOptimisticUserMessage(optimisticMessageContent);
            });
            const state = useAiStore.getState();
            const optimisticMessage = state.messagesByChatId[existingChatId]?.find(m => m.content === optimisticMessageContent);
            expect(optimisticMessage).toBeDefined();
            if (!optimisticMessage) return; // Guard

            expect(state.selectedMessagesMap[existingChatId]?.[optimisticMessage.id]).toBe(true);
            // RED: This test should initially fail
        });

        it('should not affect selections in other chats when adding an optimistic message', () => {
            act(() => {
                (useAiStore.getState() as any)._addOptimisticUserMessage(optimisticMessageContent); // Adds to existingChatId
            });
            const state = useAiStore.getState();
            // Verify selection in anotherChatId remains unchanged
            expect(state.selectedMessagesMap[anotherChatId]?.['msg-another-1']).toBe(false);
             // RED: This test should fail if _addOptimisticUserMessage incorrectly modifies other chats
        });

        it('should handle an empty or undefined initial selectedMessagesMap for the chat (implicitly creating it)', () => {
            act(() => {
                // Reset selectedMessagesMap for existingChatId to be undefined or empty
                resetAiStore({
                    currentChatId: existingChatId,
                    messagesByChatId: {
                        [existingChatId]: [mockMessage(existingChatId, 'msg-existing-1')]
                    },
                    selectedMessagesMap: {},
                    // currentUser is set in beforeEach via useAuthStore.setState
                });
                (useAiStore.getState() as any)._addOptimisticUserMessage(optimisticMessageContent);
            });
            const state = useAiStore.getState();
            const optimisticMessage = state.messagesByChatId[existingChatId]?.find(m => m.content === optimisticMessageContent);
            expect(optimisticMessage).toBeDefined();
            if (!optimisticMessage) return; // Guard

            expect(state.selectedMessagesMap[existingChatId]?.[optimisticMessage.id]).toBe(true);
            // RED: This test should fail if selectedMessagesMap for the chat isn't initialized correctly
        });
    });

    // +++ New Test Suite for sendMessage +++
    describe('sendMessage action interactions with selectedMessagesMap', () => {
        const mockCurrentUser: User = {
            id: 'user-123',
            email: 'test@example.com',
            // Ensure all required fields for User are present
            role: 'user', 
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Add any other mandatory fields from the User type if they exist
        };
        const optimisticMessageContent = 'Hello, this is a test message.';
        const finalUserMessageId = 'final-user-msg-id';
        const assistantMessageId = 'assistant-msg-id';
        const mockProviderId = 'test-provider';
        const mockPromptId = 'test-prompt';

        beforeEach(() => {
            act(() => {
                resetAiStore({
                    // Ensure a provider and prompt are selected for sendMessage tests
                    selectedProviderId: mockProviderId,
                    selectedPromptId: mockPromptId,
                });
                useAuthStore.setState({ user: mockCurrentUser, session: { access_token: 'mock-token' } as any, profile: {} } as any);
            });
            
            // Clear mocks before each test to ensure isolation
            // For methods on testMockAiApiClient (retrieved from the vi.mock factory):
            if (testMockAiApiClient?.sendChatMessage) testMockAiApiClient.sendChatMessage.mockClear();
            if (testMockAiApiClient?.getChatWithMessages) testMockAiApiClient.getChatWithMessages.mockClear();
            if (testMockAiApiClient?.getAiProviders) testMockAiApiClient.getAiProviders.mockClear();
            if (testMockAiApiClient?.getSystemPrompts) testMockAiApiClient.getSystemPrompts.mockClear();
            if (testMockAiApiClient?.getChatHistory) testMockAiApiClient.getChatHistory.mockClear();
            if (testMockAiApiClient?.deleteChat) testMockAiApiClient.deleteChat.mockClear();

            // For other hoisted/retrieved mocks:
            if (testMockUsersGetProfile) testMockUsersGetProfile.mockClear();
            if (testMockApiPost) testMockApiPost.mockClear();
        });

        it('should add confirmed user and assistant messages to selectedMessagesMap with true for a new chat, and clean up temp chat ID selections', async () => {
            const tempChatId = `temp-chat-user-${mockCurrentUser.id}-12345`;
            const actualChatId = 'confirmed-chat-id-new';
            const optimisticTempId = 'temp-optimistic-id-1';

            act(() => {
                resetAiStore({
                    currentChatId: tempChatId,
                    messagesByChatId: {
                        [tempChatId]: [mockMessage(tempChatId, optimisticTempId, optimisticMessageContent, 'user', mockCurrentUser.id)],
                    },
                    selectedMessagesMap: {
                        [tempChatId]: { [optimisticTempId]: true },
                    },
                    selectedProviderId: mockProviderId,
                    selectedPromptId: mockPromptId,
                });
            });

            const finalUserMsg = mockMessage(actualChatId, finalUserMessageId, optimisticMessageContent, 'user', mockCurrentUser.id);
            const assistantMsg = mockMessage(actualChatId, assistantMessageId, 'AI response', 'assistant');

            // This is the structure the store expects in response.data
            const mockChatHandlerResponse: any = { // Temporarily use any to bypass strict type check due to IAiApiClient vs store discrepancy
                chatId: actualChatId, // This field is not in the formal ChatHandlerSuccessResponse type
                userMessage: finalUserMsg,
                assistantMessage: assistantMsg,
                originalTempId: optimisticTempId, // This field is not in the formal ChatHandlerSuccessResponse type
                tempUserMessageId: optimisticTempId,  // This field is not in the formal ChatHandlerSuccessResponse type
                finalUserMessageId: finalUserMsg.id, // This field is not in the formal ChatHandlerSuccessResponse type
                assistantMessageId: assistantMsg.id, // This field is not in the formal ChatHandlerSuccessResponse type
                isRewind: false, // ADDED: To match ChatHandlerSuccessResponse more closely
            };

            // Use the hoisted mock function
            testMockAiApiClient.sendChatMessage.mockResolvedValueOnce({
                data: mockChatHandlerResponse,
                error: undefined,
                status: 200
            });
            
            await act(async () => {
                await useAiStore.getState().sendMessage({ // CORRECTED: Pass single object argument
                    message: optimisticMessageContent, 
                    chatId: null, 
                    providerId: mockProviderId, 
                    promptId: mockPromptId 
                });
            });

            const { selectedMessagesMap, messagesByChatId } = useAiStore.getState();
            
            expect(selectedMessagesMap[actualChatId]?.[finalUserMessageId]).toBe(true);
            expect(selectedMessagesMap[actualChatId]?.[assistantMessageId]).toBe(true);
            expect(selectedMessagesMap[tempChatId]).toBeUndefined();
            expect(messagesByChatId[tempChatId]).toBeUndefined();
        });

        it('should add confirmed user and assistant messages to selectedMessagesMap with true for an existing chat', async () => {
            const existingChatId = 'existing-chat-001';
            const existingMsgId = 'existing-msg-prev';

            act(() => {
                resetAiStore({
                    currentChatId: existingChatId,
                    messagesByChatId: {
                        [existingChatId]: [
                            mockMessage(existingChatId, existingMsgId, 'Previous message', 'user', mockCurrentUser.id)
                        ],
                    },
                    selectedMessagesMap: {
                        [existingChatId]: { [existingMsgId]: false }, 
                    },
                    selectedProviderId: mockProviderId,
                    selectedPromptId: mockPromptId,
                });
            });
            
            const finalUserMsg = mockMessage(existingChatId, finalUserMessageId, optimisticMessageContent, 'user', mockCurrentUser.id);
            const assistantMsg = mockMessage(existingChatId, assistantMessageId, 'AI response to existing', 'assistant');

            let tempOptimisticDetails: { tempId: string; chatIdUsed: string; createdTimestamp: string };
            act(() => {
                // Call _addOptimisticUserMessage using the correct way to access AiStore methods
                // Ensure _addOptimisticUserMessage is available on the store instance if it's intended to be callable this way
                 tempOptimisticDetails = useAiStore.getState()._addOptimisticUserMessage(optimisticMessageContent, existingChatId);
                
                // Resetting isSending and pendingAction directly after optimistic add, 
                // if this is part of the test setup logic before sendMessage is called.
                // This might be better handled by ensuring the initial state for the test is correct
                // or by asserting on these values if they are part of what sendMessage should modify.
                useAiStore.setState(state => {
                    const newSelectedMap = { ...state.selectedMessagesMap };
                    if (newSelectedMap[tempOptimisticDetails.chatIdUsed]) {
                        newSelectedMap[tempOptimisticDetails.chatIdUsed] = {
                            ...newSelectedMap[tempOptimisticDetails.chatIdUsed],
                            [tempOptimisticDetails.tempId]: false, 
                        };
                    }
                    return {
                        selectedMessagesMap: newSelectedMap,
                        // isLoadingAiResponse: false, // sendMessage will set this to true, then false on completion/error
                        // aiError: null,          // sendMessage might set this on error
                    };
                });
            });
            
            // This is the structure the store expects in response.data
            const mockChatHandlerResponseExistingChat: any = { // Temporarily use any for the same reasons as above
                chatId: existingChatId, 
                userMessage: finalUserMsg,
                assistantMessage: assistantMsg,
                originalTempId: tempOptimisticDetails!.tempId,
                tempUserMessageId: tempOptimisticDetails!.tempId, 
                finalUserMessageId: finalUserMsg.id,
                assistantMessageId: assistantMsg.id,
                isRewind: false, // ADDED: To match ChatHandlerSuccessResponse more closely
            };
            
            // Use the hoisted mock function
            testMockAiApiClient.sendChatMessage.mockResolvedValueOnce({
                data: mockChatHandlerResponseExistingChat,
                error: undefined,
                status: 200
            });

            await act(async () => {
                await useAiStore.getState().sendMessage({ // CORRECTED: Pass single object argument
                    message: optimisticMessageContent, 
                    chatId: existingChatId, 
                    providerId: mockProviderId, 
                    promptId: mockPromptId 
                });
            });

            const { selectedMessagesMap } = useAiStore.getState();
            
            expect(selectedMessagesMap[existingChatId]?.[finalUserMessageId]).toBe(true);
            expect(selectedMessagesMap[existingChatId]?.[assistantMessageId]).toBe(true);
            expect(selectedMessagesMap[existingChatId]?.[existingMsgId]).toBe(false);
        });
    });
    // +++ END New Test Suite for sendMessage +++

    // +++ New Test Suite for loadChatDetails +++
    describe('loadChatDetails action interactions with selectedMessagesMap', () => {
        const mockChatId = 'chat-to-load-001';
        const anotherChatId = 'another-chat-002';

        const msg1 = mockMessage(mockChatId, 'm1', 'Message 1');
        const msg2 = mockMessage(mockChatId, 'm2', 'Message 2');
        const msg3InAnotherChat = mockMessage(anotherChatId, 'm3', 'Other Chat Message');

        beforeEach(() => {
            act(() => {
                resetAiStore({});
                // Ensure auth state is set for tests that might rely on user/token
                useAuthStore.setState({ 
                    user: { id: 'user-for-load', email: 'load@test.com', role: 'user', created_at: 'now', updated_at: 'now' } as User,
                    session: { access_token: 'mock-load-token' } as any,
                    profile: {} as any,
                });
            });
            if (testMockAiApiClient?.getChatWithMessages) testMockAiApiClient.getChatWithMessages.mockClear();
        });

        it('should select all newly loaded messages for the target chat by default', async () => {
            // Mock API response for getChatWithMessages
            testMockAiApiClient.getChatWithMessages.mockResolvedValueOnce({
                data: { chat: { id: mockChatId } as Chat, messages: [msg1, msg2] },
                error: undefined,
                status: 200,
            });

            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[mockChatId]?.[msg1.id]).toBe(true);
            expect(selectedMessagesMap[mockChatId]?.[msg2.id]).toBe(true);
        });

        it('should overwrite previous selections for the target chat, making all loaded messages selected', async () => {
            act(() => {
                resetAiStore({
                    selectedMessagesMap: {
                        [mockChatId]: { [msg1.id]: false, 'old-msg': false }, // msg1 previously deselected
                    },
                });
            });

            testMockAiApiClient.getChatWithMessages.mockResolvedValueOnce({
                data: { chat: { id: mockChatId } as Chat, messages: [msg1, msg2] }, // msg1 is re-loaded
                error: undefined,
                status: 200,
            });

            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[mockChatId]?.[msg1.id]).toBe(true); // Should now be true
            expect(selectedMessagesMap[mockChatId]?.[msg2.id]).toBe(true); // New message, selected
            expect(selectedMessagesMap[mockChatId]?.['old-msg']).toBeUndefined(); // Old message not in load, so its selection state is removed
        });

        it('should not affect selections in other chats', async () => {
            act(() => {
                resetAiStore({
                    selectedMessagesMap: {
                        [anotherChatId]: { [msg3InAnotherChat.id]: false },
                    },
                });
            });

            testMockAiApiClient.getChatWithMessages.mockResolvedValueOnce({
                data: { chat: { id: mockChatId } as Chat, messages: [msg1] },
                error: undefined,
                status: 200,
            });

            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[mockChatId]?.[msg1.id]).toBe(true);
            expect(selectedMessagesMap[anotherChatId]?.[msg3InAnotherChat.id]).toBe(false); // Unchanged
        });

        it('should not modify selectedMessagesMap if loading details fails', async () => {
            const initialSelectedMap = {
                [mockChatId]: { [msg1.id]: false },
                [anotherChatId]: { [msg3InAnotherChat.id]: true },
            };
            act(() => {
                resetAiStore({ selectedMessagesMap: JSON.parse(JSON.stringify(initialSelectedMap)) });
            });

            testMockAiApiClient.getChatWithMessages.mockResolvedValueOnce({
                data: undefined,
                error: { code: 'FETCH_ERROR', message: 'Network error' },
                status: 500,
            });

            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap).toEqual(initialSelectedMap); // Should remain unchanged
        });
    });
    // +++ END New Test Suite for loadChatDetails +++

    // +++ New Test Suite for startNewChat +++
    describe('startNewChat action interactions with selectedMessagesMap', () => {
        const userId = 'user-for-new-chat';
        const existingChatId = 'existing-chat-before-new';
        const existingMessageId = 'msg-in-existing-chat';

        beforeEach(() => {
            act(() => {
                resetAiStore({
                    // Setup a user as new chat ID generation might depend on it
                });
                useAuthStore.setState({ 
                    user: { id: userId, email: 'new@chat.com', role: 'user', created_at: 'now', updated_at: 'now' } as User,
                    session: {} as any, // Mock as needed
                    profile: {} as any, // Mock as needed
                });
            });
        });

        it('should clear selections for a new temporary chat ID if one is created', () => {
            const tempChatIdPattern = new RegExp(`^temp-chat-${userId}-[0-9]+$`);
            act(() => {
                // Pre-populate a selection for a potential temp ID to ensure it gets cleared
                // This scenario is a bit artificial but tests the clearing mechanism.
                // More realistically, a temp chat might exist if a user types, then clicks "New Chat" before sending.
                useAiStore.setState({ 
                    selectedMessagesMap: { 'temp-chat-user-123-random': { 'some-message': true } },
                    newChatContext: 'personal' // Ensure a context is set for new chat creation
                });
                useAiStore.getState().startNewChat(); 
            });

            const { selectedMessagesMap, currentChatId } = useAiStore.getState();
            
            expect(currentChatId).toMatch(tempChatIdPattern);
            if (currentChatId) {
                 // Expect an empty map or undefined for the new temp chat ID, signifying cleared/default state
                expect(selectedMessagesMap[currentChatId]).toEqual({});
            }
            // Ensure the unrelated pre-existing selection is not touched if its ID wasn't the one generated
            if (currentChatId !== 'temp-chat-user-123-random') {
                expect(selectedMessagesMap['temp-chat-user-123-random']).toEqual({ 'some-message': true });
            }
        });

        it('should initialize an empty selection map for the new currentChatId if no prior selections existed for it', () => {
            act(() => {
                resetAiStore({
                    selectedMessagesMap: { // No entry for the upcoming tempId
                        [existingChatId]: { [existingMessageId]: true }
                    },
                    newChatContext: 'personal'
                });
                useAiStore.getState().startNewChat();
            });
            const { selectedMessagesMap, currentChatId } = useAiStore.getState();
            expect(currentChatId).not.toBeNull();
            if (currentChatId) {
                expect(selectedMessagesMap[currentChatId]).toEqual({});
            }
        });

        it('should not affect selections for other existing chat IDs', () => {
            act(() => {
                resetAiStore({
                    selectedMessagesMap: {
                        [existingChatId]: { [existingMessageId]: true },
                    },
                    newChatContext: 'personal'
                });
                useAiStore.getState().startNewChat(); 
            });

            const { selectedMessagesMap } = useAiStore.getState();
            expect(selectedMessagesMap[existingChatId]?.[existingMessageId]).toBe(true);
        });

        it('should set an empty selection map for the new chat ID even if currentChatId was null initially', () => {
            act(() => {
                resetAiStore({ currentChatId: null, newChatContext: 'personal' });
                useAiStore.getState().startNewChat();
            });
            const { selectedMessagesMap, currentChatId } = useAiStore.getState();
            expect(currentChatId).not.toBeNull();
            if (currentChatId) {
                expect(selectedMessagesMap[currentChatId]).toEqual({});
            }
        });
    });
    // +++ END New Test Suite for startNewChat +++
}); 