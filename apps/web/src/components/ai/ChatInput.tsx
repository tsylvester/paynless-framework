'use client';

import React, { useState } from 'react';
import {
  useAiStore,
  selectCurrentChatMessages,
  selectIsLoadingAiResponse,
  selectAiError,
  selectRewindTargetMessageId,
  selectIsRewinding,
} from '@paynless/store';
import { ChatMessage } from '@paynless/types';
import { logger } from '@paynless/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSelectionControls } from './MessageSelectionControls';
import { toast } from 'sonner';
import { CurrentMessageTokenEstimator } from './CurrentMessageTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { AlertCircle, Info } from 'lucide-react';
import { ContinueUntilCompleteToggle } from '../common/ContinueUntilCompleteToggle';

export interface ChatInputProps {
  // No props for now, revised from previous attempt
}

const ChatInput: React.FC<ChatInputProps> = (/* Removed currentChatSession prop */) => {
  const [inputMessage, setInputMessage] = useState(''); // Reverted to local state

  // Actions from store
  const {
    sendMessage,
    clearAiError,
    cancelRewindPreparation,
    currentChatId, // Get currentChatId directly
    messagesByChatId, // Get messagesByChatId for rewind logic
  } = useAiStore.getState();

  // Selectors from store
  const isLoadingAiResponse = useAiStore(selectIsLoadingAiResponse);
  const aiError = useAiStore(selectAiError);
  const rewindTargetMessageId = useAiStore(selectRewindTargetMessageId);
  const isRewinding = useAiStore(selectIsRewinding);
  const selectedMessages = useAiStore(selectCurrentChatMessages); // Moved to top level

  // Token estimation and affordability using local inputMessage
  const { estimatedTokens, isLoading: isLoadingTokens } = useTokenEstimator(inputMessage);
  const { canAffordNext, lowBalanceWarning, currentBalance } = useAIChatAffordabilityStatus(estimatedTokens);

  React.useEffect(() => {
    if (rewindTargetMessageId && currentChatId) { // Use currentChatId from store
      const messagesInCurrentChat = messagesByChatId[currentChatId];
      const messageToEdit = messagesInCurrentChat?.find(msg => msg.id === rewindTargetMessageId);
      if (messageToEdit) {
        setInputMessage(messageToEdit.content); // Use local setInputMessage
      }
    } else {
      // If not rewinding, ensure input is clear if messageToEdit was not found or IDs are null.
      // Avoids clearing if user is typing and rewindTargetMessageId becomes null for other reasons.
      if (!rewindTargetMessageId) {
         // setInputMessage(''); // Decided against auto-clearing to preserve user input during other state changes
      }
    }
    // Ensure messagesByChatId is in dependency array if it can change and affect this logic
  }, [rewindTargetMessageId, currentChatId, messagesByChatId, setInputMessage]);


  const handleSend = async () => {
    if (!inputMessage.trim() || isLoadingAiResponse || isLoadingTokens || !canAffordNext) return;
    clearAiError();

    const { selectedProviderId, selectedPromptId } = useAiStore.getState();
    // selectedMessages is now accessed from the top-level const

    const contextMessages = selectedMessages.map((msg: ChatMessage) => ({
      role: msg.role as 'user' | 'assistant' | 'system', // Added type assertion
      content: msg.content,
    }));

    logger.info(`[ChatInput] handleSend called. Provider: ${selectedProviderId}, Prompt: ${selectedPromptId}, Rewinding: ${isRewinding}, Can Afford: ${canAffordNext}`);

    if (!selectedProviderId) {
      logger.error('[ChatInput] Cannot send message: No provider selected');
      toast.error("Cannot send message: No provider selected");
      return;
    }

    try {
      await sendMessage({
        message: inputMessage,
        chatId: currentChatId ?? undefined,
        providerId: selectedProviderId,
        promptId: selectedPromptId,
        contextMessages: contextMessages,
      });

      setInputMessage('');

      if (isRewinding) {
        cancelRewindPreparation();
        toast.success("Message rewound and resubmitted successfully");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ChatInput] Unexpected error calling sendMessage:', { error: errorMessage });
      toast.error(isRewinding ? "Failed to rewind and resubmit message" : "Failed to send message");
      // Do not clear inputMessage on error
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(event.target.value); // Use local setInputMessage
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleCancelRewind = () => {
    cancelRewindPreparation();
    setInputMessage(''); // Clear local inputMessage when cancelling rewind
  };

  const sendButtonDisabled = isLoadingAiResponse || isLoadingTokens || !inputMessage.trim() || !canAffordNext;

  return (
    <div className="flex flex-col space-y-2">
      {aiError && ( /* Display AI Error if present */
        <div className="flex items-center p-2 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" data-testid="ai-error-alert">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
          {aiError}
        </div>
      )}
      <div className="flex items-center space-x-2 border-t pt-4 border-[rgb(var(--color-border)))]">
        <MessageSelectionControls />
        <ContinueUntilCompleteToggle />
        <div className="relative flex-grow">
          <Textarea
            placeholder={rewindTargetMessageId ? "Edit your message..." : "Type your message here..."}
            value={inputMessage} // Use local inputMessage
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            className="w-full resize-none min-h-[40px] max-h-[150px] overflow-y-auto pr-24"
            disabled={isLoadingAiResponse}
            data-testid="chat-input-textarea"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            {/* Pass local inputMessage to estimator */}
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