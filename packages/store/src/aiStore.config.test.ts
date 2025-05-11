import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore';
// Import the actual AiApiClient class and mock creators from the main package entry
import { AiApiClient, createMockAiApiClient, resetMockAiApiClient } from '@paynless/api'; 
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
// import { AuthRequiredError } from '@paynless/types'; // Not used in this file directly currently
// Import dummy provider definitions
import { DUMMY_PROVIDER_ID, dummyProviderDefinition } from './aiStore.dummy';

// --- Removed old manual mock function variables ---
// const mockGetAiProviders = vi.fn();
// const mockGetSystemPrompts = vi.fn();
// ... (other AiApiClient methods if mocked here before)

// --- Create an instance of the shared mock ---
const mockAiApiInstance = createMockAiApiClient();

// --- Update API Mock Factory --- 
vi.mock('@paynless/api', async (importOriginal) => {
    // We don't need actualApiModule here if we explicitly define the mock structure
    // const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    return {
        // Mock the AiApiClient class constructor to return our mock instance
        AiApiClient: vi.fn(() => mockAiApiInstance),
        // Mock the 'api' object singleton that the store uses
        api: {
            // Provide the ai() method which returns our mock instance
            ai: () => mockAiApiInstance,
            // Add other functions/objects on 'api' if the store uses them directly
            // For example, if the store did api.organizations().someMethod(), you'd mock organizations here.
            // If they are not used by the SUT (aiStore.ts for these tests), they can be omitted or simple vi.fn()
            organizations: vi.fn(() => ({ /* mock org methods if needed */ })),
            notifications: vi.fn(() => ({ /* mock notification methods if needed */ })),
            auth: vi.fn(() => ({ /* mock auth methods if needed */ })),
            billing: vi.fn(() => ({ /* mock billing methods if needed */ })),
            // Mock base methods if they are on api directly
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            getSupabaseClient: vi.fn(), // Assuming this might be on api object as per previous linter error context
        },
        // Mock other direct exports from '@paynless/api' if used by the SUT
        initializeApiClient: vi.fn(),
        // IMPORTANT: Do NOT try to re-export createMockAiApiClient or resetMockAiApiClient here
        // as they are imported directly from their file path, not from the '@paynless/api' module entry.
    };
});

// --- Mock the authStore --- (Keep this)
vi.mock('./authStore');

// Updated resetAiStore to align with initialAiStateValues from aiStore.ts
const resetAiStore = () => {
    useAiStore.setState({ ...initialAiStateValues }); // Use imported initial values
};

// Define a global navigate mock
const mockNavigateGlobal = vi.fn();

// Define fully typed mock data for the outer describe block
const fullyTypedMockProviders: AiProvider[] = [
    { 
        id: 'p1', name: 'P1', description: 'Provider 1', api_identifier: 'mock-config-id-1',
        config: null, created_at: new Date().toISOString(), is_active: true, is_enabled: true, 
        provider: 'provider_type_1', updated_at: new Date().toISOString()
    }
];
const fullyTypedMockPrompts: SystemPrompt[] = [
    { 
        id: 's1', name: 'S1', prompt_text: 'System Prompt 1', 
        created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString()
    }
];

describe('aiStore - loadAiConfig', () => {

    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        // Use the shared reset function for the mock API client
        resetMockAiApiClient(mockAiApiInstance);
        act(() => {
             resetAiStore();
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); 
        });
        // --- Setup default successful responses for the mock API --- 
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: { providers: fullyTypedMockProviders }, 
            status: 200,
            error: null
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: { prompts: fullyTypedMockPrompts }, 
            status: 200, 
            error: null
        });
    });

    // --- Tests for loadAiConfig --- 
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
        expect(mockAiApiInstance.getAiProviders).toHaveBeenCalledTimes(1);
        expect(mockAiApiInstance.getSystemPrompts).toHaveBeenCalledTimes(1);
    });

    it('should update availableProviders and availablePrompts on success', async () => {
         // Arrange (Default mocks in beforeEach handle success)

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.availableProviders).toEqual(fullyTypedMockProviders);
        expect(state.availablePrompts).toEqual(fullyTypedMockPrompts);
        expect(state.aiError).toBeNull();
    });

    it('should set aiError if getAiProviders fails', async () => {
         // Arrange
        const errorMsg = 'Failed to load AI providers.';
        // Override default mock for this test case
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: errorMsg } 
        });
        // Keep prompts success mock from beforeEach
        // mockAiApiInstance.getSystemPrompts.mockResolvedValue({ ... }); 

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
         // mockAiApiInstance.getAiProviders.mockResolvedValue({ ... }); 
         // Override default mock for prompts
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
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
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: null, 
            status: 500, 
            error: { message: providersErrorMsg } 
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
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

// --- Tests for Dummy Provider Configuration in loadAiConfig ---
describe('aiStore - loadAiConfig - Dummy Provider', () => {
    // Define local, fully-typed mock data for standard API calls within this describe block
    const localMockProviders: AiProvider[] = [
        { 
            id: 'lp1', name: 'Local P1', description: 'Local Provider 1', api_identifier: 'local-mock-id-1',
            config: null, created_at: new Date().toISOString(), is_active: true, is_enabled: true, 
            provider: 'local_provider_type', updated_at: new Date().toISOString()
        }
    ];
    const localMockPrompts: SystemPrompt[] = [
        { 
            id: 'ls1', name: 'Local S1', prompt_text: 'Local System Prompt 1', 
            created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString()
        }
    ];

    let originalNodeEnv: string | undefined;

    beforeEach(() => {
        vi.clearAllMocks(); // Clear mocks for this describe block specifically
        vi.restoreAllMocks();
        resetMockAiApiClient(mockAiApiInstance); // Reset the shared API mock
        act(() => {
            resetAiStore(); 
            const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
            useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true);
        });
        // Mock API responses using local, fully-typed data for this block
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: { providers: localMockProviders }, 
            status: 200,
            error: null
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: { prompts: localMockPrompts }, 
            status: 200, 
            error: null
        });

        originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('should add Dummy Test Provider to availableProviders in development mode', async () => {
        // Arrange
        process.env.NODE_ENV = 'development';

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        const expectedProviders = [...localMockProviders, dummyProviderDefinition];
        // Check if all expected providers are present, including the dummy one.
        // Order might not be guaranteed, so check for containment.
        expect(state.availableProviders).toEqual(expect.arrayContaining(expectedProviders));
        expect(state.availableProviders.length).toBe(expectedProviders.length);

        const foundDummy = state.availableProviders.find(p => p.id === DUMMY_PROVIDER_ID);
        expect(foundDummy).toBeDefined();
        // For a more precise match of the dummy provider itself if needed:
        // expect(foundDummy).toMatchObject(dummyProviderDefinition); // toMatchObject is good for partials
        expect(foundDummy).toEqual(dummyProviderDefinition); // For exact match
    });

    it('should NOT add Dummy Test Provider to availableProviders in production mode', async () => {
        // Arrange
        process.env.NODE_ENV = 'production';

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.availableProviders).toEqual(localMockProviders); // Only local mock providers
        const foundDummy = state.availableProviders.find(p => p.id === DUMMY_PROVIDER_ID);
        expect(foundDummy).toBeUndefined();
    });

    it('should still load standard local prompts in development mode when dummy provider is added', async () => {
        // Arrange
        process.env.NODE_ENV = 'development';

        // Act
        await useAiStore.getState().loadAiConfig();

        // Assert
        const state = useAiStore.getState();
        expect(state.availablePrompts).toEqual(localMockPrompts);
    });
});
