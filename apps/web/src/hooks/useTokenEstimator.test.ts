import { renderHook, act } from '@testing-library/react-hooks';
import { waitFor } from '@testing-library/react';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { useAiStore } from '../../../../packages/store/src/aiStore.ts';
import { useTokenEstimator } from './useTokenEstimator.ts';
import { ChatMessage, AiProvider, AiModelExtendedConfig, Json, SystemPrompt, TokenEstimationResponse } from '@paynless/types';

// Create the mock function first
const mockEstimateTokens = vi.fn();

// Mock the API module with proper setup
vi.mock('@paynless/api', () => ({
  api: {
    ai: () => ({
      estimateTokens: mockEstimateTokens,
    }),
  },
}));

// Mock useAiStore with Vitest
vi.mock('../../../../packages/store/src/aiStore', () => ({
  useAiStore: vi.fn(),
}));

// Mock useAuthStore to provide authentication token
vi.mock('../../../../packages/store/src/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: { access_token: 'mock-auth-token' }
    })
  }
}));

const mockUseAiStore = vi.mocked(useAiStore);

// Define MOCK_MODEL_CONFIG and MOCK_AI_PROVIDER
const MOCK_MODEL_CONFIG_CHATML: AiModelExtendedConfig = {
  input_token_cost_rate: 1,
  output_token_cost_rate: 1,
  hard_cap_output_tokens: 2048,
  context_window_tokens: 4096,
  tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base', is_chatml_model: true },
};

const MOCK_MODEL_CONFIG_STRING: AiModelExtendedConfig = {
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
    hard_cap_output_tokens: 2048,
    context_window_tokens: 4096,
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base', is_chatml_model: false }, // is_chatml_model: false
  };

// Use a more specific provider mock that includes the config we want to test with
const MOCK_AI_PROVIDER_CHATML: AiProvider = {
  id: 'test-provider-uuid-chatml',
  name: 'Test ChatML Provider',
  api_identifier: 'test-model-api-id-chatml',
  description: 'A test ChatML provider',
  is_active: true,
  config: MOCK_MODEL_CONFIG_CHATML as unknown as Json,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  provider: 'openai',
  is_enabled: true, 
};

const MOCK_AI_PROVIDER_STRING: AiProvider = {
    id: 'test-provider-uuid-string',
    name: 'Test String Provider',
    api_identifier: 'test-model-api-id-string',
    description: 'A test string provider',
    is_active: true,
    config: MOCK_MODEL_CONFIG_STRING as unknown as Json,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    provider: 'openai',
    is_enabled: true, 
  };

const MOCK_SYSTEM_PROMPT_1: SystemPrompt = {
  id: 'system-prompt-uuid-1',
  name: 'Test System Prompt 1',
  prompt_text: 'You are a helpful assistant.', // Tiktoken: ['You', 'are', 'a', 'helpful', 'assistant', '.'] = 6 tokens. ChatML adds ~4 more.
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: 'A test system prompt',  
  version: 1,
};

// Helper to create mock ChatMessage
const createMockChatMessage = (id: string, content: string, role: 'user' | 'assistant', createdAt: string, chatId = 'chat1'): ChatMessage => ({
  id,
  chat_id: chatId,
  content,
  role,
  created_at: new Date(createdAt).toISOString(),
  updated_at: new Date(createdAt).toISOString(),
  user_id: role === 'user' ? 'user1' : null,
  ai_provider_id: null,
  system_prompt_id: null,
  token_usage: null,
  is_active_in_thread: true,
  error_type: null,
  response_to_message_id: null,
});

