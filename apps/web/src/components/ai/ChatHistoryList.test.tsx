import React from 'react';
import { render, screen } from '@testing-library/react';
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
      logger: {
        ...actual.logger,
        error: (...args: unknown[]) => mockLoggerErrorFn(...args),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
    };
  });

vi.mock('@paynless/analytics', () => ({}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className, ...props }: { className?: string, "data-testid"?: string }) => <div data-testid={props["data-testid"] || 'skeleton'} className={className} {...props} />
}));

interface MockChatItemProps {
  chat: Chat;
  isActive: boolean;
  key?: string;
}

const mockChatItem = vi.fn();

const ErrorThrower = () => {
  throw new Error('Simulated rendering error from ErrorThrower');
};

vi.mock('./ChatItem', () => ({
  ChatItem: (props: MockChatItemProps) => {
    mockChatItem(props);

    if (props.chat.id === 'p-chat1-error') {
      return <ErrorThrower />;
    }
    return (
      <div
        data-testid={`chat-item-mock-${props.chat.id}`}
        role="listitem"
        aria-label={props.chat.title || `Chat ${props.chat.id.substring(0, 8)}...`}
      >
        <span>{props.chat.title || `Chat ${props.chat.id.substring(0, 8)}...`}</span>
        {props.isActive && <span data-testid={`active-indicator-${props.chat.id}`}>Active</span>}
      </div>
    );
  }
}));

vi.mock('@paynless/store');

const mockLoadChatHistory = vi.fn();

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

