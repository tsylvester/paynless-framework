import React, { useState, useMemo, useEffect } from "react";
import {
	useDialecticStore,
	selectIsLoadingProjectDetail,
	selectProjectDetailError,
	selectFeedbackForStageIteration,
	selectCurrentProjectDetail,
	selectActiveStageSlug,
	selectSortedStages,
	selectStageProgressSummary,
	selectStageDocumentChecklist,
	selectStageRunProgress,
} from "@paynless/store";
import {
	ApiError,
	DialecticFeedback,
	SubmitStageResponsesPayload,
	StageDocumentChecklistEntry,
	StageDocumentCompositeKey,
	StageDocumentContentState,
	EditedDocumentResource,
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

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';
import { Badge } from "@/components/ui/badge";


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

const DocumentWorkspaceSkeleton: React.FC = () => (
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
	const updateStageDocumentDraft = useDialecticStore((state) => state.updateStageDocumentDraft);
	const stageDocumentContent = useDialecticStore((state) => state.stageDocumentContent);
	const stageDocumentResources = useDialecticStore((state) => state.stageDocumentResources);
	const modelCatalog = useDialecticStore((state) => state.modelCatalog);

  const activeStage = useMemo(() => {
	return processTemplate?.stages?.find((s) => s.slug === activeStageSlug) || null;
  }, [processTemplate, activeStageSlug]);
  
  useStageRunProgressHydration();

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

  const documentsByModel = useDialecticStore((state) => {
    if (!session || !activeStage || typeof session.iteration_count !== 'number') {
      return new Map<string, StageDocumentChecklistEntry[]>();
    }

    const progressKey = `${session.id}:${activeStage.slug}:${session.iteration_count}`;
    const progress = selectStageRunProgress(
      state,
      session.id,
      activeStage.slug,
      session.iteration_count,
    );

    let resolvedModelIds =
      state.selectedModelIds && state.selectedModelIds.length > 0
        ? state.selectedModelIds
        : session.selected_model_ids ?? [];

    if ((!resolvedModelIds || resolvedModelIds.length === 0) && progress?.documents) {
      resolvedModelIds = Object.values(progress.documents)
        .map((entry) => entry?.modelId)
        .filter((modelId): modelId is string => Boolean(modelId));
    }

    const uniqueModels = Array.from(new Set(resolvedModelIds ?? []));
    const map = new Map<string, StageDocumentChecklistEntry[]>();

    if (uniqueModels.length === 0 && progress?.documents) {
      const fallbackModels = Array.from(
        new Set(
          Object.values(progress.documents)
            .map((entry) => entry?.modelId)
            .filter((modelId): modelId is string => Boolean(modelId)),
        ),
      );

      fallbackModels.forEach((modelId) => {
        map.set(modelId, selectStageDocumentChecklist(state, progressKey, modelId));
      });
      return map;
    }

    uniqueModels.forEach((modelId) => {
      map.set(modelId, selectStageDocumentChecklist(state, progressKey, modelId));
    });

    return map;
  });

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

  const isLastStage = useMemo(() => {
    // Handle edge cases: empty sortedStages or null activeStage
    if (!sortedStages || sortedStages.length === 0) {
      return false;
    }
    if (!activeStage) {
      return false;
    }
    // Check if activeStage.slug matches the last stage in sortedStages
    const lastStage = sortedStages[sortedStages.length - 1];
    return activeStage.slug === lastStage?.slug;
  }, [sortedStages, activeStage]);

  const formatDocumentStatus = (status: string): string =>
    status
      .split('_')
      .map((segment) =>
        segment.length > 0 ? `${segment.charAt(0).toUpperCase()}${segment.slice(1)}` : segment,
      )
      .join(' ');

  const buildCompositeKey = (modelId: string, documentKey: string): StageDocumentCompositeKey | null => {
    if (!session || !activeStage || typeof session?.iteration_count !== 'number') {
      return null;
    }

    return {
      sessionId: session.id,
      stageSlug: activeStage.slug,
      iterationNumber: session.iteration_count,
      modelId,
      documentKey,
    };
  };

  const serializeCompositeKey = (key: StageDocumentCompositeKey): string =>
    `${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

  const getDocumentResourceMetadata = (serializedKey: string): EditedDocumentResource | undefined => {
    return stageDocumentResources[serializedKey];
  };

  const handleDocumentDraftChange = (modelId: string, documentKey: string, value: string) => {
    const compositeKey = buildCompositeKey(modelId, documentKey);
    if (!compositeKey) {
      return;
    }

    updateStageDocumentDraft(compositeKey, value);
  };

  const resolveModelName = (modelId: string): string => {
    const catalogEntry = modelCatalog?.find((model) => model.id === modelId) ?? null;
    return catalogEntry?.model_name ?? modelId;
  };

  const documentGroups = useMemo(
    () => Array.from(documentsByModel.entries()),
    [documentsByModel],
  );

const failedDocumentKeys = useMemo(() => {
  if (stageProgressSummary?.hasFailed) {
    return stageProgressSummary.failedDocumentKeys;
  }

  const fallback = documentGroups.flatMap(([, documents]) =>
    documents
      .filter((document) => document.status === 'failed')
      .map((document) => document.documentKey),
  );

  return Array.from(new Set(fallback));
}, [documentGroups, stageProgressSummary]);

const hasGeneratingDocuments = useMemo(() => {
  return documentGroups.some(([, documents]) =>
    documents.some((document) => document.status === 'generating')
  );
}, [documentGroups]);

const isGenerating = hasGeneratingDocuments && failedDocumentKeys.length === 0 && !generationError;

  const hasDocuments = useMemo(
    () => documentGroups.some(([, documents]) => documents.length > 0),
    [documentGroups],
  );

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
      disabled={isSubmitting || !canSubmitStageResponses || isLastStage}
      className={cn({ 'animate-pulse': !isSubmitting && canSubmitStageResponses && !isLastStage })}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
        </>
      ) : isLastStage ? (
        'Project Complete - Final Stage'
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
		return <DocumentWorkspaceSkeleton />;
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

  return (
    <div className="space-y-8">
      <div data-testid="card-header" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-light tracking-tight">{getDisplayName(activeStage)}</h2>
            <p className="text-muted-foreground leading-relaxed">{activeStage.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {renderSubmitButton()}
            {isLastStage && canSubmitStageResponses && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100">
                Project Complete - All stages finished
              </Badge>
            )}
            {feedbackForStageIteration && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShowFeedbackContent(feedbackForStageIteration)}
              >
                View Submitted Feedback
              </Button>
            )}
          </div>
        </div>
      </div>

      {isGenerating && (
        <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl px-6 py-4 border border-blue-200/50 dark:border-blue-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Generating documents</p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Please wait while AI models process your request...
              </p>
            </div>
          </div>
        </div>
      )}
      {(generationError || failedDocumentKeys.length > 0) && (
        <div
          className="bg-red-50 dark:bg-red-950/20 rounded-xl px-6 py-4 border border-red-200/50 dark:border-red-800/50"
          data-testid="generation-error-banner"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
              <div className="h-5 w-5 rounded-full bg-red-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">!</span>
              </div>
            </div>
            <div>
              <p className="font-medium text-red-900 dark:text-red-100">Generation Error</p>
              {generationError?.message && (
                <p className="text-sm text-red-700 dark:text-red-300">{generationError.message}</p>
              )}
              {failedDocumentKeys.length > 0 && (
                <p className="text-xs text-red-700 dark:text-red-300">
                  Failed documents: {failedDocumentKeys.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {hasDocuments ? (
          documentGroups.map(([modelId, documents]) => {
            if (!documents || documents.length === 0) {
              return null;
            }

            const modelName = resolveModelName(modelId);

            return (
              <div key={modelId} className="space-y-4">
                <h3 className="text-base font-semibold text-foreground">{modelName}</h3>
                <div className="space-y-4">
                  {documents.map((document) => {
                    const compositeKey = buildCompositeKey(modelId, document.documentKey);
                    const serializedKey =
                      compositeKey !== null ? serializeCompositeKey(compositeKey) : null;
                    const documentState: StageDocumentContentState | undefined =
                      serializedKey !== null ? stageDocumentContent[serializedKey] : undefined;
                    const draftValue = documentState?.currentDraftMarkdown ?? '';
                    const resourceMetadata = serializedKey !== null ? getDocumentResourceMetadata(serializedKey) : undefined;

                    return (
                      <Card
                        key={`${modelId}-${document.documentKey}`}
                        data-testid={`stage-document-card-${modelId}-${document.documentKey}`}
                      >
                        <CardHeader className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">{modelName}</p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {document.documentKey}
                              </p>
                            </div>
                            <Badge>{formatDocumentStatus(document.status ?? 'not_started')}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {document.jobId && (
                              <span>
                                Job:{' '}
                                <span className="font-medium text-foreground">{document.jobId}</span>
                              </span>
                            )}
                            {document.latestRenderedResourceId && (
                              <span>
                                Latest Render:{' '}
                                <span className="font-medium text-foreground">
                                  {document.latestRenderedResourceId}
                                </span>
                              </span>
                            )}
                            {resourceMetadata?.source_contribution_id && (
                              <span>
                                Source Contribution:{' '}
                                <span className="font-medium text-foreground">
                                  {resourceMetadata.source_contribution_id}
                                </span>
                              </span>
                            )}
                            {resourceMetadata?.updated_at && (
                              <span>
                                Last Modified:{' '}
                                <span className="font-medium text-foreground">
                                  {new Date(resourceMetadata.updated_at).toLocaleString()}
                                </span>
                              </span>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <label
                            className="text-sm font-medium text-muted-foreground"
                            htmlFor={`stage-document-feedback-${modelId}-${document.documentKey}`}
                          >
                            Document Feedback
                          </label>
                          <textarea
                            id={`stage-document-feedback-${modelId}-${document.documentKey}`}
                            data-testid={`stage-document-feedback-${modelId}-${document.documentKey}`}
                            className="w-full min-h-[120px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            value={draftValue}
                            onChange={(event) =>
                              handleDocumentDraftChange(
                                modelId,
                                document.documentKey,
                                event.target.value,
                              )
                            }
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">No documents generated yet.</p>
        )}
      </div>

      <div data-testid="card-footer" className="space-y-4">
        {renderSubmitButton()}
        {isLastStage && canSubmitStageResponses && (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100">
            Project Complete - All stages finished
          </Badge>
        )}
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
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      {submissionSuccessMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {submissionError && (
              <div className="bg-red-50 dark:bg-red-950/20 rounded-xl px-6 py-4 border border-red-200/50 dark:border-red-800/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <div className="h-5 w-5 text-red-600">❌</div>
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
      </div>

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
