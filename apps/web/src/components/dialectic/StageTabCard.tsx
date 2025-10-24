import React, { useEffect } from "react";
import type { DialecticStage } from "@paynless/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	useDialecticStore,
	selectSessionById,
	selectActiveContextSessionId,
	selectCurrentProjectDetail,
	selectIsStageReadyForSessionIteration,
	selectSortedStages,
	selectActiveStageSlug,
} from "@paynless/store";

interface StageCardProps {
	stage: DialecticStage;
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

const StageCard: React.FC<StageCardProps> = ({ stage }) => {
	const stages = useDialecticStore(selectSortedStages);
	// --- Data Fetching from Store ---
	const setActiveStage = useDialecticStore((state) => state.setActiveStage);
	const activeStageSlug = useDialecticStore(selectActiveStageSlug);
	const activeSessionId = useDialecticStore(selectActiveContextSessionId);
	const project = useDialecticStore(selectCurrentProjectDetail);

	const session = useDialecticStore((state) =>
		activeSessionId ? selectSessionById(state, activeSessionId) : undefined,
	);

	const initialPromptContentCache = useDialecticStore(
		(state) => state.initialPromptContentCache,
	);

	const isActiveStage = stage.slug === activeStageSlug;

	const isStageReady = useDialecticStore((state) => {
		// Ensure project and session from the state are used for consistency with the selector call
		const currentProjectFromState = selectCurrentProjectDetail(state);
		const currentSessionFromState = activeSessionId
			? selectSessionById(state, activeSessionId)
			: undefined;

		if (!currentProjectFromState || !currentSessionFromState) {
			return false;
		}
		return selectIsStageReadyForSessionIteration(
			state,
			currentProjectFromState.id,
			currentSessionFromState.id,
			stage.slug,
			currentSessionFromState.iteration_count,
		);
	});

	if (project && session && project.resources && isStageReady) {
		const targetResource = project.resources.find((resource) => {
			if (typeof resource.resource_description === "string") {
				try {
					const desc = JSON.parse(resource.resource_description) as {
						type: string;
						session_id: string;
						stage_slug: string;
						iteration: number;
					};
					return (
						desc.type === "seed_prompt" &&
						desc.session_id === session.id &&
						desc.stage_slug === stage.slug &&
						desc.iteration === session.iteration_count
					);
				} catch (e) {
					return false;
				}
			}
			return false;
		});
		if (
			targetResource &&
			initialPromptContentCache &&
			initialPromptContentCache[targetResource.id]
		) {
			// isSeedPromptLoading = initialPromptContentCache[targetResource.id].isLoading;
		}
	}

	if (!project || !session) {
		// Ensure project is also checked here
		return (
			<div
				className={cn(
					"relative flex items-center gap-3 p-3 rounded-lg opacity-50 cursor-not-allowed",
					"border-l-4 border-l-transparent",
				)}
			>
				<div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
					<span className="text-xs font-medium text-muted-foreground">
						{stages.findIndex((s) => s.id === stage.id) + 1}
					</span>
				</div>
				<div className="flex-1 min-w-0">
					<div className="font-medium text-sm truncate">
						{getDisplayName(stage)}
					</div>
					<div className="text-xs text-muted-foreground">Not available</div>
				</div>
			</div>
		);
	}

	const contributionsForStageExist = session.dialectic_contributions?.some(
		(c) => c.stage === stage.slug,
	);

	const handleCardClick = () => {
		if (setActiveStage) {
			setActiveStage(stage.slug);
		}
	};

	const stageIndex = stages.findIndex((s) => s.id === stage.id);

	return (
		<button
			key={stage.id}
			data-testid={`stage-tab-${stage.slug}`}
			className={cn(
				"group w-full text-left py-4 px-4 rounded-xl transition-all duration-200 text-sm relative overflow-hidden",
				isActiveStage
					? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25 font-medium"
					: "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:shadow-md",
			)}
			onClick={handleCardClick}
			role="tab"
			aria-selected={isActiveStage}
			aria-controls={`stage-content-${getDisplayName(stage)}`}
			tabIndex={isActiveStage ? 0 : -1}
		>
			{/* Active stage indicator */}
			{isActiveStage && (
				<div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-blue-700/10 animate-pulse" />
			)}
			
			<div className="flex items-center justify-between relative z-10">
				<div className="flex items-center gap-3">
					<div className={cn(
						"w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-200",
						isActiveStage 
							? "bg-white/20 text-white" 
							: "bg-muted text-muted-foreground group-hover:bg-muted-foreground/20"
					)}>
						{stageIndex + 1}
					</div>
					<span className="font-medium">{getDisplayName(stage)}</span>
				</div>
				
				{contributionsForStageExist && (
					<div className={cn(
						"w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors duration-200",
						isActiveStage 
							? "bg-white/20 text-white" 
							: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
					)}>
						✓
					</div>
				)}
			</div>
		</button>
	);
};

export const StageTabCard: React.FC = () => {
	const stages = useDialecticStore(selectSortedStages);
	const activeStageSlug = useDialecticStore(selectActiveStageSlug);
	const setActiveStage = useDialecticStore((state) => state.setActiveStage);
	const activeSessionId = useDialecticStore(selectActiveContextSessionId);

	const session = useDialecticStore((state) =>
		activeSessionId ? selectSessionById(state, activeSessionId) : undefined,
	);

	useEffect(() => {
		if (!activeStageSlug && stages && stages.length > 0) {
			const currentStageFromSession = session?.current_stage_id
				? stages.find((s) => s.id === session.current_stage_id)
				: undefined;

			if (currentStageFromSession) {
				setActiveStage(currentStageFromSession.slug);
			} else {
				setActiveStage(stages[0].slug);
			}
		}
	}, [stages, session, activeStageSlug, setActiveStage]);

	if (!stages || stages.length === 0) {
		return (
			<div className="flex justify-center items-center p-4">
				<p className="text-muted-foreground">
					No stages available for this process.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{stages.map((stage) => (
				<StageCard key={stage.id} stage={stage} />
			))}
		</div>
	);
};
