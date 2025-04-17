import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AiChatPage as AiChat } from '@/pages/AiChat' // Adjust path & use correct component name
import { useAuthStore, useAiStore } from '@paynless/store'
import { analytics } from '@paynless/analytics-client'
import { BrowserRouter } from 'react-router-dom' // Needed for Layout/Links
import type { Chat } from '@paynless/types'; // Import Chat type

// Mock the stores
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useAiStore: vi.fn(),
}))

// Mock analytics
vi.mock('@paynless/analytics-client', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}))

// --- Define mocks inline within the factory function --- 
vi.mock('@/components/ai/ModelSelector', () => ({
  ModelSelector: vi.fn(({ onProviderChange }) => (
    <div data-testid="model-selector-mock" onClick={() => onProviderChange('p2')}>ModelSelector Mock</div>
  ))
}))
vi.mock('@/components/ai/PromptSelector', () => ({
  PromptSelector: vi.fn(({ onPromptChange }) => (
    <div data-testid="prompt-selector-mock" onClick={() => onPromptChange('s2')}>PromptSelector Mock</div>
  ))
}))
vi.mock('@/components/ai/AiChatbox', () => ({
  AiChatbox: vi.fn(() => <div data-testid="ai-chatbox-mock">AiChatbox Mock</div>)
}))
vi.mock('@/components/layout/Layout', () => ({ 
    Layout: vi.fn(({ children }: { children: React.ReactNode }) => <div data-testid="layout-mock">{children}</div>) 
}))

