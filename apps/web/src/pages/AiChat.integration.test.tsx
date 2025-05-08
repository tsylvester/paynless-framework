import React from 'react';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

import AiChatPage from './AiChat';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import type { Organization, Chat, ChatMessage, User, AiProvider, SystemPrompt } from '@paynless/types';

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
vi.mock('../components/ai/AiChatbox', () => ({
  AiChatbox: vi.fn(() => <div data-testid="ai-chatbox-mock"></div>),
}));

// Mock ChatContextSelector for simpler integration testing
interface MockChatContextSelectorProps {
  organizations: Organization[];
  currentContextId: string | null;
  onContextChange: (contextId: string | null) => void;
  isLoading: boolean;
}
vi.mock('../components/ai/ChatContextSelector', () => ({
  ChatContextSelector: vi.fn(({ organizations, currentContextId, onContextChange, isLoading }: MockChatContextSelectorProps) => {
    const currentOrg = organizations.find(org => org.id === currentContextId);
    const displayValue = isLoading ? 'Loading contexts...' : (currentContextId === null ? 'Personal' : currentOrg?.name || 'Select Context');
    
    return (
      <div>
        <button data-testid="mock-context-selector-trigger">{displayValue}</button>
        {!isLoading && (
          <div data-testid="mock-context-options">
            <button data-testid="mock-option-personal" onClick={() => onContextChange(null)}>Personal</button>
            {organizations.map(org => (
              <button data-testid={`mock-option-${org.id}`} key={org.id} onClick={() => onContextChange(org.id)}>{org.name}</button>
            ))}
          </div>
        )}
      </div>
    );
  })
}));

// ChatContextSelector and ChatHistoryList are NOT mocked by default for integration tests.

// --- Store Mocks & Initial States ---
let mockLoadAiConfig: Mock;
let mockLoadChatHistory: Mock;
let mockLoadChatDetails: Mock;
let mockStartNewChat: Mock;
let mockCheckAndReplayPendingChatAction: Mock;
let mockAnalyticsTrack: Mock;

const mockUser: User = { id: 'user-test-123', email: 'test@example.com' };

const initialAuthStoreState = {
  user: mockUser,
  isLoading: false,
  error: null,
  // other auth state fields...
};

const orgA: Organization = { id: 'org-A', name: 'Org A', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };
const orgB: Organization = { id: 'org-B', name: 'Org B', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };

const initialOrgStoreState = {
  userOrganizations: [orgA, orgB],
  currentOrganizationId: null as string | null, // To be set per test
  isLoading: false,
  orgError: null,
  // other org state fields...
};

const chatPersonal1: Chat = { id: 'chat-p1', title: 'Personal Chat 1', organization_id: null, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };
const chatOrgA1: Chat = { id: 'chat-a1', title: 'Org A Chat 1', organization_id: orgA.id, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };
const chatOrgB1: Chat = { id: 'chat-b1', title: 'Org B Chat 1', organization_id: orgB.id, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };


const initialAiStoreState = {
  availableProviders: [{ id: 'prov-1', name: 'Provider 1', api_identifier: 'p1', is_active: true, is_enabled: true, config:{}, created_at:'', updated_at:'', description:'', provider:'' }] as AiProvider[],
  availablePrompts: [{ id: 'prompt-1', name: 'Prompt 1', prompt_text:'text', created_at:'', updated_at:'', is_active:true }] as SystemPrompt[],
  chatsByContext: {
    personal: [chatPersonal1],
    orgs: { [orgA.id]: [chatOrgA1], [orgB.id]: [chatOrgB1] },
  },
  messagesByChatId: {}, // Populate if needed for specific tests
  currentChatId: null as string | null,
  isLoadingAiResponse: false,
  isConfigLoading: false,
  isLoadingHistoryByContext: { personal: false, orgs: { [orgA.id]: false, [orgB.id]: false } },
  isDetailsLoading: false,
  newChatContext: null as string | null, // This is internal to AiChatPage, not directly set in store setup
  rewindTargetMessageId: null,
  aiError: null,
  // Actions will be spied on
};

