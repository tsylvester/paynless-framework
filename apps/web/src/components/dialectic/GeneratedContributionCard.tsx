import React, { useCallback, useMemo } from "react";
import {
	useDialecticStore,
	selectStageRunProgress,
	selectFocusedStageDocument,
} from "@paynless/store";
import {
	type StageDocumentCompositeKey,
	type StageRunDocumentDescriptor,
	type SetFocusedStageDocumentPayload,
} from "@paynless/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextInputArea } from "@/components/common/TextInputArea";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StageRunChecklist } from "./StageRunChecklist";

const getStageDocumentKey = (key: StageDocumentCompositeKey): string =>
	`${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

interface GeneratedContributionCardProps {
	modelId: string;
	className?: string;
}
const formatStatusLabel = (value: string | undefined): string => {
	if (!value) {
		return "Unknown";
	}

	const mapping: Record<string, string> = {
		completed: "Completed",
		in_progress: "In Progress",
		not_started: "Not Started",
		waiting_for_children: "Waiting for Children",
		failed: "Failed",
		generating: "Generating",
		continuing: "Continuing",
		retrying: "Retrying",
		idle: "Idle",
	};

	if (mapping[value]) {
		return mapping[value];
	}

	return value
		.split("_")
		.map((segment) =>
			segment.length > 0
				? `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`
				: segment,
		)
		.join(" ");
};

const noop = () => {};

export const GeneratedContributionCard: React.FC<
	GeneratedContributionCardProps
> = ({ modelId, className }) => {
	const {
		sessionId,
		stageSlug,
		iterationNumber,
		focusedStageDocumentMap,
		focusedDocument,
		setFocusedStageDocument,
		updateStageDocumentDraft,
		submitStageDocumentFeedback,
		stageDocumentContent,
		modelCatalog,
		isSubmittingStageDocumentFeedback,
		submitStageDocumentFeedbackError,
	} = useDialecticStore((state) => {
		const sessionId = state.activeContextSessionId;
		const stageSlug = state.activeStageSlug;
		const iterationNumber = state.activeSessionDetail?.iteration_count;
		const focusedDocument =
			sessionId && stageSlug
				? selectFocusedStageDocument(state, sessionId, stageSlug, modelId)
				: null;

		return {
			sessionId,
			stageSlug,
			iterationNumber,
			focusedStageDocumentMap: state.focusedStageDocument,
			focusedDocument,
			setFocusedStageDocument: state.setFocusedStageDocument,
			updateStageDocumentDraft: state.updateStageDocumentDraft,
			submitStageDocumentFeedback: state.submitStageDocumentFeedback,
			stageDocumentContent: state.stageDocumentContent,
			modelCatalog: state.modelCatalog,
			isSubmittingStageDocumentFeedback: state.isSubmittingStageDocumentFeedback,
			submitStageDocumentFeedbackError: state.submitStageDocumentFeedbackError,
		};
	});

	const hasStageContext =
		Boolean(sessionId && stageSlug && typeof iterationNumber === "number");

	const stageRunProgress = useDialecticStore((state) =>
		hasStageContext && sessionId && stageSlug && typeof iterationNumber === "number"
			? selectStageRunProgress(
					state,
					sessionId,
					stageSlug,
					iterationNumber,
			)
			: undefined,
	);

	const modelName = useMemo(() => {
		const entry = modelCatalog.find((model) => model.id === modelId);
		return entry?.model_name ?? modelId;
	}, [modelCatalog, modelId]);

	const compositeKey: StageDocumentCompositeKey | null = useMemo(() => {
		if (
			!hasStageContext ||
			!sessionId ||
			!stageSlug ||
			typeof iterationNumber !== "number" ||
			!focusedDocument
		) {
			return null;
		}

		return {
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			documentKey: focusedDocument.documentKey,
		};
	}, [hasStageContext, focusedDocument, iterationNumber, modelId, sessionId, stageSlug]);

	const serializedKey = useMemo(
		() => (compositeKey ? getStageDocumentKey(compositeKey) : null),
		[compositeKey],
	);

	const draftState = serializedKey
		? stageDocumentContent[serializedKey]
		: undefined;
	const draftValue = draftState?.currentDraftMarkdown ?? "";
	const baselineContent = draftState?.baselineMarkdown ?? "";
	const isDraftLoading = draftState?.isLoading ?? false;
	const draftError = draftState?.error;

	const documentDescriptor: StageRunDocumentDescriptor | undefined =
		focusedDocument && stageRunProgress
			? stageRunProgress.documents?.[focusedDocument.documentKey]
			: undefined;

	const handleDocumentSelect = useCallback(
		(payload: SetFocusedStageDocumentPayload) => {
			setFocusedStageDocument(payload);
		},
		[setFocusedStageDocument],
	);

	const handleDraftChange = useCallback(
		(value: string) => {
			if (!compositeKey) {
				return;
			}
			updateStageDocumentDraft(compositeKey, value);
		},
		[compositeKey, updateStageDocumentDraft],
	);

	const handleSaveFeedback = useCallback(async () => {
		if (!compositeKey || !serializedKey) {
			toast.error("Could not save feedback.");
			return;
		}

		const currentDraft =
			stageDocumentContent[serializedKey]?.currentDraftMarkdown;

		if (!currentDraft || currentDraft.trim().length === 0) {
			toast.error("Provide feedback before saving.");
			return;
		}

		try {
			await submitStageDocumentFeedback({
				...compositeKey,
				feedback: currentDraft,
			});
			toast.success("Feedback saved successfully.");
		} catch (_error) {
			toast.error("Could not save feedback.");
		}
	}, [
		compositeKey,
		serializedKey,
		stageDocumentContent,
		submitStageDocumentFeedback,
	]);

	const canSave =
		Boolean(compositeKey) &&
		Boolean(stageDocumentContent[serializedKey ?? ""]?.currentDraftMarkdown);

	if (!hasStageContext) {
		return (
			<Card className={cn("p-4", className)}>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Stage context is unavailable. Select a session and stage to view
						document feedback.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className={cn("flex flex-col", className)}>
			<CardHeader className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="space-y-1">
						<p className="text-sm font-medium text-muted-foreground">Model</p>
						<h3 className="text-lg font-semibold text-foreground">{modelName}</h3>
					</div>
					{documentDescriptor && (
						<Badge variant="secondary">
							{formatStatusLabel(documentDescriptor.status)}
						</Badge>
					)}
				</div>
			</CardHeader>

			<CardContent className="space-y-6">
				<StageRunChecklist
					modelId={modelId}
					focusedStageDocumentMap={focusedStageDocumentMap ?? {}}
					onDocumentSelect={handleDocumentSelect}
				/>

				{focusedDocument ? (
					<div className="space-y-4">
						<div className="space-y-1">
							<p className="text-sm font-medium text-muted-foreground">
								Document
							</p>
							<p className="font-mono text-sm text-foreground">
								Document: {focusedDocument.documentKey}
							</p>
							<div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
								{documentDescriptor?.job_id && (
									<span>
										Job:{" "}
										<span className="font-medium text-foreground">
											{documentDescriptor.job_id}
										</span>
									</span>
								)}
								{documentDescriptor?.latestRenderedResourceId && (
									<span>
										Latest Render:{" "}
										<span className="font-medium text-foreground">
											{documentDescriptor.latestRenderedResourceId}
										</span>
									</span>
								)}
							</div>
						</div>

						{draftError && (
							<Alert variant="destructive">
								<AlertDescription>{draftError.message}</AlertDescription>
							</Alert>
						)}

						<TextInputArea
							label="Document Content"
							value={baselineContent}
							onChange={noop}
							disabled
							placeholder="No content available."
							id={`stage-document-content-${modelId}-${focusedDocument.documentKey}`}
							dataTestId={`stage-document-content-${modelId}-${focusedDocument.documentKey}`}
							showPreviewToggle
							initialPreviewMode
						/>

						<TextInputArea
							label="Document Feedback"
							value={draftValue}
							onChange={handleDraftChange}
							placeholder={`Enter feedback for ${focusedDocument.documentKey}`}
							id={`stage-document-feedback-${modelId}-${focusedDocument.documentKey}`}
							dataTestId={`stage-document-feedback-${modelId}-${focusedDocument.documentKey}`}
							showPreviewToggle
						/>

						{submitStageDocumentFeedbackError && (
							<Alert variant="destructive">
								<AlertDescription>
									{submitStageDocumentFeedbackError.message}
								</AlertDescription>
							</Alert>
						)}

						<div className="flex items-center justify-end gap-3">
							{isDraftLoading && (
								<Loader2
									aria-hidden
									className="h-4 w-4 animate-spin text-muted-foreground"
								/>
							)}
							<Button
								onClick={handleSaveFeedback}
								disabled={
									!canSave ||
									isDraftLoading ||
									isSubmittingStageDocumentFeedback
								}
							>
								{isSubmittingStageDocumentFeedback ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : (
									"Save Feedback"
								)}
							</Button>
						</div>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						Select a document to view its content and provide feedback.
					</p>
				)}
			</CardContent>
		</Card>
	);
};
