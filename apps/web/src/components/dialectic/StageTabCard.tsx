import React, { useEffect, useState } from "react";
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
	const [isChecklistOpen, setChecklistOpen] = useState(true);

	if (!isContextReady) {
		return (
			<div
				className={cn(
					"relative flex items-center gap-3 p-3 rounded-lg opacity-50 cursor-not-allowed",
					"border-l-4 border-l-transparent",
				)}
			>
				<div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
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
		<div className="space-y-3" data-testid={`stage-card-${stage.slug}`}>
			<button
				data-testid={`stage-tab-${stage.slug}`}
				className={cn(
					"group w-full text-left py-4 px-4 rounded-xl transition-all duration-200 text-sm relative overflow-hidden",
					isActive
						? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25 font-medium"
						: "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:shadow-md",
				)}
				onClick={onSelect}
				role="tab"
				aria-selected={isActive}
				aria-controls={`stage-content-${displayName}`}
				tabIndex={isActive ? 0 : -1}
			>
				{isActive && (
					<div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-blue-700/10 animate-pulse" />
				)}
				<div className="flex items-center justify-between gap-4 relative z-10">
					<div className="flex items-center gap-3">
						<div
							className={cn(
								"w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-200",
								isActive
									? "bg-white/20 text-white"
									: "bg-muted text-muted-foreground group-hover:bg-muted-foreground/20",
						)}
						>
							{index + 1}
						</div>
						<span className="font-medium">{displayName}</span>
					</div>
					{hasDocuments && (
						<div
							className="flex flex-col items-end gap-1 text-xs"
							data-testid={`stage-progress-summary-${stage.slug}`}
						>
							{progress.isComplete && (
								<span
									data-testid={`stage-progress-label-${stage.slug}`}
									className="font-medium text-emerald-400"
								>
									Completed
								</span>
							)}
							<span
								data-testid={`stage-progress-count-${stage.slug}`}
								className="text-muted-foreground"
							>
								{`${progress.completedDocuments} / ${progress.totalDocuments} documents`}
							</span>
						</div>
					)}
				</div>
			</button>
			{shouldRenderChecklist && (
				<div
					className="rounded-lg border border-muted bg-card"
					data-testid={`stage-checklist-accordion-${stage.slug}`}
				>
					<button
						type="button"
						className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
						data-testid={`stage-checklist-toggle-${stage.slug}`}
						onClick={() => setChecklistOpen((previous) => !previous)}
						aria-expanded={isChecklistOpen}
					>
						<span>Checklist</span>
						<span aria-hidden="true">{isChecklistOpen ? "−" : "+"}</span>
					</button>
					{isChecklistOpen && (
						<div className="space-y-4 px-4 pb-4" data-testid={`stage-checklist-content-${stage.slug}`}>
							{checklist}
						</div>
					)}
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
		<div className="space-y-6" data-testid="stage-container">
			<div className="space-y-2 lg:w-80" data-testid="stage-tab-list">
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
				<div className="rounded-lg border border-dashed border-muted p-6 text-sm text-muted-foreground">
					Stage checklist data is unavailable.
				</div>
			)}
		</div>
	);
};
