import React, { useState, useMemo, useEffect, useRef } from "react";
import {
	useDialecticStore,
	selectIsLoadingProjectDetail,
	selectProjectDetailError,
	selectFeedbackForStageIteration,
	selectCurrentProjectDetail,
	selectActiveStageSlug,
	selectSortedStages,
	selectStageProgressSummary,
	selectStageRunProgress,
	selectStageDocumentChecklist,
	selectSelectedModels,
} from "@paynless/store";
import {
	DialecticFeedback,
	StageDocumentChecklistEntry,
} from "@paynless/types";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';
import { Badge } from "@/components/ui/badge";
import { GeneratedContributionCard } from "./GeneratedContributionCard";
import { SubmitResponsesButton } from "./SubmitResponsesButton";

// UI-only mapping of stage names
const stageNameMap: Record<string, string> = {
	thesis: "Proposal",
	antithesis: "Review",
	synthesis: "Refinement",
	parenthesis: "Planning",
	paralysis: "Implementation",
};

const getDisplayName = (stage: {
	slug: string;
	display_name: string;
}): string => {
	return stageNameMap[stage.slug] || stage.display_name;
};

const DocumentWorkspaceSkeleton: React.FC = () => (
	<div className="bg-card rounded-2xl shadow-sm border border-border/50 p-8 animate-pulse">
		<div className="space-y-6">
			<div className="space-y-3">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8 rounded-full" role="status" />
					<Skeleton className="h-5 w-1/3" role="status" />
				</div>
				<Skeleton className="h-4 w-1/4" role="status" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-4 w-full" role="status" />
				<Skeleton className="h-4 w-full" role="status" />
				<Skeleton className="h-4 w-3/4" role="status" />
				<Skeleton className="h-4 w-2/3" role="status" />
			</div>
			<div className="flex justify-between items-center">
				<Skeleton className="h-6 w-20" role="status" />
				<Skeleton className="h-9 w-24 rounded-lg" role="status" />
			</div>
		</div>
	</div>
);

