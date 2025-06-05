'use client';

import { useEffect, useMemo } from 'react';
import {
    useDialecticStore,
    selectAvailableDomainTags,
    selectIsLoadingDomainTags,
    selectDomainTagsError,
    selectSelectedDomainTag,
    selectSelectedStageAssociation,
    selectSelectedDomainOverlayId,
    selectOverlay
} from '@paynless/store'; // Assuming store index exports these
import type { DomainTagDescriptor, DialecticStage } from '@paynless/types';

// Assuming Shadcn Select components are available from this path or similar
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'; // Adjust this path if needed
import { logger } from '@paynless/utils';

// Helper function to convert snake_case to Spaced Title Case
function snakeToSpacedTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function DomainSelector() {
    // Actions and state from the store
    const fetchAvailableDomainTagsAction = useDialecticStore(state => state.fetchAvailableDomainTags);
    const setSelectedDomainTagAction = useDialecticStore(state => state.setSelectedDomainTag);
    const fetchAvailableDomainOverlaysAction = useDialecticStore(state => state.fetchAvailableDomainOverlays);
    const setSelectedDomainOverlayIdAction = useDialecticStore(state => state.setSelectedDomainOverlayId);

    const availableDomainTags = useDialecticStore(selectAvailableDomainTags);
    const isLoadingDomainTags = useDialecticStore(selectIsLoadingDomainTags);
    const domainTagsError = useDialecticStore(selectDomainTagsError);
    const currentSelectedDomainTag = useDialecticStore(selectSelectedDomainTag);
    const currentSelectedStageAssociation: DialecticStage | null = useDialecticStore(selectSelectedStageAssociation);
    const currentSelectedDomainOverlayId = useDialecticStore(selectSelectedDomainOverlayId);

    useEffect(() => {
        logger.info('[DomainSelector] Component mounted, fetching domain tags if needed.');
        fetchAvailableDomainTagsAction();
    }, [fetchAvailableDomainTagsAction]);

    useEffect(() => {
        if (currentSelectedStageAssociation) {
            logger.info(`[DomainSelector] Stage association is ${currentSelectedStageAssociation}, fetching domain overlays.`);
            fetchAvailableDomainOverlaysAction(currentSelectedStageAssociation);
        }
    }, [currentSelectedStageAssociation, fetchAvailableDomainOverlaysAction]);

    const filteredDomainTags = useMemo(() => {
        if (!currentSelectedStageAssociation || !Array.isArray(availableDomainTags) || availableDomainTags.length === 0) {
            logger.info('[DomainSelector] No stage association selected or no available domain tags. Returning empty for filtered domain tags.', { currentSelectedStageAssociation, availableDomainTagsCount: availableDomainTags?.length });
            return [];
        }
        logger.info(`[DomainSelector] Filtering domain tags for stage: ${currentSelectedStageAssociation}`);
        const filtered = availableDomainTags.filter(tagDesc => tagDesc.stageAssociation === currentSelectedStageAssociation);
        logger.info(`[DomainSelector] Found ${filtered.length} domain tag descriptors for stage ${currentSelectedStageAssociation}.`);
        return filtered;
    }, [availableDomainTags, currentSelectedStageAssociation]);

    const overlaysForCurrentTag = useDialecticStore(state => selectOverlay(state, currentSelectedDomainTag));

    useEffect(() => {
        if (currentSelectedDomainTag && overlaysForCurrentTag && overlaysForCurrentTag.length === 1) {
            const singleOverlayId = overlaysForCurrentTag[0].id;
            if (singleOverlayId !== currentSelectedDomainOverlayId) {
                logger.info(`[DomainSelector] Auto-selecting single overlay: ${singleOverlayId} for domain tag ${currentSelectedDomainTag}`);
                setSelectedDomainOverlayIdAction(singleOverlayId);
            }
        }
    }, [currentSelectedDomainTag, overlaysForCurrentTag, currentSelectedDomainOverlayId, setSelectedDomainOverlayIdAction]);

    if (isLoadingDomainTags) {
        return <div className="text-sm text-muted-foreground">Loading domains...</div>;
    }

    if (domainTagsError) {
        return <div className="text-sm text-destructive">Error loading domains: {domainTagsError.message}</div>;
    }

    if (!filteredDomainTags || filteredDomainTags.length === 0) {
        return <div className="text-sm text-muted-foreground">No domains available for the current stage.</div>;
    }
    
    const handleValueChange = (newlySelectedTagValue: string) => {
        setSelectedDomainTagAction(newlySelectedTagValue);
        setSelectedDomainOverlayIdAction(null);
    };

    return (
        <div className="space-y-2">
            <Select
                value={currentSelectedDomainTag || undefined}
                onValueChange={handleValueChange}
            >
                <SelectTrigger id="domain-tag-selector">
                    <SelectValue placeholder="Choose domain..." />
                </SelectTrigger>
                <SelectContent className="bg-background/70 backdrop-blur-md">
                    {filteredDomainTags.map((descriptor: DomainTagDescriptor) => (
                        <SelectItem key={descriptor.id} value={descriptor.domainTag}>
                            {snakeToSpacedTitleCase(descriptor.domainTag)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
} 