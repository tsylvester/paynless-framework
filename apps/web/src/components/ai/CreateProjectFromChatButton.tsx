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
} from "@paynless/store";
import type { CreateProjectPayload } from "@paynless/types";
import { logger } from "@paynless/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatChatMessagesAsPrompt } from "@/utils/formatChatMessagesAsPrompt";

export const CreateProjectFromChatButton: React.FC = () => {
  const navigate = useNavigate();
  const selectedMessages = useAiStore(selectSelectedChatMessages);
  const selectionState = useAiStore(selectCurrentChatSelectionState);
  const createProjectAndAutoStart = useDialecticStore(
    (state) => state.createProjectAndAutoStart
  );
  const fetchDomains = useDialecticStore((state) => state.fetchDomains);
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
    const selectedDomainId: string | undefined =
      selectSelectedDomain(useDialecticStore.getState())?.id;
    if (selectedDomainId === undefined) {
      toast.error("No domain available. Please try again later.");
      return;
    }
    const initialUserPrompt: string = formatChatMessagesAsPrompt(selectedMessages);
    const firstUserMessage = selectedMessages.find((m) => m.role === "user");
    const firstLine: string =
      firstUserMessage?.content?.split("\n")[0]?.trim() ?? "";
    const projectName: string =
      firstLine.length > 0 ? firstLine.slice(0, 50) : "Chat Project";
    const payload: CreateProjectPayload = {
      projectName,
      initialUserPrompt,
      selectedDomainId,
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
