'use client' // For client-side interactivity

import React, { useEffect } from 'react'
import { useAiStore } from '@paynless/store'
import type { AiProvider } from '@paynless/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { logger } from '@paynless/utils'
// import { analytics } from '@paynless/analytics'; // Import if tracking directly here

interface ModelSelectorProps {
  disabled?: boolean
  isDevelopmentEnvironment?: boolean
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  disabled = false,
  isDevelopmentEnvironment = false,
}) => {
  logger.debug('ModelSelector rendered')
  const {
    availableProviders,
    isConfigLoading,
    selectedProviderId,
    setSelectedProvider,
  } = useAiStore((state) => ({
    availableProviders: state.availableProviders,
    isConfigLoading: state.isConfigLoading,
    selectedProviderId: state.selectedProviderId,
    setSelectedProvider: state.setSelectedProvider,
  }))
  
  useEffect(() => {
    console.log('EFFECT DEBUG - selectedProviderId:', selectedProviderId);
    console.log('EFFECT DEBUG - availableProviders:', availableProviders ? JSON.stringify(availableProviders.map(p => p.id)) : 'undefined');
    console.log('EFFECT DEBUG - MODE:', (import.meta.env as { MODE: string }).MODE);

    if (availableProviders && availableProviders.length > 0) {
      if (!selectedProviderId) {
        if (isDevelopmentEnvironment) { // Use the prop here
          const dummyProvider = availableProviders.find(p => p.id === 'dummy-test-provider');
          if (dummyProvider) {
            setSelectedProvider(dummyProvider.id); 
            logger.info('[AiChatPage] Default provider set to Dummy Test Provider via store action.');
            return; 
          }
        }
        // Fallback to the first provider if dummy not found or not in dev mode
        setSelectedProvider(availableProviders[0].id); 
        logger.info(`[AiChatPage] Default provider set to: ${availableProviders[0].name} (ID: ${availableProviders[0].id}) via store action`);
      }
    } else if (!selectedProviderId) {
      setSelectedProvider(null); 
    }
  }, [availableProviders, selectedProviderId, setSelectedProvider, isDevelopmentEnvironment]); // Add prop to dependency array

  const handleChange = (newProviderId: string) => {
    setSelectedProvider(newProviderId)
    // If analytics tracking is desired here, ensure analytics is imported and called.
    // analytics.track('Chat: Provider Selected', { providerId: newProviderId });
    logger.info(`[ModelSelector] Provider selected: ${newProviderId}, store action called.`)
  }
  
  return (
    <div className="space-y-2">
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
        <SelectContent className="bg-background/70 backdrop-blur-md border border-border">
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
