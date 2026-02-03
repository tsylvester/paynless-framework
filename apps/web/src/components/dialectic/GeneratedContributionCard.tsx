import React, { useCallback, useMemo, useEffect } from "react";
import {
	useDialecticStore,
	useAuthStore,
	selectStageRunProgress,
	selectFocusedStageDocument,
	selectStageDocumentResource,
	selectValidMarkdownDocumentKeys,
} from "@paynless/store";
import {
	StageDocumentCompositeKey,
	StageRunDocumentDescriptor,
	SaveContributionEditPayload,
} from "@paynless/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextInputArea } from "@/components/common/TextInputArea";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isDocumentHighlighted } from "@paynless/utils";

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

export const GeneratedContributionCard: React.FC<
	GeneratedContributionCardProps
> = ({ modelId, className }) => {
	const user = useAuthStore((state) => state.user);
	const {
		sessionId,
		stageSlug,
		iterationNumber,
		focusedStageDocumentMap,
		focusedDocument,
		updateStageDocumentDraft,
		updateStageDocumentFeedbackDraft,
		submitStageDocumentFeedback,
		saveContributionEdit,
		activeSessionDetail,
		modelCatalog,
		isSubmittingStageDocumentFeedback,
		submitStageDocumentFeedbackError,
		isSavingContributionEdit,
		saveContributionEditError,
		activeContextProjectId,
		fetchStageDocumentContent,
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
			updateStageDocumentDraft: state.updateStageDocumentDraft,
			updateStageDocumentFeedbackDraft: state.updateStageDocumentFeedbackDraft,
			submitStageDocumentFeedback: state.submitStageDocumentFeedback,
			saveContributionEdit: state.saveContributionEdit,
			activeSessionDetail: state.activeSessionDetail,
			modelCatalog: state.modelCatalog,
			isSubmittingStageDocumentFeedback: state.isSubmittingStageDocumentFeedback,
			submitStageDocumentFeedbackError: state.submitStageDocumentFeedbackError,
			isSavingContributionEdit: state.isSavingContributionEdit,
			saveContributionEditError: state.saveContributionEditError,
			activeContextProjectId: state.activeContextProjectId,
			fetchStageDocumentContent: state.fetchStageDocumentContent,
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

	const modelName = useMemo((): string => {
		if (
			activeSessionDetail !== null &&
			activeSessionDetail !== undefined &&
			activeSessionDetail.selected_models !== null &&
			activeSessionDetail.selected_models !== undefined
		) {
			const assigned = activeSessionDetail.selected_models.find(
				(m) => m.id === modelId,
			);
			if (assigned !== undefined) {
				return assigned.displayName;
			}
		}
		const catalogEntry = modelCatalog.find((model) => model.id === modelId);
		if (catalogEntry !== undefined) {
			return catalogEntry.model_name;
		}
		return modelId;
	}, [activeSessionDetail, modelCatalog, modelId]);

	const validMarkdownDocumentKeys = useDialecticStore((state) => {
		if (!stageSlug) {
			return new Set<string>();
		}
		return selectValidMarkdownDocumentKeys(state, stageSlug);
	});

	const isValidMarkdownDocument = useMemo(() => {
		if (!focusedDocument?.documentKey) {
			return false;
		}
		return validMarkdownDocumentKeys.has(focusedDocument.documentKey);
	}, [focusedDocument?.documentKey, validMarkdownDocumentKeys]);

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

	const documentResourceState = useDialecticStore((state) => {
		if (
			!compositeKey ||
			!sessionId ||
			!stageSlug ||
			typeof iterationNumber !== "number"
		) {
			return undefined;
		}
		return selectStageDocumentResource(
			state,
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			compositeKey.documentKey,
		);
	});

	const feedbackDraftValue = documentResourceState?.feedbackDraftMarkdown ?? "";
	const baselineContent = documentResourceState?.baselineMarkdown ?? "";
	const isDraftLoading = documentResourceState?.isLoading ?? false;
	const draftError = documentResourceState?.error;

	const documentDescriptor: StageRunDocumentDescriptor | undefined =
		focusedDocument && stageRunProgress
			? stageRunProgress.documents?.[focusedDocument.documentKey]
			: undefined;

	const isRenderedDescriptor = (
		descriptor: StageRunDocumentDescriptor | undefined,
	): descriptor is Extract<StageRunDocumentDescriptor, { latestRenderedResourceId: string }> => {
		return Boolean(
			descriptor &&
			'latestRenderedResourceId' in descriptor &&
			typeof descriptor.latestRenderedResourceId === 'string' &&
			descriptor.latestRenderedResourceId.length > 0
		);
	};

	useEffect(() => {
		if (
			compositeKey &&
			isRenderedDescriptor(documentDescriptor) &&
			!documentResourceState?.isLoading &&
			!documentResourceState?.baselineMarkdown &&
			!documentResourceState?.error &&
			fetchStageDocumentContent
		) {
			fetchStageDocumentContent(
				compositeKey,
				documentDescriptor.latestRenderedResourceId,
			);
		}
	}, [
		compositeKey,
		focusedDocument,
		documentDescriptor,
		documentResourceState?.isLoading,
		documentResourceState?.baselineMarkdown,
		documentResourceState?.error,
		fetchStageDocumentContent,
	]);

	const handleFeedbackDraftChange = useCallback(
		(value: string) => {
			if (!compositeKey) {
				return;
			}
			updateStageDocumentFeedbackDraft(compositeKey, value);
		},
		[compositeKey, updateStageDocumentFeedbackDraft],
	);

	const handleSaveFeedback = useCallback(async () => {
		if (!compositeKey || !serializedKey) {
			toast.error("Could not save feedback.");
			return;
		}
		if (!user || !user.id || !activeContextProjectId) {
			toast.error("Could not save feedback.");
			return;
		}

		const feedbackDraft = documentResourceState?.feedbackDraftMarkdown ?? "";

		if (!feedbackDraft || feedbackDraft.trim().length === 0) {
			toast.error("Provide feedback before saving.");
			return;
		}

		try {
			await submitStageDocumentFeedback({
				...compositeKey,
				feedbackContent: feedbackDraft,
				userId: user.id,
				projectId: activeContextProjectId,
				feedbackType: "user_feedback",
			});
			toast.success("Feedback saved successfully.");
		} catch (_error) {
			toast.error("Could not save feedback.");
		}
	}, [
		compositeKey,
		serializedKey,
		user,
		activeContextProjectId,
		documentResourceState,
		submitStageDocumentFeedback,
	]);

	const handleSaveEdit = useCallback(async () => {
		if (!compositeKey || !activeContextProjectId) {
			toast.error("Could not save edit.");
			return;
		}

		const editedContent = documentResourceState?.currentDraftMarkdown ?? "";
		if (!editedContent || editedContent.trim().length === 0) {
			toast.error("Provide content before saving.");
			return;
		}

		// Derive original contribution ID from resource state
		// The sourceContributionId field contains the contribution ID from dialectic_project_resources.source_contribution_id
		// This is the actual contribution ID (not a resource ID) needed for editing
		const originalContributionIdToEdit = documentResourceState?.sourceContributionId;

		if (!originalContributionIdToEdit) {
			toast.error("Could not find original contribution to edit.");
			return;
		}

		const payload: SaveContributionEditPayload = {
			originalContributionIdToEdit,
			editedContentText: editedContent,
			projectId: activeContextProjectId,
			sessionId: compositeKey.sessionId,
			originalModelContributionId: originalContributionIdToEdit,
			responseText: editedContent,
			documentKey: compositeKey.documentKey,
			resourceType: "rendered_document",
		};

		try {
			await saveContributionEdit(payload);
			toast.success("Edit saved successfully.");
		} catch (_error) {
			toast.error("Could not save edit.");
		}
	}, [
		compositeKey,
		activeContextProjectId,
		documentResourceState,
		saveContributionEdit,
	]);

	const handleDocumentContentChange = useCallback(
		(value: string) => {
			if (!compositeKey) {
				return;
			}
			updateStageDocumentDraft(compositeKey, value);
		},
		[compositeKey, updateStageDocumentDraft],
	);

	const canSaveFeedback =
		Boolean(compositeKey) &&
		Boolean(documentResourceState?.feedbackDraftMarkdown);

	const canSaveEdit =
		Boolean(compositeKey) &&
		Boolean(documentResourceState?.currentDraftMarkdown) &&
		Boolean(documentResourceState?.sourceContributionId);

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

	const headerParts: string[] = [modelName];
	if (
		focusedDocument !== null &&
		focusedDocument !== undefined &&
		isValidMarkdownDocument
	) {
		headerParts.push(focusedDocument.documentKey);
	}
	if (
		documentResourceState !== undefined &&
		documentResourceState !== null &&
		documentResourceState.lastBaselineVersion !== undefined &&
		documentResourceState.lastBaselineVersion !== null &&
		documentResourceState.lastBaselineVersion.updatedAt !== undefined &&
		documentResourceState.lastBaselineVersion.updatedAt !== null
	) {
		headerParts.push(
			new Date(documentResourceState.lastBaselineVersion.updatedAt)
				.toISOString()
				.split("T")[0],
		);
	}
	const headerLine: string = headerParts.join(" • ");

	return (
		<Card className={cn("flex flex-col", className)}>
			<CardHeader className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 className="text-lg font-semibold text-foreground">{headerLine}</h3>
					{documentDescriptor && isValidMarkdownDocument && (
						<Badge variant="secondary">
							{formatStatusLabel(documentDescriptor.status)}
						</Badge>
					)}
				</div>
			</CardHeader>

			<CardContent className="space-y-6">
				{focusedDocument && isValidMarkdownDocument && sessionId && stageSlug && isDocumentHighlighted(sessionId, stageSlug, modelId, focusedDocument.documentKey, focusedStageDocumentMap) ? (
					<div className="space-y-4">

						{draftError && (
							<Alert variant="destructive">
								<AlertDescription>{draftError.message}</AlertDescription>
							</Alert>
						)}

						{documentDescriptor &&
							!isRenderedDescriptor(documentDescriptor) &&
							!isDraftLoading && (
								<Alert variant="default">
									<AlertDescription>
										RENDER job has not completed yet. Document content will be
										available once rendering is finished.
									</AlertDescription>
								</Alert>
							)}

					<TextInputArea
						value={documentResourceState?.currentDraftMarkdown || baselineContent}
						onChange={handleDocumentContentChange}
						disabled={isDraftLoading || isSavingContributionEdit}
						placeholder="No content available."
						id={`stage-document-content-${modelId}-${focusedDocument.documentKey}`}
						dataTestId={`stage-document-content-${modelId}-${focusedDocument.documentKey}`}
						showPreviewToggle
						initialPreviewMode
					/>

						<TextInputArea
							label="Document Feedback"
							value={feedbackDraftValue}
							onChange={handleFeedbackDraftChange}
							placeholder={`Enter feedback for ${focusedDocument.documentKey}`}
							id={`stage-document-feedback-${modelId}-${focusedDocument.documentKey}`}
							dataTestId={`stage-document-feedback-${modelId}-${focusedDocument.documentKey}`}
							showPreviewToggle
						/>

						{saveContributionEditError && (
							<Alert variant="destructive">
								<AlertDescription>
									{saveContributionEditError.message}
								</AlertDescription>
							</Alert>
						)}

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
								onClick={handleSaveEdit}
								disabled={
									!canSaveEdit ||
									isDraftLoading ||
									isSavingContributionEdit
								}
							>
								{isSavingContributionEdit ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : (
									"Save Edit"
								)}
							</Button>
							<Button
								onClick={handleSaveFeedback}
								disabled={
									!canSaveFeedback ||
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
