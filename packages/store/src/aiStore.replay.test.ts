import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore } from './aiStore'; // Adjust path as needed
import { useAuthStore } from './authStore'; // Adjust path as needed
// Import the actual AiApiClient class AND getApiClient
import { AiApiClient, api as baseApi, AuthRequiredError, getApiClient } from '@paynless/api'; // <<< Import getApiClient
// +++ Import the module itself for direct mocking +++
import * as apiModule from '@paynless/api';
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
    // +++ Define Mock Error Class INSIDE the factory +++
    class MockAuthRequiredError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'AuthRequiredError'; 
        }
    }
    // +++ End Mock Error Class Definition +++

    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actualApiModule, // Spread original module first
        // --- Overwrite specific parts ---
        AiApiClient: vi.fn(() => mockAiApi),
        AuthRequiredError: MockAuthRequiredError, 
        api: { 
            ...actualApiModule.api, 
            post: vi.fn(),
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            ai: () => mockAiApi,
        },
        // <<< Mock the getApiClient EXPORTED FUNCTION >>>
        getApiClient: vi.fn(() => ({ 
            post: vi.fn(), 
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            ai: () => mockAiApi, 
            organizations: vi.fn(), 
            notifications: vi.fn(), 
        })), 
        initializeApiClient: vi.fn(), 
        _resetApiClient: vi.fn(),
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
    resetMockAiApiClient(mockAiApi);
    
    // +++ Reset the mocked getApiClient FUNCTION +++
    const getApiClientMock = vi.mocked(getApiClient); // <<< Mock the imported function
    // If getApiClient has been called, reset the mocks on its *return value*
    if (getApiClientMock.mock.results[0]?.value) {
        const mockApiClientInstance = getApiClientMock.mock.results[0].value;
        vi.mocked(mockApiClientInstance.post).mockClear();
        vi.mocked(mockApiClientInstance.get).mockClear();
        vi.mocked(mockApiClientInstance.put).mockClear();
        vi.mocked(mockApiClientInstance.delete).mockClear();
    }
    getApiClientMock.mockClear(); // Clear calls to getApiClient itself
    // +++ End Reset +++

    // Reset base api mocks if they are used directly elsewhere
    vi.mocked(baseApi.post).mockClear(); 
    vi.mocked(baseApi.get).mockClear();

    // +++ Clear localStorage mocks +++
    vi.mocked(localStorage.getItem).mockClear();
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.removeItem).mockClear();
    // +++ End localStorage mock clear +++

    vi.mocked(useAuthStore.getState).mockClear();
    navigateMock.mockClear();
    vi.mocked(useAuthStore.getState).mockReturnValue({
        ...mockInitialAuthState,
        session: null,
        user: null,
        navigate: navigateMock
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

    // <<< ADD Check: localStorage.removeItem called AFTER success >>>
    expect(localStorage.removeItem).toHaveBeenCalledWith('pendingAction');

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
      // <<< CHANGE Check: localStorage.removeItem should NOT be called on failure >>>
      expect(localStorage.removeItem).toHaveBeenCalledTimes(0);
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

        vi.mocked(useAuthStore.getState).mockReturnValue({
            ...mockInitialAuthState,
            session: { ...mockAuthSession, access_token: mockToken },
            user: mockAuthUser,
            navigate: navigateMock
        });

        // +++ Mock the API call directly for this test +++
        const simulatedAuthError = new AuthRequiredError('Session expired during replay');
        // Mock the specific API call method expected to be used by checkAndReplayPendingChatAction
        // We need to access the 'api' export from the mocked module.
        const apiPostMock = vi.spyOn(apiModule.api, 'post').mockRejectedValue(simulatedAuthError);
        // +++ End Mocking +++

        const store = useAiStore.getState();

        // Act
        await store.checkAndReplayPendingChatAction();

        // Assert
        // Verify the specific API post method was called
        expect(apiPostMock).toHaveBeenCalledOnce(); 
        expect(apiPostMock).toHaveBeenCalledWith('/chat', pendingChatAction.body!, { token: mockToken });

        const finalState = useAiStore.getState();
        expect(finalState.isLoadingAiResponse).toBe(false);
        expect(finalState.currentChatMessages).toHaveLength(1);
        expect(finalState.currentChatMessages[0].status).toBe('pending'); 
        expect(localStorage.removeItem).toHaveBeenCalledTimes(0);
    });


}); // End describe block 