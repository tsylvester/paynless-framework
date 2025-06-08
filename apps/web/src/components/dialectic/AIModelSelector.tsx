import React, { useMemo, useEffect } from 'react';
import { InternalDropdownButton } from './InternalDropdownButton';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown } from 'lucide-react';
import { useDialecticStore, useAiStore } from '@paynless/store';
import {
  selectSelectedModelIds,
} from '@paynless/store';
import { MultiplicitySelector } from './MultiplicitySelector';

interface AIModelSelectorProps {
  disabled?: boolean;
}

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({
  disabled,
}) => {
  const { availableProviders, isConfigLoading, loadAiConfig, aiError } = useAiStore(state => ({
    availableProviders: state.availableProviders,
    isConfigLoading: state.isConfigLoading,
    loadAiConfig: state.loadAiConfig,
    aiError: state.aiError,
  }));

  const { currentSelectedModelIds, setModelMultiplicity } = useDialecticStore(state => ({
    currentSelectedModelIds: selectSelectedModelIds(state),
    setModelMultiplicity: state.setModelMultiplicity,
  }));

  // Calculate multiplicities
  const modelMultiplicities = useMemo(() => {
    const counts: Record<string, number> = {};
    if (currentSelectedModelIds) {
      for (const id of currentSelectedModelIds) {
        counts[id] = (counts[id] || 0) + 1;
      }
    }
    return counts;
  }, [currentSelectedModelIds]);

  // Fetch models on mount if not already loading, no providers yet, and no prior unhandled error.
  useEffect(() => {
    if (!isConfigLoading && (!availableProviders || availableProviders.length === 0) && !aiError) {
      loadAiConfig();
    }
  }, [loadAiConfig, isConfigLoading, availableProviders, aiError]);

  const handleMultiplicityChange = (modelId: string, newCount: number) => {
    setModelMultiplicity(modelId, newCount);
  };

  const selectedProviderNames = useMemo(() => {
    if (!availableProviders || availableProviders.length === 0) return 'No models available';

    const selectedModels = availableProviders.filter(
      (provider) => (modelMultiplicities[provider.id] || 0) > 0
    );

    if (selectedModels.length === 0) return 'No models selected';

    const names = selectedModels.map((provider) => {
      const count = modelMultiplicities[provider.id] || 0;
      return count > 1 ? `${provider.name} (x${count})` : provider.name;
    });

    if (names.length === 0) return 'No models selected';
    if (names.length > 2) return `${names.slice(0, 2).join(', ')}, +${names.length - 2} more`;
    return names.join(', ');
  }, [modelMultiplicities, availableProviders]);

  const hasContentProviders = availableProviders && availableProviders.length > 0;
  
  // Button is disabled if:
  // 1. `disabled` prop is true
  // 2. OR it's not loading, there's no error, AND there are no providers to show.
  const finalIsDisabled = 
    disabled || 
    (!isConfigLoading && !aiError && !hasContentProviders);

  // Determine dropdown content sections for clarity
  let dropdownContent: React.ReactNode = null;
  if (isConfigLoading) {
    dropdownContent = <DropdownMenuLabel>Loading models...</DropdownMenuLabel>;
  } else if (aiError) {
    dropdownContent = (
      <DropdownMenuLabel className="text-destructive">
        Error: {aiError || 'Failed to load models'}
      </DropdownMenuLabel>
    );
  } else if (hasContentProviders) {
    dropdownContent = (
      <>
        <DropdownMenuLabel>Choose one or more models</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-40">
          {availableProviders.map((provider) => (
            <DropdownMenuItem
              key={provider.id}
              onSelect={(event) => { 
                event.preventDefault();
              }}
              className="flex justify-start items-center"
              data-testid={`model-item-${provider.id}`}
            >
              <div className="flex-shrink-0">
                <MultiplicitySelector
                  value={modelMultiplicities[provider.id] || 0}
                  onChange={(newCount) => handleMultiplicityChange(provider.id, newCount)}
                  minValue={0}
                  disabled={finalIsDisabled}
                />
              </div>
              <span className="flex-1 min-w-0 ml-2 truncate" title={provider.name}>{provider.name}</span>
            </DropdownMenuItem>
          ))}
        </ScrollArea>
      </>
    );
  } else { 
    // Not loading, no error, no providers
    dropdownContent = <DropdownMenuLabel>No models available to select.</DropdownMenuLabel>;
  }

  return (
    <div className="inline-block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <InternalDropdownButton
            variant="outline"
            className="justify-between"
            disabled={finalIsDisabled}
            aria-label="Select AI Models"
          >
            <span className="truncate" title={selectedProviderNames}>{selectedProviderNames}</span>
            <ChevronDown data-slot="icon" className="ml-2 size-4 shrink-0 opacity-50" />
          </InternalDropdownButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[calc(var(--radix-dropdown-menu-trigger-width))] min-w-64 bg-background/80 backdrop-blur-md">
          {dropdownContent}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}; 