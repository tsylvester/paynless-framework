import React, { useEffect } from "react";
import type {
	DialecticStage,
	FocusedStageDocumentState,
	SetFocusedStageDocumentPayload,
} from "@paynless/types";
import { cn } from "@/lib/utils";
import {
	useDialecticStore,
	selectSessionById,
	selectActiveContextSessionId,
	selectCurrentProjectDetail,
	selectSortedStages,
	selectActiveStageSlug,
	selectStageProgressSummary
} from "@paynless/store";
import { StageRunChecklist } from "./StageRunChecklist";
import { CheckCircle2 } from "lucide-react";

interface StageProgressSnapshotSummary {
	totalDocuments: number;
	completedDocuments: number;
	isComplete: boolean;
}

interface StageCardProps {
	stage: DialecticStage;
	index: number;
	isActive: boolean;
	isContextReady: boolean;
	onSelect: () => void;
	progress: StageProgressSnapshotSummary;
	checklist?: React.ReactNode;
}

// UI-only mapping of stage names
const stageNameMap: Record<string, string> = {
	thesis: "Proposal",
	antithesis: "Review",
	synthesis: "Refinement",
	parenthesis: "Planning",
	paralysis: "Implementation",
};

const getDisplayName = (stage: DialecticStage): string => {
	return stageNameMap[stage.slug] || stage.display_name;
};

const StageCard: React.FC<StageCardProps> = ({
	stage,
	index,
	isActive,
	isContextReady,
	onSelect,
	progress,
	checklist,
}) => {
	const displayName = getDisplayName(stage);

	if (!isContextReady) {
		return (
			<div
				className={cn(
					"relative flex items-center gap-3 p-3 rounded-lg opacity-50 cursor-not-allowed",
					"border-l-4 border-l-transparent",
				)}
			>
				<div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
					<span className="text-xs font-medium text-muted-foreground">
						{index + 1}
					</span>
				</div>
				<div className="flex-1 min-w-0">
					<div className="font-medium text-sm truncate">{displayName}</div>
					<div className="text-xs text-muted-foreground">Not available</div>
				</div>
			</div>
		);
	}

	const hasDocuments = progress.totalDocuments > 0;
	const shouldRenderChecklist = Boolean(isActive && checklist);

	return (
		<div className="space-y-1.5" data-testid={`stage-card-${stage.slug}`}>
			<button
				data-testid={`stage-tab-${stage.slug}`}
				className={cn(
					"group w-full text-left py-3 px-3 rounded-lg transition-all duration-200 text-sm relative",
					isActive
						? "bg-primary/5 border-l-4 border-l-primary font-medium"
						: "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-4 border-l-transparent",
				)}
				onClick={onSelect}
				role="tab"
				aria-selected={isActive}
				aria-controls={`stage-content-${displayName}`}
				tabIndex={isActive ? 0 : -1}
			>
				<div className="flex items-center justify-between gap-3 relative z-10">
					<div className="flex items-center gap-2.5">
						<div
							className={cn(
								"w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors duration-200",
								isActive
									? "bg-primary text-primary-foreground"
									: progress.isComplete
										? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
										: "bg-muted text-muted-foreground group-hover:bg-muted-foreground/20",
							)}
						>
							{progress.isComplete ? (
								<CheckCircle2 className="h-3.5 w-3.5" />
							) : (
								index + 1
							)}
						</div>
						<span className={cn(
							"font-medium",
							isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
						)}>
							{displayName}
						</span>
					</div>
					{hasDocuments && progress.isComplete && !isActive && (
						<span
							data-testid={`stage-progress-label-${stage.slug}`}
							className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
						>
							Done
						</span>
					)}
				</div>
			</button>
			{shouldRenderChecklist && (
				<div
					className="w-full pl-4"
					data-testid={`stage-checklist-wrapper-${stage.slug}`}
				>
					{checklist}
				</div>
			)}
		</div>
	);
};

