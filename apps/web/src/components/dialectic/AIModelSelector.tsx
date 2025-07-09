import React, { useMemo, useEffect } from 'react';
import { InternalDropdownButton } from './InternalDropdownButton';
import type { AiProvider } from '@paynless/types';
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

const SelectedModelsDisplayContent: React.FC<{
  availableProviders: AiProvider[] | null | undefined;
  currentSelectedModelIds: string[] | null;
}> = ({ availableProviders, currentSelectedModelIds }) => {
  if (!availableProviders || availableProviders.length === 0) {
    return <span className="text-muted-foreground text-sm">No models available</span>;
  }

  if (!currentSelectedModelIds || currentSelectedModelIds.length === 0) {
    return <span className="text-sm">No models selected</span>;
  }

  return (
    <div className="flex flex-col items-start">
      {currentSelectedModelIds.map((modelId, index) => {
        const provider = availableProviders.find(p => p.id === modelId);
        const displayName = provider ? provider.name : 'Unknown Model';
        return <div key={`${modelId}-${index}`} className="truncate w-full leading-tight text-sm" title={displayName}>{displayName}</div>;
      })}
    </div>
  );
};

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

  const modelMultiplicities = useMemo(() => {
    const counts: Record<string, number> = {};
    if (currentSelectedModelIds) {
      for (const id of currentSelectedModelIds) {
        counts[id] = (counts[id] || 0) + 1;
      }
    }
    return counts;
  }, [currentSelectedModelIds]);

  useEffect(() => {
    if (!isConfigLoading && (!availableProviders || availableProviders.length === 0) && !aiError) {
      loadAiConfig();
    }
  }, [loadAiConfig, isConfigLoading, availableProviders, aiError]);

  const handleMultiplicityChange = (modelId: string, newCount: number) => {
    setModelMultiplicity(modelId, newCount);
  };

  const hasContentProviders = availableProviders && availableProviders.length > 0;
  
  const finalIsDisabled = 
    disabled || 
    (!isConfigLoading && !aiError && !hasContentProviders);

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
    dropdownContent = <DropdownMenuLabel>No models available to select.</DropdownMenuLabel>;
  }

  return (
    <div className={`inline-block ${
      (!currentSelectedModelIds || currentSelectedModelIds.length === 0) && !finalIsDisabled && !isConfigLoading && !aiError
        ? 'ring-2 ring-primary animate-pulse rounded-lg p-0.5'
        : ''
    }`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <InternalDropdownButton
            variant="outline"
            className="justify-between items-start h-auto py-2 text-left w-48"
            disabled={finalIsDisabled}
            aria-label="Select AI Models"
          >
            <div className="flex-grow mr-1">
              <SelectedModelsDisplayContent
                availableProviders={availableProviders}
                currentSelectedModelIds={currentSelectedModelIds}
              />
            </div>
            <ChevronDown data-slot="icon" className="ml-1 size-4 shrink-0 opacity-50" />
          </InternalDropdownButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[calc(var(--radix-dropdown-menu-trigger-width))] min-w-64 bg-background/80 backdrop-blur-md">
          {dropdownContent}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}; 