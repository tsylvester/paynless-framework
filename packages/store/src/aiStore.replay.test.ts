import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore } from './aiStore'; // Adjust path as needed
import { useAuthStore } from './authStore'; // Adjust path as needed
// Import the actual AiApiClient class
import { AiApiClient, api as baseApi, AuthRequiredError } from '@paynless/api'; // Import base api object too
// Import the shared mock factory and reset function
import { createMockAiApiClient, resetMockAiApiClient } from '@paynless/api/mocks/ai.api.mock';
import type { PendingAction, ChatMessage, Session, User, ApiResponse, UserRole, AuthStore } from '@paynless/types';
import { create } from 'zustand'; // Import create
import 'vitest-localstorage-mock'; // <-- Add this import

// --- Create an instance of the shared mock ---
const mockAiApi = createMockAiApiClient();

// --- Mock navigate function ---
const navigateMock = vi.fn();

// Mock dependencies
// Mock the entire @paynless/api module
vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actualApiModule,
        AiApiClient: vi.fn(() => mockAiApi),
        AuthRequiredError: actualApiModule.AuthRequiredError,
        api: { 
            ...actualApiModule.api, // Keep other parts if needed
            ai: () => mockAiApi, 
            // Mock base HTTP methods if they are called directly by the store
            // (replay action uses `api.post` directly, not `api.ai().sendChatMessage`)
            post: vi.fn(), // IMPORTANT: Mock the base api.post
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
        initializeApiClient: vi.fn(), 
        _resetApiClient: vi.fn(),
        getApiClient: vi.fn(() => ({ // Mock the base ApiClient if needed
            ai: () => mockAiApi, 
            // Ensure base methods are available if getApiClient is used
            post: vi.fn(), 
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            // Add mocks for other clients if needed by aiStore
            organizations: vi.fn(), 
            notifications: vi.fn(), 
        })) 
    };
});

vi.mock('./authStore');

// Helper to define mock auth state with required fields
const mockAuthSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expiresAt: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  expires_in: 3600,
};
const mockAuthUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'authenticated' as UserRole,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let mockInitialAuthState: AuthStore;
try {
    // Temporarily create a dummy store to get initial state/actions shape
    const dummyAuthStore = create<AuthStore>(() => ({
        user: null, session: null, profile: null, isLoading: true, error: null, navigate: null,
        setUser: vi.fn(), setSession: vi.fn(), setProfile: vi.fn(), setIsLoading: vi.fn(),
        setError: vi.fn(), setNavigate: vi.fn(), login: vi.fn(), register: vi.fn(),
        logout: vi.fn(), updateProfile: vi.fn(), updateEmail: vi.fn(), clearError: vi.fn(),
    }));
    mockInitialAuthState = dummyAuthStore.getState();
} catch (e) {
  console.warn("Could not automatically get initial AuthStore state for mocking. Using fallback.");
  mockInitialAuthState = {
    user: null, session: null, profile: null, isLoading: true, error: null, navigate: null,
    setUser: vi.fn(), setSession: vi.fn(), setProfile: vi.fn(), setIsLoading: vi.fn(),
    setError: vi.fn(), setNavigate: vi.fn(), login: vi.fn(), register: vi.fn(), 
    logout: vi.fn(), updateProfile: vi.fn(), updateEmail: vi.fn(), clearError: vi.fn(),
  } as unknown as AuthStore; 
}

