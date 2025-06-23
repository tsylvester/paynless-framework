import React from 'react';
import type { DialecticStage } from '@paynless/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { 
  useDialecticStore, 
  selectSessionById, 
  selectActiveContextSessionId, 
  selectCurrentProjectDetail, 
  selectIsStageReadyForSessionIteration
} from '@paynless/store';
import { useMemo } from 'react';
import { GenerateContributionButton } from './GenerateContributionButton';
import { AIModelSelector } from './AIModelSelector';

interface StageTabCardProps {
  stage: DialecticStage;
  isActiveStage: boolean;
  onCardClick: (stage: DialecticStage) => void;
}

export const StageTabCard: React.FC<StageTabCardProps> = ({ 
  stage, 
  isActiveStage,
  onCardClick,
}) => {
  // --- Data Fetching from Store ---
  const store = useDialecticStore(); // Full store state for selectors that need it directly
  const activeSessionId = useDialecticStore(selectActiveContextSessionId);
  // Use a stable reference for project if possible, or ensure selectors re-run correctly
  const project = useDialecticStore(selectCurrentProjectDetail); 
  const session = useMemo(() => activeSessionId ? selectSessionById(store, activeSessionId) : undefined, [store, activeSessionId]);
  const initialPromptContentCache = useDialecticStore(state => state.initialPromptContentCache); // Get cache directly from state

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

  let isSeedPromptLoading = false;
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
      isSeedPromptLoading = initialPromptContentCache[targetResource.id].isLoading;
    }
  }

  if (!project || !session) { // Ensure project is also checked here
    return (
      <Card className={cn("w-48 min-h-[120px] flex flex-col justify-center items-center opacity-50 cursor-not-allowed", isActiveStage ? "border-2 border-primary" : "border")}>
        <CardHeader className="pb-2 pt-3 px-3">
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
    onCardClick(stage);
  };

  // Logic from plan 2.B.2.2 - updated
  const finalButtonDisabled = !isActiveStage || (isActiveStage && (!isStageReady || isSeedPromptLoading));
  let textForButtonPropValue: string;

  if (isActiveStage && !isStageReady) {
    textForButtonPropValue = "Stage Not Ready";
  } else {
    textForButtonPropValue = stage.display_name; // GenerateContributionButton will prepend Generate/Regenerate
  }

  return (
    <Card 
      data-testid={`stage-tab-${stage.slug}`}
      className={cn(
        "w-48 min-h-[120px] flex flex-col cursor-pointer transition-all duration-150 ease-in-out hover:shadow-md", 
        isActiveStage ? "border-2 border-primary shadow-lg" : "border bg-card hover:bg-muted/50",
      )}
      onClick={handleCardClick}
      role="tab"
      aria-selected={isActiveStage}
      aria-controls={`stage-content-${stage.display_name}`}
      tabIndex={isActiveStage ? 0 : -1}
    >
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-base text-center">{stage.display_name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-center items-center text-center px-2">
        {stage.description && (
          <p className="text-xs text-muted-foreground">{stage.description}</p>
        )}
        {contributionsForStageExist && (
          <p className="text-xs text-green-600">Completed</p>
        )}
      </CardContent>
      {isActiveStage && (
        <CardFooter className="p-2 border-t flex-shrink-0 flex flex-col items-center justify-center gap-4">
          <GenerateContributionButton 
            currentStageFriendlyName={textForButtonPropValue}
            currentStage={stage}
            sessionId={session.id}
            projectId={project.id} // project is guaranteed non-null here by the check above
            disabled={finalButtonDisabled}
            className="w-full"
          />
          <AIModelSelector />
        </CardFooter>
      )}
    </Card>
  );
}; 