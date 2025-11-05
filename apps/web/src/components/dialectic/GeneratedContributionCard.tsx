import React from 'react';
import {
  selectFocusedStageDocument,
} from '@paynless/store';
import { useDialecticStore } from '@paynless/store';
import {
  type StageDocumentCompositeKey,
  type SetFocusedStageDocumentPayload,
  type FocusedStageDocumentState,
} from '@paynless/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { TextInputArea } from '@/components/common/TextInputArea';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { StageRunChecklist } from './StageRunChecklist';

const getStageDocumentKey = (key: StageDocumentCompositeKey): string =>
	`${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

interface GeneratedContributionCardProps {
  modelId: string;
}

export const GeneratedContributionCard: React.FC<GeneratedContributionCardProps> = ({
  modelId,
}) => {
  const {
    sessionId,
    stageSlug,
    iterationNumber,
    setFocusedStageDocument,
    updateStageDocumentDraft,
    submitStageDocumentFeedback,
    modelCatalog,
    stageDocumentContent,
    focusedDocument,
  } = useDialecticStore((state) => {
    const sessionId = state.activeContextSessionId;
    const stageSlug = state.activeStageSlug;
    const focusedDocument =
      sessionId && stageSlug
        ? selectFocusedStageDocument(state, sessionId, stageSlug, modelId)
        : null;

    return {
      sessionId: state.activeContextSessionId,
      stageSlug: state.activeStageSlug,
      iterationNumber: state.activeSessionDetail?.iteration_count,
      setFocusedStageDocument: state.setFocusedStageDocument,
      updateStageDocumentDraft: state.updateStageDocumentDraft,
      submitStageDocumentFeedback: state.submitStageDocumentFeedback,
      modelCatalog: state.modelCatalog,
      stageDocumentContent: state.stageDocumentContent,
      focusedDocument,
    };
  });

  const model = modelCatalog.find((m) => m.id === modelId);
  const modelName = model?.model_name ?? modelId;

  const focusedStageDocumentMap: Record<string, FocusedStageDocumentState | null> = {};
  if (sessionId && stageSlug && focusedDocument) {
    const focusKey = `${sessionId}:${stageSlug}:${modelId}`;
    focusedStageDocumentMap[focusKey] = focusedDocument;
  }

  const compositeKey: StageDocumentCompositeKey | null =
    sessionId && stageSlug && iterationNumber !== undefined && focusedDocument
      ? {
          sessionId,
          stageSlug,
          iterationNumber,
          modelId,
          documentKey: focusedDocument.documentKey,
        }
      : null;
      
  const serializedKey = compositeKey ? getStageDocumentKey(compositeKey) : null;

  const contentState = serializedKey ? stageDocumentContent[serializedKey] : null;

  const handleDocumentSelect = (payload: SetFocusedStageDocumentPayload) => {
    if (sessionId && stageSlug && iterationNumber !== undefined) {
      setFocusedStageDocument(payload);
    }
  };

  const handleFeedbackChange = (newText: string) => {
    if (compositeKey) {
      updateStageDocumentDraft(compositeKey, newText);
    }
  };

  const handleSaveFeedback = async () => {
    const draftFeedback = contentState?.currentDraftMarkdown;
    if (compositeKey && draftFeedback) {
      await submitStageDocumentFeedback({
        ...compositeKey,
        feedback: draftFeedback,
      });
      toast.success('Feedback saved successfully.');
    } else {
      toast.error('Could not save feedback.');
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="text-lg">{modelName}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col lg:flex-row gap-4 mx-6">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Documents
          </h4>
          <StageRunChecklist
            modelId={modelId}
            onDocumentSelect={handleDocumentSelect}
            focusedStageDocumentMap={focusedStageDocumentMap}
          />
        </div>

        <div className="flex-1 min-w-0">
          {focusedDocument ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Content: {focusedDocument.documentKey}
                </h4>
                {contentState?.isLoading && (
                  <Skeleton className="h-24 w-full" />
                )}
                {contentState?.error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {contentState.error.message}
                    </AlertDescription>
                  </Alert>
                )}
                {contentState === null && (
                  <div>No content available.</div>
                )}
                {contentState !== null && !contentState?.isLoading && !contentState.error && (
                  <TextInputArea
                    label=""
                    value={
                      contentState.baselineMarkdown ?? 'No content available.'
                    }
                    onChange={() => {}} // No-op for disabled input
                    disabled
                    showPreviewToggle
                    initialPreviewMode
                  />
                )}
              </div>
              {contentState !== null && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Your Feedback
                  </h4>
                  <TextInputArea
                    label=""
                    value={contentState.currentDraftMarkdown ?? ''}
                    onChange={handleFeedbackChange}
                    placeholder={focusedDocument ? `Enter feedback for ${focusedDocument.documentKey}...` : 'Enter feedback...'}
                    showPreviewToggle
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      onClick={handleSaveFeedback}
                      size="sm"
                      disabled={!contentState.isDirty}
                    >
                      <Save className="mr-1.5 h-4 w-4" />
                      Save Feedback
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a document to view its content and provide feedback.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}; 