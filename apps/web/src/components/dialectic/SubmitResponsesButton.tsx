import React, { useMemo } from 'react';
import {
  useDialecticStore,
  selectIsStageReadyForSessionIteration,
  selectSortedStages,
  selectStageHasUnsavedChanges,
  selectStageProgressSummary,
} from '@paynless/store';
import type { ApiError, SubmitStageResponsesPayload } from '@paynless/types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const SubmitResponsesButton: React.FC = () => {
  const project = useDialecticStore((state) => state.currentProjectDetail);
  const session = useDialecticStore((state) => state.activeSessionDetail);
  const activeStage = useDialecticStore((state) => state.activeContextStage);
  const processTemplate = useDialecticStore((state) => state.currentProcessTemplate);
  const sortedStages = useDialecticStore(selectSortedStages);
  const setActiveStage = useDialecticStore((state) => state.setActiveStage);
  const submitStageResponses = useDialecticStore((state) => state.submitStageResponses);
  const isSubmitting = useDialecticStore((state) => state.isSubmittingStageResponses);
  const submitError = useDialecticStore((state) => state.submitStageResponsesError);

  const isStageReady = useDialecticStore((state) => {
    const p = state.currentProjectDetail;
    const s = state.activeSessionDetail;
    const a = state.activeContextStage;
    if (!p || !s || !a || typeof s.iteration_count !== 'number') return false;
    return selectIsStageReadyForSessionIteration(
      state,
      p.id,
      s.id,
      a.slug,
      s.iteration_count,
    );
  });

  const stageProgressSummary = useDialecticStore((state) => {
    const s = state.activeSessionDetail;
    const a = state.activeContextStage;
    if (!s || !a || typeof s.iteration_count !== 'number') return undefined;
    return selectStageProgressSummary(state, s.id, a.slug, s.iteration_count);
  });

  const { hasUnsavedEdits, hasUnsavedFeedback } = useDialecticStore((state) => {
    const s = state.activeSessionDetail;
    const a = state.activeContextStage;
    if (!s || !a || typeof s.iteration_count !== 'number') {
      return { hasUnsavedEdits: false, hasUnsavedFeedback: false };
    }
    return selectStageHasUnsavedChanges(state, s.id, a.slug, s.iteration_count);
  });

  const isFinalStage = useMemo(() => {
    if (!activeStage || !processTemplate?.transitions?.length) return true;
    return !processTemplate.transitions.some(
      (t) => t.source_stage_id === activeStage.id,
    );
  }, [activeStage, processTemplate?.transitions]);

  const hasContributions =
    stageProgressSummary !== undefined && stageProgressSummary.totalDocuments > 0;
  const isStageComplete = stageProgressSummary?.isComplete ?? false;
  const canShowButton =
    isStageReady && !isFinalStage && hasContributions;
  const shouldPulse = canShowButton && isStageComplete && !isSubmitting;

  const handleSubmit = async (): Promise<void> => {
    if (!session || !activeStage || !project) return;
    const payload: SubmitStageResponsesPayload = {
      sessionId: session.id,
      projectId: project.id,
      stageSlug: activeStage.slug,
      currentIterationNumber: session.iteration_count,
    };
    try {
      const result = await submitStageResponses(payload);
      if (result.error) {
        const err = result.error as ApiError;
        toast.error(err.message);
        return;
      }
      toast.success('Stage advanced!');
      const currentIndex = sortedStages.findIndex((s) => s.id === activeStage.id);
      if (currentIndex >= 0 && currentIndex < sortedStages.length - 1) {
        const nextStage = sortedStages[currentIndex + 1];
        if (nextStage) {
          setActiveStage(nextStage.slug);
        }
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.message ?? 'Submission failed');
    }
  };

  if (!canShowButton) return null;

  return (
    <div data-testid="card-footer" className="">
      {submitError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{submitError.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {(hasUnsavedEdits || hasUnsavedFeedback)}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isSubmitting || !isStageComplete}
              className={
                shouldPulse ? 'animate-pulse ring-2 ring-primary' : undefined
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Responses & Advance Stage'
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit and Advance?</AlertDialogTitle>
              <AlertDialogDescription>
                This will save all your edits and feedback for this stage, then
                advance to the next stage. You can continue editing until you
                submit.
              </AlertDialogDescription>
              {(hasUnsavedEdits || hasUnsavedFeedback) && (
                <span className="text-sm text-muted-foreground">
                  Unsaved work will be saved automatically.
                </span>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};
