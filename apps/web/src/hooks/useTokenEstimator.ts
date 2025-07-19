import { useState, useEffect, useRef } from 'react';
import { useAiStore } from '../../../../packages/store/src/aiStore';
import { useAuthStore } from '../../../../packages/store/src/authStore';
import type { ChatMessage, AiModelExtendedConfig, MessageForTokenCounting, SystemPrompt } from '@paynless/types'; // Assuming @paynless/types resolves to packages/types/src
import { api } from '@paynless/api';

export const useTokenEstimator = (textInput: string): { estimatedTokens: number; isLoading: boolean } => {
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

  const [estimatedTokens, setEstimatedTokens] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [debouncedTextInput, setDebouncedTextInput] = useState<string>(textInput);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce the textInput with 500ms delay
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedTextInput(textInput);
    }, 500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [textInput]);

  useEffect(() => {
    const estimateTokensAsync = async (): Promise<void> => {
      if (!selectedProviderId) {
        setEstimatedTokens(0);
        return;
      }

      setIsLoading(true);

      const selectedProvider = availableProviders.find(p => p.id === selectedProviderId);
      if (!selectedProvider || !selectedProvider.config) {
        console.warn('useTokenEstimator: Selected provider or its config is missing.');
        setEstimatedTokens(0);
        setIsLoading(false);
        return;
      }
      const modelConfig: AiModelExtendedConfig = selectedProvider.config as unknown as AiModelExtendedConfig;

      // Find the selected system prompt content
      let systemPromptContent: string | null = null;
      if (selectedPromptId && selectedPromptId !== '__none__') {
        const prompt: SystemPrompt | undefined = availablePrompts.find((p: SystemPrompt) => p.id === selectedPromptId);
        if (prompt) {
          systemPromptContent = prompt.prompt_text;
        }
      }

      let historyMessages: ChatMessage[] = [];
      if (currentChatId) {
        const messagesForCurrentChat: ChatMessage[] = messagesByChatId[currentChatId] || [];
        const selectionsForCurrentChat: { [messageId: string]: boolean } = selectedMessagesMap[currentChatId] || {};
        historyMessages = messagesForCurrentChat
          .filter(message => selectionsForCurrentChat[message.id])
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      // Prepare input for API token estimation
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
        if (debouncedTextInput.trim()) {
          messagesForTokenCounting.push({ role: 'user', content: debouncedTextInput });
        }
        inputForEstimator = messagesForTokenCounting;
        if (inputForEstimator.length === 0) {
          setEstimatedTokens(0);
          setIsLoading(false);
          return;
        }
      } else {
        // For non-ChatML tiktoken or rough_char_count, combine into a single string.
        let combinedText: string = systemPromptContent ? systemPromptContent + '\n' : '';
        combinedText += historyMessages.map(msg => msg.content).join('\n');
        if (debouncedTextInput.trim()) {
          combinedText = combinedText.trim() ? combinedText.trim() + '\n' + debouncedTextInput : debouncedTextInput;
        }
        inputForEstimator = combinedText.trim();
        if (!inputForEstimator) {
          setEstimatedTokens(0);
          setIsLoading(false);
          return;
        }
      }

      try {
        const token = useAuthStore.getState().session?.access_token;
        if (!token) {
          console.warn('useTokenEstimator: No authentication token available, falling back to rough estimate');
          const fallbackText: string = typeof inputForEstimator === 'string' 
            ? inputForEstimator 
            : (inputForEstimator as MessageForTokenCounting[]).map(m => m.content || '').join('\n');
          setEstimatedTokens(Math.ceil(fallbackText.length / 4));
          setIsLoading(false);
          return;
        }
        
        const response = await api.ai().estimateTokens({ textOrMessages: inputForEstimator, modelConfig }, token);
        if (response.error || !response.data) {
          console.warn('useTokenEstimator: API error, falling back to rough estimate:', response.error?.message);
          // Fallback strategy: very rough estimate
          const fallbackText: string = typeof inputForEstimator === 'string' 
            ? inputForEstimator 
            : (inputForEstimator as MessageForTokenCounting[]).map(m => m.content || '').join('\n');
          setEstimatedTokens(Math.ceil(fallbackText.length / 4));
        } else {
          setEstimatedTokens(response.data.estimatedTokens);
        }
      } catch (error) {
        console.error('Error estimating tokens in useTokenEstimator:', error);
        // Fallback strategy: very rough estimate
        const fallbackText: string = typeof inputForEstimator === 'string' 
          ? inputForEstimator 
          : (inputForEstimator as MessageForTokenCounting[]).map(m => m.content || '').join('\n');
        setEstimatedTokens(Math.ceil(fallbackText.length / 4));
      } finally {
        setIsLoading(false);
      }
    };

    estimateTokensAsync();
  }, [debouncedTextInput, currentChatId, messagesByChatId, selectedMessagesMap, selectedProviderId, availableProviders, selectedPromptId, availablePrompts]);

  return { estimatedTokens, isLoading };
};
