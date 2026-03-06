import type { ChatMessage } from '@paynless/types';

export function formatChatMessagesAsPrompt(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return '';
  }
  const parts: string[] = messages.map((message) => {
    const label =
      message.role.charAt(0).toUpperCase() + message.role.slice(1).toLowerCase();
    return `${label}: ${message.content}`;
  });
  return parts.join('\n\n');
}
