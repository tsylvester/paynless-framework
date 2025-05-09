import React, { useEffect } from 'react';
// import { Chat } from '@paynless/types';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiStore } from '@paynless/store';

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
    if (activeContextId !== null) {
      const contextKey = activeContextId;
      const isOrg = contextKey !== 'personal';

      const chatsForContext = isOrg ? chatsByContext.orgs[contextKey] : chatsByContext.personal;
      const isLoadingForContext = isOrg ? isLoadingHistoryByContext.orgs[contextKey] : isLoadingHistoryByContext.personal;
      const errorForContext = isOrg ? historyErrorByContext.orgs[contextKey] : historyErrorByContext.personal;

      if ((chatsForContext === undefined || chatsForContext.length === 0) && 
          !isLoadingForContext && 
          !errorForContext) {
        storeLoadChatHistory(contextKey);
      }
    }
  }, [activeContextId, chatsByContext, isLoadingHistoryByContext, historyErrorByContext, storeLoadChatHistory]);

  const getChatsForDisplay = () => {
    if (!activeContextId) return [];
    return activeContextId === 'personal' 
      ? chatsByContext.personal || [] 
      : chatsByContext.orgs[activeContextId] || [];
  };

  const isLoadingForDisplay = () => {
    if (!activeContextId) return false;
    return activeContextId === 'personal' 
      ? isLoadingHistoryByContext.personal 
      : isLoadingHistoryByContext.orgs[activeContextId] || false;
  };

  const errorForDisplay = () => {
    if (!activeContextId) return null;
    return activeContextId === 'personal' 
      ? historyErrorByContext.personal 
      : historyErrorByContext.orgs[activeContextId] || null;
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
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
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
      <div className="space-y-1">
        {chatsToDisplay.map((chat) => {
          const chatTitle = chat.title || `Chat ${chat.id.substring(0, 8)}...`;
          const isActive = chat.id === currentChatId;
          return (
            <button
              key={chat.id}
              onClick={() => onLoadChat(chat.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                isActive ? 'bg-muted font-semibold' : 'text-muted-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {chatTitle}
            </button>
          );
        })}
      </div>
    </div>
  );
} 