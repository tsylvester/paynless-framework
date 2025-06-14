'use client';

import React, { useEffect, useMemo } from 'react';
import {
    useDialecticStore,
    selectSelectedDomainTag,
    selectOverlay,
    selectSelectedDomainOverlayId,
    selectIsLoadingDomainOverlays,
    selectDomainOverlaysError,
    selectAvailableDomainTags,
} from '@paynless/store';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { logger } from '@paynless/utils';

function snakeToSpacedTitleCase(str: string): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function DomainOverlayDescriptionSelector({ testId }: { testId?: string }) {
    const selectedDomainTag = useDialecticStore(selectSelectedDomainTag);
    const availableDomainTags = useDialecticStore(selectAvailableDomainTags);
    
    const tagSpecificOverlays = useDialecticStore(
        state => selectOverlay(state, selectedDomainTag) 
    );

    const selectedDomainOverlayId = useDialecticStore(selectSelectedDomainOverlayId);
    const setSelectedDomainOverlayId = useDialecticStore(state => state.setSelectedDomainOverlayId);
    const isLoadingDomainOverlays = useDialecticStore(selectIsLoadingDomainOverlays);
    const domainOverlaysError = useDialecticStore(selectDomainOverlaysError);

    const currentSelectedOverlayDetails = useMemo(() => {
        if (!selectedDomainOverlayId || !tagSpecificOverlays) return null;
        return tagSpecificOverlays.find(ov => ov.id === selectedDomainOverlayId) || null;
    }, [selectedDomainOverlayId, tagSpecificOverlays]);

    const baseDomainTagDescription = useMemo(() => {
        if (!selectedDomainTag || !availableDomainTags) return null;
        const currentTagDescriptor = availableDomainTags.find(tag => tag.domainTag === selectedDomainTag);
        return currentTagDescriptor?.description || null;
    }, [selectedDomainTag, availableDomainTags]);

    useEffect(() => {
        if (tagSpecificOverlays && tagSpecificOverlays.length === 1) {
            if (tagSpecificOverlays[0].id !== selectedDomainOverlayId) {
                logger.info(`[DomainOverlayDescriptionSelector] Auto-selecting single overlay: ${tagSpecificOverlays[0].id}`);
                setSelectedDomainOverlayId(tagSpecificOverlays[0].id);
            }
        } else if (selectedDomainOverlayId && tagSpecificOverlays && !tagSpecificOverlays.find(ov => ov.id === selectedDomainOverlayId)) {
            logger.info(`[DomainOverlayDescriptionSelector] Clearing stale selectedDomainOverlayId: ${selectedDomainOverlayId}`);
            setSelectedDomainOverlayId(null);
        }
    }, [tagSpecificOverlays, selectedDomainOverlayId, setSelectedDomainOverlayId]);

    if (!selectedDomainTag) {
        return null;
    }

    const descriptionToShow = currentSelectedOverlayDetails?.description || baseDomainTagDescription;

    return (
        <div className="mt-4 space-y-2" data-testid={testId}>
            {isLoadingDomainOverlays && (
                 <div className="p-3 border rounded-md bg-card text-card-foreground">
                    <p className="text-sm text-muted-foreground">Loading specific configurations...</p>
                 </div>
            )}
            {domainOverlaysError && (
                <div className="p-3 border rounded-md bg-destructive text-destructive-foreground">
                     <p className="text-sm">Error loading specific configurations: {domainOverlaysError.message}</p>
                </div>
            )}

            {!isLoadingDomainOverlays && !domainOverlaysError && tagSpecificOverlays && tagSpecificOverlays.length > 1 && (
                <Select 
                    value={selectedDomainOverlayId || ""} 
                    onValueChange={(value) => setSelectedDomainOverlayId(value === "" ? null : value)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a specific configuration..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background/90 backdrop-blur-md border-border">
                        {tagSpecificOverlays.map((overlay) => (
                            <SelectItem key={overlay.id} value={overlay.id}>
                                {overlay.description || `Configuration ID: ${overlay.id}`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            {descriptionToShow && (
                <div className="p-3 border rounded-md bg-card text-card-foreground">
                    <h4 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                        {currentSelectedOverlayDetails ? 'Selected Configuration Details:' : ''}
                    </h4>
                    <p className="mt-1 text-sm">{descriptionToShow}</p>
                </div>
            )}
            
            {!isLoadingDomainOverlays && !domainOverlaysError && 
             (!tagSpecificOverlays || tagSpecificOverlays.length === 0) && 
             !descriptionToShow && (
                <p className="text-sm text-muted-foreground">
                    No specific configurations or overview available for {selectedDomainTag ? snakeToSpacedTitleCase(selectedDomainTag) : 'this domain'}.
                </p>
            )}
        </div>
    );
} 