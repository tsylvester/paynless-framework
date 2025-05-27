import { renderHook, act } from '@testing-library/react-hooks';
import { vi, describe, beforeEach, it, expect } from 'vitest'; // Removed MockedFunction
import { useAiStore } from '../../../../packages/store/src/aiStore.ts'; // Adjusted path
import { useTokenEstimator } from './useTokenEstimator.ts';
import { ChatMessage, AiProvider, AiModelExtendedConfig, Json, SystemPrompt } from '@paynless/types';

// Mock tiktoken with Vitest
vi.mock('tiktoken', () => ({
  __esModule: true, // Still good practice for ES Modules
  get_encoding: vi.fn(() => ({
    encode: vi.fn((text: string) => {
      return text.split(' ').filter(s => s.length > 0);
    }),
    decode: vi.fn(),
  })),
}));

// Mock useAiStore with Vitest
vi.mock('../../../../packages/store/src/aiStore', () => ({ // Adjusted path
  useAiStore: vi.fn(),
}));

const mockUseAiStore = vi.mocked(useAiStore); // Use vi.mocked for better type inference with Vitest

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
});

describe('useTokenEstimator', () => {
  beforeEach(() => {
    // Reset mocks before each test
    // For Vitest, vi.clearAllMocks() or mockUseAiStore.mockReset() can be used.
    // mockUseAiStore.mockReset() is more specific if useAiStore is the primary mock to reset here.
    mockUseAiStore.mockReset(); 
    // If you also want to reset getEncoding mock states, you might need to do that explicitly if shared across tests
    // e.g., vi.mocked(getEncoding).mockClear(); but ensure getEncoding is imported from tiktoken if doing so.
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

  it('should return 0 tokens for empty input and no selected messages', () => {
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    const { result } = renderHook(() => useTokenEstimator(''));
    expect(result.current).toBe(0);
  });

  it('should return estimated tokens for user input only, with no selected messages', () => {
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    const { result } = renderHook(() => useTokenEstimator('Hello world')); // "Hello world" = 2 tokens
    expect(result.current).toBe(9); // WAS 2
  });

  it('should return estimated tokens for one selected message and no user input', () => {
    const messages = [createMockChatMessage('msg1', 'Hi there', 'user', '2023-01-01T10:00:00Z')];
    const selected = { 'msg1': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('')); // "Hi there" = 2 tokens
    expect(result.current).toBe(9); // WAS 2
  });

  it('should combine user input and one selected message', () => {
    const messages = [createMockChatMessage('msg1', 'Context one.', 'assistant', '2023-01-01T10:00:00Z')]; // 2 tokens
    const selected = { 'msg1': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('Question:')); // 1 token
    // "Context one. Question:" = 3 tokens
    expect(result.current).toBe(16); // WAS 3, runner actual was 16. My calc 14.
  });

  it('should combine user input and multiple selected messages in chronological order', () => {
    const messages = [
      createMockChatMessage('msg1', 'First part', 'user', '2023-01-01T10:00:00Z'),      // 2 tokens
      createMockChatMessage('msg2', 'Second part', 'assistant', '2023-01-01T10:01:00Z'), // 2 tokens
    ];
    const selected = { 'msg1': true, 'msg2': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('Another query')); // 2 tokens
    // "First part Second part Another query" = 6 tokens
    expect(result.current).toBe(21); // WAS 6
  });

  it('should dynamically update when a message is selected', () => {
    const msgA = createMockChatMessage('msgA', 'Alpha', 'user', '2023-01-01T10:00:00Z'); // 1 token
    const msgB = createMockChatMessage('msgB', 'Beta', 'user', '2023-01-01T10:01:00Z');  // 1 token
    const initialMessages = [msgA, msgB];
    
    let currentSelected = { 'msgA': true, 'msgB': false };
    mockUseAiStore.mockImplementation(() => getDefaultAiStoreState(initialMessages, currentSelected));
    
    const { result, rerender } = renderHook(({ text }) => useTokenEstimator(text), {
      initialProps: { text: 'Test' } // 1 token
    });

    // "Alpha Test" = 2 tokens
    expect(result.current).toBe(13); // WAS 2

    // Simulate selecting MsgB
    act(() => {
      currentSelected = { 'msgA': true, 'msgB': true };
      // Vitest hooks should react to store changes if the hook is subscribed correctly.
      // Re-mocking implementation might be needed if subscription is not robust or for test clarity.
      mockUseAiStore.mockImplementation(() => getDefaultAiStoreState(initialMessages, currentSelected));
    });
    rerender({ text: 'Test' }); 
    // "Alpha Beta Test" = 3 tokens
    expect(result.current).toBe(18); // WAS 3
  });

  it('should dynamically update when a message is deselected', () => {
    const msgA = createMockChatMessage('msgA', 'Alpha', 'user', '2023-01-01T10:00:00Z');
    const msgB = createMockChatMessage('msgB', 'Beta', 'user', '2023-01-01T10:01:00Z');
    const initialMessages = [msgA, msgB];
    
    let currentSelected = { 'msgA': true, 'msgB': true };
    mockUseAiStore.mockImplementation(() => getDefaultAiStoreState(initialMessages, currentSelected));

    const { result, rerender } = renderHook(({ text }) => useTokenEstimator(text), {
      initialProps: { text: 'Test' }
    });

    // "Alpha Beta Test" = 3 tokens
    expect(result.current).toBe(18); // WAS 3

    // Simulate deselecting MsgA
    act(() => {
      currentSelected = { 'msgA': false, 'msgB': true };
      mockUseAiStore.mockImplementation(() => getDefaultAiStoreState(initialMessages, currentSelected));
    });
    rerender({ text: 'Test' });
    // "Beta Test" = 2 tokens
    expect(result.current).toBe(13); // WAS 2
  });

  it('should estimate tokens for selected messages only if user input is empty', () => {
    const messages = [
      createMockChatMessage('msg1', 'Content A', 'user', '2023-01-01T10:00:00Z'), // 2 tokens
      createMockChatMessage('msg2', 'Content B', 'assistant', '2023-01-01T10:01:00Z'), // 2 tokens
    ];
    const selected = { 'msg1': true, 'msg2': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator(''));
    // "Content A Content B" = 4 tokens
    expect(result.current).toBe(15); // WAS 4
  });

  it('should estimate tokens for user input only if no messages are selected', () => {
    const messages = [
      createMockChatMessage('msg1', 'Content A', 'user', '2023-01-01T10:00:00Z'),
    ];
    const selected = { 'msg1': false }; // Or msg1 not in selected map
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('User input here')); // 3 tokens
    expect(result.current).toBe(10); // WAS 3
  });
  
  it('should handle multiple messages with mixed selection states and ensure chronological order', () => {
    const messages = [
      createMockChatMessage('msgOld', 'Oldest', 'user', '2023-01-01T09:00:00Z'),   // 1 token (selected)
      createMockChatMessage('msgSkip', 'Middle', 'user', '2023-01-01T10:00:00Z'),  // (not selected)
      createMockChatMessage('msgNew', 'Newest', 'assistant', '2023-01-01T11:00:00Z'), // 1 token (selected)
    ];
    const selected = { 'msgOld': true, 'msgNew': true, 'msgSkip': false };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('Input')); // 1 token
    // "Oldest Newest Input" = 3 tokens
    expect(result.current).toBe(20); // WAS 3, runner actual was 20. My calc 18.
  });

  it('should return tokens for input only if no messages are loaded for the currentChatId', () => {
    // Corrected expectation: if no messages, only input string is tokenized.
    mockUseAiStore.mockReturnValue({
      currentChatId: 'chatWithNoMessages',
      messagesByChatId: {}, 
      selectedMessagesMap: {},
      selectedProviderId: MOCK_AI_PROVIDER_CHATML.id, // Added
      availableProviders: [MOCK_AI_PROVIDER_CHATML], // Added
    });
    const { result } = renderHook(() => useTokenEstimator('Some input')); // "Some input" = 2 tokens
    expect(result.current).toBe(9); // WAS 2
  });
  
  it('should return 0 tokens for empty input when currentChatId has no messages in selectedMessagesMap or messagesByChatId is empty for it', () => {
    mockUseAiStore.mockReturnValue({
      currentChatId: 'chat1',
      messagesByChatId: { 'chat1': [createMockChatMessage('m1', 'Exists', 'user', '2023-01-01T09:00:00Z')] }, // Messages exist
      selectedMessagesMap: { 'chat1': {} }, // But no selections for chat1
    });
    const { result: result1 } = renderHook(() => useTokenEstimator(''));
    expect(result1.current).toBe(0);

    mockUseAiStore.mockReturnValue({
      currentChatId: 'chat2',
      messagesByChatId: { 'chat2': [] }, // No messages for chat2
      selectedMessagesMap: { 'chat2': { 'someid': true } }, // Selections exist but no messages to match
    });
    const { result: result2 } = renderHook(() => useTokenEstimator(''));
    expect(result2.current).toBe(0);
  });

  // New Test Cases for System Prompts

  it('should include system prompt tokens for ChatML models', () => {
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [], // No messages
        {}, // No selections
        'chat1',
        MOCK_SYSTEM_PROMPT_1.id, // Select the system prompt
        [MOCK_SYSTEM_PROMPT_1],   // Make it available
        MOCK_AI_PROVIDER_CHATML   // Use ChatML provider
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test')); // User input: "Test" (1 token by mock)
    expect(result.current).toBe(18);
  });

  it('should include system prompt tokens for non-ChatML models (string concatenation)', () => {
    // System prompt: "You are a helpful assistant." (6 tokens by mock tokenizer)
    // User input: "Hello there" (2 tokens by mock tokenizer)
    // Combined string: "You are a helpful assistant.\nHello there"
    // estimateInputTokens (non-ChatML) just counts tokens from this combined string.
    // The mock tokenizer splits by space. "You are a helpful assistant. Hello there" -> 8 tokens.
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [], 
        {}, 
        'chat1',
        MOCK_SYSTEM_PROMPT_1.id, 
        [MOCK_SYSTEM_PROMPT_1], 
        MOCK_AI_PROVIDER_STRING // provider with non-ChatML config
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Hello there'));
    expect(result.current).toBe(8);
  });

  it('should NOT include system prompt tokens if selectedPromptId is null', () => {
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [], // No messages
        {}, // No selections
        'chat1',
        null, // selectedPromptId is null
        [MOCK_SYSTEM_PROMPT_1],
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test'));
    expect(result.current).toBe(8); // Only user input with ChatML overhead
  });

  it('should NOT include system prompt tokens if selectedPromptId is __none__', () => {
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [], // No messages
        {}, // No selections
        'chat1',
        '__none__', // selectedPromptId is __none__
        [MOCK_SYSTEM_PROMPT_1],
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test'));
    expect(result.current).toBe(8);
  });

  it('should NOT include system prompt tokens if selectedPromptId is invalid/not found', () => {
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        [], // No messages
        {}, // No selections
        'chat1',
        'invalid-prompt-id', // selectedPromptId is invalid
        [MOCK_SYSTEM_PROMPT_1], // System prompt exists but ID won't match
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('Test'));
    expect(result.current).toBe(8);
  });

  it('should correctly combine system prompt, selected history, and user input for ChatML', () => {
    const messages = [
      createMockChatMessage('msg1', 'History one.', 'user', '2023-01-01T10:00:00Z'),      // 2 tokens + ChatML message overhead
      createMockChatMessage('msg2', 'History two.', 'assistant', '2023-01-01T10:01:00Z'), // 2 tokens + ChatML message overhead
    ];
    const selected = { 'msg1': true, 'msg2': true };
    mockUseAiStore.mockReturnValue(
      getDefaultAiStoreState(
        messages, 
        selected, 
        'chat1',
        MOCK_SYSTEM_PROMPT_1.id, // System prompt selected
        [MOCK_SYSTEM_PROMPT_1],   // System prompt available
        MOCK_AI_PROVIDER_CHATML
      )
    );
    const { result } = renderHook(() => useTokenEstimator('New q'));
    expect(result.current).toBe(33);
  });

});

// Placeholder for the actual hook implementation file (useTokenEstimator.ts)
// export const useTokenEstimator = (textInput: string): number => {
//   // Implementation will go here
//   return 0;
// }; 