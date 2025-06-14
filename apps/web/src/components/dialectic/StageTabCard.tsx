import React, { useEffect } from 'react';
import { useDialecticStore } from '@paynless/store';
import type { DialecticSession, ContributionCacheEntry, ApiError, DialecticStage, DialecticContribution } from '@paynless/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react'; // For spinner

interface StageTabCardProps {
  stage: DialecticStage;
  isActiveStage: boolean;
}

export const StageTabCard: React.FC<StageTabCardProps> = ({ 
  stage, 
  isActiveStage,
}) => {
  // Get context from store
  const projectId = useDialecticStore(state => state.activeContextProjectId);
  const sessionId = useDialecticStore(state => state.activeContextSessionId);
  const setActiveDialecticContext = useDialecticStore(state => state.setActiveDialecticContext);
  const session = useDialecticStore(state => 
    sessionId ? state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId) : undefined
  ) as DialecticSession | undefined;

  const currentIteration = session?.iteration_count;

  const seedPromptPath = projectId && sessionId && currentIteration ? 
    `projects/${projectId}/sessions/${sessionId}/iteration_${currentIteration}/${stage.slug}/seed_prompt.md` : null;

  const seedPromptCacheEntry = useDialecticStore(state => 
    seedPromptPath ? state.contributionContentCache?.[seedPromptPath] : undefined
  ) as ContributionCacheEntry | undefined;

  const fetchSeedPromptContent = useDialecticStore(state => state.fetchInitialPromptContent);

  useEffect(() => {
    if (seedPromptPath && (!seedPromptCacheEntry || (!seedPromptCacheEntry.content && !seedPromptCacheEntry.isLoading && !seedPromptCacheEntry.error))) {
        fetchSeedPromptContent(seedPromptPath);
    }
  }, [seedPromptPath, seedPromptCacheEntry, fetchSeedPromptContent]);

  const generateContributions = useDialecticStore(state => state.generateContributions);
  const isGenerating = useDialecticStore(state => state.isGeneratingContributions);
  const generateError = useDialecticStore(state => state.generateContributionsError) as ApiError | null;

  if (!session || !projectId || !currentIteration) {
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

  const seedPromptExists = !!(seedPromptCacheEntry?.content && !seedPromptCacheEntry.isLoading && !seedPromptCacheEntry.error);
  const seedPromptLoading = seedPromptCacheEntry?.isLoading;

  const contributionsForStageExist = session.dialectic_contributions?.some((c: DialecticContribution) => c.stage.id === stage.id);
  
  const showGenerateButton = isActiveStage;
  const generateButtonDisabled = isGenerating || !seedPromptExists || seedPromptLoading;

  const handleGenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (!generateButtonDisabled && projectId && sessionId && currentIteration) {
      generateContributions({
        sessionId: sessionId,
        projectId: projectId,
        stageSlug: stage.slug,
        iterationNumber: currentIteration,
      });
    }
  };

  const handleCardClick = () => {
    setActiveDialecticContext({ projectId, sessionId, stageSlug: stage });
  };

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
      <CardContent className="flex-grow flex flex-col justify-center items-center text-center px-2 pb-2">
        {contributionsForStageExist && (
          <p className="text-xs text-green-600">Completed</p>
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
            {isGenerating ? 'Generating...' : contributionsForStageExist ? `Regenerate ${stage.display_name}`: `Generate ${stage.display_name}`}
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