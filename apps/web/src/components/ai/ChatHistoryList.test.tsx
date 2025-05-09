import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatHistoryList } from './ChatHistoryList';
import { useAiStore } from '@paynless/store'; // Corrected import path
import type { Chat, AiState, AiStore } from '@paynless/types'; // Added AiStore import

// Mock Skeleton component
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className, ...props }: { className?: string, "data-testid"?: string }) => <div data-testid={props["data-testid"] || 'skeleton'} className={className} {...props} />
}));

// Mock ChatItem component
const mockChatItem = vi.fn();
vi.mock('./ChatItem', () => ({
  ChatItem: (props: any) => {
    mockChatItem(props); 
    return (
      <div 
        data-testid={`chat-item-mock-${props.chat.id}`}
        onClick={() => props.onClick(props.chat.id)} // Simulate ChatItem's internal click calling the passed onClick
        role="button" // Add role for easier querying if needed, and for semantics
        aria-label={props.chat.title || `Chat ${props.chat.id.substring(0, 8)}...`}
        tabIndex={0} // Make it focusable
      >
        <span>{props.chat.title || `Chat ${props.chat.id.substring(0, 8)}...`}</span>
        {props.isActive && <span data-testid={`active-indicator-${props.chat.id}`}>Active</span>}
      </div>
    );
  }
}));

// Mock the useAiStore hook from the correct package path
vi.mock('@paynless/store');

const mockLoadChatHistory = vi.fn();
const mockOnLoadChat = vi.fn();

const personalChatUser1: Chat = { id: 'p-chat1', title: 'Personal Chat One', updated_at: new Date('2023-01-01T10:00:00Z').toISOString(), created_at: '', organization_id: null, system_prompt_id: null, user_id: 'user1' };
const personalChatUser1Another: Chat = { id: 'p-chat2', title: 'My Second Thoughts', updated_at: new Date('2023-01-03T10:00:00Z').toISOString(), created_at: '', organization_id: null, system_prompt_id: null, user_id: 'user1' };
const org1ChatUser1: Chat = { id: 'o-chat1', title: 'Org1 Chat Alpha', updated_at: new Date('2023-01-02T11:00:00Z').toISOString(), created_at: '', organization_id: 'org1', system_prompt_id: null, user_id: 'user1' };
const org1ChatUser2: Chat = { id: 'o-chat2', title: 'Org1 Chat Beta (Other User)', updated_at: new Date('2023-01-04T11:00:00Z').toISOString(), created_at: '', organization_id: 'org1', system_prompt_id: null, user_id: 'user2' };

const initialPersonalChats: Chat[] = [personalChatUser1, personalChatUser1Another];
const initialOrg1Chats: Chat[] = [org1ChatUser1, org1ChatUser2];

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
  const partialState: Partial<AiState> = {
    ...mockInitialAiStoreState,
    ...stateChanges,
    chatsByContext: {
      personal: stateChanges.chatsByContext?.personal !== undefined ? stateChanges.chatsByContext.personal : mockInitialAiStoreState.chatsByContext?.personal,
      orgs: { ...mockInitialAiStoreState.chatsByContext?.orgs, ...stateChanges.chatsByContext?.orgs },
    },
    isLoadingHistoryByContext: {
      personal: stateChanges.isLoadingHistoryByContext?.personal !== undefined ? stateChanges.isLoadingHistoryByContext.personal : mockInitialAiStoreState.isLoadingHistoryByContext?.personal,
      orgs: { ...mockInitialAiStoreState.isLoadingHistoryByContext?.orgs, ...stateChanges.isLoadingHistoryByContext?.orgs },
    },
    historyErrorByContext: {
      personal: stateChanges.historyErrorByContext?.personal !== undefined ? stateChanges.historyErrorByContext.personal : mockInitialAiStoreState.historyErrorByContext?.personal,
      orgs: { ...mockInitialAiStoreState.historyErrorByContext?.orgs, ...stateChanges.historyErrorByContext?.orgs },
    },
  };

  const mockStoreWithValueAndActions = {
    ...partialState,
    loadChatHistory: mockLoadChatHistory,
    loadAiConfig: vi.fn(),
    sendMessage: vi.fn(),
    loadChatDetails: vi.fn(),
    startNewChat: vi.fn(),
    clearAiError: vi.fn(),
    checkAndReplayPendingChatAction: vi.fn(),
    deleteChat: vi.fn(),
    prepareRewind: vi.fn(),
    cancelRewindPreparation: vi.fn(),
  } as AiStore;

  vi.mocked(useAiStore).mockImplementation((selector?: (state: AiStore) => unknown) => {
    if (selector) {
      return selector(mockStoreWithValueAndActions);
    }
    return mockStoreWithValueAndActions;
  });
  (vi.mocked(useAiStore) as any).getState = vi.fn(() => mockStoreWithValueAndActions);
};

