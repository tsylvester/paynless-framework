import { useAiStore } from './aiStore';
import { useOrganizationStore } from './organizationStore';
import { Chat, AiState, ChatMessage } from '@paynless/types';
import { vi, describe, beforeEach, it, expect } from 'vitest';

// Mock useOrganizationStore
vi.mock('./organizationStore', () => ({
  useOrganizationStore: {
    getState: vi.fn(),
  },
}));

const mockOrgId1 = 'org-123';
const mockOrgId2 = 'org-456';

const mockPersonalChat1: Partial<Chat> = { id: 'chat-p1', title: 'Personal Chat 1' };
const mockPersonalChat2: Partial<Chat> = { id: 'chat-p2', title: 'Personal Chat 2' };
const mockOrg1Chat1: Partial<Chat> = { id: 'chat-o1-1', title: 'Org1 Chat 1', organization_id: mockOrgId1 };

describe('useAiStore - Selectors', () => {
  let storeState: AiState;

  // Helper to set up the AiStore state for each test
  const setAiStoreState = (newState: Partial<AiState>) => {
    useAiStore.setState({
      ...useAiStore.getState(), // Preserve other parts of state
      ...newState,
    });
    storeState = useAiStore.getState();
  };

  // Helper to set the mocked currentOrganizationId
  const setMockCurrentOrganizationId = (orgId: string | null) => {
    (useOrganizationStore.getState as vi.Mock).mockReturnValue({ currentOrganizationId: orgId });
  };

  beforeEach(() => {
    // Reset AiStore to its initial state or a known clean state if needed
    // For selectors, we often set specific states for the test.
    // Resetting mocks
    vi.clearAllMocks();
    
    // Set a default clean state for chatsByContext for AiStore
    setAiStoreState({
      chatsByContext: {
        personal: [],
        orgs: {},
      },
    });
  });

  describe('selectChatHistoryList', () => {
    it('should return personal chats when currentOrganizationId is null', () => {
      setMockCurrentOrganizationId(null);
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat, mockPersonalChat2 as Chat],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      // Assuming selectChatHistoryList is a method on the store instance
      // This will fail until the selector is implemented
      const personalChats = useAiStore.getState().selectChatHistoryList();
      expect(personalChats).toEqual([mockPersonalChat1, mockPersonalChat2]);
    });

    it('should return an empty array for personal chats if none exist', () => {
      setMockCurrentOrganizationId(null);
      setAiStoreState({
        chatsByContext: {
          personal: [],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      const personalChats = useAiStore.getState().selectChatHistoryList();
      expect(personalChats).toEqual([]);
    });

    it('should return organization chats when currentOrganizationId is set', () => {
      setMockCurrentOrganizationId(mockOrgId1);
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      const orgChats = useAiStore.getState().selectChatHistoryList();
      expect(orgChats).toEqual([mockOrg1Chat1]);
    });

    it('should return an empty array for org chats if none exist for the current org', () => {
      setMockCurrentOrganizationId(mockOrgId1);
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat],
          orgs: { [mockOrgId1]: [] }, // Org1 has no chats
        },
      });
      const orgChats = useAiStore.getState().selectChatHistoryList();
      expect(orgChats).toEqual([]);
    });

    it('should return an empty array if currentOrganizationId refers to an org not in chatsByContext.orgs', () => {
      setMockCurrentOrganizationId(mockOrgId2); // mockOrgId2 has no entry in orgs
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      const orgChats = useAiStore.getState().selectChatHistoryList();
      expect(orgChats).toEqual([]);
    });
  });

  describe('selectCurrentChatMessages', () => {
    const chatId1 = 'chat-1';
    const msg1: Partial<ChatMessage> = { id: 'msg-1', chat_id: chatId1, content: 'Hello', is_active_in_thread: true };
    const msg2: Partial<ChatMessage> = { id: 'msg-2', chat_id: chatId1, content: 'World', is_active_in_thread: true };
    const msg3Inactive: Partial<ChatMessage> = { id: 'msg-3', chat_id: chatId1, content: 'Inactive', is_active_in_thread: false };
    const msg4Chat2: Partial<ChatMessage> = { id: 'msg-4', chat_id: 'chat-2', content: 'Other chat', is_active_in_thread: true };

    it('should return active messages for the currentChatId', () => {
      setAiStoreState({
        currentChatId: chatId1,
        messagesByChatId: {
          [chatId1]: [msg1 as ChatMessage, msg2 as ChatMessage, msg3Inactive as ChatMessage],
          'chat-2': [msg4Chat2 as ChatMessage],
        },
      });
      const messages = useAiStore.getState().selectCurrentChatMessages();
      expect(messages).toEqual([msg1, msg2]);
    });

    it('should return an empty array if currentChatId is null', () => {
      setAiStoreState({
        currentChatId: null,
        messagesByChatId: {
          [chatId1]: [msg1 as ChatMessage],
        },
      });
      const messages = useAiStore.getState().selectCurrentChatMessages();
      expect(messages).toEqual([]);
    });

    it('should return an empty array if no messages exist for currentChatId', () => {
      setAiStoreState({
        currentChatId: chatId1,
        messagesByChatId: {},
      });
      const messages = useAiStore.getState().selectCurrentChatMessages();
      expect(messages).toEqual([]);
    });

    it('should return an empty array if all messages for currentChatId are inactive', () => {
      setAiStoreState({
        currentChatId: chatId1,
        messagesByChatId: {
          [chatId1]: [msg3Inactive as ChatMessage],
        },
      });
      const messages = useAiStore.getState().selectCurrentChatMessages();
      expect(messages).toEqual([]);
    });

    it('should only return messages with is_active_in_thread = true', () => {
      setAiStoreState({
        currentChatId: chatId1,
        messagesByChatId: {
          [chatId1]: [msg1 as ChatMessage, msg3Inactive as ChatMessage, msg2 as ChatMessage],
        },
      });
      const messages = useAiStore.getState().selectCurrentChatMessages();
      expect(messages).toEqual([msg1, msg2]);
      expect(messages.find(m => m.id === 'msg-3')).toBeUndefined();
    });
  });

  describe('selectIsHistoryLoading', () => {
    it('should return personal history loading state when currentOrganizationId is null', () => {
      setMockCurrentOrganizationId(null);
      setAiStoreState({ isLoadingHistoryByContext: { personal: true, orgs: { [mockOrgId1]: false } } });
      expect(useAiStore.getState().selectIsHistoryLoading()).toBe(true);

      setAiStoreState({ isLoadingHistoryByContext: { personal: false, orgs: { [mockOrgId1]: true } } });
      expect(useAiStore.getState().selectIsHistoryLoading()).toBe(false);
    });

    it('should return organization history loading state when currentOrganizationId is set', () => {
      setMockCurrentOrganizationId(mockOrgId1);
      setAiStoreState({ isLoadingHistoryByContext: { personal: true, orgs: { [mockOrgId1]: true } } });
      expect(useAiStore.getState().selectIsHistoryLoading()).toBe(true);

      setAiStoreState({ isLoadingHistoryByContext: { personal: true, orgs: { [mockOrgId1]: false } } });
      expect(useAiStore.getState().selectIsHistoryLoading()).toBe(false);
    });

    it('should return false if currentOrganizationId refers to an org not in isLoadingHistoryByContext.orgs', () => {
      setMockCurrentOrganizationId(mockOrgId2); // mockOrgId2 has no entry
      setAiStoreState({ isLoadingHistoryByContext: { personal: false, orgs: { [mockOrgId1]: true } } });
      expect(useAiStore.getState().selectIsHistoryLoading()).toBe(false);
    });

    it('should return false if isLoadingHistoryByContext.orgs is empty and currentOrganizationId is set', () => {
        setMockCurrentOrganizationId(mockOrgId1); 
        setAiStoreState({ isLoadingHistoryByContext: { personal: false, orgs: {} } });
        expect(useAiStore.getState().selectIsHistoryLoading()).toBe(false);
      });
  });

  describe('selectIsDetailsLoading', () => {
    it('should return the value of state.isDetailsLoading', () => {
      setAiStoreState({ isDetailsLoading: true });
      expect(useAiStore.getState().selectIsDetailsLoading()).toBe(true);
      setAiStoreState({ isDetailsLoading: false });
      expect(useAiStore.getState().selectIsDetailsLoading()).toBe(false);
    });
  });

  describe('selectIsLoadingAiResponse', () => {
    it('should return the value of state.isLoadingAiResponse', () => {
      setAiStoreState({ isLoadingAiResponse: true });
      expect(useAiStore.getState().selectIsLoadingAiResponse()).toBe(true);
      setAiStoreState({ isLoadingAiResponse: false });
      expect(useAiStore.getState().selectIsLoadingAiResponse()).toBe(false);
    });
  });

  describe('selectAiError', () => {
    it('should return the value of state.aiError', () => {
      setAiStoreState({ aiError: 'An error occurred' });
      expect(useAiStore.getState().selectAiError()).toBe('An error occurred');
      setAiStoreState({ aiError: null });
      expect(useAiStore.getState().selectAiError()).toBeNull();
    });
  });

  describe('selectRewindTargetMessageId', () => {
    it('should return the value of state.rewindTargetMessageId', () => {
      setAiStoreState({ rewindTargetMessageId: 'msg-rewind-target' });
      expect(useAiStore.getState().selectRewindTargetMessageId()).toBe('msg-rewind-target');
      setAiStoreState({ rewindTargetMessageId: null });
      expect(useAiStore.getState().selectRewindTargetMessageId()).toBeNull();
    });
  });

  describe('selectIsRewinding', () => {
    it('should return true if state.rewindTargetMessageId is set', () => {
      setAiStoreState({ rewindTargetMessageId: 'msg-rewind-target' });
      expect(useAiStore.getState().selectIsRewinding()).toBe(true);
    });

    it('should return false if state.rewindTargetMessageId is null', () => {
      setAiStoreState({ rewindTargetMessageId: null });
      expect(useAiStore.getState().selectIsRewinding()).toBe(false);
    });
  });

  // More selectors will be added below
}); 