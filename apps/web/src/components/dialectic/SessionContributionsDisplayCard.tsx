import React, { useMemo, useEffect, useState } from 'react';
import {
  useDialecticStore,
  selectIsLoadingProjectDetail,
  selectContributionGenerationStatus,
  selectProjectDetailError,
  selectFeedbackForStageIteration,
  selectCurrentProjectDetail,
  selectActiveStageSlug,
  selectSortedStages,
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
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { cn } from '@/lib/utils';
import { ExportProjectButton } from './ExportProjectButton';
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';

const isApiError = (error: unknown): error is ApiError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
};

// Skeleton component for GeneratedContributionCard
const GeneratedContributionCardSkeleton: React.FC = () => (
  <Card className="mb-4">
    <CardHeader>
      <Skeleton className="h-5 w-1/3 mb-2" role="status" /> 
      <Skeleton className="h-4 w-1/4" role="status" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-4 w-full mb-2" role="status" />
      <Skeleton className="h-4 w-full mb-2" role="status" />
      <Skeleton className="h-4 w-2/3" role="status" />
    </CardContent>
    <CardFooter>
      <Skeleton className="h-8 w-24" role="status" />
    </CardFooter>
  </Card>
);

export const SessionContributionsDisplayCard: React.FC = () => {
  // --- Store Data using Reactive Hooks ---
  const project = useDialecticStore(selectCurrentProjectDetail);
  const session = useDialecticStore(state => state.activeSessionDetail);
  const activeStageSlug = useDialecticStore(selectActiveStageSlug);
  const processTemplate = useDialecticStore(state => state.currentProcessTemplate);
  const sortedStages = useDialecticStore(selectSortedStages);
  const setActiveStage = useDialecticStore(state => state.setActiveStage);
  const selectedModelIds = useDialecticStore(state => state.selectedModelIds) ?? [];

  const activeStage = useMemo(() => {
    return processTemplate?.stages?.find(s => s.slug === activeStageSlug) || null;
  }, [processTemplate, activeStageSlug]);
  
  useStageRunProgressHydration();

  // Determine if the active stage is the terminal stage in the process template
  const isFinalStageInProcess = useMemo(() => {
    if (!processTemplate || !activeStage) return false;
    const transitions = processTemplate.transitions;
    if (!Array.isArray(transitions) || transitions.length === 0) return false;
    // A final stage has no outgoing transition from its stage id
    return transitions.every(t => t.source_stage_id !== activeStage.id);
  }, [processTemplate, activeStage]);
  
  const submitStageResponses = useDialecticStore(state => state.submitStageResponses);
  const isSubmitting = useDialecticStore(state => state.isSubmittingStageResponses);
  const submissionError = useDialecticStore(state => state.submitStageResponsesError);
  const resetSubmitError = useDialecticStore(state => state.resetSubmitStageResponsesError);

  // New store states for loading and error handling
  const isLoadingCurrentProjectDetail = useDialecticStore(selectIsLoadingProjectDetail);
  const contributionGenerationStatus = useDialecticStore(selectContributionGenerationStatus);
  const projectDetailError = useDialecticStore(selectProjectDetailError);
  const generationError = useDialecticStore(state => state.generateContributionsError);

  // Store items for feedback content
  const fetchFeedbackFileContent = useDialecticStore(state => state.fetchFeedbackFileContent);
  const currentFeedbackFileContent = useDialecticStore(state => state.currentFeedbackFileContent);
  const isFetchingFeedbackFileContent = useDialecticStore(state => state.isFetchingFeedbackFileContent);
  const fetchFeedbackFileContentError = useDialecticStore(state => state.fetchFeedbackFileContentError);
  const clearCurrentFeedbackFileContent = useDialecticStore(state => state.clearCurrentFeedbackFileContent);
  const resetFetchFeedbackFileContentError = useDialecticStore(state => state.resetFetchFeedbackFileContentError);

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
  const feedbacksForStageIterationArray = useDialecticStore(state => 
    project && session && activeStage 
      ? selectFeedbackForStageIteration(state, session.id, activeStage.slug, session.iteration_count)
      : null
  );
  const feedbackForStageIteration: DialecticFeedback | undefined = feedbacksForStageIterationArray?.[0];

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
      responses: [], // This is legacy, the store action will handle drafts
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
    // The confirmation modal is shown to prevent accidental submission.
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
      toast.warning('No feedback content to display.', {
        description: 'The selected feedback record does not have an associated file path.',
      });
    }
  };

  const closeFeedbackModal = () => {
    setShowFeedbackContentModal(false);
    clearCurrentFeedbackFileContent?.(); // Clear content when closing
    resetFetchFeedbackFileContentError?.(); // Clear any errors
  }

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

  const isGenerating = contributionGenerationStatus === 'generating';
  const iterationLabel = typeof session?.iteration_count === 'number' ? session.iteration_count : null;
  const stageDisplayName = activeStage?.display_name ?? 'Stage';
  
  return (
    <Card className="w-full">
      <CardHeader data-testid="card-header">
        <div className="flex justify-between items-center">
          <CardTitle>
            {activeStage ? (
              <>
                Contributions for: <span className="font-bold text-primary">{stageDisplayName}</span>
                {typeof iterationLabel === 'number' && (
                  <span className="text-sm text-muted-foreground ml-2">(Iteration {iterationLabel})</span>
                )}
              </>
            ) : (
              'Contributions'
            )}
          </CardTitle>
          <div className="flex items-center space-x-2">
            {project && (
              <ExportProjectButton
                projectId={project.id}
                variant={isFinalStageInProcess ? 'default' : 'outline'}
                size="sm"
                className={cn({ 'animate-pulse': isFinalStageInProcess && !isSubmitting && canSubmitStageResponses })}
              >
                Export Project
              </ExportProjectButton>
            )}
            {selectedModelIds.length > 0 && !isFinalStageInProcess && renderSubmitButton()}
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
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-4">
            {!session ? (
              <div className="text-sm text-muted-foreground">Please select a session to view its contributions.</div>
            ) : !activeStage ? (
              <div className="text-sm text-muted-foreground">Please select a stage to view its contributions.</div>
            ) : (
              <>
                {selectedModelIds.length === 0 && !isGenerating && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No contributions available for this stage yet.</p>
                    <p className="text-sm">Click "Generate" to create new contributions.</p>
                  </div>
                )}
                {isGenerating && selectedModelIds.length === 0 &&
                  Array.from({ length: 2 }).map((_, index) => (
                    <GeneratedContributionCardSkeleton key={`skeleton-${index}`} />
                  ))}
                {selectedModelIds.map(modelId => (
                  <GeneratedContributionCard
                    key={modelId}
                    modelId={modelId}
                  />
                ))}

                {feedbackForStageIteration && (
                  <div className="mt-6 border-t pt-4">
                    <h4 className="text-lg font-semibold mb-2">Past Feedback</h4>
                    <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                      <div>
                        <p className="text-sm font-medium">
                          Feedback for Iteration {feedbackForStageIteration.iteration_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Submitted on: {new Date(feedbackForStageIteration.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleShowFeedbackContent(feedbackForStageIteration)}
                      >
                        View Feedback
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {/* The StageRunChecklist is now rendered inside each GeneratedContributionCard */}
        </div>
      </CardContent>
      {selectedModelIds.length > 0 && (
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
                className={cn({ 'animate-pulse': !isSubmitting && canSubmitStageResponses })}
              >
                Export Project
              </ExportProjectButton>
            )}
        </CardFooter>
      )}

      {/* Confirmation Modal */}
      <AlertDialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                      This will submit your feedback and generate the seed prompt for the next stage. This action cannot be undone.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                      setShowConfirmationModal(false);
                      proceedWithSubmission();
                  }}>
                      Continue
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {/* Feedback Content Modal */}
      <AlertDialog open={showFeedbackContentModal} onOpenChange={(open) => !open && closeFeedbackModal()}>
        <AlertDialogContent className="max-w-4xl h-[80vh] flex flex-col">
            <AlertDialogHeader>
                <AlertDialogTitle>Feedback for Iteration {feedbackForStageIteration?.iteration_number}</AlertDialogTitle>
                <AlertDialogDescription>
                    This is the consolidated feedback that was submitted for this stage.
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
                      <AlertDescription>{fetchFeedbackFileContentError.message}</AlertDescription>
                  </Alert>
              ) : currentFeedbackFileContent ? (
                  <MarkdownRenderer content={currentFeedbackFileContent.content} />
              ) : (
                  <p>No content available.</p>
              )}
            </div>
            <AlertDialogFooter>
                <Button variant="outline" onClick={closeFeedbackModal}>Close</Button>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};