import { Chat } from '@paynless/types';

interface ChatHistoryListProps {
  history: Chat[];
  onLoadChat: (chatId: string) => void;
  isLoading: boolean;
}

export function ChatHistoryList({ history, onLoadChat, isLoading }: ChatHistoryListProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading chat history...
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No chat history found.
      </div>
    );
  }

  return (
    <div className="flex-grow space-y-2 p-1">
      {history.map((chat) => (
        <div
          key={chat.id}
          className="p-3 border border-border rounded-md hover:bg-muted cursor-pointer transition-colors duration-150"
          onClick={() => onLoadChat(chat.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onLoadChat(chat.id); }}
        >
          <p className="font-medium text-sm text-foreground truncate">{chat.title || `Chat ${chat.id.substring(0, 8)}`}</p>
          <p className="text-xs text-muted-foreground mt-1">{new Date(chat.updated_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
} 