import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAiStore } from './aiStore';
import { 
    MockedAiApiClient, 
    resetMockAiApiClient,
    createMockAiApiClient
} from '@paynless/api/mocks'; 
import { act } from '@testing-library/react';
import {
    AiProvider,
    initialAiStateValues,
    SystemPrompt,
    User,
    Session,
} from '@paynless/types';
import { useAuthStore } from './authStore';

vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    const { createMockAiApiClient } = await import('@paynless/api/mocks');
    
    const instance = createMockAiApiClient();

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
        
        api: {
            ai: () => instance,
        }
    };
});

const getMockAiApiInstance = async () => {
    const { api } = await import('@paynless/api');
    return vi.mocked(api.ai());
};

vi.mock('./authStore');

const resetAiStore = () => {
    useAiStore.setState({ ...initialAiStateValues });
};

const mockNavigateGlobal = vi.fn();

const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
};

const mockSession: Session = {
    access_token: 'mock-token',
    refresh_token: 'mock-refresh-token',
    expiresAt: Date.now() + 3600000,
};

const fullyTypedMockProviders: AiProvider[] = [
    { 
        id: 'p1', 
        name: 'P1', 
        description: 'Provider 1', 
        api_identifier: 'mock-config-id-1', 
        config: null, 
        created_at: new Date().toISOString(), 
        is_active: true, 
        is_enabled: true, 
        provider: 'provider_type_1', 
        updated_at: new Date().toISOString(),
        is_default_embedding: false
    }
];
const fullyTypedMockPrompts: SystemPrompt[] = [
    { 
        id: 's1', 
        name: 'S1', 
        prompt_text: 'System Prompt 1', 
        created_at: new Date().toISOString(), 
        is_active: true, 
        updated_at: new Date().toISOString(),
        description: 'System Prompt 1',
        document_template_id: null,
        user_selectable: true,
        version: 1
    }
];

describe('aiStore - loadAiConfig', () => {
    beforeEach(async () => {
        const mockAiApiInstance = await getMockAiApiInstance();
        
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        resetMockAiApiClient(mockAiApiInstance); 
        
        act(() => {
             resetAiStore();
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             if (vi.isMockFunction(useAuthStore.getState)) {
                 vi.mocked(useAuthStore.getState).mockReturnValue({
                     ...initialAuthState,
                     user: mockUser,
                     session: mockSession,
                     navigate: mockNavigateGlobal
                 });
             }
             useAuthStore.setState({ 
                 ...initialAuthState, 
                 user: mockUser,
                 session: mockSession,
                 navigate: mockNavigateGlobal 
             }, true); 
        });
        
        mockAiApiInstance.getAiProviders.mockResolvedValue({ 
            data: [...fullyTypedMockProviders],
            status: 200,
            error: undefined
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({ 
            data: [...fullyTypedMockPrompts],
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
        const mockAiApiInstance = await getMockAiApiInstance();
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
        const mockAiApiInstance = await getMockAiApiInstance();
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
        const mockAiApiInstance = await getMockAiApiInstance();
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
        const mockAiApiInstance = await getMockAiApiInstance();
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
        const mockAiApiInstance = await getMockAiApiInstance();
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
        expect(useAiStore.getState().aiError).toBe(errorMsg + " " + "Prompt load failure for this part of test");

        mockAiApiInstance.getAiProviders.mockResolvedValue({
            data: [...fullyTypedMockProviders],
            status: 200, error: undefined
        });
        mockAiApiInstance.getSystemPrompts.mockResolvedValue({
            data: [...fullyTypedMockPrompts],
            status: 200, error: undefined
        });
        await useAiStore.getState().loadAiConfig();
        const state = useAiStore.getState();
        expect(state.aiError).toBeNull();
        expect(state.availableProviders).toEqual(fullyTypedMockProviders);
        expect(state.availablePrompts).toEqual(fullyTypedMockPrompts);
    });

    it('should not make API calls when user is not authenticated', async () => {
        const mockAiApiInstance = await getMockAiApiInstance();
        
        act(() => {
            if (vi.isMockFunction(useAuthStore.getState)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: null,
                    session: null,
                    profile: null,
                    isLoading: false,
                    error: null,
                    navigate: mockNavigateGlobal
                });
            }
            useAuthStore.setState({ user: null, session: null, profile: null, isLoading: false, error: null, navigate: mockNavigateGlobal }, true);
        });
        
        vi.clearAllMocks();
        resetMockAiApiClient(mockAiApiInstance);
        
        await useAiStore.getState().loadAiConfig();
        
        expect(mockAiApiInstance.getAiProviders).not.toHaveBeenCalled();
        expect(mockAiApiInstance.getSystemPrompts).not.toHaveBeenCalled();
        
        const state = useAiStore.getState();
        expect(state.availableProviders).toEqual([]);
        expect(state.availablePrompts).toEqual([]);
        expect(state.isConfigLoading).toBe(false);
    });
});
