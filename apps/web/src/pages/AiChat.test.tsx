import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import AiChatPage from './AiChat';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import type { Organization, Chat, User, AiProvider, SystemPrompt } from '@paynless/types';

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

// Define MockChatContextSelector as a function declaration BEFORE it's used in vi.mock factory
function MockChatContextSelector({ currentContextId, onContextChange }: { currentContextId: string | null; onContextChange: (id: string | null) => void; organizations?: Organization[], isLoading?: boolean }) {
  let displayValue = 'Select Context';
  if (currentContextId === null) displayValue = 'Personal';
  else if (currentContextId === 'org-A') displayValue = 'Org A';
  else if (currentContextId === 'org-B') displayValue = 'Org B';

  return (
    <div>
      <button data-testid="mock-context-selector-trigger">{displayValue}</button>
      <div data-testid="mock-context-options">
        <button data-testid="mock-option-personal" onClick={() => onContextChange(null)}>Personal</button>
        <button data-testid="mock-option-org-A" onClick={() => onContextChange('org-A')}>Org A</button>
        <button data-testid="mock-option-org-B" onClick={() => onContextChange('org-B')}>Org B</button>
      </div>
    </div>
  );
}

vi.mock('../components/ai/ChatContextSelector', () => ({ ChatContextSelector: MockChatContextSelector }));

// --- Store Mocks & Initial States ---
const mockUser: User = { id: 'user-test-123', email: 'test@example.com' };
const orgA: Organization = { id: 'org-A', name: 'Org A', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };
const orgB: Organization = { id: 'org-B', name: 'Org B', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };

const chatPersonal1: Chat = { id: 'chat-p1', title: 'Personal Chat 1', organization_id: null, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };
const chatOrgA1: Chat = { id: 'chat-a1', title: 'Org A Chat 1', organization_id: orgA.id, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };

