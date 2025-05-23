// 1. All vi.fn() mock function declarations first
const mockAuthGetStateFn = vi.fn();
const mockGetChatWithMessagesFn = vi.fn();
const mockGetAiProvidersFn = vi.fn();
const mockGetSystemPromptsFn = vi.fn();
const mockSendChatMessageFn = vi.fn();
const mockGetChatHistoryFn = vi.fn();
const mockDeleteChatFn = vi.fn();

// 2. Use vi.doMock for non-hoisted mocking, ensuring mocks are in place before dynamic import
vi.doMock('./authStore', () => ({
  useAuthStore: {
    getState: mockAuthGetStateFn,
  },
}));

vi.doMock('@paynless/api', () => ({
  api: {
    ai: vi.fn(() => ({
      getAiProviders: mockGetAiProvidersFn,
      getSystemPrompts: mockGetSystemPromptsFn,
      sendChatMessage: mockSendChatMessageFn,
      getChatHistory: mockGetChatHistoryFn,
      getChatWithMessages: mockGetChatWithMessagesFn,
      deleteChat: mockDeleteChatFn,
    })),
  },
}));

// 3. Static imports for Vitest utilities and types
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Chat, ChatMessage, AiProvider, SystemPrompt, ApiError } from '@paynless/types';

// `useAiStore` and `initialAiStateValues` will be dynamically imported

