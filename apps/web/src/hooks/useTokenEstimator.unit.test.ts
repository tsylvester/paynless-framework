import { renderHook, act } from '@testing-library/react-hooks';
import { vi, describe, beforeEach, it, expect } from 'vitest'; // Removed MockedFunction
import { useAiStore } from '../../../../packages/store/src/aiStore'; // Adjusted path
import { useTokenEstimator } from './useTokenEstimator';
import { ChatMessage } from '@paynless/types';

// Mock tiktoken with Vitest
vi.mock('tiktoken', () => ({
  __esModule: true, // Still good practice for ES Modules
  getEncoding: vi.fn(() => ({
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

  // Default state for useAiStore mock
  const getDefaultAiStoreState = (
    messages: ChatMessage[] = [],
    selectedMessages: { [messageId: string]: boolean } = {},
    currentChatId = 'chat1'
  ) => ({
    currentChatId,
    messagesByChatId: { [currentChatId]: messages },
    selectedMessagesMap: { [currentChatId]: selectedMessages },
    // Add other store properties if the hook uses them, otherwise keep minimal
  });

  it('should return 0 tokens for empty input and no selected messages', () => {
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    const { result } = renderHook(() => useTokenEstimator(''));
    expect(result.current).toBe(0);
  });

  it('should return estimated tokens for user input only, with no selected messages', () => {
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState());
    const { result } = renderHook(() => useTokenEstimator('Hello world')); // "Hello world" = 2 tokens
    expect(result.current).toBe(2);
  });

  it('should return estimated tokens for one selected message and no user input', () => {
    const messages = [createMockChatMessage('msg1', 'Hi there', 'user', '2023-01-01T10:00:00Z')];
    const selected = { 'msg1': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('')); // "Hi there" = 2 tokens
    expect(result.current).toBe(2);
  });

  it('should combine user input and one selected message', () => {
    const messages = [createMockChatMessage('msg1', 'Context one.', 'assistant', '2023-01-01T10:00:00Z')]; // 2 tokens
    const selected = { 'msg1': true };
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('Question:')); // 1 token
    // "Context one. Question:" = 3 tokens
    expect(result.current).toBe(3);
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
    expect(result.current).toBe(6);
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
    expect(result.current).toBe(2);

    // Simulate selecting MsgB
    act(() => {
      currentSelected = { 'msgA': true, 'msgB': true };
      // Vitest hooks should react to store changes if the hook is subscribed correctly.
      // Re-mocking implementation might be needed if subscription is not robust or for test clarity.
      mockUseAiStore.mockImplementation(() => getDefaultAiStoreState(initialMessages, currentSelected));
    });
    rerender({ text: 'Test' }); 
    // "Alpha Beta Test" = 3 tokens
    expect(result.current).toBe(3);
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
    expect(result.current).toBe(3);

    // Simulate deselecting MsgA
    act(() => {
      currentSelected = { 'msgA': false, 'msgB': true };
      mockUseAiStore.mockImplementation(() => getDefaultAiStoreState(initialMessages, currentSelected));
    });
    rerender({ text: 'Test' });
    // "Beta Test" = 2 tokens
    expect(result.current).toBe(2);
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
    expect(result.current).toBe(4);
  });

  it('should estimate tokens for user input only if no messages are selected', () => {
    const messages = [
      createMockChatMessage('msg1', 'Content A', 'user', '2023-01-01T10:00:00Z'),
    ];
    const selected = { 'msg1': false }; // Or msg1 not in selected map
    mockUseAiStore.mockReturnValue(getDefaultAiStoreState(messages, selected));
    const { result } = renderHook(() => useTokenEstimator('User input here')); // 3 tokens
    expect(result.current).toBe(3);
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
    expect(result.current).toBe(3);
  });

  it('should return tokens for input only if no messages are loaded for the currentChatId', () => {
    // Corrected expectation: if no messages, only input string is tokenized.
    mockUseAiStore.mockReturnValue({
      currentChatId: 'chatWithNoMessages',
      messagesByChatId: {}, 
      selectedMessagesMap: {},
    });
    const { result } = renderHook(() => useTokenEstimator('Some input')); // "Some input" = 2 tokens
    expect(result.current).toBe(2);
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

});

// Placeholder for the actual hook implementation file (useTokenEstimator.ts)
// export const useTokenEstimator = (textInput: string): number => {
//   // Implementation will go here
//   return 0;
// }; 