export const SessionContributionsDisplayCard: React.FC = () => {
	// --- Store Data using Reactive Hooks ---
	const project = useDialecticStore(selectCurrentProjectDetail);
	const session = useDialecticStore((state) => state.activeSessionDetail);
	const activeStageSlug = useDialecticStore(selectActiveStageSlug);
	const processTemplate = useDialecticStore(
		(state) => state.currentProcessTemplate,
	);
	const sortedStages = useDialecticStore(selectSortedStages);
	const focusedStageDocument = useDialecticStore((state) => state.focusedStageDocument);
	const setFocusedStageDocument = useDialecticStore((state) => state.setFocusedStageDocument);

	const activeStage = useMemo(() => {
		return processTemplate?.stages?.find((s) => s.slug === activeStageSlug) || null;
	}, [processTemplate, activeStageSlug]);

	useStageRunProgressHydration();

	// New store states for loading and error handling
	const isLoadingCurrentProjectDetail = useDialecticStore(
		selectIsLoadingProjectDetail,
	);
	const projectDetailError = useDialecticStore(selectProjectDetailError);
	const generationError = useDialecticStore(
		(state) => state.generateContributionsError,
	);

	// Store items for feedback content
	const fetchFeedbackFileContent = useDialecticStore(
		(state) => state.fetchFeedbackFileContent,
	);
	const currentFeedbackFileContent = useDialecticStore(
		(state) => state.currentFeedbackFileContent,
	);
	const isFetchingFeedbackFileContent = useDialecticStore(
		(state) => state.isFetchingFeedbackFileContent,
	);
	const fetchFeedbackFileContentError = useDialecticStore(
		(state) => state.fetchFeedbackFileContentError,
	);
	const clearCurrentFeedbackFileContent = useDialecticStore(
		(state) => state.clearCurrentFeedbackFileContent,
	);
	const resetFetchFeedbackFileContentError = useDialecticStore(
		(state) => state.resetFetchFeedbackFileContentError,
	);

	// IMPORTANT: Read values directly from state to avoid stale closure issues when switching stages
	const documentsByModel = useDialecticStore((state) => {
		const currentSession = state.activeSessionDetail;
		const currentStageSlug = state.activeStageSlug;
		const currentProcessTemplate = state.currentProcessTemplate;
		const currentActiveStage =
			currentProcessTemplate?.stages?.find((s) => s.slug === currentStageSlug) ||
			null;

		if (!currentSession || !currentActiveStage || typeof currentSession.iteration_count !== 'number') {
			return new Map<string, StageDocumentChecklistEntry[]>();
		}

		const progressKey = `${currentSession.id}:${currentActiveStage.slug}:${currentSession.iteration_count}`;
		const progress = selectStageRunProgress(
			state,
			currentSession.id,
			currentActiveStage.slug,
			currentSession.iteration_count,
		);

		const selectedModels = selectSelectedModels(state);
		const selectedModelIds: string[] = selectedModels.map((model) => model.id);
		const sessionModelIds: string[] = (currentSession.selected_models || []).map(
			(model) => model.id,
		);
		let resolvedModelIds: string[] =
			selectedModelIds.length > 0
				? selectedModelIds
				: sessionModelIds;

		if (resolvedModelIds.length === 0 && progress?.documents) {
			const modelIdsFromProgress: string[] = Object.values(progress.documents)
				.map((entry) => entry?.modelId)
				.filter(
					(modelId): modelId is string =>
						typeof modelId === "string" && modelId.length > 0,
				);
			resolvedModelIds = modelIdsFromProgress;
		}

		const uniqueModels: string[] = Array.from(new Set(resolvedModelIds));
		const map: Map<string, StageDocumentChecklistEntry[]> = new Map();

		if (uniqueModels.length === 0 && progress?.documents) {
			const fallbackModels: string[] = Array.from(
				new Set(
					Object.values(progress.documents)
						.map((entry) => entry?.modelId)
						.filter(
							(modelId): modelId is string =>
								typeof modelId === "string" && modelId.length > 0,
						),
				),
			);

			fallbackModels.forEach((modelId) => {
				map.set(modelId, selectStageDocumentChecklist(state, progressKey, modelId));
			});
			return map;
		}

		uniqueModels.forEach((modelId) => {
			map.set(modelId, selectStageDocumentChecklist(state, progressKey, modelId));
		});

		return map;
	});

	// IMPORTANT: Read values directly from state to avoid stale closure issues when switching stages
	const stageProgressSummary = useDialecticStore((state) => {
		const currentSession = state.activeSessionDetail;
		const currentStageSlug = state.activeStageSlug;
		const currentProcessTemplate = state.currentProcessTemplate;
		const currentActiveStage = currentProcessTemplate?.stages?.find((s) => s.slug === currentStageSlug) || null;

		if (!currentSession || !currentActiveStage || typeof currentSession.iteration_count !== 'number') {
			return undefined;
		}

		return selectStageProgressSummary(
			state,
			currentSession.id,
			currentActiveStage.slug,
			currentSession.iteration_count,
		);
	});

	const isLastStage = useMemo(() => {
		// Handle edge cases: empty sortedStages or null activeStage
		if (!sortedStages || sortedStages.length === 0) {
			return false;
		}
		if (!activeStage) {
			return false;
		}
		// Check if activeStage.slug matches the last stage in sortedStages
		const lastStage = sortedStages[sortedStages.length - 1];
		return activeStage.slug === lastStage?.slug;
	}, [sortedStages, activeStage]);

	const documentGroups = useMemo(
		() => Array.from(documentsByModel.entries()),
		[documentsByModel],
	);

	// Auto-focus the first document when the stage has documents but none is focused
	const autoFocusedStageRef = useRef<string | null>(null);
	useEffect(() => {
		if (!session || !activeStageSlug || typeof session.iteration_count !== 'number') {
			return;
		}

		// Check if any document is already focused for this stage
		const currentStagePrefix = `${session.id}:${activeStageSlug}:`;
		const hasExistingFocus = focusedStageDocument && Object.entries(focusedStageDocument).some(
			([key, entry]) => key.startsWith(currentStagePrefix) && entry?.documentKey
		);
		if (hasExistingFocus) {
			return;
		}

		// Avoid re-triggering for the same stage if we already auto-focused
		const stageKey = `${session.id}:${activeStageSlug}:${session.iteration_count}`;
		if (autoFocusedStageRef.current === stageKey) {
			return;
		}

		if (documentGroups.length === 0) {
			return;
		}

		// Find the first document key from available entries
		let firstDocKey: string | null = null;
		let firstStepKey = '';
		for (const [, entries] of documentGroups) {
			if (entries.length > 0) {
				firstDocKey = entries[0].documentKey;
				firstStepKey = entries[0].stepKey || '';
				break;
			}
		}

		if (!firstDocKey) return;

		autoFocusedStageRef.current = stageKey;

		// Set focus for each model that has this document
		for (const [modelId, entries] of documentGroups) {
			if (entries.some(e => e.documentKey === firstDocKey)) {
				setFocusedStageDocument({
					sessionId: session.id,
					stageSlug: activeStageSlug,
					modelId,
					documentKey: firstDocKey,
					stepKey: firstStepKey,
					iterationNumber: session.iteration_count,
				});
			}
		}
	}, [documentGroups, session, activeStageSlug, focusedStageDocument, setFocusedStageDocument]);

	// Get the selected document key, filtered by the CURRENT stage
	// focusedStageDocument is keyed by `${sessionId}:${stageSlug}:${modelId}`
	const selectedDocumentKey = useMemo((): string | null => {
		if (!focusedStageDocument || typeof focusedStageDocument !== 'object') {
			return null;
		}
		if (!session || !activeStageSlug) {
			return null;
		}

		// Only look at entries for the current session and stage
		const currentStagePrefix = `${session.id}:${activeStageSlug}:`;

		// Find the first entry that belongs to the current stage
		for (const [key, entry] of Object.entries(focusedStageDocument)) {
			if (
				key.startsWith(currentStagePrefix) &&
				entry != null &&
				typeof entry.documentKey === 'string' &&
				entry.documentKey.length > 0
			) {
				return entry.documentKey;
			}
		}

		return null;
	}, [focusedStageDocument, session, activeStageSlug]);

	const entryMatchesSelectedDocument = (
		entryDocumentKey: string,
		modelId: string,
		selectedKey: string,
	): boolean =>
		entryDocumentKey === selectedKey ||
		entryDocumentKey === `${selectedKey}_model_${modelId}` ||
		entryDocumentKey === `${selectedKey}_${modelId.replace(/-/g, '_')}`;

	const modelIdsForSelectedDocument = useMemo((): string[] => {
		if (selectedDocumentKey == null || selectedDocumentKey === '') {
			return [];
		}
		const key: string = selectedDocumentKey;
		return documentGroups
			.filter(([, entries]) =>
				entries.some(
					(entry) =>
						entry.modelId != null &&
						entryMatchesSelectedDocument(entry.documentKey, entry.modelId, key),
				),
			)
			.map(([modelId]) => modelId);
	}, [documentGroups, selectedDocumentKey]);

	const failedDocumentKeys = useMemo(() => {
		if (stageProgressSummary?.hasFailed) {
			return stageProgressSummary.failedDocumentKeys;
		}

		const fallback = documentGroups.flatMap(([, documents]) =>
			documents
				.filter((document) => document.status === 'failed')
				.map((document) => document.documentKey),
		);

		return Array.from(new Set(fallback));
	}, [documentGroups, stageProgressSummary]);

	const hasGeneratingDocuments = useMemo(() => {
		return documentGroups.some(([, documents]) =>
			documents.some((document) => document.status === 'generating')
		);
	}, [documentGroups]);

	const isGenerating = useMemo(() => {
		return hasGeneratingDocuments && failedDocumentKeys.length === 0 && !generationError;
	}, [hasGeneratingDocuments, failedDocumentKeys, generationError]);

	const hasDocuments = useMemo(
		() => modelIdsForSelectedDocument.length > 0,
		[modelIdsForSelectedDocument],
	);

	// Select feedback metadata for the current stage and iteration
	// IMPORTANT: Read values directly from state to avoid stale closure issues when switching stages
	const feedbacksForStageIterationArray = useDialecticStore((state) => {
		const currentProject = selectCurrentProjectDetail(state);
		const currentSession = state.activeSessionDetail;
		const currentStageSlug = state.activeStageSlug;
		const currentProcessTemplate = state.currentProcessTemplate;
		const currentActiveStage = currentProcessTemplate?.stages?.find((s) => s.slug === currentStageSlug) || null;

		if (!currentProject || !currentSession || !currentActiveStage) {
			return null;
		}

		return selectFeedbackForStageIteration(
			state,
			currentSession.id,
			currentActiveStage.slug,
			currentSession.iteration_count,
		);
	});
	const feedbackForStageIteration: DialecticFeedback | undefined =
		feedbacksForStageIterationArray?.[0];

	// ADDED: State for controlling feedback content modal
	const [showFeedbackContentModal, setShowFeedbackContentModal] =
		useState(false);
	const handleShowFeedbackContent = (feedback?: DialecticFeedback | null) => {
		if (feedback?.storage_path && project) {
			fetchFeedbackFileContent({
				projectId: project.id,
				storagePath: feedback.storage_path,
			});
			setShowFeedbackContentModal(true);
		}
	};

	const closeFeedbackModal = () => {
		setShowFeedbackContentModal(false);
		clearCurrentFeedbackFileContent?.(); // Clear content when closing
		resetFetchFeedbackFileContentError?.(); // Clear any errors
	};

	// Loading state for the entire component
	if (isLoadingCurrentProjectDetail) {
		return <DocumentWorkspaceSkeleton />;
	}

	// Handle project-level errors
	if (projectDetailError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Error Loading Project</AlertTitle>
				<AlertDescription>{projectDetailError.message}</AlertDescription>
			</Alert>
		);
	}

	// Handle case where there is no active session
	if (!session) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Session Not Active</CardTitle>
				</CardHeader>
				<CardContent>
					<p>Please select a session to view its contributions.</p>
				</CardContent>
			</Card>
		);
	}

	// Handle case where there is no active stage
	if (!activeStage) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Stage Not Selected</CardTitle>
				</CardHeader>
				<CardContent>
					<p>Please select a stage to view its contributions.</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{/* Stage Header */}
			<div data-testid="card-header" className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="space-y-1 min-w-[200px]">
						<h2 className="text-xl font-medium tracking-tight">{getDisplayName(activeStage)}</h2>
						<p className="text-sm text-muted-foreground leading-relaxed">{activeStage.description}</p>
					</div>

					{/* Middle Section: Banners */}
					{(isGenerating || generationError || failedDocumentKeys.length > 0) && (
						<div className="flex-1 min-w-[300px]">
							{/* Generation Status Banners */}
							{isGenerating && (
								<div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl px-5 py-3 border border-blue-200/50 dark:border-blue-800/50">
									<div className="flex items-center gap-3">
										<div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
											<Loader2 className="h-4 w-4 animate-spin text-blue-600" />
										</div>
										<div>
											<p className="text-sm font-medium text-blue-900 dark:text-blue-100">Generating documents</p>
											<p className="text-xs text-blue-700 dark:text-blue-300">
												Please wait while AI models process your request...
											</p>
										</div>
									</div>
								</div>
							)}
							{(generationError || failedDocumentKeys.length > 0) && (
								<div
									className="bg-red-50 dark:bg-red-950/20 rounded-xl px-5 py-3 border border-red-200/50 dark:border-red-800/50"
									data-testid="generation-error-banner"
								>
									<div className="flex items-center gap-3">
										<div className="p-1.5 bg-red-100 dark:bg-red-900/50 rounded-lg">
											<div className="h-4 w-4 rounded-full bg-red-600 flex items-center justify-center">
												<span className="text-white text-xs font-bold">!</span>
											</div>
										</div>
										<div>
											<p className="text-sm font-medium text-red-900 dark:text-red-100">Generation Error</p>
											{generationError?.message && (
												<p className="text-xs text-red-700 dark:text-red-300">{generationError.message}</p>
											)}
											{failedDocumentKeys.length > 0 && (
												<p className="text-xs text-red-700 dark:text-red-300">
													Failed documents: {failedDocumentKeys.join(', ')}
												</p>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					<div className="flex items-center gap-2">
						{/* Stage completion indicator */}
						{stageProgressSummary?.isComplete && (
							<Badge
								variant="secondary"
								className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 gap-1"
							>
								<CheckCircle2 className="h-3.5 w-3.5" />
								Complete
							</Badge>
						)}
						{/* View submitted feedback button */}
						{feedbackForStageIteration && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleShowFeedbackContent(feedbackForStageIteration)}
							>
								View Submitted Feedback
							</Button>
						)}
						<SubmitResponsesButton />
					</div>
				</div>
			</div>


			{/* Document Cards */}
			<div className="space-y-4">
				{hasDocuments ? (
					modelIdsForSelectedDocument.map((modelId) => (
						<div
							key={modelId}
							data-testid={`generated-contribution-card-${modelId}`}
						>
							<GeneratedContributionCard modelId={modelId} />
						</div>
					))
				) : (
					<div className="text-center py-12 text-muted-foreground">
						<p>No documents generated yet.</p>
						<p className="text-sm mt-1">Select a document from the sidebar checklist to view and edit.</p>
					</div>
				)}
			</div>

			{/* Project Complete Badge (final stage) */}
			{isLastStage && stageProgressSummary?.isComplete && (
				<div className="flex justify-center">
					<Badge
						variant="secondary"
						className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100 px-4 py-2"
					>
						Project Complete - All stages finished
					</Badge>
				</div>
			)}

			{/* Submit Responses Button */}
			<SubmitResponsesButton />

			{/* Feedback Content Modal */}
			<AlertDialog
				open={showFeedbackContentModal}
				onOpenChange={(open) => !open && closeFeedbackModal()}
			>
				<AlertDialogContent className="max-w-4xl h-[80vh] flex flex-col">
					<AlertDialogHeader>
						<AlertDialogTitle>
							Feedback for Iteration{" "}
							{feedbackForStageIteration?.iteration_number}
						</AlertDialogTitle>
						<AlertDialogDescription>
							This is the consolidated feedback that was submitted for this
							stage.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="flex-grow overflow-y-auto pr-4">
						{isFetchingFeedbackFileContent ? (
							<div className="flex justify-center items-center h-full">
								<Loader2 className="h-8 w-8 animate-spin" />
							</div>
						) : fetchFeedbackFileContentError ? (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>
									{fetchFeedbackFileContentError.message}
								</AlertDescription>
							</Alert>
						) : currentFeedbackFileContent ? (
							<MarkdownRenderer content={currentFeedbackFileContent.content} />
						) : (
							<p>No content available.</p>
						)}
					</div>
					<AlertDialogFooter>
						<Button variant="outline" onClick={closeFeedbackModal}>
							Close
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
};
