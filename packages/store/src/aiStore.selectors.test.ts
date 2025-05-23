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
  selectIsRewinding,
  selectChatTokenUsage,
  selectAllPersonalChatMessages,
  selectCurrentChatSessionTokenUsage,
} from './aiStore.selectors.ts'; // Added .ts extension
import { Chat, AiState, ChatMessage, TokenUsage, Json, ChatSessionTokenUsageDetails } from '@paynless/types';
import { vi, describe, beforeEach, it, expect } from 'vitest';

// Mock useOrganizationStore - REMOVE THIS MOCK
// vi.mock('./organizationStore', () => ({
//   useOrganizationStore: {
//     getState: vi.fn(),
//   },
// }));

const mockOrgId1 = 'org-123';
const mockOrgId2 = 'org-456';

const mockPersonalChat1: Partial<Chat> = { id: 'chat-p1', title: 'Personal Chat 1', user_id: 'user-test-id', organization_id: null };
const mockPersonalChat2: Partial<Chat> = { id: 'chat-p2', title: 'Personal Chat 2', user_id: 'user-test-id', organization_id: null };
const mockOrg1Chat1: Partial<Chat> = { id: 'chat-o1-1', title: 'Org1 Chat 1', organization_id: mockOrgId1 };

// New Mock Data for Token Usage Tests
const mockTokenUsage1: TokenUsage = { prompt_tokens: 100, completion_tokens: 150, total_tokens: 250 };
const mockTokenUsage2: TokenUsage = { prompt_tokens: 50, completion_tokens: 70, total_tokens: 120 };
const mockTokenUsageSnakeCase: any = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };

const mockMsgWithTokens1: Partial<ChatMessage> = {
  id: 'msg-tok-1',
  chat_id: 'chat-p1',
  content: 'Hello with tokens',
  is_active_in_thread: true,
  token_usage: mockTokenUsage1 as unknown as Json,
  role: 'assistant',
  created_at: new Date().toISOString(),
};

const mockMsgWithTokens2: Partial<ChatMessage> = {
  id: 'msg-tok-2',
  chat_id: 'chat-p1',
  content: 'World with more tokens',
  is_active_in_thread: true,
  token_usage: mockTokenUsage2 as unknown as Json,
  role: 'assistant',
  created_at: new Date().toISOString(),
};

const mockMsgWithSnakeCaseTokens: Partial<ChatMessage> = {
    id: 'msg-tok-snake',
    chat_id: 'chat-p1',
    content: 'Snake tokens',
    is_active_in_thread: true,
    token_usage: mockTokenUsageSnakeCase as unknown as Json, // Cast for test setup
    role: 'assistant',
    created_at: new Date().toISOString(),
};

const mockMsgNoTokens: Partial<ChatMessage> = {
  id: 'msg-no-tok',
  chat_id: 'chat-p1',
  content: 'No tokens here',
  is_active_in_thread: true,
  token_usage: null,
  role: 'user',
  created_at: new Date().toISOString(),
};

const mockMsgMalformedTokens: Partial<ChatMessage> = {
    id: 'msg-malformed-tok',
    chat_id: 'chat-p1',
    content: 'Malformed tokens',
    is_active_in_thread: true,
    token_usage: { promptTokens: 'invalid' } as any, // Malformed
    role: 'assistant',
    created_at: new Date().toISOString(),
};

const mockMsgInactiveWithTokens: Partial<ChatMessage> = {
    id: 'msg-inactive-tok',
    chat_id: 'chat-p1',
    content: 'Inactive with tokens',
    is_active_in_thread: false,
    token_usage: mockTokenUsage1 as unknown as Json,
    role: 'assistant',
    created_at: new Date().toISOString(),
  };

