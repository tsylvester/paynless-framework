import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from '../utils/render'; // Assuming shared render utility
import { useAiStore } from '@paynless/store'; // Import the real store
import { api } from '@paynless/api-client'; // To potentially spy on
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/api/server'; // Import MSW server

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

    // Reset store and potentially MSW handlers before each test
    beforeEach(() => {
        // Reset Zustand store state
        act(() => {
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
                anonymousMessageCount: 0,
             });
        });
        // Reset any runtime request handlers setup in tests.
        server.resetHandlers();
    });

    // Mock API Endpoints using MSW
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

    // Default handlers - these can be overridden in specific tests
    const defaultHandlers = [
        http.get('/api/ai-providers', () => {
            return HttpResponse.json(mockProviders);
        }),
        http.get('/api/system-prompts', () => {
            return HttpResponse.json(mockPrompts);
        }),
        http.post('/api/chat', async ({ request }) => {
            // Basic success response, can add logic later if needed
            return HttpResponse.json(mockAssistantResponse);
        }),
        // Add handlers for /chat-history, /chat-details as needed
    ];

    server.use(...defaultHandlers); // Use default handlers for all tests in this suite

    it('Placeholder test', () => {
        expect(true).toBe(true);
    });

    it('Load AI Config: should load providers and prompts into the store', async () => {
        // Arrange: MSW handlers are already set up in defaultHandlers
        const { loadAiConfig } = useAiStore.getState();

        // Act
        await act(async () => {
            await loadAiConfig();
        });

        // Assert
        const state = useAiStore.getState();
        expect(state.isConfigLoading).toBe(false);
        expect(state.aiError).toBeNull();
        expect(state.availableProviders).toEqual(mockProviders);
        expect(state.availablePrompts).toEqual(mockPrompts);
    });

    it('Load AI Config: should handle errors loading providers', async () => {
        // Arrange: Override the provider handler to return an error
        server.use(
            http.get('/api/ai-providers', () => {
                return new HttpResponse('Failed to load providers', { status: 500 });
            })
        );
        const { loadAiConfig } = useAiStore.getState();

        // Act
        await act(async () => {
            await loadAiConfig();
        });

        // Assert
        const state = useAiStore.getState();
        expect(state.isConfigLoading).toBe(false);
        // Match the specific error message set by the store
        expect(state.aiError).toContain('Failed to load AI providers.'); 
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]); // Should also be empty if one fails
    });

    it('Load AI Config: should handle errors loading prompts', async () => {
        // Arrange: Override the prompt handler to return an error
        server.use(
            http.get('/api/system-prompts', () => {
                return new HttpResponse('Failed to load prompts', { status: 500 });
            })
        );
         const { loadAiConfig } = useAiStore.getState();

        // Act
        await act(async () => {
            await loadAiConfig();
        });

        // Assert
        const state = useAiStore.getState();
        expect(state.isConfigLoading).toBe(false);
        // Match the specific error message set by the store
        expect(state.aiError).toContain('Failed to load system prompts.'); 
        expect(state.availableProviders).toEqual([]); // Should be empty if one fails
        expect(state.availablePrompts).toEqual([]);
    });

    it('Send Message (Auth): should add user message optimistically, call API, and add response', async () => {
        // Arrange
        const { sendMessage } = useAiStore.getState();
        const messageData = { message: 'Test message', providerId: 'p1', promptId: 's1', isAnonymous: false };

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
        expect(assistantMsg?.content).toBe(mockAssistantResponse.content);
        expect(state.currentChatId).toBe(mockAssistantResponse.chat_id); // Assuming new chat
    });

    it('Send Message (Error): should set error state and remove optimistic message', async () => {
        // Arrange: Override chat handler to return an error
        const errorMsg = 'Failed sending message';
        server.use(
            http.post('/api/chat', () => {
                return new HttpResponse(errorMsg, { status: 500 });
            })
        );
        const { sendMessage } = useAiStore.getState();
        const messageData = { message: 'Test message error', providerId: 'p1', promptId: 's1', isAnonymous: false };

        // Act: Call the action
         const promise = act(async () => {
            return sendMessage(messageData);
        });

        // Assert: Optimistic state
        let state = useAiStore.getState();
        expect(state.isLoadingAiResponse).toBe(true);
        expect(state.currentChatMessages).toHaveLength(1);

        // Wait for API call and state update
        await promise;

        // Assert: Final state
        state = useAiStore.getState();
        expect(state.isLoadingAiResponse).toBe(false);
        expect(state.aiError).toBe(errorMsg); 
        expect(state.currentChatMessages).toHaveLength(0); // Optimistic message removed
        expect(state.currentChatId).toBeNull(); // Chat ID shouldn't be set
    });

    // TODO: Add tests from TESTING_PLAN.md Phase 3.2 -> AI Chat

}); 