describe('aiStore - loadChatDetails', () => {
  // Variables to hold the dynamically imported store and initial values
  let useAiStore: typeof import('./aiStore').useAiStore;
  let initialAiStateValues: typeof import('./aiStore').initialAiStateValues;

  const MOCK_TOKEN = 'test-token-123';
  const MOCK_USER_ID = 'user-ai-store-test';

  const mockPersonalChat: Chat = {
    id: 'chat-personal-1',
    title: 'My Personal Chat',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    organization_id: null,
    system_prompt_id: 'prompt-abc',
    user_id: MOCK_USER_ID,
  };

  const mockPersonalChatMessages: ChatMessage[] = [
    { id: 'msg-p1', chat_id: 'chat-personal-1', role: 'user', content: 'Hello', created_at: new Date().toISOString(), user_id: MOCK_USER_ID, is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
    { id: 'msg-p2', chat_id: 'chat-personal-1', role: 'assistant', content: 'Hi there', created_at: new Date().toISOString(), user_id: null, is_active_in_thread: true, ai_provider_id: 'provider-1', system_prompt_id: 'prompt-abc', token_usage: { total_tokens: 10 } as any },
  ];

  const mockOrgChat: Chat = {
    id: 'chat-org-1',
    title: 'Org Project Chat',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    organization_id: 'org-xyz-789',
    system_prompt_id: 'prompt-def',
    user_id: MOCK_USER_ID,
  };

  const mockOrgChatMessages: ChatMessage[] = [
    { id: 'msg-o1', chat_id: 'chat-org-1', role: 'user', content: 'Org update?', created_at: new Date().toISOString(), user_id: MOCK_USER_ID, is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
  ];

  beforeEach(async () => {
    // Dynamically import the store module HERE, after mocks are set up by vi.doMock
    const aiStoreModule = await import('./aiStore');
    useAiStore = aiStoreModule.useAiStore;
    initialAiStateValues = aiStoreModule.initialAiStateValues;

    // Reset store to initial data state before each test.
    useAiStore.setState(initialAiStateValues);

    // Configure the mock for useAuthStore.getState() for each test
    mockAuthGetStateFn.mockReturnValue({
        session: { access_token: MOCK_TOKEN, user: { id: MOCK_USER_ID } },
        user: { id: MOCK_USER_ID },
        isUserLoading: false,
        authError: null,
        setSession: vi.fn(),
        clearSession: vi.fn(),
        setIsUserLoading: vi.fn(),
        setAuthError: vi.fn(),
        navigate: vi.fn(),
    });

    // Clear all top-level Vitest mock functions
    vi.clearAllMocks(); 
  });

  it('should load personal chat details and messages successfully', async () => {
    mockGetChatWithMessagesFn.mockResolvedValueOnce({
      data: { chat: mockPersonalChat, messages: mockPersonalChatMessages },
      error: null,
      status: 200,
    });

    await useAiStore.getState().loadChatDetails(mockPersonalChat.id);

    const state = useAiStore.getState();
    expect(mockGetChatWithMessagesFn).toHaveBeenCalledWith(mockPersonalChat.id, MOCK_TOKEN, undefined);
    expect(state.isDetailsLoading).toBe(false);
    expect(state.aiError).toBeNull();
    expect(state.currentChatId).toBe(mockPersonalChat.id);
    expect(state.messagesByChatId[mockPersonalChat.id]).toEqual(mockPersonalChatMessages);
    expect(state.chatsByContext.personal).toEqual(expect.arrayContaining([
        expect.objectContaining(mockPersonalChat)
    ]));
  });

  it('should load organization chat details and messages successfully', async () => {
    mockGetChatWithMessagesFn.mockResolvedValueOnce({
      data: { chat: mockOrgChat, messages: mockOrgChatMessages },
      error: null,
      status: 200,
    });

    useAiStore.setState({ 
        chatsByContext: {
            personal: undefined, 
            orgs: { [mockOrgChat.organization_id as string]: [{ ...mockOrgChat, title: "Old Title" }] }
        }
    }); 

    await useAiStore.getState().loadChatDetails(mockOrgChat.id);

    const state = useAiStore.getState();
    expect(mockGetChatWithMessagesFn).toHaveBeenCalledWith(mockOrgChat.id, MOCK_TOKEN, mockOrgChat.organization_id);
    expect(state.isDetailsLoading).toBe(false);
    expect(state.aiError).toBeNull();
    expect(state.currentChatId).toBe(mockOrgChat.id);
    expect(state.messagesByChatId[mockOrgChat.id]).toEqual(mockOrgChatMessages);
    
    const orgChats = state.chatsByContext.orgs[mockOrgChat.organization_id as string];
    expect(orgChats).toEqual(expect.arrayContaining([
        expect.objectContaining(mockOrgChat)
    ]));
    expect(orgChats?.find(c => c.id === mockOrgChat.id)?.title).toBe(mockOrgChat.title);
  });
  
  it('should add chat to context if not already present (e.g. direct URL load)', async () => {
    mockGetChatWithMessagesFn.mockResolvedValueOnce({
      data: { chat: mockPersonalChat, messages: mockPersonalChatMessages },
      error: null,
      status: 200,
    });

    useAiStore.setState({
        chatsByContext: { personal: [], orgs: {} }
    }); 

    await useAiStore.getState().loadChatDetails(mockPersonalChat.id);

    const state = useAiStore.getState();
    expect(state.chatsByContext.personal).toEqual(expect.arrayContaining([
        expect.objectContaining(mockPersonalChat)
    ]));
  });

  it('should handle API error when loading chat details', async () => {
    const apiError: ApiError = { message: 'Network Error', code: 'NETWORK_ERROR' };
    mockGetChatWithMessagesFn.mockResolvedValueOnce({
      data: null,
      error: apiError,
      status: 500,
    });

    await useAiStore.getState().loadChatDetails('any-chat-id');

    const state = useAiStore.getState();
    expect(state.isDetailsLoading).toBe(false);
    expect(state.aiError).toBe(`Failed to load messages for chat any-chat-id: ${apiError.message}`);
  });

  it('should handle authentication error (no token)', async () => {
    mockAuthGetStateFn.mockReturnValueOnce({
        session: null, 
        user: null,
        isUserLoading: false,
        authError: null,
        setSession: vi.fn(),
        clearSession: vi.fn(),
        setIsUserLoading: vi.fn(),
        setAuthError: vi.fn(),
        navigate: vi.fn(),
    });

    await useAiStore.getState().loadChatDetails('any-chat-id');

    const state = useAiStore.getState();
    expect(mockGetChatWithMessagesFn).not.toHaveBeenCalled();
    expect(state.isDetailsLoading).toBe(false);
    expect(state.aiError).toBe('Authentication token not found.');
  });

  it('should handle invalid data structure from API', async () => {
    mockGetChatWithMessagesFn.mockResolvedValueOnce({
      data: null, 
      error: null,
      status: 200,
    });

    await useAiStore.getState().loadChatDetails(mockPersonalChat.id);

    const state = useAiStore.getState();
    expect(state.isDetailsLoading).toBe(false);
    expect(state.aiError).toBe(`Failed to load messages for chat ${mockPersonalChat.id}: Failed to load chat messages.`);
  });

});
