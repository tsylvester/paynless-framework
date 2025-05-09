import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

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
vi.mock('../components/ai/AiChatbox', () => ({
  AiChatbox: vi.fn(() => <div data-testid="ai-chatbox-mock"></div>),
}));

// Define MockChatContextSelector as a function declaration BEFORE it's used in vi.mock factory
function MockChatContextSelector ({ currentContextId, onContextChange }: { currentContextId: string | null; onContextChange: (id: string | null) => void; organizations?: Organization[], isLoading?: boolean }) {
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
let mockLoadAiConfig: Mock;
let mockLoadChatHistory: Mock;
let mockLoadChatDetails: Mock;
let mockStartNewChat: Mock;
let mockCheckAndReplayPendingChatAction: Mock;
let mockAnalyticsTrack: Mock;

const mockUser: User = { id: 'user-test-123', email: 'test@example.com' };
const orgA: Organization = { id: 'org-A', name: 'Org A', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };
const orgB: Organization = { id: 'org-B', name: 'Org B', created_at: '2023-01-01T00:00:00Z', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };

const chatPersonal1: Chat = { id: 'chat-p1', title: 'Personal Chat 1', organization_id: null, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };
const chatOrgA1: Chat = { id: 'chat-a1', title: 'Org A Chat 1', organization_id: orgA.id, user_id: mockUser.id, created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', system_prompt_id: null };

const setupStoreAndSpies = async (
    initialGlobalOrgId: string | null, 
    initialPersonalHistoryState: Chat[] | undefined | 'fetchedEmpty', 
    initialOrgAHistoryState: Chat[] | undefined | 'fetchedEmpty',
    initialOrgBHistoryState?: Chat[] | undefined | 'fetchedEmpty' // Optional for orgB
) => {
  mockLoadAiConfig = vi.fn();
  mockLoadChatHistory = vi.fn();
  mockLoadChatDetails = vi.fn();
  mockStartNewChat = vi.fn();
  mockCheckAndReplayPendingChatAction = vi.fn();

  const analyticsModule = await import('@paynless/analytics');
  mockAnalyticsTrack = vi.mocked(analyticsModule.analytics.track);
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
    const orgBChats = initialOrgBHistoryState === 'fetchedEmpty' ? [] : initialOrgBHistoryState; // Defaults to undefined if initialOrgBHistoryState is undefined

    const initialAiStoreSlice: Partial<ReturnType<typeof useAiStore.getState>> = {
      availableProviders: [{ id: 'prov-1', name: 'Provider 1' } as AiProvider],
      availablePrompts: [{ id: 'prompt-1', name: 'Prompt 1' } as SystemPrompt],
      chatsByContext: {
        personal: personalChats,
        orgs: {
          [orgA.id!]: orgAChats,
          [orgB.id!]: orgBChats, // Use the processed orgBChats
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
      
      // Include mocked actions
      loadAiConfig: mockLoadAiConfig,
      loadChatHistory: mockLoadChatHistory,
      loadChatDetails: mockLoadChatDetails,
      startNewChat: mockStartNewChat,
      checkAndReplayPendingChatAction: mockCheckAndReplayPendingChatAction,
      // Ensure all actions called by components/hooks under test are included here
      // For example, if there are other actions like 'sendMessage', 'deleteChat', etc.,
      // and they are called, they'd need to be mocked and included too.
      // Based on current errors, the above list covers loadAiConfig and loadChatHistory.
    };
    // Set the state values. The actions on the store should be the spied ones.
    useAiStore.setState(initialAiStoreSlice, true); 
  });

  mockLoadAiConfig.mockResolvedValue(undefined);
  mockLoadChatHistory.mockResolvedValue(undefined);
  mockLoadChatDetails.mockResolvedValue(undefined);
  mockCheckAndReplayPendingChatAction.mockResolvedValue(undefined);
};

describe('AiChatPage Integration Tests', () => {
  beforeEach(async () => {
    await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1]);
  });

  // Test 1.1: Initial render with Org A (pre-filled history)
  it('should render and default to global org context, displaying its history if pre-filled', async () => {
    render(<AiChatPage />);
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name!);
    expect(await screen.findByText('Org A Chat History')).toBeInTheDocument();
    expect(screen.getByText(chatOrgA1.title!)).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  // Test 1.2: Initial render with Org A (empty history, should load)
  it('should call loadChatHistory if global org context history is NOT pre-filled', async () => {
    await setupStoreAndSpies(orgA.id, [chatPersonal1], undefined); // Org A not fetched, Personal is
    render(<AiChatPage />);
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent(orgA.name!);
    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(orgA.id);
    });
  });

  // Test 1.3: Initial render with Personal (pre-filled history)
  it('should render and default to Personal context, displaying its history if pre-filled', async () => {
    await setupStoreAndSpies(null, [chatPersonal1], [chatOrgA1]); // Both pre-filled
    render(<AiChatPage />);
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent('Personal');
    expect(await screen.findByText('Personal Chat History')).toBeInTheDocument();
    expect(screen.getByText(chatPersonal1.title!)).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  // Test 1.4: Initial render with Personal (empty history, should load)
  it('should call loadChatHistory if Personal context history is NOT pre-filled', async () => {
    await setupStoreAndSpies(null, undefined, [chatOrgA1]); // Personal not fetched, Org A is
    render(<AiChatPage />);
    expect(await screen.findByTestId('mock-context-selector-trigger')).toHaveTextContent('Personal');
    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
    });
  });

  // Test 2.1: Context Switching to Personal (Personal history initially empty)
  it("selecting 'Personal' in ChatContextSelector should load personal history if not pre-filled", async () => {
    const user = userEvent.setup();

    // Specific store setup for this test
    mockLoadChatHistory = vi.fn(); 
    mockAnalyticsTrack.mockClear(); // Clear analytics track spy from beforeEach or previous calls

    const initialGlobalOrgIdForTest = orgA.id;
    act(() => {
        useAuthStore.setState({ user: mockUser, isLoading: false, error: null }, true);
        useOrganizationStore.setState({ 
            userOrganizations: [orgA, orgB],
            currentOrganizationId: initialGlobalOrgIdForTest, 
            isLoading: false, 
            error: null 
        }, true);

        // Define a minimal set of actions needed, ensure they are fresh vi.fn() if not the one being asserted
        const loadAiConfigMockForThisTest = vi.fn();
        const loadChatDetailsMockForThisTest = vi.fn();
        const startNewChatMockForThisTest = vi.fn();
        const checkAndReplayPendingChatActionMockForThisTest = vi.fn();
        
        useAiStore.setState({
            availableProviders: [{ id: 'prov-1', name: 'Provider 1' } as AiProvider],
            availablePrompts: [{ id: 'prompt-1', name: 'Prompt 1' } as SystemPrompt],
            chatsByContext: {
                personal: undefined, // Signify that personal history has not been fetched yet
                orgs: {
                    [orgA.id!]: [chatOrgA1], // Org A has pre-filled history
                    [orgB.id!]: undefined,    // Org B also not fetched initially by default for this setup
                },
            },
            messagesByChatId: {},
            currentChatId: null,
            isLoadingAiResponse: false,
            isConfigLoading: false,
            isLoadingHistoryByContext: { personal: false, orgs: {} }, // Personal not loading initially
            isDetailsLoading: false,
            aiError: null,
            historyErrorByContext: { personal: null, orgs: {} },
            
            // Assign actions
            loadAiConfig: loadAiConfigMockForThisTest,
            loadChatHistory: mockLoadChatHistory, // This is the one we are testing
            loadChatDetails: loadChatDetailsMockForThisTest,
            startNewChat: startNewChatMockForThisTest,
            checkAndReplayPendingChatAction: checkAndReplayPendingChatActionMockForThisTest,
        }, true);
    });

    render(<AiChatPage />);
    // Ensure initial state (Org A with its history) is rendered
    expect(await screen.findByText(chatOrgA1.title!)).toBeInTheDocument();
    // Ensure loadChatHistory was not called for OrgA (as it was pre-filled)
    expect(mockLoadChatHistory).not.toHaveBeenCalledWith(orgA.id);


    // Action: Select "Personal" in ChatContextSelector.
    await user.click(screen.getByTestId('mock-option-personal'));
    
    // Assert: loadChatHistory called with null.
    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
    });

    // Optional: Assert analytics if that's part of the behavior on context switch
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', { contextId: 'personal' });
    
    // To verify UI update after load (optional, as primary test is the call to loadChatHistory)
    // you would typically mock the completion of loadChatHistory and then update the store state
    act(() => {
      // Simulate loadChatHistory(null) completing and populating personal chats
      useAiStore.setState(prev => ({ 
        ...prev, 
        chatsByContext: { ...prev.chatsByContext, personal: [chatPersonal1] },
        isLoadingHistoryByContext: { ...prev.isLoadingHistoryByContext, personal: false }
      }));
    });
    expect(await screen.findByText(chatPersonal1.title!)).toBeInTheDocument();
  });

  // Test 2.2: Context Switching to Org B (Org B history initially empty)
  it("selecting Org B in ChatContextSelector should load Org B history if not pre-filled", async () => {
    const user = userEvent.setup();
    render(<AiChatPage />);
    expect(await screen.findByText(chatOrgA1.title!)).toBeInTheDocument();
    mockLoadChatHistory.mockClear();

    await user.click(screen.getByTestId('mock-option-org-B'));
    await waitFor(() => {
      expect(mockLoadChatHistory).toHaveBeenCalledWith(orgB.id);
    });
    const chatOrgB1: Chat = { ...chatOrgA1, id:'cb1', title: 'Org B Chat 1', organization_id: orgB.id };
    act(() => {
      useAiStore.setState(prev => ({ ...prev, chatsByContext: { ...prev.chatsByContext, orgs: {...prev.chatsByContext.orgs, [orgB.id!]: [chatOrgB1]} }}));
    });
    expect(await screen.findByText(chatOrgB1.title!)).toBeInTheDocument();
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Context Selected For New Chat', { contextId: orgB.id });
  });

  // Test 3.1: New Chat - Personal
  it("clicking 'New Chat' when 'Personal' context is active should call startNewChat for personal", async () => {
    const user = userEvent.setup();
    // Initial render might be with an org context, switch to Personal first
    // This test now uses a very specific AiStore setup below, this call is less critical but kept for consistency
    await setupStoreAndSpies(orgA.id, [chatPersonal1], [chatOrgA1]); 
    render(<AiChatPage />);
    
    // Wait for initial render and potential history load if any
    await screen.findByText(chatOrgA1.title!); 

    // Switch to Personal context
    await user.click(screen.getByTestId('mock-option-personal'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-context-selector-trigger')).toHaveTextContent('Personal');
    });
    // Ensure ChatHistoryList updates if it was loading personal history
    // If personal history was pre-filled (as in this setupStoreAndSpies call), it should just show.
    // If it was NOT pre-filled, ChatHistoryList would call loadChatHistory, and we might need to mock its completion here.
    // For this test, we assume personal history is available or loads quickly enough via ChatHistoryList internal effect.

    mockStartNewChat.mockClear(); // Clear any prior calls from initial setup if any
    mockAnalyticsTrack.mockClear();

    await user.click(screen.getByTestId('new-chat-button'));
    expect(mockStartNewChat).toHaveBeenCalledWith(null);
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', { contextId: 'personal' });
  });

  // Test 3.2: New Chat - Org
  it("clicking 'New Chat' when an organization context is active should call startNewChat for that org", async () => {
    const user = userEvent.setup();
    render(<AiChatPage />);
    await user.click(screen.getByTestId('new-chat-button'));
    expect(mockStartNewChat).toHaveBeenCalledWith(orgA.id);
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat', { contextId: orgA.id });
  });

  // Test 4.1: Load Chat from History List
  it('clicking a chat item in ChatHistoryList should call loadChatDetails', async () => {
    const user = userEvent.setup();
    render(<AiChatPage />);    
    const chatItemButton = await screen.findByRole('button', { name: new RegExp(chatOrgA1.title!, 'i') });
    expect(chatItemButton).toBeInTheDocument();
    mockLoadChatDetails.mockClear();
    await user.click(chatItemButton);
    expect(mockLoadChatDetails).toHaveBeenCalledWith(chatOrgA1.id);
  });
}); 