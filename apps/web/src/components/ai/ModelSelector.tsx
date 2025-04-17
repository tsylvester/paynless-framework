'use client' // For client-side interactivity

import React from 'react'
import { useAiStore } from '@paynless/store'
import type { AiProvider } from '@paynless/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
//import { Label } from '@/components/ui/label'
import { logger } from '@paynless/utils'

interface ModelSelectorProps {
  selectedProviderId: string | null
  onProviderChange: (providerId: string) => void
  disabled?: boolean
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedProviderId,
  onProviderChange,
  disabled = false,
}) => {
  logger.debug('ModelSelector rendered')
  const { availableProviders, isConfigLoading } = useAiStore((state) => ({
    availableProviders: state.availableProviders,
    isConfigLoading: state.isConfigLoading,
  }))

  const handleChange = (val: string) => {
    onProviderChange(val)
  }

  return (
    <div className="space-y-2">
      {/* <Label>AI Model</Label> */}
      <Select
        value={selectedProviderId ?? ''}
        onValueChange={handleChange}
        disabled={
          disabled ||
          isConfigLoading ||
          !availableProviders ||
          availableProviders.length === 0
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              isConfigLoading ? 'Loading models...' : 'Select an AI model'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {availableProviders &&
            availableProviders.map((provider: AiProvider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {!isConfigLoading &&
        (!availableProviders || availableProviders.length === 0) && (
          <p className="text-sm text-textSecondary">
            Could not load AI models.
          </p>
        )}
    </div>
  )
}
