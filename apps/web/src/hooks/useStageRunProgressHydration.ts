import { useEffect, useRef } from 'react';
import { useDialecticStore, useAuthStore } from '@paynless/store';

export const useStageRunProgressHydration = (): void => {
    const user = useAuthStore((state) => state.user);
    const activeContextSessionId = useDialecticStore((state) => state.activeContextSessionId);
    const activeStageSlug = useDialecticStore((state) => state.activeStageSlug);
    const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
    const recipesByStageSlug = useDialecticStore((state) => state.recipesByStageSlug);
    const fetchStageRecipe = useDialecticStore((state) => state.fetchStageRecipe);
    const ensureRecipeForActiveStage = useDialecticStore((state) => state.ensureRecipeForActiveStage);
    const hydrateAllStageProgress = useDialecticStore((state) => state.hydrateAllStageProgress);
    const hydrateStageProgress = useDialecticStore((state) => state.hydrateStageProgress);

    const hasHydratedAllStagesRef = useRef<string | null>(null);
    const isFetchingRef = useRef(false);

    useEffect(() => {
        if (!activeContextSessionId || !activeSessionDetail || !user) {
            return;
        }
        if (hasHydratedAllStagesRef.current === activeContextSessionId) {
            return;
        }
        const userId = user.id;
        const projectId = activeSessionDetail.project_id;
        const iterationNumber = activeSessionDetail.iteration_count;
        const hydrateAll = async (): Promise<void> => {
            await hydrateAllStageProgress({
                sessionId: activeContextSessionId,
                iterationNumber,
                userId,
                projectId,
            });
            hasHydratedAllStagesRef.current = activeContextSessionId;
        };
        void hydrateAll();
    }, [user, activeContextSessionId, activeSessionDetail, hydrateAllStageProgress]);

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

