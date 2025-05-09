import { useEffect } from 'react';
import type { Chat } from '@paynless/types';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiStore } from '@paynless/store';
import { ChatItem } from './ChatItem';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface ChatHistoryListProps {
  onLoadChat: (chatId: string) => void;
  currentChatId?: string | null;
  contextTitle?: string;
  activeContextId: string | null;
}

export function ChatHistoryList({
  onLoadChat,
  currentChatId,
  contextTitle,
  activeContextId,
}: ChatHistoryListProps) {
  const storeLoadChatHistory = useAiStore.getState().loadChatHistory;
  const chatsByContext = useAiStore(state => state.chatsByContext);
  const isLoadingHistoryByContext = useAiStore(state => state.isLoadingHistoryByContext);
  const historyErrorByContext = useAiStore(state => state.historyErrorByContext);

  useEffect(() => {
    const contextKey = activeContextId === null ? 'personal' : activeContextId;

    const chatsForContext = contextKey === 'personal' 
      ? chatsByContext.personal 
      : chatsByContext.orgs[contextKey];

    const isLoadingForContext = contextKey === 'personal' 
      ? isLoadingHistoryByContext.personal 
      : isLoadingHistoryByContext.orgs[contextKey];

    const errorForContext = contextKey === 'personal' 
      ? historyErrorByContext.personal 
      : historyErrorByContext.orgs[contextKey];

    const shouldLoad = chatsForContext === undefined && 
        !isLoadingForContext && 
        !errorForContext;

    if (shouldLoad) {
      storeLoadChatHistory(activeContextId);
    }
  }, [activeContextId, chatsByContext, isLoadingHistoryByContext, historyErrorByContext, storeLoadChatHistory]);

  const getChatsForDisplay = () => {
    if (activeContextId === null) return chatsByContext.personal || [];
    if (typeof activeContextId === 'string') return chatsByContext.orgs[activeContextId] || [];
    return [];
  };

  const isLoadingForDisplay = () => {
    if (activeContextId === null) return isLoadingHistoryByContext.personal;
    if (typeof activeContextId === 'string') return isLoadingHistoryByContext.orgs[activeContextId] || false;
    return false;
  };

  const errorForDisplay = () => {
    if (activeContextId === null) return historyErrorByContext.personal;
    if (typeof activeContextId === 'string') return historyErrorByContext.orgs[activeContextId] || null;
    return null;
  };

  const chatsToDisplay = getChatsForDisplay();
  const actualIsLoading = isLoadingForDisplay();
  const actualError = errorForDisplay();

  const renderTitle = () => {
    if (contextTitle) {
      return (
        <h3 className="px-4 pt-3 pb-2 text-lg font-semibold text-foreground">
          {contextTitle}
        </h3>
      );
    }
    return null;
  };

  if (actualIsLoading) {
    return (
      <div className="p-4 space-y-3">
        {renderTitle()}
        <Skeleton className="h-8 w-full" data-testid="skeleton-item" />
        <Skeleton className="h-8 w-full" data-testid="skeleton-item" />
        <Skeleton className="h-8 w-full" data-testid="skeleton-item" />
      </div>
    );
  }

  if (actualError) {
    return (
      <div className="p-4">
        {renderTitle()}
        <p className="text-sm text-destructive">{actualError}</p>
      </div>
    );
  }

  if (chatsToDisplay.length === 0) {
    return (
      <div className="p-4">
        {renderTitle()}
        <p className="text-sm text-muted-foreground">No chat history found.</p>
      </div>
    );
  }

  return (
    <div className="p-2">
      {renderTitle()}
      <ErrorBoundary fallbackMessage="Could not display chat history items.">
        <div className="space-y-1">
          {chatsToDisplay.map((chat: Chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              onClick={() => onLoadChat(chat.id)}
              isActive={chat.id === currentChatId}
            />
          ))}
        </div>
      </ErrorBoundary>
    </div>
  );
} 