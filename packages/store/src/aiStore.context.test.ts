import { useAiStore, initialAiStateValues } from './aiStore';
import { AiState as AiStateTypeFromTypes, Chat, AiProvider, SystemPrompt } from '@paynless/types';
import { vi, describe, beforeEach, it, expect, afterEach } from 'vitest';
import { analytics } from '@paynless/analytics';
import { useAuthStore } from './authStore';

// Mock analytics
vi.mock('@paynless/analytics', () => ({
    analytics: {
        track: vi.fn(),
    },
}));

// Mock authStore
const mockUser = { id: 'user-123', email: 'test@example.com' };
vi.mock('./authStore', () => ({
    useAuthStore: {
        getState: vi.fn(() => ({
            user: mockUser,
            session: { access_token: 'fake-token' },
        })),
    },
}));

// Mock organizationStore
const mockOrgStoreState = {
    currentOrganizationId: null, // Default, can be changed in tests
};
vi.mock('./organizationStore', () => ({
    useOrganizationStore: {
        getState: vi.fn(() => mockOrgStoreState),
    },
}));

// Helper to get initial state if useAiStore is not reset between tests easily
// or if we want to test the direct initial state object if it were exported.
// For now, we'll test the store's initial state directly.

describe('useAiStore - Initial State Structure', () => {
  let initialState: typeof initialAiStateValues;

  beforeEach(() => {
    // Zustand stores maintain state globally.
    // For testing initial state, we can grab it once.
    // If actions were tested that modify state, proper reset/mocking is needed.
    initialState = useAiStore.getState();
  });

  it('should have the correct initial structure for context-based chat history', () => {
    expect(initialAiStateValues.chatsByContext).toBeDefined();
    expect(initialAiStateValues.chatsByContext).toEqual({ personal: undefined, orgs: {} });
  });

  it('should have the correct initial structure for messages', () => {
    expect(initialAiStateValues.messagesByChatId).toBeDefined();
    expect(initialAiStateValues.messagesByChatId).toEqual({});
  });

  it('should have currentChatId initialized to null', () => {
    expect(initialAiStateValues.currentChatId).toBeNull();
  });

  it('should have the correct initial structure for context-based history loading states', () => {
    expect(initialAiStateValues.isLoadingHistoryByContext).toBeDefined();
    expect(initialAiStateValues.isLoadingHistoryByContext).toEqual({ personal: false, orgs: {} }); // Or just {}
  });

  it('should have isDetailsLoading initialized to false', () => {
    expect(initialAiStateValues.isDetailsLoading).toBe(false);
  });

  it('should have isLoadingAiResponse initialized to false', () => {
    expect(initialAiStateValues.isLoadingAiResponse).toBe(false);
  });

  it('should have newChatContext initialized to null in initial values', () => {
    // Testing initialAiStateValues directly as getState() might be affected by loadAiConfig if it runs automatically
    expect(initialAiStateValues.newChatContext).toBeNull();
  });

  it('should have aiError initialized to null', () => {
    expect(initialAiStateValues.aiError).toBeNull();
  });

  it('should have rewindTargetMessageId initialized to null', () => {
    expect(initialAiStateValues.rewindTargetMessageId).toBeNull();
  });

  // Placeholder for token tracking state tests - to be detailed in STEP-2.1.8
  it('should have initial state for token tracking (details to be defined)', () => {
    // Example: expect(initialState.chatTokenUsage).toEqual({});
    // Example: expect(initialState.sessionTokenUsage).toBeNull();
    // For now, we'll assume these are not yet in AiState type, so this test might fail
    // or we can skip it until the type is updated.
    // Let's assume they will be added and expect them to be defined.
    expect((initialAiStateValues as any).chatTokenUsage).toBeUndefined(); // Adjust once defined
    expect((initialAiStateValues as any).sessionTokenUsage).toBeUndefined(); // Adjust once defined
  });

  // Keep existing non-contextual state properties
  it('should retain availableProviders, initialized to an empty array', () => {
    expect(initialAiStateValues.availableProviders).toBeDefined();
    expect(initialAiStateValues.availableProviders).toEqual([]);
  });

  it('should retain availablePrompts, initialized to an empty array', () => {
    expect(initialAiStateValues.availablePrompts).toBeDefined();
    expect(initialAiStateValues.availablePrompts).toEqual([]);
  });

  it('should retain isConfigLoading, initialized to false', () => {
    // This was present in the initial file peek
    expect(initialAiStateValues.isConfigLoading).toBe(false);
  });

  // Verify removal or planned modification of old state fields
  it('should not have the old chatHistoryList (replaced by chatsByContext)', () => {
    expect((initialAiStateValues as any).chatHistoryList).toBeUndefined();
  });

  it('should not have the old currentChatMessages (replaced by messagesByChatId and selectors)', () => {
    expect((initialAiStateValues as any).currentChatMessages).toBeUndefined();
  });

  it('should not have the old isHistoryLoading (replaced by isLoadingHistoryByContext)', () => {
    expect((initialAiStateValues as any).isHistoryLoading).toBeUndefined();
  });

  it('should not have the old newChatContext state property', () => {
    expect((initialAiStateValues as any).newChatContext).toBeUndefined();
    expect((useAiStore.getState() as any).newChatContext).toBeUndefined();
  });
});

