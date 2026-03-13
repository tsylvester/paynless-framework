import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDialecticStore } from "@paynless/store";
import { Pause, RefreshCcw } from "lucide-react";
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
		isPauseMode,
		isWalletReady,
		isStageReady,
		balanceMeetsThreshold,
		areAnyModelsSelected,
		hasPausedNsfJobs,
		hasPausedUserJobs,
		pauseGeneration,
		didGenerationFail,
		contributionsForStageAndIterationExist,
		showBalanceCallout,
		viewingStage,
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
	const [isDebouncing, setIsDebouncing] = useState(false);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (shouldOpenDagProgress) {
			setDagDialogOpen(true);
			setShouldOpenDagProgress(false);
		}
	}, [shouldOpenDagProgress, setShouldOpenDagProgress]);

	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		};
	}, []);

	const handleClick = () => {
		const onOpenDag = (): void => setDagDialogOpen(true);
		if (isPauseMode) {
			pauseGeneration(onOpenDag);
		} else {
			startContributionGeneration(onOpenDag);
		}
		setIsDebouncing(true);
		debounceTimerRef.current = setTimeout(() => setIsDebouncing(false), 500);
	};

	const getButtonText = (): React.ReactNode => {
		if (!areAnyModelsSelected) return "Choose AI Models";
		if (!isWalletReady) return "Wallet Not Ready";
		if (!viewingStage || !activeSession) return "Stage Not Ready";
		if (!isStageReady) return "Previous Stage Incomplete";
		const displayName = viewingStage.display_name;
		if (isPauseMode)
			return (
				<>
					<Pause className="mr-2 h-4 w-4" /> Pause {displayName}
				</>
			);
		if (hasPausedUserJobs) return `Resume ${displayName}`;
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
		<div className="flex w-full flex-col items-stretch">
			<Button
				onClick={handleClick}
				disabled={isDisabled || isDebouncing}
				variant="outline"
				size="sm"
				className={cn(className, "w-full text-sm")}
				data-testid={`generate-${viewingStage?.slug ?? "unknown"}-button`}
			>
				{isPauseMode ? getButtonText() : <><RefreshCcw className="mr-2 h-4 w-4" />{" "}{getButtonText()}</>}
			</Button>
			{showBalanceCallout && viewingStage && (
				<p
					className="mt-1.5 max-w-[280px] rounded-md border border-primary/60 bg-primary/15 px-3 py-2 text-center text-xs font-medium text-primary shadow-md animate-pulse"
					data-testid="generate-button-balance-callout"
				>
					<Link
						to="/subscription"
						className="font-semibold underline underline-offset-2 hover:no-underline"
					>
						Minimum {formattedThreshold} token balance for {viewingStage.display_name}{" "}
					</Link>
				</p>
			)}
			{viewingStage &&
				activeSession &&
				activeContextSessionId !== null &&
				activeContextSessionId !== undefined && (
					<StageDAGProgressDialog
						open={dagDialogOpen}
						onOpenChange={setDagDialogOpen}
						stageSlug={viewingStage.slug}
						sessionId={activeContextSessionId}
						iterationNumber={activeSession.iteration_count}
					/>
				)}
		</div>
	);
};