describe('useTokenEstimator', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUseAiStore.mockReset(); 
    mockEstimateTokens.mockReset();
    
    // Set up default successful API response (will be overridden by individual tests)
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 0 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
  });

  // Updated getDefaultAiStoreState
  const getDefaultAiStoreState = (
    messages: ChatMessage[] = [],
    selectedMessages: { [messageId: string]: boolean } = {},
    currentChatId = 'chat1',
    selectedPromptId: string | null = null, // New
    availablePrompts: SystemPrompt[] = [],  // New
    provider: AiProvider = MOCK_AI_PROVIDER_CHATML // Default to ChatML provider
  ) => ({
    currentChatId,
    messagesByChatId: { [currentChatId]: messages },
    selectedMessagesMap: { [currentChatId]: selectedMessages },
    selectedProviderId: provider.id,
    availableProviders: [provider],
    selectedPromptId,                      
    availablePrompts,                      
  });

  it('should return 0 tokens for empty input and no selected messages', async () => {
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    const { result } = renderHook(() => useTokenEstimator(''));
    
    // Initial state
    expect(result.current.estimatedTokens).toBe(0);
    expect(result.current.isLoading).toBe(false);
    
    // Should remain 0 and not load, as no API call is made for empty input
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
    
    // Verify no API call was made
    expect(mockEstimateTokens).not.toHaveBeenCalled();
  });

  it('should return estimated tokens for user input only, showing loading state', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 2 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    
    const { result } = renderHook(() => useTokenEstimator('Hello world'));
    
    // After the hook runs, it should be in a loading state
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
    
    // After the API call resolves, it should update tokens and stop loading
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(2);
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(mockEstimateTokens).toHaveBeenCalledWith({
      textOrMessages: [{ role: 'user', content: 'Hello world' }],
      modelConfig: MOCK_MODEL_CONFIG_CHATML
    }, 'mock-auth-token');
  });

  it('should return estimated tokens for one selected message and no user input', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 2 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    const messages = [createMockChatMessage('msg1', 'Hi there', 'user', '2023-01-01T10:00:00Z')];
    const selected = { 'msg1': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    
    const { result } = renderHook(() => useTokenEstimator(''));
    
    // Check loading and final states
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(2);
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(mockEstimateTokens).toHaveBeenCalledWith({
      textOrMessages: [{ role: 'user', content: 'Hi there' }],
      modelConfig: MOCK_MODEL_CONFIG_CHATML
    }, 'mock-auth-token');
  });

  it('should combine user input and selected messages for estimation', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 5 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    const messages = [createMockChatMessage('msg1', 'Hi there', 'user', '2023-01-01T10:00:00Z')];
    const selected = { 'msg1': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    
    const { result } = renderHook(() => useTokenEstimator('Hello world'));
    
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(5);
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(mockEstimateTokens).toHaveBeenCalledWith({
      textOrMessages: [
        { role: 'user', content: 'Hi there' },
        { role: 'user', content: 'Hello world' }
      ],
      modelConfig: MOCK_MODEL_CONFIG_CHATML
    }, 'mock-auth-token');
  });

  it('should use the system prompt when one is selected', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 10 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });

    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState([], {}, 'chat1', MOCK_SYSTEM_PROMPT_1.id, [MOCK_SYSTEM_PROMPT_1])
    );
    
    const { result } = renderHook(() => useTokenEstimator('Hello world'));

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(10);
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockEstimateTokens).toHaveBeenCalledWith({
      textOrMessages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello world' }
      ],
      modelConfig: MOCK_MODEL_CONFIG_CHATML
    }, 'mock-auth-token');
  });

  it('should use string concatenation for non-ChatML models', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 15 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });

    const messages = [createMockChatMessage('msg1', 'Historic message', 'user', '2023-01-01T10:00:00Z')];
    const selected = { 'msg1': true };

    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(messages, selected, 'chat1', MOCK_SYSTEM_PROMPT_1.id, [MOCK_SYSTEM_PROMPT_1], MOCK_AI_PROVIDER_STRING)
    );
    
    const { result } = renderHook(() => useTokenEstimator('New message'));
    
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(15);
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockEstimateTokens).toHaveBeenCalledWith({
      textOrMessages: 'You are a helpful assistant.\nHistoric message\nNew message',
      modelConfig: MOCK_MODEL_CONFIG_STRING
    }, 'mock-auth-token');
  });

  it('should handle API errors gracefully and return a fallback estimate', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: null,
      error: { message: 'API failed' },
      status: 500
    });
    
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    
    const { result } = renderHook(() => useTokenEstimator('Hello world'));
    
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await waitFor(() => {
      // Fallback is ceil("Hello world".length / 4) = ceil(11/4) = 3
      expect(result.current.estimatedTokens).toBe(3);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should handle thrown exceptions gracefully and return a fallback estimate', async () => {
    mockEstimateTokens.mockRejectedValue(new Error('Network error'));
    
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    
    const { result } = renderHook(() => useTokenEstimator('Hello world'));
    
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await waitFor(() => {
      // Fallback is ceil("Hello world".length / 4) = ceil(11/4) = 3
      expect(result.current.estimatedTokens).toBe(3);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should combine user input and multiple selected messages in chronological order', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 21 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    const messages = [
      createMockChatMessage('msg1', 'First part', 'user', '2023-01-01T10:00:00Z'),
      createMockChatMessage('msg2', 'Second part', 'assistant', '2023-01-01T10:01:00Z'),
    ];
    const selected = { 'msg1': true, 'msg2': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('Another query'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(21);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should dynamically update when a message is selected', async () => {
    const msgA = createMockChatMessage('msgA', 'Alpha', 'user', '2023-01-01T10:00:00Z');
    const msgB = createMockChatMessage('msgB', 'Beta', 'user', '2023-01-01T10:01:00Z');
    const initialMessages = [msgA, msgB];
    const initialSelected = { 'msgA': true, 'msgB': false };
    
    const { result, rerender } = renderHook(() => useTokenEstimator('Test'));
    
    // Initial render
    act(() => {
      mockUseAiStore.mockReturnValue(getDefaultAiStoreState(initialMessages, initialSelected));
    });

    mockEstimateTokens.mockResolvedValueOnce({
      data: { estimatedTokens: 13 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });

    rerender();
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(13);
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate selecting MsgB
    const nextSelected = { 'msgA': true, 'msgB': true };
    act(() => {
      mockUseAiStore.mockReturnValue(getDefaultAiStoreState(initialMessages, nextSelected));
    });

    mockEstimateTokens.mockResolvedValueOnce({
      data: { estimatedTokens: 18 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });

    rerender();
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(18);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should dynamically update when a message is deselected', async () => {
    const msgA = createMockChatMessage('msgA', 'Alpha', 'user', '2023-01-01T10:00:00Z');
    const msgB = createMockChatMessage('msgB', 'Beta', 'user', '2023-01-01T10:01:00Z');
    const initialMessages = [msgA, msgB];
    const initialSelected = { 'msgA': true, 'msgB': true };
    
    const { result, rerender } = renderHook(() => useTokenEstimator('Test'));

    // Initial render
    act(() => {
      mockUseAiStore.mockReturnValue(getDefaultAiStoreState(initialMessages, initialSelected));
    });
    
    mockEstimateTokens.mockResolvedValueOnce({
      data: { estimatedTokens: 18 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });

    rerender();

    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(18);
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate deselecting MsgA
    const nextSelected = { 'msgA': false, 'msgB': true };
    act(() => {
      mockUseAiStore.mockReturnValue(getDefaultAiStoreState(initialMessages, nextSelected));
    });

    mockEstimateTokens.mockResolvedValueOnce({
      data: { estimatedTokens: 13 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });

    rerender();
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(13);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should estimate tokens for selected messages only if user input is empty', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 15 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    const messages = [
      createMockChatMessage('msg1', 'Content A', 'user', '2023-01-01T10:00:00Z'),
      createMockChatMessage('msg2', 'Content B', 'assistant', '2023-01-01T10:01:00Z'),
    ];
    const selected = { 'msg1': true, 'msg2': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator(''));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(15);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should estimate tokens for user input only if no messages are selected', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 10 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    const messages = [
      createMockChatMessage('msg1', 'Content A', 'user', '2023-01-01T10:00:00Z'),
    ];
    const selected = { 'msg1': false };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('User input here'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(10);
      expect(result.current.isLoading).toBe(false);
    });
  });
  
  it('should handle multiple messages with mixed selection states and ensure chronological order', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 20 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    const messages = [
      createMockChatMessage('msgOld', 'Oldest', 'user', '2023-01-01T09:00:00Z'),
      createMockChatMessage('msgSkip', 'Middle', 'user', '2023-01-01T10:00:00Z'),
      createMockChatMessage('msgNew', 'Newest', 'assistant', '2023-01-01T11:00:00Z'),
    ];
    const selected = { 'msgOld': true, 'msgNew': true, 'msgSkip': false };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('Input'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(20);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should return tokens for input only if no messages are loaded for the currentChatId', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 9 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    mockUseAiStore.mockReturnValue({
      currentChatId: 'chatWithNoMessages',
      messagesByChatId: {}, 
      selectedMessagesMap: {},
      selectedProviderId: MOCK_AI_PROVIDER_CHATML.id,
      availableProviders: [MOCK_AI_PROVIDER_CHATML],
      selectedPromptId: null,
      availablePrompts: [],
    });
    const { result } = renderHook(() => useTokenEstimator('Some input'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(9);
      expect(result.current.isLoading).toBe(false);
    });
  });
  
  it('should return 0 tokens for empty input when currentChatId has no messages in selectedMessagesMap or messagesByChatId is empty for it', () => {
    mockUseAiStore.mockReturnValue({
      currentChatId: 'chat1',
      messagesByChatId: { 'chat1': [createMockChatMessage('m1', 'Exists', 'user', '2023-01-01T09:00:00Z')] },
      selectedMessagesMap: { 'chat1': {} },
      selectedProviderId: MOCK_AI_PROVIDER_CHATML.id,
      availableProviders: [MOCK_AI_PROVIDER_CHATML],
      selectedPromptId: null,
      availablePrompts: [],
    });
    const { result: result1 } = renderHook(() => useTokenEstimator(''));
    expect(result1.current.estimatedTokens).toBe(0);

    mockUseAiStore.mockReturnValue({
      currentChatId: 'chat2',
      messagesByChatId: { 'chat2': [] },
      selectedMessagesMap: { 'chat2': { 'someid': true } },
      selectedProviderId: MOCK_AI_PROVIDER_CHATML.id,
      availableProviders: [MOCK_AI_PROVIDER_CHATML],
      selectedPromptId: null,
      availablePrompts: [],
    });
    const { result: result2 } = renderHook(() => useTokenEstimator(''));
    expect(result2.current.estimatedTokens).toBe(0);
  });

  // New Test Cases for System Prompts

  it('should include system prompt tokens for ChatML models', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 18 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [],
        {},
        'chat1',
        MOCK_SYSTEM_PROMPT_1.id,
        [MOCK_SYSTEM_PROMPT_1],
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(18);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should include system prompt tokens for non-ChatML models (string concatenation)', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 8 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [], 
        {}, 
        'chat1',
        MOCK_SYSTEM_PROMPT_1.id, 
        [MOCK_SYSTEM_PROMPT_1], 
        MOCK_AI_PROVIDER_STRING
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Hello there'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(8);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should NOT include system prompt tokens if selectedPromptId is null', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 8 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [],
        {},
        'chat1',
        null,
        [MOCK_SYSTEM_PROMPT_1],
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(8);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should NOT include system prompt tokens if selectedPromptId is __none__', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 8 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [],
        {},
        'chat1',
        '__none__',
        [MOCK_SYSTEM_PROMPT_1],
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(8);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should NOT include system prompt tokens if selectedPromptId is invalid/not found', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 8 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [],
        {},
        'chat1',
        'invalid-prompt-id',
        [MOCK_SYSTEM_PROMPT_1],
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(8);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should correctly combine system prompt, selected history, and user input for ChatML', async () => {
    mockEstimateTokens.mockResolvedValue({
      data: { estimatedTokens: 33 } as TokenEstimationResponse,
      error: undefined,
      status: 200
    });
    
    const messages = [
      createMockChatMessage('msg1', 'History one.', 'user', '2023-01-01T10:00:00Z'),
      createMockChatMessage('msg2', 'History two.', 'assistant', '2023-01-01T10:01:00Z'),
    ];
    const selected = { 'msg1': true, 'msg2': true };
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        messages, 
        selected, 
        'chat1',
        MOCK_SYSTEM_PROMPT_1.id,
        [MOCK_SYSTEM_PROMPT_1],
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('New q'));
    
    await waitFor(() => {
      expect(result.current.estimatedTokens).toBe(33);
      expect(result.current.isLoading).toBe(false);
    });
  });

});

// Placeholder for the actual hook implementation file (useTokenEstimator.ts)
// export const useTokenEstimator = (textInput: string): number => {
//   // Implementation will go here
//   return 0;
// }; 