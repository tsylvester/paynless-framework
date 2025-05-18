import { useMemo } from 'react';
import { get_encoding } from 'tiktoken';
import { useAiStore } from '../../../../packages/store/src/aiStore'; // Adjusted path
import { ChatMessage } from '@paynless/types';

const encoding = get_encoding('cl100k_base');

export const useTokenEstimator = (textInput: string): number => {
  const {
    currentChatId,
    messagesByChatId,
    selectedMessagesMap,
  } = useAiStore(
    (state) => ({
      currentChatId: state.currentChatId,
      messagesByChatId: state.messagesByChatId,
      selectedMessagesMap: state.selectedMessagesMap,
    }),
    // Add a custom equality function if needed for complex state, but for these specific fields, default should be okay.
    // (oldState, newState) => oldState.currentChatId === newState.currentChatId && oldState.messagesByChatId === newState.messagesByChatId && oldState.selectedMessagesMap === newState.selectedMessagesMap
  );

  const estimatedTokens = useMemo(() => {
    let combinedText = '';

    if (currentChatId) {
      const messagesForCurrentChat = messagesByChatId[currentChatId] || [];
      const selectionsForCurrentChat = selectedMessagesMap[currentChatId] || {};

      const selectedChatMessages: ChatMessage[] = messagesForCurrentChat
        .filter(message => selectionsForCurrentChat[message.id])
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      combinedText = selectedChatMessages.map(msg => msg.content).join(' '); // Join with space for tiktoken mock
    }

    if (combinedText && textInput) {
      combinedText += ' ' + textInput; // Join with space
    } else if (textInput) {
      combinedText = textInput;
    }
    
    if (!combinedText.trim()) {
        return 0;
    }

    return encoding.encode(combinedText.trim()).length;
  }, [textInput, currentChatId, messagesByChatId, selectedMessagesMap]);

  return estimatedTokens;
}; 