import { useMemo } from 'react';
import { useAiStore } from '../../../../packages/store/src/aiStore';
import type { ChatMessage, AiModelExtendedConfig, MessageForTokenCounting } from '@paynless/types'; // Assuming @paynless/types resolves to packages/types/src
import { estimateInputTokens } from '../../../../packages/utils/src/tokenCostUtils.ts';

export const useTokenEstimator = (textInput: string): number => {
  const {
    currentChatId,
    messagesByChatId,
    selectedMessagesMap,
    selectedProviderId,
    availableProviders,
  } = useAiStore(
    (state) => ({
      currentChatId: state.currentChatId,
      messagesByChatId: state.messagesByChatId,
      selectedMessagesMap: state.selectedMessagesMap,
      selectedProviderId: state.selectedProviderId,
      availableProviders: state.availableProviders,
    }),
  );

  const estimatedTokens = useMemo(() => {
    if (!selectedProviderId) return 0;

    const selectedProvider = availableProviders.find(p => p.id === selectedProviderId);
    if (!selectedProvider || !selectedProvider.config) {
      console.warn('useTokenEstimator: Selected provider or its config is missing.');
      return 0; // Or a fallback rough estimate if preferred
    }
    const modelConfig = selectedProvider.config as unknown as AiModelExtendedConfig; // Cast, assuming valid structure

    let historyMessages: ChatMessage[] = [];
    if (currentChatId) {
      const messagesForCurrentChat = messagesByChatId[currentChatId] || [];
      const selectionsForCurrentChat = selectedMessagesMap[currentChatId] || {};
      historyMessages = messagesForCurrentChat
        .filter(message => selectionsForCurrentChat[message.id])
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    // Prepare input for estimateInputTokens
    let inputForEstimator: string | MessageForTokenCounting[];

    if (
      modelConfig.tokenization_strategy?.type === 'tiktoken' &&
      modelConfig.tokenization_strategy?.is_chatml_model
    ) {
      const messagesForTokenCounting: MessageForTokenCounting[] = historyMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system', // Cast needed if ChatMessage.role is broader
        content: msg.content,
        // name: undefined, // Add if names are used
      }));
      if (textInput.trim()) {
        messagesForTokenCounting.push({ role: 'user', content: textInput });
      }
      inputForEstimator = messagesForTokenCounting;
      // Handle empty case for ChatML - if no messages and no text input, tiktoken might error or give 0.
      // estimateInputTokens handles empty arrays for ChatML by adding priming tokens, so should be okay.
      if (inputForEstimator.length === 0) return 0; // Or let estimateInputTokens handle it
    } else {
      // For non-ChatML tiktoken or rough_char_count, combine into a single string.
      let combinedText = historyMessages.map(msg => msg.content).join('\n'); // Join with newline
      if (textInput.trim()) {
        combinedText = combinedText ? combinedText + '\n' + textInput : textInput;
      }
      inputForEstimator = combinedText.trim();
      if (!inputForEstimator) return 0;
    }

    try {
      return estimateInputTokens(inputForEstimator, modelConfig);
    } catch (error) {
      console.error('Error estimating tokens in useTokenEstimator:', error);
      // Fallback strategy: very rough estimate or 0 if preferred
      const fallbackText = typeof inputForEstimator === 'string' 
        ? inputForEstimator 
        : (inputForEstimator as MessageForTokenCounting[]).map(m => m.content || '').join('\n');
      return Math.ceil(fallbackText.length / 4); // Default rough estimate
    }
  }, [textInput, currentChatId, messagesByChatId, selectedMessagesMap, selectedProviderId, availableProviders]);

  return estimatedTokens;
}; 