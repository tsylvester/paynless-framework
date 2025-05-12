import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';

// Strict import order and mock definitions to mirror sendMessage.test.ts
import { useAiStore, initialAiStateValues } from './aiStore';
// Import the mocked api to spy on its methods
import { api } from '@paynless/api'; 
import { act } from '@testing-library/react';
import type { User, Session, ChatMessage, ChatApiRequest, PendingAction } from '@paynless/types';
import { AuthRequiredError } from '@paynless/types'; // Value import
import { useAuthStore } from './authStore';

// --- REMOVE Top-level Mock Function Definition for mockApiPost ---
// const mockApiPost = vi.fn(); // This was causing hoisting issues

// --- Top-level mocks for methods under api.ai() if needed, mirroring sendMessage.test.ts pattern ---
// For replay.test.ts, these might not be strictly necessary if checkAndReplayPendingChatAction
// does not directly trigger api.ai().sendChatMessage but rather api.post()
// const mockSendChatMessage = vi.fn(); 

// --- Mock @paynless/api (Async Factory, mirroring sendMessage.test.ts) ---
vi.mock('@paynless/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actual, // Spread other exports from the original module
        api: {    // Mock the 'api' named export
            ...(actual.api || {}), // Spread original api object properties if it exists
            ai: () => ({ // Mock the 'ai' method which returns an object of AI related functions
                // If checkAndReplay were to call sendMessage which uses api.ai().sendChatMessage,
                // then sendChatMessage here would need to be from a top-level const like in sendMessage.test.ts
                // For now, using inline vi.fn() as checkAndReplay uses api.post directly.
                getAiProviders: vi.fn(),
                getSystemPrompts: vi.fn(),
                sendChatMessage: vi.fn(), // Placeholder, not expected to be called by checkAndReplay directly
                getChatHistory: vi.fn(),
                getChatMessages: vi.fn(),
            }),
            // For direct methods on api, use vi.fn() inline as per sendMessage.test.ts pattern for such methods
            post: vi.fn(),     // <<< INLINE MOCK for api.post()
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            auth: () => ({}),    
            billing: () => ({}),
            getFunctionsUrl: vi.fn().mockReturnValue('mock-functions-url'),
        },
        initializeApiClient: vi.fn(), // Mock other named exports
    };
});

// --- Mock ./authStore ---
vi.mock('./authStore');

// Helper to reset Zustand store state
const resetAiStore = () => {
    useAiStore.setState({ ...initialAiStateValues }, false); 
};

const mockNavigateGlobal = vi.fn();

describe('aiStore - checkAndReplayPendingChatAction', () => {
    let postSpy: SpyInstance;

    const mockUser: User = { id: 'user-replay-1', email: 'replay@test.com', created_at: 't', updated_at: 't', role: 'user' };
    const mockSessionExpiresIn = 3600;
    const mockSession: Session = { 
        access_token: 'replay-token', 
        refresh_token: 'rt', 
        expires_in: mockSessionExpiresIn, 
        token_type: 'bearer', 
        expiresAt: Math.floor(Date.now() / 1000) + mockSessionExpiresIn
    }; 
    const pendingActionBody: ChatApiRequest = {
        message: 'Hello from pending',
        providerId: 'p1',
        promptId: 's1',
        chatId: 'chat-pending-123',
    };
    const pendingActionStoreFormat: PendingAction = {
        endpoint: 'chat', 
        method: 'POST',
        body: pendingActionBody as unknown as Record<string, unknown>,
        returnPath: 'chat' 
    };

    beforeEach(() => {
        vi.clearAllMocks(); 
        vi.restoreAllMocks(); // This will restore spies created with vi.spyOn
        localStorage.clear();

        // Spy on api.post AFTER mocks are restored and api object is the mocked one
        // Important: Ensure this spy is fresh for each test.
        // vi.restoreAllMocks() should handle cleaning up spies from previous tests.
        postSpy = vi.spyOn(api, 'post');

        act(() => {
            resetAiStore();
            if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    navigate: mockNavigateGlobal,
                    profile: null, isLoading: false, error: null,
                    setNavigate: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(),
                    setProfile: vi.fn(), setUser: vi.fn(), setSession: vi.fn(), setIsLoading: vi.fn(), setError: vi.fn(),
                    initialize: vi.fn(), refreshSession: vi.fn(), updateProfile: vi.fn(), clearError: vi.fn(),
                } as any);
            }
        });
    });

    afterEach(() => {
        // Explicitly restore the spy to ensure it's cleaned up, though restoreAllMocks should also cover it.
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
                user: null, session: null, navigate: mockNavigateGlobal, profile: null, isLoading: false, error: null,
                setNavigate: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(),
                setProfile: vi.fn(), setUser: vi.fn(), setSession: vi.fn(), setIsLoading: vi.fn(), setError: vi.fn(),
                initialize: vi.fn(), refreshSession: vi.fn(), updateProfile: vi.fn(), clearError: vi.fn(),
            } as any);
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
            token_usage: {total_tokens: 10, promptTokens: 5, completionTokens: 5},
            created_at: 'now', 
            is_active_in_thread: true 
        };
        postSpy.mockResolvedValue({ data: mockApiResponse, error: null, status: 200 });

        await useAiStore.getState().checkAndReplayPendingChatAction();

        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(postSpy).toHaveBeenCalledWith(
            `/${pendingActionStoreFormat.endpoint}`,
            pendingActionStoreFormat.body, 
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
        const apiError = new Error('API failed during replay (non-auth)');
        postSpy.mockResolvedValue({ data: null, error: {message: apiError.message, name: 'ApiError', status: 500 }, status: 500 });

        await useAiStore.getState().checkAndReplayPendingChatAction();

        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('pendingAction')).toBe(JSON.stringify(pendingActionStoreFormat)); 
        
        const finalState = useAiStore.getState();
        expect(finalState.aiError).toBe(apiError.message);
        
        const replayedMessages = finalState.messagesByChatId[Object.keys(finalState.messagesByChatId)[0]];
        if (replayedMessages && replayedMessages.length > 0) {
           const userMessage = replayedMessages.find(m => m.role === 'user' && m.content === pendingActionBody.message);
           expect((userMessage as ChatMessage & { status?: string })?.status).toBe('error');
        }
    });

    it('should do nothing if pending action endpoint/method is not for chat POST', async () => {
        const wrongEndpointAction: PendingAction = { ...pendingActionStoreFormat, endpoint: 'not-chat' };
        localStorage.setItem('pendingAction', JSON.stringify(wrongEndpointAction));
        
        await useAiStore.getState().checkAndReplayPendingChatAction();
        expect(postSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem('pendingAction')).toBe(JSON.stringify(wrongEndpointAction));
        localStorage.clear();

        const wrongMethodAction: PendingAction = { ...pendingActionStoreFormat, method: 'GET' };
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
        if (messagesForChat && messagesForChat.length > 0) {
            const userMessage = messagesForChat.find(m => m.role === 'user' && m.content === pendingActionBody.message);
            expect((userMessage as ChatMessage & { status?: string })?.status).toBeUndefined(); 
        }
    });
});