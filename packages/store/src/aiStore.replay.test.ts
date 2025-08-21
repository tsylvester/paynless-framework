import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore } from './aiStore';
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import type { User, Session, ChatMessage, ChatApiRequest, PendingAction, AiState, AuthStore } from '@paynless/types';
import { AuthRequiredError, initialAiStateValues } from '@paynless/types';
import { useAuthStore } from './authStore';

vi.mock('@paynless/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actual,
        api: {
            ...(actual.api || {}),
            ai: () => ({
                getAiProviders: vi.fn(),
                getSystemPrompts: vi.fn(),
                sendChatMessage: vi.fn(),
                getChatHistory: vi.fn(),
                getChatWithMessages: vi.fn(),
                deleteChat: vi.fn(),
                estimateTokens: vi.fn(),
            }),
            post: vi.fn(),
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            auth: () => ({}),
            billing: () => ({}),
            getFunctionsUrl: vi.fn().mockReturnValue('mock-functions-url'),
        },
        initializeApiClient: vi.fn(),
    };
});

vi.mock('./authStore');

const resetAiStore = () => {
    useAiStore.setState({ ...initialAiStateValues });
};

const mockNavigateGlobal = vi.fn();

// Define a type for ChatMessage that includes the optional status for testing
type TestChatMessage = ChatMessage & { status?: 'sending' | 'sent' | 'error' | 'replay_failed' };

