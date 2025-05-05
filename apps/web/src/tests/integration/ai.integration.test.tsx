import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from '../utils/render'; // Assuming shared render utility
import { useAiStore } from '@paynless/store'; // Import the real store
import { useAuthStore } from '@paynless/store'; // Import auth store for comparison
import { api, ApiClient } from '@paynless/api'; // To potentially spy on
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
        const finalState = useAiStore.getState();
        expect(finalState.isLoadingAiResponse).toBe(false);
        expect(finalState.aiError).toBeNull();
        expect(finalState.currentChatMessages).toHaveLength(2);
        const assistantMsg = finalState.currentChatMessages.find(m => m.role === 'assistant');
        // <<< Check against GLOBAL mock data >>>
        expect(assistantMsg?.content).toBe('Global mock response'); 
        expect(finalState.currentChatId).toBeDefined(); // Global handler creates/uses chatId
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
        const finalState = useAiStore.getState();
        expect(finalState.isLoadingAiResponse).toBe(false);
        expect(finalState.aiError).toBe(errorResponse.error?.message); // <<< Use mocked error message
        expect(finalState.currentChatMessages).toHaveLength(0); // Optimistic message removed
        expect(finalState.currentChatId).toBeNull(); // Chat ID shouldn't be set
    });

    // TODO: Add tests from TESTING_PLAN.md Phase 3.2 -> AI Chat

    describe('Chat History & Details', () => {
        it('Load Chat History: should load history list for authenticated user', async () => {
            // Arrange: Mock auth state
            act(() => {
                useAuthStore.setState({
                    ...initialAuthState, // Use the defined initial state
                    user: { id: 'user-history' },
                    session: { access_token: 'test-auth-token' },
                }, true);
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
            expect(state.aiError).toBeNull();
            expect(state.chatHistoryList).toEqual([ 
                { chat_id: 'global-hist-1', first_message_content: 'Hello from global history' }
            ]); // Check against GLOBAL mock data
        });
        
        it('Load Chat Details: should load messages for a specific chat', async () => {
            // <<< Arrange: Mock auth state SPECIFICALLY for this test >>>
            act(() => {
                useAuthStore.setState({
                    ...initialAuthState,
                    user: { id: 'user-details' },
                    session: { access_token: 'mock-details-token' }, // Use a distinct token if needed
                }, true);
            });
            
            const { loadChatDetails } = useAiStore.getState();
            const chatIdToLoad = 'global-chat-123';
            // <<< REMOVE: Mocking getToken is less reliable than mocking store state >>>
            // const getTokenSpy = vi.spyOn(ApiClient.prototype as any, 'getToken').mockResolvedValue('mock-token');
            // console.log('[Test Details] Mocked getToken');
            
            // Act
            await act(async () => {
                await loadChatDetails(chatIdToLoad);
            });
            
            // Assert
            const state = useAiStore.getState();
            expect(state.isDetailsLoading).toBe(false);
            expect(state.aiError).toBeNull(); // <<< Should be null now
            expect(state.currentChatId).toBe(chatIdToLoad);
            expect(state.currentChatMessages).toEqual([ 
                { id: 'global-msg-1', role: 'user', content: 'Hello from global chat' }
            ]); // Check against GLOBAL mock data
        });
    });

}); 