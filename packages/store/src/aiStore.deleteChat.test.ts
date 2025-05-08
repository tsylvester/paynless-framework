import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore, type AiState } from './aiStore';
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import { User, Session, ChatMessage, Chat } from '@paynless/types';
import { useAuthStore } from './authStore';
// import { useAnalyticsStore } from './analyticsStore'; // Commented out for now

// --- Mocks ---
const mockDeleteChatApi = vi.fn();
// const mockTrackEvent = vi.fn(); // Commented out

vi.mock('@paynless/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actual,
        api: {
            ...actual.api,
            ai: () => ({
                // Ensure other AI methods are mocked if accidentally called, though not expected for deleteChat
                getAiProviders: vi.fn(),
                getSystemPrompts: vi.fn(),
                sendChatMessage: vi.fn(),
                getChatHistory: vi.fn(),
                getChatMessages: vi.fn(),
                deleteChat: mockDeleteChatApi, // Key mock for this file
            }),
            auth: () => ({}),
            billing: () => ({}),
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
        initializeApiClient: vi.fn(),
    };
});

vi.mock('./authStore');
// vi.mock('./analyticsStore'); // Commented out

// --- Test State Setup ---
const mockUser: User = { id: 'user-delete-test', email: 'delete@test.com', created_at: 't', updated_at: 't', role: 'user' };
const mockSession: Session = { access_token: 'valid-token-delete', refresh_token: 'r', expiresAt: Date.now() / 1000 + 3600 };
const mockNavigateGlobal = vi.fn();

const initialTestDeleteChatState: AiState = {
    availableProviders: [],
    availablePrompts: [],
    messagesByChatId: {},
    chatsByContext: { personal: [], orgs: {} },
    currentChatId: null,
    isLoadingAiResponse: false,
    isConfigLoading: false,
    isLoadingHistoryByContext: { personal: false, orgs: {} },
    isDetailsLoading: false,
    newChatContext: null,
    rewindTargetMessageId: null,
    aiError: null,
};

const resetAiStore = (initialOverrides: Partial<AiState> = {}) => {
    useAiStore.setState({ ...initialTestDeleteChatState, ...initialOverrides }, false); // Merge state
};


