'use client'

import React, { useRef, useEffect, memo } from 'react'
import { useAiStore, selectCurrentChatMessages } from '@paynless/store'
import type { ChatMessage, AiState } from '@paynless/types'
import { logger } from '@paynless/utils'
import { Terminal, Loader2 } from 'lucide-react'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ChatTokenUsageDisplay } from './ChatTokenUsageDisplay'
import ChatInput from './ChatInput'

export interface AiChatboxProps {
  // Props can be defined if AiChatbox needs to pass anything down to ChatInput
  // or if it has its own specific props not related to input.
}

const AiChatboxComponent: React.FC<AiChatboxProps> = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentChatMessages = useAiStore(selectCurrentChatMessages);
  const {
    currentChatId,
    isLoadingAiResponse,
    aiError,
  } = useAiStore((state: AiState) => ({
    currentChatId: state.currentChatId,
    isLoadingAiResponse: state.isLoadingAiResponse,
    aiError: state.aiError,
  }));

  useEffect(() => {
    if (currentChatMessages.length === 0) return;
    const latestMessage = currentChatMessages[currentChatMessages.length - 1];
    if (latestMessage && latestMessage.role === 'assistant') {
      const container = scrollContainerRef.current;
      if (!container) return;
      const messageElements = container.querySelectorAll('[data-message-id]');
      const lastMessageElement = messageElements?.[messageElements.length - 1] as HTMLElement | undefined;
      if (lastMessageElement && lastMessageElement.getAttribute('data-message-id') === latestMessage.id) {
        const targetScrollTop = lastMessageElement.offsetTop - container.offsetTop;
        requestAnimationFrame(() => {
          container.scrollTop = targetScrollTop;
        });
      }
    }
  }, [currentChatMessages]);

  useEffect(() => {
    logger.info("AiChatbox MOUNTED");
    return () => {
      logger.info("AiChatbox UNMOUNTING");
    };
  }, []);

  const handleEditClick = (messageId: string, messageContent: string) => {
    const currentChatIdFromState = useAiStore.getState().currentChatId;
    if (!currentChatIdFromState) {
      logger.error('[AiChatbox] Cannot prepare rewind: No current chat ID in state');
      return;
    }
    useAiStore.getState().prepareRewind(messageId, currentChatIdFromState);
    logger.info(`[AiChatbox] handleEditClick called for messageId: ${messageId}. Called prepareRewind.`);
  };

  return (
    <div 
      className="flex flex-col h-full border rounded-md p-4 space-y-4"
      data-testid="ai-chatbox-container"
    >
      <div 
        className="flex-grow pr-4 overflow-y-auto min-h-[200px]"
        data-testid="ai-chatbox-scroll-area"
        ref={scrollContainerRef}
      >
        <div className="flex flex-col space-y-2">
          {currentChatMessages.map((msg: ChatMessage, index: number) => {
            const isLastMessage = index === currentChatMessages.length - 1;
            const isAssistant = msg.role === 'assistant';
            return (
              <div key={msg.id} className="flex flex-row items-start w-full">
                <ChatMessageBubble
                  message={msg}
                  onEditClick={msg.role === 'user' ? handleEditClick : undefined}
                />
                {isAssistant && isLastMessage && currentChatId && currentChatMessages.length > 0 && (
                  <div className="ml-auto pl-4 self-center flex-shrink-0 w-48">
                    <ChatTokenUsageDisplay />
                  </div>
                )}
              </div>
            );
          })}
          {isLoadingAiResponse && (
            <div className="flex items-center space-x-2 justify-start pl-2 pt-2">
              <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--color-textSecondary))]" />
              <span className="text-sm text-[rgb(var(--color-textSecondary)))]">
                Assistant is thinking...
              </span>
            </div>
          )}
        </div>
      </div>

      {aiError && (
        <div className="p-4 rounded-md bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
          <div className="flex items-center space-x-2">
            <Terminal className="h-4 w-4" />
            <h3 className="font-semibold">Error</h3>
          </div>
          <p className="text-sm mt-1">{aiError}</p>
        </div>
      )}

      <ChatInput />
    </div>
  )
};

export const AiChatbox = memo(AiChatboxComponent);
AiChatbox.displayName = 'AiChatbox';