import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import AiChatPage from './AiChat';
import { useAiStore, useAuthStore, useOrganizationStore } from '@paynless/store';
import type { Organization, Chat, User } from '@paynless/types';

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

vi.mock('@/components/dialectic/DomainSelector', () => ({
  DomainSelector: vi.fn(() => <div data-testid="domain-selector-mock">Domain Selector</div>),
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
      availableProviders: [{ id: 'prov-1', name: 'Provider 1', api_identifier: 'api-1', config: {}, created_at: new Date().toISOString(), description: 'Description 1', is_active: true, is_default_embedding: false, is_default_generation: false, is_enabled: true, provider: 'provider-1', updated_at: new Date().toISOString() }],
      availablePrompts: [{ id: 'prompt-1', name: 'Prompt 1', prompt_text: 'Prompt text 1', created_at: new Date().toISOString(), is_active: true, updated_at: new Date().toISOString(), description: 'Description 1', document_template_id: null, user_selectable: true, version: 1 }],
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

function renderAiChatPageAt(initialEntry: string = '/chat') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/chat" element={<AiChatPage />} />
        <Route path="/chat/:chatId" element={<AiChatPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AiChatPage Integration Tests', () => {
  let mocks: Awaited<ReturnType<typeof setupStoreAndSpies>>;

  beforeEach(async () => {
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1]);
  });

  // Test 3.1: New Chat - Personal
  it("clicking 'New Chat' when 'Personal' context is active (set in store) should call startNewChat for personal", async () => {
    const user = userEvent.setup();
    // Set up store with Personal as the selected context for new chat
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1], undefined, null);
    renderAiChatPageAt();
    
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
    renderAiChatPageAt();

    mocks.mockStartNewChat.mockClear(); // Clear before action
    mocks.mockAnalyticsTrack.mockClear();

    await user.click(screen.getByTestId('new-chat-button'));
    // startNewChat should be called with the value from selectedChatContextForNewChat (orgA.id)
    expect(mocks.mockStartNewChat).toHaveBeenCalledWith(orgA.id);
    expect(mocks.mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', { contextId: orgA.id });
  });

  it('clicking "New Chat" while chatId URL param is present calls navigate once with /chat', async () => {
    const user = userEvent.setup();
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1], undefined, null);
    mockNavigate.mockClear();
    renderAiChatPageAt('/chat/some-id');
    await user.click(screen.getByTestId('new-chat-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });

  it('clicking "New Chat" calls startNewChat before navigate', async () => {
    const user = userEvent.setup();
    mocks = await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1], undefined, null);
    mockNavigate.mockClear();
    mocks.mockStartNewChat.mockClear();
    renderAiChatPageAt();
    await user.click(screen.getByTestId('new-chat-button'));
    expect(mocks.mockStartNewChat).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalled();
    expect(mocks.mockStartNewChat.mock.invocationCallOrder[0]).toBeLessThan(
      mockNavigate.mock.invocationCallOrder[0]
    );
  });
}); 