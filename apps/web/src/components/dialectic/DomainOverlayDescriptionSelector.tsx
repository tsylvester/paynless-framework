'use client';

import React, { useEffect, useMemo } from 'react';
import {
    useDialecticStore,
    selectSelectedDomain,
    selectOverlay,
    selectSelectedDomainOverlayId,
    selectIsLoadingDomainOverlays,
    selectDomainOverlaysError,
} from '@paynless/store';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { logger } from '@paynless/utils';

export function DomainOverlayDescriptionSelector({ testId }: { testId?: string }) {
    const selectedDomain = useDialecticStore(selectSelectedDomain);
    
    const domainSpecificOverlays = useDialecticStore(
        state => selectOverlay(state, selectedDomain?.id || null) 
    );

    const selectedDomainOverlayId = useDialecticStore(selectSelectedDomainOverlayId);
    const setSelectedDomainOverlayId = useDialecticStore(state => state.setSelectedDomainOverlayId);
    const isLoadingDomainOverlays = useDialecticStore(selectIsLoadingDomainOverlays);
    const domainOverlaysError = useDialecticStore(selectDomainOverlaysError);

    const currentSelectedOverlayDetails = useMemo(() => {
        if (!selectedDomainOverlayId || !domainSpecificOverlays) return null;
        return domainSpecificOverlays.find(ov => ov.id === selectedDomainOverlayId) || null;
    }, [selectedDomainOverlayId, domainSpecificOverlays]);

    const baseDomainDescription = useMemo(() => {
        return selectedDomain?.description || null;
    }, [selectedDomain]);

    useEffect(() => {
        if (domainSpecificOverlays && domainSpecificOverlays.length === 1) {
            if (domainSpecificOverlays[0].id !== selectedDomainOverlayId) {
                logger.info(`[DomainOverlayDescriptionSelector] Auto-selecting single overlay: ${domainSpecificOverlays[0].id}`);
                setSelectedDomainOverlayId(domainSpecificOverlays[0].id);
            }
        } else if (selectedDomainOverlayId && domainSpecificOverlays && !domainSpecificOverlays.find(ov => ov.id === selectedDomainOverlayId)) {
            logger.info(`[DomainOverlayDescriptionSelector] Clearing stale selectedDomainOverlayId: ${selectedDomainOverlayId}`);
            setSelectedDomainOverlayId(null);
        }
    }, [domainSpecificOverlays, selectedDomainOverlayId, setSelectedDomainOverlayId]);

    if (!selectedDomain) {
        return null;
    }

    const descriptionToShow = currentSelectedOverlayDetails?.description || baseDomainDescription;

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

            {!isLoadingDomainOverlays && !domainOverlaysError && domainSpecificOverlays && domainSpecificOverlays.length > 1 && (
                <Select 
                    value={selectedDomainOverlayId || ""} 
                    onValueChange={(value) => setSelectedDomainOverlayId(value === "" ? null : value)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a specific configuration..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background/90 backdrop-blur-md border-border">
                        {domainSpecificOverlays.map((overlay) => (
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
                        {currentSelectedOverlayDetails ? 'Selected Configuration Details:' : 'Domain Overview:'}
                    </h4>
                    <p className="mt-1 text-sm">{descriptionToShow}</p>
                </div>
            )}
            
            {!isLoadingDomainOverlays && !domainOverlaysError && 
             (!domainSpecificOverlays || domainSpecificOverlays.length === 0) && 
             !descriptionToShow && (
                <p className="text-sm text-muted-foreground">
                    No specific configurations or overview available for {selectedDomain?.name || 'this domain'}.
                </p>
            )}
        </div>
    );
} 