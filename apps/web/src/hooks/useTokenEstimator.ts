import { useMemo } from 'react';
import { useAiStore } from '../../../../packages/store/src/aiStore';
import type { ChatMessage, AiModelExtendedConfig, MessageForTokenCounting, SystemPrompt } from '@paynless/types'; // Assuming @paynless/types resolves to packages/types/src
import { estimateInputTokens } from '../../../../packages/utils/src/tokenCostUtils.ts';

export const useTokenEstimator = (textInput: string): number => {
  const {
    currentChatId,
    messagesByChatId,
    selectedMessagesMap,
    selectedProviderId,
    availableProviders,
    selectedPromptId,
    availablePrompts,
  } = useAiStore(
    (state) => ({
      currentChatId: state.currentChatId,
      messagesByChatId: state.messagesByChatId,
      selectedMessagesMap: state.selectedMessagesMap,
      selectedProviderId: state.selectedProviderId,
      availableProviders: state.availableProviders,
      selectedPromptId: state.selectedPromptId,
      availablePrompts: state.availablePrompts,
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

    // Find the selected system prompt content
    let systemPromptContent: string | null = null;
    if (selectedPromptId && selectedPromptId !== '__none__') {
      const prompt = availablePrompts.find((p: SystemPrompt) => p.id === selectedPromptId);
      if (prompt) {
        systemPromptContent = prompt.prompt_text;
      }
    }

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
      const messagesForTokenCounting: MessageForTokenCounting[] = [];
      if (systemPromptContent) {
        messagesForTokenCounting.push({ role: 'system', content: systemPromptContent });
      }
      historyMessages.forEach(msg => {
        messagesForTokenCounting.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
      });
      if (textInput.trim()) {
        messagesForTokenCounting.push({ role: 'user', content: textInput });
      }
      inputForEstimator = messagesForTokenCounting;
      // Handle empty case for ChatML - if no messages and no text input, tiktoken might error or give 0.
      // estimateInputTokens handles empty arrays for ChatML by adding priming tokens, so should be okay.
      if (inputForEstimator.length === 0) return 0; // Or let estimateInputTokens handle it
    } else {
      // For non-ChatML tiktoken or rough_char_count, combine into a single string.
      let combinedText = systemPromptContent ? systemPromptContent + '\n' : '';
      combinedText += historyMessages.map(msg => msg.content).join('\n');
      if (textInput.trim()) {
        combinedText = combinedText.trim() ? combinedText.trim() + '\n' + textInput : textInput;
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
  }, [textInput, currentChatId, messagesByChatId, selectedMessagesMap, selectedProviderId, availableProviders, selectedPromptId, availablePrompts]);

  return estimatedTokens;
}; 