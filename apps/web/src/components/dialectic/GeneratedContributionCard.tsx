import React, { useCallback, useEffect, useMemo } from 'react';
import {
  useDialecticStore,
  selectActiveContextSessionId,
  selectActiveStageSlug,
  selectStageRunProgress,
  selectFocusedStageDocument,
} from '@paynless/store';
import type {
  ApiError,
  ApiResponse,
  StageDocumentCompositeKey,
  StageDocumentContentState,
  SetFocusedStageDocumentPayload,
} from '@paynless/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { TextInputArea } from '@/components/common/TextInputArea';
import { Badge } from '@/components/ui/badge';
import { Loader2, XCircle, Save } from 'lucide-react';
import { toast } from 'sonner';
import { StageRunChecklist } from './StageRunChecklist';

type GeneratedContributionCardProps = React.PropsWithChildren<{
  modelId: string;
}>;

const buildStageDocumentKey = (key: StageDocumentCompositeKey): string => `${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

export const GeneratedContributionCard: React.FC<GeneratedContributionCardProps> = ({ modelId }) => {
  console.log(`[GeneratedContributionCard] Rendering for modelId: ${modelId}`);

  const activeSessionId = useDialecticStore(selectActiveContextSessionId);
  const activeStageSlug = useDialecticStore(selectActiveStageSlug);
  const activeSessionDetail = useDialecticStore((state) => state.activeSessionDetail);
  const iterationNumber = activeSessionDetail?.iteration_count;

  const focusedStageDocument = useDialecticStore((state) => (
    activeSessionId && activeStageSlug
      ? selectFocusedStageDocument(state, activeSessionId, activeStageSlug, modelId)
      : null
  ));

  const focusedStageDocumentMap = useDialecticStore((state) => state.focusedStageDocument ?? {});

  const stageRunProgress = useDialecticStore((state) => (
    activeSessionId && activeStageSlug && typeof iterationNumber === 'number'
      ? selectStageRunProgress(state, activeSessionId, activeStageSlug, iterationNumber)
      : undefined
  ));

  const setFocusedStageDocument = useDialecticStore((state) => state.setFocusedStageDocument);
  const updateStageDocumentDraft = useDialecticStore((state) => state.updateStageDocumentDraft);
  const flushStageDocumentDraft = useDialecticStore((state) => state.flushStageDocumentDraft);
  const submitStageDocumentFeedback = useDialecticStore((state) => state.submitStageDocumentFeedback);
  const resetSubmitStageDocumentFeedbackError = useDialecticStore((state) => state.resetSubmitStageDocumentFeedbackError);
  const fetchStageDocumentContent = useDialecticStore((state) => state.fetchStageDocumentContent);

  const isSubmittingStageDocumentFeedback = useDialecticStore((state) => state.isSubmittingStageDocumentFeedback);
  const submitStageDocumentFeedbackError: ApiError | null = useDialecticStore((state) => state.submitStageDocumentFeedbackError);

  const compositeKey = useMemo<StageDocumentCompositeKey | null>(() => {
    if (
      !activeSessionId ||
      !activeStageSlug ||
      typeof iterationNumber !== 'number' ||
      !focusedStageDocument
    ) {
      return null;
    }

    return {
      sessionId: activeSessionId,
      stageSlug: activeStageSlug,
      iterationNumber,
      modelId,
      documentKey: focusedStageDocument.documentKey,
    };
  }, [activeSessionId, activeStageSlug, iterationNumber, focusedStageDocument, modelId]);

  const serializedCompositeKey = useMemo(() => (
    compositeKey ? buildStageDocumentKey(compositeKey) : null
  ), [compositeKey]);

  const stageDocumentContentEntry: StageDocumentContentState | undefined = useDialecticStore((state) => {
    if (!serializedCompositeKey) {
      return undefined;
    }
    return state.stageDocumentContent[serializedCompositeKey];
  });

  console.log(`[GeneratedContributionCard] Focused document for modelId ${modelId}:`, focusedStageDocument);
  console.log(`[GeneratedContributionCard] Stage document content entry for modelId ${modelId}:`, stageDocumentContentEntry);

  const stageDocumentDescriptor = useMemo(() => {
    if (!focusedStageDocument || !stageRunProgress) {
      return undefined;
    }
    return stageRunProgress.documents[focusedStageDocument.documentKey];
  }, [focusedStageDocument, stageRunProgress]);

  useEffect(() => {
    if (!compositeKey || !stageDocumentDescriptor) {
      return;
    }

    const resourceId = stageDocumentDescriptor.latestRenderedResourceId;
    if (!resourceId) {
      return;
    }

    if (
      !stageDocumentContentEntry ||
      (!stageDocumentContentEntry.baselineMarkdown && !stageDocumentContentEntry.isLoading)
    ) {
      void fetchStageDocumentContent(compositeKey, resourceId);
    }
  }, [compositeKey, stageDocumentDescriptor, stageDocumentContentEntry, fetchStageDocumentContent]);

  useEffect(() => () => {
    if (submitStageDocumentFeedbackError) {
      resetSubmitStageDocumentFeedbackError();
    }
  }, [resetSubmitStageDocumentFeedbackError, submitStageDocumentFeedbackError]);

  const handleDocumentSelect = useCallback(
    (payload: SetFocusedStageDocumentPayload) => {
      setFocusedStageDocument(payload);
    },
    [setFocusedStageDocument],
  );

  const handleFeedbackChange = useCallback(
    (value: string) => {
      if (!compositeKey) {
        return;
      }
      updateStageDocumentDraft(compositeKey, value);
    },
    [compositeKey, updateStageDocumentDraft],
  );

  const handleDiscardFeedback = useCallback(() => {
    if (!compositeKey) {
      return;
    }
    flushStageDocumentDraft(compositeKey);
    if (submitStageDocumentFeedbackError) {
      resetSubmitStageDocumentFeedbackError();
    }
  }, [compositeKey, flushStageDocumentDraft, resetSubmitStageDocumentFeedbackError, submitStageDocumentFeedbackError]);

  const handleSaveFeedback = useCallback(async () => {
    if (!compositeKey) {
      toast.error('Cannot save feedback: No document selected.');
      return;
    }

    const draftFeedback = stageDocumentContentEntry?.currentDraftMarkdown;
    if (typeof draftFeedback !== 'string') {
      toast.error('Could not save feedback.');
      return;
    }

    if (submitStageDocumentFeedbackError) {
      resetSubmitStageDocumentFeedbackError();
    }

    try {
      const result: ApiResponse<{ success: boolean }> = await submitStageDocumentFeedback({
        ...compositeKey,
        feedback: draftFeedback,
      });

      if (!result.error) {
        toast.success('Feedback saved successfully.');
        return;
      }

      const errorPayload: ApiError = result.error;
      toast.error('Failed to save feedback.', {
        description: errorPayload.message,
      });
    } catch (error) {
      const description = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast.error('Failed to save feedback.', { description });
    }
  }, [compositeKey, resetSubmitStageDocumentFeedbackError, stageDocumentContentEntry, submitStageDocumentFeedback, submitStageDocumentFeedbackError]);

  const hasFocusedDocument = focusedStageDocument !== null;
  const isLoadingContent = stageDocumentContentEntry?.isLoading ?? false;
  const contentError: ApiError | null = stageDocumentContentEntry?.error ?? null;
  const isFeedbackDirty = stageDocumentContentEntry?.isDirty ?? false;
  const contentDisplay = stageDocumentContentEntry?.baselineMarkdown ?? '';
  const feedbackDraft = stageDocumentContentEntry?.currentDraftMarkdown ?? '';
  const stageStatus = stageDocumentDescriptor?.status ?? null;
  const modelDisplayName = stageDocumentDescriptor?.modelId ?? modelId;

  const getStatusMessage = () => {
    switch (stageStatus) {
      case 'idle':
        return `Document generation for ${modelDisplayName} is queued...`;
      case 'generating':
        return `Generating document with ${modelDisplayName}...`;
      case 'retrying':
        return `An issue occurred. Retrying generation for ${modelDisplayName}...`;
      case 'continuing':
        return `Receiving response from ${modelDisplayName}...`;
      default:
        return 'Loading...';
    }
  };

  if (!stageDocumentContentEntry && !focusedStageDocument) {
    return (
      <Card
        className="animate-pulse flex flex-col gap-6 rounded-xl border py-6 shadow-sm"
        data-testid="skeleton-card"
      >
        <CardHeader>
          <Skeleton className="h-5 w-3/4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (
    stageStatus &&
    ['idle', 'generating', 'retrying', 'continuing'].includes(stageStatus)
  ) {
    return (
      <Card className="flex flex-col h-full">
        <CardHeader>
          <CardTitle className="text-lg">{modelDisplayName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center flex-grow py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">{getStatusMessage()}</p>
          {stageStatus === 'retrying' && stageDocumentDescriptor?.status === 'retrying' && (
            <p className="mt-2 text-xs text-destructive text-center">
              The document encountered an error and is being retried.
            </p>
          )}
          {stageStatus === 'continuing' && contentDisplay && (
            <div className="w-full mt-4 p-4 border rounded-md bg-muted/50 max-h-48 overflow-y-auto">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contentDisplay}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (stageStatus === 'failed') {
    return (
      <Card className="flex flex-col h-full border-destructive">
        <CardHeader>
          <CardTitle className="text-lg">{modelDisplayName}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow py-4">
          <Alert variant="destructive">
            <AlertTitle>Generation Failed</AlertTitle>
            <AlertDescription>
              The document could not be generated. Please retry your request or adjust the inputs.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex flex-col gap-2">
          <CardTitle className="text-lg">
            {modelDisplayName}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Document Feedback</Badge>
            {typeof iterationNumber === 'number' && (
              <Badge variant="outline">Iteration {iterationNumber}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <StageRunChecklist
          focusedStageDocumentMap={focusedStageDocumentMap}
          onDocumentSelect={handleDocumentSelect}
          modelId={modelId}
        />

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Content</h4>
              {focusedStageDocument && (
                <Badge variant="outline" className="font-mono text-xs">
                  {focusedStageDocument.documentKey}
                </Badge>
              )}
            </div>

            {!hasFocusedDocument && (
              <p className="text-sm text-muted-foreground">
                Select a document to view its content and provide feedback.
              </p>
            )}

            {hasFocusedDocument && isLoadingContent && (
              <div data-testid="content-loading-skeleton">
                <Skeleton className="h-24 w-full" />
              </div>
            )}

            {focusedStageDocument && !isLoadingContent && !contentError && (
              <TextInputArea
                id={`document-content-${modelId}`}
                value={contentDisplay}
                onChange={() => undefined}
                disabled
                showPreviewToggle={false}
                showFileUpload={false}
              />
            )}

            {contentError && (
              <Alert variant="destructive">
                <AlertTitle>Content Unavailable</AlertTitle>
                <AlertDescription>{contentError.message}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Your Feedback</h4>
              {stageDocumentDescriptor?.status && (
                <Badge>{stageDocumentDescriptor.status}</Badge>
              )}
            </div>

            {!hasFocusedDocument && (
              <p className="text-sm text-muted-foreground">
                Select a document to view its content and provide feedback.
              </p>
            )}

            {focusedStageDocument && (
              <TextInputArea
                id={`feedback-${modelId}`}
                value={feedbackDraft}
                onChange={handleFeedbackChange}
                placeholder={`Enter feedback for ${focusedStageDocument.documentKey}`}
                showPreviewToggle={false}
                showFileUpload={false}
              />
            )}

            {submitStageDocumentFeedbackError && (
              <Alert variant="destructive">
                <AlertTitle>Feedback Error</AlertTitle>
                <AlertDescription>{submitStageDocumentFeedbackError.message}</AlertDescription>
              </Alert>
            )}

            {focusedStageDocument && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscardFeedback}
                  disabled={isSubmittingStageDocumentFeedback}
                >
                  <XCircle className="mr-1.5 h-4 w-4" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveFeedback}
                  disabled={!isFeedbackDirty || isSubmittingStageDocumentFeedback}
                >
                  {isSubmittingStageDocumentFeedback ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  {isSubmittingStageDocumentFeedback ? 'Saving...' : 'Save Feedback'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};