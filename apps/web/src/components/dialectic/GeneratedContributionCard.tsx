import React, { useCallback, useMemo, useEffect, useState } from "react";
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
	StageDocumentVersionInfo,
	SaveContributionEditPayload,
	STAGE_RUN_DOCUMENT_KEY_SEPARATOR,
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
	const user = useAuthStore((state) => state.user);
	const [isTechnicalDetailsOpen, setIsTechnicalDetailsOpen] = useState(false);
	const [isEditorsOpen, setIsEditorsOpen] = useState(true);
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
		isSubmittingStageDocumentFeedback,
		submitStageDocumentFeedbackError,
		isSavingContributionEdit,
		saveContributionEditError,
		activeContextProjectId,
		fetchStageDocumentContent,
		initializeFeedbackDraft,
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
			isSubmittingStageDocumentFeedback: state.isSubmittingStageDocumentFeedback,
			submitStageDocumentFeedbackError: state.submitStageDocumentFeedbackError,
			isSavingContributionEdit: state.isSavingContributionEdit,
			saveContributionEditError: state.saveContributionEditError,
			activeContextProjectId: state.activeContextProjectId,
			fetchStageDocumentContent: state.fetchStageDocumentContent,
			initializeFeedbackDraft: state.initializeFeedbackDraft,
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

	const modelName = useMemo((): string => {
		if (!hasStageContext) {
			return "";
		}
		if (!activeSessionDetail) {
			throw new Error(
				`GeneratedContributionCard invariant violation: activeSessionDetail missing for modelId "${modelId}"`,
			);
		}
		const contributions = activeSessionDetail.dialectic_contributions ?? [];
		const nameByModelId = new Map<string, string>();
		contributions.forEach((contribution) => {
			const contributionModelId = contribution.model_id;
			const contributionModelName = contribution.model_name;
			if (
				typeof contributionModelId !== "string" ||
				contributionModelId.trim().length === 0 ||
				typeof contributionModelName !== "string" ||
				contributionModelName.trim().length === 0
			) {
				return;
			}
			const existing = nameByModelId.get(contributionModelId);
			if (existing && existing !== contributionModelName) {
				throw new Error(
					`GeneratedContributionCard invariant violation: conflicting model_name values for modelId "${contributionModelId}" ("${existing}" vs "${contributionModelName}")`,
				);
			}
			nameByModelId.set(contributionModelId, contributionModelName);
		});
		const name = nameByModelId.get(modelId);
		if (!name) {
			throw new Error(
				`GeneratedContributionCard invariant violation: missing dialectic_contributions model_name for modelId "${modelId}"`,
			);
		}
		return name;
	}, [activeSessionDetail, hasStageContext, modelId]);

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

	const isInitializingFeedbackDraft = useDialecticStore(
		(state) => state.isInitializingFeedbackDraft,
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
	const lastBaselineVersion: StageDocumentVersionInfo | null =
		documentResourceState ? documentResourceState.lastBaselineVersion : null;

		const documentDescriptorKey = focusedDocument
		? `${focusedDocument.documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`
		: null;
	
	const documentDescriptor: StageRunDocumentDescriptor | undefined =
		focusedDocument && stageRunProgress && documentDescriptorKey
			? stageRunProgress.documents?.[documentDescriptorKey]
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

	useEffect(() => {
		// Initialize feedback draft when the editor opens for a document
		// that has no feedback draft state yet. A draft is considered uninitialized
		// if its value is `undefined`. An empty string `''` is an initialized, empty draft.
		const feedbackDraftExists = documentResourceState?.feedbackDraftMarkdown !== undefined;
		if (isEditorsOpen && compositeKey && !feedbackDraftExists) {
			initializeFeedbackDraft(compositeKey);
		}
	}, [isEditorsOpen, compositeKey, documentResourceState?.feedbackDraftMarkdown, initializeFeedbackDraft]);

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

		const resourceType = documentResourceState?.resourceType;
		if (resourceType === null || resourceType === undefined) {
			toast.error("Could not determine resource type for edit.");
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
			resourceType,
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
	const hasContentChanges = Boolean(documentResourceState?.isDirty);
	const hasFeedbackChanges = Boolean(documentResourceState?.feedbackIsDirty);

	const selectedDocumentKey = focusedDocument ? focusedDocument.documentKey : null;
	const showDocument =
		Boolean(hasStageContext) &&
		Boolean(isValidMarkdownDocument) &&
		Boolean(sessionId) &&
		Boolean(stageSlug) &&
		Boolean(selectedDocumentKey) &&
		Boolean(
			sessionId &&
				stageSlug &&
				selectedDocumentKey &&
				isDocumentHighlighted(
					sessionId,
					stageSlug,
					modelId,
					selectedDocumentKey,
					focusedStageDocumentMap,
				),
		);
	const documentCreatedAtIso = useMemo((): string | null => {
		if (!showDocument) {
			return null;
		}
		if (!selectedDocumentKey) {
			throw new Error(
				`GeneratedContributionCard invariant violation: selectedDocumentKey missing while showDocument is true (modelId "${modelId}")`,
			);
		}
		if (!activeSessionDetail) {
			throw new Error(
				`GeneratedContributionCard invariant violation: activeSessionDetail missing while document is selected (modelId "${modelId}")`,
			);
		}
		const sourceContributionId = documentResourceState?.sourceContributionId;
		if (
			typeof sourceContributionId !== "string" ||
			sourceContributionId.trim().length === 0
		) {
			if (isDraftLoading) {
				return null;
			}
			throw new Error(
				`GeneratedContributionCard invariant violation: missing sourceContributionId for selected document (modelId "${modelId}", documentKey "${selectedDocumentKey}")`,
			);
		}
		const contributions = activeSessionDetail.dialectic_contributions ?? [];
		const sourceContribution = contributions.find(
			(contribution) => contribution.id === sourceContributionId,
		);
		if (!sourceContribution) {
			if (isDraftLoading) {
				return null;
			}
			throw new Error(
				`GeneratedContributionCard invariant violation: source contribution "${sourceContributionId}" not found in activeSessionDetail.dialectic_contributions (modelId "${modelId}", documentKey "${selectedDocumentKey}")`,
			);
		}
		return sourceContribution.created_at;
	}, [
		activeSessionDetail,
		documentResourceState?.sourceContributionId,
		isDraftLoading,
		modelId,
		selectedDocumentKey,
		showDocument,
	]);
	const documentLastUpdatedAtIso = useMemo((): string | null => {
		if (!showDocument) {
			return null;
		}
		if (lastBaselineVersion?.updatedAt) {
			return lastBaselineVersion.updatedAt;
		}
		return null;
	}, [lastBaselineVersion?.updatedAt, showDocument]);

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
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-4">
					{/* Document Info with Model Avatar */}
					<div className="flex items-center gap-3">
						<Button
							variant="ghost"
							size="sm"
							type="button"
							className={cn(
								"w-10 h-10 rounded-full p-0 flex items-center justify-center",
								"bg-primary/10 text-primary hover:bg-primary/15",
								!focusedDocument && "opacity-60",
							)}
							aria-expanded={focusedDocument ? isEditorsOpen : undefined}
							aria-label={isEditorsOpen ? "Collapse editors" : "Expand editors"}
							disabled={!focusedDocument}
							onClick={() => setIsEditorsOpen((prev) => !prev)}
						>
							<ChevronDown
								className={cn(
									"h-4 w-4 transition-transform duration-200",
									isEditorsOpen ? "rotate-180" : "rotate-0",
								)}
							/>
						</Button>
						<div className="min-w-0">
							<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
								<span className="truncate text-base font-medium text-foreground">
									{focusedDocument ? focusedDocument.documentKey : "No document selected"}
								</span>
								{focusedDocument ? (
									<span className="truncate text-sm text-muted-foreground">
										{modelName}
									</span>
								) : null}
								{focusedDocument && documentCreatedAtIso ? (
									<span className="truncate text-xs text-muted-foreground">
										Created {new Date(documentCreatedAtIso).toLocaleDateString()}
									</span>
								) : null}
								{focusedDocument && documentLastUpdatedAtIso ? (
									<span className="truncate text-xs text-muted-foreground">
										Updated {new Date(documentLastUpdatedAtIso).toLocaleDateString()}
									</span>
								) : null}
							</div>
						</div>
					</div>

					{/* Status Badge */}
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
					</div>
				</div>
			</CardHeader>

			<CardContent className="flex-1 space-y-4">
				{showDocument && selectedDocumentKey ? (
					<>
						{/* Technical Details Collapsible */}
						{isRenderedDescriptor(documentDescriptor) && (
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
										<span>
											Job ID:{" "}
											<code className="font-mono text-foreground bg-muted px-1 rounded">
												{documentDescriptor.job_id}
											</code>
										</span>
										<span>
											Resource ID:{" "}
											<code className="font-mono text-foreground bg-muted px-1 rounded">
												{documentDescriptor.latestRenderedResourceId}
											</code>
										</span>
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

						{isEditorsOpen ? (
							<>
								{/* Resizable Side-by-Side Layout (lg+ screens) */}
								<div className="hidden lg:block">
									<ResizablePanelGroup direction="horizontal" className="min-h-[400px] rounded-lg border">
										<ResizablePanel defaultSize={60} minSize={30}>
											<div className="h-full p-4 space-y-2">
												<TextInputArea
													label="Document Content"
													value={documentResourceState?.currentDraftMarkdown ?? baselineContent}
													onChange={handleDocumentContentChange}
													disabled={isDraftLoading || isSavingContributionEdit}
													placeholder="No content available."
													id={`stage-document-content-${modelId}-${selectedDocumentKey}`}
													dataTestId={`stage-document-content-${modelId}-${selectedDocumentKey}`}
													showPreviewToggle
													initialPreviewMode
												/>
												<div className="flex flex-col gap-1">
													{hasContentChanges && (
														<span className="text-xs text-amber-600 dark:text-amber-400">Unsaved edits</span>
													)}
													{saveContributionEditError && (
														<span className="text-xs text-destructive">{saveContributionEditError.message}</span>
													)}
													<Button
														onClick={handleSaveEdit}
														disabled={!canSaveEdit || isSavingContributionEdit || isDraftLoading}
														size="sm"
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
												</div>
											</div>
										</ResizablePanel>
										<ResizableHandle withHandle />
										<ResizablePanel defaultSize={40} minSize={25}>
											<div className="h-full p-4 bg-muted/20 space-y-2">
													<div className="relative">
														<TextInputArea
															label="Feedback"
															value={feedbackDraftValue}
															onChange={handleFeedbackDraftChange}
															placeholder={`Enter feedback for this document...`}
															id={`stage-document-feedback-${modelId}-${selectedDocumentKey}`}
															dataTestId={`stage-document-feedback-${modelId}-${selectedDocumentKey}`}
															showPreviewToggle
														/>
														{isInitializingFeedbackDraft && (
															<div data-testid="feedback-loader" className="absolute inset-0 flex items-center justify-center bg-background/50">
																<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
															</div>
														)}
													</div>
												<div className="flex flex-col gap-1">
													{hasFeedbackChanges && (
														<span className="text-xs text-amber-600 dark:text-amber-400">Feedback is stored locally until saved</span>
													)}
													{submitStageDocumentFeedbackError && (
														<span className="text-xs text-destructive">{submitStageDocumentFeedbackError.message}</span>
													)}
													<Button
														onClick={handleSaveFeedback}
														disabled={!canSaveFeedback || isSubmittingStageDocumentFeedback}
														size="sm"
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
										</ResizablePanel>
									</ResizablePanelGroup>
								</div>

								{/* Stacked Layout (mobile/tablet) */}
								<div className="lg:hidden space-y-4">
									<div className="space-y-2">
										<TextInputArea
											label="Document Content"
											value={documentResourceState?.currentDraftMarkdown ?? baselineContent}
											onChange={handleDocumentContentChange}
											disabled={isDraftLoading || isSavingContributionEdit}
											placeholder="No content available."
											id={`stage-document-content-mobile-${modelId}-${selectedDocumentKey}`}
											dataTestId={`stage-document-content-mobile-${modelId}-${selectedDocumentKey}`}
											showPreviewToggle
											initialPreviewMode
										/>
										<div className="flex flex-col gap-1">
											{hasContentChanges && (
												<span className="text-xs text-amber-600 dark:text-amber-400">Unsaved edits</span>
											)}
											{saveContributionEditError && (
												<span className="text-xs text-destructive">{saveContributionEditError.message}</span>
											)}
											<Button
												onClick={handleSaveEdit}
												disabled={!canSaveEdit || isSavingContributionEdit || isDraftLoading}
												size="sm"
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
										</div>
									</div>

									<div className="space-y-2">
										<TextInputArea
											label="Feedback"
											value={feedbackDraftValue}
											onChange={handleFeedbackDraftChange}
											placeholder={`Enter feedback for this document...`}
											id={`stage-document-feedback-mobile-${modelId}-${selectedDocumentKey}`}
											dataTestId={`stage-document-feedback-mobile-${modelId}-${selectedDocumentKey}`}
											showPreviewToggle
										/>
										<div className="flex flex-col gap-1">
											{hasFeedbackChanges && (
												<span className="text-xs text-amber-600 dark:text-amber-400">Feedback is stored locally until saved</span>
											)}
											{submitStageDocumentFeedbackError && (
												<span className="text-xs text-destructive">{submitStageDocumentFeedbackError.message}</span>
											)}
											<Button
												onClick={handleSaveFeedback}
												disabled={!canSaveFeedback || isSubmittingStageDocumentFeedback}
												size="sm"
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
								</div>
							</>
						) : (
							<p className="text-xs text-muted-foreground">
							</p>
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