describe('aiStore - checkAndReplayPendingChatAction', () => {
    let postSpy: SpyInstance;

    const mockUser: User = { id: 'user-replay-1', email: 'replay@test.com', created_at: 't', updated_at: 't', role: 'user' };
    const mockSessionExpiresIn = 3600;
    const mockSession: Session = {
        access_token: 'replay-token',
        refresh_token: 'rt',
        expires_in: mockSessionExpiresIn,
        token_type: 'bearer',
        expiresAt: Math.floor(Date.now() / 1000) + mockSessionExpiresIn,
    };
    const pendingActionBody: ChatApiRequest = {
        message: 'Hello from pending',
        providerId: 'p1',
        promptId: 's1',
        chatId: 'chat-pending-123',
    };
    const pendingActionStoreFormat: PendingAction<ChatApiRequest> = {
        endpoint: 'chat',
        method: 'POST',
        body: pendingActionBody,
        returnPath: 'chat',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        localStorage.clear();

        postSpy = vi.spyOn(api, 'post');

        act(() => {
            resetAiStore();
            if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    navigate: mockNavigateGlobal,
                    profile: null,
                    isLoading: false,
                    error: null,
                    showWelcomeModal: false,
                    setNavigate: vi.fn(),
                    login: vi.fn(),
                    logout: vi.fn(),
                    register: vi.fn(),
                    setProfile: vi.fn(),
                    setUser: vi.fn(),
                    setSession: vi.fn(),
                    setIsLoading: vi.fn(),
                    setError: vi.fn(),
                    updateProfile: vi.fn(),
                    clearError: vi.fn(),
                    loginWithGoogle: vi.fn(),
                    subscribeToNewsletter: vi.fn(),
                    updateEmail: vi.fn(),
                    uploadAvatar: vi.fn(),
                    fetchProfile: vi.fn(),
                    checkEmailExists: vi.fn(),
                    requestPasswordReset: vi.fn(),
                    handleOAuthLogin: vi.fn(),
                    updateProfileWithAvatar: vi.fn(),
                    updateSubscriptionAndDismissWelcome: vi.fn(),
                    setShowWelcomeModal: vi.fn(),
                });
            }
        });
    });

    afterEach(() => {
        postSpy.mockRestore();
    });

    it('should do nothing if no pending action in localStorage', async () => {
        localStorage.removeItem('pendingAction');
        await useAiStore.getState().checkAndReplayPendingChatAction();
        expect(postSpy).not.toHaveBeenCalled();
    });

    it('should do nothing if user is not authenticated, even with pending action', async () => {
        localStorage.setItem('pendingAction', JSON.stringify(pendingActionStoreFormat));

        if (vi.isMockFunction(useAuthStore)) {
            vi.mocked(useAuthStore.getState).mockReturnValue({
                user: null,
                session: null,
                navigate: mockNavigateGlobal,
                profile: null,
                isLoading: false,
                error: null,
                showWelcomeModal: false,
                setNavigate: vi.fn(),
                login: vi.fn(),
                logout: vi.fn(),
                register: vi.fn(),
                setProfile: vi.fn(),
                setUser: vi.fn(),
                setSession: vi.fn(),
                setIsLoading: vi.fn(),
                setError: vi.fn(),
                updateProfile: vi.fn(),
                clearError: vi.fn(),
                loginWithGoogle: vi.fn(),
                subscribeToNewsletter: vi.fn(),
                updateEmail: vi.fn(),
                uploadAvatar: vi.fn(),
                fetchProfile: vi.fn(),
                checkEmailExists: vi.fn(),
                requestPasswordReset: vi.fn(),
                handleOAuthLogin: vi.fn(),
                updateProfileWithAvatar: vi.fn(),
                updateSubscriptionAndDismissWelcome: vi.fn(),
                setShowWelcomeModal: vi.fn(),
            });
        }

        await useAiStore.getState().checkAndReplayPendingChatAction();
        expect(postSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem('pendingAction')).toBe(JSON.stringify(pendingActionStoreFormat));
    });

    it('should call api.post with correct parameters if pending action exists and user is authenticated', async () => {
        localStorage.setItem('pendingAction', JSON.stringify(pendingActionStoreFormat));
        const mockApiResponse: ChatMessage = {
            id: 'm-replay',
            chat_id: pendingActionBody.chatId!,
            role: 'assistant',
            content: 'Replayed!',
            user_id: null,
            ai_provider_id: pendingActionBody.providerId,
            system_prompt_id: pendingActionBody.promptId,
            token_usage: { total_tokens: 10, promptTokens: 5, completionTokens: 5 },
            created_at: 'now',
            updated_at: 'now',
            is_active_in_thread: true,
            error_type: null,
            response_to_message_id: null,
        };
        postSpy.mockResolvedValue({ data: mockApiResponse, error: null, status: 200 });

        await useAiStore.getState().checkAndReplayPendingChatAction();

        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(postSpy).toHaveBeenCalledWith(
            `/${pendingActionStoreFormat.endpoint}`,
            pendingActionBody,
            { token: mockSession.access_token }
        );
        expect(localStorage.getItem('pendingAction')).toBeNull();

        const finalState = useAiStore.getState();
        expect(finalState.messagesByChatId[mockApiResponse.chat_id]).toBeDefined();
        expect(finalState.messagesByChatId[mockApiResponse.chat_id].length).toBe(2);
        expect(finalState.messagesByChatId[mockApiResponse.chat_id].find(m => m.id === mockApiResponse.id)).toEqual(mockApiResponse);
        expect(finalState.currentChatId).toBe(mockApiResponse.chat_id);
    });

    it('should NOT clear pending action and set error if api.post call fails (non-auth error)', async () => {
        localStorage.setItem('pendingAction', JSON.stringify(pendingActionStoreFormat));
        const apiError = { message: 'API failed during replay (non-auth)', name: 'ApiError', status: 500 };
        postSpy.mockResolvedValue({ data: null, error: apiError, status: 500 });

        await useAiStore.getState().checkAndReplayPendingChatAction();

        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('pendingAction')).toBe(JSON.stringify(pendingActionStoreFormat));

        const finalState = useAiStore.getState();
        expect(finalState.aiError).toBe(apiError.message);

        const replayedMessages = finalState.messagesByChatId[Object.keys(finalState.messagesByChatId)[0]];
        const userMessage: ChatMessage | undefined = replayedMessages?.find(m => m.role === 'user' && m.content === pendingActionBody.message);
        
        expect(userMessage).toBeDefined();
        expect(userMessage?.error_type).toBe('replay_failed');
    });

    it('should do nothing if pending action endpoint/method is not for chat POST', async () => {
        const wrongEndpointAction: PendingAction<ChatApiRequest> = { ...pendingActionStoreFormat, endpoint: 'not-chat' };
        localStorage.setItem('pendingAction', JSON.stringify(wrongEndpointAction));

        await useAiStore.getState().checkAndReplayPendingChatAction();
        expect(postSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem('pendingAction')).toBe(JSON.stringify(wrongEndpointAction));
        localStorage.clear();

        const wrongMethodAction: PendingAction<ChatApiRequest> = { ...pendingActionStoreFormat, method: 'GET' };
        localStorage.setItem('pendingAction', JSON.stringify(wrongMethodAction));
        await useAiStore.getState().checkAndReplayPendingChatAction();
        expect(postSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem('pendingAction')).toBe(JSON.stringify(wrongMethodAction));
    });

    it('should NOT clear pending action and set error if api.post throws AuthRequiredError', async () => {
        localStorage.setItem('pendingAction', JSON.stringify(pendingActionStoreFormat));
        const authError = new AuthRequiredError('Session expired during replay. Please log in again.');
        postSpy.mockRejectedValue(authError);

        await useAiStore.getState().checkAndReplayPendingChatAction();

        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('pendingAction')).toBe(JSON.stringify(pendingActionStoreFormat));

        const finalState = useAiStore.getState();
        expect(finalState.aiError).toBe(authError.message);
        const messagesForChat = finalState.messagesByChatId[Object.keys(finalState.messagesByChatId)[0]];
        const userMessage: ChatMessage | undefined = messagesForChat?.find(m => m.role === 'user' && m.content === pendingActionBody.message);
        
        expect(userMessage).toBeDefined();
        expect(userMessage?.error_type).toBeNull();
    });
});