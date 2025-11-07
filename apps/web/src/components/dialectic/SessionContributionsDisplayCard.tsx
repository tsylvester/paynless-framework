import React, { useState, useMemo, useEffect } from "react";
import {
	useDialecticStore,
	selectIsLoadingProjectDetail,
	selectContributionGenerationStatus,
	selectProjectDetailError,
	selectFeedbackForStageIteration,
	selectCurrentProjectDetail,
	selectActiveStageSlug,
	selectSortedStages,
	selectStageProgressSummary
} from "@paynless/store";
import {
	ApiError,
	DialecticFeedback,
	SubmitStageResponsesPayload,
} from "@paynless/types";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,

} from "@/components/ui/alert-dialog";

import { GeneratedContributionCard } from "./GeneratedContributionCard";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';


const isApiError = (error: unknown): error is ApiError => {
	return (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof (error as ApiError).message === "string"
	);
};

// UI-only mapping of stage names
const stageNameMap: Record<string, string> = {
	thesis: "Proposal",
	antithesis: "Review",
	synthesis: "Refinement",
	parenthesis: "Planning",
	paralysis: "Implementation",
};

const getDisplayName = (stage: {
	slug: string;
	display_name: string;
}): string => {
	return stageNameMap[stage.slug] || stage.display_name;
};

// Enhanced skeleton component for GeneratedContributionCard
const GeneratedContributionCardSkeleton: React.FC = () => (
	<div className="bg-card rounded-2xl shadow-sm border border-border/50 p-8 animate-pulse">
		<div className="space-y-6">
			<div className="space-y-3">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8 rounded-full" role="status" />
					<Skeleton className="h-5 w-1/3" role="status" />
				</div>
				<Skeleton className="h-4 w-1/4" role="status" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-4 w-full" role="status" />
				<Skeleton className="h-4 w-full" role="status" />
				<Skeleton className="h-4 w-3/4" role="status" />
				<Skeleton className="h-4 w-2/3" role="status" />
			</div>
			<div className="flex justify-between items-center">
				<Skeleton className="h-6 w-20" role="status" />
				<Skeleton className="h-9 w-24 rounded-lg" role="status" />
			</div>
		</div>
	</div>
);

