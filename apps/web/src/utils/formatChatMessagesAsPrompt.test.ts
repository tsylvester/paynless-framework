import { describe, it, expect } from 'vitest';
import { formatChatMessagesAsPrompt } from './formatChatMessagesAsPrompt';
import type { ChatMessage } from '@paynless/types';

function makeMessage(overrides: {
  id: string;
  role: string;
  content: string;
}): ChatMessage {
  return {
    id: overrides.id,
    chat_id: 'chat-1',
    role: overrides.role,
    content: overrides.content,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    is_active_in_thread: true,
    ai_provider_id: null,
    system_prompt_id: null,
    token_usage: null,
    user_id: null,
    error_type: null,
    response_to_message_id: null,
  };
}

describe('formatChatMessagesAsPrompt', () => {
  it('returns empty string when input array is empty', () => {
    const messages: ChatMessage[] = [];
    expect(formatChatMessagesAsPrompt(messages)).toBe('');
  });

  it('single user message formats as "User: <content>"', () => {
    const messages: ChatMessage[] = [
      makeMessage({ id: '1', role: 'user', content: 'Hello' }),
    ];
    expect(formatChatMessagesAsPrompt(messages)).toBe('User: Hello');
  });

  it('single assistant message formats as "Assistant: <content>"', () => {
    const messages: ChatMessage[] = [
      makeMessage({ id: '1', role: 'assistant', content: 'Hi there' }),
    ];
    expect(formatChatMessagesAsPrompt(messages)).toBe('Assistant: Hi there');
  });

  it('single system message formats as "System: <content>"', () => {
    const messages: ChatMessage[] = [
      makeMessage({ id: '1', role: 'system', content: 'You are helpful.' }),
    ];
    expect(formatChatMessagesAsPrompt(messages)).toBe('System: You are helpful.');
  });

  it('multiple messages are separated by double newlines', () => {
    const messages: ChatMessage[] = [
      makeMessage({ id: '1', role: 'user', content: 'First' }),
      makeMessage({ id: '2', role: 'assistant', content: 'Second' }),
    ];
    expect(formatChatMessagesAsPrompt(messages)).toBe(
      'User: First\n\nAssistant: Second'
    );
  });

  it('preserves message order (chronological)', () => {
    const messages: ChatMessage[] = [
      makeMessage({ id: '1', role: 'user', content: 'A' }),
      makeMessage({ id: '2', role: 'assistant', content: 'B' }),
      makeMessage({ id: '3', role: 'user', content: 'C' }),
    ];
    expect(formatChatMessagesAsPrompt(messages)).toBe(
      'User: A\n\nAssistant: B\n\nUser: C'
    );
  });

  it('capitalises the first letter of the role label regardless of input casing', () => {
    const messagesLower: ChatMessage[] = [
      makeMessage({ id: '1', role: 'user', content: 'u' }),
    ];
    expect(formatChatMessagesAsPrompt(messagesLower)).toBe('User: u');

    const messagesUpper: ChatMessage[] = [
      makeMessage({ id: '1', role: 'USER', content: 'U' }),
    ];
    expect(formatChatMessagesAsPrompt(messagesUpper)).toBe('User: U');

    const messagesAssistant: ChatMessage[] = [
      makeMessage({ id: '1', role: 'ASSISTANT', content: 'x' }),
    ];
    expect(formatChatMessagesAsPrompt(messagesAssistant)).toBe(
      'Assistant: x'
    );
  });

  it('preserves multi-line content within a single message', () => {
    const content = 'Line one\nLine two\nLine three';
    const messages: ChatMessage[] = [
      makeMessage({ id: '1', role: 'user', content }),
    ];
    expect(formatChatMessagesAsPrompt(messages)).toBe(`User: ${content}`);
  });

  it('handles unknown role values gracefully (uses role as-is with capitalisation)', () => {
    const messages: ChatMessage[] = [
      makeMessage({ id: '1', role: 'custom', content: 'Custom content' }),
    ];
    expect(formatChatMessagesAsPrompt(messages)).toBe(
      'Custom: Custom content'
    );
  });
});
