import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock, SpyInstance } from 'vitest';
import { ChatHistoryList } from './ChatHistoryList';
import { useAiStore } from '@paynless/store';
import type { Chat, AiState, AiStore, AiActions } from '@paynless/types';

// Declare the mock function for logger.error that we need to spy on.
const mockLoggerErrorFn = vi.fn();

vi.mock('@paynless/utils', async (importOriginal) => {
    const actual = await importOriginal() as typeof import('@paynless/utils');
    return {
      ...actual,
      logger: { // Override the logger object
        ...actual.logger, // Spread to keep any non-function properties or other actual logger methods if needed
        error: (...args: unknown[]) => mockLoggerErrorFn(...args), // Specific mock for error
        debug: vi.fn(),  // Inline mock for debug
        info: vi.fn(),   // Inline mock for info
        warn: vi.fn(),   // Inline mock for warn
        // Add other logger methods as vi.fn() if they are called during test setup/execution
      },
    };
  });

// Mock analytics package
vi.mock('@paynless/analytics', () => ({
  // Add any specific named exports from @paynless/analytics if they are directly used
  // and need to be mocked. For now, a default empty mock.
  // If it has a default export that's a function or object:
  // default: vi.fn() or default: {}
  // If it has named exports:
  // trackEvent: vi.fn(),
  // initAnalytics: vi.fn(),
}));

// Mock Skeleton component
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className, ...props }: { className?: string, "data-testid"?: string }) => <div data-testid={props["data-testid"] || 'skeleton'} className={className} {...props} />
}));

// Define an interface for ChatItem props for better typing in the mock
interface MockChatItemProps {
  chat: Chat;
  isActive: boolean;
  key?: string;
}

// Mock ChatItem component
const mockChatItem = vi.fn();

// Simple component that just throws an error
const ErrorThrower = () => {
  throw new Error('Simulated rendering error from ErrorThrower');
};

vi.mock('./ChatItem', () => ({
  ChatItem: (props: MockChatItemProps) => {
    mockChatItem(props); // Call the spy so we can assert it was called with correct props

    if (props.chat.id === 'p-chat1-error') { // Designate a specific ID for error throwing
      return <ErrorThrower />;
    }
    // Render normal mock for other items
    // The div itself is no longer clickable in a way that ChatHistoryList cares about for onLoadChat
    return (
      <div
        data-testid={`chat-item-mock-${props.chat.id}`}
        role="listitem" // More appropriate role for an item in a list
        aria-label={props.chat.title || `Chat ${props.chat.id.substring(0, 8)}...`}
      >
        <span>{props.chat.title || `Chat ${props.chat.id.substring(0, 8)}...`}</span>
        {props.isActive && <span data-testid={`active-indicator-${props.chat.id}`}>Active</span>}
      </div>
    );
  }
}));

// Mock the useAiStore hook
vi.mock('@paynless/store');

const mockLoadChatHistory = vi.fn();
const mockOnLoadChat = vi.fn();

const personalChatUser1: Chat = { id: 'p-chat1', title: 'Personal Chat One', updated_at: new Date('2023-01-01T10:00:00Z').toISOString(), created_at: '', organization_id: null, system_prompt_id: null, user_id: 'user1' };
const personalChatUser1Another: Chat = { id: 'p-chat2', title: 'My Second Thoughts', updated_at: new Date('2023-01-03T10:00:00Z').toISOString(), created_at: '', organization_id: null, system_prompt_id: null, user_id: 'user1' };
const org1ChatUser1: Chat = { id: 'o-chat1', title: 'Org1 Chat Alpha', updated_at: new Date('2023-01-02T11:00:00Z').toISOString(), created_at: '', organization_id: 'org1', system_prompt_id: null, user_id: 'user1' };
const org1ChatUser2: Chat = { id: 'o-chat2', title: 'Org1 Chat Beta (Other User)', updated_at: new Date('2023-01-04T11:00:00Z').toISOString(), created_at: '', organization_id: 'org1', system_prompt_id: null, user_id: 'user2' };

const initialPersonalChats: Chat[] = [personalChatUser1, personalChatUser1Another];
const initialOrg1Chats: Chat[] = [org1ChatUser1, org1ChatUser2];

// mockInitialAiStoreState should only contain state properties as defined in AiState
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

