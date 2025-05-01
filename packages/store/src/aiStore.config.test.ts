import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore } from './aiStore';
// Import the actual AiApiClient class
import { AiApiClient } from '@paynless/api'; 
// Import the shared mock factory and reset function
import { createMockAiApiClient, resetMockAiApiClient } from '@paynless/api/mocks/ai.api.mock';
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

// --- Removed old manual mock function variables ---
// const mockGetAiProviders = vi.fn();
// const mockGetSystemPrompts = vi.fn();
// ... (other AiApiClient methods if mocked here before)

// --- Create an instance of the shared mock ---
const mockAiApi = createMockAiApiClient();

// --- Update API Mock Factory --- 
vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actualApiModule, 
        // Override AiApiClient with a factory returning our mock instance
        AiApiClient: vi.fn(() => mockAiApi),
        // Mock the 'api' object
        api: {
            ...actualApiModule.api,
            // Replace with a function returning the mock instance
            ai: () => mockAiApi, 
            // Add mocks for other api parts if needed
            organizations: vi.fn(),
            notifications: vi.fn(),
            // ... other potential api parts
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

    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        // Use the shared reset function for the mock API client
        resetMockAiApiClient(mockAiApi);
        act(() => {
             resetAiStore();
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); 
        });
        // --- Setup default successful responses for the mock API --- 
        mockAiApi.getAiProviders.mockResolvedValue({ 
            data: { providers: mockProviders }, 
            status: 200,
            error: null
        });
        mockAiApi.getSystemPrompts.mockResolvedValue({ 
            data: { prompts: mockPrompts }, 
            status: 200, 
            error: null
        });
    });

    // --- Tests for loadAiConfig --- 
    const mockProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-config-id-1' }];
    const mockPrompts: SystemPrompt[] = [{ id: 's1', name: 'S1', prompt_text: '' }];

    it('should set loading state to true initially and false on completion', async () => {
        // Arrange (Default mocks in beforeEach handle success)

        // Act
        let promise;
        act(() => {
            promise = useAiStore.getState().loadAiConfig();
        });
        expect(useAiStore.getState().isConfigLoading).toBe(true); 
        await promise; 

        // Assert
        expect(useAiStore.getState().isConfigLoading).toBe(false);
    });

    it('should call getAiProviders and getSystemPrompts via mocked api', async () => {
         // Arrange (Default mocks in beforeEach handle success)

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        // Use the shared mock instance for assertions
        expect(mockAiApi.getAiProviders).toHaveBeenCalledTimes(1);
        expect(mockAiApi.getSystemPrompts).toHaveBeenCalledTimes(1);
    });

    it('should update availableProviders and availablePrompts on success', async () => {
         // Arrange (Default mocks in beforeEach handle success)

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
        // Override default mock for this test case
        mockAiApi.getAiProviders.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: errorMsg } 
        });
        // Keep prompts success mock from beforeEach
        // mockAiApi.getSystemPrompts.mockResolvedValue({ ... }); 

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.aiError).toBe(errorMsg); 
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]); // Expect prompts to be empty too on failure
        expect(state.isConfigLoading).toBe(false);
    });

     it('should set aiError if getSystemPrompts fails', async () => {
         // Arrange
        const errorMsg = 'Failed to load system prompts.';
         // Keep providers success mock from beforeEach
         // mockAiApi.getAiProviders.mockResolvedValue({ ... }); 
         // Override default mock for prompts
        mockAiApi.getSystemPrompts.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: errorMsg } 
        });

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.aiError).toBe(errorMsg); 
        expect(state.availableProviders).toEqual([]); // Expect providers to be empty too on failure
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });

    it('should set combined aiError if both getAiProviders and getSystemPrompts fail', async () => {
        // Arrange
        const providersErrorMsg = 'Providers down';
        const promptsErrorMsg = 'Prompts MIA';
        // Override default mocks for both
        mockAiApi.getAiProviders.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: providersErrorMsg } 
        });
        mockAiApi.getSystemPrompts.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: promptsErrorMsg } 
        });

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.aiError).toContain(providersErrorMsg);
        expect(state.aiError).toContain(promptsErrorMsg);
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });

}); // End main describe block