describe('aiStore - deleteChat action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();

        // Mock AuthStore
        if (vi.isMockFunction(useAuthStore)) {
            vi.mocked(useAuthStore.getState).mockReturnValue({
                user: mockUser,
                session: mockSession,
                navigate: mockNavigateGlobal,
            } as any);
        }
        // Mock AnalyticsStore - REMOVED Block
        // if (vi.isMockFunction(useAnalyticsStore)) {
        //     vi.mocked(useAnalyticsStore.getState).mockReturnValue({
        //         trackEvent: mockTrackEvent,
        //     } as any);
        // }
        
        act(() => {
            resetAiStore();
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // --- Test Cases ---

    it('should successfully delete a personal chat and remove its data', async () => {
        // Arrange
        const personalChatId = 'personal-chat-to-delete';
        const otherPersonalChatId = 'other-personal-chat';
        const mockPersonalChat: Chat = { id: personalChatId, title: 'Personal Chat', created_at: 't1', updated_at: 't1', user_id: mockUser.id, organization_id: null, system_prompt_id: null };
        const mockOtherPersonalChat: Chat = { id: otherPersonalChatId, title: 'Another Personal Chat', created_at: 't2', updated_at: 't2', user_id: mockUser.id, organization_id: null, system_prompt_id: null };
        
        // Corrected ChatMessage mocks
        const mockMessages: ChatMessage[] = [
            { id: 'm1', chat_id: personalChatId, role: 'user', content: 'Hello', created_at: 't1', ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, is_active_in_thread: true },
            { id: 'm2', chat_id: personalChatId, role: 'assistant', content: 'Hi', created_at: 't2', ai_provider_id: 'p1', system_prompt_id: null, token_usage: {total_tokens: 10}, user_id: null, is_active_in_thread: true },
        ];
        const mockOtherMessages: ChatMessage[] = [
            { id: 'm3', chat_id: otherPersonalChatId, role: 'user', content: 'Test', created_at: 't3', ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, is_active_in_thread: true },
        ];

        act(() => {
            resetAiStore({
                chatsByContext: {
                    personal: [mockPersonalChat, mockOtherPersonalChat],
                    orgs: {}
                },
                messagesByChatId: {
                    [personalChatId]: mockMessages,
                    [otherPersonalChatId]: mockOtherMessages,
                },
                currentChatId: otherPersonalChatId, // Ensure deleted chat is not the active one for this test
                aiError: null,
            });
        });

        mockDeleteChatApi.mockResolvedValue({ data: { success: true }, status: 200, error: null });

        // Act
        await act(async () => {
            await useAiStore.getState().deleteChat(personalChatId, null); // null for organizationId for personal chat
        });

        // Assert
        expect(mockDeleteChatApi).toHaveBeenCalledTimes(1);
        expect(mockDeleteChatApi).toHaveBeenCalledWith(personalChatId, mockSession.access_token, null);

        const finalState = useAiStore.getState();
        expect(finalState.chatsByContext.personal.find(c => c.id === personalChatId)).toBeUndefined();
        expect(finalState.chatsByContext.personal.length).toBe(1); // mockOtherPersonalChat should remain
        expect(finalState.chatsByContext.personal[0].id).toBe(otherPersonalChatId);
        expect(finalState.messagesByChatId[personalChatId]).toBeUndefined();
        expect(finalState.messagesByChatId[otherPersonalChatId]).toEqual(mockOtherMessages); // Other messages remain
        expect(finalState.aiError).toBeNull();
        expect(finalState.currentChatId).toBe(otherPersonalChatId); // currentChatId should not change

        // TODO: Uncomment and verify when useAnalyticsStore mock is fully functional for trackEvent
        // expect(mockTrackEvent).toHaveBeenCalledWith('chat_deleted', {
        //     chat_id: personalChatId,
        //     organization_id: null,
        //     // context_type: 'personal' // or similar if we add more details
        // });
    });

    it('should successfully delete an organization chat and remove its data', async () => {
        // Arrange
        const orgId = 'org-to-delete-from';
        const orgChatId = 'org-chat-to-delete';
        const otherOrgChatId = 'other-org-chat';
        const mockOrgChat: Chat = { id: orgChatId, title: 'Org Chat', created_at: 't1', updated_at: 't1', user_id: mockUser.id, organization_id: orgId, system_prompt_id: null };
        const mockOtherOrgChat: Chat = { id: otherOrgChatId, title: 'Another Org Chat', created_at: 't2', updated_at: 't2', user_id: mockUser.id, organization_id: orgId, system_prompt_id: null };
        const mockMessages: ChatMessage[] = [
            { id: 'm1-org', chat_id: orgChatId, role: 'user', content: 'Hello Org', created_at: 't1', ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, is_active_in_thread: true },
        ];
        const mockOtherMessages: ChatMessage[] = [
            { id: 'm2-org', chat_id: otherOrgChatId, role: 'user', content: 'Test Org', created_at: 't2', ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, is_active_in_thread: true },
        ];

        act(() => {
            resetAiStore({
                chatsByContext: {
                    personal: [],
                    orgs: { [orgId]: [mockOrgChat, mockOtherOrgChat] }
                },
                messagesByChatId: {
                    [orgChatId]: mockMessages,
                    [otherOrgChatId]: mockOtherMessages,
                },
                currentChatId: otherOrgChatId, // Ensure deleted chat is not the active one
                aiError: null,
            });
        });

        mockDeleteChatApi.mockResolvedValue({ data: { success: true }, status: 200, error: null });

        // Act
        await act(async () => {
            await useAiStore.getState().deleteChat(orgChatId, orgId); // Call directly
        });

        // Assert
        expect(mockDeleteChatApi).toHaveBeenCalledTimes(1);
        expect(mockDeleteChatApi).toHaveBeenCalledWith(orgChatId, mockSession.access_token, orgId);

        const finalState = useAiStore.getState();
        expect(finalState.chatsByContext.orgs[orgId]?.find(c => c.id === orgChatId)).toBeUndefined();
        expect(finalState.chatsByContext.orgs[orgId]?.length).toBe(1);
        expect(finalState.chatsByContext.orgs[orgId]?.[0].id).toBe(otherOrgChatId);
        expect(finalState.messagesByChatId[orgChatId]).toBeUndefined();
        expect(finalState.messagesByChatId[otherOrgChatId]).toEqual(mockOtherMessages);
        expect(finalState.aiError).toBeNull();
        expect(finalState.currentChatId).toBe(otherOrgChatId);

        // TODO: Analytics check
        // expect(mockTrackEvent).toHaveBeenCalledWith('chat_deleted', {
        //     chat_id: orgChatId,
        //     organization_id: orgId,
        //     // context_type: 'organization'
        // });
    });

    it('should call startNewChat(null) if the deleted chat was the currentChatId', async () => {
        // Arrange
        const personalChatIdToDelete = 'active-personal-chat-to-delete';
        const mockPersonalChat: Chat = { id: personalChatIdToDelete, title: 'Active Personal Chat', created_at: 't1', updated_at: 't1', user_id: mockUser.id, organization_id: null, system_prompt_id: null };
        const mockMessages: ChatMessage[] = [
            { id: 'm1-active', chat_id: personalChatIdToDelete, role: 'user', content: 'Active Hello', created_at: 't1', ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, is_active_in_thread: true },
        ];

        // Spy on startNewChat *before* setting initial state or running the action
        const startNewChatSpy = vi.spyOn(useAiStore.getState(), 'startNewChat');

        act(() => {
            resetAiStore({
                chatsByContext: {
                    personal: [mockPersonalChat],
                    orgs: {}
                },
                messagesByChatId: {
                    [personalChatIdToDelete]: mockMessages,
                },
                currentChatId: personalChatIdToDelete, // Set this chat as active
                aiError: null,
            });
        });

        mockDeleteChatApi.mockResolvedValue({ data: { success: true }, status: 200, error: null });

        // Act
        await act(async () => {
            await useAiStore.getState().deleteChat(personalChatIdToDelete, null);
        });

        // Assert
        expect(mockDeleteChatApi).toHaveBeenCalledTimes(1);
        expect(mockDeleteChatApi).toHaveBeenCalledWith(personalChatIdToDelete, mockSession.access_token, null);

        const finalState = useAiStore.getState();
        expect(finalState.chatsByContext.personal.length).toBe(0);
        expect(finalState.messagesByChatId[personalChatIdToDelete]).toBeUndefined();
        expect(finalState.aiError).toBeNull();
        
        // Check if startNewChat was called (it resets currentChatId and potentially newChatContext)
        expect(startNewChatSpy).toHaveBeenCalledTimes(1);
        expect(startNewChatSpy).toHaveBeenCalledWith(null); // Expect it to reset to personal context
        expect(finalState.currentChatId).toBeNull(); // Verify currentChatId is null after startNewChat call

        startNewChatSpy.mockRestore(); // Clean up spy
    });
    
    it('should handle API error during chat deletion and preserve chat data', async () => {
        // Arrange
        const personalChatId = 'personal-chat-fail-delete';
        const mockPersonalChat: Chat = { id: personalChatId, title: 'Personal Chat Fail', created_at: 't1', updated_at: 't1', user_id: mockUser.id, organization_id: null, system_prompt_id: null };
        const mockMessages: ChatMessage[] = [
            { id: 'm1-fail', chat_id: personalChatId, role: 'user', content: 'Hello Fail', created_at: 't1', ai_provider_id: null, system_prompt_id: null, token_usage: null, user_id: mockUser.id, is_active_in_thread: true },
        ];
        const initialChatsByContext = {
            personal: [mockPersonalChat],
            orgs: {}
        };
        const initialMessagesByChatId = {
            [personalChatId]: mockMessages,
        };
        
        act(() => {
            resetAiStore({
                chatsByContext: { ...initialChatsByContext, personal: [...initialChatsByContext.personal] }, // Deep copy for safety
                messagesByChatId: { ...initialMessagesByChatId }, // Shallow copy ok here
                currentChatId: null, // Not the active chat for this test
                aiError: null,
            });
        });

        const errorMsg = "Failed to delete from API";
        mockDeleteChatApi.mockResolvedValue({ data: null, status: 500, error: { message: errorMsg } });
        // OR mockDeleteChatApi.mockRejectedValue(new Error(errorMsg)); // Depending on API client behavior

        // Act
        await act(async () => {
            await useAiStore.getState().deleteChat(personalChatId, null);
        });

        // Assert
        expect(mockDeleteChatApi).toHaveBeenCalledTimes(1);
        expect(mockDeleteChatApi).toHaveBeenCalledWith(personalChatId, mockSession.access_token, null);

        const finalState = useAiStore.getState();
        // Verify state is unchanged
        expect(finalState.chatsByContext).toEqual(initialChatsByContext);
        expect(finalState.messagesByChatId).toEqual(initialMessagesByChatId);
        expect(finalState.aiError).toBe(errorMsg); // Check error state
        expect(finalState.currentChatId).toBeNull(); // Should remain unchanged

        // TODO: Verify analytics event NOT triggered
        // expect(mockTrackEvent).not.toHaveBeenCalled();
    });
    
    // Potential additional tests:
    // - Deleting a chat that doesn't exist (should it error or fail silently?)
    // - AuthRequiredError handling (if applicable, though delete might be simpler)

}); 