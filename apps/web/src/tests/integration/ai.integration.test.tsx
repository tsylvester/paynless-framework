import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from '../utils/render'; // Assuming shared render utility
import { useAiStore } from '@paynless/store'; // Import the real store
import { useAuthStore } from '@paynless/store'; // Import auth store for comparison
import { api, ApiClient } from '@paynless/api-client'; // To potentially spy on
import { HttpResponse, http } from 'msw';
import { server } from '../utils/mocks/api/server'; // <<< Use global server import

// --- Debugging: Check if store is imported correctly ---
console.log('Imported useAiStore:', typeof useAiStore, useAiStore);
console.log('Imported useAuthStore:', typeof useAuthStore, useAuthStore);
// --- End Debugging ---

// Mock Components or Pages that might be rendered
// e.g., vi.mock('@/components/Layout', () => ({ default: () => <div>Mock Layout</div> }));

// Mock necessary hooks if components use them internally
// e.g., vi.mock('react-router-dom', async (importOriginal) => {
//     const actual = await importOriginal<typeof import('react-router-dom')>();
//     return {
//         ...actual,
//         useNavigate: () => vi.fn(),
//     };
// });

describe('AI Feature Integration Tests', () => {

    // Define initial state structure locally for resetting
    const initialAiState = {
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
        anonymousMessageCount: 0,
        // Make sure ANONYMOUS_MESSAGE_LIMIT is included if it's part of the state
        ANONYMOUS_MESSAGE_LIMIT: 3, // Ensure this matches the store's value
    };

    // Define initial auth state for comparison reset
    const initialAuthState = {
        user: null,
        session: null,
        profile: null,
        isLoading: false,
        error: null,
        // navigate: null, // Assuming navigate isn't needed for reset
    };

    // <<< Define base URL for MSW handlers - Read from env vars! >>>
    // Ensure your Vitest setup loads .env files (e.g., using dotenv or built-in config)
    const supabaseUrlFromEnv = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrlFromEnv) {
      throw new Error('Test Error: VITE_SUPABASE_URL environment variable not set. Cannot configure MSW handlers.');
    }
    const functionsBaseUrl = `${supabaseUrlFromEnv.replace(/\/$/, '')}/functions/v1`;
    console.log(`[Test Setup] Using functionsBaseUrl for MSW: ${functionsBaseUrl}`);

    // <<< Reinstate mock data definitions >>>
    const mockProviders = [{ id: 'p1', name: 'Provider 1', description: '' }];
    const mockPrompts = [{ id: 's1', name: 'Prompt 1', prompt_text: '' }];
    const mockAssistantResponse = {
        id: 'm2',
        chat_id: 'c123',
        role: 'assistant',
        content: 'Mock response',
        user_id: null,
        ai_provider_id: 'p1',
        system_prompt_id: 's1',
        token_usage: null,
        created_at: new Date().toISOString(),
    };

    // Reset store before each test (Keep Zustand reset)
    beforeEach(() => {
        // server.resetHandlers(); // <<< REMOVE local reset
        act(() => {
            try {
                console.log('Attempting to reset AiStore...');
                useAiStore.setState(initialAiState); // Corrected: Perform shallow merge to preserve actions
                console.log('AiStore reset successful.');
            } catch (e) {
                console.error("Error resetting Zustand store in beforeEach:", e);
            }
        });
        vi.restoreAllMocks();
    });

    it('Placeholder test', () => {
        expect(true).toBe(true);
    });

    // <<< Add MSW Direct Check Test >>>
    it('MSW Direct Check: should intercept direct fetch to ai-providers via GLOBAL handler', async () => {
        // <<< Apply handler FIRST >>> -> REMOVED, rely on global handler
        // server.use(...);

        const url = `${functionsBaseUrl}/ai-providers`;
        console.log('[Test MSW Direct] Fetching URL:', url);

        let response: Response | null = null;
        try {
            response = await fetch(url, {
                headers: {
                    // Simulate headers the apiClient would add
                    'apikey': process.env.VITE_SUPABASE_ANON_KEY || 'dummy-key',
                    'Authorization': 'Bearer mock-token' // Simulate token
                }
            });
            console.log('[Test MSW Direct] Response Status:', response.status);
            const data = await response.json();
            console.log('[Test MSW Direct] Response Data:', data);
            expect(response.ok).toBe(true);
            // Correct assertion: Check against the direct handler payload
            expect(data).toEqual({ providers: [{ id: 'p-global', name: 'Global Provider' }] }); 
        } catch (error) {
             console.error('[Test MSW Direct] Fetch failed:', error);
             // Force failure if fetch throws unexpectedly
             expect(error).toBeNull(); 
        }
    });

    it('Load AI Config: should load providers and prompts into the store via GLOBAL handlers', async () => {
        // <<< Apply handlers FIRST >>> -> REMOVED, rely on global handlers
        // server.use(...);

        // Arrange:
        const { loadAiConfig } = useAiStore.getState();
        const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue('mock-token');
        console.log('[Test Load AI Config] Mocked getToken');

        // Act
        await act(async () => {
            await loadAiConfig();
        });

        // Assert
        const state = useAiStore.getState();
        expect(state.isConfigLoading).toBe(false);
        expect(state.aiError).toBeNull();
        // <<< Check against GLOBAL mock data >>>
        expect(state.availableProviders).toEqual([{ id: 'p-global', name: 'Global Provider' }]); 
        expect(state.availablePrompts).toEqual([{ id: 's-global', name: 'Global Prompt' }]);
    });

    // <<< Un-skip and use vi.spyOn for error test >>>
    it('Load AI Config: should handle errors loading providers (spyOn api)', async () => {
        // <<< Mock apiClient method directly >>>
        const errorResponse: ApiResponse<never> = {
            status: 500,
            error: { code: 'SERVER_ERROR', message: 'Mock Provider Load Error' }
        };
        vi.spyOn(api.ai(), 'getAiProviders').mockResolvedValueOnce(errorResponse);
        // Need to mock prompts to return success for this case
        vi.spyOn(api.ai(), 'getSystemPrompts').mockResolvedValueOnce({ 
            status: 200, 
            data: [{ id: 's-global', name: 'Global Prompt' }] 
        });

        // Arrange:
        const { loadAiConfig } = useAiStore.getState();
        const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue('mock-token');
        console.log('[Test Load AI Config Error] Mocked getToken');

        // Act
        await act(async () => {
            await loadAiConfig();
        });

        // Assert
        const state = useAiStore.getState();
        expect(state.isConfigLoading).toBe(false);
        // Match the specific error message set by the store
        expect(state.aiError).toBe(errorResponse.error?.message); // Check specific error
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]); // Should also be empty if one fails
    });

    // <<< Un-skip and use vi.spyOn for error test >>>
    it('Load AI Config: should handle errors loading prompts (spyOn api)', async () => {
        // <<< Mock apiClient methods directly >>>
        vi.spyOn(api.ai(), 'getAiProviders').mockResolvedValueOnce({ 
            status: 200, 
            data: [{ id: 'p-global', name: 'Global Provider' }] 
        }); // Providers success
        const errorResponse: ApiResponse<never> = {
            status: 500,
            error: { code: 'SERVER_ERROR', message: 'Mock Prompt Load Error' }
        };
        vi.spyOn(api.ai(), 'getSystemPrompts').mockResolvedValueOnce(errorResponse); // Prompts error
        
         // Arrange:
         const { loadAiConfig } = useAiStore.getState();
        const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue('mock-token');
        console.log('[Test Load AI Config Error] Mocked getToken');

        // Act
        await act(async () => {
            await loadAiConfig();
        });

        // Assert
        const state = useAiStore.getState();
        expect(state.isConfigLoading).toBe(false);
        // Match the specific error message set by the store
        expect(state.aiError).toBe(errorResponse.error?.message);
        expect(state.availableProviders).toEqual([]); // Should be empty if one fails
        expect(state.availablePrompts).toEqual([]);
    });

    it('Send Message (Auth): should add user message optimistically, call API, and add response via GLOBAL handler', async () => {
        // <<< Apply handler FIRST >>> -> REMOVED, rely on global handler
        // server.use(...);

        // Arrange:
        const { sendMessage } = useAiStore.getState();
        const messageData = { message: 'Test message', providerId: 'p1', promptId: 's1', isAnonymous: false };
        const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue('mock-token');
        console.log('[Test Send Message Auth] Mocked getToken');

        // Act: Call the action
        const promise = act(async () => {
            // Don't await here, check intermediate state first
            return sendMessage(messageData);
        });

        // Assert: Optimistic state
        let state = useAiStore.getState();
        expect(state.isLoadingAiResponse).toBe(true);
        expect(state.currentChatMessages).toHaveLength(1);
        expect(state.currentChatMessages[0].role).toBe('user');
        expect(state.currentChatMessages[0].content).toBe(messageData.message);

        // Wait for API call and state update
        await promise;

        // Assert: Final state
        state = useAiStore.getState();
        expect(state.isLoadingAiResponse).toBe(false);
        expect(state.aiError).toBeNull();
        expect(state.currentChatMessages).toHaveLength(2);
        const assistantMsg = state.currentChatMessages.find(m => m.role === 'assistant');
        // <<< Check against GLOBAL mock data >>>
        expect(assistantMsg?.content).toBe('Global mock response'); 
        expect(state.currentChatId).toBeDefined(); // Global handler creates/uses chatId
    });

    // <<< Un-skip and use vi.spyOn for error test >>>
    it('Send Message (Error): should set error state and remove optimistic message (spyOn api)', async () => {
        // <<< Mock apiClient method directly >>>
        const errorResponse: ApiResponse<never> = {
            status: 500,
            error: { code: 'SEND_ERROR', message: 'Mock Send Message Error' }
        };
        vi.spyOn(api.ai(), 'sendChatMessage').mockResolvedValueOnce(errorResponse);

        // Arrange: 
        const { sendMessage } = useAiStore.getState();
        const messageData = { message: 'Test message error', providerId: 'p1', promptId: 's1', isAnonymous: false };
        const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue('mock-token');
        console.log('[Test Send Message Error] Mocked getToken');

        // Act: Call the action
         await act(async () => {
            await sendMessage(messageData);
        });

        // Assert: Final state
        let state = useAiStore.getState();
        expect(state.isLoadingAiResponse).toBe(false);
        expect(state.aiError).toBe(errorResponse.error?.message); // <<< Use mocked error message
        expect(state.currentChatMessages).toHaveLength(0); // Optimistic message removed
        expect(state.currentChatId).toBeNull(); // Chat ID shouldn't be set
    });

    // TODO: Add tests from TESTING_PLAN.md Phase 3.2 -> AI Chat

    // <<< Add Anonymous Flow Tests >>>
    describe('Anonymous Flow', () => {
        it('Send Message (Anon < Limit): should send message and increment count', async () => {
            // Arrange
            const { sendMessage, setAnonymousCount } = useAiStore.getState();
            // Ensure count starts below limit (initial state is 0)
            // act(() => { setAnonymousCount(0); }); // Reset just in case, though beforeEach should handle
            const limit = useAiStore.getState().anonymousMessageLimit; // Get limit from store
            console.log('[Test Anon < Limit] Initial count:', useAiStore.getState().anonymousMessageCount, 'Limit:', limit);

            const messageData = { message: 'Anon message 1', providerId: 'p1', promptId: 's1', isAnonymous: true };
            const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue(undefined); // No token for anon
            console.log('[Test Anon < Limit] Mocked getToken -> undefined');

            // Act
            const result = await act(async () => {
                return sendMessage(messageData);
            });

            // Assert: Message sent, count incremented
            expect(result).not.toHaveProperty('error'); // Should not return error object
            expect(result).toHaveProperty('role', 'assistant'); // Should return ChatMessage
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.aiError).toBeNull();
            expect(state.currentChatMessages).toHaveLength(2); // User + Assistant
            expect(state.anonymousMessageCount).toBe(1); // Count incremented
            expect(state.currentChatMessages[0]?.content).toBe(messageData.message);
            expect(state.currentChatMessages[1]?.content).toBe('Global mock response'); // From global handler
        });

        it('Send Message (Anon = Limit): should return limit error and not send', async () => {
             // Arrange
            const { sendMessage, setAnonymousCount } = useAiStore.getState();
            const limit = useAiStore.getState().anonymousMessageLimit;
            act(() => {
                setAnonymousCount(limit); // Set count TO the limit
            });
            console.log('[Test Anon = Limit] Set count to limit:', useAiStore.getState().anonymousMessageCount);

            const messageData = { message: 'Anon message over limit', providerId: 'p1', promptId: 's1', isAnonymous: true };
            const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue(undefined); // No token for anon
            const apiPostSpy = vi.spyOn(api, 'post'); // Spy on api.post to ensure it's NOT called

            // Act
            const result = await act(async () => {
                return sendMessage(messageData);
            });

            // Assert: Limit error returned, state unchanged, API not called
            expect(result).toEqual({ error: 'limit_reached' });
            expect(apiPostSpy).not.toHaveBeenCalled();
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false); // Should not have started loading
            expect(state.aiError).toBeNull();
            expect(state.currentChatMessages).toHaveLength(0); // No optimistic message added
            expect(state.anonymousMessageCount).toBe(limit); // Count remains at limit
        });
    });

    // <<< Add History/Details Tests >>>
    describe('Chat History & Details', () => {
        it('Load Chat History: should load history list for authenticated user', async () => {
            // Arrange:
            // <<< MOCK authStore state for this test >>>
            const mockToken = 'test-auth-token';
            // Use vi.spyOn to mock the getState method for this specific test
            vi.spyOn(useAuthStore, 'getState').mockReturnValueOnce({
                user: { id: 'user-1', email: 'test@example.com', role: 'authenticated', created_at: 't', updated_at: 't' } as any, // Provide mock user
                session: { access_token: mockToken, refresh_token: 'r', expires_at: Date.now() + 3600000, token_type: 'bearer', user: { id: 'user-1'} } as any, // Provide mock session with token
                profile: { id: 'user-1', first_name: 'Test', last_name: 'User' } as any,
                isLoading: false,
                error: null,
                navigate: vi.fn(),
                // Include all actions from the real store signature if needed, mock as vi.fn()
                setUser: vi.fn(), setSession: vi.fn(), setProfile: vi.fn(), setIsLoading: vi.fn(), setError: vi.fn(),
                login: vi.fn(), register: vi.fn(), logout: vi.fn(), initialize: vi.fn(), refreshSession: vi.fn(), updateProfile: vi.fn(), clearError: vi.fn(), setNavigate: vi.fn(), handleSupabaseAuthChange: vi.fn(),
            });
            console.log('[Test History] Mocked authStore state');

            const { loadChatHistory } = useAiStore.getState();

            // Act
            await act(async () => {
                await loadChatHistory();
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.isHistoryLoading).toBe(false);
            // Expect error to be null now
            expect(state.aiError).toBeNull();
            // Check history list based on GLOBAL MSW handler
            expect(state.chatHistoryList).toHaveLength(2); // Assuming global handler returns 2 chats
            expect(state.chatHistoryList[0]?.title).toBe('Chat 1'); // Assuming global handler returns this
        });

        it('Load Chat Details: should load messages for a specific chat', async () => {
             // Arrange
            const { loadChatDetails } = useAiStore.getState();
            const chatIdToLoad = 'chat1';
            const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue('mock-token');
            console.log('[Test Details] Mocked getToken');

            // Act
            await act(async () => {
                await loadChatDetails(chatIdToLoad);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.isDetailsLoading).toBe(false);
            expect(state.aiError).toBeNull();
            expect(state.currentChatId).toBe(chatIdToLoad);
            expect(state.currentChatMessages).toHaveLength(2); // Based on global handler
            expect(state.currentChatMessages[0]?.role).toBe('user');
            expect(state.currentChatMessages[1]?.role).toBe('assistant');
            expect(state.currentChatMessages[0]?.content).toContain(chatIdToLoad);
        });

        // TODO: Add error cases for history/details loading if needed, 
        // potentially using vi.spyOn(api, 'get').mockRejectedValue(...)
    });

}); 