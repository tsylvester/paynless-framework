import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore, initialAiStateValues } from './aiStore';
import { AiApiClient } from '@paynless/api'; 
import { 
    MockedAiApiClient, 
    createMockAiApiClient, 
    resetMockAiApiClient 
} from '@paynless/api/mocks'; 
import { act } from '@testing-library/react';
import {
    AiProvider,
    SystemPrompt,
    type ApiResponse as PaynlessApiResponse
} from '@paynless/types';
import { useAuthStore } from './authStore';
import { DUMMY_PROVIDER_ID, dummyProviderDefinition } from './aiStore.dummy';

let mockAiApiInstance: MockedAiApiClient;

vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    
    const { createMockAiApiClient: actualCreator } = await import('@paynless/api/mocks');
    
    const instance = actualCreator();

    const mockSupabaseAuth = {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    };
    const mockSupabaseClient = {
        auth: mockSupabaseAuth, from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
    };
    
    const mockApiClientInstance = {
        ai: instance, 
        organizations: { 
            getOrganization: vi.fn(), getOrganizations: vi.fn(), createOrganization: vi.fn(),
            updateOrganization: vi.fn(), deleteOrganization: vi.fn(), getOrganizationMembers: vi.fn(),
            inviteUserToOrganization: vi.fn(), removeUserFromOrganization: vi.fn(),
            updateUserRoleInOrganization: vi.fn(), getOrganizationSettings: vi.fn(),
            updateOrganizationSettings: vi.fn(),
        },
        notifications: { 
            getNotifications: vi.fn(), markNotificationAsRead: vi.fn(), markAllNotificationsAsRead: vi.fn(),
        },
        billing: { 
            createCheckoutSession: vi.fn(), getCustomerPortalUrl: vi.fn(), getSubscriptions: vi.fn(),
        },
        getSupabaseClient: vi.fn(() => mockSupabaseClient),
        get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
        getFunctionsUrl: vi.fn().mockReturnValue('mock-functions-url'),
    };

    return {
        ...actualApiModule, 
        AiApiClient: vi.fn(() => instance),
        getApiClient: vi.fn(() => mockApiClientInstance),
        initializeApiClient: vi.fn(),
        __mockAiApiInstance: instance,
        
        api: {
            ai: () => instance,
        }
    };
});

vi.mock('./authStore');

const resetAiStore = () => {
    useAiStore.setState({ ...initialAiStateValues });
};

const mockNavigateGlobal = vi.fn();

const fullyTypedMockProviders: AiProvider[] = [
    { id: 'p1', name: 'P1', description: 'Provider 1', api_identifier: 'mock-config-id-1', config: null, created_at: new Date().toISOString(), is_active: true, is_enabled: true, provider: 'provider_type_1', updated_at: new Date().toISOString() }
];
const fullyTypedMockPrompts: SystemPrompt[] = [
    { id: 's1', name: 'S1', prompt_text: 'System Prompt 1', created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString() }
];

describe('aiStore - loadAiConfig', () => {
    beforeEach(async () => {
        const { __mockAiApiInstance } = await import('@paynless/api') as any;
        mockAiApiInstance = __mockAiApiInstance as MockedAiApiClient;

        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        if (mockAiApiInstance) {
            resetMockAiApiClient(mockAiApiInstance); 
        }
        act(() => {
             resetAiStore();
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); 
        });
        
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: { providers: [...fullyTypedMockProviders] } as any,
            status: 200,
            error: undefined
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: { prompts: [...fullyTypedMockPrompts] } as any,
            status: 200, 
            error: undefined
        });
    });

    it('should set loading state to true initially and false on completion', async () => {
        let promise;
        act(() => {
            promise = useAiStore.getState().loadAiConfig();
        });
        expect(useAiStore.getState().isConfigLoading).toBe(true); 
        await promise; 
        expect(useAiStore.getState().isConfigLoading).toBe(false);
    });

    it('should call getAiProviders and getSystemPrompts via mocked api', async () => {
        await useAiStore.getState().loadAiConfig();
        expect(mockAiApiInstance.getAiProviders).toHaveBeenCalledTimes(1);
        expect(mockAiApiInstance.getSystemPrompts).toHaveBeenCalledTimes(1);
    });

    it('should update availableProviders and availablePrompts on success', async () => {
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.availableProviders).toEqual(fullyTypedMockProviders);
        expect(state.availablePrompts).toEqual(fullyTypedMockPrompts);
        expect(state.aiError).toBeNull();
    });

    it('should set aiError if getAiProviders fails', async () => {
        const errorMsg = 'Failed to load AI providers.';
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: undefined, status: 500, error: { message: errorMsg, code: 'PROVIDER_LOAD_ERROR' }
        });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.aiError).toBe(errorMsg); 
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });

     it('should set aiError if getSystemPrompts fails', async () => {
        const errorMsg = 'Failed to load system prompts.';
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: undefined, status: 500, error: { message: errorMsg, code: 'PROMPT_LOAD_ERROR' }
        });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.aiError).toBe(errorMsg); 
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });

    it('should set combined aiError if both getAiProviders and getSystemPrompts fail', async () => {
        const providersErrorMsg = 'Provider fetch failed.';
        const promptsErrorMsg = 'Prompt fetch failed.';
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: undefined, status: 500, error: { message: providersErrorMsg, code: 'PROVIDER_FETCH_ERROR' }
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: undefined, status: 500, error: { message: promptsErrorMsg, code: 'PROMPT_FETCH_ERROR' }
        });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.aiError).toContain(providersErrorMsg);
        expect(state.aiError).toContain(promptsErrorMsg);
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });

    it('should clear aiError on successful subsequent loadAiConfig', async () => {
        const errorMsg = 'Initial load failure.';
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: undefined, 
            status: 500, 
            error: { message: errorMsg, code: 'INITIAL_LOAD_ERROR' }
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: undefined, 
            status: 500, 
            error: { message: 'Prompt load failure for this part of test', code: 'PROMPT_ERROR' }
        });
        await useAiStore.getState().loadAiConfig();
        expect(useAiStore.getState().aiError).toBe(errorMsg + " \n" + "Prompt load failure for this part of test");

        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: { providers: [...fullyTypedMockProviders] } as any,
            status: 200, error: undefined
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: { prompts: [...fullyTypedMockPrompts] } as any,
            status: 200, error: undefined
        });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.aiError).toBeNull();
        expect(state.availableProviders).toEqual(fullyTypedMockProviders);
        expect(state.availablePrompts).toEqual(fullyTypedMockPrompts);
    });
});

