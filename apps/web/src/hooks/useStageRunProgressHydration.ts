import { useEffect } from 'react';
import { useDialecticStore, useAuthStore, selectSortedStages, selectUnifiedProjectProgress } from '@paynless/store';

export const useStageRunProgressHydration = (): void => {
    const user = useAuthStore((state) => state.user);
    const activeContextSessionId = useDialecticStore((state) => state.activeContextSessionId);
    const activeStageSlug = useDialecticStore((state) => state.activeStageSlug);
    const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
    const recipesByStageSlug = useDialecticStore((state) => state.recipesByStageSlug);
    const progressHydrationStatus = useDialecticStore((state) => state.progressHydrationStatus);
    const sortedStages = useDialecticStore(selectSortedStages);
    const hydrationReady = useDialecticStore((state) => {
        const sid = state.activeContextSessionId;
        if (!sid) return false;
        try {
            return selectUnifiedProjectProgress(state, sid).hydrationReady;
        } catch {
            return false;
        }
    });
    const fetchStageRecipe = useDialecticStore((state) => state.fetchStageRecipe);
    const ensureRecipeForActiveStage = useDialecticStore((state) => state.ensureRecipeForActiveStage);
    const hydrateAllStageProgress = useDialecticStore((state) => state.hydrateAllStageProgress);
    const hydrateStageProgress = useDialecticStore((state) => state.hydrateStageProgress);

    // Hydrate progress and recipes for ALL stages on initial load
    useEffect(() => {
        if (!activeContextSessionId || !activeSessionDetail || !user || sortedStages.length === 0) {
            return;
        }
        const iterationNumber = activeSessionDetail.iteration_count;
        const runKey = `${activeContextSessionId}:${iterationNumber}`;
        const status = progressHydrationStatus[runKey];
        if (status === 'pending') {
            return;
        }
        if (status === 'success' && hydrationReady) {
            return;
        }
        const userId = user.id;
        const projectId = activeSessionDetail.project_id;
        const hydrateAll = async (): Promise<void> => {
            try {
                await Promise.all(
                    sortedStages.map((stage) => fetchStageRecipe(stage.slug)),
                );
                const currentRecipes = useDialecticStore.getState().recipesByStageSlug;
                const missingSlugs: string[] = sortedStages
                    .filter((stage) => !currentRecipes[stage.slug])
                    .map((stage) => stage.slug);
                if (missingSlugs.length > 0) {
                    console.error(
                        '[useStageRunProgressHydration] Recipe fetch did not populate all stages; missing:',
                        missingSlugs,
                    );
                    return;
                }
                for (const stage of sortedStages) {
                    await ensureRecipeForActiveStage(
                        activeContextSessionId,
                        stage.slug,
                        iterationNumber,
                    );
                }
                await hydrateAllStageProgress({
                    sessionId: activeContextSessionId,
                    iterationNumber,
                    userId,
                    projectId,
                });
            } catch (err: unknown) {
                console.error('[useStageRunProgressHydration] Hydrate-all failed:', err);
            }
        };
        void hydrateAll();
    }, [
        user,
        activeContextSessionId,
        activeSessionDetail,
        sortedStages,
        progressHydrationStatus,
        hydrationReady,
        fetchStageRecipe,
        ensureRecipeForActiveStage,
        hydrateAllStageProgress,
    ]);

    useEffect(() => {
        if (!activeContextSessionId || !activeStageSlug || !activeSessionDetail || !user) {
            return;
        }
        const iterationNumber = activeSessionDetail.iteration_count;
        const progressKey = `${activeContextSessionId}:${activeStageSlug}:${iterationNumber}`;
        const status = progressHydrationStatus[progressKey];
        if (status === 'success' || status === 'pending') {
            return;
        }
        const userId = user.id;
        const projectId = activeSessionDetail.project_id;
        const runPerStage = async (): Promise<void> => {
            try {
                if (recipesByStageSlug[activeStageSlug]) {
                    await ensureRecipeForActiveStage(
                        activeContextSessionId,
                        activeStageSlug,
                        iterationNumber,
                    );
                    await hydrateStageProgress({
                        sessionId: activeContextSessionId,
                        stageSlug: activeStageSlug,
                        iterationNumber,
                        userId,
                        projectId,
                    });
                } else {
                    await fetchStageRecipe(activeStageSlug);
                    await ensureRecipeForActiveStage(
                        activeContextSessionId,
                        activeStageSlug,
                        iterationNumber,
                    );
                    await hydrateStageProgress({
                        sessionId: activeContextSessionId,
                        stageSlug: activeStageSlug,
                        iterationNumber,
                        userId,
                        projectId,
                    });
                }
            } catch (err: unknown) {
                console.error('[useStageRunProgressHydration] Per-stage hydrate failed:', err);
            }
        };
        void runPerStage();
    }, [
        user,
        activeContextSessionId,
        activeStageSlug,
        activeSessionDetail,
        recipesByStageSlug,
        progressHydrationStatus,
        fetchStageRecipe,
        ensureRecipeForActiveStage,
        hydrateStageProgress,
    ]);
};
