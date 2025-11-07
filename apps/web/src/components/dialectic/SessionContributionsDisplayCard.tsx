import React, { useState, useMemo, useEffect } from 'react';
import {
  useDialecticStore,
  selectIsLoadingProjectDetail,
  selectContributionGenerationStatus,
  selectProjectDetailError,
  selectFeedbackForStageIteration,
  selectCurrentProjectDetail,
  selectActiveStageSlug,
  selectSortedStages,
  selectStageRunProgress,
  selectStageProgressSummary,
} from '@paynless/store';
import {
  ApiError,
  DialecticFeedback,
  SubmitStageResponsesPayload,
} from '@paynless/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { ExportProjectButton } from "./ExportProjectButton";
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';

const isApiError = (error: unknown): error is ApiError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
};

// UI-only mapping of stage names
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
    return processTemplate?.stages?.find(s => s.slug === activeStageSlug) || null;
  }, [processTemplate, activeStageSlug]);
  
  useStageRunProgressHydration();

  // Determine if the active stage is the terminal stage in the process template
  const isFinalStageInProcess = useMemo(() => {
    if (!processTemplate || !activeStage) return false;
    const transitions = (processTemplate as unknown as { transitions?: { source_stage_id: string; target_stage_id: string }[] }).transitions;
    if (!Array.isArray(transitions) || transitions.length === 0) return false;
    // A final stage has no outgoing transition from its stage id
    return transitions.every(t => t.source_stage_id !== activeStage.id);
  }, [processTemplate, activeStage]);
  
  const submitStageResponses = useDialecticStore(state => state.submitStageResponses);
  const isSubmitting = useDialecticStore(state => state.isSubmittingStageResponses);
  const submissionError = useDialecticStore(state => state.submitStageResponsesError);
  const resetSubmitError = useDialecticStore(state => state.resetSubmitStageResponsesError);

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

  useStageRunProgressHydration();

  const stageRunProgress = useDialecticStore((state) =>
    session && activeStage
      ? selectStageRunProgress(state, session.id, activeStage.slug, session.iteration_count)
      : undefined,
  );

  const stageProgressSummary = useDialecticStore((state) =>
    session && activeStage
      ? selectStageProgressSummary(state, session.id, activeStage.slug, session.iteration_count)
      : null,
  );

  const isStageSubmissionReady = Boolean(stageProgressSummary?.isComplete);

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

  const [submissionSuccessMessage, setSubmissionSuccessMessage] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  // ADDED: State for controlling feedback content modal
  const [showFeedbackContentModal, setShowFeedbackContentModal] = useState(false);

  useEffect(() => {
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }
  }, [activeStage, resetSubmitError, submissionError]);

  const modelIdsForStage = useMemo(() => {
    const ids = new Set<string>();

    if (session?.selected_model_ids) {
      session.selected_model_ids.forEach((id) => {
        if (id) {
          ids.add(id);
        }
      });
    }

    if (session?.dialectic_contributions && activeStage && session.iteration_count) {
      session.dialectic_contributions.forEach((contribution) => {
        if (
          contribution.stage === activeStage.slug &&
          contribution.iteration_number === session.iteration_count &&
          contribution.model_id
        ) {
          ids.add(contribution.model_id);
        }
      });
    }

    if (stageRunProgress) {
      for (const descriptor of Object.values(stageRunProgress.documents)) {
        if (descriptor?.modelId) {
          ids.add(descriptor.modelId);
        }
      }
    }

    return Array.from(ids).sort((left, right) => left.localeCompare(right));
  }, [activeStage, session?.dialectic_contributions, session?.iteration_count, session?.selected_model_ids, stageRunProgress]);

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
      const result = await submitStageResponses(payload);

      if (result?.error) {
        throw result.error;
      }

      setSubmissionSuccessMessage('Your feedback has been submitted successfully!');
      toast.success('Feedback submitted!', {
        description: "The next stage's seed prompt has been generated.",
      });
      if (activeStage && sortedStages && setActiveStage) {
        const currentIndex = sortedStages.findIndex((s) => s.slug === activeStage.slug);
        if (currentIndex > -1 && currentIndex < sortedStages.length - 1) {
          const nextStage = sortedStages[currentIndex + 1];
          setActiveStage(nextStage.slug);
        }
      }
    } catch (error) {
      if (isApiError(error)) {
        toast.error('Submission Failed', {
          description: error.message || 'An unexpected error occurred.',
        });
      } else {
        toast.error('Submission Failed', {
          description: 'An unexpected error occurred.',
        });
      }
    }
  };

  const handleSubmitResponses = () => {
    setShowConfirmationModal(true);
  };

  const renderSubmitButton = () => (
    <Button 
        onClick={handleSubmitResponses} 
        disabled={isSubmitting || !isStageSubmissionReady}
        className={cn({ 'animate-pulse': !isSubmitting && isStageSubmissionReady })}
    >
        {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
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
  
  const isGenerating = contributionGenerationStatus === 'generating';
  
  return (
    <div className="space-y-6">
      <Card className="w-full">
      <CardHeader data-testid="card-header">
        <div className="flex justify-between items-center">
          <CardTitle>
            Contributions for: <span className="font-bold text-primary">{activeStage.display_name}</span>
            <span className="text-sm text-muted-foreground ml-2">(Iteration {session.iteration_count})</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            {project && (
              <ExportProjectButton
                projectId={project.id}
                variant={isFinalStageInProcess ? 'default' : 'outline'}
                size="sm"
                className={cn({ 'animate-pulse': isFinalStageInProcess && !isSubmitting && isStageSubmissionReady })}
              >
                Export Project
              </ExportProjectButton>
            )}
            {modelIdsForStage.length > 0 && !isFinalStageInProcess && renderSubmitButton()}
          </div>
        </div>
        {isGenerating && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>Generating new contributions...</span>
          </div>
        )}
        {generationError && (
          <Alert variant="destructive">
            <AlertTitle>Generation Failed</AlertTitle>
            <AlertDescription>{generationError.message}</AlertDescription>
          </Alert>
        )}
      </CardHeader>
      <CardContent>
        {modelIdsForStage.length === 0 && !isGenerating && (
          <div className="text-center text-muted-foreground py-8">
            <p>No contributions available for this stage yet.</p>
            <p className="text-sm">Click "Generate" to create new contributions.</p>
          </div>
        )}
        {isGenerating && modelIdsForStage.length === 0 && (
          // Show skeletons when generating for the first time
          Array.from({ length: 2 }).map((_, index) => <GeneratedContributionCardSkeleton key={index} />)
        )}
        {modelIdsForStage.map((modelId) => (
          <GeneratedContributionCard
            key={modelId}
            modelId={modelId}
          >
            <></>
          </GeneratedContributionCard>
        ))}

        {feedbackForStageIteration && (
          <div className="mt-6 border-t pt-4">
            <h4 className="text-lg font-semibold mb-2">Past Feedback</h4>
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div>
                  <p className="text-sm font-medium">Feedback for Iteration {feedbackForStageIteration.iteration_number}</p>
                  <p className="text-xs text-muted-foreground">Submitted on: {new Date(feedbackForStageIteration.created_at).toLocaleString()}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleShowFeedbackContent(feedbackForStageIteration)}>
                  View Feedback
                </Button>
            </div>
          </div>
        )}
      </CardContent>
      {modelIdsForStage.length > 0 && (
        <CardFooter className="flex justify-end space-x-2" data-testid="card-footer">
            {submissionSuccessMessage && (
                <div className="text-green-600 mr-auto transition-opacity duration-300">
                    {submissionSuccessMessage}
                </div>
            )}
            {submissionError && (
                 <Alert variant="destructive" className="mr-auto">
                    <AlertTitle>Submission Error</AlertTitle>
                    <AlertDescription>{submissionError.message}</AlertDescription>
                </Alert>
            )}

            {!isFinalStageInProcess && renderSubmitButton()}
            {isFinalStageInProcess && project && (
              <ExportProjectButton
                projectId={project.id}
                variant="default"
                size="sm"
                className={cn({ 'animate-pulse': !isSubmitting && isStageSubmissionReady })}
              >
                Export Project
              </ExportProjectButton>
            )}
        </CardFooter>
      )}

      </Card>

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
							{fetchFeedbackFileContentError?.message ?? 'Unable to load feedback.'}
								</AlertDescription>
							</Alert>
				) : currentFeedbackFileContent ? (
					<MarkdownRenderer content={currentFeedbackFileContent?.content ?? ''} />
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
