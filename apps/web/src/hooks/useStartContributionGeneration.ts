import { useCallback, useMemo } from "react";
import {
  useDialecticStore,
  useWalletStore,
  useAiStore,
  selectActiveStage,
  selectSessionById,
  selectIsStageReadyForSessionIteration,
  selectUnifiedProjectProgress,
  selectSelectedModels,
  selectActiveChatWalletInfo,
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
  const store = useDialecticStore();
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

  const continueUntilComplete = useAiStore(
    (state) => state.continueUntilComplete,
  );
  const newChatContext = useAiStore((state) => state.newChatContext);

  const activeWalletInfo = useWalletStore((state) =>
    selectActiveChatWalletInfo(state, newChatContext),
  );

  const selectedModels = useDialecticStore(selectSelectedModels);
  const activeStage = useMemo(() => selectActiveStage(store), [store]);
  const activeSession = useMemo((): DialecticSession | null => {
    if (!activeContextSessionId) return null;
    const session = selectSessionById(store, activeContextSessionId);
    return session ?? null;
  }, [store, activeContextSessionId]);

  const isWalletReady =
    activeWalletInfo.status === "ok" && activeWalletInfo.walletId != null;

  const isStageReady = useDialecticStore((state) =>
    currentProjectDetail != null &&
    activeSession != null &&
    activeStage != null
      ? selectIsStageReadyForSessionIteration(
          state,
          currentProjectDetail.id,
          activeSession.id,
          activeStage.slug,
          activeSession.iteration_count,
        )
      : false,
  );

  const isSessionGenerating = useMemo((): boolean => {
    if (!activeContextSessionId) return false;
    const sessions = generatingSessions[activeContextSessionId];
    return Array.isArray(sessions) && sessions.length > 0;
  }, [activeContextSessionId, generatingSessions]);

  const areAnyModelsSelected = selectedModels.length > 0;

  const activeStageProgress = useMemo(() => {
    if (!unifiedProgress?.stageDetails || !activeStage) return undefined;
    return unifiedProgress.stageDetails.find(
      (s) => s.stageSlug === activeStage.slug,
    );
  }, [unifiedProgress, activeStage]);

  const hasPausedNsfJobs = activeStageProgress?.stageStatus === "paused_nsf";
  const hasPausedUserJobs = activeStageProgress?.stageStatus === "paused_user";

  const stageThreshold: number | undefined = useMemo(() => {
    if (!activeStage) return undefined;
    return activeStage.minimum_balance;
  }, [activeStage]);

  const balanceMeetsThreshold = useMemo((): boolean => {
    if (stageThreshold === undefined) return false;
    const balanceNum = Number(activeWalletInfo.balance);
    return !Number.isNaN(balanceNum) && balanceNum >= stageThreshold;
  }, [stageThreshold, activeWalletInfo.balance]);

  const isResumeMode = (hasPausedNsfJobs && balanceMeetsThreshold) || hasPausedUserJobs;
  const isPauseMode = isSessionGenerating;

  const contributionsForStageAndIterationExist = useMemo((): boolean => {
    if (!activeSession || !activeStage) return false;
    const contributions = activeSession.dialectic_contributions;
    if (!Array.isArray(contributions)) return false;
    return contributions.some(
      (c) =>
        c.stage === activeStage.slug &&
        c.iteration_number === activeSession.iteration_count,
    );
  }, [activeSession, activeStage]);

  const didGenerationFail = useMemo((): boolean => {
    if (!activeSession || !activeStage) return false;
    const failedStatus = `${activeStage.slug}_generation_failed`;
    return activeSession.status === failedStatus;
  }, [activeSession, activeStage]);

  const isDisabled =
    !areAnyModelsSelected ||
    activeStage == null ||
    activeSession == null ||
    !isStageReady ||
    !isWalletReady ||
    !balanceMeetsThreshold;

  const showBalanceCallout =
    activeStage != null &&
    stageThreshold !== undefined &&
    !balanceMeetsThreshold;

  const startContributionGeneration = useCallback(
    async (
      onOpenDagProgress?: () => void,
    ): Promise<StartContributionGenerationResult> => {
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
      if (currentProjectDetail == null) {
        const error = "No project selected.";
        toast.error(error);
        return { success: false, error };
      }
      if (activeStage == null) {
        const error = "No active stage.";
        toast.error(error);
        return { success: false, error };
      }
      if (activeContextSessionId == null) {
        const error = "No active session ID.";
        toast.error(error);
        return { success: false, error };
      }
      if (!isWalletReady) {
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

      if (isResumeMode) {
        toast.success("Resuming generation...");
        onOpenDagProgress?.();
        await resumePausedNsfJobs({
          sessionId: activeSession.id,
          stageSlug: activeStage.slug,
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
        stageSlug: activeStage.slug,
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
    [
      activeSession,
      currentProjectDetail,
      activeStage,
      activeContextSessionId,
      isWalletReady,
      activeWalletInfo.walletId,
      isResumeMode,
      continueUntilComplete,
      resumePausedNsfJobs,
      generateContributions,
    ],
  );

  const pauseGeneration = useCallback(
    async (onOpenDagProgress?: () => void): Promise<void> => {
      if (activeSession == null || activeStage == null) return;
      onOpenDagProgress?.();
      toast.info("Pausing generation...");
      await pauseActiveJobs({
        sessionId: activeSession.id,
        stageSlug: activeStage.slug,
        iterationNumber: activeSession.iteration_count,
      });
    },
    [activeSession, activeStage, pauseActiveJobs],
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
    activeStage,
    activeSession,
    stageThreshold,
  };
}
