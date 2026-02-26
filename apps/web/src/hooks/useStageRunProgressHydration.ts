import { useEffect, useRef } from 'react';
import { useDialecticStore, useAuthStore, selectSortedStages } from '@paynless/store';

export const useStageRunProgressHydration = (): void => {
    const user = useAuthStore((state) => state.user);
    const activeContextSessionId = useDialecticStore((state) => state.activeContextSessionId);
    const activeStageSlug = useDialecticStore((state) => state.activeStageSlug);
    const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
    const recipesByStageSlug = useDialecticStore((state) => state.recipesByStageSlug);
    const sortedStages = useDialecticStore(selectSortedStages);
    const fetchStageRecipe = useDialecticStore((state) => state.fetchStageRecipe);
    const ensureRecipeForActiveStage = useDialecticStore((state) => state.ensureRecipeForActiveStage);
    const hydrateAllStageProgress = useDialecticStore((state) => state.hydrateAllStageProgress);
    const hydrateStageProgress = useDialecticStore((state) => state.hydrateStageProgress);

    const hasHydratedAllStagesRef = useRef<string | null>(null);
    const isFetchingRef = useRef(false);

    // Hydrate progress and recipes for ALL stages on initial load
    useEffect(() => {
        if (!activeContextSessionId || !activeSessionDetail || !user || sortedStages.length === 0) {
            return;
        }
        if (hasHydratedAllStagesRef.current === activeContextSessionId) {
            return;
        }
        const userId = user.id;
        const projectId = activeSessionDetail.project_id;
        const iterationNumber = activeSessionDetail.iteration_count;
        const hydrateAll = async (): Promise<void> => {
            // Fetch recipes for all stages in parallel
            await Promise.all(
                sortedStages.map((stage) => fetchStageRecipe(stage.slug)),
            );
            // Ensure progress snapshots exist for all stages
            const currentRecipes = useDialecticStore.getState().recipesByStageSlug;
            for (const stage of sortedStages) {
                if (currentRecipes[stage.slug]) {
                    await ensureRecipeForActiveStage(
                        activeContextSessionId,
                        stage.slug,
                        iterationNumber,
                    );
                }
            }
            await hydrateAllStageProgress({
                sessionId: activeContextSessionId,
                iterationNumber,
                userId,
                projectId,
            });
            hasHydratedAllStagesRef.current = activeContextSessionId;
        };
        void hydrateAll();
    }, [user, activeContextSessionId, activeSessionDetail, sortedStages, hydrateAllStageProgress, fetchStageRecipe, ensureRecipeForActiveStage]);

    useEffect(() => {
        if (!activeContextSessionId || !activeStageSlug || !activeSessionDetail || !user) {
            return;
        }

        const userId = user.id;
        const projectId = activeSessionDetail.project_id;

        const hydrate = async () => {
            await fetchStageRecipe(activeStageSlug);
            await ensureRecipeForActiveStage(
                activeContextSessionId,
                activeStageSlug,
                activeSessionDetail.iteration_count,
            );
            await hydrateStageProgress({
                sessionId: activeContextSessionId,
                stageSlug: activeStageSlug,
                iterationNumber: activeSessionDetail.iteration_count,
                userId,
                projectId,
            });
        };

        const ensureProgress = async () => {
            await ensureRecipeForActiveStage(
                activeContextSessionId,
                activeStageSlug,
                activeSessionDetail.iteration_count,
            );
            await hydrateStageProgress({
                sessionId: activeContextSessionId,
                stageSlug: activeStageSlug,
                iterationNumber: activeSessionDetail.iteration_count,
                userId,
                projectId,
            });
        };

        const hydrateIfNeeded = async () => {
            if (isFetchingRef.current) {
                return;
            }
            isFetchingRef.current = true;
            try {
                if (recipesByStageSlug[activeStageSlug]) {
                    await ensureProgress();
                } else {
                    await hydrate();
                }
            } finally {
                isFetchingRef.current = false;
            }
        };

        void hydrateIfNeeded();
    }, [
        user,
        activeContextSessionId,
        activeStageSlug,
        activeSessionDetail,
        recipesByStageSlug,
        fetchStageRecipe,
        ensureRecipeForActiveStage,
        hydrateStageProgress,
    ]);
};