describe('aiStore - loadAiConfig - Dummy Provider', () => {
    const localMockProviders: AiProvider[] = [
        { id: 'lp1', name: 'Local P1', description: 'Local Provider 1', api_identifier: 'local-mock-id-1', config: null, created_at: new Date().toISOString(), is_active: true, is_enabled: true, provider: 'local_provider_type', updated_at: new Date().toISOString() }
    ];
    const localMockPrompts: SystemPrompt[] = [
        { id: 'ls1', name: 'Local S1', prompt_text: 'Local System Prompt 1', created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString() }
    ];
    let originalNodeEnv: string | undefined;

    beforeEach(async () => {
        const { __mockAiApiInstance } = await import('@paynless/api') as any;
        mockAiApiInstance = __mockAiApiInstance as MockedAiApiClient;
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        if (mockAiApiInstance) {
            resetMockAiApiClient(mockAiApiInstance); 
        }
        act(() => {
            resetAiStore(); 
            const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
            useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true);
        });
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: { providers: [...localMockProviders] } as any,
            status: 200, error: undefined
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: { prompts: [...localMockPrompts] } as any,
            status: 200, error: undefined
        });
        originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('should add Dummy Test Provider to availableProviders in development mode', async () => {
        process.env.NODE_ENV = 'development';
        mockAiApiInstance.getAiProviders.mockResolvedValue({ data: { providers: [] } as any, status: 200, error: undefined });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ data: { prompts: [] } as any, status: 200, error: undefined });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        const expectedProviders = [dummyProviderDefinition]; 
        expect(state.availableProviders).toEqual(expectedProviders);
        const foundDummy = state.availableProviders.find(p => p.id === DUMMY_PROVIDER_ID);
        expect(foundDummy).toBeDefined();
        expect(foundDummy).toEqual(dummyProviderDefinition);
    });

    it('should include dummy provider ALONGSIDE fetched providers in development mode', async () => {
        process.env.NODE_ENV = 'development';
        mockAiApiInstance.getAiProviders.mockResolvedValue({ data: { providers: [...localMockProviders] } as any, status: 200, error: undefined });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ data: { prompts: [...localMockPrompts] } as any, status: 200, error: undefined });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        const expectedProviders = [...localMockProviders, dummyProviderDefinition];
        expect(state.availableProviders).toEqual(expect.arrayContaining(expectedProviders));
        expect(state.availableProviders.length).toBe(expectedProviders.length);
        const foundDummy = state.availableProviders.find(p => p.id === DUMMY_PROVIDER_ID);
        expect(foundDummy).toBeDefined();
        const foundLocal = state.availableProviders.find(p => p.id === localMockProviders[0].id);
        expect(foundLocal).toBeDefined();
    });

    it('should NOT add Dummy Test Provider to availableProviders in production mode', async () => {
        process.env.NODE_ENV = 'production';
        mockAiApiInstance.getAiProviders.mockResolvedValue({ data: { providers: [...localMockProviders] } as any, status: 200, error: undefined });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ data: { prompts: [...localMockPrompts] } as any, status: 200, error: undefined });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.availableProviders).toEqual(localMockProviders); 
        const foundDummy = state.availableProviders.find(p => p.id === DUMMY_PROVIDER_ID);
        expect(foundDummy).toBeUndefined();
    });

    it('should still load standard local prompts in development mode when dummy provider is added', async () => {
        process.env.NODE_ENV = 'development';
        mockAiApiInstance.getAiProviders.mockResolvedValue({ data: { providers: [...localMockProviders] } as any, status: 200, error: undefined });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ data: { prompts: [...localMockPrompts] } as any, status: 200, error: undefined });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.availablePrompts).toEqual(localMockPrompts);
    });
});
