import React, { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
	useDialecticStore,
	useAuthStore,
	selectGenerateContributionsError,
	selectUnifiedProjectProgress,
	selectSelectedModels,
	selectCostCeiling,
	selectViewingStage,
	useWalletStore,
	selectActiveChatWalletInfo,
	useAiStore,
} from "@paynless/store";
import {
	DialecticProject,
	DialecticSession,
	InitializeMaxOutputTokensResult,
} from "@paynless/types";
import {
	ComputeCostCeilingReturn,
	ComputeCostCeilingSuccessReturn,
	formatTokenCount,
	FormatTokenCountDeps,
	FormatTokenCountParams,
} from "@paynless/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { ChevronDown, Download, MoreVertical, Cpu } from "lucide-react";
import { WalletSelector } from "../ai/WalletSelector";
import { AIModelSelector } from "./AIModelSelector";
import { OutputCapSlider } from "./OutputCapSlider";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExportProjectButton } from "./ExportProjectButton";
import { ContinueUntilCompleteToggle } from "../common/ContinueUntilCompleteToggle";
import { DynamicProgressBar } from "../common/DynamicProgressBar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const subscriptionTierUnavailableMessage =
	"Subscription tier is not available.";

const formatTokenCountDeps: FormatTokenCountDeps = {};
const formatTokenCountParams: FormatTokenCountParams = {};

