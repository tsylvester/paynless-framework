'use client'; // For client-side interactivity

import React from 'react';
import { useAiStore } from '@paynless/store';
import type { AiProvider } from '@paynless/types';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; 
// import { Label } from '@/components/ui/label';
import { logger } from '@paynless/utils';

interface ModelSelectorProps {
  selectedProviderId: string | null;
  onProviderChange: (providerId: string) => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedProviderId,
  onProviderChange,
  disabled = false,
}) => {
  logger.debug('ModelSelector rendered');
  const { availableProviders, isConfigLoading } = useAiStore(state => ({
    availableProviders: state.availableProviders,
    isConfigLoading: state.isConfigLoading,
  }));

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onProviderChange(event.target.value);
  };

  return (
    <div className="space-y-2">
      <label htmlFor="model-selector" className="block text-sm font-medium text-textPrimary">AI Model</label>
      <select
        id="model-selector"
        value={selectedProviderId ?? ''}
        onChange={handleChange}
        disabled={disabled || isConfigLoading || !availableProviders || availableProviders.length === 0}
        className="input mt-1 block w-full"
      >
        <option value="" disabled={!!selectedProviderId}>
          {isConfigLoading ? "Loading models..." : "Select an AI model"}
        </option>
        {availableProviders && availableProviders.map((provider: AiProvider) => (
          <option key={provider.id} value={provider.id}>
            {provider.name}
          </option>
        ))}
      </select>
      {!isConfigLoading && (!availableProviders || availableProviders.length === 0) && (
         <p className="text-sm text-textSecondary">Could not load AI models.</p>
      )}
    </div>
  );
}; 