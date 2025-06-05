import React, { useMemo, useEffect } from 'react';
import { InternalDropdownButton } from './InternalDropdownButton';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { StyledDropdownCheckboxItem } from '../common/StyledDropdownCheckboxItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown } from 'lucide-react';
import { useDialecticStore, useAiStore } from '@paynless/store';
import {
  selectSelectedModelIds,
} from '@paynless/store';

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

  const { currentSelectedModelIds, toggleSelectedModelId } = useDialecticStore(state => ({
    currentSelectedModelIds: selectSelectedModelIds(state),
    toggleSelectedModelId: state.toggleSelectedModelId,
  }));

  // Fetch models on mount if not already loading, no providers yet, and no prior unhandled error.
  useEffect(() => {
    if (!isConfigLoading && (!availableProviders || availableProviders.length === 0) && !aiError) {
      loadAiConfig();
    }
  }, [loadAiConfig, isConfigLoading, availableProviders, aiError]);

  const handleModelSelection = (modelId: string) => {
    toggleSelectedModelId(modelId);
  };

  const selectedProviderNames = useMemo(() => {
    if (!availableProviders || availableProviders.length === 0) return 'No models available';
    if (currentSelectedModelIds.length === 0) return 'No models selected';

    const names = availableProviders
      .filter(provider => currentSelectedModelIds.includes(provider.id))
      .map(provider => provider.name);

    if (names.length === 0) return 'No models selected';
    if (names.length > 2) return `${names.slice(0, 2).join(', ')}, +${names.length - 2} more`;
    return names.join(', ');
  }, [currentSelectedModelIds, availableProviders]);

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
            <StyledDropdownCheckboxItem
              key={provider.id}
              checked={currentSelectedModelIds.includes(provider.id)}
              onCheckedChange={() => handleModelSelection(provider.id)}
              onSelect={(event) => { 
                event.preventDefault();
              }}
            >
              {provider.name}
            </StyledDropdownCheckboxItem>
          ))}
        </ScrollArea>
      </>
    );
  } else { 
    // Not loading, no error, no providers
    dropdownContent = <DropdownMenuLabel>No models available to select.</DropdownMenuLabel>;
  }

  return (
    <div className="grid gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <InternalDropdownButton
            variant="outline"
            className="w-full justify-between"
            disabled={finalIsDisabled}
            aria-label="Select AI Models"
          >
            <span className="truncate">{selectedProviderNames}</span>
            <ChevronDown data-slot="icon" className="ml-2 size-4 shrink-0 opacity-50" />
          </InternalDropdownButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[calc(var(--radix-dropdown-menu-trigger-width))] bg-background/80 backdrop-blur-md">
          {dropdownContent}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}; 