'use client';

import React from 'react';
import { useAiStore } from '@paynless/store';
import type { SystemPrompt } from '@paynless/types';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { Label } from '@/components/ui/label';
import { logger } from '@paynless/utils';

interface PromptSelectorProps {
  selectedPromptId: string | null;
  onPromptChange: (promptId: string) => void;
  disabled?: boolean;
}

export const PromptSelector: React.FC<PromptSelectorProps> = ({
  selectedPromptId,
  onPromptChange,
  disabled = false,
}) => {
  const { availablePrompts, isConfigLoading } = useAiStore(state => ({
    availablePrompts: state.availablePrompts,
    isConfigLoading: state.isConfigLoading,
  }));

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onPromptChange(event.target.value);
  };

  return (
    <div className="space-y-2">
      <label htmlFor="prompt-selector" className="block text-sm font-medium text-textPrimary">System Prompt</label>
      <select
        id="prompt-selector"
        value={selectedPromptId ?? ''}
        onChange={handleChange}
        disabled={disabled || isConfigLoading || !availablePrompts || availablePrompts.length === 0}
        className="input mt-1 block w-full"
      >
        <option value="" disabled={!!selectedPromptId}>
           {isConfigLoading ? "Loading prompts..." : "Select a system prompt"}
        </option>
        {/* Option for no prompt */}
        <option value="__none__">-- None --</option> 
        {availablePrompts && availablePrompts.map((prompt) => (
          <option key={prompt.id} value={prompt.id}>
            {prompt.name}
          </option>
        ))}
      </select>
      {!isConfigLoading && (!availablePrompts || availablePrompts.length === 0) && (
         <p className="text-sm text-textSecondary">Could not load system prompts.</p>
      )}
    </div>
  );
}; 