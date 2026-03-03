import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	useDialecticStore,
	selectSelectedModels,
	selectSessionById,
	selectActiveStage,
	selectIsStageReadyForSessionIteration,
	selectUnifiedProjectProgress,
	useWalletStore,
	selectActiveChatWalletInfo,
} from "@paynless/store";
import { GenerateContributionsPayload, getDisplayName, STAGE_BALANCE_THRESHOLDS } from "@paynless/types";
import { useAiStore } from "@paynless/store";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StageDAGProgressDialog } from "./StageDAGProgressDialog";

interface GenerateContributionButtonProps {
	className?: string;
}

export const GenerateContributionButton: React.FC<
	GenerateContributionButtonProps
> = ({ className }) => {
	const store = useDialecticStore();
	const {
		generateContributions,
		generatingSessions,
		currentProjectDetail,
		activeContextSessionId,
		resumePausedNsfJobs,
	} = useDialecticStore((state) => ({
		generateContributions: state.generateContributions,
		generatingSessions: state.generatingSessions,
		currentProjectDetail: state.currentProjectDetail,
		activeContextSessionId: state.activeContextSessionId,
		resumePausedNsfJobs: state.resumePausedNsfJobs,
	}));
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

	// Get active wallet info (reactive to chat context)
	const newChatContext = useAiStore((state) => state.newChatContext);
	const activeWalletInfo = useWalletStore((state) =>
		selectActiveChatWalletInfo(state, newChatContext),
	);
	const isWalletReady =
		activeWalletInfo.status === "ok" && activeWalletInfo.walletId;

	const selectedModels = useDialecticStore(selectSelectedModels);
	const activeStage = useMemo(() => selectActiveStage(store), [store]);
	const activeSession = useMemo(
		() =>
			activeContextSessionId
				? selectSessionById(store, activeContextSessionId)
				: null,
		[store, activeContextSessionId],
	);

	const [dagDialogOpen, setDagDialogOpen] = useState(false);

	const isStageReady = useDialecticStore((state) =>
		currentProjectDetail && activeSession && activeStage
			? selectIsStageReadyForSessionIteration(
					state,
					currentProjectDetail.id,
					activeSession.id,
					activeStage.slug,
					activeSession.iteration_count,
				)
			: false,
	);

	const isSessionGenerating = activeContextSessionId
		? generatingSessions[activeContextSessionId]?.length > 0
		: false;
	const areAnyModelsSelected = selectedModels.length > 0;

	const activeStageProgress = useMemo(
		() => unifiedProgress?.stageDetails?.find((s) => s.stageSlug === activeStage?.slug),
		[unifiedProgress, activeStage?.slug],
	);
	const hasPausedNsfJobs = activeStageProgress?.stageStatus === "paused_nsf";
	const stageThreshold: number | undefined = activeStage ? STAGE_BALANCE_THRESHOLDS[activeStage.slug] : undefined;
	const balanceMeetsThreshold =
		stageThreshold !== undefined ? Number(activeWalletInfo.balance ?? 0) >= stageThreshold : false;
	const isResumeMode = hasPausedNsfJobs && balanceMeetsThreshold;

	// Final, correct logic based on user feedback
	const contributionsForStageAndIterationExist = useMemo(() => {
		if (!activeSession || !activeStage) return false;
		return activeSession.dialectic_contributions?.some(
			(c) =>
				c.stage === activeStage.slug &&
				c.iteration_number === activeSession.iteration_count,
		);
	}, [activeSession, activeStage]);

	const didGenerationFail = useMemo(() => {
		if (!activeSession || !activeStage) return false;
		// As per plan (12.b), the status for a failed stage is dynamic.
		const failedStatus = `${activeStage.slug}_generation_failed`;
		return activeSession.status === failedStatus;
	}, [activeSession, activeStage]);

	const handleClick = async () => {
		if (
			!activeSession ||
			typeof activeSession.iteration_count !== "number" ||
			!currentProjectDetail ||
			!activeStage ||
			!activeContextSessionId ||
			!isWalletReady
		) {
			toast.error(
				"Could not determine the required context. Please ensure a project, session, stage, and wallet are active.",
			);
			return;
		}
		const currentIterationNumber = activeSession.iteration_count;

		if (isResumeMode) {
			toast.success("Resuming generation...");
			setDagDialogOpen(true);
			await resumePausedNsfJobs({
				sessionId: activeSession.id,
				stageSlug: activeStage.slug,
				iterationNumber: currentIterationNumber,
			});
			return;
		}

		toast.success("Contribution generation started!", {
			description: "The AI is working. We will notify you when it is complete.",
		});

		setDagDialogOpen(true);

		try {
			const payload: GenerateContributionsPayload = {
				sessionId: activeContextSessionId,
				projectId: currentProjectDetail.id,
				stageSlug: activeStage.slug,
				iterationNumber: currentIterationNumber,
				continueUntilComplete,
				walletId: activeWalletInfo.walletId as string,
			};
			await generateContributions(payload);
		} catch (e: unknown) {
			const errorMessage =
				(e as Error)?.message ||
				`An unexpected error occurred while starting the generation process.`;
			toast.error(errorMessage);
		}
	};

	const isDisabled =
		isSessionGenerating ||
		!areAnyModelsSelected ||
		!activeStage ||
		!activeSession ||
		!isStageReady ||
		!isWalletReady ||
		!balanceMeetsThreshold;
	const getButtonText = () => {
		if (isSessionGenerating)
			return (
				<>
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...
				</>
			);
		if (!areAnyModelsSelected) return "Choose AI Models";
		if (!isWalletReady) return "Wallet Not Ready";
		if (!activeStage || !activeSession) return "Stage Not Ready";
		if (!isStageReady) return "Previous Stage Incomplete";
		const displayName = getDisplayName(activeStage.slug);
		if (hasPausedNsfJobs && !balanceMeetsThreshold) return "Add Funds to Resume";
		if (hasPausedNsfJobs && balanceMeetsThreshold) return `Resume ${displayName}`;
		if (!balanceMeetsThreshold) return "Insufficient Balance";
		if (didGenerationFail) return `Retry ${displayName}`;
		if (contributionsForStageAndIterationExist)
			return `Regenerate ${displayName}`;
		return `Generate ${displayName}`;
	};

	return (
		<>
			<Button
				onClick={handleClick}
				disabled={isDisabled}
				variant="outline"
				className={cn(className)}
				data-testid={`generate-${activeStage?.slug || "unknown"}-button`}
			>
				<RefreshCcw /> {getButtonText()}
			</Button>
			{activeStage &&
				activeSession &&
				activeContextSessionId && (
					<StageDAGProgressDialog
						open={dagDialogOpen}
						onOpenChange={setDagDialogOpen}
						stageSlug={activeStage.slug}
						sessionId={activeContextSessionId}
						iterationNumber={activeSession.iteration_count}
					/>
				)}
		</>
	);
};
