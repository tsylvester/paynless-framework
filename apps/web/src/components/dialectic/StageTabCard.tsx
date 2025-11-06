import React, { useEffect } from 'react';
import type { DialecticStage } from '@paynless/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { 
  useDialecticStore, 
  selectSessionById, 
  selectActiveContextSessionId, 
  selectCurrentProjectDetail, 
  selectIsStageReadyForSessionIteration,
  selectSortedStages,
  selectActiveStageSlug
  selectStageProgressSummary
} from '@paynless/store';

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

  const { isComplete, completedDocuments, totalDocuments } = useDialecticStore(state => {
    if (!activeSessionId) {
      return { isComplete: false, completedDocuments: 0, totalDocuments: 0 };
    }
    const activeSession = selectSessionById(state, activeSessionId);
    if (!activeSession) {
      return { isComplete: false, completedDocuments: 0, totalDocuments: 0 };
    }
    return selectStageProgressSummary(
      state,
      activeSession.id,
      stage.slug,
      activeSession.iteration_count
    );
  });

  if (!project || !session) { // Ensure project is also checked here
    return (
      <Card className={cn("w-48 flex flex-col justify-center items-center opacity-50 cursor-not-allowed", isActiveStage ? "border-2 border-primary" : "border")}>
        <CardHeader>
          <CardTitle className="text-base text-center">{stage.display_name}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
         <p className="text-xs text-muted-foreground">Context unavailable</p>
        </CardContent>
      </Card>
    );
  }

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