export const SessionContributionsDisplayCard: React.FC = () => {
	// --- Store Data using Reactive Hooks ---
	const project = useDialecticStore(selectCurrentProjectDetail);
	const session = useDialecticStore((state) => state.activeSessionDetail);
	const activeStageSlug = useDialecticStore(selectActiveStageSlug);
	const processTemplate = useDialecticStore(
		(state) => state.currentProcessTemplate,
	);
	const sortedStages = useDialecticStore(selectSortedStages);
	const setActiveStage = useDialecticStore((state) => state.setActiveStage);

  const activeStage = useMemo(() => {
	return processTemplate?.stages?.find((s) => s.slug === activeStageSlug) || null;
  }, [processTemplate, activeStageSlug]);
  
  useStageRunProgressHydration();

	// Determine if the active stage is the terminal stage in the process template
	const isFinalStageInProcess = useMemo(() => {
		if (!processTemplate || !activeStage) return false;
		const transitions = (
			processTemplate as unknown as {
				transitions?: { source_stage_id: string; target_stage_id: string }[];
			}
		).transitions;
		if (!Array.isArray(transitions) || transitions.length === 0) return false;
		// A final stage has no outgoing transition from its stage id
		return transitions.every((t) => t.source_stage_id !== activeStage.id);
	}, [processTemplate, activeStage]);

	const submitStageResponses = useDialecticStore(
		(state) => state.submitStageResponses,
	);
	const isSubmitting = useDialecticStore(
		(state) => state.isSubmittingStageResponses,
	);
	const submissionError = useDialecticStore(
		(state) => state.submitStageResponsesError,
	);
	const resetSubmitError = useDialecticStore(
		(state) => state.resetSubmitStageResponsesError,
	);


	// New store states for loading and error handling
	const isLoadingCurrentProjectDetail = useDialecticStore(
		selectIsLoadingProjectDetail,
	);
	const contributionGenerationStatus = useDialecticStore(
		selectContributionGenerationStatus,
	);
	const projectDetailError = useDialecticStore(selectProjectDetailError);
	const generationError = useDialecticStore(
		(state) => state.generateContributionsError,
	);

	// Store items for feedback content
	const fetchFeedbackFileContent = useDialecticStore(
		(state) => state.fetchFeedbackFileContent,
	);
	const currentFeedbackFileContent = useDialecticStore(
		(state) => state.currentFeedbackFileContent,
	);
	const isFetchingFeedbackFileContent = useDialecticStore(
		(state) => state.isFetchingFeedbackFileContent,
	);
	const fetchFeedbackFileContentError = useDialecticStore(
		(state) => state.fetchFeedbackFileContentError,
	);
	const clearCurrentFeedbackFileContent = useDialecticStore(
		(state) => state.clearCurrentFeedbackFileContent,
	);
	const resetFetchFeedbackFileContentError = useDialecticStore(
		(state) => state.resetFetchFeedbackFileContentError,
	);

  const stageProgressSummary = useDialecticStore((state) => {
    if (!session || !activeStage || typeof session.iteration_count !== 'number') {
      return undefined;
    }

    return selectStageProgressSummary(
      state,
      session.id,
      activeStage.slug,
      session.iteration_count,
    );
  });

  const canSubmitStageResponses = stageProgressSummary?.isComplete === true;

	// Select feedback metadata for the current stage and iteration
	const feedbacksForStageIterationArray = useDialecticStore((state) =>
		project && session && activeStage
			? selectFeedbackForStageIteration(
					state,
					session.id,
					activeStage.slug,
					session.iteration_count,
				)
			: null,
	);
	const feedbackForStageIteration: DialecticFeedback | undefined =
		feedbacksForStageIterationArray?.[0];

	const stageResponses = useDialecticStore((state) => {
		return state.stageDocumentContent;
	});
	const [submissionSuccessMessage, setSubmissionSuccessMessage] = useState<
		string | null
	>(null);
	const [showConfirmationModal, setShowConfirmationModal] = useState(false);
	// ADDED: State for controlling feedback content modal
	const [showFeedbackContentModal, setShowFeedbackContentModal] =
		useState(false);

  useEffect(() => {
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }
  }, [activeStage, resetSubmitError, submissionError]);

  const proceedWithSubmission = async () => {
    if (!session || !session.iteration_count || !activeStage || !project) return;
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }

    const payload: SubmitStageResponsesPayload = {
      sessionId: session.id,
      currentIterationNumber: session.iteration_count,
      projectId: project.id,
      stageSlug: activeStage.slug,
    };

    try {
      // The store action is now responsible for finding and submitting all drafts
      // before advancing the stage.
      const result = await submitStageResponses(payload);

      if (result?.error) {
          throw result.error;
      }
      
      setSubmissionSuccessMessage('Your feedback has been submitted successfully!');
      toast.success('Feedback submitted!', {
          description: "The next stage's seed prompt has been generated."
      });
      // Do NOT clear stageResponses here so user can see what they wrote
      if (activeStage && sortedStages && setActiveStage) {
        const currentIndex = sortedStages.findIndex(s => s.slug === activeStage.slug);
        if (currentIndex > -1 && currentIndex < sortedStages.length - 1) {
          const nextStage = sortedStages[currentIndex + 1];
          setActiveStage(nextStage.slug);
        }
      }
      
    } catch (error) {
      if (isApiError(error)) {
        toast.error('Submission Failed', {
            description: error.message || 'An unexpected error occurred.'
        });
      } else {
        toast.error('Submission Failed', {
            description: 'An unexpected error occurred.'
        });
      }
    }
  };
  
  const handleSubmitResponses = async () => {
      setShowConfirmationModal(true);
  };

  const renderSubmitButton = () => (
    <Button
      onClick={handleSubmitResponses}
      disabled={isSubmitting || !canSubmitStageResponses}
      className={cn({ 'animate-pulse': !isSubmitting && canSubmitStageResponses })}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
        </>
      ) : (
        'Submit Responses & Advance Stage'
      )}
    </Button>
  );

	const handleShowFeedbackContent = (feedback?: DialecticFeedback | null) => {
		if (feedback?.storage_path && project) {
			fetchFeedbackFileContent({
				projectId: project.id,
				storagePath: feedback.storage_path,
			});
			setShowFeedbackContentModal(true);
		} else {
			toast.warning("No feedback content to display.", {
				description:
					"The selected feedback record does not have an associated file path.",
			});
		}
	};

	const closeFeedbackModal = () => {
		setShowFeedbackContentModal(false);
		clearCurrentFeedbackFileContent?.(); // Clear content when closing
		resetFetchFeedbackFileContentError?.(); // Clear any errors
	};

	// Loading state for the entire component
	if (isLoadingCurrentProjectDetail) {
		return <GeneratedContributionCardSkeleton />;
	}

	// Handle project-level errors
	if (projectDetailError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Error Loading Project</AlertTitle>
				<AlertDescription>{projectDetailError.message}</AlertDescription>
			</Alert>
		);
	}

	// Handle case where there is no active session
	if (!session) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Session Not Active</CardTitle>
				</CardHeader>
				<CardContent>
					<p>Please select a session to view its contributions.</p>
				</CardContent>
			</Card>
		);
	}

	// Handle case where there is no active stage
	if (!activeStage) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Stage Not Selected</CardTitle>
				</CardHeader>
				<CardContent>
					<p>Please select a stage to view its contributions.</p>
				</CardContent>
			</Card>
		);
	}

	const isGenerating = contributionGenerationStatus === "generating";

	return (
		<div className="space-y-8">
			{/* Enhanced Header */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<h2 className="text-2xl font-light tracking-tight">{getDisplayName(activeStage)}</h2>
						<p className="text-muted-foreground leading-relaxed">
							{activeStage.description}
						</p>
					</div>
				</div>
			</div>

			{/* Enhanced Status */}
			{isGenerating && (
				<div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl px-6 py-4 border border-blue-200/50 dark:border-blue-800/50">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
							<Loader2 className="h-5 w-5 animate-spin text-blue-600" />
						</div>
						<div>
							<p className="font-medium text-blue-900 dark:text-blue-100">Generating contributions</p>
							<p className="text-sm text-blue-700 dark:text-blue-300">Please wait while AI models process your request...</p>
						</div>
					</div>
				</div>
			)}
			{generationError && (
				<div className="bg-red-50 dark:bg-red-950/20 rounded-xl px-6 py-4 border border-red-200/50 dark:border-red-800/50">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
							<div className="h-5 w-5 rounded-full bg-red-600 flex items-center justify-center">
								<span className="text-white text-xs font-bold">!</span>
							</div>
						</div>
						<div>
							<p className="font-medium text-red-900 dark:text-red-100">Generation Error</p>
							<p className="text-sm text-red-700 dark:text-red-300">{generationError.message}</p>
						</div>
					</div>
				</div>
			)}

			{/* Enhanced Footer */}
			{(submissionSuccessMessage || submissionError) && (
				<div className="space-y-4">
					{submissionSuccessMessage && (
						<div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl px-6 py-4 border border-emerald-200/50 dark:border-emerald-800/50">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
									<div className="w-5 h-5 text-emerald-600">✅</div>
								</div>
								<div>
									<p className="font-medium text-emerald-900 dark:text-emerald-100">Success!</p>
									<p className="text-sm text-emerald-700 dark:text-emerald-300">{submissionSuccessMessage}</p>
								</div>
							</div>
						</div>
					)}
					{submissionError && (
						<div className="bg-red-50 dark:bg-red-950/20 rounded-xl px-6 py-4 border border-red-200/50 dark:border-red-800/50">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
									<div className="w-5 h-5 text-red-600">❌</div>
								</div>
								<div>
									<p className="font-medium text-red-900 dark:text-red-100">Submission Failed</p>
									<p className="text-sm text-red-700 dark:text-red-300">{submissionError.message}</p>
								</div>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Confirmation Modal */}
			<AlertDialog
				open={showConfirmationModal}
				onOpenChange={setShowConfirmationModal}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will submit your feedback and generate the seed prompt for
							the next stage. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setShowConfirmationModal(false);
								proceedWithSubmission();
							}}
						>
							Continue
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Feedback Content Modal */}
			<AlertDialog
				open={showFeedbackContentModal}
				onOpenChange={(open) => !open && closeFeedbackModal()}
			>
				<AlertDialogContent className="max-w-4xl h-[80vh] flex flex-col">
					<AlertDialogHeader>
						<AlertDialogTitle>
							Feedback for Iteration{" "}
							{feedbackForStageIteration?.iteration_number}
						</AlertDialogTitle>
						<AlertDialogDescription>
							This is the consolidated feedback that was submitted for this
							stage.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="flex-grow overflow-y-auto pr-4">
						{isFetchingFeedbackFileContent ? (
							<div className="flex justify-center items-center h-full">
								<Loader2 className="h-8 w-8 animate-spin" />
							</div>
						) : fetchFeedbackFileContentError ? (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>
									{fetchFeedbackFileContentError.message}
								</AlertDescription>
							</Alert>
						) : currentFeedbackFileContent ? (
							<MarkdownRenderer content={currentFeedbackFileContent.content} />
						) : (
							<p>No content available.</p>
						)}
					</div>
					<AlertDialogFooter>
						<Button variant="outline" onClick={closeFeedbackModal}>
							Close
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
};
