import React, { useState } from "react";
import {
	useDialecticStore,
	selectCanAdvanceStage,
	selectSortedStages,
	selectStageHasUnsavedChanges,
} from "@paynless/store";
import type {
	ApiError,
	SelectCanAdvanceStageReturn,
	StartContributionGenerationResult,
	SubmitStageResponsesPayload,
} from "@paynless/types";
import { useStartContributionGeneration } from "@/hooks/useStartContributionGeneration";
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

function autoGenFailureMessage(
	areAnyModelsSelected: boolean,
	isWalletReady: boolean,
	balanceMeetsThreshold: boolean,
	isStageReady: boolean,
	errorFromResult: string | undefined,
): string {
	if (!areAnyModelsSelected) {
		return "Select at least one AI model to begin generating this stage.";
	}
	if (!isWalletReady) {
		return "Connect a wallet to begin generating this stage.";
	}
	if (!balanceMeetsThreshold) {
		return "Your wallet balance is below the minimum required for this stage. Add funds to continue.";
	}
	if (!isStageReady) {
		return "This stage's prerequisites are not yet met.";
	}
	return errorFromResult ?? "Generation could not be started.";
}

export const SubmitResponsesButton: React.FC = () => {
	const canAdvanceResult: SelectCanAdvanceStageReturn = useDialecticStore(
		selectCanAdvanceStage,
	);
	const project = useDialecticStore((state) => state.currentProjectDetail);
	const session = useDialecticStore((state) => state.activeSessionDetail);
	const activeContextStage = useDialecticStore((state) => state.activeContextStage);
	const sortedStages = useDialecticStore(selectSortedStages);
	const setViewingStage = useDialecticStore((state) => state.setViewingStage);
	const submitStageResponses = useDialecticStore(
		(state) => state.submitStageResponses,
	);
	const isSubmitting = useDialecticStore(
		(state) => state.isSubmittingStageResponses,
	);
	const submitError = useDialecticStore(
		(state) => state.submitStageResponsesError,
	);

	const { hasUnsavedEdits, hasUnsavedFeedback } = useDialecticStore(
		(state) => {
			const s = state.activeSessionDetail;
			const a = state.activeContextStage;
			if (!s || !a || typeof s.iteration_count !== "number") {
				return { hasUnsavedEdits: false, hasUnsavedFeedback: false };
			}
			const changes = selectStageHasUnsavedChanges(
				state,
				s.id,
				a.slug,
				s.iteration_count,
			);
			return {
				hasUnsavedEdits: changes.hasUnsavedEdits,
				hasUnsavedFeedback: changes.hasUnsavedFeedback,
			};
		},
	);

	const {
		startContributionGeneration,
		areAnyModelsSelected,
		isWalletReady,
		balanceMeetsThreshold,
		isStageReady,
	} = useStartContributionGeneration();

	const [autoGenResult, setAutoGenResult] = useState<StartContributionGenerationResult | null>(
		null,
	);

	if (!canAdvanceResult.canAdvance) {
		return null;
	}

	const shouldPulse = !isSubmitting;

	const handleSubmit = async (): Promise<void> => {
		if (!session || !activeContextStage || !project) return;
		const payload: SubmitStageResponsesPayload = {
			sessionId: session.id,
			projectId: project.id,
			stageSlug: activeContextStage.slug,
			currentIterationNumber: session.iteration_count,
		};
		try {
			const result = await submitStageResponses(payload);
			if (result.error) {
				const err: ApiError = result.error;
				toast.error(err.message);
				return;
			}
			toast.success("Stage advanced!");
			const currentIndex = sortedStages.findIndex(
				(s) => s.id === activeContextStage.id,
			);
			if (currentIndex >= 0 && currentIndex < sortedStages.length - 1) {
				const nextStage = sortedStages[currentIndex + 1];
				if (nextStage) {
					setViewingStage(nextStage.slug);
				}
			}
			const genResult: StartContributionGenerationResult =
				await startContributionGeneration();
			setAutoGenResult(genResult);
			if (genResult.success) {
				setAutoGenResult(null);
			}
		} catch (e) {
			const err = e instanceof Error;
			toast.error(err);
		}
	};

	const autoGenAlertMessage =
		autoGenResult && !autoGenResult.success
			? autoGenFailureMessage(
					areAnyModelsSelected,
					isWalletReady,
					balanceMeetsThreshold,
					isStageReady,
					autoGenResult.error,
				)
			: null;

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
							disabled={isSubmitting}
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
			{autoGenAlertMessage ? (
				<Alert variant="default" className="mt-4">
					<AlertDescription>{autoGenAlertMessage}</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
};
