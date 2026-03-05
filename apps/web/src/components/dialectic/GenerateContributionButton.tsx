import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDialecticStore } from "@paynless/store";
import { getDisplayName } from "@paynless/types";
import { Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StageDAGProgressDialog } from "./StageDAGProgressDialog";
import { useStartContributionGeneration } from "@/hooks/useStartContributionGeneration";

interface GenerateContributionButtonProps {
	className?: string;
}

export const GenerateContributionButton: React.FC<
	GenerateContributionButtonProps
> = ({ className }) => {
	const {
		startContributionGeneration,
		isDisabled,
		isSessionGenerating,
		isWalletReady,
		isStageReady,
		balanceMeetsThreshold,
		areAnyModelsSelected,
		hasPausedNsfJobs,
		didGenerationFail,
		contributionsForStageAndIterationExist,
		showBalanceCallout,
		activeStage,
		activeSession,
		stageThreshold,
	} = useStartContributionGeneration();

	const shouldOpenDagProgress = useDialecticStore(
		(state) => state.shouldOpenDagProgress,
	);
	const setShouldOpenDagProgress = useDialecticStore(
		(state) => state.setShouldOpenDagProgress,
	);
	const activeContextSessionId = useDialecticStore(
		(state) => state.activeContextSessionId,
	);

	const [dagDialogOpen, setDagDialogOpen] = useState(false);

	useEffect(() => {
		if (shouldOpenDagProgress) {
			setDagDialogOpen(true);
			setShouldOpenDagProgress(false);
		}
	}, [shouldOpenDagProgress, setShouldOpenDagProgress]);

	const handleClick = () => {
		startContributionGeneration(() => setDagDialogOpen(true));
	};

	const getButtonText = (): React.ReactNode => {
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
		if (hasPausedNsfJobs) return `Resume ${displayName}`;
		if (!balanceMeetsThreshold) return "Insufficient Balance";
		if (didGenerationFail) return `Retry ${displayName}`;
		if (contributionsForStageAndIterationExist)
			return `Regenerate ${displayName}`;
		return `Generate ${displayName}`;
	};

	if (stageThreshold === undefined || stageThreshold === null) return null;
	const formattedThreshold = new Intl.NumberFormat("en-US").format(stageThreshold);

	return (
		<div className="relative inline-flex flex-col items-end">
			{showBalanceCallout && activeStage && (
				<p
					className="absolute bottom-full right-0 mb-1.5 z-10 max-w-[280px] rounded-md border border-primary/60 bg-primary/15 px-3 py-2 text-center text-xs font-medium text-primary shadow-md animate-pulse"
					data-testid="generate-button-balance-callout"
				>
					<Link
						to="/subscription"
						className="font-semibold underline underline-offset-2 hover:no-underline"
					>
						Minimum {formattedThreshold} token balance for {getDisplayName(activeStage.slug)}{" "}
					</Link>
				</p>
			)}
			<Button
				onClick={handleClick}
				disabled={isDisabled}
				variant="outline"
				className={cn(className)}
				data-testid={`generate-${activeStage?.slug ?? "unknown"}-button`}
			>
				<RefreshCcw /> {getButtonText()}
			</Button>
			{activeStage &&
				activeSession &&
				activeContextSessionId !== null &&
				activeContextSessionId !== undefined && (
					<StageDAGProgressDialog
						open={dagDialogOpen}
						onOpenChange={setDagDialogOpen}
						stageSlug={activeStage.slug}
						sessionId={activeContextSessionId}
						iterationNumber={activeSession.iteration_count}
					/>
				)}
		</div>
	);
};
