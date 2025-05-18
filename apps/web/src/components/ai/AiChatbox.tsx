'use client'

import React, { useState, useRef, useEffect, memo } from 'react'
import { useAiStore, selectCurrentChatMessages } from '@paynless/store'
import type { ChatMessage } from '@paynless/types'
import { logger } from '@paynless/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Terminal, Loader2 } from 'lucide-react'
import { ChatMessageBubble } from './ChatMessageBubble'
import { MessageSelectionControls } from './MessageSelectionControls'
import { toast } from "sonner"


export interface AiChatboxProps {
  // isAnonymous: boolean; // Removed
}

// Define the base component implementation
const AiChatboxComponent: React.FC<AiChatboxProps> = () => {
  const [inputMessage, setInputMessage] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable container
  console.log("AiChatbox rendering/re-rendering. Input:", inputMessage); // Log current input too

  // Use the dedicated selector for currentChatMessages
  const currentChatMessages = useAiStore(selectCurrentChatMessages);
  
  // Select other state and actions from the store
  const {
    currentChatId,
    isLoadingAiResponse,
    aiError,
    sendMessage,
    clearAiError,
    rewindTargetMessageId,
    prepareRewind,
    cancelRewindPreparation,
  } = useAiStore(state => ({
    currentChatId: state.currentChatId,
    isLoadingAiResponse: state.isLoadingAiResponse,
    aiError: state.aiError,
    sendMessage: state.sendMessage,
    clearAiError: state.clearAiError,
    rewindTargetMessageId: state.rewindTargetMessageId,
    prepareRewind: state.prepareRewind,
    cancelRewindPreparation: state.cancelRewindPreparation,
  }));

  // Scroll to new messages
  useEffect(() => {
    if (currentChatMessages.length === 0) return;

    const latestMessage = currentChatMessages[currentChatMessages.length - 1];
    // Only scroll if the latest message is from the assistant
    if (latestMessage && latestMessage.role === 'assistant') { 
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }

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
    console.log("AiChatbox MOUNTED");
    return () => {
      console.log("AiChatbox UNMOUNTING");
    };
  }, []);

  const handleSend = async () => {
    if (!inputMessage.trim() || isLoadingAiResponse) return

    clearAiError() // Clear previous errors
    const messageToSend = inputMessage
    setInputMessage('') // Re-enabled to clear input after send

    const wasRewinding = !!rewindTargetMessageId;

    // Get latest provider and prompt IDs directly from the store when sending
    const { selectedProviderId, selectedPromptId } = useAiStore.getState();

    logger.info(`[AiChatbox] handleSend called. Selected Provider ID: ${selectedProviderId}, Selected Prompt ID: ${selectedPromptId}`);

    if (!selectedProviderId) {
      logger.error('[AiChatbox] Cannot send message: No provider selected');
      toast.error("Cannot send message: No provider selected");
      return;
    }

    try {
      await sendMessage({
        message: messageToSend,
        chatId: currentChatId ?? undefined, // Pass currentChatId if available
        providerId: selectedProviderId,
        promptId: selectedPromptId,
      });

      if (wasRewinding) {
        cancelRewindPreparation(); // Clear rewind state after successful resubmission
        toast.success("Message rewound and resubmitted successfully");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error('[AiChatbox] Unexpected error calling sendMessage:', {
        error: errorMessage,
      })
      toast.error(wasRewinding 
        ? "Failed to rewind and resubmit message" 
        : "Failed to send message"
      );
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(event.target.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault() // Prevent newline
      handleSend()
    }
  }

  const handleEditClick = (messageId: string, messageContent: string) => {
    if (!currentChatId) {
      logger.error('[AiChatbox] Cannot prepare rewind: No current chat ID')
      return
    }
    prepareRewind(messageId, currentChatId)
    setInputMessage(messageContent)
  }

  const handleCancelRewind = () => {
    cancelRewindPreparation();
  }

  return (
    <div 
      className="flex flex-col h-full border rounded-md p-4 space-y-4"
      data-testid="ai-chatbox-container"
    >
      {/* Message Display Area */}
      <div 
        className="flex-grow pr-4 overflow-y-auto min-h-[200px]"
        data-testid="ai-chatbox-scroll-area"
        ref={scrollContainerRef}
      >
        <div className="flex flex-col space-y-2">
          {currentChatMessages.map((msg: ChatMessage) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              onEditClick={msg.role === 'user' ? handleEditClick : undefined}
            />
          ))}
          {isLoadingAiResponse && (
            <div className="flex items-center space-x-2 justify-start pl-2 pt-2">
              <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--color-textSecondary))]" />
              <span className="text-sm text-[rgb(var(--color-textSecondary))]">
                Assistant is thinking...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {aiError && (
        <div className="p-4 rounded-md bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
          <div className="flex items-center space-x-2">
            <Terminal className="h-4 w-4" />
            <h3 className="font-semibold">Error</h3>
          </div>
          <p className="text-sm mt-1">{aiError}</p>
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-center space-x-2 border-t pt-4 border-[rgb(var(--color-border))]">
        <MessageSelectionControls />
        <Textarea
          placeholder={rewindTargetMessageId ? "Edit your message..." : "Type your message here..."}
          value={inputMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1}
          className="flex-grow resize-none min-h-[40px] max-h-[150px] overflow-y-auto"
          disabled={isLoadingAiResponse}
        />
        {rewindTargetMessageId ? (
          <div className="flex space-x-2">
            <Button
              onClick={handleCancelRewind}
              variant="outline"
              disabled={isLoadingAiResponse}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={isLoadingAiResponse || !inputMessage.trim()}
            >
              Resubmit
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleSend}
            disabled={isLoadingAiResponse || !inputMessage.trim()}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  )
};

// Memoize the component
export const AiChatbox = memo(AiChatboxComponent);

// Set the display name for easier debugging
AiChatbox.displayName = 'AiChatbox';