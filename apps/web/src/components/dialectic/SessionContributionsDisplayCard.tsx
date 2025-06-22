import React, { useState, useMemo, useEffect } from 'react';
import { 
  useDialecticStore, 
  selectIsStageReadyForSessionIteration,
  selectIsLoadingProjectDetail,
  selectContributionGenerationStatus,
  selectProjectDetailError,
  selectFeedbackForStageIteration
} from '@paynless/store';
import { 
  DialecticContribution, 
  ApiError, 
  DialecticSession, 
  DialecticStage, 
  DialecticFeedback, 
  GetProjectResourceContentResponse,
  SubmitStageResponsesPayload
} from '@paynless/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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

// ADDED: Local type alias to ensure GetProjectResourceContentResponse is marked as used
type FeedbackContentType = GetProjectResourceContentResponse;

interface SessionContributionsDisplayCardProps {
  session: DialecticSession | undefined;
  activeStage: DialecticStage | null;
}

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

export const SessionContributionsDisplayCard: React.FC<SessionContributionsDisplayCardProps> = ({ session, activeStage }) => {
  const project = useDialecticStore(state => state.currentProjectDetail);
  
  const submitStageResponses = useDialecticStore(state => state.submitStageResponses);
  const isSubmitting = useDialecticStore(state => state.isSubmittingStageResponses);
  const submissionError: ApiError | null = useDialecticStore(state => state.submitStageResponsesError || null);
  const resetSubmitError = useDialecticStore(state => state.resetSubmitStageResponsesError);

  // New store states for loading and error handling
  const isLoadingCurrentProjectDetail = useDialecticStore(selectIsLoadingProjectDetail);
  const contributionGenerationStatus = useDialecticStore(selectContributionGenerationStatus);
  const projectDetailError = useDialecticStore(selectProjectDetailError);

  // Store items for feedback content
  const fetchFeedbackFileContent = useDialecticStore(state => state.fetchFeedbackFileContent);
  // MODIFIED: Use the local type alias
  const currentFeedbackFileContent: FeedbackContentType | null = useDialecticStore(state => state.currentFeedbackFileContent);
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
  // MODIFIED: Take the first element if the selector returns an array
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
    if (!session?.dialectic_contributions || !session.iteration_count || !activeStage) return [];

    const contributionsForStageAndIteration = session.dialectic_contributions.filter(
      c => c.stage.slug === activeStage.slug && c.iteration_number === session.iteration_count
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
      if (result?.data || !result.error) {
        setSubmissionSuccessMessage('Responses submitted successfully. The next stage is being prepared.');
        toast.success("Responses Submitted", { description: "The next stage is being prepared." });
        setStageResponses({});
      } else {
        if (result.error?.message) {
             toast.error("Submission Failed", { description: result.error.message });
        } else {
            toast.error("Submission Failed", { description: "An unexpected error occurred." });
        }
      }
    } catch (e: unknown) {
      console.error("Error submitting stage responses:", e);
      let errorMessage = "An unexpected client-side error occurred.";
      if (
        typeof e === 'object' &&
        e !== null &&
        'message' in e &&
        typeof e.message === 'string'
      ) {
        errorMessage = e.message;
      } else if (e instanceof Error) {
        errorMessage = e.message;
      }
      toast.error("Submission Error", { description: errorMessage });
    }
  };

  const handleSubmitResponses = async () => {
    if (!session || !activeStage || !project) return;

    const hasUserEdits = displayedContributions.some(
      c => c.user_id && c.edit_version > 1 
    );
    const hasUserResponses = Object.values(stageResponses).some(text => text.trim() !== '');

    if (!hasUserEdits && !hasUserResponses) {
      setShowConfirmationModal(true);
    } else {
      await proceedWithSubmission();
    }
  };

  const activeStageDisplayName =
    activeStage?.display_name || 'Current Stage';

  // --- Conditional Rendering Logic Starts Here ---

  if (!project || !session || !activeStage) {
    return (
        <Card className="mt-4">
            <CardHeader><CardTitle>Loading Contributions...</CardTitle></CardHeader>
            <CardContent><p>Waiting for project, active session, and stage context...</p></CardContent>
        </Card>
    );
  }

  // 1. Generation actively in progress (initiating/generating)
  if (contributionGenerationStatus === 'initiating' || contributionGenerationStatus === 'generating') {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Contributions for: {activeStageDisplayName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center text-lg mt-4 p-8" data-testid="contributions-generating-spinner">
            <Loader2 className="mr-2 h-8 w-8 animate-spin mb-4" data-testid="loader-icon" />
            <p>Contributions are being generated.</p>
            <p className="text-sm text-muted-foreground">This card will update shortly.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Only show stage not ready if not actively generating contributions
  if (!isStageReady && contributionGenerationStatus === 'idle') {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Contributions for: {activeStageDisplayName}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="default" data-testid="stage-not-ready-alert">
            <AlertTitle>Stage Not Ready</AlertTitle>
            <AlertDescription>
              The seed prompt for this stage and iteration is not yet available. Contributions cannot be displayed or generated.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // 2. Loading project details (potentially after generation completed its API call and triggered a refresh)
  // AND no contributions are yet visible for the current stage/iteration.
  if (isLoadingCurrentProjectDetail && displayedContributions.length === 0 && contributionGenerationStatus === 'idle') {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Contributions for: {activeStageDisplayName}</CardTitle>
        </CardHeader>
        <CardContent data-testid="contributions-loading-skeletons">
          <p className="text-sm text-muted-foreground mb-4">Loading new contributions...</p>
          <GeneratedContributionCardSkeleton />
          <GeneratedContributionCardSkeleton />
        </CardContent>
      </Card>
    );
  }

  // 3. Error during the project detail refresh (potentially after generation)
  if (projectDetailError && !isLoadingCurrentProjectDetail && contributionGenerationStatus === 'idle') {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Contributions for: {activeStageDisplayName}</CardTitle>
        </CardHeader>
        <CardContent data-testid="contributions-fetch-error">
          <Alert variant="destructive">
            <AlertTitle>Error Loading Contributions</AlertTitle>
            <AlertDescription>
              Failed to load contributions: {projectDetailError.message}. Please try refreshing or generating again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  
  const canSubmit = displayedContributions.length > 0 && !isSubmitting;

  // --- Main Display Logic (Contributions or Empty State) ---
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Contributions for: {activeStageDisplayName}</CardTitle>
        <CardDescription>
          Review the generated contributions below. You can provide feedback or responses to each.
        </CardDescription>
        {submissionSuccessMessage && (
            <Alert variant="default" className="mt-2">
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{submissionSuccessMessage}</AlertDescription>
            </Alert>
        )}
        {submissionError && (
            <Alert variant="destructive" className="mt-2">
                <AlertTitle>Submission Error</AlertTitle>
                <AlertDescription>{submissionError.message}</AlertDescription>
            </Alert>
        )}
        {/* ADDED: Alert for feedback content fetch error within CardHeader for general visibility */}
        {fetchFeedbackFileContentError && !showFeedbackContentModal && (
          <Alert variant="destructive" className="mt-2">
            <AlertTitle>Error Fetching Feedback File</AlertTitle>
            <AlertDescription>
              {fetchFeedbackFileContentError.message}
              <Button variant="link" size="sm" onClick={() => resetFetchFeedbackFileContentError()} className="ml-2 p-0 h-auto">Dismiss</Button>
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>
      <CardContent>
        {/* Display feedback metadata if available */}
        {feedbackForStageIteration && (
          <div className="mb-6 p-4 border rounded-md bg-muted/40" data-testid="stage-feedback-display">
            <h4 className="font-semibold mb-2 text-md">Stage Feedback Summary</h4>
            <p className="text-sm text-muted-foreground">
              Feedback File: <span className="font-medium text-foreground">{feedbackForStageIteration.file_name}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Submitted on: {new Date(feedbackForStageIteration.created_at).toLocaleString()}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={async () => {
                if (project && feedbackForStageIteration) {
                  if (fetchFeedbackFileContentError) resetFetchFeedbackFileContentError();
                  await fetchFeedbackFileContent({ projectId: project.id, storagePath: feedbackForStageIteration.storage_path });
                  setShowFeedbackContentModal(true);
                }
              }}
              disabled={isFetchingFeedbackFileContent}
            >
              {isFetchingFeedbackFileContent ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              View Feedback Content
            </Button>
          </div>
        )}
        {displayedContributions.length > 0 ? (
          <div className="space-y-4">
            {displayedContributions.map(contrib => (
              <GeneratedContributionCard
                key={contrib.id}
                contributionId={contrib.id}
                projectId={project.id}
                originalModelContributionIdForResponse={contrib.original_model_contribution_id || contrib.id}
                initialResponseText={stageResponses[contrib.original_model_contribution_id || contrib.id] || ''}
                onResponseChange={handleResponseChange}
              />
            ))}
          </div>
        ) : (
          // 4. No contributions displayed and not currently loading/generating/error for the first time
          // This state is reached if isStageReady IS true, but other conditions above weren't met and list is empty.
          !isLoadingCurrentProjectDetail && contributionGenerationStatus === 'idle' && !projectDetailError && (
            <div data-testid="no-contributions-yet" className="text-center py-8">
              <p className="text-muted-foreground">
                No contributions have been generated for {activeStageDisplayName} in this iteration yet.
              </p>
              {/* You might add a button here or text guiding the user if appropriate */}
            </div>
          )
        )}
      </CardContent>
      {displayedContributions.length > 0 && activeStage.slug !== 'paralysis' && (
        <CardFooter className="flex justify-end">
          <Button onClick={handleSubmitResponses} disabled={!canSubmit}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" data-testid="loader-icon" /> : null}
            Submit Responses & Proceed
          </Button>
        </CardFooter>
      )}
      <AlertDialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Proceed Without Feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't edited any contributions or added any responses for this stage. 
              Are you sure you want to proceed to the next stage?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setShowConfirmationModal(false);
              await proceedWithSubmission();
            }}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ADDED: Modal for displaying feedback content */}
      {showFeedbackContentModal && (
        <AlertDialog open={showFeedbackContentModal} onOpenChange={(isOpen) => {
          setShowFeedbackContentModal(isOpen);
          if (!isOpen) {
            clearCurrentFeedbackFileContent(); // Clear content and errors when modal is closed
          }
        }}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Feedback Content: {currentFeedbackFileContent?.fileName || feedbackForStageIteration?.file_name || 'Loading...'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Content of the submitted feedback file.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4 max-h-[60vh] overflow-y-auto p-1 border rounded-md min-h-[200px]">
              {isFetchingFeedbackFileContent && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="ml-2 text-muted-foreground">Loading feedback...</p>
                </div>
              )}
              {!isFetchingFeedbackFileContent && fetchFeedbackFileContentError && (
                <Alert variant="destructive">
                  <AlertTitle>Error Loading Content</AlertTitle>
                  <AlertDescription>{fetchFeedbackFileContentError.message}</AlertDescription>
                </Alert>
              )}
              {!isFetchingFeedbackFileContent && !fetchFeedbackFileContentError && currentFeedbackFileContent && (
                <MarkdownRenderer content={currentFeedbackFileContent.content} />
              )}
              {!isFetchingFeedbackFileContent && !fetchFeedbackFileContentError && !currentFeedbackFileContent && (
                 <p className="text-muted-foreground text-center py-4">No content to display or content has been cleared.</p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                  setShowFeedbackContentModal(false);
                  clearCurrentFeedbackFileContent();
              }}>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
};