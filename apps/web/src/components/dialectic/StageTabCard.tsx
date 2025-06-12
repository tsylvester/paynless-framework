import React, { useEffect } from 'react';
import { 
  useDialecticStore, 
  selectActiveContextProjectId, 
  selectActiveContextSessionId, 
  selectActiveContextStageSlug 
} from '@paynless/store';
import { DialecticSession, DialecticStage, ContributionCacheEntry, ApiError } from '@paynless/types';
import { DialecticStageDefinition, DIALECTIC_STAGES } from '@/config/dialecticConfig';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react'; // For spinner

interface StageTabCardProps {
  stageDefinition: DialecticStageDefinition;
}

// Helper to determine if a stage is considered complete based on status
const isStageCompleted = (status: string, stageSlug: DialecticStage): boolean => {
  return status.toLowerCase().startsWith(stageSlug) && status.toLowerCase().endsWith('_complete');
};

// Helper to get the stage number from a slug
const getStageNumber = (slug: DialecticStage): number => {
    const stage = DIALECTIC_STAGES.find(s => s.slug === slug);
    return stage ? stage.stageNumber : Infinity;
};

export const StageTabCard: React.FC<StageTabCardProps> = ({ 
  stageDefinition, 
}) => {
  // Get context from store
  const projectIdFromStore = useDialecticStore(selectActiveContextProjectId);
  const sessionIdFromStore = useDialecticStore(selectActiveContextSessionId);
  const activeStageSlugFromStore = useDialecticStore(selectActiveContextStageSlug);
  const setActiveContextStageSlugAction = useDialecticStore(state => state.setActiveContextStageSlug);

  const session = useDialecticStore(state => 
    sessionIdFromStore ? state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionIdFromStore) : undefined
  ) as DialecticSession | undefined;

  // isActiveStage is now derived
  const isActiveStage = activeStageSlugFromStore === stageDefinition.slug;

  const currentIteration = session?.current_iteration;

  const seedPromptPath = projectIdFromStore && sessionIdFromStore && currentIteration ? 
    `projects/${projectIdFromStore}/sessions/${sessionIdFromStore}/iteration_${currentIteration}/${stageDefinition.slug}/seed_prompt.md` : null;

  const seedPromptCacheEntry = useDialecticStore(state => 
    seedPromptPath ? state.contributionContentCache?.[seedPromptPath] : undefined
  ) as ContributionCacheEntry | undefined;

  const fetchSeedPromptContent = useDialecticStore(state => state.fetchInitialPromptContent); // Assuming this can fetch any file

  useEffect(() => {
    if (seedPromptPath && (!seedPromptCacheEntry || (!seedPromptCacheEntry.content && !seedPromptCacheEntry.isLoading && !seedPromptCacheEntry.error))) {
        fetchSeedPromptContent(seedPromptPath);
    }
  }, [seedPromptPath, seedPromptCacheEntry, fetchSeedPromptContent]);

  const generateContributions = useDialecticStore(state => state.generateContributions);
  const isGenerating = useDialecticStore(state => state.isGeneratingContributions);
  const generateError = useDialecticStore(state => state.generateContributionsError) as ApiError | null;

  if (!session || !projectIdFromStore || !currentIteration) {
    return (
      <Card className={cn("w-48 min-h-[120px] flex flex-col justify-center items-center opacity-50 cursor-not-allowed", isActiveStage ? "border-2 border-primary" : "border")}>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-base text-center">{stageDefinition.displayName}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
         <p className="text-xs text-muted-foreground">Context unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const seedPromptExists = !!(seedPromptCacheEntry?.content && !seedPromptCacheEntry.isLoading && !seedPromptCacheEntry.error);
  const seedPromptLoading = seedPromptCacheEntry?.isLoading;
  // const seedPromptError = seedPromptCacheEntry?.error; // Error is displayed inline, not used for button logic directly here

  let prerequisitesMet = true;
  let prerequisiteWarning = '';
  if (stageDefinition.stageNumber > 1) {
    const previousStageSlug = DIALECTIC_STAGES.find(s => s.stageNumber === stageDefinition.stageNumber - 1)?.slug;
    if (previousStageSlug && !isStageCompleted(session.status, previousStageSlug)) {
      prerequisitesMet = false;
      const previousStageDisplayName = DIALECTIC_STAGES.find(s => s.slug === previousStageSlug)?.displayName || previousStageSlug;
      prerequisiteWarning = `Please complete '${previousStageDisplayName}' first.`;
    }
  }

  const canGenerateCurrentStage = 
    session.status.toLowerCase() === `pending_${stageDefinition.slug}` || 
    (isStageCompleted(session.status, stageDefinition.slug) && stageDefinition.slug !== DialecticStage.PARALYSIS);
  
  if (stageDefinition.slug === DialecticStage.THESIS && session.status.toLowerCase() === `pending_${DialecticStage.THESIS}`) {
    prerequisitesMet = true; 
  }

  const showGenerateButton = isActiveStage;
  const generateButtonDisabled = 
    isGenerating || 
    !prerequisitesMet || 
    !canGenerateCurrentStage ||
    !seedPromptExists ||
    seedPromptLoading;

  const handleGenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (!generateButtonDisabled && projectIdFromStore && sessionIdFromStore && currentIteration) {
      generateContributions({
        sessionId: sessionIdFromStore,
        projectId: projectIdFromStore,
        stageSlug: stageDefinition.slug,
        iterationNumber: currentIteration,
      });
    }
  };

  const handleCardClick = () => {
    setActiveContextStageSlugAction(stageDefinition.slug);
  };

  return (
    <Card 
      data-testid={`stage-tab-${stageDefinition.slug}`}
      className={cn(
        "w-48 min-h-[120px] flex flex-col cursor-pointer transition-all duration-150 ease-in-out hover:shadow-md", 
        isActiveStage ? "border-2 border-primary shadow-lg" : "border bg-card hover:bg-muted/50",
        {
          'opacity-70': !isActiveStage && 
                         !isStageCompleted(session.status, stageDefinition.slug) && 
                         getStageNumber(stageDefinition.slug) > getStageNumber(session.status.replace('pending_', '').replace('_complete', '') as DialecticStage)
        }
      )}
      onClick={handleCardClick} // Use new handler
      role="tab"
      aria-selected={isActiveStage}
      aria-controls={`stage-content-${stageDefinition.slug}`}
      tabIndex={isActiveStage ? 0 : -1}
    >
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-base text-center">{stageDefinition.displayName}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-center items-center text-center px-2 pb-2">
        {!isActiveStage && isStageCompleted(session.status, stageDefinition.slug) && (
            <p className="text-xs text-green-600">Completed</p>
        )}
        {!isActiveStage && !isStageCompleted(session.status, stageDefinition.slug) && session.status.startsWith(stageDefinition.slug) && (
            <p className="text-xs text-orange-500">In Progress...</p>
        )}
        {isActiveStage && prerequisiteWarning && (
          <Alert variant="default" className="text-xs p-2 mb-1 border-yellow-500/50 text-yellow-700 dark:border-yellow-500/60 dark:text-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/30">
            <AlertDescription>{prerequisiteWarning}</AlertDescription>
          </Alert>
        )}
        {isActiveStage && !seedPromptExists && !seedPromptLoading && !seedPromptCacheEntry?.error && (
            <Alert variant="default" className="text-xs p-2 mb-1 border-blue-500/50 text-blue-700 dark:border-blue-500/60 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/30">
                <AlertDescription>Seed prompt for this stage is missing.</AlertDescription>
            </Alert>
        )}
        {isActiveStage && seedPromptCacheEntry?.error && (
             <Alert variant="destructive" className="text-xs p-2 mb-1">
                <AlertTitle className="text-xs">Prompt Load Error</AlertTitle>
                <AlertDescription>{seedPromptCacheEntry.error}</AlertDescription>
            </Alert>
        )}
         {isActiveStage && seedPromptLoading && (
            <p className="text-xs text-muted-foreground">Loading seed prompt...</p>
        )}
      </CardContent>
      {showGenerateButton && (
        <CardFooter className="p-2 border-t">
          <Button 
            size="sm" 
            className="w-full text-xs" 
            onClick={handleGenerateClick} 
            disabled={generateButtonDisabled}
          >
            {isGenerating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            {isGenerating ? 'Generating...' : `Generate ${stageDefinition.displayName}`}
          </Button>
        </CardFooter>
      )}
      {isActiveStage && generateError && (
        <Alert variant="destructive" className="text-xs m-2 p-2">
            <AlertTitle className="text-xs mb-0.5">Generation Error</AlertTitle>
            <AlertDescription>{generateError.message || 'An unknown error occurred.'}</AlertDescription>
        </Alert>
      )}
    </Card>
  );
}; 