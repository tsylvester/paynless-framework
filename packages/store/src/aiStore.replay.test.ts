import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore } from './aiStore'; // Adjust path as needed
import { useAuthStore } from './authStore'; // Adjust path as needed
import { api } from '@paynless/api-client'; // Adjust path as needed
import type { PendingAction, ChatMessage } from '@paynless/types';

// Mock dependencies
vi.mock('@paynless/api-client', () => ({
  api: {
    post: vi.fn(),
    // Mock other api methods if needed by other store actions potentially triggered
  }
}));
vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ // Mock initial auth state
      session: null,
      user: null,
      navigate: null,
    })),
  }
}));

// Helper to reset store before each test
const resetStore = () => {
    useAiStore.setState(useAiStore.getInitialState(), true);
    // Reset mocks
    vi.clearAllMocks();
    // Reset authStore mock state
    (useAuthStore.getState as vi.Mock).mockReturnValue({ 
        session: null, user: null, navigate: null 
    }); 
};

// Mock localStorage setup (using vitest-localstorage-mock or similar is cleaner)
// Basic manual mock for demonstration:
beforeEach(() => {
  resetStore();
  localStorage.clear(); // Provided by vitest-localstorage-mock
});

afterEach(() => {
  // vi.restoreAllMocks(); // Only need to restore non-localStorage mocks if any were added manually
});

