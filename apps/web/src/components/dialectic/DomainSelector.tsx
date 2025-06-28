'use client';

import { useEffect } from 'react';
import {
    useDialecticStore,
    selectDomains,
    selectIsLoadingDomains,
    selectDomainsError,
    selectSelectedDomain,
    selectCurrentProjectDetail,
} from '@paynless/store';
import type { DialecticDomain, DialecticProject } from '@paynless/types';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { logger } from '@paynless/utils';

export function DomainSelector() {
    const fetchDomains = useDialecticStore(state => state.fetchDomains);
    const setSelectedDomain = useDialecticStore(state => state.setSelectedDomain);

    const domains = useDialecticStore(selectDomains);
    const isLoading = useDialecticStore(selectIsLoadingDomains);
    const error = useDialecticStore(selectDomainsError);
    const selectedDomain = useDialecticStore(selectSelectedDomain);
    const currentProjectDetail = useDialecticStore(selectCurrentProjectDetail) as DialecticProject | null;

    useEffect(() => {
        // 1. Fetch domains if they are not already loaded.
        if (domains.length === 0 && !isLoading && !error) {
            logger.info('[DomainSelector] No domains found, fetching from server.');
            fetchDomains();
        }

        // 2. Once domains are loaded, set the selected domain based on priority.
        if (domains.length > 0 && !selectedDomain) {
            // Priority 1: Set domain from the current project if it exists.
            if (currentProjectDetail?.selected_domain_id) {
                const projectDomain = domains.find(d => d.id === currentProjectDetail.selected_domain_id);
                if (projectDomain) {
                    logger.info(`[DomainSelector] Setting domain based on current project: ${projectDomain.name}`);
                    setSelectedDomain(projectDomain);
                    return; // Domain set, exit.
                }
            }

            // Priority 2: Default to "Software Development" if no project domain is set.
            const softwareDevDomain = domains.find(d => d.name === 'Software Development');
            if (softwareDevDomain) {
                logger.info('[DomainSelector] Defaulting to "Software Development" domain.');
                setSelectedDomain(softwareDevDomain);
            }
        }
    }, [domains, currentProjectDetail, selectedDomain, isLoading, error, fetchDomains, setSelectedDomain]);

    const handleValueChange = (selectedDomainId: string) => {
        const domain = domains.find(d => d.id === selectedDomainId) || null;
        setSelectedDomain(domain);
    };

    if (isLoading) {
        return <div className="text-sm text-muted-foreground">Loading domains...</div>;
    }

    if (error) {
        return <div className="text-sm text-destructive">Error loading domains: {error.message}</div>;
    }

    if (!domains || domains.length === 0) {
        return <div className="text-sm text-muted-foreground">No domains available.</div>;
    }
    
    return (
        <div className="space-y-2">
            <Select
                value={selectedDomain?.id || ''}
                onValueChange={handleValueChange}
            >
                <SelectTrigger id="domain-selector">
                    <SelectValue placeholder="Choose domain..." />
                </SelectTrigger>
                <SelectContent className="bg-background/70 backdrop-blur-md">
                    {domains.map((domain: DialecticDomain) => (
                        <SelectItem key={domain.id} value={domain.id}>
                            {domain.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
} 