describe('ChatHistoryList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatItem.mockClear(); // Clear the ChatItem mock spy
    setupMockStore(); 
  });

  it('renders the contextTitle when provided', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} } });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
        contextTitle="My Personal Chats"
      />
    );
    expect(screen.getByRole('heading', { name: /My Personal Chats/i })).toBeInTheDocument();
  });

  it('calls loadChatHistory on mount if context data is undefined (personal)', () => {
    render(
      <ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
  });

  it('calls loadChatHistory on mount if context data is undefined (org)', () => {
    render(
      <ChatHistoryList activeContextId="org1" onLoadChat={mockOnLoadChat} />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org1');
  });

  it('does NOT call loadChatHistory on mount if context is already loading', () => {
    setupMockStore({
      isLoadingHistoryByContext: { personal: true, orgs: {} }, 
      chatsByContext: { personal: undefined, orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has an error', () => {
    setupMockStore({
      historyErrorByContext: { personal: 'Fetch failed', orgs: {} }, 
      chatsByContext: { personal: undefined, orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });
  
  it('does NOT call loadChatHistory on mount if context already has chats (non-empty)', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has been fetched and is empty array', () => {
    setupMockStore({
      chatsByContext: { personal: [], orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />
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
    expect(screen.getAllByTestId('skeleton-item').length).toBe(3); // ChatHistoryList renders 3 skeletons
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
  });
  
  it('renders "No chat history found." when history is loaded and empty', () => {
    setupMockStore({ chatsByContext: { personal: [], orgs: {} } });
    render(<ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />);
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
  });

  it('renders ChatItem for each personal chat with correct props', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} }, currentChatId: 'p-chat1' });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
        currentChatId='p-chat1'
      />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialPersonalChats.length);
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining({
      chat: personalChatUser1,
      isActive: true,
      onClick: mockOnLoadChat
    }));
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining({
      chat: personalChatUser1Another,
      isActive: false,
      onClick: mockOnLoadChat
    }));
  });

  it('renders ChatItem for each org chat with correct props when org context is active', () => {
    setupMockStore({ 
      chatsByContext: { personal: [], orgs: { 'org1': initialOrg1Chats } },
      currentChatId: 'o-chat2'
    });
    render(
      <ChatHistoryList
        activeContextId="org1"
        onLoadChat={mockOnLoadChat}
        currentChatId='o-chat2'
        contextTitle="Org1 Chats"
      />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialOrg1Chats.length);
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining({
      chat: org1ChatUser1,
      isActive: false,
      onClick: mockOnLoadChat
    }));
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining({
      chat: org1ChatUser2,
      isActive: true,
      onClick: mockOnLoadChat
    }));
    expect(screen.getByRole('heading', { name: /Org1 Chats/i })).toBeInTheDocument();
  });

  it('calls onLoadChat with correct chatId when a mocked ChatItem is clicked (personal)', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} } });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    const firstChatItemMock = screen.getByTestId(`chat-item-mock-${personalChatUser1.id}`);
    fireEvent.click(firstChatItemMock);
    expect(mockOnLoadChat).toHaveBeenCalledWith(personalChatUser1.id);

    const secondChatItemMock = screen.getByTestId(`chat-item-mock-${personalChatUser1Another.id}`);
    fireEvent.click(secondChatItemMock);
    expect(mockOnLoadChat).toHaveBeenCalledWith(personalChatUser1Another.id);
  });

  it('calls onLoadChat with correct chatId when a mocked ChatItem is clicked (org)', () => {
    setupMockStore({ chatsByContext: { personal: [], orgs: { 'org1': initialOrg1Chats } } });
    render(
      <ChatHistoryList
        activeContextId="org1"
        onLoadChat={mockOnLoadChat}
      />
    );
    const firstOrgChatItemMock = screen.getByTestId(`chat-item-mock-${org1ChatUser1.id}`);
    fireEvent.click(firstOrgChatItemMock);
    expect(mockOnLoadChat).toHaveBeenCalledWith(org1ChatUser1.id);
  });

  it('displays active state correctly on the mocked ChatItem', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} }, currentChatId: 'p-chat1' });
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
        currentChatId='p-chat1' 
      />
    );
    // The mock itself renders a span with data-testid if active
    expect(screen.getByTestId(`active-indicator-${personalChatUser1.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`active-indicator-${personalChatUser1Another.id}`)).not.toBeInTheDocument();
  });

  // Test for initial load messages when data is undefined
  it('renders "No chat history found." and calls load when history is initially not fetched (personal context)', () => {
    // chatsByContext.personal is undefined by default in setupMockStore()
    render(
      <ChatHistoryList
        activeContextId={null}
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
    // The component shows this message while loading or if empty after load
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument(); 
  });
  
  it('renders "No chat history found." and calls load when history is initially not fetched (org context)', () => {
    setupMockStore({ 
        chatsByContext: { personal: undefined, orgs: { 'org123': undefined } }, // Explicitly set org context as undefined
        isLoadingHistoryByContext: { personal: false, orgs: { 'org123': false } },
        historyErrorByContext: { personal: null, orgs: { 'org123': null } }
    });
    render(
      <ChatHistoryList
        activeContextId="org123"
        onLoadChat={mockOnLoadChat}
      />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org123');
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
  });

  it('updates displayed chats when activeContextId prop changes', () => {
    setupMockStore({
      chatsByContext: {
        personal: initialPersonalChats,
        orgs: { 'org1': initialOrg1Chats }
      }
    });

    const { rerender } = render(
      <ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialPersonalChats.length); // Initially personal chats
    expect(screen.getByTestId(`chat-item-mock-${personalChatUser1.id}`)).toBeInTheDocument();
    mockChatItem.mockClear(); // Clear calls before re-render

    rerender(
      <ChatHistoryList activeContextId="org1" onLoadChat={mockOnLoadChat} contextTitle="Org1 Chats" />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialOrg1Chats.length); // Now org chats
    expect(screen.getByTestId(`chat-item-mock-${org1ChatUser1.id}`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Org1 Chats/i })).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalledWith('org1'); // Shouldn't reload if data is present
  });

  it('calls loadChatHistory when activeContextId changes to a context with undefined data', () => {
    setupMockStore({
      chatsByContext: {
        personal: initialPersonalChats, // org1 is undefined
        orgs: {}
      }
    });
    const { rerender } = render(
      <ChatHistoryList activeContextId={null} onLoadChat={mockOnLoadChat} />
    );
    mockLoadChatHistory.mockClear();

    rerender(
      <ChatHistoryList activeContextId="org1" onLoadChat={mockOnLoadChat} />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org1');
  });
}); 