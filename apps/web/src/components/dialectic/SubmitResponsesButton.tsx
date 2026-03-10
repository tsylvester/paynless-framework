import React from 'react';
import {
  useDialecticStore,
  selectActiveContextSessionId,
  selectSortedStages,
  selectStageHasUnsavedChanges,
  selectStageRunProgress,
  selectUnifiedProjectProgress,
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
  const sortedStages = useDialecticStore(selectSortedStages);
  const setActiveStage = useDialecticStore((state) => state.setActiveStage);
  const submitStageResponses = useDialecticStore((state) => state.submitStageResponses);
  const isSubmitting = useDialecticStore((state) => state.isSubmittingStageResponses);
  const submitError = useDialecticStore((state) => state.submitStageResponsesError);

  const {
    activeStageDetail,
    hasUnsavedEdits,
    hasUnsavedFeedback,
    nextStageStarted,
    currentStageHasActiveJobs,
  } = useDialecticStore((state) => {
    const s = state.activeSessionDetail;
    const a = state.activeContextStage;
    const sessionId = selectActiveContextSessionId(state);
    if (!s || !a || typeof s.iteration_count !== 'number') {
      return {
        activeStageDetail: undefined,
        hasUnsavedEdits: false,
        hasUnsavedFeedback: false,
        nextStageStarted: false,
        currentStageHasActiveJobs: false,
      };
    }
    const unified = sessionId
      ? selectUnifiedProjectProgress(state, sessionId)
      : null;
    const detail = unified?.stageDetails.find((d) => d.stageSlug === a.slug);
    const changes = selectStageHasUnsavedChanges(state, s.id, a.slug, s.iteration_count);

    const template = state.currentProcessTemplate;
    const transition = template?.transitions?.find((t) => t.source_stage_id === a.id);
    const nextStageId = transition?.target_stage_id ?? null;
    const nextStage =
      nextStageId && template?.stages
        ? template.stages.find((st) => st.id === nextStageId) ?? null
        : null;
    const nextDetail = nextStage && unified
      ? unified.stageDetails.find((d) => d.stageSlug === nextStage.slug)
      : undefined;
    const nextStageStarted =
      nextDetail != null &&
      (nextDetail.totalDocuments > 0 || nextDetail.stageStatus !== 'not_started');

    const progress = selectStageRunProgress(state, s.id, a.slug, s.iteration_count);
    const activeJobInJobs =
      progress?.jobs?.some(
        (job) => job.status !== 'completed' && job.status !== 'failed'
      ) ?? false;
    const pausedOrActiveInStepStatuses = progress?.stepStatuses
      ? Object.values(progress.stepStatuses).some(
          (status) =>
            status === 'in_progress' ||
            status === 'paused_user' ||
            status === 'paused_nsf'
        )
      : false;
    const currentStageHasActiveJobs = activeJobInJobs || pausedOrActiveInStepStatuses;

    return {
      activeStageDetail: detail,
      hasUnsavedEdits: changes.hasUnsavedEdits,
      hasUnsavedFeedback: changes.hasUnsavedFeedback,
      nextStageStarted,
      currentStageHasActiveJobs,
    };
  });

  const viewedStageMatchesAppStage = useDialecticStore((state) =>
    state.activeContextStage?.slug === state.activeStageSlug,
  );

  const isFinalStage = useDialecticStore((state) => {
    const slug = state.activeStageSlug;
    const template = state.currentProcessTemplate;
    if (!slug || !template?.transitions?.length || !template?.stages?.length) return true;
    const stage = template.stages.find((s) => s.slug === slug);
    if (!stage) return true;
    return !template.transitions.some((t) => t.source_stage_id === stage.id);
  });

  const allDocumentsAvailable =
    activeStageDetail != null &&
    activeStageDetail.totalDocuments > 0 &&
    activeStageDetail.completedDocuments === activeStageDetail.totalDocuments;
  const canShowButton =
    viewedStageMatchesAppStage && !isFinalStage && !nextStageStarted && !currentStageHasActiveJobs;
  const shouldPulse = canShowButton && allDocumentsAvailable && !isSubmitting;

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
              disabled={isSubmitting || !allDocumentsAvailable}
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