// Helper to reset store before each test
const resetStore = () => {
    useAiStore.setState(useAiStore.getInitialState(), true);
    // Reset the shared Ai API mock
    resetMockAiApiClient(mockAiApi);
    // Reset the base api.post mock (used by replay)
    vi.mocked(baseApi.post).mockClear(); // Use the imported baseApi
    vi.mocked(baseApi.get).mockClear();
    // Clear authStore mock calls
    vi.mocked(useAuthStore.getState).mockClear();
    navigateMock.mockClear(); // Clear the navigate mock
    // Reset authStore mock state, including the mocked navigate function
    vi.mocked(useAuthStore.getState).mockReturnValue({
        ...mockInitialAuthState,
        session: null,
        user: null,
        navigate: navigateMock // Provide the mock navigate function
    });
};

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  // localStorage cleanup is handled by vitest-localstorage-mock
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
    expect(baseApi.post).not.toHaveBeenCalled(); // Use baseApi mock
    expect(useAiStore.getState()).toEqual(initialState); 
  });

  it('should do nothing if pendingAction is not a chat POST action', async () => {
    // Arrange
    const nonChatAction: PendingAction = {
        endpoint: 'profile', 
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
    expect(baseApi.post).not.toHaveBeenCalled(); // Use baseApi mock
    expect(useAiStore.getState()).toEqual(initialState); 
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
    vi.mocked(useAuthStore.getState).mockReturnValue({ 
        ...mockInitialAuthState,
        session: null, 
        user: null 
    }); 
    const store = useAiStore.getState();

    // Act
    await store.checkAndReplayPendingChatAction();

    // Assert
    expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
    expect(baseApi.post).not.toHaveBeenCalled(); // Use baseApi mock
    expect(useAiStore.getState().aiError).toBe('Authentication required to replay pending action.');
    expect(useAiStore.getState().currentChatMessages).toEqual([]); 
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
      user_id: null,
      role: 'assistant',
      content: 'Hi! I am the replayed response.',
      ai_provider_id: 'p1',
      system_prompt_id: 'pr1',
      token_usage: { total: 10 },
      created_at: new Date().toISOString(),
    };

    localStorage.setItem('pendingAction', JSON.stringify(pendingChatAction));

    vi.mocked(useAuthStore.getState).mockReturnValue({ 
        ...mockInitialAuthState,
        session: { ...mockAuthSession, access_token: mockToken }, 
        user: mockAuthUser,
        navigate: null
    });

    let resolveApiPost: (value: ApiResponse<ChatMessage>) => void;
    const apiPostPromise = new Promise<ApiResponse<ChatMessage>>((resolve) => {
        resolveApiPost = resolve;
    });
    // Mock the base api.post used by replay
    const mockedBaseApiPost = vi.mocked(baseApi.post).mockReturnValue(apiPostPromise);
    
    const store = useAiStore.getState();
    const setSpy = vi.spyOn(useAiStore, 'setState');
    
    // Act
    const replayPromise = store.checkAndReplayPendingChatAction();

    // --- Assertions DURING pending state ---
    expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
    expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction'); 
    
    const optimisticState = useAiStore.getState();
    expect(optimisticState.isLoadingAiResponse).toBe(true);
    expect(optimisticState.currentChatMessages).toHaveLength(1);
    const optimisticUserMessage = optimisticState.currentChatMessages[0];
    expect(optimisticUserMessage).toBeDefined();
    expect(optimisticUserMessage.role).toBe('user');
    expect(optimisticUserMessage.content).toBe(pendingChatAction.body!.message);
    expect(optimisticUserMessage.status).toBe('pending'); 
    expect(optimisticUserMessage.id).toMatch(/^temp-user-/); 

    // Ensure base API was called
    expect(mockedBaseApiPost).toHaveBeenCalledOnce();
    expect(mockedBaseApiPost).toHaveBeenCalledWith('/chat', pendingChatAction.body!, { token: mockToken });

    // --- Resolve the API call ---
    resolveApiPost!({ data: mockAssistantResponse, error: null });
    await replayPromise; // Wait for the action to complete

    // --- Assertions AFTER API success ---
    const finalState = useAiStore.getState();
    expect(finalState.isLoadingAiResponse).toBe(false);
    expect(finalState.aiError).toBeNull();
    expect(finalState.currentChatMessages).toHaveLength(2);
    
    const finalUserMessage = finalState.currentChatMessages.find(m => m.role === 'user');
    expect(finalUserMessage).toBeDefined();
    expect(finalUserMessage!.id).toBe(optimisticUserMessage.id); 
    expect(finalUserMessage!.content).toEqual(pendingChatAction.body!.message);
    expect(finalUserMessage!.status).toEqual('sent'); 
    expect(finalUserMessage!.chat_id).toEqual(mockAssistantResponse.chat_id);
    
    const finalAssistantMessage = finalState.currentChatMessages.find(m => m.role === 'assistant');
    expect(finalAssistantMessage).toEqual(mockAssistantResponse);
    
    expect(finalState.currentChatId).toEqual(mockAssistantResponse.chat_id);

    setSpy.mockRestore(); 
  });

  it('should handle API failure during replay, keeping optimistic message with error status', async () => {
      // Arrange
      const mockToken = 'mock-auth-token-fail';
      const pendingChatAction: PendingAction = {
        endpoint: 'chat',
        method: 'POST',
        body: { message: 'This replay will fail', providerId: 'p2', promptId: 'pr2', chatId: null },
        returnPath: '/chat-fail'
      };
      const apiError: ApiResponse<ChatMessage> = {
          data: null,
          error: { message: 'AI failed to respond', code: 'AI_ERROR' }
      };

      localStorage.setItem('pendingAction', JSON.stringify(pendingChatAction));
      vi.mocked(useAuthStore.getState).mockReturnValue({
          ...mockInitialAuthState,
          session: { ...mockAuthSession, access_token: mockToken },
          user: mockAuthUser,
          navigate: navigateMock // Ensure navigate is mocked here too
      });
      // Mock the base api.post to return an error
      const mockedBaseApiPost = vi.mocked(baseApi.post).mockResolvedValue(apiError);
      const store = useAiStore.getState();

      // Act
      await store.checkAndReplayPendingChatAction();

      // Assert
      expect(localStorage.getItem).toHaveBeenCalledWith('pendingAction');
      expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');
      expect(mockedBaseApiPost).toHaveBeenCalledWith('/chat', pendingChatAction.body!, { token: mockToken });

      const finalState = useAiStore.getState();
      expect(finalState.isLoadingAiResponse).toBe(false); // Loading finished
      expect(finalState.aiError).toBe(apiError.error!.message); // Error message set
      expect(finalState.currentChatMessages).toHaveLength(1); // Only the user message remains

      const failedUserMessage = finalState.currentChatMessages[0];
      expect(failedUserMessage.role).toBe('user');
      expect(failedUserMessage.content).toBe(pendingChatAction.body!.message);
      expect(failedUserMessage.status).toBe('error'); // <<< Status updated to error
      expect(failedUserMessage.id).toMatch(/^temp-user-/);
  });

    // Test case for AuthRequiredError during replay
    it('should handle AuthRequiredError during replay and redirect', async () => {
        // Arrange
        const mockToken = 'mock-auth-token-auth-error';
        const pendingChatAction: PendingAction = {
          endpoint: 'chat',
          method: 'POST',
          body: { message: 'Auth required test', providerId: 'p1', promptId: 'pr1', chatId: null },
          returnPath: '/chat-auth-fail'
        };
        localStorage.setItem('pendingAction', JSON.stringify(pendingChatAction));

        // Ensure AuthStore mock returns the token AND the navigate function
        vi.mocked(useAuthStore.getState).mockReturnValue({
            ...mockInitialAuthState,
            session: { ...mockAuthSession, access_token: mockToken },
            user: mockAuthUser,
            navigate: navigateMock // Provide the mock navigate function
        });

        // Mock baseApi.post to reject with an AuthRequiredError instance
        const simulatedAuthError = new AuthRequiredError('Session expired during replay');
        const mockedBaseApiPost = vi.mocked(baseApi.post).mockRejectedValue(simulatedAuthError);
        const store = useAiStore.getState();

        // Act
        await store.checkAndReplayPendingChatAction();

        // Assert
        // Verify API was called (even though it rejects)
        expect(mockedBaseApiPost).toHaveBeenCalledOnce();
        expect(mockedBaseApiPost).toHaveBeenCalledWith('/chat', pendingChatAction.body!, { token: mockToken });

        const finalState = useAiStore.getState();
        expect(finalState.isLoadingAiResponse).toBe(false); // Loading should stop

        // State update should NOT clear the message but might set an error
        // if navigation fails (which it won't in this mocked scenario).
        // Let's check the optimistic message remains.
        expect(finalState.currentChatMessages).toHaveLength(1); // Optimistic message should remain
        expect(finalState.currentChatMessages[0].status).toBe('pending'); // Status should remain pending

        // Verify localStorage WAS NOT cleared because auth failed
        expect(localStorage.removeItem).not.toHaveBeenCalledWith('pendingAction');

        // Verify navigation was called by the auth handler
        expect(navigateMock).toHaveBeenCalledTimes(1);
        // Ensure it redirects to the login page, preserving the intended return path
        expect(navigateMock).toHaveBeenCalledWith('login'); // The logic in aiStore calls navigate('login')
    });


}); // End describe block 