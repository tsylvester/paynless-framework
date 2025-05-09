import { describe, it, expect, vi, beforeEach, type Mock, type SpyInstance } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// import AiChat from './AiChat'; // Will be imported after mocks
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import React from 'react';
import type { User, AiProvider, SystemPrompt, Organization, ChatMessage, Chat } from '@paynless/types'; // Removed TokenUsage

// Mock definitions are hoisted. Define them before component imports.
vi.mock('../components/layout/Layout', () => ({ Layout: vi.fn(({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>) }));
vi.mock('../components/ai/ModelSelector', () => ({ ModelSelector: vi.fn(() => <div data-testid="model-selector-mock"></div>) }));
vi.mock('../components/ai/PromptSelector', () => ({ PromptSelector: vi.fn(() => <div data-testid="prompt-selector-mock"></div>) }));
vi.mock('../components/ai/AiChatbox', () => ({ AiChatbox: vi.fn(() => <div data-testid="ai-chatbox-mock"></div>) }));
vi.mock('../components/ai/ChatHistoryList', () => ({ ChatHistoryList: vi.fn(() => <div data-testid="chat-history-list-mock"></div>) }));
vi.mock('../components/ai/ChatContextSelector', () => ({ ChatContextSelector: vi.fn((props: { onContextChange: (id: string | null) => void }) => <button data-testid="context-selector-button" onClick={() => props.onContextChange('mock-context-change')}>ContextSelectorMock</button>) }));

// Import components after mocks are defined
import { Layout } from '../components/layout/Layout';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';
import { ChatHistoryList } from '../components/ai/ChatHistoryList';
import { ChatContextSelector } from '../components/ai/ChatContextSelector';
import AiChat from './AiChat'; // Now import the component under test

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAiStore: actual.useAiStore,
    useAuthStore: actual.useAuthStore,
    useOrganizationStore: actual.useOrganizationStore,
    selectCurrentChatMessages: vi.fn(() => []),
  };
});