describe('useAiStore - Context Actions', () => {
    beforeEach(() => {
        useAiStore.setState(initialAiStateValues); 
        vi.clearAllMocks();
        mockOrgStoreState.currentOrganizationId = null; 
        // Reset auth store mock to default
        (useAuthStore.getState as import('vitest').Mock).mockReturnValue({
            user: mockUser,
            session: { access_token: 'fake-token' },
        });
    });

    // afterEach(() => {
    //    vi.restoreAllMocks(); // Might be needed if mocks persist too strongly
    // });

    describe('setSelectedChatContextForNewChat', () => {
        it('should update selectedChatContextForNewChat to the given organization ID', () => {
            const orgId = 'org-test-123';
            useAiStore.getState().newChatContext = orgId;
            expect(useAiStore.getState().newChatContext).toBe(orgId);
            expect(analytics.track).toHaveBeenCalledWith(
                'Chat: Context For New Chat Selected In Store',
                { contextId: orgId, contextType: 'Organization' }
            );
        });

        it('should update selectedChatContextForNewChat to null for personal context', () => {
            useAiStore.getState().newChatContext = null;
            expect(useAiStore.getState().newChatContext).toBeNull();
            expect(analytics.track).toHaveBeenCalledWith(
                'Chat: Context For New Chat Selected In Store',
                { contextId: null, contextType: 'Personal' }
            );
        });
    });

    describe('startNewChat', () => {
        // Matching AiProvider type from @paynless/types (no 'models' field)
        const dummyProvider: Omit<AiProvider, 'models' | 'config' | 'description' | 'api_identifier' | 'created_at' | 'is_active' | 'is_enabled' | 'provider' | 'updated_at'> & { name: string, id: string } = { id: 'dummy-test-provider', name: 'Dummy Test Provider' };
        const realProvider1: Omit<AiProvider, 'models' | 'config' | 'description' | 'api_identifier' | 'created_at' | 'is_active' | 'is_enabled' | 'provider' | 'updated_at'> & { name: string, id: string } = { id: 'real-provider-1', name: 'Real Provider 1' };
        
        // Matching SystemPrompt type from @paynless/types (using 'prompt_text')
        const prompt1: SystemPrompt = { id: 'prompt-abc', name: 'Test Prompt 1', prompt_text: 'You are a test assistant.', created_at: 'test', updated_at: 'test', is_active: true };
        const prompt2: SystemPrompt = { id: 'prompt-def', name: 'Test Prompt 2', prompt_text: 'You are another test assistant.', created_at: 'test', updated_at: 'test', is_active: true };

        it('should start a new personal chat, set currentChatId, and initialize messages', () => {
            useAiStore.getState().startNewChat(null);
            const state = useAiStore.getState();
            expect(state.currentChatId).not.toBeNull();
            expect(state.messagesByChatId[state.currentChatId!]).toEqual([]);
            const personalChats = state.chatsByContext.personal;
            expect(personalChats).toBeDefined();
            expect(personalChats!.length).toBe(1);
            expect(personalChats![0].id).toBe(state.currentChatId);
            expect(personalChats![0].organization_id).toBeNull();
            expect(analytics.track).toHaveBeenCalledWith(
                'Chat: New Chat Started In Store',
                expect.objectContaining({ contextId: null, contextType: 'Personal' })
            );
        });

        it('should start a new organization chat, set currentChatId, and initialize messages', () => {
            const orgId = 'org-start-chat-456';
            useAiStore.getState().startNewChat(orgId);
            const state = useAiStore.getState();
            expect(state.currentChatId).not.toBeNull();
            expect(state.messagesByChatId[state.currentChatId!]).toEqual([]);
            const orgChats = state.chatsByContext.orgs[orgId];
            expect(orgChats).toBeDefined();
            expect(orgChats!.length).toBe(1);
            expect(orgChats![0].id).toBe(state.currentChatId);
            expect(orgChats![0].organization_id).toBe(orgId);
            expect(analytics.track).toHaveBeenCalledWith(
                'Chat: New Chat Started In Store',
                expect.objectContaining({ contextId: orgId, contextType: 'Organization' })
            );
        });

        it('should set the first available provider if none is selected', () => {
            useAiStore.setState({ ...initialAiStateValues, availableProviders: [realProvider1 as AiProvider], selectedProviderId: null });
            useAiStore.getState().startNewChat(null);
            expect(useAiStore.getState().selectedProviderId).toBe(realProvider1.id);
        });
        
        it('should set the dummy provider in development if no provider is selected and dummy is available', () => {
            const originalNodeEnv = process.env['NODE_ENV'];
            process.env['NODE_ENV'] = 'development';
            useAiStore.setState({ ...initialAiStateValues, availableProviders: [dummyProvider as AiProvider, realProvider1 as AiProvider], selectedProviderId: null });
            
            useAiStore.getState().startNewChat(null);
            expect(useAiStore.getState().selectedProviderId).toBe(dummyProvider.id);
            
            process.env['NODE_ENV'] = originalNodeEnv; 
        });

        it('should keep the currently selected provider if one is already selected', () => {
            const originalNodeEnv = process.env['NODE_ENV'];
            process.env['NODE_ENV'] = 'development'; 
            useAiStore.setState({ ...initialAiStateValues, availableProviders: [dummyProvider as AiProvider, realProvider1 as AiProvider], selectedProviderId: realProvider1.id });
            
            useAiStore.getState().startNewChat(null);
            expect(useAiStore.getState().selectedProviderId).toBe(realProvider1.id);
            
            process.env['NODE_ENV'] = originalNodeEnv; 
        });
        
        it('should set the first available prompt if prompts are available and a provider is selected', () => {
            useAiStore.setState({ 
                ...initialAiStateValues, 
                availablePrompts: [prompt1, prompt2], 
                selectedPromptId: null, 
                availableProviders: [realProvider1 as AiProvider], 
                selectedProviderId: realProvider1.id 
            });
            useAiStore.getState().startNewChat(null);
            expect(useAiStore.getState().selectedPromptId).toBe(prompt1.id);
        });

        it('should set selectedPromptId to null if no prompts are available', () => {
            useAiStore.setState({ 
                ...initialAiStateValues, 
                availablePrompts: [], 
                selectedPromptId: prompt1.id, 
                availableProviders: [realProvider1 as AiProvider], 
                selectedProviderId: realProvider1.id 
            });
            useAiStore.getState().startNewChat(null);
            expect(useAiStore.getState().selectedPromptId).toBeNull();
        });
        
        it('should do nothing and set error if user is not authenticated', () => {
            (useAuthStore.getState as import('vitest').Mock).mockReturnValueOnce({ user: null, session: null }); 
            const originalCurrentChatId = useAiStore.getState().currentChatId;

            useAiStore.getState().startNewChat(null);
            
            const finalState = useAiStore.getState();
            expect(finalState.currentChatId).toBe(originalCurrentChatId); 
            expect(finalState.aiError).toBe('User not authenticated. Cannot start new chat.');
            expect(analytics.track).not.toHaveBeenCalledWith(
                'Chat: New Chat Started In Store',
                expect.anything()
            );
        });
    });
}); 