import { useEffect } from 'react';
import {
    useDialecticStore,
    selectDomains,
    selectIsLoadingDomains,
    selectDomainsError,
} from '@paynless/store';
import type { DialecticDomain } from '@paynless/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logger } from '@paynless/utils';

interface DomainMultiSelectorProps {
    selectedDomainId: string;
    onSelectionChange: (domainId: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function DomainMultiSelector({
    selectedDomainId,
    onSelectionChange,
    placeholder = "Select a domain...",
    disabled = false
}: DomainMultiSelectorProps) {
    const fetchDomains = useDialecticStore(state => state.fetchDomains);
    const domains = useDialecticStore(selectDomains);
    const isLoading = useDialecticStore(selectIsLoadingDomains);
    const error = useDialecticStore(selectDomainsError);

    useEffect(() => {
        // Fetch domains if they are not already loaded
        if (domains.length === 0 && !isLoading && !error) {
            logger.info('[DomainMultiSelector] No domains found, fetching from server.');
            fetchDomains();
        }
    }, [domains.length, isLoading, error, fetchDomains]);

    const handleDomainChange = (domainId: string) => {
        logger.info('[DomainMultiSelector] Domain selection changed:', {
            domainId,
            previousSelection: selectedDomainId
        });
        
        onSelectionChange(domainId);
    };

    if (isLoading) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                Loading domains...
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-sm text-destructive p-4">
                Error loading domains: {error.message}
            </div>
        );
    }

    if (!domains || domains.length === 0) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                No domains available.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="text-sm font-medium text-foreground">
                {placeholder}
            </div>
            <ScrollArea className="max-h-[300px] pr-4">
                <RadioGroup
                    value={selectedDomainId}
                    onValueChange={handleDomainChange}
                    disabled={disabled}
                    className="space-y-3"
                >
                    {domains.map((domain: DialecticDomain) => (
                        <div key={domain.id} className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                            <RadioGroupItem 
                                value={domain.id} 
                                id={domain.id}
                                className="mt-0.5"
                            />
                            <div className="flex-1 space-y-1">
                                <Label 
                                    htmlFor={domain.id}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                    {domain.name}
                                </Label>
                                {domain.description && (
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {domain.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </RadioGroup>
            </ScrollArea>
        </div>
    );
}