describe('aiStore - checkAndReplayPendingChatAction', () => {

  it('should do nothing if no pendingAction exists in localStorage', async () => {
    // Arrange: localStorage is cleared by beforeEach
    const store = useAiStore.getState();
    const initialState = { ...store };

    // Act
    await store.checkAndReplayPendingChatAction();

    // Assert
    expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
    expect(api.post).not.toHaveBeenCalled();
    expect(useAiStore.getState()).toEqual(initialState); // State unchanged
    // Assert removal based on implementation choice (currently NOT removed for non-chat)
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('should do nothing if pendingAction is not a chat POST action', async () => {
    // Arrange
    const nonChatAction: PendingAction = {
        endpoint: 'profile', // Not 'chat'
        method: 'PUT',
        body: { firstName: 'Test' },
        returnPath: '/profile'
    };
    localStorage.setItem('pendingAction', JSON.stringify(nonChatAction));
    const store = useAiStore.getState();
    const initialState = { ...store };

    // Act
    await store.checkAndReplayPendingChatAction();

    // Assert
    expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
    expect(api.post).not.toHaveBeenCalled();
    expect(useAiStore.getState()).toEqual(initialState); // State unchanged
    // Optional: Assert if non-chat actions should be removed or left alone
    // expect(localStorage.removeItem).not.toHaveBeenCalled(); 
    // expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');
  });

  it('should set error and do nothing if pendingAction exists but user is not authenticated', async () => {
    // Arrange
    const chatAction: PendingAction = {
        endpoint: 'chat',
        method: 'POST',
        body: { message: 'Test message', providerId: 'p1', promptId: 'pr1' },
        returnPath: '/chat'
    };
    localStorage.setItem('pendingAction', JSON.stringify(chatAction));
    // Ensure authStore mock returns no token
    (useAuthStore.getState as vi.Mock).mockReturnValue({ session: null, user: null }); 
    const store = useAiStore.getState();

    // Act
    await store.checkAndReplayPendingChatAction();

    // Assert
    expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
    // Assert removal based on implementation choice (currently NOT removed for unauthenticated)
    expect(localStorage.removeItem).not.toHaveBeenCalled(); 
    expect(api.post).not.toHaveBeenCalled();
    expect(useAiStore.getState().aiError).toContain('Authentication required');
    expect(useAiStore.getState().currentChatMessages).toEqual([]); // No optimistic message
  });

  it('should replay action successfully, update state optimistically, and finalize on API success', async () => {
    // Arrange
    const mockUserId = 'user-123';
    const mockToken = 'mock-auth-token';
    const pendingChatAction: PendingAction = {
      endpoint: 'chat',
      method: 'POST',
      body: { message: 'Hello from pending action', providerId: 'p1', promptId: 'pr1', chatId: null },
      returnPath: '/chat'
    };
    const mockAssistantResponse: ChatMessage = {
      id: 'assistant-msg-1',
      chat_id: 'new-chat-id-from-replay',
      user_id: null, // Assistant
      role: 'assistant',
      content: 'Hi! I am the replayed response.',
      ai_provider_id: 'p1',
      system_prompt_id: 'pr1',
      token_usage: { total: 10 },
      created_at: new Date().toISOString(),
      // status: 'sent' 
      // Add status if the type requires it, otherwise it's implicit
    };

    localStorage.setItem('pendingAction', JSON.stringify(pendingChatAction));
    (useAuthStore.getState as vi.Mock).mockReturnValue({ 
        session: { access_token: mockToken }, 
        user: { id: mockUserId } 
    });
    const mockedApiPost = vi.mocked(api.post).mockResolvedValue({ 
        status: 200, 
        data: mockAssistantResponse 
    });
    
    const store = useAiStore.getState();

    // Act
    await store.checkAndReplayPendingChatAction();

    // Assert
    // 1. LocalStorage checks
    expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
    expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction'); // Should be removed AFTER validation

    // 3. API call
    expect(mockedApiPost).toHaveBeenCalledOnce();
    expect(mockedApiPost).toHaveBeenCalledWith(
      '/chat', 
      pendingChatAction.body, // Ensure body matches the pending action
      { token: mockToken } // Ensure correct token is passed
    );
    
    // 4. Final state update assertions (check final state directly)
    const finalState = useAiStore.getState();
    expect(finalState.isLoadingAiResponse).toBe(false);
    expect(finalState.aiError).toBeNull();
    expect(finalState.currentChatMessages).toHaveLength(2);
    // User message updated
    const finalUserMessage = finalState.currentChatMessages.find(m => m.role === 'user');
    expect(finalUserMessage).toBeDefined();
    // expect(finalUserMessage!.id).toEqual(optimisticMessageId); // Cannot easily get temp ID now
    expect(finalUserMessage!.content).toEqual(pendingChatAction.body!.message); // Check content
    expect(finalUserMessage!.status).toEqual('sent');
    expect(finalUserMessage!.chat_id).toEqual(mockAssistantResponse.chat_id);
    // Assistant message added
    const finalAssistantMessage = finalState.currentChatMessages.find(m => m.role === 'assistant');
    expect(finalAssistantMessage).toEqual(mockAssistantResponse);
    // Current Chat ID updated
    expect(finalState.currentChatId).toEqual(mockAssistantResponse.chat_id);
  });

  it('should update message status to error if API call fails', async () => {
    // Arrange
    const mockUserId = 'user-456';
    const mockToken = 'mock-auth-token-error';
    const MOCK_CHAT_ID = 'existing-chat-id-error'; // Assume replay targets an existing chat
    const pendingChatAction: PendingAction = { // Define the action here
      endpoint: 'chat',
      method: 'POST',
      body: { message: 'Hello from error case', providerId: 'p-error', promptId: 'pr-error', chatId: MOCK_CHAT_ID },
      returnPath: '/chat/existing-chat-id-error'
    };
    const mockError = new Error('API Failed');
    localStorage.setItem('pendingAction', JSON.stringify(pendingChatAction));
    vi.mocked(useAuthStore.getState).mockReturnValue({
      // ...mockAuthStoreState, // Remove potential conflict if mockAuthStoreState is not defined here
      session: { access_token: mockToken }, 
      user: { id: mockUserId }
      // navigate: vi.fn() // Mock navigate if needed
    });
    vi.mocked(api.post).mockRejectedValue(mockError);
    const tempId = 'temp-replay-1745524037840';
    vi.spyOn(Date, 'now').mockReturnValue(1745524037840); // For tempId generation

    // Pre-seed state with the target chat and the initial user message (as if sent normally)
    // This makes the optimistic update easier to track
    useAiStore.setState({ 
      currentChatId: MOCK_CHAT_ID,
      currentChatMessages: [
        {
          id: tempId, // Initial message added by normal sendMessage
          role: 'user',
          content: pendingChatAction.body!.message,
          chat_id: MOCK_CHAT_ID,
          user_id: mockUserId,
          status: 'pending', // Assume it starts as pending before replay error
          created_at: new Date(1745524037840).toISOString(), // Match tempId generation
        }
      ],
      isLoadingAiResponse: true // Reflects state after sendMessage starts
    });

    // Act
    await useAiStore.getState().checkAndReplayPendingChatAction();

    // Assert Final State
    const finalState = useAiStore.getState();
    expect(finalState.currentChatId).toEqual(MOCK_CHAT_ID);
    expect(finalState.currentChatMessages).toHaveLength(1); // Should still only have the user message
    const userMessage = finalState.currentChatMessages[0];
    expect(userMessage.id).toEqual(tempId);
    expect(userMessage.content).toEqual(pendingChatAction.body!.message);
    expect(userMessage.status).toEqual('error'); // <<< This is the key assertion
    expect(userMessage.chat_id).toEqual(MOCK_CHAT_ID);
    expect(finalState.isLoadingAiResponse).toBe(false); // Should reset loading
    expect(finalState.aiError).toBeNull(); // Action itself didn't fail, the API call did

    // Assert Mocks
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      '/chat',
      pendingChatAction.body,
      { token: mockToken }
    );
    expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');
  });

  // --- TODO: Add tests for failed replay (API error) ---
  // - Test optimistic UI update
  // - Test api.post call
  // - Test state update on failure

}); 