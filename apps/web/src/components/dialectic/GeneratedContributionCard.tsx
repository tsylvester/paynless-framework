import React, { useCallback, useMemo, useEffect, useState } from "react";
import {
	useDialecticStore,
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
import { Loader2, ChevronDown, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isDocumentHighlighted } from "@paynless/utils";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
	const [isTechnicalDetailsOpen, setIsTechnicalDetailsOpen] = useState(false);

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

	// IMPORTANT: Read values directly from state to avoid stale closure issues when switching stages
	const stageRunProgress = useDialecticStore((state) => {
		const currentSessionId = state.activeContextSessionId;
		const currentStageSlug = state.activeStageSlug;
		const currentIterationNumber = state.activeSessionDetail?.iteration_count;

		if (!currentSessionId || !currentStageSlug || typeof currentIterationNumber !== "number") {
			return undefined;
		}
		return selectStageRunProgress(
			state,
			currentSessionId,
			currentStageSlug,
			currentIterationNumber,
		);
	});

	const modelName = useMemo(() => {
		const entry = modelCatalog.find((model) => model.id === modelId);
		return entry?.model_name ?? modelId;
	}, [modelCatalog, modelId]);

	const modelInitial = useMemo(() => {
		return modelName.charAt(0).toUpperCase();
	}, [modelName]);

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

	// IMPORTANT: Read values directly from state to avoid stale closure issues when switching stages
	const documentResourceState = useDialecticStore((state) => {
		const currentSessionId = state.activeContextSessionId;
		const currentStageSlug = state.activeStageSlug;
		const currentIterationNumber = state.activeSessionDetail?.iteration_count;

		if (
			!compositeKey ||
			!currentSessionId ||
			!currentStageSlug ||
			typeof currentIterationNumber !== "number"
		) {
			return undefined;
		}
		return selectStageDocumentResource(
			state,
			currentSessionId,
			currentStageSlug,
			currentIterationNumber,
			modelId,
			compositeKey.documentKey,
		);
	});

	const feedbackDraftValue = documentResourceState?.feedbackDraftMarkdown ?? "";
	const baselineContent = documentResourceState?.baselineMarkdown ?? "";
	const isDraftLoading = documentResourceState?.isLoading ?? false;
	const draftError = documentResourceState?.error;
	const lastBaselineVersion = documentResourceState?.lastBaselineVersion;

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

	// Use serialized key for stable comparison in effect
	const documentDescriptorResourceId = isRenderedDescriptor(documentDescriptor)
		? documentDescriptor.latestRenderedResourceId
		: null;

	useEffect(() => {
		// Only fetch if we have all required data and content isn't already loaded
		if (
			compositeKey &&
			documentDescriptorResourceId &&
			!documentResourceState?.isLoading &&
			!documentResourceState?.baselineMarkdown &&
			!documentResourceState?.error &&
			fetchStageDocumentContent
		) {
			fetchStageDocumentContent(
				compositeKey,
				documentDescriptorResourceId,
			);
		}
	}, [
		// Use serialized key for stable dependency comparison
		serializedKey,
		documentDescriptorResourceId,
		documentResourceState?.isLoading,
		documentResourceState?.baselineMarkdown,
		documentResourceState?.error,
		fetchStageDocumentContent,
		compositeKey,
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

		const feedbackDraft = documentResourceState?.feedbackDraftMarkdown ?? "";

		if (!feedbackDraft || feedbackDraft.trim().length === 0) {
			toast.error("Provide feedback before saving.");
			return;
		}

		try {
			await submitStageDocumentFeedback({
				...compositeKey,
				feedback: feedbackDraft,
			});
			toast.success("Feedback saved successfully.");
		} catch (_error) {
			toast.error("Could not save feedback.");
		}
	}, [
		compositeKey,
		serializedKey,
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

	// Determine if content or feedback has been modified
	const hasContentChanges = Boolean(documentResourceState?.currentDraftMarkdown);
	const hasFeedbackChanges = Boolean(documentResourceState?.feedbackDraftMarkdown);
	const hasUnsavedChanges = hasContentChanges || hasFeedbackChanges;

	const isSaving = isSavingContributionEdit || isSubmittingStageDocumentFeedback;

	const handleSaveChanges = useCallback(async () => {
		// Save both content edits and feedback if they exist
		const promises: Promise<void>[] = [];

		if (canSaveEdit) {
			promises.push(handleSaveEdit());
		}
		if (canSaveFeedback) {
			promises.push(handleSaveFeedback());
		}

		if (promises.length === 0) {
			toast.info("No changes to save.");
			return;
		}

		await Promise.all(promises);
	}, [canSaveEdit, canSaveFeedback, handleSaveEdit, handleSaveFeedback]);

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

	const showDocument = focusedDocument && isValidMarkdownDocument && sessionId && stageSlug && isDocumentHighlighted(sessionId, stageSlug, modelId, focusedDocument.documentKey, focusedStageDocumentMap);

	return (
		<Card className={cn("flex flex-col", className)}>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-4">
					{/* Document Info with Model Avatar */}
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
							{modelInitial}
						</div>
						<div>
							{focusedDocument ? (
								<h3 className="text-base font-medium text-foreground">
									{focusedDocument.documentKey}
								</h3>
							) : (
								<h3 className="text-base font-medium text-foreground">No document selected</h3>
							)}
							<p className="text-sm text-muted-foreground">
								{modelName}
							</p>
						</div>
					</div>

					{/* Status Badge and Save Button */}
					<div className="flex items-center gap-3">
						{documentDescriptor && isValidMarkdownDocument && (
							<Badge
								variant="secondary"
								className={cn(
									"font-normal",
									documentDescriptor.status === "completed" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
									documentDescriptor.status === "failed" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
									documentDescriptor.status === "generating" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
								)}
							>
								{formatStatusLabel(documentDescriptor.status)}
							</Badge>
						)}

						{hasUnsavedChanges && (
							<div className="flex items-center gap-2">
								<span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
								<Button
									onClick={handleSaveChanges}
									disabled={isSaving || isDraftLoading}
									size="sm"
								>
									{isSaving ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving...
										</>
									) : (
										"Save Changes"
									)}
								</Button>
							</div>
						)}
					</div>
				</div>
			</CardHeader>

			<CardContent className="flex-1 space-y-4">
				{showDocument ? (
					<>
						{/* Technical Details Collapsible */}
						{(documentDescriptor && ('job_id' in documentDescriptor || 'latestRenderedResourceId' in documentDescriptor)) && (
							<Collapsible open={isTechnicalDetailsOpen} onOpenChange={setIsTechnicalDetailsOpen}>
								<CollapsibleTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
									>
										<Info className="h-3 w-3" />
										Technical details
										<ChevronDown className={cn(
											"h-3 w-3 transition-transform duration-200",
											isTechnicalDetailsOpen && "rotate-180"
										)} />
									</Button>
								</CollapsibleTrigger>
								<CollapsibleContent className="mt-2">
									<div className="flex flex-wrap gap-4 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
										{'job_id' in documentDescriptor && documentDescriptor.job_id && (
											<span>
												Job ID:{" "}
												<code className="font-mono text-foreground bg-muted px-1 rounded">
													{documentDescriptor.job_id}
												</code>
											</span>
										)}
										{'latestRenderedResourceId' in documentDescriptor && documentDescriptor.latestRenderedResourceId && (
											<span>
												Resource ID:{" "}
												<code className="font-mono text-foreground bg-muted px-1 rounded">
													{documentDescriptor.latestRenderedResourceId}
												</code>
											</span>
										)}
										{lastBaselineVersion?.updatedAt && (
											<span>
												Last updated:{" "}
												<span className="font-medium text-foreground">
													{new Date(lastBaselineVersion.updatedAt).toLocaleDateString()}
												</span>
											</span>
										)}
									</div>
								</CollapsibleContent>
							</Collapsible>
						)}

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

						{/* Resizable Side-by-Side Layout (lg+ screens) */}
						<div className="hidden lg:block">
							<ResizablePanelGroup direction="horizontal" className="min-h-[400px] rounded-lg border">
								<ResizablePanel defaultSize={60} minSize={30}>
									<div className="h-full p-4">
										<TextInputArea
											label="Document Content"
											value={documentResourceState?.currentDraftMarkdown || baselineContent}
											onChange={handleDocumentContentChange}
											disabled={isDraftLoading || isSavingContributionEdit}
											placeholder="No content available."
											id={`stage-document-content-${modelId}-${focusedDocument.documentKey}`}
											dataTestId={`stage-document-content-${modelId}-${focusedDocument.documentKey}`}
											showPreviewToggle
											initialPreviewMode
										/>
									</div>
								</ResizablePanel>
								<ResizableHandle withHandle />
								<ResizablePanel defaultSize={40} minSize={25}>
									<div className="h-full p-4 bg-muted/20">
										<TextInputArea
											label="Feedback"
											value={feedbackDraftValue}
											onChange={handleFeedbackDraftChange}
											placeholder={`Enter feedback for this document...`}
											id={`stage-document-feedback-${modelId}-${focusedDocument.documentKey}`}
											dataTestId={`stage-document-feedback-${modelId}-${focusedDocument.documentKey}`}
											showPreviewToggle
										/>
									</div>
								</ResizablePanel>
							</ResizablePanelGroup>
						</div>

						{/* Stacked Layout (mobile/tablet) */}
						<div className="lg:hidden space-y-4">
							<TextInputArea
								label="Document Content"
								value={documentResourceState?.currentDraftMarkdown || baselineContent}
								onChange={handleDocumentContentChange}
								disabled={isDraftLoading || isSavingContributionEdit}
								placeholder="No content available."
								id={`stage-document-content-mobile-${modelId}-${focusedDocument.documentKey}`}
								dataTestId={`stage-document-content-mobile-${modelId}-${focusedDocument.documentKey}`}
								showPreviewToggle
								initialPreviewMode
							/>

							<TextInputArea
								label="Feedback"
								value={feedbackDraftValue}
								onChange={handleFeedbackDraftChange}
								placeholder={`Enter feedback for this document...`}
								id={`stage-document-feedback-mobile-${modelId}-${focusedDocument.documentKey}`}
								dataTestId={`stage-document-feedback-mobile-${modelId}-${focusedDocument.documentKey}`}
								showPreviewToggle
							/>
						</div>

						{/* Error Alerts */}
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
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						Select a document to view its content and provide feedback.
					</p>
				)}
			</CardContent>
		</Card>
	);
};