describe('AiChatPage Integration Tests', () => {
  beforeEach(async () => {
    // Reset Vitest spies
    mockLoadAiConfig = vi.fn();
    mockLoadChatHistory = vi.fn();
    mockLoadChatDetails = vi.fn();
    mockStartNewChat = vi.fn();
    mockCheckAndReplayPendingChatAction = vi.fn();

    const analyticsModule = await import('@paynless/analytics');
    mockAnalyticsTrack = vi.mocked(analyticsModule.analytics.track);
    mockAnalyticsTrack.mockClear();

    // Set initial store states
    act(() => {
      useAuthStore.setState(structuredClone(initialAuthStoreState), true);
      useOrganizationStore.setState(structuredClone(initialOrgStoreState), true); // currentOrganizationId will be overridden in tests
      useAiStore.setState(
        (state) => ({
          ...state, // keep potential other functions from actual store
          ...structuredClone(initialAiStoreState),
          loadAiConfig: mockLoadAiConfig,
          loadChatHistory: mockLoadChatHistory,
          loadChatDetails: mockLoadChatDetails,
          startNewChat: mockStartNewChat,
          checkAndReplayPendingChatAction: mockCheckAndReplayPendingChatAction,
        }),
        true
      );
    });

    // Default mock resolutions
    mockLoadAiConfig.mockResolvedValue(undefined);
    mockLoadChatHistory.mockResolvedValue(undefined); // important for context switching tests
    mockLoadChatDetails.mockResolvedValue(undefined);
    mockCheckAndReplayPendingChatAction.mockResolvedValue(undefined);
  });

  // Test 1.1
  it('should render and default to global organization context, loading its history', async () => {
    act(() => {
      useOrganizationStore.setState({ currentOrganizationId: orgA.id });
    });

    render(<AiChatPage />);

    // Wait for effects to run, especially history loading
    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(orgA.id);
    });

    // Check MockChatContextSelector displays Org A
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name);


    // Check ChatHistoryList displays Org A's chats
    // ChatHistoryList is not mocked, so we check for its rendered chat items.
    // This assumes ChatItem or similar within ChatHistoryList displays the chat title.
    expect(await screen.findByText(chatOrgA1.title)).toBeInTheDocument();
    expect(screen.queryByText(chatPersonal1.title)).not.toBeInTheDocument();
    expect(screen.queryByText(chatOrgB1.title)).not.toBeInTheDocument();
  });

  // Test 1.2
  it('should render and default to Personal context if no global organization, loading personal history', async () => {
    act(() => {
      // currentOrganizationId is already null by default in initialOrgStoreState for this test suite setup
      // but we can explicitly set it for clarity if preferred, or rely on the beforeEach setup.
      useOrganizationStore.setState({ currentOrganizationId: null });
    });

    render(<AiChatPage />);

    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
    });

    // Check MockChatContextSelector displays "Personal"
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent(/Personal/i);

    // Check ChatHistoryList displays personal chats
    expect(await screen.findByText(chatPersonal1.title)).toBeInTheDocument();
    expect(screen.queryByText(chatOrgA1.title)).not.toBeInTheDocument();
    expect(screen.queryByText(chatOrgB1.title)).not.toBeInTheDocument();
  });

  // Test 2.1
  it("selecting 'Personal' in ChatContextSelector should load personal chat history", async () => {
    const user = userEvent.setup();
    act(() => {
      useOrganizationStore.setState({ currentOrganizationId: orgA.id }); // Initial context Org A
    });

    render(<AiChatPage />);

    // Wait for initial history to load for Org A
    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(orgA.id);
      expect(screen.getByText(chatOrgA1.title)).toBeInTheDocument();
      // Ensure the mock trigger shows Org A initially
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name);
    });
    mockLoadChatHistory.mockClear(); // Clear for the next assertion
    mockAnalyticsTrack.mockClear();

    // Click the "Personal" option from our mock
    const personalOptionButton = screen.getByTestId('mock-option-personal');
    await user.click(personalOptionButton);

    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
      // Ensure the mock trigger updates to "Personal"
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent(/Personal/i);
    });

    expect(await screen.findByText(chatPersonal1.title)).toBeInTheDocument();
    expect(screen.queryByText(chatOrgA1.title)).not.toBeInTheDocument();

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', {
      contextId: 'personal',
    });
  });

  // Test 2.2
  it("selecting a different organization in ChatContextSelector should load its chat history", async () => {
    const user = userEvent.setup();
    act(() => {
      // Initial context Personal
      useOrganizationStore.setState({ currentOrganizationId: null }); 
    });

    render(<AiChatPage />);

    // Wait for initial history to load for Personal
    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
      expect(screen.getByText(chatPersonal1.title)).toBeInTheDocument();
      // Ensure the mock trigger shows Personal initially
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent(/Personal/i);
    });
    mockLoadChatHistory.mockClear();
    mockAnalyticsTrack.mockClear();

    // Click the "Org B" option from our mock
    const orgBOptionButton = screen.getByTestId(`mock-option-${orgB.id}`);
    await user.click(orgBOptionButton);

    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(orgB.id);
      // Ensure the mock trigger updates to "Org B"
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent(orgB.name);
    });

    expect(await screen.findByText(chatOrgB1.title)).toBeInTheDocument();
    expect(screen.queryByText(chatPersonal1.title)).not.toBeInTheDocument();

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', {
      contextId: orgB.id,
    });
  });

  // Test 3.1
  it("clicking 'New Chat' when 'Personal' context is active should call startNewChat for personal", async () => {
    const user = userEvent.setup();
    act(() => {
      // Set initial context to Personal
      useOrganizationStore.setState({ currentOrganizationId: null }); 
    });

    render(<AiChatPage />);

    // Wait for page to stabilize and initial context to be set
    await waitFor(() => {
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent(/Personal/i);
    });

    mockStartNewChat.mockClear();
    mockAnalyticsTrack.mockClear();

    const newChatButton = screen.getByTestId('new-chat-button');
    await user.click(newChatButton);

    expect(mockStartNewChat).toHaveBeenCalledWith(null);
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', {
      contextId: 'personal',
    });
  });

  // Test 3.2
  it("clicking 'New Chat' when an organization context is active should call startNewChat for that org", async () => {
    const user = userEvent.setup();
    act(() => {
      // Set initial context to Org A
      useOrganizationStore.setState({ currentOrganizationId: orgA.id }); 
    });

    render(<AiChatPage />);

    // Wait for page to stabilize and initial context to be set
    await waitFor(() => {
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name);
    });

    mockStartNewChat.mockClear();
    mockAnalyticsTrack.mockClear();

    const newChatButton = screen.getByTestId('new-chat-button');
    await user.click(newChatButton);

    expect(mockStartNewChat).toHaveBeenCalledWith(orgA.id);
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', {
      contextId: orgA.id,
    });
  });

  // Test 4.1
  it("clicking a chat item in ChatHistoryList should call loadChatDetails", async () => {
    const user = userEvent.setup();
    act(() => {
      // Set initial context to Org A, so chatOrgA1 is available
      useOrganizationStore.setState({ currentOrganizationId: orgA.id }); 
    });

    render(<AiChatPage />);

    // Wait for the initial history and specific chat item to be visible
    const chatItemOrgA1 = await screen.findByText(chatOrgA1.title);
    // The clickable element is likely the parent div with role="button"
    const clickableChatItem = chatItemOrgA1.closest('[role="button"]');
    expect(clickableChatItem).toBeInTheDocument();

    mockLoadChatDetails.mockClear();
    mockAnalyticsTrack.mockClear();

    if (clickableChatItem) {
      await user.click(clickableChatItem);
    } else {
      throw new Error('Chat item for Org A was not found or not clickable');
    }

    expect(mockLoadChatDetails).toHaveBeenCalledWith(chatOrgA1.id);
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: History Item Selected', {
      chatId: chatOrgA1.id,
    });
  });

  // More tests to follow...
}); 