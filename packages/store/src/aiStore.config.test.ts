import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore } from './aiStore';
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import {
    AiProvider,
    SystemPrompt,
    // Import only types used in these tests
    // Chat,
    // ChatMessage,
    // ChatApiRequest,
    // ApiResponse,
    // User,
    // Session,
    // UserProfile,
    // UserRole
} from '@paynless/types';
import { useAuthStore } from './authStore';
import { AuthRequiredError } from '@paynless/types';

// --- Restore API Client Factory Mock --- 
const mockGetAiProviders = vi.fn();
const mockGetSystemPrompts = vi.fn();
const mockSendChatMessage = vi.fn(); 
const mockGetChatHistory = vi.fn();
const mockGetChatMessages = vi.fn(); 

vi.mock('@paynless/api-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api-client')>();
    return {
        ...actual, 
        api: {
            ...actual.api,
            ai: () => ({
                getAiProviders: mockGetAiProviders, // Use mock function
                getSystemPrompts: mockGetSystemPrompts, // Use mock function
                sendChatMessage: mockSendChatMessage,
                getChatHistory: mockGetChatHistory,
                getChatMessages: mockGetChatMessages,
            }),
            auth: () => ({}), 
            billing: () => ({}),
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
        initializeApiClient: vi.fn(), 
    };
});

// --- Mock the authStore --- (Keep this)
vi.mock('./authStore');

// Helper to reset Zustand store state between tests (manual reset)
const resetAiStore = () => {
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
    }); // Merge state
};

// Define a global navigate mock
const mockNavigateGlobal = vi.fn();

describe('aiStore - loadAiConfig', () => {
    // Remove spy instance variables
    // let getAiProvidersSpy: SpyInstance;
    // let getSystemPromptsSpy: SpyInstance;

    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        act(() => {
             resetAiStore();
             // Reset authStore state but preserve/set navigate
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); // Replace state but include global navigate
        });
        // REMOVE Spy setup
        // getAiProvidersSpy = vi.spyOn(api.ai(), 'getAiProviders');
        // getSystemPromptsSpy = vi.spyOn(api.ai(), 'getSystemPrompts');
    });

    // --- Tests for loadAiConfig --- 
    const mockProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-config-id-1' }];
    const mockPrompts: SystemPrompt[] = [{ id: 's1', name: 'S1', prompt_text: '' }];

    it('should set loading state to true initially and false on completion', async () => {
        // Arrange
        // Use mock functions directly
        mockGetAiProviders.mockResolvedValue({ 
            data: { providers: mockProviders }, 
            status: 200,
            error: null
        });
        mockGetSystemPrompts.mockResolvedValue({ 
            data: { prompts: mockPrompts }, 
            status: 200, 
            error: null
        });

        // Act
        // Wrap action call in act if it causes state updates
        let promise;
        act(() => {
            promise = useAiStore.getState().loadAiConfig();
        });
        expect(useAiStore.getState().isConfigLoading).toBe(true); // Check initial sync state change
        await promise; // Wait for async action to complete

        // Assert
        expect(useAiStore.getState().isConfigLoading).toBe(false);
    });

    it('should call getAiProviders and getSystemPrompts via mocked api', async () => {
         // Arrange
         // Use mock functions directly
        mockGetAiProviders.mockResolvedValue({ data: { providers: mockProviders }, status: 200, error: null });
        mockGetSystemPrompts.mockResolvedValue({ data: { prompts: mockPrompts }, status: 200, error: null });

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        // Use mock functions directly
        expect(mockGetAiProviders).toHaveBeenCalledTimes(1);
        expect(mockGetSystemPrompts).toHaveBeenCalledTimes(1);
    });

    it('should update availableProviders and availablePrompts on success', async () => {
         // Arrange
         // Use mock functions directly
        mockGetAiProviders.mockResolvedValue({ 
            data: { providers: mockProviders }, 
            status: 200,
            error: null
        });
        mockGetSystemPrompts.mockResolvedValue({ 
            data: { prompts: mockPrompts }, 
            status: 200,
            error: null
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
        const errorMsg = 'Failed to load AI providers.';
        // Use mock functions directly
        mockGetAiProviders.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: errorMsg } 
        });
        mockGetSystemPrompts.mockResolvedValue({ 
            data: { prompts: mockPrompts }, 
            status: 200, 
            error: null
        }); 

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.aiError).toBe(errorMsg); // Store logic uses error.message
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]); // Neither should be updated if one fails
        expect(state.isConfigLoading).toBe(false);
    });

     it('should set aiError if getSystemPrompts fails', async () => {
         // Arrange
        const errorMsg = 'Failed to load system prompts.';
         // Use mock functions directly
        mockGetAiProviders.mockResolvedValue({ 
            data: { providers: mockProviders }, 
            status: 200,
            error: null
        }); 
        mockGetSystemPrompts.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: errorMsg } 
        });

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.aiError).toBe(errorMsg); // Store logic uses error.message
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });

    it('should set combined aiError if both getAiProviders and getSystemPrompts fail', async () => {
        // Arrange
        const providersErrorMsg = 'Providers down';
        const promptsErrorMsg = 'Prompts MIA';
        // Use mock functions directly
        mockGetAiProviders.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: providersErrorMsg } 
        });
        mockGetSystemPrompts.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: promptsErrorMsg } 
        });

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        // Store logic combines messages with \n
        expect(state.aiError).toContain(providersErrorMsg);
        expect(state.aiError).toContain(promptsErrorMsg);
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });

}); // End main describe block
