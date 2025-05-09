import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatHistoryList } from './ChatHistoryList';
import { useAiStore } from '@paynless/store'; // Corrected import path
import type { Chat, AiState, AiStore } from '@paynless/types'; // Added AiStore import

// Mock Skeleton component
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className, ...props }: { className?: string, "data-testid"?: string }) => <div data-testid="skeleton" className={className} {...props} />
}));

// Mock the useAiStore hook from the correct package path
vi.mock('@paynless/store');

const mockLoadChatHistory = vi.fn();
const mockOnLoadChat = vi.fn();

const initialPersonalChats: Chat[] = [
  { id: 'p-chat1', title: 'Personal Chat One', updated_at: new Date('2023-01-01T10:00:00Z').toISOString(), created_at: '', organization_id: null, system_prompt_id: null, user_id: 'user1' },
];
const initialOrgChats: Chat[] = [
  { id: 'o-chat1', title: 'Org Chat One', updated_at: new Date('2023-01-02T11:00:00Z').toISOString(), created_at: '', organization_id: 'org1', system_prompt_id: null, user_id: 'user1' },
];

const mockInitialAiStoreState: Partial<AiState> = {
  chatsByContext: {
    personal: undefined,
    orgs: {},
  },
  messagesByChatId: {},
  currentChatId: null,
  isLoadingAiResponse: false,
  isConfigLoading: false,
  isLoadingHistoryByContext: {
    personal: false,
    orgs: {},
  },
  historyErrorByContext: {
    personal: null,
    orgs: {},
  },
  isDetailsLoading: false,
  newChatContext: null,
  rewindTargetMessageId: null,
  aiError: null,
  availableProviders: [],
  availablePrompts: [],
};

// Helper to setup mock store state for a test
const setupMockStore = (stateChanges: Partial<AiState> = {}) => {
  const partialState = {
    ...mockInitialAiStoreState,
    ...stateChanges,
    chatsByContext: {
      ...mockInitialAiStoreState.chatsByContext,
      ...stateChanges.chatsByContext,
    },
    isLoadingHistoryByContext: {
      ...mockInitialAiStoreState.isLoadingHistoryByContext,
      ...stateChanges.isLoadingHistoryByContext,
    },
    historyErrorByContext: {
      ...mockInitialAiStoreState.historyErrorByContext,
      ...stateChanges.historyErrorByContext,
    },
  };

  const mockStoreWithValueAndActions: AiStore = {
    ...partialState,
    // Mocked actions from AiActions
    loadChatHistory: mockLoadChatHistory, // Specifically used by component under test
    loadAiConfig: vi.fn(),
    sendMessage: vi.fn(),
    loadChatDetails: vi.fn(),
    startNewChat: vi.fn(),
    clearAiError: vi.fn(),
    checkAndReplayPendingChatAction: vi.fn(),
    deleteChat: vi.fn(),
    prepareRewind: vi.fn(),
    cancelRewindPreparation: vi.fn(),
    // Ensure all state properties from AiState are spread from partialState
    // and all action properties from AiActions are present.
  } as AiStore; // Cast to AiStore (already typed on declaration)

  // Mock the behavior of the useAiStore hook itself
  vi.mocked(useAiStore).mockImplementation((selector?: (state: AiStore) => unknown) => { // Selector expects AiStore, returns unknown
    if (selector) {
      return selector(mockStoreWithValueAndActions);
    }
    return mockStoreWithValueAndActions; // Return the full mocked store if no selector
  });

  // Mock for useAiStore.getState()
  (vi.mocked(useAiStore) as any).getState = vi.fn(() => mockStoreWithValueAndActions);
};