export const SessionInfoCard: React.FC = () => {
	const project: DialecticProject | null = useDialecticStore(
		(state) => state.currentProjectDetail,
	);
	const session: DialecticSession | null = useDialecticStore(
		(state) => state.activeSessionDetail,
	);
	const unifiedProgress = useDialecticStore(
		useShallow((state) =>
			state.activeSessionDetail
				? selectUnifiedProjectProgress(state, state.activeSessionDetail.id)
				: null,
		),
	);
	const generateContributionsError = useDialecticStore(selectGenerateContributionsError);
	const costCeilingResult: ComputeCostCeilingReturn = useDialecticStore(
		useShallow((state) => {
			const sid: string | undefined = state.activeSessionDetail?.id;
			if (sid === undefined) {
				return {
					error: {
						code: "SESSION_NOT_READY",
						message: "Session is not active.",
					},
				};
			}
			return selectCostCeiling(state, sid);
		}),
	);
	const viewingStage = useDialecticStore(selectViewingStage);
	const isLoadingModelCatalog = useDialecticStore(
		(state) => state.isLoadingModelCatalog,
	);
	const isLoadingProcessTemplate = useDialecticStore(
		(state) => state.isLoadingProcessTemplate,
	);
	const modelCatalog = useDialecticStore((state) => state.modelCatalog);
	const progressHydrationStatus = useDialecticStore(
		(state) => state.progressHydrationStatus,
	);
	const newChatContext = useAiStore((state) => state.newChatContext);
	const activeWalletInfo = useWalletStore((state) =>
		selectActiveChatWalletInfo(state, newChatContext),
	);
	const authIsLoading = useAuthStore((state) => state.isLoading);
	const userTier = useAuthStore((state) => state.userTier);
	const authError = useAuthStore((state) => state.error);
	const navigate = useNavigate();
	const [isPromptOpen, setIsPromptOpen] = useState(false);
	const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
	const [capInitResult, setCapInitResult] =
		useState<InitializeMaxOutputTokensResult | null>(null);
	const activeSeedPrompt = useDialecticStore((state) => state.activeSeedPrompt);
	const isLoading = useDialecticStore(state => state.isLoadingActiveSessionDetail);

	const selectedModels = useDialecticStore(selectSelectedModels);
	const uniqueModelCount = new Set(selectedModels.map((model) => model.id)).size;

	const isCapInitReady: boolean =
		!authIsLoading &&
		userTier !== null &&
		!isLoadingModelCatalog &&
		modelCatalog.length > 0;

	useEffect(() => {
		if (!isCapInitReady || session === null) {
			setCapInitResult(null);
			return;
		}
		const initResult: InitializeMaxOutputTokensResult =
			useDialecticStore.getState().initializeMaxOutputTokens();
		if (initResult.ok === true) {
			setCapInitResult(null);
			return;
		}
		setCapInitResult(initResult);
	}, [
		authIsLoading,
		userTier,
		isLoadingModelCatalog,
		modelCatalog.length,
		session?.id,
		selectedModels.length,
	]);

	const runKey: string | null =
		session !== null
			? `${session.id}:${session.iteration_count}`
			: null;

	const isProgressHydrationPending: boolean =
		runKey !== null && progressHydrationStatus[runKey] === "pending";

	const isCostEstimateLoading: boolean =
		authIsLoading ||
		isLoadingModelCatalog ||
		isLoadingProcessTemplate ||
		isProgressHydrationPending;

	let costEstimateLoadingNotice: string | null = null;
	if (authIsLoading) {
		costEstimateLoadingNotice = "Loading subscription tier…";
	} else if (isLoadingModelCatalog) {
		costEstimateLoadingNotice = "Loading model catalog…";
	} else if (isLoadingProcessTemplate) {
		costEstimateLoadingNotice = "Loading process template…";
	} else if (isProgressHydrationPending) {
		costEstimateLoadingNotice = "Loading stage progress…";
	}

	let costEstimateErrorMessage: string | null = null;
	if (!isCostEstimateLoading) {
		if (authError !== null) {
			costEstimateErrorMessage = authError.message;
		} else if (userTier === null) {
			costEstimateErrorMessage = subscriptionTierUnavailableMessage;
		} else if (capInitResult !== null && capInitResult.ok === false) {
			costEstimateErrorMessage = capInitResult.error.message;
		} else if ("error" in costCeilingResult) {
			costEstimateErrorMessage = costCeilingResult.error.message;
		}
	}

	let costCeilingSuccessResult: ComputeCostCeilingSuccessReturn | null = null;
	if (
		!isCostEstimateLoading &&
		costEstimateErrorMessage === null &&
		!("error" in costCeilingResult)
	) {
		costCeilingSuccessResult = costCeilingResult;
	}

	const rawStageCeilingForViewingStage: number | undefined =
		costCeilingSuccessResult !== null && viewingStage !== null
			? costCeilingSuccessResult.stageCeilings[viewingStage.slug]
			: undefined;

	const stageCeiling: number | null =
		rawStageCeilingForViewingStage !== undefined &&
		Number.isFinite(rawStageCeilingForViewingStage) &&
		rawStageCeilingForViewingStage >= 0
			? rawStageCeilingForViewingStage
			: null;

	const rawProjectCeiling: number | undefined =
		costCeilingSuccessResult !== null
			? costCeilingSuccessResult.projectCeiling
			: undefined;

	const projectCeiling: number | null =
		rawProjectCeiling !== undefined &&
		Number.isFinite(rawProjectCeiling) &&
		rawProjectCeiling >= 0
			? rawProjectCeiling
			: null;

	const walletBalance: number = Number(activeWalletInfo.balance);

	const projectBalanceShortfall: number | null =
		projectCeiling !== null &&
		Number.isFinite(walletBalance) &&
		walletBalance < projectCeiling
			? projectCeiling - walletBalance
			: null;

	let stageCeilingDisplay: string | null = null;
	if (stageCeiling !== null) {
		const stageCeilingFormatResult = formatTokenCount(
			formatTokenCountDeps,
			formatTokenCountParams,
			{ tokenCount: stageCeiling },
		);
		if (!("error" in stageCeilingFormatResult)) {
			stageCeilingDisplay = stageCeilingFormatResult.formatted;
		}
	}

	let projectCeilingDisplay: string | null = null;
	if (projectCeiling !== null) {
		const projectCeilingFormatResult = formatTokenCount(
			formatTokenCountDeps,
			formatTokenCountParams,
			{ tokenCount: projectCeiling },
		);
		if (!("error" in projectCeilingFormatResult)) {
			projectCeilingDisplay = projectCeilingFormatResult.formatted;
		}
	}

	let projectBalanceShortfallDisplay: string | null = null;
	if (projectBalanceShortfall !== null) {
		const projectBalanceShortfallFormatResult = formatTokenCount(
			formatTokenCountDeps,
			formatTokenCountParams,
			{ tokenCount: projectBalanceShortfall },
		);
		if (!("error" in projectBalanceShortfallFormatResult)) {
			projectBalanceShortfallDisplay =
				projectBalanceShortfallFormatResult.formatted;
		}
	}

	if (!project || !session) {
		return (
			<div className="space-y-2 pl-14 py-4">
				<Skeleton className="h-8 w-48" />
				<div className="flex items-center gap-4">
					<Skeleton className="h-10 w-32" />
					<Skeleton className="h-10 w-32" />
				</div>
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	return (
		<div
			className="space-y-2 pl-14"
			aria-labelledby={`session-info-title-${session.id}`}
		>
			{/* Row 1: Back | Session name | Iteration badge | Status badge | spacer | ... dropdown */}
			<div className="flex items-center gap-3 flex-wrap">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => project && navigate(`/dialectic/${project.id}`)}
					disabled={!project}
					className="text-muted-foreground hover:text-foreground transition-colors duration-200 -ml-3"
				>
					← Back
				</Button>
				<h1
					className="text-xl font-light tracking-tight"
					data-testid={`session-info-title-${session.id}`}
				>
					{session.session_description || "Untitled Session"}
				</h1>
				<Badge
					variant="outline"
					className="font-normal border-0 px-2.5 py-0.5 bg-muted/50 text-muted-foreground"
				>
					Iteration {session.iteration_count}
				</Badge>
				<div className="flex-1 min-w-4" />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-9 w-9 p-0"
						>
							<MoreVertical className="h-4 w-4" />
							<span className="sr-only">More actions</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<ExportProjectButton
								projectId={project.id}
								variant="ghost"
								size="sm"
								className="w-full justify-start cursor-pointer"
							>
								<Download className="mr-2 h-4 w-4" />
								Export Project
							</ExportProjectButton>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<div className="px-2 py-1.5">
							<ContinueUntilCompleteToggle />
						</div>
						<DropdownMenuItem onClick={() => setIsPromptOpen((p) => !p)}>
							{isPromptOpen ? "Hide Seed Prompt" : "Show Seed Prompt"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Row 2: Model Selector | Wallet Selector | DynamicProgressBar */}
			<div className="flex items-center gap-4 flex-wrap">
				<Popover open={isModelSelectorOpen} onOpenChange={setIsModelSelectorOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-9 px-3 gap-2",
								uniqueModelCount === 0 && "ring-2 ring-primary animate-pulse",
							)}
						>
							<Cpu className="h-4 w-4" />
							<span>
								{uniqueModelCount > 0
									? `${uniqueModelCount} model${uniqueModelCount !== 1 ? "s" : ""}`
									: "Select models"}
							</span>
							<ChevronDown className="h-3.5 w-3.5 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[480px] p-0 bg-background border shadow-lg" align="start">
						<div className="p-3 border-b bg-background">
							<p className="text-sm font-medium">Model Settings</p>
							<p className="text-xs text-muted-foreground">Configure models and output limits</p>
						</div>
						<div className="p-3 bg-background space-y-4 max-h-[500px] overflow-y-auto">
							<AIModelSelector />
							<div className="border-t pt-3">
								<OutputCapSlider />
							</div>
						</div>
					</PopoverContent>
				</Popover>
				<div className="w-48">
					<WalletSelector />
				</div>
				{unifiedProgress && unifiedProgress.totalStages > 0 && (
					<div className="flex-1 min-w-0">
						<DynamicProgressBar sessionId={session.id} />
					</div>
				)}
			</div>

			<div className="text-xs text-muted-foreground space-y-1">
				{isCostEstimateLoading && costEstimateLoadingNotice !== null && (
					<p data-testid="session-info-estimate-loading-notice">
						{costEstimateLoadingNotice}
					</p>
				)}
				{!isCostEstimateLoading && costEstimateErrorMessage !== null && (
					<p data-testid="session-info-estimate-error-notice">
						{costEstimateErrorMessage}
					</p>
				)}
				{costCeilingSuccessResult !== null && (
					<>
						{stageCeilingDisplay !== null && (
							<p data-testid="session-info-stage-cost-estimate">
								Estimated cost for this stage: ~
								{stageCeilingDisplay} tokens.
							</p>
						)}
						{projectCeilingDisplay !== null && (
							<p data-testid="session-info-project-cost-estimate">
								Estimated project cost: ~
								{projectCeilingDisplay} tokens.
							</p>
						)}
						{projectBalanceShortfallDisplay !== null &&
							projectCeilingDisplay !== null && (
							<p data-testid="session-info-project-balance-warning">
								This project may need ~
								{projectCeilingDisplay} tokens total.{" "}
								<Link
									to="/subscription?tab=top-up"
									className="font-semibold underline underline-offset-2 hover:no-underline"
								>
									Top up {projectBalanceShortfallDisplay} to cover
									the full project.
								</Link>
							</p>
						)}
					</>
				)}
			</div>

			{generateContributionsError && (
				<Alert variant="destructive" data-testid="generate-contributions-error">
					<AlertTitle>Error Generating Contributions</AlertTitle>
					<AlertDescription>
						{generateContributionsError.message}
					</AlertDescription>
				</Alert>
			)}

			{/* Prompt Display Section */}
			{isPromptOpen && (
				<div className="bg-card rounded-lg p-4 border">
					{isLoading ? (
						<div data-testid="iteration-prompt-loading">
							<Skeleton className="h-4 w-1/4 mb-2" />
							<Skeleton className="h-8 w-full" />
						</div>
					) : activeSeedPrompt ? (
						<div className="p-2 rounded-md bg-muted/30">
							<MarkdownRenderer content={activeSeedPrompt.promptContent} />
						</div>
					) : (
						<p className="text-sm text-muted-foreground italic">
							No seed prompt available for this session.
						</p>
					)}
				</div>
			)}
		</div>
	);
};