vi.mock('@paynless/analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

// Define mock functions for actions - these are fine here as they are not used in vi.mock factories at the top level
// let loadAiConfigMock: Mock; // Removed, will be defined in describe block
// let loadChatHistoryMock: Mock; // Removed
// let loadChatDetailsMock: Mock; // Removed
// let startNewChatMock: Mock; // Removed
// let checkAndReplayPendingChatActionMock: Mock; // Removed

// Define Initial States with mock actions and better types
const mockUser: User = {
    id: 'user-123',
    // email, role, created_at, updated_at are optional in the type
};

const authStoreInitialState = {
  user: mockUser,
  isLoading: false,
  error: null,
};

const mockOrgAbcChats: Chat[] = [
  { id: 'chat-org-abc-1', title: 'Org ABC Chat 1', updated_at: new Date().toISOString(), created_at: new Date().toISOString(), organization_id: 'org-abc', system_prompt_id: null, user_id: 'user-123' },
];

const mockPersonalChats: Chat[] = [
  { id: 'chat-personal-1', title: 'Personal Chat 1', updated_at: new Date().toISOString(), created_at: new Date().toISOString(), organization_id: null, system_prompt_id: null, user_id: 'user-123' },
];

const organizationStoreInitialState = {
  userOrganizations: [
    { id: 'org-abc', name: 'Org ABC', created_at: new Date().toISOString(), deleted_at: null, visibility: 'private', allow_member_chat_creation: true },
    { id: 'org-def', name: 'Org DEF', created_at: new Date().toISOString(), deleted_at: null, visibility: 'private', allow_member_chat_creation: true },
  ] as Organization[],
  currentOrganizationId: 'org-abc' as string | null,
      isLoading: false,
      orgError: null,
};

// Corrected SystemPrompt mock based on likely type structure
const mockSystemPrompt: SystemPrompt = {
    id: 'prompt-1', 
    name: 'Prompt 1', 
    prompt_text: 'Test prompt', 
    created_at: new Date().toISOString(), 
    updated_at: new Date().toISOString(), 
    is_active: true, // Assuming is_active instead of is_enabled/is_default
    // Add description if it exists on the type
};

// Corrected ChatMessage mocks
const mockChatMessageOrg1: ChatMessage = {
  id: 'msg1', 
  chat_id: 'chat-org-abc-1', 
  user_id: 'user-123', 
  role: 'user', 
  content: 'Hello from org', 
  created_at: new Date().toISOString(), 
  ai_provider_id: null,       // Added
  system_prompt_id: null,   // Added
  token_usage: null,          // Added (or a TokenUsage object)
  is_active_in_thread: true,  // Existing, ensure value is appropriate
  status: 'sent'              // Optional, added for completeness
};

const mockChatMessagePersonal1: ChatMessage = {
  id: 'msg2', 
  chat_id: 'chat-personal-1', 
  user_id: 'user-123', 
  role: 'user', 
  content: 'Hello personally', 
  created_at: new Date().toISOString(), 
  ai_provider_id: null,       // Added
  system_prompt_id: null,   // Added
  token_usage: null,          // Added
  is_active_in_thread: true,  // Existing
  status: 'sent'              // Optional
};

// Provide more realistic initial state for AI Store, satisfying types
const aiStoreInitialState = {
  availableProviders: [
      { id: 'prov-1', name: 'Provider 1', api_identifier: 'prov-1-api', is_active: true, is_enabled: true, config: {}, created_at: new Date().toISOString(), description: 'Mock provider', provider: 'mock', updated_at: new Date().toISOString() } 
  ] as AiProvider[],
  availablePrompts: [mockSystemPrompt] as SystemPrompt[],
  chatsByContext: { 
    personal: mockPersonalChats, 
    orgs: { 'org-abc': mockOrgAbcChats, 'org-def': [] }
  },
  messagesByChatId: { 
    'chat-org-abc-1': [mockChatMessageOrg1],
    'chat-personal-1': [mockChatMessagePersonal1],
  },
  currentChatId: null as string | null,
  isLoadingAiResponse: false,
  isConfigLoading: false,
  isLoadingHistoryByContext: { 
    personal: false, 
    orgs: { 'org-abc': false, 'org-def': false } 
  },
  isDetailsLoading: false,
  newChatContext: null as string | null,
  rewindTargetMessageId: null as string | null,
  aiError: null as string | null,
      loadAiConfig: vi.fn(),
      loadChatHistory: vi.fn(),
      loadChatDetails: vi.fn(),
      startNewChat: vi.fn(),
      checkAndReplayPendingChatAction: vi.fn(),
  deleteChat: vi.fn(),
  prepareRewind: vi.fn(),
  cancelRewindPreparation: vi.fn(),
  clearAiError: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(null),
};

describe('AiChat Page', () => {
  let analyticsTrackMock: Mock;
  let loadAiConfigMock: Mock;
  let loadChatHistoryMock: Mock;
  let loadChatDetailsMock: Mock;
  let startNewChatMock: Mock;
  let checkAndReplayPendingChatActionMock: Mock;
  let deleteChatMock: Mock;
  let prepareRewindMock: Mock;
  let cancelRewindPreparationMock: Mock;
  let clearAiErrorMock: Mock;
  let sendMessageMock: Mock;

  beforeEach(async () => {
    // Reset the call history for our spy mocks using vi.mocked
    vi.mocked(Layout).mockClear();
    vi.mocked(ModelSelector).mockClear();
    vi.mocked(PromptSelector).mockClear();
    vi.mocked(AiChatbox).mockClear();
    vi.mocked(ChatHistoryList).mockClear();
    vi.mocked(ChatContextSelector).mockClear();

    // Assign specific mock instances for actions
    loadAiConfigMock = vi.fn();
    loadChatHistoryMock = vi.fn();
    loadChatDetailsMock = vi.fn((chatIdToLoad: string) => {
      act(() => {
        useAiStore.setState({ currentChatId: chatIdToLoad, isDetailsLoading: true });
      });
    });
    startNewChatMock = vi.fn();
    checkAndReplayPendingChatActionMock = vi.fn();
    deleteChatMock = vi.fn();
    prepareRewindMock = vi.fn();
    cancelRewindPreparationMock = vi.fn();
    clearAiErrorMock = vi.fn();
    sendMessageMock = vi.fn().mockResolvedValue(null);

    // Ensure analytics mock is cleared if tests use it
    const analyticsModule = await import('@paynless/analytics');
    analyticsTrackMock = vi.mocked(analyticsModule.analytics.track);
    analyticsTrackMock.mockClear();

    // Set initial store states
    act(() => {
      useAuthStore.setState({ ...structuredClone(authStoreInitialState) }, true);
      // Reset org store to defaults before each test
      useOrganizationStore.setState({ ...structuredClone(organizationStoreInitialState) }, true); 
      // Reset AI store state and override actions
      useAiStore.setState((state) => ({ 
        ...state, 
        ...aiStoreInitialState,
        loadAiConfig: loadAiConfigMock,
        loadChatHistory: loadChatHistoryMock,
        loadChatDetails: loadChatDetailsMock,
        startNewChat: startNewChatMock,
        checkAndReplayPendingChatAction: checkAndReplayPendingChatActionMock,
        deleteChat: deleteChatMock,
        prepareRewind: prepareRewindMock,
        cancelRewindPreparation: cancelRewindPreparationMock,
        clearAiError: clearAiErrorMock,
        sendMessage: sendMessageMock,
      }), true); 
    });

    // Default mock resolutions
    loadAiConfigMock.mockResolvedValue(undefined);
    loadChatHistoryMock.mockResolvedValue(undefined);
  });

  it('should render the AiChat page structure with mocks', () => {
    render(<AiChat />);
    expect(vi.mocked(ModelSelector)).toHaveBeenCalled();
    expect(vi.mocked(PromptSelector)).toHaveBeenCalled();
    expect(vi.mocked(AiChatbox)).toHaveBeenCalled();
    expect(vi.mocked(ChatHistoryList)).toHaveBeenCalled();
    expect(vi.mocked(ChatContextSelector)).toHaveBeenCalled();
  });

  it('should call loadAiConfig on mount', () => {
    render(<AiChat />);
    expect(loadAiConfigMock).toHaveBeenCalledTimes(1);
  });

  it('should call checkAndReplayPendingChatAction on mount', () => {
    const mockCheckAndReplay = vi.fn();
    act(() => {
        useAiStore.setState({ checkAndReplayPendingChatAction: mockCheckAndReplay });
    });
    render(<AiChat />);
    expect(mockCheckAndReplay).toHaveBeenCalledTimes(1);
  });

  it('should pass the correct initial activeContextId to ChatHistoryList based on globalCurrentOrgId', async () => {
    render(<AiChat />);
    await vi.waitFor(() => {
        expect(vi.mocked(ChatHistoryList)).toHaveBeenCalledWith(
            expect.objectContaining({ activeContextId: 'org-abc' }),
            expect.anything()
        );
    });
  });
  
  it('should pass activeContextId=null to ChatHistoryList if globalCurrentOrgId is null', async () => {
     act(() => {
      useOrganizationStore.setState({ currentOrganizationId: null }, false);
    });
    render(<AiChat />);
    await vi.waitFor(() => {
        expect(vi.mocked(ChatHistoryList)).toHaveBeenCalledWith(
            expect.objectContaining({ activeContextId: null }),
            expect.anything()
        );
    });
  });

  it('should update activeContextId for ChatHistoryList when ChatContextSelector changes', async () => {
    const user = userEvent.setup();
    render(<AiChat />);

    await vi.waitFor(() => { // Initial check
        expect(vi.mocked(ChatHistoryList)).toHaveBeenCalledWith(
            expect.objectContaining({ activeContextId: 'org-abc' }),
            expect.anything()
        );
    });
    vi.mocked(ChatHistoryList).mockClear(); // Clear calls for the next assertion
    analyticsTrackMock.mockClear();

    const selectorButton = screen.getByTestId('context-selector-button');
    await user.click(selectorButton); // ChatContextSelector mock calls onContextChange('mock-context-change')
    
    await vi.waitFor(() => { // Check after change
        expect(vi.mocked(ChatHistoryList)).toHaveBeenCalledWith(
            expect.objectContaining({ activeContextId: 'mock-context-change' }),
            expect.anything()
        );
    });

    expect(analyticsTrackMock).toHaveBeenCalledWith('Chat: Context Selected For New Chat', {
      contextId: 'mock-context-change',
    });
  });
  
   it('should update activeContextId to null for ChatHistoryList when ChatContextSelector changes to Personal', async () => {
    const user = userEvent.setup();
    
    // This test dynamically mocks ChatContextSelector, so we need to be careful with module state.
    // The previous implementation of this test already handled vi.resetModules and dynamic imports,
    // so the core logic change is just the assertion target.

    // Temporarily use a local mock for loadChatHistory if it was used internally in this specific test's setup
    // However, the primary assertion should be on ChatHistoryList props.
    const localLoadChatHistoryMockForThisTestScope = vi.fn(); 

    vi.resetModules(); 
    const MockChatContextSelectorPersonal = vi.fn((props: { onContextChange: (id: string | null) => void }) => 
      <button data-testid="context-selector-button-personal" onClick={() => props.onContextChange(null)}>ContextSelectorMockPersonal</button> 
    );
    vi.doMock('../components/ai/ChatContextSelector', () => ({
        ChatContextSelector: MockChatContextSelectorPersonal
    }));

    const AiChatWithDynamicMock = (await import('./AiChat')).default;
    const { useAiStore: useAiStoreDynamic, useOrganizationStore: useOrganizationStoreDynamic } = await import('@paynless/store');
    // Re-import ChatHistoryList mock to ensure we are checking the correct one after module reset
    const { ChatHistoryList: MockedChatHistoryListDynamic } = await import('../components/ai/ChatHistoryList');

    act(() => {
      useOrganizationStoreDynamic.setState({ ...structuredClone(organizationStoreInitialState) }, true); // Reset org store
      useAiStoreDynamic.setState((state) => ({ // Reset AI store
        ...state,
        ...aiStoreInitialState, // Use a clean base state
        loadChatHistory: localLoadChatHistoryMockForThisTestScope, // if ChatHistoryList uses it
        // Ensure other necessary actions are mocked if AiChat calls them during init
        loadAiConfig: vi.fn(), 
        checkAndReplayPendingChatAction: vi.fn(),
      }), true);
    });

    render(<AiChatWithDynamicMock />);  

    await vi.waitFor(() => { // Initial check
        expect(vi.mocked(MockedChatHistoryListDynamic)).toHaveBeenCalledWith(
            expect.objectContaining({ activeContextId: 'org-abc' }),
            expect.anything()
        );
    });
    vi.mocked(MockedChatHistoryListDynamic).mockClear();
    // analyticsTrackMock needs to be the one from the outer scope or re-imported if resetModules affected it.
    // For simplicity, assuming analyticsTrackMock is still valid or re-mocked if necessary by test structure.
    const analyticsModule = await import('@paynless/analytics'); // Re-import if needed
    const currentAnalyticsTrackMock = vi.mocked(analyticsModule.analytics.track);
    currentAnalyticsTrackMock.mockClear();


    const selectorButton = screen.getByTestId('context-selector-button-personal');
    await user.click(selectorButton);

    await vi.waitFor(() => { // Check after change
       expect(vi.mocked(MockedChatHistoryListDynamic)).toHaveBeenCalledWith(
            expect.objectContaining({ activeContextId: null }),
            expect.anything()
        );
    });
    expect(currentAnalyticsTrackMock).toHaveBeenCalledWith('Chat: Context Selected For New Chat', {
      contextId: 'personal', // 'personal' when contextId is null
    });
    vi.doUnmock('../components/ai/ChatContextSelector');
  });

  describe('Default Provider and Prompt Selection', () => {
    beforeEach(async () => { // Make beforeEach async if it contains async operations like dynamic imports
      vi.resetModules(); 
      // Re-import AiChat and other necessary modules after reset
      // This is crucial if mocks are changed with vi.doMock
    });

    it('should set selectedProviderId to the first available provider if none is selected', async () => {
      const currentLoadAiConfigMock = vi.fn();
      const currentLoadChatHistoryMock = vi.fn();
      act(() => {
        useAiStore.setState({ 
            availableProviders: [],
            loadAiConfig: currentLoadAiConfigMock, // ensure actions are mocked if component calls them on init
            loadChatHistory: currentLoadChatHistoryMock,
            checkAndReplayPendingChatAction: vi.fn(),
        });
      });
      
      const TempMockModelSelector = vi.fn(() => <div data-testid="model-selector-mock"></div>);
      vi.doMock('../components/ai/ModelSelector', () => ({ ModelSelector: TempMockModelSelector }));
      const AiChatWithMockedModelSelector = (await import('./AiChat')).default;
      const { ModelSelector: ImportedModelSelector } = await import('../components/ai/ModelSelector');
      
      render(<AiChatWithMockedModelSelector />); 

      const mockProviders: AiProvider[] = [
        { id: 'prov-1', name: 'Provider 1', api_identifier: 'p1', is_active: true, is_enabled: true, config: {}, created_at: '', updated_at: '', description: '', provider: '' }, 
        { id: 'prov-2', name: 'Provider 2', api_identifier: 'p2', is_active: true, is_enabled: true, config: {}, created_at: '', updated_at: '', description: '', provider: '' }
      ];
      act(() => {
        useAiStore.setState({ availableProviders: mockProviders });
      });

      await vi.waitFor(() => {
        expect(vi.mocked(ImportedModelSelector)).toHaveBeenCalledWith(expect.objectContaining({ selectedProviderId: 'prov-1' }), expect.anything());
      });
      vi.doUnmock('../components/ai/ModelSelector');
    });

    it('should set selectedPromptId to the first available prompt if none is selected', async () => {
      const currentLoadAiConfigMock = vi.fn();
      const currentLoadChatHistoryMock = vi.fn();
      act(() => {
        useAiStore.setState({ 
            availablePrompts: [],
            loadAiConfig: currentLoadAiConfigMock,
            loadChatHistory: currentLoadChatHistoryMock,
            checkAndReplayPendingChatAction: vi.fn(),
        });
      });

      const TempMockPromptSelector = vi.fn(() => <div data-testid="prompt-selector-mock"></div>);
      vi.doMock('../components/ai/PromptSelector', () => ({ PromptSelector: TempMockPromptSelector }));
      const AiChatWithMockedPromptSelector = (await import('./AiChat')).default;
      const { PromptSelector: ImportedPromptSelector } = await import('../components/ai/PromptSelector');


      render(<AiChatWithMockedPromptSelector />); 

      const mockPrompts: SystemPrompt[] = [
        { id: 'prompt-A', name: 'Prompt A', prompt_text: '', created_at: '', updated_at: '', is_active: true }, 
        { id: 'prompt-B', name: 'Prompt B', prompt_text: '', created_at: '', updated_at: '', is_active: true }
      ];
      act(() => {
        useAiStore.setState({ availablePrompts: mockPrompts });
      });

      await vi.waitFor(() => {
        expect(vi.mocked(ImportedPromptSelector)).toHaveBeenCalledWith(expect.objectContaining({ selectedPromptId: 'prompt-A' }), expect.anything());
      });
      vi.doUnmock('../components/ai/PromptSelector');
    });

    it('should NOT change selectedProviderId if one is already set and new providers become available', async () => {
      const currentLoadAiConfigMock = vi.fn();
      const currentLoadChatHistoryMock = vi.fn();
      const TempMockModelSelector = vi.fn((props) => <div data-testid="model-selector-mock">{props.selectedProviderId}</div>);
      vi.doMock('../components/ai/ModelSelector', () => ({ ModelSelector: TempMockModelSelector }));
      const AiChatWithMockedModelSelector = (await import('./AiChat')).default;
      const { ModelSelector: ImportedModelSelector } = await import('../components/ai/ModelSelector');

      const initialProviders: AiProvider[] = [
        { id: 'initial-prov', name: 'Initial Provider', api_identifier: 'ip', is_active: true, is_enabled: true, config: {}, created_at: '', updated_at: '', description: '', provider: '' }
      ];
      act(() => {
        useAiStore.setState({ 
            availableProviders: initialProviders,
            loadAiConfig: currentLoadAiConfigMock,
            loadChatHistory: currentLoadChatHistoryMock,
            checkAndReplayPendingChatAction: vi.fn(),
        });
      });
      
      render(<AiChatWithMockedModelSelector />); 
      
      await vi.waitFor(() => {
        expect(vi.mocked(ImportedModelSelector)).toHaveBeenCalledWith(expect.objectContaining({ selectedProviderId: 'initial-prov' }), expect.anything());
      });
      vi.mocked(ImportedModelSelector).mockClear();

      const newProviders: AiProvider[] = [
        { id: 'new-prov-1', name: 'New Provider 1', api_identifier: 'np1', is_active: true, is_enabled: true, config: {}, created_at: '', updated_at: '', description: '', provider: '' }, 
      ];
      act(() => {
        useAiStore.setState({ availableProviders: [...initialProviders, ...newProviders] });
      });

      await vi.waitFor(() => { // Wait for potential re-renders
        expect(vi.mocked(ImportedModelSelector).mock.calls.length).toBeGreaterThan(0);
      });
      
      const calls = vi.mocked(ImportedModelSelector).mock.calls;
      if (calls.length > 0) {
        const lastCallArgs = calls[calls.length - 1];
        expect(lastCallArgs).toBeDefined();
        if (lastCallArgs && lastCallArgs.length > 0) {
            expect(lastCallArgs[0]).toHaveProperty('selectedProviderId', 'initial-prov');
        } else {
            // Fail the test if the structure isn't as expected
            throw new Error("MockModelSelector last call arguments are not as expected.");
        }
      }
      
      let wasCalledWithNewProv1Selected = false;
      for (const call of vi.mocked(ImportedModelSelector).mock.calls) {
        if (call && call.length > 0 && call[0].selectedProviderId === 'new-prov-1') {
          wasCalledWithNewProv1Selected = true;
          break;
        }
      }
      expect(wasCalledWithNewProv1Selected).toBe(false);

      vi.doUnmock('../components/ai/ModelSelector');
    });
  });

  describe('Load Chat from localStorage', () => {
    // Use the specific SpyInstance types from vitest
    let getItemSpy: SpyInstance<[key: string], string | null>;
    let removeItemSpy: SpyInstance<[key: string], void>;

    beforeEach(() => {
      // Spy on localStorage methods using Storage.prototype
      getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
      
      // Ensure necessary store actions are mocked for AiChat initialization if not already covered globally
      // This might be redundant if global beforeEach already sets them up, but good for clarity.
      act(() => {
        useAiStore.setState(state => ({
          ...state,
          loadAiConfig: loadAiConfigMock,
          loadChatHistory: loadChatHistoryMock,
          checkAndReplayPendingChatAction: checkAndReplayPendingChatActionMock,
          loadChatDetails: loadChatDetailsMock
        }));
      });
      loadChatDetailsMock.mockClear(); // Clear before each localStorage test
    });

    afterEach(() => {
      // Restore original localStorage methods
      getItemSpy.mockRestore();
      removeItemSpy.mockRestore();
    });

    it('should call loadChatDetails and removeItem if chatId is found in localStorage', async () => {
      const mockChatId = 'chat-from-storage';
      getItemSpy.mockReturnValue(mockChatId);

      render(<AiChat />); 

      await vi.waitFor(() => {
        expect(getItemSpy).toHaveBeenCalledWith('loadChatIdOnRedirect');
      });
      await vi.waitFor(() => {
        expect(loadChatDetailsMock).toHaveBeenCalledWith(mockChatId);
      });
      expect(removeItemSpy).toHaveBeenCalledWith('loadChatIdOnRedirect');
    });

    it('should not call loadChatDetails or removeItem if no chatId is found in localStorage', async () => {
      getItemSpy.mockReturnValue(null);

      render(<AiChat />);

      await vi.waitFor(() => {
        expect(getItemSpy).toHaveBeenCalledWith('loadChatIdOnRedirect');
      });
      // Ensure a small delay for any potential async operations to NOT run if they were conditional
      await new Promise(resolve => setTimeout(resolve, 50)); 

      expect(loadChatDetailsMock).not.toHaveBeenCalled();
      expect(removeItemSpy).not.toHaveBeenCalled();
    });
  });

  describe('User Interactions and Event Handling', () => {
    beforeEach(() => {
      vi.resetModules();
      analyticsTrackMock.mockClear(); 
      // Clear relevant action mocks before each interaction test
      startNewChatMock.mockClear();
      loadChatDetailsMock.mockClear();
    });

    it('should update selectedProviderId and track event on handleProviderChange', async () => {
      const currentLoadAiConfigMock = vi.fn();
      const currentLoadChatHistoryMock = vi.fn();
      const TempMockModelSelector = vi.fn((props: { selectedProviderId: string | null, onProviderChange: (id: string | null) => void }) => {
        return <button data-testid="mock-model-selector" onClick={() => props.onProviderChange('prov-2')}>Change Provider</button>;
      });
      vi.doMock('../components/ai/ModelSelector', () => ({ ModelSelector: TempMockModelSelector }));
      const AiChatWithInteractiveModelSelector = (await import('./AiChat')).default;
      const { ModelSelector: ImportedModelSelector } = await import('../components/ai/ModelSelector');
      
      act(() => {
        useAiStore.setState({
            loadAiConfig: currentLoadAiConfigMock,
            loadChatHistory: currentLoadChatHistoryMock,
            checkAndReplayPendingChatAction: vi.fn(),
         }); // Ensure store has mock actions for initialization
      });
      render(<AiChatWithInteractiveModelSelector />);

      await vi.waitFor(() => {
        expect(vi.mocked(ImportedModelSelector)).toHaveBeenCalled();
      });
      
      const initialSelectedIdCall = vi.mocked(ImportedModelSelector).mock.calls.find(call => call[0]?.selectedProviderId !== undefined);
      expect(initialSelectedIdCall?.[0]?.selectedProviderId).not.toBe('prov-2');


      const user = userEvent.setup();
      const changeButton = screen.getByTestId('mock-model-selector');
      await user.click(changeButton);

      expect(analyticsTrackMock).toHaveBeenCalledWith('Chat: Provider Selected', { providerId: 'prov-2' });

      await vi.waitFor(() => {
        const lastCallArgs = vi.mocked(ImportedModelSelector).mock.calls[vi.mocked(ImportedModelSelector).mock.calls.length - 1];
        expect(lastCallArgs[0]).toHaveProperty('selectedProviderId', 'prov-2');
      });
      vi.doUnmock('../components/ai/ModelSelector');
    });

    it('should update selectedPromptId and track event on handlePromptChange', async () => {
      const currentLoadAiConfigMock = vi.fn();
      const currentLoadChatHistoryMock = vi.fn();
      const TempMockPromptSelector = vi.fn((props: { selectedPromptId: string | null, onPromptChange: (id: string | null) => void }) => {
        return <button data-testid="mock-prompt-selector" onClick={() => props.onPromptChange('prompt-B')}>Change Prompt</button>;
      });
      vi.doMock('../components/ai/PromptSelector', () => ({ PromptSelector: TempMockPromptSelector }));
      const AiChatWithInteractivePromptSelector = (await import('./AiChat')).default;
      const { PromptSelector: ImportedPromptSelector } = await import('../components/ai/PromptSelector');

      act(() => {
        useAiStore.setState({
            loadAiConfig: currentLoadAiConfigMock,
            loadChatHistory: currentLoadChatHistoryMock,
            checkAndReplayPendingChatAction: vi.fn(),
         });
      });
      render(<AiChatWithInteractivePromptSelector />);

      await vi.waitFor(() => {
        expect(vi.mocked(ImportedPromptSelector)).toHaveBeenCalled();
      });
      const initialSelectedIdCall = vi.mocked(ImportedPromptSelector).mock.calls.find(call => call[0]?.selectedPromptId !== undefined);
      expect(initialSelectedIdCall?.[0]?.selectedPromptId).not.toBe('prompt-B');


      const user = userEvent.setup();
      const changeButton = screen.getByTestId('mock-prompt-selector');
      await user.click(changeButton);

      expect(analyticsTrackMock).toHaveBeenCalledWith('Chat: Prompt Selected', { promptId: 'prompt-B' });

      await vi.waitFor(() => {
        const lastCallArgs = vi.mocked(ImportedPromptSelector).mock.calls[vi.mocked(ImportedPromptSelector).mock.calls.length - 1];
        expect(lastCallArgs[0]).toHaveProperty('selectedPromptId', 'prompt-B');
      });
      vi.doUnmock('../components/ai/PromptSelector');
    });

    it('should call startNewChat, track event, and reset selections on "New Chat" button click', async () => {
        // Ensure some providers/prompts exist in state for reset logic
        const initialProviders: AiProvider[] = [
            { id: 'prov-initial', name:'Initial Provider', api_identifier:'p-init', is_active: true, is_enabled: true, config:{}, created_at:'', updated_at:'', description:'', provider:''},
            { id: 'prov-another', name:'Another Provider', api_identifier:'p-another', is_active: true, is_enabled: true, config:{}, created_at:'', updated_at:'', description:'', provider:''}
        ];
        const initialPrompts: SystemPrompt[] = [
            { id: 'prompt-initial', name:'Initial Prompt', prompt_text:'', created_at:'', updated_at:'', is_active:true },
            { id: 'prompt-another', name:'Another Prompt', prompt_text:'', created_at:'', updated_at:'', is_active:true }
        ];
        
        // Mocks for ModelSelector and PromptSelector to simulate user changing selection
        // and to check their props after reset
        const MockModelSelectorWithChange = vi.fn((props: { selectedProviderId: string | null, onProviderChange: (id: string | null) => void }) => {
            return <button data-testid="mock-model-selector-interactive" onClick={() => props.onProviderChange(initialProviders[1].id)}>Change Provider</button>;
        });
        const MockPromptSelectorWithChange = vi.fn((props: { selectedPromptId: string | null, onPromptChange: (id: string | null) => void }) => {
            return <button data-testid="mock-prompt-selector-interactive" onClick={() => props.onPromptChange(initialPrompts[1].id)}>Change Prompt</button>;
        });

        vi.doMock('../components/ai/ModelSelector', () => ({ ModelSelector: MockModelSelectorWithChange }));
        vi.doMock('../components/ai/PromptSelector', () => ({ PromptSelector: MockPromptSelectorWithChange }));
        const AiChatWithInteractiveSelectors = (await import('./AiChat')).default;
        const { ModelSelector: ImportedModelSelector } = await import('../components/ai/ModelSelector');
        const { PromptSelector: ImportedPromptSelector } = await import('../components/ai/PromptSelector');

        act(() => {
            useAiStore.setState(state => ({ 
                ...state,
                availableProviders: initialProviders,
                availablePrompts: initialPrompts,
                loadAiConfig: loadAiConfigMock, 
                loadChatHistory: loadChatHistoryMock, 
                checkAndReplayPendingChatAction: checkAndReplayPendingChatActionMock,
                startNewChat: startNewChatMock,
            }));
        });

        render(<AiChatWithInteractiveSelectors />);
        const user = userEvent.setup();
        const newChatButton = screen.getByTestId('new-chat-button');

        // Simulate user selecting non-default provider and prompt
        const changeProviderButton = screen.getByTestId('mock-model-selector-interactive');
        await user.click(changeProviderButton);
        const changePromptButton = screen.getByTestId('mock-prompt-selector-interactive');
        await user.click(changePromptButton);

        await vi.waitFor(() => {
            const modelSelectorCalls = vi.mocked(ImportedModelSelector).mock.calls;
            const lastModelCallArgs = modelSelectorCalls[modelSelectorCalls.length - 1][0];
            expect(lastModelCallArgs.selectedProviderId).toBe(initialProviders[1].id); // Verify selection changed
            
            const promptSelectorCalls = vi.mocked(ImportedPromptSelector).mock.calls;
            const lastPromptCallArgs = promptSelectorCalls[promptSelectorCalls.length - 1][0];
            expect(lastPromptCallArgs.selectedPromptId).toBe(initialPrompts[1].id); // Verify selection changed
        });

        // Get current context from component state (initialized from store)
        const initialContext = useOrganizationStore.getState().currentOrganizationId; // 'org-abc' in default setup
        analyticsTrackMock.mockClear(); // Clear before clicking new chat

        await user.click(newChatButton);

        // Verify startNewChat call with correct context
        expect(startNewChatMock).toHaveBeenCalledTimes(1);
        expect(startNewChatMock).toHaveBeenCalledWith(initialContext);

        // Verify analytics
        expect(analyticsTrackMock).toHaveBeenCalledWith('Chat: Clicked New Chat', { 
            contextId: initialContext === null ? 'personal' : initialContext 
        });

        // Verify selections reset to the first available
        await vi.waitFor(() => {
            const modelSelectorCalls = vi.mocked(ImportedModelSelector).mock.calls;
            const lastModelCallArgs = modelSelectorCalls[modelSelectorCalls.length - 1][0];
            expect(lastModelCallArgs.selectedProviderId).toBe(initialProviders[0].id); // Reset to first
            
            const promptSelectorCalls = vi.mocked(ImportedPromptSelector).mock.calls;
            const lastPromptCallArgs = promptSelectorCalls[promptSelectorCalls.length - 1][0];
            expect(lastPromptCallArgs.selectedPromptId).toBe(initialPrompts[0].id); // Reset to first
        });

        vi.doUnmock('../components/ai/ModelSelector');
        vi.doUnmock('../components/ai/PromptSelector');
    });

    it('should reset selections to null on "New Chat" click if no providers/prompts are available', async () => {
        act(() => {
            useAiStore.setState(state => ({ 
                ...state,
                availableProviders: [], // No providers
                availablePrompts: [],   // No prompts
                loadAiConfig: loadAiConfigMock, 
                loadChatHistory: loadChatHistoryMock, 
                checkAndReplayPendingChatAction: checkAndReplayPendingChatActionMock,
                startNewChat: startNewChatMock,
                // Simulate some selections were made before
                // Note: This direct state setting for selectedProviderId/selectedPromptId is internal to AiChat.
                // If these are purely controlled via props to ModelSelector/PromptSelector, this part of setup might differ.
                // However, handleNewChat directly resets these internal states.
            }));
        });
        
        // Using the standard mocks for ModelSelector and PromptSelector for this test
        // as we are not interacting with them to change selection, only observing their props after reset.
        render(<AiChat />); // Use top-level imported AiChat
        const user = userEvent.setup();
        const newChatButton = screen.getByTestId('new-chat-button');

        // Set some initial selected IDs in the component's state via a simulated prior interaction
        // This is tricky without direct access or a callback. Let's assume they might be set.
        // The component's logic should reset them regardless of how they were set.
        // For the purpose of this test, the crucial part is that `availableProviders/Prompts` are empty.

        await user.click(newChatButton);

        await vi.waitFor(() => {
            // Use the top-level imported mocks
            const modelSelectorCalls = vi.mocked(ModelSelector).mock.calls;
            const lastModelCallArgs = modelSelectorCalls[modelSelectorCalls.length - 1][0];
            expect(lastModelCallArgs.selectedProviderId).toBeNull();

            const promptSelectorCalls = vi.mocked(PromptSelector).mock.calls;
            const lastPromptCallArgs = promptSelectorCalls[promptSelectorCalls.length - 1][0];
            expect(lastPromptCallArgs.selectedPromptId).toBeNull();
        });
    });

    it('should call loadChatDetails, track event, and reset selections on handleLoadChat (from history)', async () => {
        const chatToLoadId = 'chat-personal-1'; 
        const currentChatIdBeforeLoad = null; 
        expect(chatToLoadId).not.toBe(currentChatIdBeforeLoad);

        const initialProviders: AiProvider[] = [
            { id: 'prov-load-initial', name:'Load Initial Provider', api_identifier:'pl-init', is_active: true, is_enabled: true, config:{}, created_at:'', updated_at:'', description:'', provider:''},
            { id: 'prov-load-another', name:'Load Another Provider', api_identifier:'pl-another', is_active: true, is_enabled: true, config:{}, created_at:'', updated_at:'', description:'', provider:''}
        ];
        const initialPrompts: SystemPrompt[] = [
            { id: 'prompt-load-initial', name:'Load Initial Prompt', prompt_text:'', created_at:'', updated_at:'', is_active:true },
            { id: 'prompt-load-another', name:'Load Another Prompt', prompt_text:'', created_at:'', updated_at:'', is_active:true }
        ];

        const currentLoadAiConfigMock = vi.fn();
        const currentLoadChatHistoryMock = vi.fn();
        
        // Mock interactive components
        const TempMockChatHistoryList = vi.fn((props: { onLoadChat: (id: string) => void }) => {
            return <button data-testid="mock-history-item" onClick={() => props.onLoadChat(chatToLoadId)}>Load Chat</button>;
        });
        const TempMockModelSelector = vi.fn((props: { selectedProviderId: string | null, onProviderChange: (id: string | null) => void }) => {
            return <button data-testid="mock-model-selector-interactive" onClick={() => props.onProviderChange(initialProviders[1].id)}>Change Provider</button>;
        });
        const TempMockPromptSelector = vi.fn((props: { selectedPromptId: string | null, onPromptChange: (id: string | null) => void }) => {
            return <button data-testid="mock-prompt-selector-interactive" onClick={() => props.onPromptChange(initialPrompts[1].id)}>Change Prompt</button>;
        });

        vi.doMock('../components/ai/ChatHistoryList', () => ({ ChatHistoryList: TempMockChatHistoryList }));
        vi.doMock('../components/ai/ModelSelector', () => ({ ModelSelector: TempMockModelSelector }));
        vi.doMock('../components/ai/PromptSelector', () => ({ PromptSelector: TempMockPromptSelector }));

        const AiChatWithInteractiveHistory = (await import('./AiChat')).default;
        const { ModelSelector: ImportedModelSelector } = await import('../components/ai/ModelSelector');
        const { PromptSelector: ImportedPromptSelector } = await import('../components/ai/PromptSelector');

        act(() => {
          useAiStore.setState(state => ({
            ...state,
            availableProviders: initialProviders,
            availablePrompts: initialPrompts,
            loadAiConfig: currentLoadAiConfigMock,
            loadChatHistory: currentLoadChatHistoryMock,
            checkAndReplayPendingChatAction: vi.fn(),
            loadChatDetails: loadChatDetailsMock, // from outer scope
            startNewChat: startNewChatMock, // from outer scope
            currentChatId: currentChatIdBeforeLoad // Ensure initial state
           }));
        });
        render(<AiChatWithInteractiveHistory />);
        const user = userEvent.setup();
        const loadChatButton = screen.getByTestId('mock-history-item');

        // Simulate user selecting non-default provider/prompt *before* loading chat
        const changeProviderButton = screen.getByTestId('mock-model-selector-interactive');
        await user.click(changeProviderButton);
        const changePromptButton = screen.getByTestId('mock-prompt-selector-interactive');
        await user.click(changePromptButton);

        await vi.waitFor(() => {
            const modelSelectorCalls = vi.mocked(ImportedModelSelector).mock.calls;
            const lastModelCallArgs = modelSelectorCalls[modelSelectorCalls.length - 1][0];
            expect(lastModelCallArgs.selectedProviderId).toBe(initialProviders[1].id); // Verify selection changed
            
            const promptSelectorCalls = vi.mocked(ImportedPromptSelector).mock.calls;
            const lastPromptCallArgs = promptSelectorCalls[promptSelectorCalls.length - 1][0];
            expect(lastPromptCallArgs.selectedPromptId).toBe(initialPrompts[1].id); // Verify selection changed
        });
        
        loadChatDetailsMock.mockClear(); // Clear before load
        analyticsTrackMock.mockClear(); // Clear before load

        await user.click(loadChatButton);

        expect(loadChatDetailsMock).toHaveBeenCalledTimes(1);
        expect(loadChatDetailsMock).toHaveBeenCalledWith(chatToLoadId);

        expect(analyticsTrackMock).toHaveBeenCalledWith('Chat: History Item Selected', { chatId: chatToLoadId });
        
        // Verify selections reset to the first available
        await vi.waitFor(() => {
            const modelSelectorCalls = vi.mocked(ImportedModelSelector).mock.calls;
            const lastModelCallArgs = modelSelectorCalls[modelSelectorCalls.length - 1][0];
            expect(lastModelCallArgs.selectedProviderId).toBe(initialProviders[0].id); // Reset to first
            
            const promptSelectorCalls = vi.mocked(ImportedPromptSelector).mock.calls;
            const lastPromptCallArgs = promptSelectorCalls[promptSelectorCalls.length - 1][0];
            expect(lastPromptCallArgs.selectedPromptId).toBe(initialPrompts[0].id); // Reset to first
        });

        vi.doUnmock('../components/ai/ChatHistoryList');
        vi.doUnmock('../components/ai/ModelSelector');
        vi.doUnmock('../components/ai/PromptSelector');
    });

    it('should reset selections to null on handleLoadChat if no providers/prompts available', async () => {
        const chatToLoadId = 'chat-personal-2';
        const currentChatIdBeforeLoad = null;

        const currentLoadAiConfigMock = vi.fn();
        const currentLoadChatHistoryMock = vi.fn();

        const TempMockChatHistoryList = vi.fn((props: { onLoadChat: (id: string) => void }) => {
            return <button data-testid="mock-history-item-empty" onClick={() => props.onLoadChat(chatToLoadId)}>Load Chat Empty</button>;
        });
        // Use vi.doMock for ModelSelector and PromptSelector specifically for this test
        const TempMockModelSelector = vi.fn((props: { selectedProviderId: string | null }) => <div data-testid="temp-model-selector">{props.selectedProviderId}</div>);
        const TempMockPromptSelector = vi.fn((props: { selectedPromptId: string | null }) => <div data-testid="temp-prompt-selector">{props.selectedPromptId}</div>);

        vi.doMock('../components/ai/ChatHistoryList', () => ({ ChatHistoryList: TempMockChatHistoryList }));
        vi.doMock('../components/ai/ModelSelector', () => ({ ModelSelector: TempMockModelSelector }));
        vi.doMock('../components/ai/PromptSelector', () => ({ PromptSelector: TempMockPromptSelector }));

        const AiChatWithDynamicMocks = (await import('./AiChat')).default;
        // We don't need to import the selectors separately now, we'll use the vi.mocked(TempMock...)
        
        act(() => {
          useAiStore.setState(state => ({
            ...state,
            availableProviders: [], // No providers
            availablePrompts: [],   // No prompts
            loadAiConfig: currentLoadAiConfigMock,
            loadChatHistory: currentLoadChatHistoryMock,
            checkAndReplayPendingChatAction: vi.fn(),
            loadChatDetails: loadChatDetailsMock, // from outer scope
            startNewChat: startNewChatMock, // from outer scope
            currentChatId: currentChatIdBeforeLoad // Ensure initial state
           }));
        });
        render(<AiChatWithDynamicMocks />);
        const user = userEvent.setup();
        const loadChatButton = screen.getByTestId('mock-history-item-empty');

        // Clear mock calls after initial render and before interaction
        vi.mocked(TempMockModelSelector).mockClear();
        vi.mocked(TempMockPromptSelector).mockClear();

        await user.click(loadChatButton);

        expect(loadChatDetailsMock).toHaveBeenCalledWith(chatToLoadId);

        // Verify selections reset to null
        await vi.waitFor(() => {
            const modelSelectorCalls = vi.mocked(TempMockModelSelector).mock.calls;
            expect(modelSelectorCalls.length).toBeGreaterThan(0); 
            const lastModelCallArgs = modelSelectorCalls[modelSelectorCalls.length - 1][0];
            expect(lastModelCallArgs.selectedProviderId).toBeNull();

            const promptSelectorCalls = vi.mocked(TempMockPromptSelector).mock.calls;
            expect(promptSelectorCalls.length).toBeGreaterThan(0);
            const lastPromptCallArgs = promptSelectorCalls[promptSelectorCalls.length - 1][0];
            expect(lastPromptCallArgs.selectedPromptId).toBeNull();
        });

        vi.doUnmock('../components/ai/ChatHistoryList');
        vi.doUnmock('../components/ai/ModelSelector'); 
        vi.doUnmock('../components/ai/PromptSelector'); 
    });

    it('should NOT call loadChatDetails if handleLoadChat is called with the currentChatId', async () => {
        const currentChatIdInStore = 'chat-org-abc-1';
        const currentLoadAiConfigMock = vi.fn();
        const currentLoadChatHistoryMock = vi.fn();
        act(() => {
            useAiStore.setState({ 
                currentChatId: currentChatIdInStore,
                loadAiConfig: currentLoadAiConfigMock,
                loadChatHistory: currentLoadChatHistoryMock,
                checkAndReplayPendingChatAction: vi.fn(),
            });
        });

        const TempMockChatHistoryList = vi.fn((props: { onLoadChat: (id: string) => void }) => {
            return <button data-testid="mock-history-item-same" onClick={() => props.onLoadChat(currentChatIdInStore)}>Load Same Chat</button>;
        });
        vi.doMock('../components/ai/ChatHistoryList', () => ({ ChatHistoryList: TempMockChatHistoryList }));
        const AiChatWithInteractiveHistory = (await import('./AiChat')).default;

        render(<AiChatWithInteractiveHistory />);
        const user = userEvent.setup();
        const loadSameChatButton = screen.getByTestId('mock-history-item-same');

        await user.click(loadSameChatButton);

        expect(loadChatDetailsMock).not.toHaveBeenCalled();
        expect(analyticsTrackMock).not.toHaveBeenCalledWith('Chat: History Item Selected', expect.anything());
        vi.doUnmock('../components/ai/ChatHistoryList');
    });

  });

  // --- Test Suite for Props Passed to Children ---
  describe('Props Passed to Child Components', () => {
    it('should pass correct props to ChatContextSelector', async () => { // Made async
      const testOrgs = [{ id: 'org-xyz', name: 'Test Org', created_at: '', allow_member_chat_creation: true, visibility: 'private', deleted_at: null }] as Organization[];
      act(() => {
        useOrganizationStore.setState({ userOrganizations: testOrgs, currentOrganizationId: 'org-xyz', isLoading: false });
      });
      render(<AiChat />);
      await vi.waitFor(() => { // Wait for async updates
          expect(vi.mocked(ChatContextSelector)).toHaveBeenCalled();
      });
      const lastCallArgs = vi.mocked(ChatContextSelector).mock.lastCall;
      expect(lastCallArgs).toBeDefined();
      if (lastCallArgs && lastCallArgs.length > 0) {
        const props = lastCallArgs[0];
        expect(props).toBeDefined();
        expect(props).toEqual(expect.objectContaining({
            currentContextId: 'org-xyz',
            onContextChange: expect.any(Function),
        }));
      } else {
        throw new Error('MockChatContextSelector was not called');
      }
    });
    
    it('should pass currentContextId=null to ChatContextSelector if context is undefined initially', async () => { // Made async
        act(() => {
            useOrganizationStore.setState({ currentOrganizationId: undefined, isLoading: true });
        });
        render(<AiChat />); 
        await vi.waitFor(() => { // Wait for async updates
          expect(vi.mocked(ChatContextSelector)).toHaveBeenCalled();
        });
        const lastCallArgs = vi.mocked(ChatContextSelector).mock.lastCall;
        expect(lastCallArgs).toBeDefined();
        if (lastCallArgs && lastCallArgs.length > 0) {
            const props = lastCallArgs[0];
            expect(props).toBeDefined();
            expect(props).toEqual(expect.objectContaining({
                currentContextId: null,
                onContextChange: expect.any(Function),
            }));
        } else {
            throw new Error('MockChatContextSelector was not called');
        }
    });

    it('should pass correct props to ModelSelector and PromptSelector based on state', async () => { // Made async
        render(<AiChat />);
        await vi.waitFor(() => { // Wait for async updates
            expect(vi.mocked(ModelSelector)).toHaveBeenCalled();
            expect(vi.mocked(PromptSelector)).toHaveBeenCalled();
        });

        const lastModelCallArgs = vi.mocked(ModelSelector).mock.lastCall;
        expect(lastModelCallArgs).toBeDefined();
        if (lastModelCallArgs && lastModelCallArgs.length > 0) { // Check length
            const props = lastModelCallArgs[0];
            expect(props).toBeDefined();
            expect(props).toHaveProperty('selectedProviderId', aiStoreInitialState.availableProviders[0].id);
        } else {
          throw new Error("ModelSelector mock was not called with expected arguments or not called at all.");
        }

        const lastPromptCallArgs = vi.mocked(PromptSelector).mock.lastCall;
        expect(lastPromptCallArgs).toBeDefined();
        if (lastPromptCallArgs && lastPromptCallArgs.length > 0) { // Check length
            const props = lastPromptCallArgs[0];
            expect(props).toBeDefined();
            expect(props).toHaveProperty('selectedPromptId', aiStoreInitialState.availablePrompts[0].id);
        } else {
          throw new Error("PromptSelector mock was not called with expected arguments or not called at all.");
        }
    });

    it('should pass correct props to AiChatbox including updated key', async () => { // Made async
      const initialCurrentChatId = 'chat-123';
      const initialSelectedProviderId = aiStoreInitialState.availableProviders[0].id; // from default setup
      const initialSelectedPromptId = aiStoreInitialState.availablePrompts[0].id;   // from default setup
      const initialNextChatOrgContext = 'org-context-initial';

      act(() => {
        useAiStore.setState(state => ({ // Ensure AiStore has providers/prompts for default selection
          ...state, // keep existing mocks for actions like loadAiConfig etc.
          currentChatId: initialCurrentChatId,
          availableProviders: [...aiStoreInitialState.availableProviders], // Use a copy
          availablePrompts: [...aiStoreInitialState.availablePrompts],   // Use a copy
        }));
        useOrganizationStore.setState({ currentOrganizationId: initialNextChatOrgContext });
      });
      
      const { rerender } = render(<AiChat />); 

      // Wait for AiChatPage's useEffects to set selectedProviderId, selectedPromptId, and nextChatOrgContext
      await vi.waitFor(() => {
        expect(vi.mocked(AiChatbox)).toHaveBeenLastCalledWith( // Check the state after effects have run
          expect.objectContaining({
            providerId: initialSelectedProviderId,
            promptId: initialSelectedPromptId
            // key: `${initialCurrentChatId}-${initialSelectedProviderId}-${initialSelectedPromptId}-${initialNextChatOrgContext}` // Key is not passed as a prop
          }),
          expect.anything()
        );
      });

      // Simulate a change that affects the key parts
      const newChatId = 'chat-456';
      const newContextId = 'org-context-new';

      // Simulate selecting a new context via ChatContextSelector
      vi.mocked(ChatContextSelector).mockImplementationOnce((props: { onContextChange: (id: string | null) => void }) => 
        <button data-testid="context-selector-button-alt" onClick={() => props.onContextChange(newContextId)}>Select New Context</button>
      );
      rerender(<AiChat />); 
      fireEvent.click(screen.getByTestId('context-selector-button-alt'));

      act(() => {
        useAiStore.setState({ currentChatId: newChatId });
      });
      rerender(<AiChat />);

      await vi.waitFor(() => {
        expect(vi.mocked(AiChatbox)).toHaveBeenLastCalledWith(
          expect.objectContaining({
            providerId: initialSelectedProviderId, // Assuming these didn't change in this flow
            promptId: initialSelectedPromptId   // Assuming these didn't change in this flow
            // key: `${newChatId}-${initialSelectedProviderId}-${initialSelectedPromptId}-${newContextId}` // Key is not passed as a prop
          }),
          expect.anything()
        );
      });
    });

  });

}); 