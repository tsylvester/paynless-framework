import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	useDialecticStore,
	selectSelectedModelIds,
	selectSessionById,
	selectActiveStage,
	selectIsStageReadyForSessionIteration,
	useWalletStore,
	selectActiveChatWalletInfo,
} from "@paynless/store";
import { GenerateContributionsPayload } from "@paynless/types";
import { useAiStore } from "@paynless/store";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

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
	} = useDialecticStore((state) => ({
		generateContributions: state.generateContributions,
		generatingSessions: state.generatingSessions,
		currentProjectDetail: state.currentProjectDetail,
		activeContextSessionId: state.activeContextSessionId,
	}));
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

	const selectedModelIds = useDialecticStore(selectSelectedModelIds);
	const activeStage = useMemo(() => selectActiveStage(store), [store]);
	const activeSession = useMemo(
		() =>
			activeContextSessionId
				? selectSessionById(store, activeContextSessionId)
				: null,
		[store, activeContextSessionId],
	);

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
	const areAnyModelsSelected = selectedModelIds && selectedModelIds.length > 0;

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

		toast.success("Contribution generation started!", {
			description: "The AI is working. We will notify you when it is complete.",
		});

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

	// The button is only disabled if essential data is missing or a generation is in progress.
	const isDisabled =
		isSessionGenerating ||
		!areAnyModelsSelected ||
		!activeStage ||
		!activeSession ||
		!isStageReady ||
		!isWalletReady;
	const friendlyName = activeStage?.display_name || "...";

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
		if (didGenerationFail) return `Retry ${friendlyName}`;
		if (contributionsForStageAndIterationExist)
			return `Regenerate ${friendlyName}`;
		return `Generate ${friendlyName}`;
	};

	return (
		<Button
			onClick={handleClick}
			disabled={isDisabled}
			variant="outline"
			className={cn(className)}
			data-testid={`generate-${activeStage?.slug || "unknown"}-button`}
		>
			<RefreshCcw /> {getButtonText()}
		</Button>
	);
};
