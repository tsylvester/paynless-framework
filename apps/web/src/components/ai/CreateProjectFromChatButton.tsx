"use client";

import React from "react";
import { useNavigate } from "react-router-dom";
import {
  useAiStore,
  selectSelectedChatMessages,
  selectCurrentChatSelectionState,
  useDialecticStore,
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
} from "@paynless/types";
import { ComputeCostCeilingReturn, logger } from "@paynless/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatChatMessagesAsPrompt } from "@/utils/formatChatMessagesAsPrompt";

const noEstimateToastCopy =
  "No cost estimate yet. Set the output cap in Model Settings, then try again.";

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
      await fetchProcessTemplate(processTemplateId);
      await fetchStageExpectedCounts({
        processTemplateId,
        modelCount: defaultModelCount,
      });

      const preProjectCostCeilingResult: ComputeCostCeilingReturn | null =
        selectPreProjectCostCeiling(useDialecticStore.getState());

      if (preProjectCostCeilingResult === null) {
        toast.error(noEstimateToastCopy);
        return;
      }

      if ("error" in preProjectCostCeilingResult) {
        toast.error(preProjectCostCeilingResult.error.message);
        return;
      }

      const currentProcessTemplate =
        useDialecticStore.getState().currentProcessTemplate;
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

      const walletBalance: string | null = selectActiveChatWalletInfo(
        useWalletStore.getState(),
        useAiStore.getState().newChatContext
      ).balance;

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