// Keep refs to mock STORE functions
let mockLoadAiConfig: vi.Mock
let mockLoadChatHistory: vi.Mock
let mockLoadChatDetails: vi.Mock 
let mockStartNewChat: vi.Mock
let mockAnalyticsTrack: vi.Mock

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('AiChat Page', () => {
  const mockChatHistory: Chat[] = [
    { id: 'chat1', user_id: 'test-user', title: 'Chat 1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'chat2', user_id: 'test-user', title: 'Chat 2', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];

  // Helper to setup default store mocks
  const setupStoreMocks = (authState: any = {}, aiState: any = {}) => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'test-user', email: 'test@test.com' }, 
      isLoading: false,
      ...authState,
    })
    vi.mocked(useAiStore).mockReturnValue({
      loadAiConfig: mockLoadAiConfig,
      loadChatHistory: mockLoadChatHistory,
      loadChatDetails: mockLoadChatDetails, 
      startNewChat: mockStartNewChat,
      chatHistoryList: mockChatHistory, 
      isHistoryLoading: false,
      currentChatId: null,
      availableProviders: [{ id: 'p1', name: 'Provider 1' }], 
      availablePrompts: [{ id: 's1', name: 'Prompt 1' }],   
      currentChatMessages: [],
      isLoadingAiResponse: false,
      isConfigLoading: false,
      isDetailsLoading: false,
      aiError: null,
      sendMessage: vi.fn(),
      clearAiError: vi.fn(),
      ...aiState,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear(); // Clear local storage mock

    mockLoadAiConfig = vi.fn()
    mockLoadChatHistory = vi.fn()
    mockLoadChatDetails = vi.fn() 
    mockStartNewChat = vi.fn()
    mockAnalyticsTrack = vi.mocked(analytics.track)
    
    // Setup default mocks before each test
    setupStoreMocks();
  })

  it('should render the basic layout and components', () => {
    render(<AiChat />, { wrapper: BrowserRouter })
    expect(screen.getByTestId('layout-mock')).toBeInTheDocument()
    expect(screen.getByText('AI Chat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument()
    expect(screen.getByText('Chat History')).toBeInTheDocument()
    expect(screen.getByText('ModelSelector Mock')).toBeInTheDocument()
    expect(screen.getByText('PromptSelector Mock')).toBeInTheDocument()
    expect(screen.getByText('AiChatbox Mock')).toBeInTheDocument()
  })

  it('should call startNewChat and analytics.track when "New Chat" button is clicked', async () => {
    render(<AiChat />, { wrapper: BrowserRouter })
    
    const newChatButton = screen.getByRole('button', { name: /new chat/i })
    
    await fireEvent.click(newChatButton)

    // Verify startNewChat store action was called
    expect(mockStartNewChat).toHaveBeenCalledTimes(1)
    
    // Verify analytics track was called
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Clicked New Chat')
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1)
  })

  it('should call loadChatDetails and analytics.track when a chat history item is clicked', async () => {
    render(<AiChat />, { wrapper: BrowserRouter })

    // Find the first chat history item (e.g., by its title or role)
    const chatHistoryItem = screen.getByRole('button', { name: /Chat 1/i });
    expect(chatHistoryItem).toBeInTheDocument();

    // Click the item
    await fireEvent.click(chatHistoryItem);

    // Verify loadChatDetails store action was called
    expect(mockLoadChatDetails).toHaveBeenCalledTimes(1);
    expect(mockLoadChatDetails).toHaveBeenCalledWith('chat1'); // Check it's called with the correct ID
    
    // Verify analytics track was called
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: History Item Selected', { chatId: 'chat1' });
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
  });

  it('should call analytics.track when provider is changed', async () => {
    render(<AiChat />, { wrapper: BrowserRouter });

    // Find the mock selector via its test id
    const modelSelector = screen.getByTestId('model-selector-mock');

    // Simulate the component calling onProviderChange (via clicking the mock div)
    await fireEvent.click(modelSelector);

    // Assert analytics track was called
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Provider Selected', { providerId: 'p2' });
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
  });

  it('should call analytics.track when prompt is changed', async () => {
    render(<AiChat />, { wrapper: BrowserRouter });

    // Find the mock selector via its test id
    const promptSelector = screen.getByTestId('prompt-selector-mock');

    // Simulate the component calling onPromptChange
    await fireEvent.click(promptSelector);

    // Assert analytics track was called
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Chat: Prompt Selected', { promptId: 's2' });
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
  });

  // --- New Tests --- 

  it('should show history loading message when isAuthLoading is true', () => {
    setupStoreMocks({ isLoading: true }, { chatHistoryList: [] }); // Auth loading, no history yet
    render(<AiChat />, { wrapper: BrowserRouter });
    expect(screen.getByText(/loading chat history.../i)).toBeInTheDocument();
    expect(mockLoadChatHistory).not.toHaveBeenCalled(); // Should wait for auth
  });

  it('should show history loading message when isHistoryLoading is true', () => {
    setupStoreMocks({}, { isHistoryLoading: true, chatHistoryList: [] }); // AI Store loading history
    render(<AiChat />, { wrapper: BrowserRouter });
    expect(screen.getByText(/loading chat history.../i)).toBeInTheDocument();
  });

  it('should call loadChatHistory when auth is finished and user exists', () => {
    // Initial render with auth loading
    setupStoreMocks({ isLoading: true });
    const { rerender } = render(<AiChat />, { wrapper: BrowserRouter });
    expect(mockLoadChatHistory).not.toHaveBeenCalled();

    // Rerender with auth finished and user present
    setupStoreMocks({ isLoading: false, user: { id: 'test-user' } });
    rerender(<AiChat />);
    
    // Expect history to be loaded now (might need waitFor if async issues)
    expect(mockLoadChatHistory).toHaveBeenCalledTimes(1);
  });

  it('should NOT call loadChatHistory when auth is finished but user is null', () => {
    setupStoreMocks({ isLoading: true, user: null });
    const { rerender } = render(<AiChat />, { wrapper: BrowserRouter });
    expect(mockLoadChatHistory).not.toHaveBeenCalled();

    setupStoreMocks({ isLoading: false, user: null });
    rerender(<AiChat />);
    expect(mockLoadChatHistory).not.toHaveBeenCalled();
  });

  it('should show "No chat history" message when list is empty after loading', () => {
    setupStoreMocks({}, { chatHistoryList: [], isHistoryLoading: false });
    render(<AiChat />, { wrapper: BrowserRouter });
    expect(screen.getByText(/no chat history found/i)).toBeInTheDocument();
  });

  it('should call loadChatDetails and clear localStorage when chatIdToLoad is present', () => {
    const chatId = 'redirect-chat-123';
    localStorageMock.setItem('loadChatIdOnRedirect', chatId);
    
    render(<AiChat />, { wrapper: BrowserRouter });

    expect(localStorageMock.getItem).toHaveBeenCalledWith('loadChatIdOnRedirect');
    expect(mockLoadChatDetails).toHaveBeenCalledWith(chatId);
    expect(mockLoadChatDetails).toHaveBeenCalledTimes(1);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('loadChatIdOnRedirect');
  });

  it('should NOT call loadChatDetails when chatIdToLoad is absent', () => {
    render(<AiChat />, { wrapper: BrowserRouter });
    expect(localStorageMock.getItem).toHaveBeenCalledWith('loadChatIdOnRedirect');
    expect(mockLoadChatDetails).not.toHaveBeenCalled();
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });

}) 