"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAiStore,
  selectSelectedChatMessages,
  selectCurrentChatSelectionState,
  useDialecticStore,
  useAuthStore,
  selectDomains,
  selectSelectedDomain,
  selectDefaultGenerationModels,
  selectPreProjectCostCeiling,
  selectActiveChatWalletInfo,
  useWalletStore,
} from "@paynless/store";
import type {
  CreateProjectAndAutoStartPayload,
  DialecticDomainRow,
  DialecticStage,
  InitializeMaxOutputTokensResult,
} from "@paynless/types";
import { ComputeCostCeilingReturn, logger } from "@paynless/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatChatMessagesAsPrompt } from "@/utils/formatChatMessagesAsPrompt";

const subscriptionTierUnavailableMessage =
  "Subscription tier is not available.";

const nsfToastCopy =
  "Insufficient tokens for auto-start. Top up your wallet to continue.";

export const CreateProjectFromChatButton: React.FC = () => {
  const navigate = useNavigate();
  const selectedMessages = useAiStore(selectSelectedChatMessages);
  const selectionState = useAiStore(selectCurrentChatSelectionState);
  const createProjectAndAutoStart = useDialecticStore(
    (state) => state.createProjectAndAutoStart
  );
  const fetchDomains = useDialecticStore((state) => state.fetchDomains);
  const fetchProcessAssociation = useDialecticStore(
    (state) => state.fetchProcessAssociation
  );
  const fetchProcessTemplate = useDialecticStore(
    (state) => state.fetchProcessTemplate
  );
  const fetchStageExpectedCounts = useDialecticStore(
    (state) => state.fetchStageExpectedCounts
  );
  const fetchAIModelCatalog = useDialecticStore(
    (state) => state.fetchAIModelCatalog
  );
  const isAutoStarting = useDialecticStore((state) => state.isAutoStarting);
  const autoStartStep = useDialecticStore((state) => state.autoStartStep);
  const domains = useDialecticStore(selectDomains);
  const isLoadingModelCatalog = useDialecticStore(
    (state) => state.isLoadingModelCatalog
  );
  const modelCatalog = useDialecticStore((state) => state.modelCatalog);
  const initializeMaxOutputTokens = useDialecticStore(
    (state) => state.initializeMaxOutputTokens
  );

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const userTier = useAuthStore((state) => state.userTier);

  const [_capInitResult, setCapInitResult] =
    useState<InitializeMaxOutputTokensResult | null>(null);

  const isCapInitReady: boolean =
    !authIsLoading &&
    userTier !== null &&
    !isLoadingModelCatalog &&
    modelCatalog.length > 0;

  useEffect(() => {
    if (!isCapInitReady) {
      setCapInitResult(null);
      return;
    }
    const initResult: InitializeMaxOutputTokensResult =
      initializeMaxOutputTokens();
    if (initResult.ok === true) {
      setCapInitResult(null);
      return;
    }
    setCapInitResult(initResult);
  }, [authIsLoading, userTier, isLoadingModelCatalog, modelCatalog.length]);

  const isDisabled: boolean =
    selectionState === "none" ||
    selectionState === "empty" ||
    isAutoStarting;

  const handleClick = async (): Promise<void> => {
    if (domains.length === 0) {
      await fetchDomains();
    }

    const selectedDomain: DialecticDomainRow | null = selectSelectedDomain(
      useDialecticStore.getState()
    );
    if (selectedDomain?.id === undefined) {
      toast.error("No domain available. Please try again later.");
      return;
    }

    await fetchProcessAssociation({ domainId: selectedDomain.id });

    const associationProcessTemplateId: string | undefined =
      useDialecticStore.getState().selectedDomainProcessAssociation
        ?.process_template_id;
    if (
      associationProcessTemplateId === undefined ||
      associationProcessTemplateId.length === 0
    ) {
      toast.error("No process template available for this domain.");
      return;
    }

    const processTemplateId: string = associationProcessTemplateId;

    const dialecticStateAfterAssociation = useDialecticStore.getState();
    if (
      dialecticStateAfterAssociation.modelCatalog.length === 0 &&
      !dialecticStateAfterAssociation.isLoadingModelCatalog
    ) {
      await fetchAIModelCatalog();
    }

    const defaultModelCount: number = new Set(
      selectDefaultGenerationModels(useDialecticStore.getState()).map(
        (model) => model.id
      )
    ).size;

    if (defaultModelCount >= 1) {
      const autostartCapInitResult: InitializeMaxOutputTokensResult =
        initializeMaxOutputTokens();

      await fetchProcessTemplate(processTemplateId);
      await fetchStageExpectedCounts({
        processTemplateId,
        modelCount: defaultModelCount,
      });

      const authStateAtClick = useAuthStore.getState();
      const dialecticStateAtClick = useDialecticStore.getState();
      const walletInfoAtClick = selectActiveChatWalletInfo(
        useWalletStore.getState(),
        useAiStore.getState().newChatContext
      );

      const isCostEstimateLoading: boolean =
        authStateAtClick.isLoading ||
        dialecticStateAtClick.isLoadingModelCatalog ||
        dialecticStateAtClick.isLoadingDomainProcessAssociation ||
        dialecticStateAtClick.isLoadingProcessTemplate ||
        dialecticStateAtClick.isLoadingStageExpectedCounts ||
        walletInfoAtClick.isLoadingPrimaryWallet;

      if (isCostEstimateLoading) {
        if (authStateAtClick.isLoading) {
          toast.error("Loading subscription tier…");
        } else if (dialecticStateAtClick.isLoadingModelCatalog) {
          toast.error("Loading model catalog…");
        } else if (dialecticStateAtClick.isLoadingDomainProcessAssociation) {
          toast.error("Loading domain process association…");
        } else if (dialecticStateAtClick.isLoadingProcessTemplate) {
          toast.error("Loading process template…");
        } else if (dialecticStateAtClick.isLoadingStageExpectedCounts) {
          toast.error("Loading stage expected counts…");
        } else if (walletInfoAtClick.isLoadingPrimaryWallet) {
          toast.error("Loading wallet balance…");
        }
        return;
      }

      if (authStateAtClick.error !== null) {
        toast.error(authStateAtClick.error.message);
        return;
      }
      if (authStateAtClick.userTier === null) {
        toast.error(subscriptionTierUnavailableMessage);
        return;
      }
      if (autostartCapInitResult.ok === false) {
        toast.error(autostartCapInitResult.error.message);
        return;
      }

      const preProjectCostCeilingResult: ComputeCostCeilingReturn =
        selectPreProjectCostCeiling(dialecticStateAtClick);

      if ("error" in preProjectCostCeilingResult) {
        toast.error(preProjectCostCeilingResult.error.message);
        return;
      }

      const currentProcessTemplate =
        dialecticStateAtClick.currentProcessTemplate;
      const startingStageId: string | null =
        currentProcessTemplate?.starting_stage_id ?? null;
      const stages: DialecticStage[] = currentProcessTemplate?.stages ?? [];
      const firstStage: DialecticStage | undefined = stages.find(
        (stage) => stage.id === startingStageId
      );
      const firstStageSlug: string | undefined = firstStage?.slug;

      let firstStageCeiling: number | null = null;
      if (firstStageSlug !== undefined) {
        const rawFirstStageCeiling: number =
          preProjectCostCeilingResult.stageCeilings[firstStageSlug];
        if (
          Number.isFinite(rawFirstStageCeiling) &&
          rawFirstStageCeiling >= 0
        ) {
          firstStageCeiling = rawFirstStageCeiling;
        }
      }

      const walletBalance: string | null = walletInfoAtClick.balance;

      if (
        firstStageCeiling === null ||
        walletBalance === null ||
        Number(walletBalance) < firstStageCeiling
      ) {
        toast.error(nsfToastCopy);
        return;
      }
    }

    const initialUserPrompt: string = formatChatMessagesAsPrompt(selectedMessages);
    const firstUserMessage = selectedMessages.find((m) => m.role === "user");
    const firstLine: string =
      firstUserMessage?.content?.split("\n")[0]?.trim() ?? "";
    const projectName: string =
      firstLine.length > 0 ? firstLine.slice(0, 50) : "Chat Project";
    const idempotencyKey: string = crypto.randomUUID();
    const sessionIdempotencyKey: string = crypto.randomUUID();
    const payload: CreateProjectAndAutoStartPayload = {
      projectName,
      initialUserPrompt,
      selectedDomainId: selectedDomain.id,
      processTemplateId,
      idempotencyKey,
      sessionIdempotencyKey,
    };
    try {
      const result = await createProjectAndAutoStart(payload);
      if (result.error) {
        toast.error(
          result.error.message ?? "Failed to create project"
        );
        return;
      }
      if (result.sessionId !== null) {
        navigate(
          `/dialectic/${result.projectId}/session/${result.sessionId}`,
          { state: { autoStartGeneration: result.hasDefaultModels } }
        );
      } else {
        navigate(`/dialectic/${result.projectId}`);
      }
    } catch (e) {
      logger.error("CreateProjectFromChatButton error", {
        error: e instanceof Error ? e.message : String(e),
      });
      toast.error(e instanceof Error ? e.message : "Failed to create project");
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isDisabled}
      size="sm"
      variant="outline"
      data-testid="create-project-from-chat-button"
    >
      {isAutoStarting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {autoStartStep ?? "Creating…"}
        </>
      ) : (
        "Create Project"
      )}
    </Button>
  );
};
