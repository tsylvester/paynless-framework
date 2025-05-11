import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore';
import { selectCurrentChatMessages } from './aiStore.selectors'; // Import the selector
// Import the actual AiApiClient class
import { AiApiClient } from '@paynless/api';
// Mock creators are imported separately ONLY where needed (e.g., in the vi.mock factory)
import { act } from '@testing-library/react';
import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    type ApiResponse as PaynlessApiResponse,
    type ApiError as PaynlessApiError,
} from '@paynless/types';
import { useAuthStore } from './authStore';
import { AuthRequiredError } from '@paynless/types';
import type { ChatApiRequest } from '@paynless/types';

type MockedAiApiClient = {
  getAiProviders: Mock<[string?], Promise<PaynlessApiResponse<AiProvider[]>>>;
  getSystemPrompts: Mock<[string?], Promise<PaynlessApiResponse<SystemPrompt[]>>>;
  sendChatMessage: Mock<[ChatApiRequest, any?], Promise<PaynlessApiResponse<ChatMessage>>>;
  getChatHistory: Mock<[string, (string | null | undefined)?], Promise<PaynlessApiResponse<Chat[]>>>;
  getChatWithMessages: Mock<[string, string, (string | null | undefined)?], Promise<PaynlessApiResponse<{ chat: Chat, messages: ChatMessage[] }>>>;
  deleteChat: Mock<[string, string, (string | null | undefined)?], Promise<PaynlessApiResponse<void>>>;
};

let mockAiApi: MockedAiApiClient;

vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    // Import mock creators directly from the mocks entry point within the factory
    const { createMockAiApiClient: actualCreateMock, resetMockAiApiClient: actualResetMock } = await import('@paynless/api/mocks');
    
    mockAiApi = actualCreateMock() as unknown as MockedAiApiClient;

    const mockSupabaseAuth = {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    };
    const mockSupabaseClient = { auth: mockSupabaseAuth, from: vi.fn().mockReturnThis() }; // Simplified for brevity
    
    const mockApiClientInstance = {
        ai: mockAiApi, 
        organizations: { getOrganization: vi.fn(), updateOrganizationSettings: vi.fn() }, // Simplified
        notifications: { getNotifications: vi.fn(), markAllNotificationsAsRead: vi.fn() }, // Simplified
        billing: { createCheckoutSession: vi.fn(), getSubscriptions: vi.fn() }, // Simplified
        getSupabaseClient: vi.fn(() => mockSupabaseClient),
        get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
        getFunctionsUrl: vi.fn().mockReturnValue('mock-functions-url'),
    };

    return {
        ...actualApiModule, 
        AiApiClient: vi.fn(() => mockAiApi), 
        getApiClient: vi.fn(() => mockApiClientInstance), 
        initializeApiClient: vi.fn(), 
        // Re-export mock creators from the mocks entry point
        createMockAiApiClient: actualCreateMock, 
        resetMockAiApiClient: actualResetMock,
    };
});

vi.mock('./authStore');

const resetAiStore = () => {
    const initialState = initialAiStateValues;
    useAiStore.setState(initialState, true);
};

const mockNavigateGlobal = vi.fn();

describe('aiStore - Misc Actions', () => {
    beforeEach(async () => { // Make beforeEach async
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        if (mockAiApi) {
            // Get the mocked module to access its reset function
            const apiMock = vi.mocked(await import('@paynless/api'));
            apiMock.resetMockAiApiClient(mockAiApi as any);
        }
        act(() => {
             resetAiStore();
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); 
        });
    });

    // --- Tests for startNewChat ---
    describe('startNewChat', () => {
        it('should reset currentChatId and selected messages should be empty', () => {
            act(() => { 
                useAiStore.setState({
                    currentChatId: 'existing-chat-id',
                    messagesByChatId: {
                        'existing-chat-id': [{ id: 'm1', chat_id: 'existing-chat-id', role: 'user' as const, content: 'Old message', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true }],
                    }
                }); 
            });

            act(() => { 
                useAiStore.getState().startNewChat();
            });

            const state = useAiStore.getState();
            expect(state.currentChatId).toBeNull();
            expect(selectCurrentChatMessages(state)).toEqual([]); // Use selector
        });

        it('should reset loading/error states and currentChatId, selected messages should be empty', () => { 
             const initialProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-id-1', config: null, is_active: true, is_enabled: true, provider: null, created_at: '', updated_at: ''}];
             const initialPrompts: SystemPrompt[] = [{ id: 's1', name: 'S1', prompt_text: '', created_at: '', updated_at: '', is_active: true }];
             const initialPersonalChats: Chat[] = [{ id: 'h1', title: 'History 1', user_id: 'u1', created_at: '', updated_at: '', organization_id: null, system_prompt_id: null }];

             act(() => { 
                useAiStore.setState({
                    availableProviders: initialProviders,
                    availablePrompts: initialPrompts,
                    chatsByContext: { personal: initialPersonalChats, orgs: {} },
                    isLoadingAiResponse: true, 
                    aiError: 'Some error', 
                    currentChatId: 'to-be-cleared',
                    messagesByChatId: {
                        'to-be-cleared': [{ id: 'm1', chat_id: 'to-be-cleared', role: 'user' as const, content: 'Old', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true }],
                    }
                }); 
            });

             act(() => {
                useAiStore.getState().startNewChat();
             });

             const state = useAiStore.getState();
             expect(state.currentChatId).toBeNull();
             expect(selectCurrentChatMessages(state)).toEqual([]); // Use selector
             expect(state.availableProviders).toEqual(initialProviders);
             expect(state.availablePrompts).toEqual(initialPrompts);
             expect(state.chatsByContext.personal).toEqual(initialPersonalChats);
             expect(state.isLoadingAiResponse).toBe(false);
             expect(state.aiError).toBeNull(); 
        });
    }); // End startNewChat describe

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