export const StageTabCard: React.FC = () => {
	const {
		stages,
		activeStageSlug,
		setActiveStage,
		setFocusedStageDocument,
		selectedModelIds,
		focusedStageDocumentMap,
		activeSessionDetail,
		activeSessionId,
		currentProjectDetail,
		stageSummaries,
	} = useDialecticStore((state) => {
		const sortedStages = selectSortedStages(state);
		const activeStageSlugValue = selectActiveStageSlug(state);
		const sessionId = selectActiveContextSessionId(state);
		const activeSession = sessionId ? selectSessionById(state, sessionId) : null;
		const iterationNumber = activeSession?.iteration_count;
		const summaries: Record<string, StageProgressSnapshotSummary> = {};
		const focusedStageDocumentEntries: Record<string, FocusedStageDocumentState | null> =
			state.focusedStageDocument ?? {};

		for (const stage of sortedStages) {
			if (sessionId && typeof iterationNumber === "number") {
				const summary = selectStageProgressSummary(
					state,
					sessionId,
					stage.slug,
					iterationNumber,
				);
				summaries[stage.slug] = {
					totalDocuments: summary?.totalDocuments ?? 0,
					completedDocuments: summary?.completedDocuments ?? 0,
					isComplete: summary?.isComplete ?? false,
				};
			} else {
				summaries[stage.slug] = {
					totalDocuments: 0,
					completedDocuments: 0,
					isComplete: false,
				};
			}
		}

		return {
			stages: sortedStages,
			activeStageSlug: activeStageSlugValue,
			setActiveStage: state.setActiveStage,
			setFocusedStageDocument: state.setFocusedStageDocument,
			selectedModelIds: state.selectedModelIds ?? [],
			focusedStageDocumentMap: focusedStageDocumentEntries,
			activeSessionDetail: activeSession,
			activeSessionId: sessionId,
			currentProjectDetail: selectCurrentProjectDetail(state),
			stageSummaries: summaries,
		};
	});

	useEffect(() => {
		if (!activeStageSlug && stages.length > 0) {
			const currentStageFromSession = activeSessionDetail?.current_stage_id
				? stages.find((s) => s.id === activeSessionDetail.current_stage_id)
				: undefined;

			if (currentStageFromSession) {
				setActiveStage(currentStageFromSession.slug);
			} else {
				setActiveStage(stages[0].slug);
			}
		}
	}, [stages, activeSessionDetail, activeStageSlug, setActiveStage]);

	if (stages.length === 0) {
		return (
			<div className="flex justify-center items-center p-4">
				<p className="text-muted-foreground">
					No stages available for this process.
				</p>
			</div>
		);
	}

	const activeStage = stages.find((stage) => stage.slug === activeStageSlug) ?? null;
	const iterationNumber = activeSessionDetail?.iteration_count;
	const isContextReady = Boolean(currentProjectDetail && activeSessionDetail);
	const canRenderChecklists = Boolean(
		activeStage &&
		activeSessionId &&
		typeof iterationNumber === "number" &&
		selectedModelIds.length > 0,
	);

	const handleStageSelect = (slug: string) => {
		setActiveStage(slug);
	};

	const handleDocumentSelect = (payload: SetFocusedStageDocumentPayload) => {
		setFocusedStageDocument(payload);
	};

	const renderChecklistForStage = (isStageActive: boolean) => {
		if (!isStageActive || !canRenderChecklists) {
			return undefined;
		}

		return selectedModelIds.map((modelId) => (
			<StageRunChecklist
				key={modelId}
				modelId={modelId}
				focusedStageDocumentMap={focusedStageDocumentMap}
				onDocumentSelect={handleDocumentSelect}
			/>
		));
	};

	return (
		<div className="space-y-1.5 self-start" data-testid="stage-container">
			<div className="space-y-1.5" data-testid="stage-tab-list">
				{stages.map((stage, index) => {
					const isActiveStage = stage.slug === activeStageSlug;

					return (
						<StageCard
							key={stage.id}
							stage={stage}
							index={index}
							isActive={isActiveStage}
							isContextReady={isContextReady}
							onSelect={() => handleStageSelect(stage.slug)}
							progress={
								stageSummaries[stage.slug] ?? {
									totalDocuments: 0,
									completedDocuments: 0,
									isComplete: false,
								}
							}
							checklist={renderChecklistForStage(isActiveStage)}
						/>
					);
				})}
			</div>

			{!canRenderChecklists && (
				<div className="rounded-lg border border-dashed border-muted p-4 text-sm text-muted-foreground">
					Select at least one model to view the checklist.
				</div>
			)}
		</div>
	);
};
