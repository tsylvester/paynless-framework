import React, { useMemo, useState } from "react";
import {
	useDialecticStore,
	selectIsStageReadyForSessionIteration,
	selectGenerateContributionsError,
	selectActiveStageSlug,
	selectSortedStages,
	selectUnifiedProjectProgress,
	selectSelectedModels,
} from "@paynless/store";
import {
	DialecticProject,
	DialecticSession,
	DialecticStage,
	SubmitStageResponsesPayload,
	ApiError,
	UnifiedProjectStatus,
} from "@paynless/types";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { Loader2, ChevronDown, Download, MoreVertical, Cpu } from "lucide-react";
import { toast } from "sonner";
import { WalletSelector } from "../ai/WalletSelector";
import { AIModelSelector } from "./AIModelSelector";
import { GenerateContributionButton } from "./GenerateContributionButton";
import { useNavigate } from "react-router-dom";
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

const PROJECT_STATUS_LABELS: Record<UnifiedProjectStatus, string> = {
	not_started: "Not Started",
	in_progress: "In Progress",
	completed: "Completed",
	failed: "Failed",
};

interface SessionInfoCardProps {
	// REMOVED: session?: DialecticSession;
}

export const SessionInfoCard: React.FC<SessionInfoCardProps> = (
	/* REMOVED: { session } */
) => {
	const project: DialecticProject | null = useDialecticStore(
		(state) => state.currentProjectDetail,
	);
	const session: DialecticSession | null = useDialecticStore(
		(state) => state.activeSessionDetail,
	);
	const activeStage: DialecticStage | null = useDialecticStore(
		(state) => state.activeContextStage,
	);
	const unifiedProgress = useDialecticStore((state) =>
		state.activeSessionDetail
			? selectUnifiedProjectProgress(state, state.activeSessionDetail.id)
			: null,
	);
	const generateContributionsError = useDialecticStore(selectGenerateContributionsError);
	const navigate = useNavigate();
	const [isPromptOpen, setIsPromptOpen] = useState(false);
	const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
	const activeSeedPrompt = useDialecticStore((state) => state.activeSeedPrompt);
	const isLoading = useDialecticStore(state => state.isLoadingActiveSessionDetail);

	// Get selected model count
	const selectedModels = useDialecticStore(selectSelectedModels);
	const uniqueModelCount = new Set(selectedModels.map((model) => model.id)).size;
	// Submit functionality
	const activeStageSlug = useDialecticStore(selectActiveStageSlug);
	const sortedStages = useDialecticStore(selectSortedStages);
	const setActiveStage = useDialecticStore((state) => state.setActiveStage);
	const submitStageResponses = useDialecticStore(
		(state) => state.submitStageResponses,
	);
	const isSubmitting = useDialecticStore(
		(state) => state.isSubmittingStageResponses,
	);

	// Check if this is the final stage
	const isFinalStageInProcess = useMemo(() => {
		if (!project?.process_template_id || !activeStage) return false;
		const transitions = project.dialectic_process_templates?.transitions || [];
		return transitions.every((t) => t.source_stage_id !== activeStage.id);
	}, [project, activeStage]);

	const handleSubmitResponses = async () => {
		if (!session || !session.iteration_count || !activeStage || !project)
			return;

		const payload: SubmitStageResponsesPayload = {
			sessionId: session.id,
			currentIterationNumber: session.iteration_count,
			projectId: project.id,
			stageSlug: activeStage.slug,
		};

		try {
			const result = await submitStageResponses(payload);
			if (result?.error) {
				throw result.error;
			}

			toast.success("Stage advanced!", {
				description: "The next stage's seed prompt has been generated.",
			});

			// Advance to next stage
			if (activeStage && sortedStages && setActiveStage) {
				const currentIndex = sortedStages.findIndex(
					(s) => s.slug === activeStage.slug,
				);
				if (currentIndex > -1 && currentIndex < sortedStages.length - 1) {
					const nextStage = sortedStages[currentIndex + 1];
					setActiveStage(nextStage.slug);
				}
			}
		} catch (error) {
			const apiError = error as ApiError;
			toast.error("Submission Failed", {
				description: apiError.message || "An unexpected error occurred.",
			});
		}
	};

	const isStageReady = useDialecticStore((state) => {
		if (!project || !session || !activeStage) {
			return false;
		}
		return selectIsStageReadyForSessionIteration(
			state,
			project.id,
			session.id,
			activeStage.slug,
			session.iteration_count,
		);
	});

	const canShowSubmitButton = isStageReady &&
		!isFinalStageInProcess &&
		session?.dialectic_contributions?.some(
			(c) =>
				c.stage === activeStageSlug &&
				c.iteration_number === session.iteration_count,
		);

	if (!project || !session) {
		return (
			<div className="space-y-4 py-4">
				<Skeleton className="h-8 w-48" />
				<div className="flex items-center gap-4">
					<Skeleton className="h-10 w-32" />
					<Skeleton className="h-10 w-32" />
				</div>
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	const getStatusColor = (status: string | undefined) => {
		if (status?.includes("complete")) {
			return "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300";
		}
		if (status?.includes("error")) {
			return "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300";
		}
		return "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300";
	};

	const formatStatus = (status: string | undefined) => {
		if (!status) return "Active";
		return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
	};

	return (
		<div
			className="space-y-4"
			aria-labelledby={`session-info-title-${session.id}`}
		>
			{/* Back button */}
			<Button
				variant="ghost"
				size="sm"
				onClick={() => project && navigate(`/dialectic/${project.id}`)}
				disabled={!project}
				className="text-muted-foreground hover:text-foreground transition-colors duration-200 -ml-3"
			>
				← Back
			</Button>

			{/* Title Row */}
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<h1
						className="text-2xl font-light tracking-tight"
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
					<Badge
						variant="outline"
						className={cn(
							"font-normal border-0 px-2.5 py-0.5",
							unifiedProgress?.projectStatus === "completed" &&
								"bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
							unifiedProgress?.projectStatus === "failed" &&
								"bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
							(!unifiedProgress ||
								(unifiedProgress.projectStatus !== "completed" &&
									unifiedProgress.projectStatus !== "failed")) &&
								getStatusColor(session.status ?? undefined),
						)}
					>
						{unifiedProgress
							? PROJECT_STATUS_LABELS[unifiedProgress.projectStatus]
							: formatStatus(session.status ?? undefined)}
					</Badge>
				</div>
			</div>

			{/* Configuration Row */}
			<div className="flex items-center gap-4 flex-wrap">
				{/* Compact Model Selector Popover */}
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
					<PopoverContent className="w-[420px] p-0 bg-background border shadow-lg" align="start">
						<div className="p-3 border-b bg-background">
							<p className="text-sm font-medium">AI Models</p>
							<p className="text-xs text-muted-foreground">Select models for generation</p>
						</div>
						<div className="p-3 bg-background">
							<AIModelSelector />
						</div>
					</PopoverContent>
				</Popover>

				{/* Wallet Selector */}
				<div className="w-48">
					<WalletSelector />
				</div>
			</div>

			{/* Actions Row */}
			<div className="flex items-center justify-between">
				{/* Seed Prompt Toggle */}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setIsPromptOpen((p) => !p)}
					className="text-muted-foreground hover:text-foreground transition-colors duration-200"
				>
					{isPromptOpen ? "Hide" : "Show"} seed prompt
					<ChevronDown
						className={cn(
							"ml-2 h-4 w-4 transition-transform duration-200",
							isPromptOpen && "rotate-180",
						)}
					/>
				</Button>

				<div className="flex items-center gap-2">
					{/* Secondary Actions Dropdown */}
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
						</DropdownMenuContent>
					</DropdownMenu>

					{/* Primary Actions */}
					<GenerateContributionButton />

					{/* Submit button for non-final stages */}
					{canShowSubmitButton && (
						<Button
							onClick={handleSubmitResponses}
							disabled={isSubmitting}
							size="sm"
							className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 transition-all duration-200"
						>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Submitting...
								</>
							) : (
								"Submit & Advance"
							)}
						</Button>
					)}
				</div>
			</div>

			{/* Progress and Status Indicators */}
			{unifiedProgress && unifiedProgress.totalStages > 0 && (
				<DynamicProgressBar sessionId={session.id} />
			)}
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
