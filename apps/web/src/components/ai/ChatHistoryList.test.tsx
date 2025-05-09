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
    personal: [],
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
    // Setup a default clean state for the store before each test
    setupMockStore({
        chatsByContext: { personal: [], orgs: {} },
        isLoadingHistoryByContext: { personal: false, orgs: {} },
        historyErrorByContext: { personal: null, orgs: {} }
    });
  });

  it('renders the contextTitle when provided', () => {
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
        contextTitle="My Personal Chats"
      />
    );
    expect(screen.getByRole('heading', { name: /My Personal Chats/i })).toBeInTheDocument();
  });

  it('calls loadChatHistory on mount if context data is not present and not loading/errored', () => {
    // Initial state has no chats for 'personal' and no loading/error
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('personal');
  });

  it('calls loadChatHistory with organizationId when activeContextId is an orgId', () => {
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
      isLoadingHistoryByContext: { personal: true, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has an error', () => {
    setupMockStore({
      historyErrorByContext: { personal: 'Fetch failed', orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });
  
  it('does NOT call loadChatHistory on mount if context already has chats', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('renders loading skeletons when isLoadingHistoryByContext for the active context is true', () => {
    setupMockStore({
      isLoadingHistoryByContext: { personal: true, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
        contextTitle="Personal Chats"
      />
    );
    // Expect multiple skeletons based on your loading state design
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /Personal Chats/i })).toBeInTheDocument(); // Title should still show
  });

  it('renders an error message when historyErrorByContext for the active context is set', () => {
    setupMockStore({
      historyErrorByContext: { personal: 'Failed to load chats.', orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
        contextTitle="Personal Chats"
      />
    );
    expect(screen.getByText(/Failed to load chats./i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Personal Chats/i })).toBeInTheDocument(); // Title should still show
  });

  it('renders "No chat history found." and calls load when history is initially empty (personal context)', () => {
    // 1. Set up the specific store state for this test: personal context is empty, not loading, no error.
    // This state is technically already set by beforeEach, but explicitly setting it here ensures clarity and isolation.
    setupMockStore({
        chatsByContext: { personal: [], orgs: {} }, 
        isLoadingHistoryByContext: { personal: false, orgs: {} },
        historyErrorByContext: { personal: null, orgs: {} }
    });
    // 2. Clear any mock calls from beforeEach or previous setups within this describe block.
    mockLoadChatHistory.mockClear(); 

    // 3. Render the component ONCE.
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );

    // 4. Assertions:
    // useEffect should call loadChatHistory because the context is empty, not loading, and no error.
    expect(mockLoadChatHistory).toHaveBeenCalledWith('personal');
    
    // The component should display "No chat history found." based on the initial empty state.
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
  });
  
  it('renders "No chat history found." when history is empty, not loading, and no error for org context', () => {
    setupMockStore({
        chatsByContext: { personal: [], orgs: { 'org123': [] } },
        isLoadingHistoryByContext: { personal: false, orgs: { 'org123': false } },
        historyErrorByContext: { personal: null, orgs: { 'org123': null } }
    });
    vi.clearAllMocks();

    render(
      <ChatHistoryList
        activeContextId="org123"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org123');
  });

  it('renders chat items when chats for the active personal context are available', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(screen.getByText('Personal Chat One')).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled(); // Data is present
  });

  it('renders chat items when chats for the active org context are available', () => {
    setupMockStore({
      chatsByContext: { personal: [], orgs: { 'org1': initialOrgChats } }
    });
    render(
      <ChatHistoryList
        activeContextId="org1"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(screen.getByText('Org Chat One')).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled(); // Data is present
  });
  
  it('calls onLoadChat with chatId when a chat item is clicked', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} }
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    fireEvent.click(screen.getByText('Personal Chat One'));
    expect(mockOnLoadChat).toHaveBeenCalledWith('p-chat1');
  });

  it('highlights the currentChatId if provided and matches a chat in the list', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} },
      currentChatId: 'p-chat1',
    });
    render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
        currentChatId="p-chat1" // Pass it as prop as per interface
      />
    );
    const activeItem = screen.getByText('Personal Chat One').closest('button'); // Assuming chat items are buttons
    expect(activeItem).toHaveClass('bg-muted'); // Or whatever your active class is
  });

  it('calls loadChatHistory when activeContextId prop changes to a new context not yet loaded', () => {
    const { rerender } = render(
      <ChatHistoryList
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('personal');
    mockLoadChatHistory.mockClear();

    // Change context to an orgId that has no data yet
    setupMockStore({ // Update store to reflect 'personal' is loaded, 'org1' is not
        chatsByContext: { personal: initialPersonalChats, orgs: {} },
        isLoadingHistoryByContext: { personal: false, orgs: {} }, // personal is loaded
    });

    rerender(
      <ChatHistoryList
        activeContextId="org1" // New context
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
        activeContextId="personal"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled(); // personal already loaded
    mockLoadChatHistory.mockClear();

    rerender(
      <ChatHistoryList
        activeContextId="org1" // org1 also already loaded
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

}); 