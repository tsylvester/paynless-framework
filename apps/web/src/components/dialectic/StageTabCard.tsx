import React, { useEffect, useRef } from "react";
import type {
	DialecticStage,
	FocusedStageDocumentState,
	SetFocusedStageDocumentPayload,
	UnifiedProjectStatus,
} from "@paynless/types";
import { cn } from "@/lib/utils";
import {
	useDialecticStore,
	selectSessionById,
	selectActiveContextSessionId,
	selectCurrentProjectDetail,
	selectSortedStages,
	selectActiveStageSlug,
	selectUnifiedProjectProgress,
	selectSelectedModels,
} from "@paynless/store";
import { StageRunChecklist } from "./StageRunChecklist";
import { CheckCircle2 } from "lucide-react";

interface StageProgressSnapshotSummary {
	totalDocuments: number;
	completedDocuments: number;
	isComplete: boolean;
	stageStatus: UnifiedProjectStatus;
	stagePercentage: number;
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
						<span
							className={cn(
								"font-medium",
								isActive
									? "text-foreground"
									: "text-muted-foreground group-hover:text-foreground",
							)}
						>
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
		selectedModels,
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
		const unified = sessionId ? selectUnifiedProjectProgress(state, sessionId) : null;
		const focusedStageDocumentEntries: Record<string, FocusedStageDocumentState | null> =
			state.focusedStageDocument ?? {};

		const summaries: Record<string, StageProgressSnapshotSummary> = {};
		for (const stage of sortedStages) {
			const detail = unified?.stageDetails?.find((d) => d.stageSlug === stage.slug) ?? null;
			const totalDocuments = detail ? (detail.totalSteps > 0 ? detail.totalSteps : 1) : 0;
			const completedDocuments = detail?.completedSteps ?? 0;
			const stageStatus = detail?.stageStatus ?? "not_started";
			const stagePercentage = detail?.stagePercentage ?? 0;
			summaries[stage.slug] = {
				totalDocuments,
				completedDocuments,
				isComplete: stageStatus === "completed",
				stageStatus,
				stagePercentage,
			};
		}

		return {
			stages: sortedStages,
			activeStageSlug: activeStageSlugValue,
			setActiveStage: state.setActiveStage,
			setFocusedStageDocument: state.setFocusedStageDocument,
			selectedModels: selectSelectedModels(state),
			focusedStageDocumentMap: focusedStageDocumentEntries,
			activeSessionDetail: activeSession,
			activeSessionId: sessionId,
			currentProjectDetail: selectCurrentProjectDetail(state),
			stageSummaries: summaries,
		};
	});

	const hasInitializedStage = useRef(false);

	useEffect(() => {
		if (!hasInitializedStage.current && !activeStageSlug && stages.length > 0) {
			const currentStageFromSession = activeSessionDetail?.current_stage_id
				? stages.find((s) => s.id === activeSessionDetail.current_stage_id)
				: undefined;

			if (currentStageFromSession) {
				setActiveStage(currentStageFromSession.slug);
			} else {
				setActiveStage(stages[0].slug);
			}
			hasInitializedStage.current = true;
		}
	}, [stages, activeStageSlug, setActiveStage]);

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
		typeof iterationNumber === "number",
	);

	const handleStageSelect = (slug: string) => {
		setActiveStage(slug);
	};

	const handleDocumentSelect = (payload: SetFocusedStageDocumentPayload) => {
		setFocusedStageDocument(payload);
	};

	const renderChecklistForStage = (isStageActive: boolean): React.ReactNode => {
		if (!isStageActive || !canRenderChecklists) {
			return undefined;
		}

		const modelId: string | null =
			selectedModels.length > 0 ? selectedModels[0].id : null;
		return (
			<StageRunChecklist
				key="single"
				modelId={modelId}
				focusedStageDocumentMap={focusedStageDocumentMap}
				onDocumentSelect={handleDocumentSelect}
			/>
		);
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
									stageStatus: "not_started",
									stagePercentage: 0,
								}
							}
							checklist={renderChecklistForStage(isActiveStage)}
						/>
					);
				})}
			</div>
		</div>
	);
};
