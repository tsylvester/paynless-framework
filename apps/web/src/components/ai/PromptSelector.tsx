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
import { Label } from '@/components/ui/label'
import { logger } from '@paynless/utils'

interface PromptSelectorProps {
  selectedPromptId: string | null
  onPromptChange: (promptId: string) => void
  disabled?: boolean
}

export const PromptSelector: React.FC<PromptSelectorProps> = ({
  selectedPromptId,
  onPromptChange,
  disabled = false,
}) => {
  logger.debug('PromptSelector rendered')
  const { availablePrompts, isConfigLoading } = useAiStore((state) => ({
    availablePrompts: state.availablePrompts,
    isConfigLoading: state.isConfigLoading,
  }))

  const handleChange = (val: string) => {
    onPromptChange(val)
  }

  return (
    <div className="space-y-2">
      <Label>System Prompt</Label>

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
        <SelectContent>
          {availablePrompts &&
            availablePrompts.map((prompt: SystemPrompt) => (
              <SelectItem
                key={prompt.id}
                value={prompt.id}
                disabled={!!selectedPromptId}
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
