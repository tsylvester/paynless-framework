import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	useDialecticStore,
	useWalletStore,
	selectActiveChatWalletInfo,
	useAiStore,
} from "@paynless/store";
import { Pause, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
		isCostEstimateKnown,
		isCostEstimateLoading,
		showCostEstimateBlocked,
		costCeilingError,
		stageCeiling,
		projectCeiling,
		stageBalanceShortfall,
		showStageCostEstimate,
		isViewingAheadOfCurrentStage,
		viewingAheadReason,
	} = useStartContributionGeneration();

	const newChatContext = useAiStore((state) => state.newChatContext);
	const activeWalletInfo = useWalletStore((state) =>
		selectActiveChatWalletInfo(state, newChatContext),
	);

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

	const formatTokenCount = (n: number): string =>
		new Intl.NumberFormat("en-US").format(n);

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
		if (!isStageReady) {
			if (isViewingAheadOfCurrentStage) return "Prior Stage Not Submitted";
			return "Previous Stage Incomplete";
		}
		if (isCostEstimateLoading) return "Loading Estimate";
		if (
			!isCostEstimateLoading &&
			showCostEstimateBlocked &&
			costCeilingError !== null
		) {
			return "Estimate Failed";
		}
		if (isCostEstimateKnown && !balanceMeetsThreshold) return "Insufficient Balance";
		const displayName = viewingStage.display_name;
		if (isPauseMode)
			return (
				<>
					<Pause className="mr-2 h-4 w-4" /> Pause {displayName}
				</>
			);
		if (hasPausedUserJobs) return `Resume ${displayName}`;
		if (hasPausedNsfJobs) return `Resume ${displayName}`;
		if (didGenerationFail) return `Retry ${displayName}`;
		if (contributionsForStageAndIterationExist)
			return `Regenerate ${displayName}`;
		return `Generate ${displayName}`;
	};

	const walletBalanceNum: number = Number(activeWalletInfo.balance);
	let showProjectBalanceCallout: boolean = false;
	let projectBalanceShortfall: number | null = null;
	if (
		isCostEstimateKnown &&
		projectCeiling !== null &&
		Number.isFinite(projectCeiling) &&
		Number.isFinite(walletBalanceNum) &&
		walletBalanceNum < projectCeiling
	) {
		showProjectBalanceCallout = true;
		projectBalanceShortfall = projectCeiling - walletBalanceNum;
	}

	return (
		<div className="flex w-full flex-col items-stretch">
			{isViewingAheadOfCurrentStage && viewingAheadReason ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="w-full">
							<Button
								disabled
								variant="outline"
								size="sm"
								className={cn(className, "w-full text-sm pointer-events-none")}
								data-testid={`generate-${viewingStage?.slug ?? "unknown"}-button`}
							>
								<RefreshCcw className="mr-2 h-4 w-4" /> {getButtonText()}
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>{viewingAheadReason}</TooltipContent>
				</Tooltip>
			) : (
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
			)}
			{isCostEstimateLoading && (
				<p
					className="mt-1.5 max-w-[280px] rounded-md border border-muted bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground"
					data-testid="generate-button-estimate-loading-notice"
				>
					Loading cost estimate…
				</p>
			)}
			{!isCostEstimateLoading &&
				showCostEstimateBlocked &&
				costCeilingError !== null && (
				<p
					className="mt-1.5 max-w-[280px] rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive"
					data-testid="generate-button-estimate-error-callout"
				>
					{costCeilingError.message}
				</p>
			)}
			{isCostEstimateKnown &&
				showBalanceCallout &&
				!showCostEstimateBlocked &&
				viewingStage &&
				stageBalanceShortfall !== null && (
					<p
						className="mt-1.5 max-w-[280px] rounded-md border border-primary/60 bg-primary/15 px-3 py-2 text-center text-xs font-medium text-primary shadow-md animate-pulse"
						data-testid="generate-button-balance-callout"
					>
						Insufficient tokens.{" "}
						<Link
							to="/subscription?tab=top-up"
							className="font-semibold underline underline-offset-2 hover:no-underline"
						>
							Top up {formatTokenCount(stageBalanceShortfall)} to continue.
						</Link>
					</p>
				)}
			{showStageCostEstimate && stageCeiling !== null && (
				<p
					className="mt-1.5 text-center text-xs text-muted-foreground"
					data-testid="generate-button-stage-cost-estimate"
				>
					Estimated cost for this stage: ~{formatTokenCount(stageCeiling)} tokens.
				</p>
			)}
			{showProjectBalanceCallout &&
				projectBalanceShortfall !== null &&
				projectCeiling !== null && (
					<p
						className="mt-1.5 max-w-[280px] text-center text-xs text-muted-foreground"
						data-testid="generate-button-project-balance-callout"
					>
						This project may need ~{formatTokenCount(projectCeiling)} tokens.{" "}
						<Link
							to="/subscription?tab=top-up"
							className="font-semibold underline underline-offset-2 hover:no-underline"
						>
							Top up {formatTokenCount(projectBalanceShortfall)} for the full project.
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
