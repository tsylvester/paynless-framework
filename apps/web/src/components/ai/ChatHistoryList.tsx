import { useEffect } from 'react';
import type { Chat } from '@paynless/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiStore } from '@paynless/store';
import { ChatItem } from './ChatItem';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface ChatHistoryListProps {
  currentChatId?: string | null;
  contextTitle?: string;
  activeContextId: string | undefined;
}

export function ChatHistoryList({
  currentChatId,
  contextTitle,
  activeContextId,
}: ChatHistoryListProps) {
  const storeLoadChatHistory = useAiStore.getState().loadChatHistory;

  const chatsForContext = useAiStore(state => (
    activeContextId === 'personal'
      ? state.chatsByContext.personal
      : (activeContextId ? state.chatsByContext.orgs[activeContextId] : undefined)
  ));

  const isLoadingForContext = useAiStore(state => (
    activeContextId === 'personal'
      ? state.isLoadingHistoryByContext.personal
      : (activeContextId ? state.isLoadingHistoryByContext.orgs[activeContextId] : false)
  )) || false;

  const errorForContext = useAiStore(state => (
    activeContextId === 'personal'
      ? state.historyErrorByContext.personal
      : (activeContextId ? state.historyErrorByContext.orgs[activeContextId] : null)
  )) || null;

  useEffect(() => {
    if (activeContextId === undefined) return;

    const shouldLoad = chatsForContext === undefined &&
        !isLoadingForContext &&
        !errorForContext;

    if (shouldLoad) {
      storeLoadChatHistory(activeContextId);
    }
  }, [activeContextId, chatsForContext, isLoadingForContext, errorForContext, storeLoadChatHistory]);

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

  if (activeContextId === undefined) {
    return (
      <div className="p-4 space-y-3">
        {renderTitle()}
        <Skeleton className="h-8 w-full" data-testid="skeleton-item" />
        <Skeleton className="h-8 w-full" data-testid="skeleton-item" />
        <Skeleton className="h-8 w-full" data-testid="skeleton-item" />
      </div>
    );
  }
  
  const chatsToDisplay = chatsForContext || [];
  const actualIsLoading = isLoadingForContext;
  const actualError = errorForContext;

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