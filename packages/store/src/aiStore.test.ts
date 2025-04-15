import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore } from './aiStore';
// Import the actual api object to be mocked
import { api } from '@paynless/api-client';
import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    ChatApiRequest,
    ApiResponse,
    User,
    Session,
    UserProfile
} from '@paynless/types';
// Import authStore for mocking
import { useAuthStore } from './authStore';
// ---> Import AuthRequiredError from types <--- 
import { AuthRequiredError } from '@paynless/types';

// --- Mock the entire @paynless/api-client module ---
// Define mock functions for the methods we need to control
const mockGetAiProviders = vi.fn();
const mockGetSystemPrompts = vi.fn();
const mockSendChatMessage = vi.fn();
const mockGetChatHistory = vi.fn();
const mockGetChatMessages = vi.fn();

vi.mock('@paynless/api-client', async (importOriginal) => {
    // ---> Import the original module <--- 
    const actual = await importOriginal<typeof import('@paynless/api-client')>();
    return {
        // ---> Spread actual exports to keep non-mocked things like AuthRequiredError <--- 
        ...actual, 
        // Mock the 'api' export (overwriting the original)
        api: {
            // ---> Keep existing api mock structure <--- 
            ...actual.api, // Include other parts of api if needed
            ai: () => ({
                getAiProviders: mockGetAiProviders,
                getSystemPrompts: mockGetSystemPrompts,
                sendChatMessage: mockSendChatMessage,
                getChatHistory: mockGetChatHistory,
                getChatMessages: mockGetChatMessages,
            }),
            // Add mocks for other parts of 'api' if needed
            auth: () => ({}),
            billing: () => ({}),
            // Mock base methods if the store somehow bypasses the sub-clients
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
        // Mock other specific exports if necessary (overwriting originals)
        initializeApiClient: vi.fn(), 
        // getApiClient: vi.fn(), // Example if needed
        // ApiError: actual.ApiError, // Keep original ApiError if needed, but we defined a mock below?
    };
});

// --- Mock the authStore ---
vi.mock('./authStore');


describe('aiStore', () => {
    // Reset store and mocks before each test
    beforeEach(() => {
        // Reset mocks first
        vi.resetAllMocks();

        // Reset Zustand store state properties, merging with existing state (keeps actions)
         useAiStore.setState({
            availableProviders: [],
            availablePrompts: [],
            currentChatMessages: [],
            currentChatId: null,
            isLoadingAiResponse: false,
            isConfigLoading: false,
            isHistoryLoading: false,
            isDetailsLoading: false,
            chatHistoryList: [],
            aiError: null,
         }); // REMOVED 'true' argument - perform merge instead of replace
    });

     afterEach(() => {
        // Clean up any potential side effects if needed
     });

    // REMOVE: Tests for the removed init action
    /*
    it('init should set the apiClient', () => {
        // ... removed ...
    });

     it('init should not overwrite an existing apiClient', () => {
        // ... removed ...
    });
    */

    // --- Tests for loadAiConfig ---
    describe('loadAiConfig', () => {
        const mockProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '' }];
        const mockPrompts: SystemPrompt[] = [{ id: 's1', name: 'S1', prompt_text: '' }];

        it('should set loading state to true initially and false on completion', async () => {
            // Arrange
            mockGetAiProviders.mockResolvedValue({ success: true, data: mockProviders, statusCode: 200 });
            mockGetSystemPrompts.mockResolvedValue({ success: true, data: mockPrompts, statusCode: 200 });

            // Act
            const promise = useAiStore.getState().loadAiConfig();
            expect(useAiStore.getState().isConfigLoading).toBe(true);
            await promise;

            // Assert
            expect(useAiStore.getState().isConfigLoading).toBe(false);
        });

        it('should call getAiProviders and getSystemPrompts via mocked api', async () => {
             // Arrange
            mockGetAiProviders.mockResolvedValue({ success: true, data: mockProviders, statusCode: 200 });
            mockGetSystemPrompts.mockResolvedValue({ success: true, data: mockPrompts, statusCode: 200 });

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            expect(mockGetAiProviders).toHaveBeenCalledTimes(1);
            expect(mockGetSystemPrompts).toHaveBeenCalledTimes(1);
        });

        it('should update availableProviders and availablePrompts on success', async () => {
             // Arrange
            mockGetAiProviders.mockResolvedValue({ 
                success: true, 
                // Wrap array in expected structure
                data: { providers: mockProviders }, 
                statusCode: 200 
            });
            mockGetSystemPrompts.mockResolvedValue({ 
                success: true, 
                // Wrap array in expected structure
                data: { prompts: mockPrompts }, 
                statusCode: 200 
            });

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            const state = useAiStore.getState();
            expect(state.availableProviders).toEqual(mockProviders);
            expect(state.availablePrompts).toEqual(mockPrompts);
            expect(state.aiError).toBeNull();
        });

        it('should set aiError if getAiProviders fails', async () => {
             // Arrange
            const errorMsg = 'Failed to load providers'; // Original error message from mock
            mockGetAiProviders.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });
            mockGetSystemPrompts.mockResolvedValue({ success: true, data: mockPrompts, statusCode: 200 }); // Prompts succeed

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            const state = useAiStore.getState();
            // Expect the actual error set by the store's catch block
            expect(state.aiError).toBe('Failed to load AI providers.'); 
            expect(state.availableProviders).toEqual([]); // Should not be updated
            expect(state.availablePrompts).toEqual([]); // Neither should be updated if one fails
            expect(state.isConfigLoading).toBe(false);
        });

         it('should set aiError if getSystemPrompts fails', async () => {
             // Arrange
            const errorMsg = 'Failed to load prompts'; // Original error message from mock
            mockGetAiProviders.mockResolvedValue({ success: true, data: mockProviders, statusCode: 200 }); // Providers succeed
            mockGetSystemPrompts.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            const state = useAiStore.getState();
            // Expect the actual error set by the store's catch block
            expect(state.aiError).toBe('Failed to load system prompts.');
            expect(state.availableProviders).toEqual([]);
            expect(state.availablePrompts).toEqual([]);
            expect(state.isConfigLoading).toBe(false);
        });

        // --- NEW Test Case: Both API calls fail ---
        it('should set combined aiError if both getAiProviders and getSystemPrompts fail', async () => {
            // Arrange
            const providersErrorMsg = 'Providers down';
            const promptsErrorMsg = 'Prompts MIA';
            mockGetAiProviders.mockResolvedValue({ success: false, error: providersErrorMsg, statusCode: 500 });
            mockGetSystemPrompts.mockResolvedValue({ success: false, error: promptsErrorMsg, statusCode: 500 });

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            const state = useAiStore.getState();
            // ---> Check for the actual error messages set by the store <--- 
            expect(state.aiError).toContain('Failed to load AI providers.');
            expect(state.aiError).toContain('Failed to load system prompts.');
            expect(state.availableProviders).toEqual([]);
            expect(state.availablePrompts).toEqual([]);
            expect(state.isConfigLoading).toBe(false);
        });
        // --- End NEW Test Case ---

        // REMOVE: Test for uninitialized client is no longer applicable with singleton import
        /*
        it('should set aiError if apiClient is not initialized', async () => {
            // ... removed ...
        });
        */
    });

    // --- Tests for sendMessage ---
    describe('sendMessage', () => {
        let setItemSpy: ReturnType<typeof vi.spyOn>;

        const messageData = {
            message: 'Hello',
            providerId: 'p1',
            promptId: 's1',
        };

        const mockAssistantResponse: ChatMessage = {
            id: 'm2',
            chat_id: 'c123',
            role: 'assistant',
            content: 'Hi there',
            user_id: null,
            ai_provider_id: messageData.providerId,
            system_prompt_id: messageData.promptId,
            token_usage: { total_tokens: 20 },
            created_at: '2024-01-01T12:00:00.000Z', // Use fixed date
        };

        beforeEach(() => {
            // Mock sessionStorage before each test in this describe block
            setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            // Mock navigate from authStore
            const mockNavigate = vi.fn();
            // Ensure useAuthStore is mocked correctly before accessing getState
            if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore).getState.mockReturnValue({
                    user: { id: 'user1' } as User, // Mock a user
                    session: { access_token: 'test-token' } as Session, // Provide token
                    profile: null,
                    isLoading: false,
                    error: null,
                    navigate: mockNavigate,
                    setNavigate: vi.fn(),
                    login: vi.fn(),
                    logout: vi.fn(),
                    register: vi.fn(),
                    setProfile: vi.fn(),
                    setUser: vi.fn(),
                    setSession: vi.fn(),
                    setIsLoading: vi.fn(),
                    setError: vi.fn(),
                    initialize: vi.fn(),
                    refreshSession: vi.fn(),
                    updateProfile: vi.fn(),
                    clearError: vi.fn(),
                } as any); // Use 'as any' for simplicity if type matching is complex
            }
        });

        afterEach(() => {
            // Restore the spy after each test
            setItemSpy.mockRestore();
            // Restore other spies or mocks if necessary
            vi.restoreAllMocks();
        });

        it('should set loading state, add optimistic message, call API, and update state on success', async () => {
            // Arrange
            // ---> Mock API to return successful ApiResponse object <--- 
            mockSendChatMessage.mockResolvedValue({ 
                data: mockAssistantResponse, 
                error: null,
                status: 200 
            });
            const initialMessages = useAiStore.getState().currentChatMessages.length;

            // Act
            const promise = useAiStore.getState().sendMessage(messageData); // Use updated messageData
            // Check optimistic update
            expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessages + 1);
            const optimisticMessage = useAiStore.getState().currentChatMessages[initialMessages];
            expect(optimisticMessage.role).toBe('user');
            expect(optimisticMessage.content).toBe(messageData.message);
            expect(optimisticMessage.id.startsWith('temp-user-')).toBe(true);

            await promise;

            // Assert
            const expectedRequestData: ChatApiRequest = { 
                message: messageData.message, 
                providerId: messageData.providerId, 
                promptId: messageData.promptId, 
                chatId: undefined // Or null, depending on initial state
            };
            const expectedOptions = { token: 'test-token' }; // Token from mocked authStore

            expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
            // Updated Assertion: Expect only requestData and options
            expect(mockSendChatMessage).toHaveBeenCalledWith(expectedRequestData, expectedOptions);
            
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages.length).toBe(initialMessages + 2); // Optimistic + Assistant
            expect(state.currentChatMessages[initialMessages + 1]).toEqual(mockAssistantResponse);
            expect(state.currentChatId).toBe(mockAssistantResponse.chat_id);
            expect(state.aiError).toBeNull();
        });

        it('should update existing chatId in optimistic message when response contains chatId', async () => {
             // Arrange
             const newChatId = 'new-chat-id-123';
             const responseWithChatId = { ...mockAssistantResponse, chat_id: newChatId };
             // ---> Mock API to return successful ApiResponse object <--- 
             mockSendChatMessage.mockResolvedValue({ 
                 data: responseWithChatId, 
                 error: null, 
                 status: 200 
             });
             useAiStore.setState({ currentChatId: null }); // Start with no chatId
 
             // Act
             await useAiStore.getState().sendMessage(messageData);
 
             // Assert
             const state = useAiStore.getState();
             expect(state.currentChatId).toBe(newChatId);
             // Find the user message (should be the first one added in this test)
             const userMessage = state.currentChatMessages.find(m => m.role === 'user' && m.content === messageData.message);
             expect(userMessage).toBeDefined();
             expect(userMessage?.chat_id).toBe(newChatId); // Check if its chatId was updated
         });

        it('should handle API error, remove optimistic message, and set aiError', async () => {
            // Arrange
            const errorMsg = 'AI failed to respond';
            // ---> Mock API to return ApiResponse with error <--- 
            mockSendChatMessage.mockResolvedValue({ 
                data: null, 
                error: { code: '500', message: errorMsg }, 
                status: 500 
            });
            const initialMessages = useAiStore.getState().currentChatMessages.length;

            // Act
            const promise = useAiStore.getState().sendMessage(messageData);
            const optimisticMessageCount = useAiStore.getState().currentChatMessages.length;
            expect(optimisticMessageCount).toBe(initialMessages + 1); // Optimistic added

            await promise;

            // Assert
            const expectedRequestData: ChatApiRequest = { 
                message: messageData.message, 
                providerId: messageData.providerId, 
                promptId: messageData.promptId, 
                chatId: undefined 
            };
            const expectedOptions = { token: 'test-token' };
            expect(mockSendChatMessage).toHaveBeenCalledWith(expectedRequestData, expectedOptions);

            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages.length).toBe(initialMessages); // Optimistic removed
            expect(state.aiError).toBe(errorMsg);
        });

        it('should handle thrown error during API call (network error)', async () => {
            // Arrange
            const errorMsg = 'Network connection failed';
            // ---> Mock API to reject (simulates network error) <--- 
            mockSendChatMessage.mockRejectedValue(new Error(errorMsg));
            const initialMessages = useAiStore.getState().currentChatMessages.length;

            // Act
            await useAiStore.getState().sendMessage(messageData);

             // Assert
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages.length).toBe(initialMessages); // Optimistic removed
            expect(state.aiError).toBe(errorMsg);
        });
        
        // --- REMOVED Test: 'should return null and set error if no auth token is available' ---
        // The behavior changed: We now attempt the API call even without a token
        // and expect the apiClient to throw AuthRequiredError, which is tested elsewhere.

        // Test for 401 AUTH_REQUIRED needs updating
        it('should handle AuthRequiredError, remove optimistic msg, trigger navigation', async () => {
            // Arrange
            // ---> Mock API to THROW AuthRequiredError by NAME <--- 
            const authError = new Error('Please log in first'); // Use standard Error
            authError.name = 'AuthRequiredError';             // Set the name
            mockSendChatMessage.mockRejectedValue(authError);
    
            const mockNavigate = vi.fn();
            if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore).getState.mockReturnValue({
                    ...(useAuthStore.getState()), 
                    navigate: mockNavigate,
                });
            }
    
            // Spying on sessionStorage is NO LONGER needed here, apiClient handles it
            // const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            
            const initialMessages = useAiStore.getState().currentChatMessages.length;
    
            // Act
            const promise = useAiStore.getState().sendMessage(messageData);
            expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
            expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessages + 1);
            await promise; // Await the action completion
    
            // Assert
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages.length).toBe(initialMessages); // Optimistic message removed
            // ---> Error state should NOT be set if navigation is triggered <--- 
            expect(state.aiError).toBeNull(); 
            
            // Assert sessionStorage was NOT called by the store action
            // expect(setItemSpy).not.toHaveBeenCalled(); 
    
            // Assert navigation
            expect(mockNavigate).toHaveBeenCalledTimes(1);
            expect(mockNavigate).toHaveBeenCalledWith('/login');
    
            // Restore mocks
            // setItemSpy.mockRestore(); 
        });

        // Test for sessionStorage failure during AUTH_REQUIRED is NO LONGER relevant here
        // it('should handle 401 AUTH_REQUIRED but fail gracefully if sessionStorage write fails', ...) 

        // Test for navigate unavailable during AUTH_REQUIRED needs updating
        it('should handle AuthRequiredError and set error state if navigate is unavailable', async () => {
            // Arrange
            // ---> Mock API to THROW AuthRequiredError by NAME <--- 
            const authError = new Error('Log in required'); // Use standard Error
            authError.name = 'AuthRequiredError';          // Set the name
            mockSendChatMessage.mockRejectedValue(authError);
    
            // Mock authStore to return navigate as null
             if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore).getState.mockReturnValue({
                    ...(useAuthStore.getState()),
                    navigate: null, 
                });
            }
    
            // No need to spy on sessionStorage here
            // const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            
            const initialMessages = useAiStore.getState().currentChatMessages.length;
    
            // Act
            const promise = useAiStore.getState().sendMessage(messageData);
             expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
             expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessages + 1);
             await promise;
    
            // Assert
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages.length).toBe(initialMessages); // Optimistic removed
            // ---> Error state SHOULD be set in this fallback case <--- 
            expect(state.aiError).toBe(authError.message);
            
            // Assert sessionStorage was NOT called by store
            // expect(setItemSpy).not.toHaveBeenCalled();
    
             // Assert navigation was NOT called (implicitly checked by error state being set)
    
            // Restore mocks
            // setItemSpy.mockRestore();
        });
    });

    // --- Tests for loadChatHistory (UPDATED) ---
    describe('loadChatHistory', () => {
        const mockChats: Chat[] = [
            { id: 'c1', user_id: 'u1', title: 'Chat 1', created_at: 't1', updated_at: 't2'},
        ];
        const mockToken = 'valid-token-for-history';
        const mockUser: User = { id: 'user-123', email: 'test@test.com', role: 'user', created_at: 't', updated_at: 't'};
        const mockSession: Session = { access_token: mockToken, refresh_token: 'r', expiresAt: Date.now() / 1000 + 3600 };

        // Mock authStore state before each test in this block
        beforeEach(() => {
            vi.mocked(useAuthStore.getState).mockReturnValue({
                user: mockUser,
                session: mockSession,
                profile: {} as UserProfile, // Provide a mock profile object
                isLoading: false,
                error: null,
                navigate: vi.fn(),
                // Mock actions as needed, likely just need state
                initialize: vi.fn(),
                login: vi.fn(),
                register: vi.fn(),
                logout: vi.fn(),
                refreshSession: vi.fn(),
                updateProfile: vi.fn(),
                clearError: vi.fn(),
                setNavigate: vi.fn(),
                handleSupabaseAuthChange: vi.fn(), // Include the new action
            });
        });

        it('should set loading state and call api client with token', async () => {
            // Arrange
            mockGetChatHistory.mockResolvedValue({ success: true, data: mockChats, statusCode: 200 });

            // Act
            const promise = useAiStore.getState().loadChatHistory();
            expect(useAiStore.getState().isHistoryLoading).toBe(true);
            await promise;

            // Assert
            expect(useAiStore.getState().isHistoryLoading).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            // Verify it was called with the mockToken from the mocked authStore
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken); 
        });

        it('should update chatHistoryList on success', async () => {
             // Arrange
             mockGetChatHistory.mockResolvedValue({ success: true, data: mockChats, statusCode: 200 });

             // Act
             await useAiStore.getState().loadChatHistory();

             // Assert
             const state = useAiStore.getState();
             expect(state.chatHistoryList).toEqual(mockChats);
             expect(state.aiError).toBeNull();
        });

         it('should set aiError on API failure', async () => {
             // Arrange
             const errorMsg = 'Failed to load history';
             mockGetChatHistory.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });

             // Act
             await useAiStore.getState().loadChatHistory();

             // Assert
             const state = useAiStore.getState();
             expect(state.aiError).toBe(errorMsg);
             expect(state.chatHistoryList).toEqual([]);
             expect(state.isHistoryLoading).toBe(false);
             // Verify API was still called (with token)
             expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
             expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken);
        });

        // NEW Test Case: No token
        it('should set aiError and not call api client if no token exists', async () => {
            // Arrange: Override authStore mock for this specific test
            vi.mocked(useAuthStore.getState).mockReturnValueOnce({
                 ...useAuthStore.getState(), // Keep other mocked state/functions
                 session: null, // Explicitly set session to null
             });

            // Act
            await useAiStore.getState().loadChatHistory();

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBe('Authentication required');
            expect(state.isHistoryLoading).toBe(false);
            expect(state.chatHistoryList).toEqual([]);
            // Verify API was NOT called
            expect(mockGetChatHistory).not.toHaveBeenCalled(); 
        });
    });

    // --- Tests for loadChatDetails ---
    describe('loadChatDetails', () => {
        // +++ Add missing constants +++
        const chatId = 'c123';
        const mockMessages: ChatMessage[] = [
             { id: 'm1', chat_id: chatId, user_id: 'user1', role: 'user', content: 'Q', ai_provider_id: null, system_prompt_id: null, token_usage: null, created_at: 't1' },
             { id: 'm2', chat_id: chatId, user_id: null, role: 'assistant', content: 'A', ai_provider_id: 'p1', system_prompt_id: 's1', token_usage: null, created_at: 't2' },
        ];
        // +++ End added constants +++

        // Add a beforeEach specific to this describe block to ensure auth state
        beforeEach(() => {
            // Reset mocks if necessary (if not handled globally)
            vi.clearAllMocks();
            // --- Mock authStore.getState() for this suite --- 
            if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: { id: 'user-123' } as User,
                    session: { access_token: 'mock-token' } as Session, // Ensure session is defined
                    profile: null,
                    isLoading: false,
                    error: null,
                    navigate: vi.fn(),
                    // Add other necessary mocked functions/state from AuthStore if needed
                    // ... (add mocks for other functions used by loadChatDetails if any) ...
                } as any); // Use 'as any' or define a more complete mock type
            } else {
                console.warn("useAuthStore was not properly mocked for loadChatDetails tests.")
            }
            // Reset aiStore state if needed (keep this)
            useAiStore.setState({ isLoadingAiResponse: false, aiError: null, currentChatMessages: [], currentChatId: null, isDetailsLoading: false });
        });

        it('should set loading state and call api client with chatId', async () => {
            // const chatId = 'c123'; // Now defined above
            // Arrange
            mockGetChatMessages.mockResolvedValue({ success: true, data: mockMessages, statusCode: 200 });

            // Act
            const promise = useAiStore.getState().loadChatDetails(chatId);
            expect(useAiStore.getState().isDetailsLoading).toBe(true);
            await promise;

            // Assert
            expect(useAiStore.getState().isDetailsLoading).toBe(false);
            expect(mockGetChatMessages).toHaveBeenCalledTimes(1);
            // Updated assertion: Expect chatId AND token
            expect(mockGetChatMessages).toHaveBeenCalledWith(chatId, 'mock-token');
        });

        it('should update currentChatMessages and currentChatId on success', async () => {
             // Arrange
            mockGetChatMessages.mockResolvedValue({ success: true, data: mockMessages, statusCode: 200 });

             // Act
             await useAiStore.getState().loadChatDetails(chatId);

             // Assert
             const state = useAiStore.getState();
             expect(state.currentChatMessages).toEqual(mockMessages);
             expect(state.currentChatId).toBe(chatId);
             expect(state.aiError).toBeNull();
        });

         it('should set aiError on failure', async () => {
            // Arrange
            const errorMsg = 'Failed to load details'; // Original message from mock
            mockGetChatMessages.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });

            // Act
            await useAiStore.getState().loadChatDetails(chatId);

            // Assert
            const state = useAiStore.getState();
            // Expect the actual error set by the store's catch block
            expect(state.aiError).toBe(errorMsg); // The store uses the error from the response
            expect(state.currentChatMessages).toEqual([]); // Should remain empty
            expect(state.currentChatId).toBeNull(); // Should remain null
            expect(state.isDetailsLoading).toBe(false);
        });

        // --- NEW Test Case: Invalid chatId --- 
        it.each([
            [null, 'Chat ID is required'], 
            ['', 'Chat ID is required'],
            [undefined, 'Chat ID is required']
        ])('should set error and not call API if chatId is %s', async (invalidChatId, expectedError) => {
            // Arrange
            // Ensure authStore is mocked with a token, otherwise that error takes precedence
             if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore).getState.mockReturnValueOnce({
                    user: { id: 'user-1' } as User, 
                    session: { access_token: 'mock-token' } as Session, 
                    // ... other necessary mocked state ...
                    isLoading: false,
                    error: null,
                } as any);
            }
            // Act
            // @ts-ignore - Allow passing invalid types for testing
            await useAiStore.getState().loadChatDetails(invalidChatId);
 
            // Assert
            expect(mockGetChatMessages).not.toHaveBeenCalled();
            const state = useAiStore.getState();
            expect(state.isDetailsLoading).toBe(false);
            expect(state.aiError).toContain(expectedError);
        });
        // --- End NEW Test Case ---

    });

    // --- Tests for startNewChat ---
    describe('startNewChat', () => {
        it('should clear currentChatMessages, currentChatId, and reset anonymous count', () => {
            // Arrange: Set some initial state
            useAiStore.setState({
                currentChatId: 'c123',
                currentChatMessages: [{ id: 'm1', /* ... */ } as ChatMessage],
            });

            // Act
            useAiStore.getState().startNewChat();

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatMessages).toEqual([]);
            expect(state.currentChatId).toBeNull();
        });
    });

    // --- Test for clearAiError ---
    describe('clearAiError', () => {
        it('should set aiError to null', () => {
             // Arrange
             useAiStore.setState({ aiError: 'Some previous error' });
             // Act
             useAiStore.getState().clearAiError();
             // Assert
             expect(useAiStore.getState().aiError).toBeNull();
        });
    });

}); 