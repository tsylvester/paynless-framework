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
} from '@paynless/store';

interface StageCardProps {
  stage: DialecticStage;
}

const StageCard: React.FC<StageCardProps> = ({ stage }) => {
  // --- Data Fetching from Store ---
  const setActiveStage = useDialecticStore(state => state.setActiveStage);
  const activeStageSlug = useDialecticStore(selectActiveStageSlug);
  const activeSessionId = useDialecticStore(selectActiveContextSessionId);
  const project = useDialecticStore(selectCurrentProjectDetail); 
  
  const session = useDialecticStore(state => 
    activeSessionId ? selectSessionById(state, activeSessionId) : undefined
  );
  
  const initialPromptContentCache = useDialecticStore(state => state.initialPromptContentCache);

  const isActiveStage = stage.slug === activeStageSlug;

  const isStageReady = useDialecticStore(state => {
    // Ensure project and session from the state are used for consistency with the selector call
    const currentProjectFromState = selectCurrentProjectDetail(state);
    const currentSessionFromState = activeSessionId ? selectSessionById(state, activeSessionId) : undefined;

    if (!currentProjectFromState || !currentSessionFromState) {
      return false;
    }
    return selectIsStageReadyForSessionIteration(
      state, 
      currentProjectFromState.id, 
      currentSessionFromState.id, 
      stage.slug, 
      currentSessionFromState.iteration_count
    );
  });

  if (project && session && project.resources && isStageReady) {
    const targetResource = project.resources.find(resource => {
      if (typeof resource.resource_description === 'string') {
        try {
          const desc = JSON.parse(resource.resource_description) as { type: string; session_id: string; stage_slug: string; iteration: number };
          return (
            desc.type === 'seed_prompt' &&
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
    if (targetResource && initialPromptContentCache && initialPromptContentCache[targetResource.id]) {
      // isSeedPromptLoading = initialPromptContentCache[targetResource.id].isLoading;
    }
  }

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

  const contributionsForStageExist = session.dialectic_contributions?.some(c => c.stage === stage.slug);

  const handleCardClick = () => {
    if (setActiveStage) {
      setActiveStage(stage.slug);
    }
  };

  return (
    <Card
      key={stage.id}
      data-testid={`stage-tab-${stage.slug}`}
      className={cn(
        "flex flex-col cursor-pointer transition-all duration-150 ease-in-out hover:shadow-md justify-center p-2",
        isActiveStage ? "border-2 border-primary shadow-lg" : "border bg-card hover:bg-muted/50",
      )}
      onClick={handleCardClick}
      role="tab"
      aria-selected={isActiveStage}
      aria-controls={`stage-content-${stage.display_name}`}
      tabIndex={isActiveStage ? 0 : -1}
    >
      <div className="flex items-baseline justify-center gap-x-1.5">
        <CardTitle className="text-base">
          {stage.display_name}
        </CardTitle>
        {contributionsForStageExist && (
          <div className="text-xs text-green-600">Completed</div>
        )}
      </div>
      {stage.description && (
        <p className="text-xs text-muted-foreground text-center">{stage.description}</p>
      )}
    </Card>
  );
};

export const StageTabCard: React.FC = () => {
  const stages = useDialecticStore(selectSortedStages);
  const activeStageSlug = useDialecticStore(selectActiveStageSlug);
  const setActiveStage = useDialecticStore(state => state.setActiveStage);
  const activeSessionId = useDialecticStore(selectActiveContextSessionId);
  
  const session = useDialecticStore(state => 
    activeSessionId ? selectSessionById(state, activeSessionId) : undefined
  );

  useEffect(() => {
    if (!activeStageSlug && stages && stages.length > 0) {
      const currentStageFromSession = session?.current_stage_id 
        ? stages.find(s => s.id === session.current_stage_id)
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
        <p className="text-muted-foreground">No stages available for this process.</p>
      </div>
    );
  }

  return (
    <>
      {stages.map(stage => (
        <StageCard key={stage.id} stage={stage} />
      ))}
    </>
  );
}; 