describe('useAiStore - Selectors', () => {
  let storeState: AiState;

  const setAiStoreState = (newState: Partial<AiState>) => {
    storeState = {
      availableProviders: [],
      availablePrompts: [],
      chatsByContext: { personal: [], orgs: {} },
      messagesByChatId: {},
      currentChatId: null,
      isLoadingAiResponse: false,
      isConfigLoading: false,
      isLoadingHistoryByContext: { personal: false, orgs: {} },
      historyErrorByContext: { personal: null, orgs: {} }, 
      isDetailsLoading: false,
      newChatContext: null,
      rewindTargetMessageId: null,
      aiError: null,
      selectedMessagesMap: {}, 
      selectedProviderId: null, 
      selectedPromptId: null, 
      chatParticipantsProfiles: {}, 
      ...newState,
    } as AiState;
  };

  // Helper to set the mocked currentOrganizationId - REMOVE THIS HELPER
  // const setMockCurrentOrganizationId = (orgId: string | null) => {
  //   (useOrganizationStore.getState as vi.Mock).mockReturnValue({ currentOrganizationId: orgId });
  // };

  beforeEach(() => {
    vi.clearAllMocks();
    // Initialize storeState with a minimal default structure for AiState
    // This will be overridden by setAiStoreState in most tests
    storeState = {
      availableProviders: [],
      availablePrompts: [],
      chatsByContext: { personal: [], orgs: {} },
      messagesByChatId: {},
      currentChatId: null,
      isLoadingAiResponse: false,
      isConfigLoading: false,
      isLoadingHistoryByContext: { personal: false, orgs: {} },
      historyErrorByContext: { personal: null, orgs: {} },
      isDetailsLoading: false,
      newChatContext: null,
      rewindTargetMessageId: null,
      aiError: null,
      selectedMessagesMap: {},
      selectedProviderId: null,
      selectedPromptId: null,
      chatParticipantsProfiles: {},
    } as AiState;
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

  describe('selectChatTokenUsage', () => {
    it('should sum token usage for a chat with valid tokens', () => {
      setAiStoreState({
        messagesByChatId: {
          'chat-p1': [
            mockMsgWithTokens1 as ChatMessage,
            mockMsgNoTokens as ChatMessage,
            mockMsgWithTokens2 as ChatMessage,
          ],
        },
      });
      const usage = selectChatTokenUsage(storeState, 'chat-p1');
      expect(usage).toEqual({
        prompt_tokens: 100 + 50,
        completion_tokens: 150 + 70,
        total_tokens: 250 + 120,
      });
    });

    it('should handle snake_case token usage', () => {
        setAiStoreState({
          messagesByChatId: {
            'chat-p1': [mockMsgWithSnakeCaseTokens as ChatMessage],
          },
        });
        const usage = selectChatTokenUsage(storeState, 'chat-p1');
        expect(usage).toEqual({
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        });
      });

    it('should return zero totals if chat exists but messages have no valid token_usage', () => {
      setAiStoreState({
        messagesByChatId: {
          'chat-p1': [mockMsgNoTokens as ChatMessage, mockMsgMalformedTokens as ChatMessage],
        },
      });
      const usage = selectChatTokenUsage(storeState, 'chat-p1');
      expect(usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    });

    it('should return null if chatId does not exist in messagesByChatId', () => {
      setAiStoreState({ messagesByChatId: {} });
      const usage = selectChatTokenUsage(storeState, 'non-existent-chat');
      expect(usage).toBeNull();
    });

    it('should return null if chat has an empty message array', () => {
      setAiStoreState({ messagesByChatId: { 'chat-p1': [] } });
      const usage = selectChatTokenUsage(storeState, 'chat-p1');
      expect(usage).toBeNull(); 
    });
  });

  describe('selectAllPersonalChatMessages', () => {
    const chatP1Msg1 = { ...mockMsgWithTokens1, chat_id: 'chat-p1' } as ChatMessage;
    const chatP1Msg2Inactive = { ...mockMsgInactiveWithTokens, chat_id: 'chat-p1' } as ChatMessage;
    const chatP2Msg1 = { ...mockMsgWithTokens2, chat_id: 'chat-p2' } as ChatMessage;

    it('should return an empty array if no personal chats exist', () => {
      setAiStoreState({ chatsByContext: { personal: [], orgs: {} } });
      const messages = selectAllPersonalChatMessages(storeState);
      expect(messages).toEqual([]);
    });

    it('should return an empty array if personal chats have no messages', () => {
      setAiStoreState({
        chatsByContext: { personal: [mockPersonalChat1 as Chat], orgs: {} },
        messagesByChatId: { 'chat-p1': [] },
      });
      const messages = selectAllPersonalChatMessages(storeState);
      expect(messages).toEqual([]);
    });

    it('should return active messages from all personal chats', () => {
      setAiStoreState({
        chatsByContext: { personal: [mockPersonalChat1 as Chat, mockPersonalChat2 as Chat], orgs: {} },
        messagesByChatId: {
          'chat-p1': [chatP1Msg1, chatP1Msg2Inactive],
          'chat-p2': [chatP2Msg1],
        },
      });
      const messages = selectAllPersonalChatMessages(storeState);
      expect(messages).toEqual([chatP1Msg1, chatP2Msg1]);
      expect(messages.length).toBe(2);
    });

    it('should only include messages where is_active_in_thread is not false', () => {
        const activeMsgUndefined: Partial<ChatMessage> = { id: 'active-undef', chat_id: 'chat-p1', is_active_in_thread: undefined, content: 'active?' };
        const activeMsgTrue: Partial<ChatMessage> = { id: 'active-true', chat_id: 'chat-p1', is_active_in_thread: true, content: 'active!' };
        const inactiveMsg: Partial<ChatMessage> = { id: 'inactive', chat_id: 'chat-p1', is_active_in_thread: false, content: 'inactive' }; 
        setAiStoreState({
            chatsByContext: { personal: [mockPersonalChat1 as Chat], orgs: {} },
            messagesByChatId: {
              'chat-p1': [activeMsgUndefined as ChatMessage, inactiveMsg as ChatMessage, activeMsgTrue as ChatMessage],
            },
          });
          const messages = selectAllPersonalChatMessages(storeState);
          expect(messages).toEqual([activeMsgUndefined, activeMsgTrue]);
          expect(messages.find(m => m.id === 'inactive')).toBeUndefined();
    });
  });

  describe('selectCurrentChatSessionTokenUsage', () => {
    const mockUserMessage: Partial<ChatMessage> = {
      id: 'user-msg-sel-1',
      chat_id: 'chat-sel-1',
      // user_id: 'user-sel-123', // Not needed for this selector test directly if we use Partial<ChatMessage>
      role: 'user',
      content: 'Hello',
      created_at: new Date().toISOString(),
      // updated_at: new Date().toISOString(), // Not strictly needed for selector logic
      token_usage: null, 
      is_active_in_thread: true,
    };

    const mockAssistantMessage1: Partial<ChatMessage> = {
      id: 'assistant-msg-sel-1',
      chat_id: 'chat-sel-1',
      role: 'assistant',
      content: 'Response 1',
      created_at: new Date().toISOString(),
      token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } as unknown as Json, // Cast to full TokenUsage if store expects it, else this is fine for partial testing
      is_active_in_thread: true,
    };

    const mockAssistantMessage2: Partial<ChatMessage> = {
      id: 'assistant-msg-sel-2',
      chat_id: 'chat-sel-1',
      role: 'assistant',
      content: 'Response 2',
      created_at: new Date().toISOString(),
      token_usage: { prompt_tokens: 5, completion_tokens: 15, total_tokens: 20 } as unknown as Json,
      is_active_in_thread: true,
    };

    const mockAssistantMessageNoTokens: Partial<ChatMessage> = {
      id: 'assistant-msg-sel-3',
      chat_id: 'chat-sel-1',
      role: 'assistant',
      content: 'Response 3 no tokens',
      created_at: new Date().toISOString(),
      token_usage: null,
      is_active_in_thread: true,
    };
    
    beforeEach(() => {
      setAiStoreState({ 
        messagesByChatId: {},
        currentChatId: null,
      });
    });

    it('should return zeros if currentChatId is null', () => {
      setAiStoreState({ currentChatId: null, messagesByChatId: { 'chat-sel-1': [mockAssistantMessage1 as ChatMessage]} } as unknown as AiState);
      // Directly call the selector function from the store's instance if it's part of the store object
      // Or if it's an exported selector function, call it with the mocked state.
      // Assuming the selector is on the store instance for this example:
      const usage = selectCurrentChatSessionTokenUsage(storeState);
      expect(usage).toEqual({ assistantPromptTokens: 0, assistantCompletionTokens: 0, assistantTotalTokens: 0, overallTotalTokens: 0 });
    });

    it('should return zeros if no messages for the currentChatId', () => {
      setAiStoreState({ currentChatId: 'chat-sel-1', messagesByChatId: {} } as AiState);
      const usage = selectCurrentChatSessionTokenUsage(storeState);
      expect(usage).toEqual({ assistantPromptTokens: 0, assistantCompletionTokens: 0, assistantTotalTokens: 0, overallTotalTokens: 0 });
    });

    it('should return zeros if messages exist but have no token_usage or are inactive', () => {
      setAiStoreState({
        currentChatId: 'chat-sel-1',
        messagesByChatId: { 
          'chat-sel-1': [
            mockUserMessage as ChatMessage, 
            mockAssistantMessageNoTokens as ChatMessage,
            { ...mockAssistantMessage1, id: 'inactive-with-tokens', is_active_in_thread: false } as ChatMessage 
          ]
        },
      } as unknown as AiState);
      const usage = selectCurrentChatSessionTokenUsage(storeState);
      expect(usage).toEqual({ assistantPromptTokens: 0, assistantCompletionTokens: 0, assistantTotalTokens: 0, overallTotalTokens: 0 });
    });

    it('should correctly sum token_usage for active assistant messages in the current chat', () => {
      setAiStoreState({
        currentChatId: 'chat-sel-1',
        messagesByChatId: {
          'chat-sel-1': [
            mockUserMessage as ChatMessage, 
            mockAssistantMessage1 as ChatMessage, 
            mockAssistantMessage2 as ChatMessage, 
            mockAssistantMessageNoTokens as ChatMessage, 
            { ...mockAssistantMessage1, id:'inactive-assistant', token_usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } as unknown as Json, is_active_in_thread: false } as ChatMessage 
          ],
          'chat-sel-2': [{ ...mockAssistantMessage1, id:'other-chat-msg', chat_id: 'chat-sel-2'} as ChatMessage],
        },
      });
      const usage = selectCurrentChatSessionTokenUsage(storeState);
      expect(usage).toEqual({
        assistantPromptTokens: 10 + 5, 
        assistantCompletionTokens: 20 + 15, 
        assistantTotalTokens: 30 + 20, 
        overallTotalTokens: 0 + (30 + 20)
      });
    });

    it('should correctly sum token_usage even if some active user messages have token_usage (e.g. optimistic estimates)', () => {
      const userMessageWithTokens: Partial<ChatMessage> = {
        ...mockUserMessage,
        id: 'user-optimistic-tokens',
        token_usage: { prompt_tokens: 7, completion_tokens: 0, total_tokens: 7 } as unknown as Json, 
      };
      setAiStoreState({
        currentChatId: 'chat-sel-1',
        messagesByChatId: {
          'chat-sel-1': [userMessageWithTokens as ChatMessage, mockAssistantMessage1 as ChatMessage],
        },
      });
      const usage = selectCurrentChatSessionTokenUsage(storeState);
      expect(usage).toEqual({
        assistantPromptTokens: 10,
        assistantCompletionTokens: 20,
        assistantTotalTokens: 30,
        overallTotalTokens: 7 + 30
      });
    });

    it('should correctly sum token_usage from assistant messages with snake_case token data (if selector handles it)', () => {
        const mockAssistantSnake = {
            ...mockAssistantMessage1, 
            id: 'asst-msg-snake',
            token_usage: { prompt_tokens: 3, completion_tokens: 7, total_tokens: 10 } as any, 
        };
        setAiStoreState({
            currentChatId: 'chat-sel-1',
            messagesByChatId: { 'chat-sel-1': [mockAssistantSnake as ChatMessage] },
        });
        const usage = selectCurrentChatSessionTokenUsage(storeState);
        expect(usage).toEqual({
            assistantPromptTokens: 3, 
            assistantCompletionTokens: 7, 
            assistantTotalTokens: 10, 
            overallTotalTokens: 0 + 10
        });
    });
  });
}); 