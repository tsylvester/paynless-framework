import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore';
import { useAuthStore } from './authStore';
import { act } from '@testing-library/react';
import type { User, Session, ChatMessage, Chat, ApiResponse, AuthRequiredError } from '@paynless/types';
// Use the package's mock entry point
import { createMockAiApiClient, resetMockAiApiClient } from '@paynless/api/mocks';

// Create the mock instance using the imported creator
const mockAiApi = createMockAiApiClient();

// Mock the entire @paynless/api module to control its behavior
vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    // The mockAiApi instance is already created above using helpers from @paynless/api/mocks
    // So, we just need to ensure the mocked module provides this instance for the 'ai' part.
    const mockSupabaseAuth = {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    };
    const mockSupabaseClient = { auth: mockSupabaseAuth, from: vi.fn().mockReturnThis() }; // Simplified

    const mockApiClientInstance = {
        ai: mockAiApi, // Use the pre-configured mockAiApi instance
        organizations: { getOrganization: vi.fn() }, // Simplified
        notifications: { getNotifications: vi.fn() }, // Simplified
        billing: { createCheckoutSession: vi.fn() }, // Simplified
        getSupabaseClient: vi.fn(() => mockSupabaseClient),
        get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
        getFunctionsUrl: vi.fn().mockReturnValue('mock-functions-url'),
    };

    return {
        ...actualApiModule,
        // AiApiClient: vi.fn(() => mockAiApi), // This might not be needed if getApiClient is always used
        getApiClient: vi.fn(() => mockApiClientInstance),
        initializeApiClient: vi.fn(), 
        // We don't need to re-export createMockAiApiClient/resetMockAiApiClient here
        // as they are not expected to be accessed from the mocked module instance itself usually.
        // Test files should import them directly from '@paynless/api/mocks' if they need them.
    };
});

// Mock the authStore
vi.mock('./authStore');

// Helper to reset Zustand store state
const resetAiStore = () => {
    useAiStore.setState({ ...initialAiStateValues }, true); // Preserve actions by setting second param to false/true based on need, or deep merge
};

const mockNavigateGlobal = vi.fn();

describe('aiStore - checkAndReplayPendingChatAction', () => {
    const mockUser: User = { id: 'user-replay-1', email: 'replay@test.com', created_at: 't', updated_at: 't', role: 'user' };
    const mockSession: Session = { access_token: 'replay-token', refresh_token: 'rt', expires_in: 3600, token_type: 'bearer', user: mockUser };
    const pendingAction = {
        type: 'sendMessage',
        payload: { message: 'Hello from pending', providerId: 'p1', promptId: 's1', chatId: 'chat-pending-123' }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        localStorage.clear();
        // Reset the specific mock functions on mockAiApi instance
        resetMockAiApiClient(mockAiApi); // Use the imported reset function

        act(() => {
            resetAiStore();
            // Setup authStore mock for authenticated state
            if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    navigate: mockNavigateGlobal,
                    profile: null, isLoading: false, error: null,
                    // Provide full mock for authStore state and actions
                    setNavigate: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(),
                    setProfile: vi.fn(), setUser: vi.fn(), setSession: vi.fn(), setIsLoading: vi.fn(), setError: vi.fn(),
                    initialize: vi.fn(), refreshSession: vi.fn(), updateProfile: vi.fn(), clearError: vi.fn(),
                } as any);
            } else {
                console.warn("useAuthStore mock was not found for mocking getState in checkAndReplay tests.");
            }
        });
    });

    it('should do nothing if no pending action in localStorage', () => {
        localStorage.removeItem('pendingChatAction');
        useAiStore.getState().checkAndReplayPendingChatAction();
        expect(mockAiApi.sendChatMessage).not.toHaveBeenCalled();
    });

    it('should do nothing if user is not authenticated, even with pending action', () => {
        localStorage.setItem('pendingChatAction', JSON.stringify(pendingAction));
        // Override authStore mock for unauthenticated state for this test
        if (vi.isMockFunction(useAuthStore)) {
             vi.mocked(useAuthStore.getState).mockReturnValue({
                user: null, session: null, navigate: mockNavigateGlobal, profile: null, isLoading: false, error: null,
                setNavigate: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(),
                setProfile: vi.fn(), setUser: vi.fn(), setSession: vi.fn(), setIsLoading: vi.fn(), setError: vi.fn(),
                initialize: vi.fn(), refreshSession: vi.fn(), updateProfile: vi.fn(), clearError: vi.fn(),
            } as any);
        } else {
            console.warn("useAuthStore mock was not found for mocking getState in checkAndReplay (unauthenticated) tests.");
        }
        useAiStore.getState().checkAndReplayPendingChatAction();
        expect(mockAiApi.sendChatMessage).not.toHaveBeenCalled();
        // Should also still have the item in localStorage as it wasn't processed
        expect(localStorage.getItem('pendingChatAction')).toBe(JSON.stringify(pendingAction));
    });

    it('should dispatch sendMessage if pending action exists and user is authenticated', async () => {
        localStorage.setItem('pendingChatAction', JSON.stringify(pendingAction));
        const mockResponse: ChatMessage = { id: 'm-replay', chat_id: pendingAction.payload.chatId, role: 'assistant', content: 'Replayed!', user_id: null, ai_provider_id: pendingAction.payload.providerId, system_prompt_id: pendingAction.payload.promptId, token_usage: {total_tokens: 10}, created_at: 'now' };
        (mockAiApi.sendChatMessage as Mock).mockResolvedValue({ data: mockResponse, status: 200 });

        // Spy on the local sendMessage action of the store
        const sendMessageSpy = vi.spyOn(useAiStore.getState(), 'sendMessage');

        await useAiStore.getState().checkAndReplayPendingChatAction();

        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        expect(sendMessageSpy).toHaveBeenCalledWith(pendingAction.payload);
        expect(localStorage.getItem('pendingChatAction')).toBeNull(); // Action should be cleared after replay
        
        // Optionally, check if sendChatMessage on the API mock was called (if sendMessage doesn't have further logic to prevent it)
        // This depends on the implementation of the actual sendMessage store action.
        // For this test, focusing on sendMessageSpy is more direct for replaying logic.
    });

    it('should clear pending action from localStorage even if replayed sendMessage call fails', async () => {
        localStorage.setItem('pendingChatAction', JSON.stringify(pendingAction));
        (mockAiApi.sendChatMessage as Mock).mockRejectedValue(new Error('API failed during replay'));

        const sendMessageSpy = vi.spyOn(useAiStore.getState(), 'sendMessage');
        
        // Wrap in try/catch if sendMessage re-throws, or check error state in store
        try {
            await useAiStore.getState().checkAndReplayPendingChatAction();
        } catch (e) {
            // Expected if sendMessage re-throws
        }

        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        expect(sendMessageSpy).toHaveBeenCalledWith(pendingAction.payload);
        expect(localStorage.getItem('pendingChatAction')).toBeNull(); // Action should be cleared regardless of API success/failure
        // Optionally check for aiError state in the store
        // expect(useAiStore.getState().aiError).toBe('API failed during replay');
    });

    it('should do nothing if pending action type is unknown', () => {
        const unknownAction = { type: 'unknownAction', payload: {} };
        localStorage.setItem('pendingChatAction', JSON.stringify(unknownAction));
        useAiStore.getState().checkAndReplayPendingChatAction();
        expect(mockAiApi.sendChatMessage).not.toHaveBeenCalled();
        // localStorage should still contain the action as it wasn't processed by known handlers
        expect(localStorage.getItem('pendingChatAction')).toBe(JSON.stringify(unknownAction)); 
    });
});