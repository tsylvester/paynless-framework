import { useEffect, useRef } from 'react';
import { useDialecticStore } from '@paynless/store';

export const useStageRunProgressHydration = (): void => {
    const activeContextSessionId = useDialecticStore((state) => state.activeContextSessionId);
    const activeStageSlug = useDialecticStore((state) => state.activeStageSlug);
    const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
    const recipesByStageSlug = useDialecticStore((state) => state.recipesByStageSlug);
    const fetchStageRecipe = useDialecticStore((state) => state.fetchStageRecipe);
    const ensureRecipeForActiveStage = useDialecticStore((state) => state.ensureRecipeForActiveStage);

    const isFetchingRef = useRef(false);

    useEffect(() => {
        if (!activeContextSessionId || !activeStageSlug || !activeSessionDetail) {
            return;
        }

        const hydrate = async () => {
            await fetchStageRecipe(activeStageSlug);
            await ensureRecipeForActiveStage(
                activeContextSessionId,
                activeStageSlug,
                activeSessionDetail.iteration_count,
            );
        };

        const ensureProgress = async () => {
            await ensureRecipeForActiveStage(
                activeContextSessionId,
                activeStageSlug,
                activeSessionDetail.iteration_count,
            );
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
        activeContextSessionId,
        activeStageSlug,
        activeSessionDetail,
        recipesByStageSlug,
        fetchStageRecipe,
        ensureRecipeForActiveStage,
    ]);
};

