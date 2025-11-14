import React, { useMemo, useState } from "react";
import {
	useDialecticStore,
	selectIsStageReadyForSessionIteration,
	selectGenerateContributionsError,
	selectGeneratingSessionsForSession,
	selectActiveStageSlug,
	selectSortedStages,
} from "@paynless/store";
import {
	DialecticProject,
	DialecticSession,
	DialecticStage,
	SubmitStageResponsesPayload,
	ApiError,
} from "@paynless/types";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { Loader2, ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import { WalletSelector } from "../ai/WalletSelector";
import { AIModelSelector } from "./AIModelSelector";
import { GenerateContributionButton } from "./GenerateContributionButton";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExportProjectButton } from "./ExportProjectButton";
import { ContinueUntilCompleteToggle } from "../common/ContinueUntilCompleteToggle";
import { DynamicProgressBar } from "../common/DynamicProgressBar";
import { cn } from "@/lib/utils";

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
	const sessionProgress = useDialecticStore((state) =>
		session ? state.sessionProgress[session.id] : undefined,
	);
	const generateContributionsError = useDialecticStore(selectGenerateContributionsError);
	const navigate = useNavigate();
	const [isPromptOpen, setIsPromptOpen] = useState(false);
	const activeSeedPrompt = useDialecticStore((state) => state.activeSeedPrompt);
	const isLoading = useDialecticStore(state => state.isLoadingActiveSessionDetail);

	// Use the new, more specific selector. This is the key to reactivity.
	const generatingJobs = useDialecticStore((state) =>
		session ? selectGeneratingSessionsForSession(state, session.id) : [],
	);
	const isGenerating = generatingJobs.length > 0 && !generateContributionsError;

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

	if (!project || !session) {
		return (
			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Loading Session Information...</CardTitle>
					<CardDescription>
						Waiting for project and session data from context...
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Skeleton className="h-4 w-1/2 mb-2" />
					<Skeleton className="h-4 w-3/4 mb-2" />
					<Skeleton className="h-10 w-full" />
				</CardContent>
			</Card>
		);
	}

	return (
		<div
			className="space-y-2"
			aria-labelledby={`session-info-title-${session.id}`}
		>
			{/* Enhanced Header */}

			<Button
				variant="ghost"
				size="sm"
				onClick={() => project && navigate(`/dialectic/${project.id}`)}
				disabled={!project}
				className="text-muted-foreground hover:text-foreground transition-colors duration-200 -ml-3"
			>
				← Back
			</Button>

			<div className="flex items-center justify-between">
				<div className="flex w-full items-center gap-8">
					<div className="flex justify-between items-center w-full gap-4">
						<h1
							className="text-2xl font-light tracking-tight"
							data-testid={`session-info-title-${session.id}`}
						>
							{session.session_description || "Untitled Session"} - Iteration:{" "}
							{session.iteration_count} -{" "}
							{session.status?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "Active"}
						</h1>
						<Badge
							variant="outline"
							className={cn(
								"font-normal border-0 px-3 py-1",
								session.status?.includes("complete") &&
									"bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
								session.status?.includes("error") &&
									"bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
								!session.status?.includes("complete") &&
									!session.status?.includes("error") &&
									"bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300",
							)}
						>
							{session.status
								?.replace(/_/g, " ")
								.replace(/\b\w/g, (l) => l.toUpperCase()) || "Active"}
						</Badge>
					</div>
				</div>
			</div>

			{/* Enhanced Configuration */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 space-y-3">
					<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
						AI Models
					</div>
					<AIModelSelector />
				</div>
				<div className="space-y-3">
					<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
						Wallet
					</div>
					<WalletSelector />
				</div>
			</div>

			{/* Enhanced Actions */}
			<div className="flex items-center justify-between pt-2">
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

				<div className="flex items-center gap-3">
					<ContinueUntilCompleteToggle />
					<GenerateContributionButton />

					{/* Export button */}
					{project && (
						<ExportProjectButton
							projectId={project.id}
							variant="outline"
							size="sm"
							className="border-muted-foreground/20 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-200"
						>
							<Download />
							Export
						</ExportProjectButton>
					)}

					{/* Submit button for non-final stages */}
					{isStageReady &&
						!isFinalStageInProcess &&
						session?.dialectic_contributions?.some(
							(c) =>
								c.stage === activeStageSlug &&
								c.iteration_number === session.iteration_count,
						) && (
							<Button
								onClick={handleSubmitResponses}
								disabled={isSubmitting}
								variant="default"
								size="sm"
								className={cn(
									"bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 transition-all duration-200",
								)}
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

					{/* Final stage export button */}
					{isFinalStageInProcess && project && (
						<ExportProjectButton
							projectId={project.id}
							variant="default"
							size="sm"
							className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-600/25"
						>
							Export Final
						</ExportProjectButton>
					)}
				</div>
			</div>

			{/* Progress and Status Indicators */}
			{sessionProgress &&
				sessionProgress.current_step < sessionProgress.total_steps && (
					<DynamicProgressBar sessionId={session.id} />
				)}
			{isGenerating && !sessionProgress && (
				<div
					className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg px-4 py-2 text-sm"
					data-testid="generating-contributions-indicator"
				>
					<Loader2 className="h-4 w-4 animate-spin" />
					<span>
						Generating contributions, please wait... ({generatingJobs.length}{" "}
						running)
					</span>
				</div>
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
				<div className="bg-card rounded-lg p-4">
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
