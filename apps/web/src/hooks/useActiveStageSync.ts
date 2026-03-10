import { useEffect } from 'react';
import { useDialecticStore, selectSortedStages } from '@paynless/store';

/**
 * Synchronizes activeContextStage with activeStageSlug
 * This ensures that when a stage is selected by slug, the full stage object is also set
 */
export const useActiveStageSync = (): void => {
    const activeStageSlug = useDialecticStore((state) => state.activeStageSlug);
    const sortedStages = useDialecticStore(selectSortedStages);
    const setActiveContextStage = useDialecticStore((state) => state.setActiveContextStage);
    const activeContextStage = useDialecticStore((state) => state.activeContextStage);
    
    useEffect(() => {
        if (!activeStageSlug) {
            // Clear the context stage if no slug is selected
            if (activeContextStage) {
                setActiveContextStage(null);
            }
            return;
        }
        
        // Find the stage object that matches the slug
        const stage = sortedStages.find(s => s.slug === activeStageSlug);
        
        // Only update if it's different to avoid unnecessary re-renders
        if (stage && stage.id !== activeContextStage?.id) {
            console.log('[useActiveStageSync] Syncing activeContextStage with activeStageSlug:', {
                slug: activeStageSlug,
                stageId: stage.id,
                stageName: stage.display_name
            });
            setActiveContextStage(stage);
        } else if (!stage && activeContextStage) {
            // Clear if stage not found but context stage is set
            console.log('[useActiveStageSync] Clearing activeContextStage - stage not found for slug:', activeStageSlug);
            setActiveContextStage(null);
        }
    }, [activeStageSlug, sortedStages, setActiveContextStage, activeContextStage]);
};