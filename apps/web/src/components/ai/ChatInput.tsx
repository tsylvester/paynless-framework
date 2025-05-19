'use client';

import React, { useState } from 'react';
import { useAiStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSelectionControls } from './MessageSelectionControls';
import { toast } from 'sonner';
import { CurrentMessageTokenEstimator } from './CurrentMessageTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { AlertCircle, Info } from 'lucide-react';

export interface ChatInputProps {
  // Props to potentially receive from AiChatbox if needed, e.g., currentChatId if not passed as prop
  // For now, assuming ChatInput will get most from useAiStore directly
}

const ChatInput: React.FC<ChatInputProps> = () => {
  const [inputMessage, setInputMessage] = useState('');

  const {
    currentChatId,
    isLoadingAiResponse,
    sendMessage,
    clearAiError,
    rewindTargetMessageId,
    cancelRewindPreparation,
    messagesByChatId,
  } = useAiStore(state => ({
    currentChatId: state.currentChatId,
    isLoadingAiResponse: state.isLoadingAiResponse,
    sendMessage: state.sendMessage,
    clearAiError: state.clearAiError,
    rewindTargetMessageId: state.rewindTargetMessageId,
    prepareRewind: state.prepareRewind,
    cancelRewindPreparation: state.cancelRewindPreparation,
    messagesByChatId: state.messagesByChatId,
  }));

  // Token estimation and affordability
  const estimatedTokens = useTokenEstimator(inputMessage);
  const { canAffordNext, lowBalanceWarning, currentBalance } = useAIChatAffordabilityStatus(estimatedTokens);

  React.useEffect(() => {
    if (rewindTargetMessageId && currentChatId) {
      const messagesInCurrentChat = messagesByChatId[currentChatId];
      const messageToEdit = messagesInCurrentChat?.find(msg => msg.id === rewindTargetMessageId);
      if (messageToEdit) {
        setInputMessage(messageToEdit.content);
      }
    } else {
      // If not rewinding, or if IDs are null, ensure input is clear
      // This might need adjustment if we want to preserve typed text when rewind is cancelled.
      // setInputMessage(''); // Let's hold off on auto-clearing here to see behavior.
    }
  }, [rewindTargetMessageId, currentChatId, messagesByChatId]);

  const handleSend = async () => {
    if (!inputMessage.trim() || isLoadingAiResponse || !canAffordNext) return;

    clearAiError();
    const messageToSend = inputMessage;

    const wasRewinding = !!rewindTargetMessageId;

    const { selectedProviderId, selectedPromptId } = useAiStore.getState();
    const selectedMessages = useAiStore.getState().selectSelectedChatMessages();
    
    const contextMessages = selectedMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    logger.info(`[ChatInput] handleSend called. Provider: ${selectedProviderId}, Prompt: ${selectedPromptId}, Rewinding: ${wasRewinding}, Can Afford: ${canAffordNext}`);

    if (!selectedProviderId) {
      logger.error('[ChatInput] Cannot send message: No provider selected');
      toast.error("Cannot send message: No provider selected");
      return;
    }

    try {
      await sendMessage({
        message: messageToSend,
        chatId: currentChatId ?? undefined,
        providerId: selectedProviderId,
        promptId: selectedPromptId,
        contextMessages: contextMessages,
      });

      setInputMessage('');

      if (wasRewinding) {
        cancelRewindPreparation();
        toast.success("Message rewound and resubmitted successfully");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ChatInput] Unexpected error calling sendMessage:', { error: errorMessage });
      toast.error(wasRewinding ? "Failed to rewind and resubmit message" : "Failed to send message");
      // Do not clear inputMessage on error, so user can retry.
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleCancelRewind = () => {
    cancelRewindPreparation();
    setInputMessage(''); // Clear input when cancelling rewind
  };

  const sendButtonDisabled = isLoadingAiResponse || !inputMessage.trim() || !canAffordNext;

  return (
    <div className="flex flex-col space-y-2">
      <div className="flex items-center space-x-2 border-t pt-4 border-[rgb(var(--color-border))]">
        <MessageSelectionControls />
        <div className="relative flex-grow">
          <Textarea
            placeholder={rewindTargetMessageId ? "Edit your message..." : "Type your message here..."}
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            className="w-full resize-none min-h-[40px] max-h-[150px] overflow-y-auto pr-24"
            disabled={isLoadingAiResponse}
            data-testid="chat-input-textarea"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            <CurrentMessageTokenEstimator textInput={inputMessage} />
          </div>
        </div>
        {rewindTargetMessageId ? (
          <div className="flex space-x-2">
            <Button
              onClick={handleCancelRewind}
              variant="outline"
              disabled={isLoadingAiResponse}
              data-testid="cancel-rewind-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sendButtonDisabled}
              data-testid="resubmit-message-button"
            >
              Resubmit
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleSend}
            disabled={sendButtonDisabled}
            data-testid="send-message-button"
          >
            Send
          </Button>
        )}
      </div>
      {!canAffordNext && (
        <div className="flex items-center p-2 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" data-testid="insufficient-balance-alert">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
          Insufficient token balance to send this message. Current balance: {currentBalance} tokens.
        </div>
      )}
      {canAffordNext && lowBalanceWarning && (
        <div className="flex items-center p-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-300 rounded-md dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700" data-testid="low-balance-alert">
          <Info className="w-4 h-4 mr-2 flex-shrink-0" />
          Low token balance. Current balance: {currentBalance} tokens.
        </div>
      )}
    </div>
  );
};

export default React.memo(ChatInput); 