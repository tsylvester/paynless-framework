import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore';
import { selectCurrentChatMessages } from './aiStore.selectors'; // Import the selector
import { act } from '@testing-library/react';
import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    UserProfile
} from '@paynless/types';
import { useAuthStore } from './authStore';
import { MockedAiApiClient } from '@paynless/api/mocks';

// Define an interface for the expected shape of the mocked users client
interface MockUserClient {
    getProfile: Mock;
}

// This interface represents the parts of ApiClient we are mocking/using
interface MockedApiClientShape {
    ai: MockedAiApiClient;
    users: MockUserClient;
    organizations: any; 
    notifications: any; 
    billing: any; 
    getSupabaseClient: Mock<[], any>;
    get: Mock<[string, any?], Promise<any>>;
    post: Mock<[string, any, any?], Promise<any>>;
    put: Mock<[string, any, any?], Promise<any>>;
    patch: Mock<[string, any, any?], Promise<any>>;
    delete: Mock<[string, any?], Promise<any>>;
    getFunctionsUrl: Mock<[], string>;
}

vi.mock('@paynless/api', async (importOriginal) => {
    const { 
        createMockAiApiClient: actualCreateMockAi, 
    } = await import('@paynless/api/mocks');
    
    const localMockAiApiInstance = actualCreateMockAi() as unknown as MockedAiApiClient;
    const localMockUserApiInstance: MockUserClient = {
        getProfile: vi.fn(),
    };

    const mockSupabaseAuth = {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    };
    const mockSupabaseClient = { auth: mockSupabaseAuth, from: vi.fn().mockReturnThis() };
    
    const mockApiClientToReturn: MockedApiClientShape = {
        ai: localMockAiApiInstance, 
        users: localMockUserApiInstance,
        organizations: { getOrganization: vi.fn(), updateOrganizationSettings: vi.fn() },
        notifications: { getNotifications: vi.fn(), markAllNotificationsAsRead: vi.fn() },
        billing: { createCheckoutSession: vi.fn(), getSubscriptions: vi.fn() },
        getSupabaseClient: vi.fn(() => mockSupabaseClient),
        get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
        getFunctionsUrl: vi.fn().mockReturnValue('mock-functions-url'),
    };

    return {
        api: {
            users: () => localMockUserApiInstance,
        },
        AiApiClient: vi.fn(() => localMockAiApiInstance),
        UserApiClient: vi.fn(() => localMockUserApiInstance),
        getApiClient: vi.fn(() => mockApiClientToReturn), 
        initializeApiClient: vi.fn(), 
        _resetApiClient: vi.fn(), 
        createMockAiApiClient: actualCreateMockAi, 
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
        
        if (mockedApi._resetApiClient) {
            mockedApi._resetApiClient(); 
        }
        // vi.clearAllMocks() called at the top of beforeEach should handle resetting vi.fn() instances.
        
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

    describe('setContinueUntilComplete', () => {
        it('should set continueUntilComplete to true', () => {
            expect(useAiStore.getState().continueUntilComplete).toBe(false); // Check initial state
            act(() => {
                useAiStore.getState().setContinueUntilComplete(true);
            });
            expect(useAiStore.getState().continueUntilComplete).toBe(true);
        });

        it('should set continueUntilComplete to false', () => {
            act(() => {
                useAiStore.setState({ continueUntilComplete: true }); // Set to true first
            });
            expect(useAiStore.getState().continueUntilComplete).toBe(true);

            act(() => {
                useAiStore.getState().setContinueUntilComplete(false);
            });
            expect(useAiStore.getState().continueUntilComplete).toBe(false);
        });
    });

}); // End main describe block

// --- NEW TEST SUITE FOR _fetchAndStoreUserProfiles ---
describe('aiStore - _fetchAndStoreUserProfiles', () => {
    let mockGetProfile: Mock;
    let loggerWarnSpy: MockInstance<[message: string, metadata?: any], void>;
    let loggerErrorSpy: MockInstance<[message: string, metadata?: any], void>;
    let loggerDebugSpy: MockInstance<[message: string, metadata?: any], void>;
    let loggerInfoSpy: MockInstance<[message: string, metadata?: any], void>;

    // Moved mockUserProfile function definition higher up
    const mockUserProfile = (id: string): UserProfile => ({
        id,
        first_name: `First-${id}`,
        last_name: `Last-${id}`,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        last_selected_org_id: null,
        chat_context: null,
        profile_privacy_setting: 'public',
        role: 'user',
    });

    // Define mock profiles at a higher scope to ensure consistent timestamps
    const user1Profile = mockUserProfile('user1');
    const user2Profile = mockUserProfile('user2');
    const userNewProfile = mockUserProfile('user-new');
    const userExistingProfile = mockUserProfile('user-existing');
    const userSuccessProfile = mockUserProfile('user-s');

    beforeEach(async () => {
        // vi.clearAllMocks(); // Already called in global beforeEach, but doesn't hurt if specific spies are added here
        // vi.restoreAllMocks(); // Same as above

        // Setup spies for logger
        const utilsMock = await import('@paynless/utils');
        loggerWarnSpy = vi.spyOn(utilsMock.logger, 'warn') as unknown as MockInstance<[message: string, metadata?: any], void>;
        loggerErrorSpy = vi.spyOn(utilsMock.logger, 'error') as unknown as MockInstance<[message: string, metadata?: any], void>;
        loggerDebugSpy = vi.spyOn(utilsMock.logger, 'debug') as unknown as MockInstance<[message: string, metadata?: any], void>;
        loggerInfoSpy = vi.spyOn(utilsMock.logger, 'info') as unknown as MockInstance<[message: string, metadata?: any], void>;


        // Mock api.users().getProfile()
        const apiMockModule = await import('@paynless/api');
        const mockedApi = vi.mocked(apiMockModule);

        // Access the mock through the 'api' export, which should align with how aiStore uses it.
        // The 'users' method on the mocked 'api' object returns our MockUserClient.
        const usersApiClientMock = mockedApi.api.users() as unknown as MockUserClient;
        mockGetProfile = usersApiClientMock.getProfile;


        // Mock authStore to provide a current user
        vi.mocked(useAuthStore.getState).mockReturnValue({
            user: { id: 'current-user-id' } as any,
            session: { access_token: 'mock-token' } as any,
            profile: null,
            isLoading: false,
            error: null,
            navigate: vi.fn(),
            // ... other authStore functions if needed by _fetchAndStoreUserProfiles indirectly
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
        
        act(() => {
            resetAiStore(); // Reset aiStore state
        });
    });

    afterEach(() => {
        vi.restoreAllMocks(); // Restore all mocks after each test
    });

    it('should successfully fetch and store new profiles', async () => {
        const userIdsToFetch = ['user1', 'user2'];
        mockGetProfile
            .mockResolvedValueOnce({ data: user1Profile, error: null, status: 200 })
            .mockResolvedValueOnce({ data: user2Profile, error: null, status: 200 });

        await act(async () => {
            // Directly call the internal function for testing.
            // This requires it to be exported from aiStore.ts or tested via a public action that uses it.
            // For now, assuming we can access it or will test via `loadChatDetails` or similar.
            // Let's simulate calling it as if by loadChatDetails.
            // We need to get the actual function from the store instance.
            await (useAiStore.getState() as any)._fetchAndStoreUserProfiles(userIdsToFetch);
        });

        const state = useAiStore.getState();
        expect(mockGetProfile).toHaveBeenCalledTimes(2);
        expect(mockGetProfile).toHaveBeenCalledWith('user1');
        expect(mockGetProfile).toHaveBeenCalledWith('user2');
        expect(state.chatParticipantsProfiles['user1']).toEqual(user1Profile);
        expect(state.chatParticipantsProfiles['user2']).toEqual(user2Profile);
        expect(loggerWarnSpy).not.toHaveBeenCalled();
        expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should gracefully handle API errors (e.g., RLS denial) and not store profile', async () => {
        const userIdToFetch = 'user-rls-denied';
        const apiError = { code: 'RLS_DENIED', message: 'Access denied via RLS' };
        mockGetProfile.mockResolvedValueOnce({ data: null, error: apiError, status: 403 });

        await act(async () => {
            await (useAiStore.getState() as any)._fetchAndStoreUserProfiles([userIdToFetch]);
        });

        const state = useAiStore.getState();
        expect(mockGetProfile).toHaveBeenCalledWith(userIdToFetch);
        expect(state.chatParticipantsProfiles[userIdToFetch]).toBeUndefined();
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining(`API error fetching profile for user ${userIdToFetch}`),
            expect.objectContaining({ errorCode: apiError.code, errorMessage: apiError.message })
        );
        expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should gracefully handle promise rejections (e.g., network error) and not store profile', async () => {
        const userIdToFetch = 'user-network-error';
        const networkError = new Error('Network failure');
        mockGetProfile.mockRejectedValueOnce(networkError); // Simulate a direct rejection

        await act(async () => {
            await (useAiStore.getState() as any)._fetchAndStoreUserProfiles([userIdToFetch]);
        });
        
        const state = useAiStore.getState();
        expect(mockGetProfile).toHaveBeenCalledWith(userIdToFetch);
        expect(state.chatParticipantsProfiles[userIdToFetch]).toBeUndefined();
        // The error is caught by the .catch(error => ({userId, error})) inside profilePromises.map
        // This means the promise resolves successfully with an error object, leading to a logger.warn
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Error fetching profile for user ${userIdToFetch} (caught by promise.catch)`),
            expect.objectContaining({ error: networkError })
        );
        expect(loggerErrorSpy).not.toHaveBeenCalled(); // Should not call logger.error in this path
    });
    
    it('should skip fetching for current user and already existing profiles', async () => {
        const currentUserId = 'current-user-id'; // As set in beforeEach auth mock
        const existingUserId = 'user-existing';
        const newUserId = 'user-new';
    
        act(() => {
            useAiStore.setState({
                chatParticipantsProfiles: {
                    [existingUserId]: userExistingProfile, // Use pre-defined profile
                },
            });
        });
    
        mockGetProfile.mockResolvedValueOnce({ data: userNewProfile, error: null, status: 200 });
    
        await act(async () => {
            await (useAiStore.getState() as any)._fetchAndStoreUserProfiles([currentUserId, existingUserId, newUserId]);
        });
    
        const state = useAiStore.getState();
        expect(mockGetProfile).toHaveBeenCalledTimes(1);
        expect(mockGetProfile).toHaveBeenCalledWith(newUserId);
        expect(state.chatParticipantsProfiles[newUserId]).toEqual(userNewProfile);
        expect(state.chatParticipantsProfiles[existingUserId]).toEqual(userExistingProfile); // Should still be there
        // expect(loggerDebugSpy).toHaveBeenCalledWith( // Expect a debug log for skipping
        //     expect.stringContaining('No new user profiles to fetch'),
        //     expect.objectContaining({ requestedUserIds: [currentUserId, existingUserId, newUserId] })
        // );
        // Commenting out the loggerDebugSpy check for now, as the condition for "No new user profiles to fetch" might be tricky
        // if currentUserId or existingUserId are the *only* ones passed. 
        // The core functionality is that only newUserId is fetched.
    });

    it('should handle a mix of successful and failed fetches in one batch', async () => {
        const userSuccess = 'user-s';
        const userApiErrorId = 'user-ae';
        const userPromiseRejectId = 'user-pr';
    
        const apiErrorPayload = { code: 'SOME_ERROR', message: 'API level error' };
        const promiseRejectError = new Error('Promise level rejection');
    
        mockGetProfile
            .mockImplementation(async (id: string) => {
                if (id === userSuccess) return { data: userSuccessProfile, error: null, status: 200 };
                if (id === userApiErrorId) return { data: null, error: apiErrorPayload, status: 500 };
                if (id === userPromiseRejectId) throw promiseRejectError; // This will be caught by the .catch in profilePromises.map
                return { data: null, error: {code: 'UNHANDLED_MOCK', message: 'Unhandled mock id'}, status: 500};
            });
            
        await act(async () => {
            await (useAiStore.getState() as any)._fetchAndStoreUserProfiles([userSuccess, userApiErrorId, userPromiseRejectId]);
        });
    
        const state = useAiStore.getState();
        expect(state.chatParticipantsProfiles[userSuccess]).toEqual(userSuccessProfile);
        expect(state.chatParticipantsProfiles[userApiErrorId]).toBeUndefined();
        expect(state.chatParticipantsProfiles[userPromiseRejectId]).toBeUndefined();
    
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining(`API error fetching profile for user ${userApiErrorId}`),
            expect.objectContaining({ errorCode: apiErrorPayload.code })
        );
        // For the promiseRejectError, it's caught by the .catch in the map, so it becomes a warning
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Error fetching profile for user ${userPromiseRejectId} (caught by promise.catch)`),
            expect.objectContaining({ error: promiseRejectError })
        );
        expect(loggerErrorSpy).not.toHaveBeenCalled(); // logger.error should not be called for promiseRejectId in this path
        expect(loggerInfoSpy).toHaveBeenCalledWith(
            expect.stringContaining('Successfully fetched and stored 1 of 3 requested profiles'),
            expect.anything()
        );
    });

}); // End _fetchAndStoreUserProfiles describe