const setupMockStore = (stateChanges: Partial<AiState> = {}) => {
  const baseState: Partial<AiState> = { ...mockInitialAiStoreState };

  const mergedState: AiState = {
    // Provide defaults for all AiState properties to satisfy the AiState type
    chatsByContext: stateChanges.chatsByContext ?? baseState.chatsByContext ?? { personal: undefined, orgs: {} },
    messagesByChatId: stateChanges.messagesByChatId ?? baseState.messagesByChatId ?? {},
    currentChatId: stateChanges.currentChatId !== undefined ? stateChanges.currentChatId : (baseState.currentChatId ?? null),
    isLoadingAiResponse: stateChanges.isLoadingAiResponse ?? baseState.isLoadingAiResponse ?? false,
    isConfigLoading: stateChanges.isConfigLoading ?? baseState.isConfigLoading ?? false,
    isLoadingHistoryByContext: {
      personal: stateChanges.isLoadingHistoryByContext?.personal ?? baseState.isLoadingHistoryByContext?.personal ?? false,
      orgs: { ...(baseState.isLoadingHistoryByContext?.orgs || {}), ...(stateChanges.isLoadingHistoryByContext?.orgs || {}) },
    },
    historyErrorByContext: {
      personal: stateChanges.historyErrorByContext?.personal !== undefined ? stateChanges.historyErrorByContext.personal : (baseState.historyErrorByContext?.personal ?? null),
      orgs: { ...(baseState.historyErrorByContext?.orgs || {}), ...(stateChanges.historyErrorByContext?.orgs || {}) },
    },
    isDetailsLoading: stateChanges.isDetailsLoading ?? baseState.isDetailsLoading ?? false,
    newChatContext: stateChanges.newChatContext !== undefined ? stateChanges.newChatContext : (baseState.newChatContext ?? null),
    rewindTargetMessageId: stateChanges.rewindTargetMessageId !== undefined ? stateChanges.rewindTargetMessageId : (baseState.rewindTargetMessageId ?? null),
    aiError: stateChanges.aiError !== undefined ? stateChanges.aiError : (baseState.aiError ?? null),
    availableProviders: stateChanges.availableProviders ?? baseState.availableProviders ?? [],
    availablePrompts: stateChanges.availablePrompts ?? baseState.availablePrompts ?? [],
  };

  // Mock actions separately, then combine with mergedState for the full AiStore type
  const mockActions: AiActions = {
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
  };

  const mockStoreWithValueAndActions: AiStore = {
    ...mergedState,
    ...mockActions,
  };

  vi.mocked(useAiStore).mockImplementation((selector?: (state: AiStore) => unknown) => {
    if (selector) {
      return selector(mockStoreWithValueAndActions);
    }
    return mockStoreWithValueAndActions;
  });
  (vi.mocked(useAiStore).getState as Mock<[], AiStore>) = vi.fn(() => mockStoreWithValueAndActions);
};

