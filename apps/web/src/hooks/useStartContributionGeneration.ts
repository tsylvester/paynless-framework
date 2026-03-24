import { useCallback, useMemo } from "react";
import {
  useDialecticStore,
  useWalletStore,
  useAiStore,
  selectViewingStage,
  selectSessionById,
  selectIsStageReadyForSessionIteration,
  selectUnifiedProjectProgress,
  selectSelectedModels,
  selectActiveChatWalletInfo,
  selectSortedStages,
} from "@paynless/store";
import {
  type DialecticSession,
  type GenerateContributionsPayload,
  type StartContributionGenerationResult,
  type UseStartContributionGenerationReturn,
} from "@paynless/types";
import { toast } from "sonner";

const GENERATION_STARTED_DESCRIPTION =
  "The AI is working. We will notify you when it is complete.";

export function useStartContributionGeneration(): UseStartContributionGenerationReturn {
  const generateContributions = useDialecticStore(
    (state) => state.generateContributions,
  );
  const resumePausedNsfJobs = useDialecticStore(
    (state) => state.resumePausedNsfJobs,
  );
  const pauseActiveJobs = useDialecticStore(
    (state) => state.pauseActiveJobs,
  );
  const generatingSessions = useDialecticStore(
    (state) => state.generatingSessions,
  );
  const currentProjectDetail = useDialecticStore(
    (state) => state.currentProjectDetail,
  );
  const activeContextSessionId = useDialecticStore(
    (state) => state.activeContextSessionId,
  );

  const unifiedProgress = useDialecticStore((state) => {
    const sid = state.activeContextSessionId;
    if (!sid) return null;
    try {
      return selectUnifiedProjectProgress(state, sid);
    } catch {
      return null;
    }
  });

  const newChatContext = useAiStore((state) => state.newChatContext);

  const activeWalletInfo = useWalletStore((state) =>
    selectActiveChatWalletInfo(state, newChatContext),
  );

  const selectedModels = useDialecticStore(selectSelectedModels);
  const viewingStage = useDialecticStore(selectViewingStage);
  const activeSession = useDialecticStore((state): DialecticSession | null => {
    const sid = state.activeContextSessionId;
    if (!sid) return null;
    const session = selectSessionById(state, sid);
    return session ?? null;
  });

  const isWalletReady =
    activeWalletInfo.status === "ok" && activeWalletInfo.walletId != null;

  const isStageReady = useDialecticStore((state) =>
    currentProjectDetail != null &&
    activeSession != null &&
    viewingStage != null
      ? selectIsStageReadyForSessionIteration(
          state,
          currentProjectDetail.id,
          activeSession.id,
          viewingStage.slug,
          activeSession.iteration_count,
        )
      : false,
  );

  const sortedStages = useDialecticStore(selectSortedStages);

  const { isViewingAheadOfCurrentStage, viewingAheadReason } = useMemo(() => {
    if (!activeSession || !viewingStage || !sortedStages.length) {
      return { isViewingAheadOfCurrentStage: false, viewingAheadReason: null };
    }
    const currentStageId = activeSession.current_stage_id;
    if (!currentStageId) {
      return { isViewingAheadOfCurrentStage: false, viewingAheadReason: null };
    }
    const currentIndex = sortedStages.findIndex((s) => s.id === currentStageId);
    const viewingIndex = sortedStages.findIndex((s) => s.id === viewingStage.id);
    if (currentIndex === -1 || viewingIndex === -1 || viewingIndex <= currentIndex) {
      return { isViewingAheadOfCurrentStage: false, viewingAheadReason: null };
    }
    const currentStageName = sortedStages[currentIndex]?.display_name ?? "the current stage";
    if (viewingIndex === currentIndex + 1) {
      return {
        isViewingAheadOfCurrentStage: true,
        viewingAheadReason: `Submit your responses for "${currentStageName}" first to unlock this stage.`,
      };
    }
    return {
      isViewingAheadOfCurrentStage: true,
      viewingAheadReason: `Complete prior stages first. You are currently on "${currentStageName}".`,
    };
  }, [activeSession, viewingStage, sortedStages]);

  const isSessionGenerating = useMemo((): boolean => {
    if (!activeContextSessionId) return false;
    const sessions = generatingSessions[activeContextSessionId];
    return Array.isArray(sessions) && sessions.length > 0;
  }, [activeContextSessionId, generatingSessions]);

  const areAnyModelsSelected = selectedModels.length > 0;

  const viewingStageProgress = useMemo(() => {
    if (!unifiedProgress?.stageDetails || !viewingStage) return undefined;
    return unifiedProgress.stageDetails.find(
      (s) => s.stageSlug === viewingStage.slug,
    );
  }, [unifiedProgress, viewingStage]);

  const hasPausedNsfJobs = viewingStageProgress?.stageStatus === "paused_nsf";
  const hasPausedUserJobs = viewingStageProgress?.stageStatus === "paused_user";

  const stageThreshold: number | undefined = useMemo(() => {
    if (!viewingStage) return undefined;
    return viewingStage.minimum_balance;
  }, [viewingStage]);

  const balanceMeetsThreshold = useMemo((): boolean => {
    if (stageThreshold === undefined) return false;
    const balanceNum = Number(activeWalletInfo.balance);
    return !Number.isNaN(balanceNum) && balanceNum >= stageThreshold;
  }, [stageThreshold, activeWalletInfo.balance]);

  const isResumeMode = (hasPausedNsfJobs && balanceMeetsThreshold) || hasPausedUserJobs;
  const isPauseMode = isSessionGenerating;

  const contributionsForStageAndIterationExist = useMemo((): boolean => {
    if (!activeSession || !viewingStage) return false;
    const contributions = activeSession.dialectic_contributions;
    if (!Array.isArray(contributions)) return false;
    return contributions.some(
      (c) =>
        c.stage === viewingStage.slug &&
        c.iteration_number === activeSession.iteration_count,
    );
  }, [activeSession, viewingStage]);

  const didGenerationFail = useMemo((): boolean => {
    if (!activeSession || !viewingStage) return false;
    const failedStatus = `${viewingStage.slug}_generation_failed`;
    return activeSession.status === failedStatus;
  }, [activeSession, viewingStage]);

  const isDisabled =
    !areAnyModelsSelected ||
    viewingStage == null ||
    activeSession == null ||
    !isStageReady ||
    !isWalletReady ||
    !balanceMeetsThreshold ||
    isViewingAheadOfCurrentStage;

  const showBalanceCallout =
    viewingStage != null &&
    stageThreshold !== undefined &&
    !balanceMeetsThreshold;

  const startContributionGeneration = useCallback(
    async (
      onOpenDagProgress?: () => void,
    ): Promise<StartContributionGenerationResult> => {
      const state = useDialecticStore.getState();
      const viewingStage = selectViewingStage(state);
      const activeContextSessionId = state.activeContextSessionId;
      if (activeContextSessionId == null) {
        const error = "No active session.";
        toast.error(error);
        return { success: false, error };
      }
      const activeSession = selectSessionById(state, activeContextSessionId);
      if (activeSession == null) {
        const error = "No active session.";
        toast.error(error);
        return { success: false, error };
      }
      if (typeof activeSession.iteration_count !== "number") {
        const error = "Session iteration count is invalid.";
        toast.error(error);
        return { success: false, error };
      }
      const currentProjectDetail = state.currentProjectDetail;
      if (currentProjectDetail == null) {
        const error = "No project selected.";
        toast.error(error);
        return { success: false, error };
      }
      if (viewingStage == null) {
        const error = "No active stage.";
        toast.error(error);
        return { success: false, error };
      }
      const walletState = useWalletStore.getState();
      const aiState = useAiStore.getState();
      const activeWalletInfo = selectActiveChatWalletInfo(
        walletState,
        aiState.newChatContext,
      );
      const continueUntilComplete = aiState.continueUntilComplete;
      if (activeWalletInfo.status !== "ok" || activeWalletInfo.walletId == null) {
        const error = "Wallet is not ready.";
        toast.error(error);
        return { success: false, error };
      }

      const walletId = activeWalletInfo.walletId;
      if (typeof walletId !== "string" || walletId === "") {
        const error = "No wallet available.";
        toast.error(error);
        return { success: false, error };
      }

      const iterationNumber = activeSession.iteration_count;
      const unifiedProgress = selectUnifiedProjectProgress(state, activeContextSessionId);
      const viewingStageProgress = unifiedProgress?.stageDetails?.find(
        (s) => s.stageSlug === viewingStage.slug,
      );
      const hasPausedNsfJobs = viewingStageProgress?.stageStatus === "paused_nsf";
      const hasPausedUserJobs = viewingStageProgress?.stageStatus === "paused_user";
      const balanceNum = Number(activeWalletInfo.balance);
      const balanceMeetsThreshold =
        !Number.isNaN(balanceNum) && balanceNum >= viewingStage.minimum_balance;
      const isResumeMode =
        (hasPausedNsfJobs && balanceMeetsThreshold) || hasPausedUserJobs;

      if (isResumeMode) {
        toast.success("Resuming generation...");
        onOpenDagProgress?.();
        await resumePausedNsfJobs({
          sessionId: activeSession.id,
          stageSlug: viewingStage.slug,
          iterationNumber,
        });
        return { success: true };
      }

      toast.success("Contribution generation started!", {
        description: GENERATION_STARTED_DESCRIPTION,
      });
      onOpenDagProgress?.();

      const payload: GenerateContributionsPayload = {
        sessionId: activeContextSessionId,
        projectId: currentProjectDetail.id,
        stageSlug: viewingStage.slug,
        iterationNumber,
        continueUntilComplete,
        walletId,
        idempotencyKey: '',
      };

      try {
        const result = await generateContributions(payload);
        const success = result.error == null;
        const error = result.error?.message;
        return { success, error };
      } catch (e: unknown) {
        const errorMessage =
          e instanceof Error
            ? e.message
            : "An unexpected error occurred while starting the generation process.";
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [generateContributions, resumePausedNsfJobs],
  );

  const pauseGeneration = useCallback(
    async (onOpenDagProgress?: () => void): Promise<void> => {
      const state = useDialecticStore.getState();
      const viewingStage = selectViewingStage(state);
      const activeContextSessionId = state.activeContextSessionId;
      if (activeContextSessionId == null) return;
      const activeSession = selectSessionById(state, activeContextSessionId);
      if (activeSession == null) return;
      if (viewingStage == null) return;
      onOpenDagProgress?.();
      toast.info("Pausing generation...");
      await pauseActiveJobs({
        sessionId: activeSession.id,
        stageSlug: viewingStage.slug,
        iterationNumber: activeSession.iteration_count,
      });
    },
    [pauseActiveJobs],
  );

  return {
    startContributionGeneration,
    isDisabled,
    isResumeMode,
    isSessionGenerating,
    isWalletReady,
    isStageReady,
    balanceMeetsThreshold,
    areAnyModelsSelected,
    hasPausedNsfJobs,
    hasPausedUserJobs,
    isPauseMode,
    pauseGeneration,
    didGenerationFail,
    contributionsForStageAndIterationExist,
    showBalanceCallout,
    viewingStage,
    activeSession,
    stageThreshold,
    isViewingAheadOfCurrentStage,
    viewingAheadReason,
  };
}
