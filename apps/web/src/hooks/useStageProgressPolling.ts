import { useEffect, useRef } from 'react';
import { useDialecticStore, useAuthStore, selectSortedStages } from '@paynless/store';

const POLLING_INTERVAL = 1000; // Poll every 1 second for more responsive updates
const FINAL_POLL_INTERVAL = 500; // Poll every 500ms after generation completes for quick final updates

export const useStageProgressPolling = (): void => {
    const user = useAuthStore((state) => state.user);
    const activeContextSessionId = useDialecticStore((state) => state.activeContextSessionId);
    const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
    const generatingForStageSlug = useDialecticStore((state) => state.generatingForStageSlug);
    const contributionGenerationStatus = useDialecticStore((state) => state.contributionGenerationStatus);
    const generatingSessions = useDialecticStore((state) => state.generatingSessions);
    const sortedStages = useDialecticStore(selectSortedStages);
    const hydrateStageProgress = useDialecticStore((state) => state.hydrateStageProgress);
    const hydrateAllStageProgress = useDialecticStore((state) => state.hydrateAllStageProgress);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const wasGeneratingRef = useRef<boolean>(false);
    const finalPollCountRef = useRef<number>(0);
    
    useEffect(() => {
        const isGenerating = contributionGenerationStatus === 'generating' && generatingForStageSlug;
        
        // Check if generation just completed
        if (wasGeneratingRef.current && !isGenerating) {
            // Generation just finished, do a few final polls
            wasGeneratingRef.current = false;
            finalPollCountRef.current = 0;
        }
        
        // Update the ref for next comparison
        if (isGenerating) {
            wasGeneratingRef.current = true;
        }
        
        // Continue polling for more cycles after generation completes to ensure we catch final state
        const shouldPoll = isGenerating || (finalPollCountRef.current < 10 && !isGenerating && wasGeneratingRef.current === false);
        
        if (!shouldPoll || !activeContextSessionId || !activeSessionDetail || !user) {
            // Clear any existing interval
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                finalPollCountRef.current = 0;
            }
            return;
        }
        
        const userId = user.id;
        const projectId = activeSessionDetail.project_id;
        const iterationNumber = activeSessionDetail.iteration_count;
        
        // Function to poll all stages for comprehensive progress update
        const pollProgress = async (): Promise<void> => {
            try {
                // Hydrate all stages to ensure counters and buttons update properly
                await hydrateAllStageProgress({
                    sessionId: activeContextSessionId,
                    iterationNumber,
                    userId,
                    projectId,
                });
                
                // Increment final poll count if we're in the post-generation phase
                if (!isGenerating) {
                    finalPollCountRef.current += 1;
                }
            } catch (error) {
                console.error('[useStageProgressPolling] Error polling stage progress:', error);
            }
        };
        
        // Start polling immediately
        void pollProgress();
        
        // Set up interval for continued polling - use faster interval after generation completes
        const pollInterval = isGenerating ? POLLING_INTERVAL : FINAL_POLL_INTERVAL;
        intervalRef.current = setInterval(() => {
            void pollProgress();
        }, pollInterval);
        
        // Cleanup on unmount or dependency change
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [
        user,
        activeContextSessionId,
        activeSessionDetail,
        generatingForStageSlug,
        contributionGenerationStatus,
        hydrateAllStageProgress,
    ]);
    
    // Detect when generation status changes and force immediate refresh
    const prevGenerationStatusRef = useRef<string | null>(null);
    useEffect(() => {
        // Check if status changed from generating to idle
        const statusChanged = prevGenerationStatusRef.current === 'generating' && contributionGenerationStatus === 'idle';
        prevGenerationStatusRef.current = contributionGenerationStatus;
        
        if (statusChanged || (contributionGenerationStatus === 'idle' && !generatingForStageSlug)) {
            // Generation just completed, do immediate comprehensive refreshes
            if (!activeContextSessionId || !activeSessionDetail || !user) {
                return;
            }
            
            const userId = user.id;
            const projectId = activeSessionDetail.project_id;
            const iterationNumber = activeSessionDetail.iteration_count;
            
            const finalRefresh = async (): Promise<void> => {
                try {
                    // Do multiple refreshes to ensure we catch the final state
                    for (let i = 0; i < 3; i++) {
                        await hydrateAllStageProgress({
                            sessionId: activeContextSessionId,
                            iterationNumber,
                            userId,
                            projectId,
                        });
                        // Small delay between refreshes
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (error) {
                    console.error('[useStageProgressPolling] Error on final refresh:', error);
                }
            };
            
            void finalRefresh();
        }
    }, [contributionGenerationStatus, generatingForStageSlug, activeContextSessionId, activeSessionDetail, user, hydrateAllStageProgress]);
    
    // Watch for changes in generating sessions to trigger immediate refresh
    const prevGeneratingSessionsRef = useRef<string>('');
    useEffect(() => {
        if (!activeContextSessionId || !activeSessionDetail || !user) {
            return;
        }
        
        // Check if generating sessions changed
        const currentGeneratingSessions = JSON.stringify(generatingSessions[activeContextSessionId] || []);
        const hasChanged = prevGeneratingSessionsRef.current !== '' && 
                          prevGeneratingSessionsRef.current !== currentGeneratingSessions;
        prevGeneratingSessionsRef.current = currentGeneratingSessions;
        
        if (hasChanged) {
            const userId = user.id;
            const projectId = activeSessionDetail.project_id;
            const iterationNumber = activeSessionDetail.iteration_count;
            
            // Immediately refresh when generating sessions change
            const immediateRefresh = async (): Promise<void> => {
                try {
                    await hydrateAllStageProgress({
                        sessionId: activeContextSessionId,
                        iterationNumber,
                        userId,
                        projectId,
                    });
                } catch (error) {
                    console.error('[useStageProgressPolling] Error on generating sessions change:', error);
                }
            };
            
            void immediateRefresh();
        }
    }, [generatingSessions, activeContextSessionId, activeSessionDetail, user, hydrateAllStageProgress]);
    
    // Also poll when stage completes to ensure we catch the final state
    useEffect(() => {
        if (!activeContextSessionId || !activeSessionDetail || !user) {
            return;
        }
        
        const currentStageId = activeSessionDetail.current_stage_id;
        const iterationNumber = activeSessionDetail.iteration_count;
        const userId = user.id;
        const projectId = activeSessionDetail.project_id;
        
        // Find the current stage
        const currentStage = sortedStages.find(stage => stage.id === currentStageId);
        if (!currentStage) {
            return;
        }
        
        // Refresh the current stage progress when component mounts or stage changes
        const refreshCurrentStage = async (): Promise<void> => {
            try {
                await hydrateStageProgress({
                    sessionId: activeContextSessionId,
                    stageSlug: currentStage.slug,
                    iterationNumber,
                    userId,
                    projectId,
                });
            } catch (error) {
                console.error('[useStageProgressPolling] Error refreshing current stage:', error);
            }
        };
        
        void refreshCurrentStage();
    }, [
        activeContextSessionId,
        activeSessionDetail,
        sortedStages,
        hydrateStageProgress,
    ]);
};