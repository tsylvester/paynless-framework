import { useEffect } from 'react';
import type { Chat } from '@paynless/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiStore } from '@paynless/store';
import { ChatItem } from './ChatItem';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface ChatHistoryListProps {
  currentChatId?: string | null;
  contextTitle?: string;
  activeContextId: string | null;
}

export function ChatHistoryList({
  currentChatId,
  contextTitle,
  activeContextId,
}: ChatHistoryListProps) {
  const storeLoadChatHistory = useAiStore.getState().loadChatHistory;
  const chatsByContext = useAiStore(state => state.chatsByContext);
  const isLoadingHistoryByContext = useAiStore(state => state.isLoadingHistoryByContext);
  const historyErrorByContext = useAiStore(state => state.historyErrorByContext);

  useEffect(() => {
    const orgIdToLoad = activeContextId === 'personal' ? null : activeContextId;

    const contextKeyForLookup = activeContextId === null ? 'personal' : activeContextId;

    const chatsForContext = contextKeyForLookup === 'personal'
      ? chatsByContext.personal
      : chatsByContext.orgs[contextKeyForLookup];

    const isLoadingForContext = contextKeyForLookup === 'personal'
      ? isLoadingHistoryByContext.personal
      : isLoadingHistoryByContext.orgs[contextKeyForLookup];

    const errorForContext = contextKeyForLookup === 'personal'
      ? historyErrorByContext.personal
      : historyErrorByContext.orgs[contextKeyForLookup];

    // Only attempt to load if data isn't already present, not loading, and no error
    const shouldLoad = chatsForContext === undefined &&
        !isLoadingForContext &&
        !errorForContext;

    if (shouldLoad) {
      storeLoadChatHistory(orgIdToLoad); // Pass null for personal, actual ID for orgs
    }
    // Ensure all dependencies that could trigger a reload or use stale data are included.
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
    <div
      className="border rounded-lg bg-muted overflow-y-auto max-h-[60vh] p-2"
      data-testid="chat-history-bounding-box"
    >
      {renderTitle()}
      <ErrorBoundary fallback="Could not display chat history items.">
        <div className="space-y-1">
          {chatsToDisplay.map((chat: Chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === currentChatId}
            />
          ))}
        </div>
      </ErrorBoundary>
    </div>
  );
} 