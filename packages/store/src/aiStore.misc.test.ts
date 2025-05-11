import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore';
import { selectCurrentChatMessages } from './aiStore.selectors'; // Import the selector
import { act } from '@testing-library/react';
import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
} from '@paynless/types';
import { useAuthStore } from './authStore';
import { MockedAiApiClient } from '@paynless/api/mocks';

vi.mock('@paynless/api', async (importOriginal) => {
    const { createMockAiApiClient: actualCreateMock, resetMockAiApiClient: actualResetMock } = await import('@paynless/api/mocks');
    
    const localMockAiApiInstance = actualCreateMock() as unknown as MockedAiApiClient;

    const mockSupabaseAuth = {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    };
    const mockSupabaseClient = { auth: mockSupabaseAuth, from: vi.fn().mockReturnThis() };
    
    const mockApiClientToReturn = {
        ai: localMockAiApiInstance, 
        organizations: { getOrganization: vi.fn(), updateOrganizationSettings: vi.fn() },
        notifications: { getNotifications: vi.fn(), markAllNotificationsAsRead: vi.fn() },
        billing: { createCheckoutSession: vi.fn(), getSubscriptions: vi.fn() },
        getSupabaseClient: vi.fn(() => mockSupabaseClient),
        get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
        getFunctionsUrl: vi.fn().mockReturnValue('mock-functions-url'),
    };

    return {
        // ...actualApiModule, // REMOVED
        // AiApiClient constructor mock now directly uses the local instance if needed,
        // or consumers should use getApiClient().ai
        AiApiClient: vi.fn(() => localMockAiApiInstance), // Keep if AiApiClient class itself is instantiated in tests
        getApiClient: vi.fn(() => mockApiClientToReturn), 
        initializeApiClient: vi.fn(), 
        // Re-export mock utilities if they are imported from '@paynless/api' in the test file
        // (though this file seems to import AiApiClient class directly and mock utils from /mocks)
        createMockAiApiClient: actualCreateMock, 
        resetMockAiApiClient: actualResetMock,
    };
});

vi.mock('./authStore');

// ADD THIS CONSOLE.LOG
console.log('Initial aiStore misc.test.ts:', useAiStore.getState());
// END CONSOLE.LOG

const resetAiStore = () => {
    // Instead of replacing the entire state, merge initialAiStateValues.
    // This ensures that action functions, which are part of the store's prototype
    // or initial created object, are not wiped out.
    // We also explicitly reset fields that might be modified during tests and need a clean slate.
    act(() => {
        useAiStore.setState({
            ...initialAiStateValues,
            // Explicitly reset dynamic state fields to their defaults
            // to ensure a clean state for each test, as initialAiStateValues
            // might not cover all transient states set during a test.
            currentChatId: null,
            messagesByChatId: {},
            chatsByContext: { personal: [], orgs: {} }, // Ensure personal is an array
            isLoadingAiResponse: false,
            isConfigLoading: false,
            isLoadingHistoryByContext: { personal: false, orgs: {} },
            historyErrorByContext: { personal: null, orgs: {} },
            isDetailsLoading: false,
            newChatContext: null,
            rewindTargetMessageId: null,
            aiError: null,
            // selectedProviderId and selectedPromptId are in initialAiStateValues
        }, false); // `false` (or omitting it) merges the state, preserving actions.
    });
};

const mockNavigateGlobal = vi.fn();

describe('aiStore - Misc Actions', () => {
    beforeEach(async () => { 
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        
        // Mock authStore.getState() to return a defined state with a user and navigation
        vi.mocked(useAuthStore.getState).mockReturnValue({
            user: { id: 'mock-user-for-misc-tests' } as any, // Cast to any or provide full User object
            session: null, 
            profile: null, 
            isLoading: false,
            error: null,
            navigate: mockNavigateGlobal, 
            // Corrected AuthStore mock functions
            setUser: vi.fn(),
            setSession: vi.fn(),
            setProfile: vi.fn(),
            setIsLoading: vi.fn(),
            setError: vi.fn(),
            setNavigate: vi.fn(),
            login: vi.fn(),
            logout: vi.fn(),
            register: vi.fn(),
            updateProfile: vi.fn(),
            updateEmail: vi.fn(),
            uploadAvatar: vi.fn(),
            fetchProfile: vi.fn(),
            checkEmailExists: vi.fn(),
            requestPasswordReset: vi.fn(),
            handleOAuthLogin: vi.fn(),
        });
        
        // Get the mocked module to access its reset function and the AI instance
        const apiMockModule = await import('@paynless/api');
        const mockedApi = vi.mocked(apiMockModule);
        
        // Retrieve the AI mock instance via the mocked getApiClient
        const currentMockAiApiInstance = mockedApi.getApiClient().ai as unknown as MockedAiApiClient;

        if (currentMockAiApiInstance && mockedApi.resetMockAiApiClient) {
            mockedApi.resetMockAiApiClient(currentMockAiApiInstance as any); // Cast as any if type issues persist with reset
        }
        act(() => {
             resetAiStore();
             // The call to mockedAuthStore.setState below will execute the vi.fn() for setState.
             // It won't alter the return value of mockedAuthStore.getState() because that's now hardcoded above.
             // This is acceptable as long as the state from getState().mockReturnValue is sufficient for the tests.
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             vi.mocked(useAuthStore.setState)({ ...initialAuthState, user: {id: 'mock-user-for-misc-tests'}, navigate: mockNavigateGlobal }, true); 
        });
    });

    // --- Tests for clearAiError ---
    describe('clearAiError', () => {
        it('should set aiError to null', () => {
             act(() => { 
                useAiStore.setState({ aiError: 'An error occurred' });
             });
            expect(useAiStore.getState().aiError).not.toBeNull();

            act(() => {
                useAiStore.getState().clearAiError();
            });

            expect(useAiStore.getState().aiError).toBeNull();
        });

        it('should not affect other state properties', () => {
            const initialProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-id-clear', config: null, is_active: true, is_enabled: true, provider: null, created_at: '', updated_at: '' }];
            const chatIdForTest = 'c1';
            const initialMessagesInChat: ChatMessage[] = [{ id: 'm1', chat_id: chatIdForTest, role: 'user' as const, content: 'Msg', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true }];
            
            act(() => { 
                useAiStore.setState({
                    availableProviders: initialProviders,
                    messagesByChatId: { [chatIdForTest]: initialMessagesInChat },
                    currentChatId: chatIdForTest, 
                    isLoadingAiResponse: true,
                    aiError: 'Error to be cleared',
                });
            });

            act(() => {
                useAiStore.getState().clearAiError();
            });

            const state = useAiStore.getState();
            expect(state.aiError).toBeNull();
            expect(state.availableProviders).toEqual(initialProviders);
            expect(selectCurrentChatMessages(state)).toEqual(initialMessagesInChat);
            expect(state.isLoadingAiResponse).toBe(true);
        });
    }); // End clearAiError describe

}); // End main describe block