const setupStoreAndSpies = async (
    initialGlobalOrgId: string | null, 
    initialPersonalHistoryState: Chat[] | undefined | 'fetchedEmpty', 
    initialOrgAHistoryState: Chat[] | undefined | 'fetchedEmpty',
    initialOrgBHistoryState?: Chat[] | undefined | 'fetchedEmpty'
) => {
  const mockLoadAiConfig = vi.fn();
  const mockLoadChatHistory = vi.fn();
  const mockLoadChatDetails = vi.fn();
  const mockStartNewChat = vi.fn();
  const mockCheckAndReplayPendingChatAction = vi.fn();
  const mockDeleteChat = vi.fn();
  const mockPrepareRewind = vi.fn();
  const mockCancelRewindPreparation = vi.fn();
  const mockClearAiError = vi.fn();
  const mockSendMessage = vi.fn().mockResolvedValue(null);

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
      currentChatId: null,
      isLoadingAiResponse: false,
      isConfigLoading: false,
      isLoadingHistoryByContext: { personal: false, orgs: {} },
      isDetailsLoading: false,
      aiError: null,
      historyErrorByContext: { personal: null, orgs: {} },
      
      // Actions
      loadAiConfig: mockLoadAiConfig,
      loadChatHistory: mockLoadChatHistory,
      loadChatDetails: mockLoadChatDetails,
      startNewChat: mockStartNewChat,
      checkAndReplayPendingChatAction: mockCheckAndReplayPendingChatAction,
      deleteChat: mockDeleteChat,
      prepareRewind: mockPrepareRewind,
      cancelRewindPreparation: mockCancelRewindPreparation,
      clearAiError: mockClearAiError,
      sendMessage: mockSendMessage,
    }, true);
  });

  mockLoadAiConfig.mockResolvedValue(undefined);
  mockLoadChatHistory.mockResolvedValue(undefined);
  mockLoadChatDetails.mockResolvedValue(undefined);
  mockCheckAndReplayPendingChatAction.mockResolvedValue(undefined);

  return {
    mockLoadAiConfig,
    mockLoadChatHistory,
    mockLoadChatDetails,
    mockStartNewChat,
    mockCheckAndReplayPendingChatAction,
    mockDeleteChat,
    mockPrepareRewind,
    mockCancelRewindPreparation,
    mockClearAiError,
    mockSendMessage,
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
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name!);
    expect(await screen.findByText('Org A Chat History')).toBeInTheDocument();
    expect(screen.getByText(chatOrgA1.title!)).toBeInTheDocument();
    expect(mocks.mockLoadChatHistory).not.toHaveBeenCalled();
  });

  // Test 1.2: Initial render with Org A (empty history, should load)
  it('should call loadChatHistory if global org context history is NOT pre-filled', async () => {
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], undefined);
    render(<AiChatPage />);
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name!);
    await waitFor(() => {
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith(orgA.id);
    });
  });

  // Test 1.3: Initial render with Personal (pre-filled history)
  it('should render and default to Personal context, displaying its history if pre-filled', async () => {
    mocks = await setupStoreAndSpies(null, [chatPersonal1], [chatOrgA1]);
    render(<AiChatPage />);
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent('Personal');
    expect(await screen.findByText('Personal Chat History')).toBeInTheDocument();
    expect(screen.getByText(chatPersonal1.title!)).toBeInTheDocument();
    expect(mocks.mockLoadChatHistory).not.toHaveBeenCalled();
  });

  // Test 1.4: Initial render with Personal (empty history, should load)
  it('should call loadChatHistory if Personal context history is NOT pre-filled', async () => {
    mocks = await setupStoreAndSpies(null, undefined, [chatOrgA1]);
    render(<AiChatPage />);
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent('Personal');
    await waitFor(() => {
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith(null);
    });
  });

  // Test 2.1: Context Switching to Personal
  it("selecting 'Personal' in ChatContextSelector should load personal history if not pre-filled", async () => {
    const user = userEvent.setup();
    mocks = await setupStoreAndSpies(orgA.id, undefined, [chatOrgA1]);
    render(<AiChatPage />);
    
    await user.click(screen.getByTestId('mock-option-personal'));
    
    await waitFor(() => {
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith(null);
    });
    expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', { contextId: 'personal' });
  });

  // Test 2.2: Context Switching to Org B
  it("selecting Org B in ChatContextSelector should load Org B history if not pre-filled", async () => {
    const user = userEvent.setup();
    render(<AiChatPage />);
    expect(await screen.findByText(chatOrgA1.title!)).toBeInTheDocument();
    mocks.mockLoadChatHistory.mockClear();

    await user.click(screen.getByTestId('mock-option-org-B'));
    await waitFor(() => {
      expect(mocks.mockLoadChatHistory).toHaveBeenCalledWith(orgB.id);
    });
    expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', { contextId: orgB.id });
  });

  // Test 3.1: New Chat - Personal
  it("clicking 'New Chat' when 'Personal' context is active should call startNewChat for personal", async () => {
    const user = userEvent.setup();
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1]);
    render(<AiChatPage />);
    
    await screen.findByText(chatOrgA1.title!);
    await user.click(screen.getByTestId('mock-option-personal'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent('Personal');
    });

    mocks.mockStartNewChat.mockClear();
    mocks.mockAnalyticsTrack.mockClear();

    await user.click(screen.getByTestId('new-chat-button'));
    expect(mocks.mockStartNewChat).toHaveBeenCalledWith(null);
    expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', { contextId: 'personal' });
  });

  // Test 3.2: New Chat - Org
  it("clicking 'New Chat' when an organization context is active should call startNewChat for that org", async () => {
    const user = userEvent.setup();
    render(<AiChatPage />);
    await user.click(screen.getByTestId('new-chat-button'));
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
    const userId = mockUser.id;
    const chatId = 'chat-p1';
    const messages = [
      {
        id: 'msg-user-1',
        chat_id: chatId,
        user_id: userId,
        role: 'user',
        content: 'User message',
        created_at: new Date().toISOString(),
        ai_provider_id: null,
        is_active_in_thread: true,
        system_prompt_id: null,
        token_usage: null
      },
      {
        id: 'msg-assistant-1',
        chat_id: chatId,
        user_id: userId,
        role: 'assistant',
        content: 'Assistant message',
        created_at: new Date().toISOString(),
        ai_provider_id: 'prov-1',
        is_active_in_thread: true,
        system_prompt_id: null,
        token_usage: null
      },
    ];
    mocks.mockLoadChatDetails.mockImplementation(async (id) => {
      if (id === chatId) {
        act(() => {
          useAiStore.setState(prev => ({
            ...prev,
            messagesByChatId: { ...prev.messagesByChatId, [chatId]: messages },
            currentChatId: chatId,
            isDetailsLoading: false
          }));
        });
      }
    });
    render(<AiChatPage />);
    await act(async () => {
      await useAiStore.getState().loadChatDetails(chatId);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('chat-message-bubble-card')).toHaveLength(2);
    });
    const bubbles = screen.getAllByTestId('chat-message-bubble-card');
    // User message should have self-end
    expect(bubbles[0].className).toMatch(/self-end/);
    // Assistant message should have self-start
    expect(bubbles[1].className).toMatch(/self-start/);
  });

  // Test 5.1b: AttributionDisplay
  it('uses AttributionDisplay to render user name and date correctly for user and assistant messages', async () => {
    vi.unmock('../components/ai/AiChatbox');
    // Setup: Add a chat with both user and assistant messages
    const userId = mockUser.id;
    const chatId = 'chat-p1';
    const now = new Date();
    const messages = [
      {
        id: 'msg-user-1',
        chat_id: chatId,
        user_id: userId,
        role: 'user',
        content: 'User message',
        created_at: now.toISOString(),
        ai_provider_id: null,
        is_active_in_thread: true,
        system_prompt_id: null,
        token_usage: null
      },
      {
        id: 'msg-assistant-1',
        chat_id: chatId,
        user_id: userId,
        role: 'assistant',
        content: 'Assistant message',
        created_at: now.toISOString(),
        ai_provider_id: 'prov-1',
        is_active_in_thread: true,
        system_prompt_id: null,
        token_usage: null
      },
    ];
    mocks.mockLoadChatDetails.mockImplementation(async (id) => {
      if (id === chatId) {
        act(() => {
          useAiStore.setState(prev => ({
            ...prev,
            messagesByChatId: { ...prev.messagesByChatId, [chatId]: messages },
            currentChatId: chatId,
            isDetailsLoading: false
          }));
        });
      }
    });
    render(<AiChatPage />);
    await act(async () => {
      await useAiStore.getState().loadChatDetails(chatId);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('chat-message-bubble-card')).toHaveLength(2);
    });
    // User attribution: should show email or truncated ID
    expect(screen.getByText(/test@example.com \(You\)|user-test-123 \(You\)|User \(You\)/)).toBeInTheDocument();
    // Assistant attribution: should show 'Assistant'
    expect(screen.getByText(/Assistant/)).toBeInTheDocument();
    // Timestamp: should show a relative time (e.g., 'less than a minute ago')
    expect(screen.getAllByTitle(/ago|AM|PM|GMT|UTC/).length).toBeGreaterThanOrEqual(2);
  });
}); 