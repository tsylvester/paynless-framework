import { useAiStore } from './aiStore';
// import { useOrganizationStore } from './organizationStore'; // No longer needed
import {
  selectChatHistoryList,
  selectCurrentChatMessages,
  selectIsHistoryLoading,
  selectIsDetailsLoading,
  selectIsLoadingAiResponse,
  selectAiError,
  selectRewindTargetMessageId,
  selectIsRewinding
} from './aiStore.selectors'; // Import new selectors
import { Chat, AiState, ChatMessage } from '@paynless/types';
import { vi, describe, beforeEach, it, expect } from 'vitest';

// Mock useOrganizationStore - REMOVE THIS MOCK
// vi.mock('./organizationStore', () => ({
//   useOrganizationStore: {
//     getState: vi.fn(),
//   },
// }));

const mockOrgId1 = 'org-123';
const mockOrgId2 = 'org-456';

const mockPersonalChat1: Partial<Chat> = { id: 'chat-p1', title: 'Personal Chat 1' };
const mockPersonalChat2: Partial<Chat> = { id: 'chat-p2', title: 'Personal Chat 2' };
const mockOrg1Chat1: Partial<Chat> = { id: 'chat-o1-1', title: 'Org1 Chat 1', organization_id: mockOrgId1 };

describe('useAiStore - Selectors', () => {
  let storeState: AiState;

  // Helper to set up the AiStore state for each test
  const setAiStoreState = (newState: Partial<AiState>) => {
    // Construct the full initial state for the store if it's not already comprehensive
    // For testing selectors, we primarily care about the state snapshot passed to them.
    // The actual useAiStore.setState might not even be necessary if we directly construct
    // the AiState object to pass to selectors.
    // However, to keep structure similar if some tests rely on get() from within actions (not selectors):
    const baseState = useAiStore.getState(); // Get a full state structure
    storeState = { ...baseState, ...newState } as AiState;
  };

  // Helper to set the mocked currentOrganizationId - REMOVE THIS HELPER
  // const setMockCurrentOrganizationId = (orgId: string | null) => {
  //   (useOrganizationStore.getState as vi.Mock).mockReturnValue({ currentOrganizationId: orgId });
  // };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set a default clean state for storeState directly
    // This is the object that will be passed to our selectors
    storeState = {
      availableProviders: [],
      availablePrompts: [],
      chatsByContext: { personal: [], orgs: {} },
      messagesByChatId: {},
      currentChatId: null,
      isLoadingAiResponse: false,
      isConfigLoading: false,
      isLoadingHistoryByContext: { personal: false, orgs: {} },
      isDetailsLoading: false,
      newChatContext: null,
      rewindTargetMessageId: null,
      aiError: null,
      // Ensure all AiState fields are initialized if selectors depend on them
      // For example, if a selector used a field not listed above, it would need to be here.
    } as AiState; // Cast to ensure all AiState fields are present or considered
  });

  describe('selectChatHistoryList', () => {
    it('should return personal chats when contextId is null', () => {
      // setMockCurrentOrganizationId(null); // No longer needed
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat, mockPersonalChat2 as Chat],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      const personalChats = selectChatHistoryList(storeState, null); // Pass null for personal context
      expect(personalChats).toEqual([mockPersonalChat1, mockPersonalChat2]);
    });

    it('should return an empty array for personal chats if none exist', () => {
      // setMockCurrentOrganizationId(null); // No longer needed
      setAiStoreState({
        chatsByContext: {
          personal: [],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      const personalChats = selectChatHistoryList(storeState, null);
      expect(personalChats).toEqual([]);
    });

    it('should return organization chats when contextId is set to an org ID', () => {
      // setMockCurrentOrganizationId(mockOrgId1); // No longer needed
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      const orgChats = selectChatHistoryList(storeState, mockOrgId1);
      expect(orgChats).toEqual([mockOrg1Chat1]);
    });

    it('should return an empty array for org chats if none exist for the given orgId', () => {
      // setMockCurrentOrganizationId(mockOrgId1); // No longer needed
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat],
          orgs: { [mockOrgId1]: [] }, // Org1 has no chats
        },
      });
      const orgChats = selectChatHistoryList(storeState, mockOrgId1);
      expect(orgChats).toEqual([]);
    });

    it('should return an empty array if contextId refers to an org not in chatsByContext.orgs', () => {
      // setMockCurrentOrganizationId(mockOrgId2); // No longer needed
      setAiStoreState({
        chatsByContext: {
          personal: [mockPersonalChat1 as Chat],
          orgs: { [mockOrgId1]: [mockOrg1Chat1 as Chat] },
        },
      });
      const orgChats = selectChatHistoryList(storeState, mockOrgId2);
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
      const messages = selectCurrentChatMessages(storeState);
      expect(messages).toEqual([msg1, msg2]);
    });

    it('should return an empty array if currentChatId is null', () => {
      setAiStoreState({
        currentChatId: null,
        messagesByChatId: {
          [chatId1]: [msg1 as ChatMessage],
        },
      });
      const messages = selectCurrentChatMessages(storeState);
      expect(messages).toEqual([]);
    });

    it('should return an empty array if no messages exist for currentChatId', () => {
      setAiStoreState({
        currentChatId: chatId1,
        messagesByChatId: {},
      });
      const messages = selectCurrentChatMessages(storeState);
      expect(messages).toEqual([]);
    });

    it('should return an empty array if all messages for currentChatId are inactive', () => {
      setAiStoreState({
        currentChatId: chatId1,
        messagesByChatId: {
          [chatId1]: [msg3Inactive as ChatMessage],
        },
      });
      const messages = selectCurrentChatMessages(storeState);
      expect(messages).toEqual([]);
    });

    it('should only return messages with is_active_in_thread = true', () => {
      setAiStoreState({
        currentChatId: chatId1,
        messagesByChatId: {
          [chatId1]: [msg1 as ChatMessage, msg3Inactive as ChatMessage, msg2 as ChatMessage],
        },
      });
      const messages = selectCurrentChatMessages(storeState);
      expect(messages).toEqual([msg1, msg2]);
      expect(messages.find(m => m.id === 'msg-3')).toBeUndefined();
    });
  });

  describe('selectIsHistoryLoading', () => {
    it('should return personal history loading state when contextId is null', () => {
      // setMockCurrentOrganizationId(null); // No longer needed
      setAiStoreState({ isLoadingHistoryByContext: { personal: true, orgs: { [mockOrgId1]: false } } });
      expect(selectIsHistoryLoading(storeState, null)).toBe(true);

      setAiStoreState({ isLoadingHistoryByContext: { personal: false, orgs: { [mockOrgId1]: true } } });
      expect(selectIsHistoryLoading(storeState, null)).toBe(false);
    });

    it('should return organization history loading state when contextId is set to an org ID', () => {
      // setMockCurrentOrganizationId(mockOrgId1); // No longer needed
      setAiStoreState({ isLoadingHistoryByContext: { personal: true, orgs: { [mockOrgId1]: true } } });
      expect(selectIsHistoryLoading(storeState, mockOrgId1)).toBe(true);

      setAiStoreState({ isLoadingHistoryByContext: { personal: true, orgs: { [mockOrgId1]: false } } });
      expect(selectIsHistoryLoading(storeState, mockOrgId1)).toBe(false);
    });

    it('should return false if contextId refers to an org not in isLoadingHistoryByContext.orgs', () => {
      // setMockCurrentOrganizationId(mockOrgId2); // No longer needed
      setAiStoreState({ isLoadingHistoryByContext: { personal: false, orgs: { [mockOrgId1]: true } } });
      expect(selectIsHistoryLoading(storeState, mockOrgId2)).toBe(false);
    });

    it('should return false if isLoadingHistoryByContext.orgs is empty and contextId is for an org', () => {
        // setMockCurrentOrganizationId(mockOrgId1); // No longer needed
        setAiStoreState({ isLoadingHistoryByContext: { personal: false, orgs: {} } });
        expect(selectIsHistoryLoading(storeState, mockOrgId1)).toBe(false);
      });
  });

  describe('selectIsDetailsLoading', () => {
    it('should return the value of state.isDetailsLoading', () => {
      setAiStoreState({ isDetailsLoading: true });
      expect(selectIsDetailsLoading(storeState)).toBe(true);
      setAiStoreState({ isDetailsLoading: false });
      expect(selectIsDetailsLoading(storeState)).toBe(false);
    });
  });

  describe('selectIsLoadingAiResponse', () => {
    it('should return the value of state.isLoadingAiResponse', () => {
      setAiStoreState({ isLoadingAiResponse: true });
      expect(selectIsLoadingAiResponse(storeState)).toBe(true);
      setAiStoreState({ isLoadingAiResponse: false });
      expect(selectIsLoadingAiResponse(storeState)).toBe(false);
    });
  });

  describe('selectAiError', () => {
    it('should return the value of state.aiError', () => {
      setAiStoreState({ aiError: 'An error occurred' });
      expect(selectAiError(storeState)).toBe('An error occurred');
      setAiStoreState({ aiError: null });
      expect(selectAiError(storeState)).toBeNull();
    });
  });

  describe('selectRewindTargetMessageId', () => {
    it('should return the value of state.rewindTargetMessageId', () => {
      setAiStoreState({ rewindTargetMessageId: 'msg-rewind-target' });
      expect(selectRewindTargetMessageId(storeState)).toBe('msg-rewind-target');
      setAiStoreState({ rewindTargetMessageId: null });
      expect(selectRewindTargetMessageId(storeState)).toBeNull();
    });
  });

  describe('selectIsRewinding', () => {
    it('should return true if state.rewindTargetMessageId is set', () => {
      setAiStoreState({ rewindTargetMessageId: 'msg-rewind-target' });
      expect(selectIsRewinding(storeState)).toBe(true);
      setAiStoreState({ rewindTargetMessageId: null });
      expect(selectIsRewinding(storeState)).toBe(false);
    });
    
    it('should return false if state.rewindTargetMessageId is null', () => {
      setAiStoreState({ rewindTargetMessageId: null });
      expect(selectIsRewinding(storeState)).toBe(false);
    });
  });
}); 