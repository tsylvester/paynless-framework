import React, { useEffect } from "react";
import {
	useDialecticStore,
	selectActiveContextSessionId,
	selectSortedStages,
	selectStageHasUnsavedChanges,
	selectStageRunProgress,
	selectUnifiedProjectProgress,
} from "@paynless/store";
import type { ApiError, SubmitStageResponsesPayload } from "@paynless/types";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const SubmitResponsesButton: React.FC = () => {
	const project = useDialecticStore((state) => state.currentProjectDetail);
	const session = useDialecticStore((state) => state.activeSessionDetail);
	const activeStage = useDialecticStore((state) => state.activeContextStage);
	const sortedStages = useDialecticStore(selectSortedStages);
	const setActiveStage = useDialecticStore((state) => state.setActiveStage);
	const submitStageResponses = useDialecticStore(
		(state) => state.submitStageResponses,
	);
	const isSubmitting = useDialecticStore(
		(state) => state.isSubmittingStageResponses,
	);
	const submitError = useDialecticStore(
		(state) => state.submitStageResponsesError,
	);

	const {
		activeStageDetail,
		hasUnsavedEdits,
		hasUnsavedFeedback,
		nextStageStarted,
		currentStageHasActiveJobs,
		progress,
		activeJobInJobs,
		activeInStepStatuses,
		isActivelyGenerating,
	} = useDialecticStore((state) => {
		const s = state.activeSessionDetail;
		const a = state.activeContextStage;
		const sessionId = selectActiveContextSessionId(state);
		if (!s || !a || typeof s.iteration_count !== "number") {
			return {
				activeStageDetail: undefined,
				hasUnsavedEdits: false,
				hasUnsavedFeedback: false,
				nextStageStarted: false,
				currentStageHasActiveJobs: false,
				progress: undefined,
				activeJobInJobs: false,
				activeInStepStatuses: false,
				isActivelyGenerating: false,
			};
		}
		const unified = sessionId
			? selectUnifiedProjectProgress(state, sessionId)
			: null;
		const detail = unified?.stageDetails.find((d) => d.stageSlug === a.slug);
		const changes = selectStageHasUnsavedChanges(
			state,
			s.id,
			a.slug,
			s.iteration_count,
		);

		const template = state.currentProcessTemplate;
		const transition = template?.transitions?.find(
			(t) => t.source_stage_id === a.id,
		);
		const nextStageId = transition?.target_stage_id ?? null;
		const nextStage =
			nextStageId && template?.stages
				? (template.stages.find((st) => st.id === nextStageId) ?? null)
				: null;
		const nextDetail =
			nextStage && unified
				? unified.stageDetails.find((d) => d.stageSlug === nextStage.slug)
				: undefined;
		const nextStageStarted =
			nextDetail != null &&
			(nextDetail.totalDocuments > 0 ||
				nextDetail.stageStatus !== "not_started");

		const progress = selectStageRunProgress(
			state,
			s.id,
			a.slug,
			s.iteration_count,
		);
		// Terminal job states that indicate the job is finished or not active
		// Note: 'pending' and 'waiting_for_prerequisite' mean the job hasn't started yet
		const terminalJobStates = ['completed', 'failed', 'paused_nsf', 'paused_user', 'superseded', 'cancelled', 'pending', 'waiting_for_prerequisite'];
		const activeJobStates = ['processing', 'retrying', 'waiting_for_children'];
		const activeJobs = progress?.jobs?.filter(
			(job) => activeJobStates.includes(job.status)
		) ?? [];
		const activeJobInJobs = activeJobs.length > 0;
		if (activeJobs.length > 0) {
			console.log('Active jobs found:', activeJobs);
		}
		const activeInStepStatuses = progress?.stepStatuses
			? Object.values(progress.stepStatuses).some(
					(status) =>
						status === "in_progress" ||
						status === "waiting_for_children",
				)
			: false;
		// Also check if we're actively generating
		const isActivelyGenerating = state.contributionGenerationStatus === 'generating' && 
			state.generatingForStageSlug === a.slug;
		const currentStageHasActiveJobs =
			activeJobInJobs || activeInStepStatuses || isActivelyGenerating;

		return {
			activeStageDetail: detail,
			hasUnsavedEdits: changes.hasUnsavedEdits,
			hasUnsavedFeedback: changes.hasUnsavedFeedback,
			nextStageStarted,
			currentStageHasActiveJobs,
			progress,
			activeJobInJobs,
			activeInStepStatuses,
			isActivelyGenerating,
		};
	});

	const viewedStageMatchesAppStage = useDialecticStore(
		(state) => {
			const matches = state.activeContextStage?.slug === state.activeStageSlug;
			console.log('viewedStageMatchesAppStage:', matches, {
				activeContextStageSlug: state.activeContextStage?.slug,
				activeStageSlug: state.activeStageSlug
			});
			return matches;
		}
	);

	const isFinalStage = useDialecticStore((state) => {
		const slug = state.activeStageSlug;
		const template = state.currentProcessTemplate;
		console.log('isFinalStage check:', { slug, hasTransitions: !!template?.transitions?.length, hasStages: !!template?.stages?.length });
		if (!slug || !template?.transitions || !template?.stages?.length) {
			console.log('isFinalStage: true (missing data)');
			return true;
		}
		const stage = template.stages.find((s) => s.slug === slug);
		if (!stage) {
			console.log('isFinalStage: true (stage not found)');
			return true;
		}
		const hasOutgoingTransition = template.transitions.some((t) => t.source_stage_id === stage.id);
		console.log('isFinalStage:', !hasOutgoingTransition, { stageId: stage.id, transitions: template.transitions });
		return !hasOutgoingTransition;
	});

	// console.log({ isFinalStage, activeStage, sortedStages });

	const allDocumentsAvailable =
		activeStageDetail != null &&
		activeStageDetail.totalDocuments > 0 &&
		activeStageDetail.completedDocuments === activeStageDetail.totalDocuments;

	// Debug logging
	useEffect(() => {
		console.log('SubmitResponsesButton Debug:', {
			viewedStageMatchesAppStage,
			isFinalStage,
			nextStageStarted,
			currentStageHasActiveJobs,
			activeJobInJobs,
			activeInStepStatuses,
			isActivelyGenerating,
			allDocumentsAvailable,
			activeStageDetail: activeStageDetail ? {
				stageSlug: activeStageDetail.stageSlug,
				totalDocuments: activeStageDetail.totalDocuments,
				completedDocuments: activeStageDetail.completedDocuments,
				stageStatus: activeStageDetail.stageStatus
			} : null,
			activeStage: activeStage?.slug,
			session: session?.id,
			jobs: progress?.jobs?.map(j => ({ 
				status: j.status, 
				documentKey: j.documentKey,
				modelId: j.modelId 
			})),
			stepStatuses: progress?.stepStatuses,
			canShowButton: viewedStageMatchesAppStage && !isFinalStage && !nextStageStarted && !currentStageHasActiveJobs,
		});
	}, [viewedStageMatchesAppStage, isFinalStage, nextStageStarted, currentStageHasActiveJobs, 
		allDocumentsAvailable, activeStageDetail, progress, activeJobInJobs, activeInStepStatuses, isActivelyGenerating, activeStage, session]);


	// Show button when viewing the current stage, not the final stage, and next stage hasn't started
	// For Review step, we should show the button when all documents are complete, regardless of job status
	const isReviewStage = activeStage?.slug === 'review' || activeStage?.name?.toLowerCase() === 'review';
	const canShowButton =
		viewedStageMatchesAppStage &&
		!isFinalStage &&
		!nextStageStarted &&
		(isReviewStage ? allDocumentsAvailable : (!currentStageHasActiveJobs || allDocumentsAvailable));
	
	console.log('Button visibility:', {
		canShowButton,
		isReviewStage,
		conditions: {
			viewedStageMatchesAppStage,
			isFinalStage,
			nextStageStarted,
			currentStageHasActiveJobs,
			allDocumentsAvailable,
		}
	});
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
			toast.success("Stage advanced!");
			const currentIndex = sortedStages.findIndex(
				(s) => s.id === activeStage.id,
			);
			if (currentIndex >= 0 && currentIndex < sortedStages.length - 1) {
				const nextStage = sortedStages[currentIndex + 1];
				if (nextStage) {
					setActiveStage(nextStage.slug);
				}
			}
		} catch (e) {
			const err = e as ApiError;
			toast.error(err.message ?? "Submission failed");
		}
	};

	// Always show the button if all documents are available, even if other conditions aren't met
	if (!canShowButton && !allDocumentsAvailable) {
		console.log('Button hidden - not showing because:', { canShowButton, allDocumentsAvailable });
		return null;
	}

	return (
		<div data-testid="card-footer" className="">
			{submitError ? (
				<Alert variant="destructive" className="mb-4">
					<AlertDescription>{submitError.message}</AlertDescription>
				</Alert>
			) : null}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				{hasUnsavedEdits || hasUnsavedFeedback}
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							disabled={isSubmitting || !allDocumentsAvailable}
							className={
								shouldPulse ? "animate-pulse ring-2 ring-primary" : undefined
							}
						>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Submitting...
								</>
							) : (
								"Submit Responses & Advance Stage"
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