const setupMockStore = (stateChanges: Partial<AiState> = {}) => {
  const baseState: Partial<AiState> = { ...mockInitialAiStoreState };

  const mergedState: AiState = {
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
    selectedMessagesMap: stateChanges.selectedMessagesMap ?? baseState.selectedMessagesMap ?? {},
    selectedProviderId: stateChanges.selectedProviderId ?? baseState.selectedProviderId ?? null,
    selectedPromptId: stateChanges.selectedPromptId ?? baseState.selectedPromptId ?? null,
    chatParticipantsProfiles: stateChanges.chatParticipantsProfiles ?? baseState.chatParticipantsProfiles ?? {},
    pendingAction: stateChanges.pendingAction ?? baseState.pendingAction ?? null,
  };

  const mockActions: AiActions = {
    loadChatHistory: mockLoadChatHistory,
    loadAiConfig: vi.fn(),
    sendMessage: vi.fn(),
    loadChatDetails: vi.fn(),
    startNewChat: vi.fn(),
    clearAiError: vi.fn(),
    // checkAndReplayPendingChatAction: vi.fn(),
    deleteChat: vi.fn(),
    prepareRewind: vi.fn(),
    cancelRewindPreparation: vi.fn(),
    setSelectedProvider: vi.fn(),
    setSelectedPrompt: vi.fn(),
    setNewChatContext: vi.fn(),
    setChatContextHydrated: vi.fn(),
    hydrateChatContext: vi.fn(),
    resetChatContextToDefaults: vi.fn(),
    toggleMessageSelection: vi.fn(),
    selectAllMessages: vi.fn(),
    deselectAllMessages: vi.fn(),
    clearMessageSelections: vi.fn(),
    _addOptimisticUserMessage: vi.fn(),
    addOptimisticMessageForReplay: vi.fn(),
    _updateChatContextInProfile: vi.fn(),
    _fetchAndStoreUserProfiles: vi.fn(),
    _dangerouslySetStateForTesting: vi.fn(),
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
  let consoleErrorSpy: SpyInstance<[message?: string, ...optionalParams: unknown[]], void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatItem.mockClear();
    mockLoggerErrorFn.mockClear();
    setupMockStore();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders the contextTitle when provided', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} } });
    render(
      <ChatHistoryList
        activeContextId={'personal'}
        contextTitle="My Personal Chats"
      />
    );
    expect(screen.getByRole('heading', { name: /My Personal Chats/i })).toBeInTheDocument();
  });

  it('renders a bounding box when chats exist', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} } });
    render(<ChatHistoryList activeContextId={'personal'} />);
    const chatList = screen.getByTestId('chat-history-bounding-box');
    expect(chatList).toBeInTheDocument();
  });

  it('calls loadChatHistory on mount if context data is undefined (personal)', () => {
    render( <ChatHistoryList activeContextId={'personal'} /> );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('personal');
  });

  it('calls loadChatHistory on mount if context data is undefined (org)', () => {
    render( <ChatHistoryList activeContextId="org1" /> );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org1');
  });

  it('does NOT call loadChatHistory on mount if context is already loading', () => {
    setupMockStore({
      isLoadingHistoryByContext: { personal: true, orgs: {} },
    });
    render( <ChatHistoryList activeContextId={'personal'} /> );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has an error', () => {
    setupMockStore({
      historyErrorByContext: { personal: 'Fetch failed', orgs: {} },
    });
    render( <ChatHistoryList activeContextId={'personal'} /> );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context already has chats (non-empty)', () => {
    setupMockStore({
      chatsByContext: { personal: initialPersonalChats, orgs: {} }
    });
    render( <ChatHistoryList activeContextId={'personal'} /> );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('does NOT call loadChatHistory on mount if context has been fetched and is empty array', () => {
    setupMockStore({
      chatsByContext: { personal: [], orgs: {} }
    });
    render( <ChatHistoryList activeContextId={'personal'} /> );
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('updates displayed chats when activeContextId prop changes and data is available', () => {
    setupMockStore({
      chatsByContext: {
        personal: initialPersonalChats,
        orgs: { 'org1': initialOrg1Chats }
      }
    });
    const { rerender } = render( <ChatHistoryList activeContextId={'personal'} /> );
    expect(mockChatItem).toHaveBeenCalledTimes(initialPersonalChats.length);
    expect(screen.getByTestId(`chat-item-mock-${personalChatUser1.id}`)).toBeInTheDocument();

    mockChatItem.mockClear();

    rerender( <ChatHistoryList activeContextId="org1" contextTitle="Org1 Display Title"/> );
    expect(mockChatItem).toHaveBeenCalledTimes(initialOrg1Chats.length);
    expect(screen.getByTestId(`chat-item-mock-${org1ChatUser1.id}`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Org1 Display Title/i })).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalledWith('org1');
  });

  it('calls loadChatHistory when activeContextId changes to a context with undefined data', () => {
    setupMockStore({
      chatsByContext: {
        personal: initialPersonalChats,
        orgs: {}
      }
    });
    const { rerender } = render( <ChatHistoryList activeContextId={'personal'} /> );
    expect(mockLoadChatHistory).not.toHaveBeenCalledWith('org1');
    mockLoadChatHistory.mockClear();

    rerender( <ChatHistoryList activeContextId="org1" /> );
    expect(mockLoadChatHistory).toHaveBeenCalledWith('org1');
  });

  it('renders ChatItem components for personal chats and passes correct props', () => {
    setupMockStore({ chatsByContext: { personal: initialPersonalChats, orgs: {} } });
    render(
      <ChatHistoryList
        activeContextId={'personal'}
        currentChatId={personalChatUser1.id}
      />
    );

    expect(mockChatItem).toHaveBeenCalledTimes(initialPersonalChats.length);
    initialPersonalChats.forEach(chat => {
      expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining({
        chat: chat,
        isActive: chat.id === personalChatUser1.id,
      }));
    });
  });

  it('renders ChatItem components for organization chats and passes correct props', () => {
    const orgId = 'org1';
    setupMockStore({ chatsByContext: { personal: [], orgs: { [orgId]: initialOrg1Chats } } });

    render(
      <ChatHistoryList
        activeContextId={orgId}
        currentChatId="o-chat1"
      />
    );

    expect(mockChatItem).toHaveBeenCalledTimes(initialOrg1Chats.length);
    initialOrg1Chats.forEach(chat => {
      expect(mockChatItem).toHaveBeenCalledWith(expect.objectContaining({
        chat: chat,
        isActive: chat.id === 'o-chat1',
      }));
    });
  });

  it('renders "No chat history found." when there are no chats for personal context', () => {
    setupMockStore({ chatsByContext: { personal: [], orgs: {} } });
    render(<ChatHistoryList activeContextId={'personal'} />);
    expect(screen.getByText('No chat history found.')).toBeInTheDocument();
  });

  it('renders "No chat history found." when there are no chats for an org context', () => {
    setupMockStore({ chatsByContext: { personal: [], orgs: { org1: [] } } });
    render(<ChatHistoryList activeContextId="org1" />);
    expect(screen.getByText('No chat history found.')).toBeInTheDocument();
  });

  it('renders skeletons when loading personal history', () => {
    setupMockStore({ isLoadingHistoryByContext: { personal: true, orgs: {} } });
    render(<ChatHistoryList activeContextId={'personal'} />);
    expect(screen.getAllByTestId('skeleton-item')).toHaveLength(3);
  });

  it('renders skeletons when loading org history', () => {
    setupMockStore({ isLoadingHistoryByContext: { personal: false, orgs: { org1: true } } });
    render(<ChatHistoryList activeContextId="org1" />);
    expect(screen.getAllByTestId('skeleton-item')).toHaveLength(3);
  });

  it('renders error message when personal history fetch fails', () => {
    const errorMessage = 'Failed to fetch personal chats.';
    setupMockStore({ historyErrorByContext: { personal: errorMessage, orgs: {} } });
    render(<ChatHistoryList activeContextId={'personal'} />);
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('renders error message when org history fetch fails', () => {
    const errorMessage = 'Failed to fetch org chats.';
    setupMockStore({ historyErrorByContext: { personal: null, orgs: { org1: errorMessage } } });
    render(<ChatHistoryList activeContextId="org1" />);
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  describe('Error Boundary within ChatHistoryList', () => {
    it('captures and logs error from a child (ChatItem mock) and renders fallback UI', () => {
      const errorChat: Chat = { ...personalChatUser1, id: 'p-chat1-error', title: 'I will cause an error'};
      setupMockStore({
        chatsByContext: { personal: [errorChat], orgs: {} }
      });

      render(<ChatHistoryList activeContextId={'personal'} currentChatId={null} />);

      expect(screen.getByText("Could not display chat history items.")).toBeInTheDocument();
      expect(mockLoggerErrorFn).toHaveBeenCalled();
    });
  });
}); 