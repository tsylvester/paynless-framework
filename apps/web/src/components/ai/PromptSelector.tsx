'use client'

import React from 'react'
import { useAiStore } from '@paynless/store'
import type { SystemPrompt } from '@paynless/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
//import { Label } from '@/components/ui/label'
import { logger } from '@paynless/utils'
// import { analytics } from '@paynless/analytics'; // Import if tracking directly here

interface PromptSelectorProps {
  // selectedPromptId: string | null; // Removed
  // onPromptChange: (promptId: string) => void; // Removed
  disabled?: boolean;
}

export const PromptSelector: React.FC<PromptSelectorProps> = ({
  // selectedPromptId, // Removed from destructuring
  // onPromptChange,   // Removed from destructuring
  disabled = false,
}) => {
  logger.debug('PromptSelector rendered')
  const {
    availablePrompts,
    isConfigLoading,
    selectedPromptId,   // Get from store
    setSelectedPrompt,  // Get action from store
  } = useAiStore((state) => ({
    availablePrompts: state.availablePrompts,
    isConfigLoading: state.isConfigLoading,
    selectedPromptId: state.selectedPromptId,
    setSelectedPrompt: state.setSelectedPrompt,
  }))

  const handleChange = (newPromptId: string) => {
    setSelectedPrompt(newPromptId); // Call store action directly
    // If analytics tracking is desired here, ensure analytics is imported and called.
    // analytics.track('Chat: Prompt Selected', { promptId: newPromptId }); 
    logger.info(`[PromptSelector] Prompt selected: ${newPromptId}, store action called.`)
  }

  return (
    <div className="space-y-2">
      {/* <Label>System Prompt</Label> */}

      <Select
        value={selectedPromptId ?? ''}
        onValueChange={handleChange}
        disabled={
          disabled ||
          isConfigLoading ||
          !availablePrompts ||
          availablePrompts.length === 0
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              isConfigLoading ? 'Loading prompts...' : 'Select a system prompt'
            }
          />
        </SelectTrigger>
        <SelectContent className="bg-background/70 backdrop-blur-md border border-border">
        <SelectItem key="__none__" value="__none__">
            -- None --
          </SelectItem>

          {availablePrompts &&
            availablePrompts.map((prompt: SystemPrompt) => (
              <SelectItem
                key={prompt.id}
                value={prompt.id}
              >
                {prompt.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {!isConfigLoading &&
        (!availablePrompts || availablePrompts.length === 0) && (
          <p className="text-sm text-textSecondary">
            Could not load system prompts.
          </p>
        )}
    </div>
  )
}
