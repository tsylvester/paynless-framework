import React from 'react';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import AiChatPage from './AiChat';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import type { Organization, Chat, User, AiProvider, SystemPrompt, ChatMessage, AiStore } from '@paynless/types';

// --- Global Mocks ---
vi.mock('@paynless/analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

vi.mock('../components/layout/Layout', () => ({
  Layout: vi.fn(({ children }: { children: React.ReactNode }) => <div data-testid="layout-mock">{children}</div>),
}));

vi.mock('../components/ai/ModelSelector', () => ({
  ModelSelector: vi.fn(() => <div data-testid="model-selector-mock"></div>),
}));

vi.mock('../components/ai/PromptSelector', () => ({
  PromptSelector: vi.fn(() => <div data-testid="prompt-selector-mock"></div>),
}));

// Updated ChatContextSelector mock - it no longer takes currentContextId or onContextChange
// It now reads from the store, but for AiChatPage tests, we mostly care that it renders.
// Interactions that change context will be tested by setting the store state directly.
vi.mock('../components/ai/ChatContextSelector', () => ({
  ChatContextSelector: vi.fn(() => <div data-testid="chat-context-selector-mock">Chat Context Selector</div>),
}));

// --- WalletSelector Mock ---
vi.mock('../components/ai/WalletSelector', () => ({
  WalletSelector: vi.fn(() => <div data-testid="wallet-selector-mock">Wallet Selector</div>),
}));

// --- Store Mocks & Initial States ---
const mockUser: User = { id: 'user-test-123', email: 'test@example.com' };
const orgA: Organization = { id: 'org-A', name: 'Org A', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null, token_usage_policy: 'organization_tokens' };
const orgB: Organization = { id: 'org-B', name: 'Org B', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null, token_usage_policy: 'member_tokens' };

const chatPersonal1: Chat = { id: 'chat-p1', title: 'Personal Chat 1', organization_id: null, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };
const chatOrgA1: Chat = { id: 'chat-a1', title: 'Org A Chat 1', organization_id: orgA.id, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };

const setupStoreAndSpies = async (
    initialGlobalOrgId: string | null, 
    initialPersonalHistoryState: Chat[] | undefined | 'fetchedEmpty', 
    initialOrgAHistoryState: Chat[] | undefined | 'fetchedEmpty',
    initialOrgBHistoryState?: Chat[] | undefined | 'fetchedEmpty',
    initialSelectedChatContext?: string | null // Added for new state
) => {
  const mockLoadAiConfig = vi.fn();
  const mockLoadChatHistory = vi.fn();
  const mockLoadChatDetails = vi.fn();
  const mockStartNewChat = vi.fn();
  const mockDeleteChat = vi.fn();
  const mockPrepareRewind = vi.fn();
  const mockCancelRewindPreparation = vi.fn();
  const mockClearAiError = vi.fn();
  const mockSendMessage = vi.fn().mockResolvedValue(null);
  const mockSetNewChatContext = vi.fn(); // New mock action
  const mockSetSelectedProvider = vi.fn(); // New mock action
  const mockSetSelectedPrompt = vi.fn(); // New mock action

  const analyticsModule = await import('@paynless/analytics');
  const mockAnalyticsTrack = vi.mocked(analyticsModule.analytics.track);
  mockAnalyticsTrack.mockClear();

  act(() => {
    useAuthStore.setState({ user: mockUser, isLoading: false, error: null }, true);
    useOrganizationStore.setState({ 
      userOrganizations: [orgA, orgB],
      currentOrganizationId: initialGlobalOrgId, 
      isLoading: false, 
      error: null
    }, true);

    const personalChats = initialPersonalHistoryState === 'fetchedEmpty' ? [] : initialPersonalHistoryState;
    const orgAChats = initialOrgAHistoryState === 'fetchedEmpty' ? [] : initialOrgAHistoryState;
    const orgBChats = initialOrgBHistoryState === 'fetchedEmpty' ? [] : initialOrgBHistoryState;

    useAiStore.setState({
      availableProviders: [{ id: 'prov-1', name: 'Provider 1' } as AiProvider],
      availablePrompts: [{ id: 'prompt-1', name: 'Prompt 1' } as SystemPrompt],
      chatsByContext: {
        personal: personalChats,
        orgs: {
          [orgA.id!]: orgAChats,
          [orgB.id!]: orgBChats,
        },
      },
      messagesByChatId: {},
      selectedMessagesMap: {},
      currentChatId: null,
      selectedProviderId: null, // Add initial value for selectedProviderId
      selectedPromptId: null, // Add initial value for selectedPromptId
      newChatContext: initialSelectedChatContext, // Initialize newChatContext with the parameter directly (can be undefined)
      isLoadingAiResponse: false,
      isConfigLoading: false,
      isLoadingHistoryByContext: { personal: false, orgs: {} },
      isDetailsLoading: false,
      aiError: null,
      historyErrorByContext: { personal: null, orgs: {} },
      rewindTargetMessageId: null, // Ensure rewindTargetMessageId is initialized
      
      pendingAction: null,
      // Actions
      loadAiConfig: mockLoadAiConfig,
      loadChatHistory: mockLoadChatHistory,
      loadChatDetails: mockLoadChatDetails,
      startNewChat: mockStartNewChat,
      deleteChat: mockDeleteChat,
      prepareRewind: mockPrepareRewind,
      cancelRewindPreparation: mockCancelRewindPreparation,
      clearAiError: mockClearAiError,
      sendMessage: mockSendMessage,
      setNewChatContext: mockSetNewChatContext, // Add new action mock
      setSelectedProvider: mockSetSelectedProvider, // Add new action mock
      setSelectedPrompt: mockSetSelectedPrompt, // Add new action mock
    }, true);
  });

  mockLoadAiConfig.mockResolvedValue(undefined);
  mockLoadChatHistory.mockResolvedValue(undefined);
  mockLoadChatDetails.mockResolvedValue(undefined);

  return {
    mockLoadAiConfig,
    mockLoadChatHistory,
    mockLoadChatDetails,
    mockStartNewChat,
    mockDeleteChat,
    mockPrepareRewind,
    mockCancelRewindPreparation,
    mockClearAiError,
    mockSendMessage,
    mockSetNewChatContext,
    mockSetSelectedProvider,
    mockSetSelectedPrompt,
    mockAnalyticsTrack
  };
};

describe('AiChatPage Integration Tests', () => {
  let mocks: Awaited<ReturnType<typeof setupStoreAndSpies>>;

  beforeEach(async () => {
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1]);
  });

  // Test 1.1: Initial render with Org A (pre-filled history)
  it('should render and default to global org context, displaying its history if pre-filled', async () => {
    render(<AiChatPage />);
    // expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name!);
    // The above assertion is no longer valid as the mock is simpler.
    // We verify ChatContextSelector is rendered, its internal state is tested separately.
    expect(screen.getByTestId('chat-context-selector-mock')).toBeInTheDocument();
    expect(await screen.findByText('Org A Chat History')).toBeInTheDocument();
    expect(screen.getByText(chatOrgA1.title!)).toBeInTheDocument();
    expect(mocks.mockLoadChatHistory).not.toHaveBeenCalled();
  });

  // Test 1.2: Initial render with Org A (empty history, should load)
  it('should call loadChatHistory if global org context history is NOT pre-filled', async () => {
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], undefined);
    render(<AiChatPage />);
    expect(await screen.findByTestId('chat-context-selector-mock')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith(orgA.id);
    });
  });

  // Test 1.3: Initial render with Personal (pre-filled history)
  it('should render and default to Personal context, displaying its history if pre-filled', async () => {
    mocks = await setupStoreAndSpies(null, [chatPersonal1], [chatOrgA1]);
    render(<AiChatPage />);
    // expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent('Personal');
    expect(screen.getByTestId('chat-context-selector-mock')).toBeInTheDocument();
    expect(await screen.findByText('Personal Chat History')).toBeInTheDocument();
    expect(screen.getByText(chatPersonal1.title!)).toBeInTheDocument();
    expect(mocks.mockLoadChatHistory).not.toHaveBeenCalled();
  });

  // Test 1.4: Initial render with Personal (empty history, should load)
  it('should call loadChatHistory if Personal context history is NOT pre-filled', async () => {
    mocks = await setupStoreAndSpies(null, undefined, [chatOrgA1]);
    render(<AiChatPage />);
    expect(await screen.findByTestId('chat-context-selector-mock')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith('personal');
    });
  });

  // Test 2.1: Context Switching to Personal
  it("selecting 'Personal' in ChatContextSelector should load personal history if not pre-filled", async () => {
    // const user = userEvent.setup(); // userEvent not used for this part now
    mocks = await setupStoreAndSpies(orgA.id, undefined, [chatOrgA1]);
    render(<AiChatPage />);
    
    // Simulate ChatContextSelector updating the store directly for testing AiChatPage's reaction
    act(() => {
      useAiStore.setState({ newChatContext: 'personal' });
    });
    
    await waitFor(() => {
      // AiChatPage useEffect for activeContextIdForHistory should trigger loadChatHistory
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith('personal');
    });
    // Analytics for context selection for new chat is tracked by setSelectedChatContextForNewChat action in store,
    // not directly by AiChatPage anymore.
    // expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', { contextId: 'personal' });
  });

  // Test 2.2: Context Switching to Org B
  it("selecting Org B in ChatContextSelector should load Org B history if not pre-filled", async () => {
    // const user = userEvent.setup(); // userEvent not used
    render(<AiChatPage />);
    expect(await screen.findByText(chatOrgA1.title!)).toBeInTheDocument();
    mocks.mockLoadChatHistory.mockClear();

    // Simulate ChatContextSelector updating the store directly
    act(() => {
      useAiStore.setState({ newChatContext: orgB.id });
    });

    await waitFor(() => {
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith(orgB.id);
    });
    // Analytics for context selection for new chat is tracked by setSelectedChatContextForNewChat action in store.
    // expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', { contextId: orgB.id });
  });

  // Test 3.1: New Chat - Personal
  it("clicking 'New Chat' when 'Personal' context is active (set in store) should call startNewChat for personal", async () => {
    const user = userEvent.setup();
    // Set up store with Personal as the selected context for new chat
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1], undefined, null);
    render(<AiChatPage />);
    
    // Ensure page has rendered, e.g., by finding some existing content if necessary
    // await screen.findByText(chatOrgA1.title!); // This might be for a different context initially loaded by globalCurrentOrgId

    mocks.mockStartNewChat.mockClear();
    mocks.mockAnalyticsTrack.mockClear();

    await user.click(screen.getByTestId('new-chat-button'));
    // startNewChat should be called with the value from selectedChatContextForNewChat (null)
    expect(mocks.mockStartNewChat).toHaveBeenCalledWith(null);
    expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', { contextId: 'personal' });
  });

  // Test 3.2: New Chat - Org
  it("clicking 'New Chat' when an organization context is active (set in store) should call startNewChat for that org", async () => {
    const user = userEvent.setup();
    // Set up store with OrgA as the selected context for new chat
    mocks = await setupStoreAndSpies(null, [chatPersonal1], [chatOrgA1], undefined, orgA.id);
    render(<AiChatPage />);

    mocks.mockStartNewChat.mockClear(); // Clear before action
    mocks.mockAnalyticsTrack.mockClear();

    await user.click(screen.getByTestId('new-chat-button'));
    // startNewChat should be called with the value from selectedChatContextForNewChat (orgA.id)
    expect(mocks.mockStartNewChat).toHaveBeenCalledWith(orgA.id);
    expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', { contextId: orgA.id });
  });

  // Test 4.1: Load Chat from History List
  it('clicking a chat item in ChatHistoryList should call loadChatDetails', async () => {
    const user = userEvent.setup();
    render(<AiChatPage />);    
    const chatItemButton = await screen.findByRole('button', { name: new RegExp(chatOrgA1.title!, 'i') });
    expect(chatItemButton).toBeInTheDocument();
    mocks.mockLoadChatDetails.mockClear();
    await user.click(chatItemButton);
    expect(mocks.mockLoadChatDetails).toHaveBeenCalledWith(chatOrgA1.id);
  });

  // Test 5.1a: Message Alignment
  it('renders ChatMessageBubble for user and assistant messages with the correct alignment', async () => {
    vi.unmock('../components/ai/AiChatbox');
    // Setup: Add a chat with both user and assistant messages
    const chatId = chatOrgA1.id;
    const userMessage: ChatMessage = { 
      id: 'msg1-alignment',
      role: 'user', 
      content: 'User message for alignment test', 
      created_at: new Date().toISOString(), 
      user_id: mockUser.id, 
      chat_id: chatId,
      system_prompt_id: null,
      ai_provider_id: null,
      token_usage: null,
      updated_at: new Date().toISOString(),
      is_active_in_thread: true,
    } as ChatMessage;
    const assistantMessage: ChatMessage = { 
      id: 'msg2-alignment',
      role: 'assistant', 
      content: 'Assistant message for alignment test', 
      created_at: new Date().toISOString(), 
      ai_provider_id: 'prov-1',
      chat_id: chatId,
      user_id: null,
      system_prompt_id: null,
      token_usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      updated_at: new Date().toISOString(),
      is_active_in_thread: true,
    } as ChatMessage;

    act(() => {
      const existingState = useAiStore.getState(); // Get existing state to merge critical parts
      useAiStore.setState({
        ...existingState, // Preserve other parts of state
        messagesByChatId: {
          [chatId]: [userMessage, assistantMessage],
        },
        currentChatId: chatId,
        // Ensure selectedMessagesMap is present and correctly structured for the current chat
        selectedMessagesMap: { 
          ...(existingState.selectedMessagesMap || {}), // Merge with existing selections if any
          [chatId]: { [userMessage.id]: true, [assistantMessage.id]: true } 
        },
        isDetailsLoading: false, // Explicitly set as the original test logic might have done this via mockLoadChatDetails side effect
      }, true); // Replace state
      mocks.mockLoadChatDetails.mockResolvedValueOnce(undefined); // Simulate action completion
    });
    render(<AiChatPage />);
    await act(async () => {
      await useAiStore.getState().loadChatDetails(chatId);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('chat-message-bubble-card')).toHaveLength(2);
    });
    // User message should be aligned to the end (right)
    const userMessageLayout = screen.getByTestId('chat-message-layout-user');
    expect(userMessageLayout.className).toMatch(/justify-end/);
    // Assistant message should be aligned to the start (left)
    const assistantMessageLayout = screen.getByTestId('chat-message-layout-assistant');
    expect(assistantMessageLayout.className).toMatch(/justify-start/);
  });

  // Test 5.1b: AttributionDisplay
  it('uses AttributionDisplay to render user name and date correctly for user and assistant messages', async () => {
    vi.unmock('../components/ai/AiChatbox');
    // Setup: Add a chat with both user and assistant messages
    const chatId = 'chat-with-attribution';
    const userMessage: ChatMessage = { 
      id: 'msg3-attribution',
      role: 'user', 
      content: 'Another User message for attribution', 
      created_at: new Date(2023, 0, 15, 10, 30).toISOString(), 
      user_id: mockUser.id,
      chat_id: chatId,
      system_prompt_id: null,
      ai_provider_id: null,
      token_usage: null,
      updated_at: new Date(2023, 0, 15, 10, 30).toISOString(),
      is_active_in_thread: true,
    } as ChatMessage; 
    const assistantMessage: ChatMessage = { 
      id: 'msg4-attribution',
      role: 'assistant', 
      content: 'Another Assistant message for attribution', 
      created_at: new Date(2023, 0, 15, 10, 31).toISOString(), 
      ai_provider_id: 'prov-1',
      chat_id: chatId,
      user_id: null,
      system_prompt_id: null,
      token_usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
      updated_at: new Date(2023, 0, 15, 10, 31).toISOString(),
      is_active_in_thread: true,
    } as ChatMessage;

    // Mock user profiles
    const mockProfiles: AiStore['chatParticipantsProfiles'] = { 
      [mockUser.id]: { 
        id: mockUser.id, 
        first_name: 'Test',
        last_name: 'User',
        chat_context: { defaultPromptId: 'prompt-1', defaultProviderId: 'prov-1' },
        created_at: new Date().toISOString(),
        last_selected_org_id: orgA.id,
        profile_privacy_setting: 'private',
        role: 'user',
        updated_at: new Date().toISOString(),
      }
    };
    
    act(() => {
      const existingState = useAiStore.getState();
      useAiStore.setState({
        ...existingState,
        chatParticipantsProfiles: mockProfiles, // This was the primary purpose of this setState
        messagesByChatId: {
          ...(existingState.messagesByChatId || {}),
          [chatId]: [userMessage, assistantMessage],
        },
        currentChatId: chatId,
        selectedMessagesMap: {
          ...(existingState.selectedMessagesMap || {}),
          [chatId]: { [userMessage.id]: true, [assistantMessage.id]: true }
        },
        isDetailsLoading: false, // Explicitly set
      }, true); // Replace state
      mocks.mockLoadChatDetails.mockResolvedValueOnce(undefined); // Simulate action completion
    });
    render(<AiChatPage />);
    await act(async () => {
      await useAiStore.getState().loadChatDetails(chatId);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('chat-message-bubble-card')).toHaveLength(2);
    });
    // User attribution: should show email or truncated ID
    const userBubble = within(screen.getByTestId('chat-message-layout-user'));
    expect(userBubble.getByText(/test@example.com \(You\)|user-test-123 \(You\)|User \(You\)/)).toBeInTheDocument();
    // Assistant attribution: should show 'Assistant'
    const assistantBubble = within(screen.getByTestId('chat-message-layout-assistant'));
    expect(assistantBubble.getByText(/Assistant/)).toBeInTheDocument();
    // Timestamp: should show a relative time (e.g., 'less than a minute ago')
    // Check within each bubble to ensure timestamps are present for both
    expect(userBubble.getAllByTitle(/ago|AM|PM|GMT|UTC/).length).toBeGreaterThanOrEqual(1);
    expect(assistantBubble.getAllByTitle(/ago|AM|PM|GMT|UTC/).length).toBeGreaterThanOrEqual(1);
  });
}); 