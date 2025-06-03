'use client';

import { useEffect } from 'react';
import {
    useDialecticStore,
    selectAvailableDomainTags,
    selectIsLoadingDomainTags,
    selectDomainTagsError,
    selectSelectedDomainTag
} from '@paynless/store'; // Assuming store index exports these
import type { DomainTagDescriptor } from '@paynless/types';

// Assuming Shadcn Select components are available from this path or similar
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'; // Adjust this path if needed
import { logger } from '@paynless/utils';

export function DomainSelector() {
    // Actions and state from the store
    const fetchAvailableDomainTags = useDialecticStore(state => state.fetchAvailableDomainTags);
    const setSelectedDomainTag = useDialecticStore(state => state.setSelectedDomainTag);

    const availableDomainTags = useDialecticStore(selectAvailableDomainTags); // Removed 'as DomainTagDescriptor[]' cast
    const isLoadingDomainTags = useDialecticStore(selectIsLoadingDomainTags);
    const domainTagsError = useDialecticStore(selectDomainTagsError);
    const selectedDomainTag = useDialecticStore(selectSelectedDomainTag);

    useEffect(() => {
        logger.info('[DomainSelector] Component mounted, fetching domain tags.');
        fetchAvailableDomainTags();
    }, [fetchAvailableDomainTags]);

    const handleValueChange = (value: string) => {
        // The Shadcn Select might return an empty string if "nothing" is selected
        // or if a placeholder is somehow selected. We treat empty string as null.
        logger.info(`[DomainSelector] Value changed to: ${value}`);
        setSelectedDomainTag(value === '' ? null : value);
    };

    if (isLoadingDomainTags) {
        return <p className="text-sm text-muted-foreground">Loading domains...</p>; // Basic loading indicator
    }

    if (domainTagsError) {
        return (
            <div className="text-sm text-destructive">
                <p>Error loading domains:</p>
                <p className="font-mono text-xs">{domainTagsError.message}</p>
            </div>
        );
    }

    const formatDescriptor = (descriptor: DomainTagDescriptor): string => {
        let label = descriptor.domainTag;
        if (descriptor.description) {
            label += ` - ${descriptor.description}`;
        }
        if (descriptor.stageAssociation) {
            label += ` (${descriptor.stageAssociation})`;
        }
        return label;
    };

    return (
        <Select
            value={selectedDomainTag || ''} // Ensure value is not null for Select
            onValueChange={handleValueChange}
        >
            <SelectTrigger className="w-auto">
                <SelectValue placeholder="Select a domain" />
            </SelectTrigger>
            <SelectContent className="bg-background/90 backdrop-blur-md border-border">
                <SelectGroup>
                    {availableDomainTags.length === 0 && !isLoadingDomainTags && (
                        <SelectItem value="---" disabled>
                            No domains available
                        </SelectItem>
                    )}
                    {availableDomainTags.map((descriptor) => (
                        <SelectItem key={descriptor.id} value={descriptor.id}>
                            {formatDescriptor(descriptor)}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
} 