describe('ChatHistoryList', () => {
  let consoleErrorSpy: SpyInstance<[message?: any, ...optionalParams: any[]], void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatItem.mockClear();
    mockLoggerErrorFn.mockClear();
    setupMockStore();
    // Suppress console.error output during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); 
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it('renders the contextTitle when provided', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} } });
    render(
      <ChatHistoryList
        activeContextId={null}
        contextTitle="My Personal Chats"
      />
    );
    expect(screen.getByRole('heading', { name: /My Personal Chats/i })).toBeInTheDocument();
  });

  it('calls loadChatHistory on mount if context data is undefined (personal)', () => {
    render(
      <ChatHistoryList activeContextId={null} />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith(null);
  });

  it('calls loadChatHistory on mount if context data is undefined (org)', () => {
    render(
      <ChatHistoryList activeContextId="org1" />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org1');
  });

  it('does NOT call loadChatHistory on mount if context is already loading', () => {
    setupMockStore({
      isLoadingHistoryByContext: { personal: true, orgs: {} }, 
      chatsByContext: { personal: undefined, orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has an error', () => {
    setupMockStore({
      historyErrorByContext: { personal: 'Fetch failed', orgs: {} }, 
      chatsByContext: { personal: undefined, orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });
  
  it('does NOT call loadChatHistory on mount if context already has chats (non-empty)', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} />
    );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has been fetched and is empty array', () => {
    setupMockStore({
      chatsByContext: { personal: [], orgs: {} } 
    });
    render(
      <ChatHistoryList activeContextId={null} />
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
        contextTitle="Personal Chats"
      />
    );
    expect(screen.getAllByTestId('skeleton-item').length).toBe(3);
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
        contextTitle="Personal Chats"
      />
    );
    expect(screen.getByText(/Failed to load chats./i)).toBeInTheDocument();
  });
  
  it('renders "No chat history found." when history is loaded and empty', () => {
    setupMockStore({ chatsByContext: { personal: [], orgs: {} } });
    render(<ChatHistoryList activeContextId={null} />);
    expect(screen.getByText(/No chat history found./i)).toBeInTheDocument();
  });

  it('renders ChatItem for each personal chat with correct props', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} }, currentChatId: 'p-chat1' });
    render(
      <ChatHistoryList
        activeContextId={null}
        currentChatId='p-chat1'
      />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialPersonalChats.length);
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining<Partial<MockChatItemProps>>({
      chat: personalChatUser1,
      isActive: true,
    }));
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining<Partial<MockChatItemProps>>({
      chat: personalChatUser1Another,
      isActive: false,
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
        currentChatId='o-chat2'
        contextTitle="Org1 Chats"
      />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialOrg1Chats.length);
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining<Partial<MockChatItemProps>>({
      chat: org1ChatUser1,
      isActive: false,
    }));
    expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining<Partial<MockChatItemProps>>({
      chat: org1ChatUser2,
      isActive: true,
    }));
    expect(screen.getByRole('heading', { name: /Org1 Chats/i })).toBeInTheDocument();
  });

  it('renders skeleton loaders when history is loading (personal)', () => {
    setupMockStore({ isLoadingHistoryByContext: { personal: true, orgs: {} } });
    render(<ChatHistoryList activeContextId={null} />);
    expect(screen.getAllByTestId('skeleton-item').length).toBeGreaterThan(0);
  });

  it('renders an error message if history loading fails (personal)', () => {
    setupMockStore({ historyErrorByContext: { personal: 'Personal chats failed to load', orgs: {} } });
    render(<ChatHistoryList activeContextId={null} />);
    expect(screen.getByText('Personal chats failed to load')).toBeInTheDocument();
  });

  it('renders "No chat history found" when there are no chats (personal)', () => {
    setupMockStore({ chatsByContext: { personal: [], orgs: {} } });
    render(<ChatHistoryList activeContextId={null} />);
    expect(screen.getByText('No chat history found.')).toBeInTheDocument();
  });

  it('updates displayed chats when activeContextId prop changes', () => {
    setupMockStore({
      chatsByContext: {
        personal: initialPersonalChats,
        orgs: { 'org1': initialOrg1Chats }
      }
    });
    const { rerender } = render(
      <ChatHistoryList activeContextId={null} />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialPersonalChats.length);
    expect(screen.getByTestId(`chat-item-mock-${personalChatUser1.id}`)).toBeInTheDocument();
    mockChatItem.mockClear();
    rerender(
      <ChatHistoryList activeContextId="org1" contextTitle="Org1 Chats" />
    );
    expect(mockChatItem).toHaveBeenCalledTimes(initialOrg1Chats.length);
    expect(screen.getByTestId(`chat-item-mock-${org1ChatUser1.id}`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Org1 Chats/i })).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalledWith('org1');
  });

  it('calls loadChatHistory when activeContextId changes to a context with undefined data', () => {
    setupMockStore({
      chatsByContext: {
        personal: initialPersonalChats,
        orgs: {}
      }
    });
    const { rerender } = render(
      <ChatHistoryList activeContextId={null} />
    );
    mockLoadChatHistory.mockClear();
    rerender(
      <ChatHistoryList activeContextId="org1" />
    );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org1');
  });

  it('engages ErrorBoundary and logs error if a ChatItem throws an error', async () => {
    const errorChat: Chat = { id: 'p-chat1-error', title: 'Error Chat', updated_at: new Date().toISOString(), created_at: '', organization_id: null, system_prompt_id: null, user_id: 'user1' };
    setupMockStore({ chatsByContext: { personal: [errorChat], orgs: {} } });

    render(
      <ChatHistoryList
        activeContextId={null}
      />
    );
    expect(await screen.findByText('Could not display chat history items.')).toBeInTheDocument();
    expect(mockLoggerErrorFn).toHaveBeenCalledTimes(1); 
  });
}); 