describe('ChatHistoryList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // This now uses personal: undefined by default
    setupMockStore(); 
  });

  it('renders the contextTitle when provided', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} } }); // Provide some chats so it doesn't try to load
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
        contextTitle="My Personal Chats"
      />
    );
    expect(screen.getByRole('heading', { name: /My Personal Chats/i })).toBeInTheDocument();
  });

  it('calls loadChatHistory on mount if context data is undefined (not fetched)', () => {
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
  });

  it('calls loadChatHistory with organizationId if org context data is undefined (not fetched)', () => {
    render(
      <ChatHistoryList
        activeContextId="org123"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org123');
  });

  it('does NOT call loadChatHistory on mount if context is already loading', () => {
    setupMockStore({
      isLoadingHistoryByContext: { personal: true, orgs: {} }, 
      chatsByContext: { personal: undefined, orgs: {} } 
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has an error', () => {
    setupMockStore({
      historyErrorByContext: { personal: 'Fetch failed', orgs: {} }, 
      chatsByContext: { personal: undefined, orgs: {} } 
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });
  
  it('does NOT call loadChatHistory on mount if context already has chats (fetched and non-empty)', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} } 
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has been fetched and is empty', () => {
    setupMockStore({
      chatsByContext: { personal: [], orgs: {} } 
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
  });

  it('renders loading skeletons when isLoadingHistoryByContext for the active context is true', () => {
    setupMockStore({
      isLoadingHistoryByContext: { personal: true, orgs: {} },
      chatsByContext: { personal: undefined, orgs: {} }, 
      historyErrorByContext: { personal: null, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
        contextTitle="Personal Chats"
      />
    );
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /Personal Chats/i })).toBeInTheDocument();
  });

  it('renders an error message when historyErrorByContext for the active context is set', () => {
    setupMockStore({
      historyErrorByContext: { personal: 'Failed to load chats.', orgs: {} },
      chatsByContext: { personal: undefined, orgs: {} }, 
      isLoadingHistoryByContext: { personal: false, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
        contextTitle="Personal Chats"
      />
    );
    expect(screen.getByText(/Failed to load chats./i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Personal Chats/i })).toBeInTheDocument();
  });

  it('renders "No chat history found." and calls load when history is initially not fetched (personal context)', () => {
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
  });
  
  it('renders "No chat history found." and calls load when history is initially not fetched (org context)', () => {
    setupMockStore({ 
        chatsByContext: { personal: undefined, orgs: { 'org123': undefined } }, 
        isLoadingHistoryByContext: { personal: false, orgs: { 'org123': false } },
        historyErrorByContext: { personal: null, orgs: { 'org123': null } }
    });
    render(
      <ChatHistoryList
        activeContextId="org123"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org123');
  });

  it('renders "No chat history found." when history is fetched and empty, and does NOT call load (org context)', () => {
    setupMockStore({
        chatsByContext: { personal: undefined, orgs: { 'org123': [] } }, 
        isLoadingHistoryByContext: { personal: false, orgs: { 'org123': false } },
        historyErrorByContext: { personal: null, orgs: { 'org123': null } }
    });
    render(
      <ChatHistoryList
        activeContextId="org123"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('renders chat items when chats for the active personal context are available', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(screen.getByText('Personal Chat One')).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('renders chat items when chats for the active org context are available', () => {
    setupMockStore({
      chatsByContext: { personal: undefined, orgs: { 'org1': initialOrgChats } }
    });
    render(
      <ChatHistoryList
        activeContextId="org1"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(screen.getByText('Org Chat One')).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });
  
  it('calls onLoadChat with chatId when a chat item is clicked', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    fireEvent.click(screen.getByText('Personal Chat One'));
    expect(mockOnLoadChat).toHaveBeenCalledWith('p-chat1');
  });

  it('highlights the currentChatId if provided and matches a chat in the list', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} },
    });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
        currentChatId="p-chat1" 
      />
    );
    const activeItem = screen.getByText('Personal Chat One').closest('button');
    expect(activeItem).toHaveClass('bg-muted');
  });

  it('calls loadChatHistory when activeContextId prop changes to a new context not yet loaded', () => {
    const { rerender } = render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
    mockLoadChatHistory.mockClear();

    setupMockStore({ 
        chatsByContext: { personal: initialPersonalChats, orgs: { 'org1': undefined } },
        isLoadingHistoryByContext: { personal: false, orgs: { 'org1': false } },
        historyErrorByContext: { personal: null, orgs: { 'org1': null} },
    });

    rerender(
      <ChatHistoryList
        activeContextId="org1"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org1');
  });

  it('does NOT call loadChatHistory when activeContextId prop changes if new context is already loaded', () => {
    setupMockStore({ 
        chatsByContext: { personal: initialPersonalChats, orgs: { 'org1': initialOrgChats } },
    });
    const { rerender } = render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
    mockLoadChatHistory.mockClear();

    rerender(
      <ChatHistoryList
        activeContextId="org1"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

}); 