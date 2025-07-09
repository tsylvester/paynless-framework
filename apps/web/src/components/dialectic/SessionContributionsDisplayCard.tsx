import React, { useState, useMemo, useEffect } from 'react';
import { 
  useDialecticStore, 
  selectIsStageReadyForSessionIteration,
  selectIsLoadingProjectDetail,
  selectContributionGenerationStatus,
  selectProjectDetailError,
  selectFeedbackForStageIteration,
  selectCurrentProjectDetail,
  selectActiveStageSlug,
  selectSortedStages
} from '@paynless/store';
import { 
  DialecticContribution, 
  ApiError, 
  DialecticFeedback, 
  SubmitStageResponsesPayload
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

  const activeStage = useMemo(() => {
    return processTemplate?.stages?.find(s => s.slug === activeStageSlug) || null;
  }, [processTemplate, activeStageSlug]);
  
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

  const isStageReady = useDialecticStore(state =>
    project && session && activeStage ? 
    selectIsStageReadyForSessionIteration(
        state,
        project.id,
        session.id,
        activeStage.slug,
        session.iteration_count
    ) : false
  );

  // Select feedback metadata for the current stage and iteration
  const feedbacksForStageIterationArray = useDialecticStore(state => 
    project && session && activeStage 
      ? selectFeedbackForStageIteration(state, session.id, activeStage.slug, session.iteration_count)
      : null
  );
  const feedbackForStageIteration: DialecticFeedback | undefined = feedbacksForStageIterationArray?.[0];

  const [stageResponses, setStageResponses] = useState<Record<string, string>>({});
  const [submissionSuccessMessage, setSubmissionSuccessMessage] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  // ADDED: State for controlling feedback content modal
  const [showFeedbackContentModal, setShowFeedbackContentModal] = useState(false);

  useEffect(() => {
    setStageResponses({});
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }
  }, [activeStage, resetSubmitError, submissionError]);

  const displayedContributions = useMemo(() => {
    if (!session?.dialectic_contributions || !session.iteration_count || !activeStage) {
      return [];
    }

    const contributionsForStageAndIteration = session.dialectic_contributions.filter(
      c => c.stage === activeStage.slug && c.iteration_number === session.iteration_count
    );

    const latestEditsMap = new Map<string, DialecticContribution>();

    for (const contrib of contributionsForStageAndIteration) {
      const originalId = contrib.original_model_contribution_id || contrib.id;
      const existing = latestEditsMap.get(originalId);
      if (!existing || contrib.edit_version > existing.edit_version) {
        latestEditsMap.set(originalId, contrib);
      } else if (contrib.edit_version === existing.edit_version && contrib.is_latest_edit) {
        latestEditsMap.set(originalId, contrib);
      }
    }
    // Ensure the original contribution is added if no edit is present, or if it IS the latest edit.
    for (const contrib of contributionsForStageAndIteration) {
        const originalId = contrib.original_model_contribution_id || contrib.id;
        if (!latestEditsMap.has(originalId)) { // If no version of this originalId is in map, add it
            latestEditsMap.set(originalId, contrib);
        } else { // An edit might exist, ensure we are not overwriting a latest_edit with a non-latest_edit original
            const currentInMap = latestEditsMap.get(originalId)!;
            // If current in map is not the original one and the original one is marked as latest_edit, something is wrong.
            // This logic favors edits if present and marked is_latest_edit.
            // If the current one in map is NOT the latest_edit, but this 'contrib' (original) IS latest_edit, prefer it.
            if (!currentInMap.is_latest_edit && contrib.id === originalId && contrib.is_latest_edit) {
                latestEditsMap.set(originalId, contrib);
            }
        }
    }

    const finalContributions: DialecticContribution[] = [];
    const originalIdsWithAnyLatestEdit = new Set<string>();

    // Prioritize contributions explicitly marked as is_latest_edit
    contributionsForStageAndIteration.forEach(c => {
        if (c.is_latest_edit) {
            originalIdsWithAnyLatestEdit.add(c.original_model_contribution_id || c.id);
            finalContributions.push(c);
        }
    });

    // Add remaining contributions from the map only if their original_id isn't already represented by a latest_edit version
    latestEditsMap.forEach((value, key) => {
        if (!originalIdsWithAnyLatestEdit.has(key)) {
            finalContributions.push(value);
        }
    });
    
    // Deduplicate just in case the logic above had an edge case, ensuring unique IDs
    const uniqueFinalContributions = Array.from(new Map(finalContributions.map(c => [c.id, c])).values());

    return uniqueFinalContributions.sort((a,b) => (a.model_name || '').localeCompare(b.model_name || ''));

  }, [session, activeStage]);

  const handleResponseChange = (originalModelContributionId: string, responseText: string) => {
    setStageResponses(prev => ({ ...prev, [originalModelContributionId]: responseText }));
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }
  };

  const proceedWithSubmission = async () => {
    if (!session || !session.iteration_count || !activeStage || !project) return;
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }

    // CONSOLIDATE feedback into Markdown
    let consolidatedMarkdown = "";
    let hasAnyResponses = false;
    displayedContributions.forEach(contrib => {
      const originalId = contrib.original_model_contribution_id || contrib.id;
      const responseText = stageResponses[originalId];
      if (responseText && responseText.trim() !== "") {
        hasAnyResponses = true;
        consolidatedMarkdown += `## Feedback for Contribution by ${contrib.model_name || 'Unknown Model'} (ID: ${originalId.substring(0,8)}...)\n\n`;
        consolidatedMarkdown += `${responseText.trim()}\n\n---\n\n`;
      }
    });

    const payload: SubmitStageResponsesPayload = {
      sessionId: session.id,
      currentIterationNumber: session.iteration_count,
      projectId: project.id,
      stageSlug: activeStage.slug,
      responses: [], // Send empty array as feedback is in the file
    };

    if (hasAnyResponses) {
      payload.userStageFeedback = {
        content: consolidatedMarkdown,
        feedbackType: "StageContributionResponses_v1",
        // resourceDescription could be added here if needed in the future
      };
    }

    try {
      // Use the constructed payload
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
      const apiError = error as ApiError;
      toast.error('Submission Failed', {
          description: apiError.message || 'An unexpected error occurred.'
      });
    }
  };
  
  const handleSubmitResponses = async () => {
    // Check if any responses have been entered
    const hasAnyResponses = Object.values(stageResponses).some(text => text && text.trim() !== "");

    if (hasAnyResponses) {
      // If there are responses, show the confirmation modal
      setShowConfirmationModal(true);
    } else {
      // If there are no responses, proceed directly with submission
      await proceedWithSubmission();
    }
  };

  const renderSubmitButton = () => (
    <Button 
        onClick={handleSubmitResponses} 
        disabled={isSubmitting || !isStageReady}
        className={cn({ 'animate-pulse': !isSubmitting && isStageReady })}
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
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>
            Contributions for: <span className="font-bold text-primary">{activeStage.display_name}</span>
            <span className="text-sm text-muted-foreground ml-2">(Iteration {session.iteration_count})</span>
          </CardTitle>
          {displayedContributions.length > 0 && renderSubmitButton()}
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
        {displayedContributions.length === 0 && !isGenerating && (
          <div className="text-center text-muted-foreground py-8">
            <p>No contributions available for this stage yet.</p>
            <p className="text-sm">Click "Generate" to create new contributions.</p>
          </div>
        )}
        {isGenerating && displayedContributions.length === 0 && (
          // Show skeletons when generating for the first time
          Array.from({ length: 2 }).map((_, index) => <GeneratedContributionCardSkeleton key={index} />)
        )}
        {displayedContributions.map(contribution => (
          <GeneratedContributionCard 
            key={contribution.id}
            contributionId={contribution.id}
            initialResponseText={stageResponses[contribution.original_model_contribution_id || contribution.id] || ''}
            onResponseChange={handleResponseChange}
            originalModelContributionIdForResponse={contribution.original_model_contribution_id || contribution.id}
          />
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
      {displayedContributions.length > 0 && (
        <CardFooter className="flex justify-end space-x-2">
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

            {renderSubmitButton()}
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