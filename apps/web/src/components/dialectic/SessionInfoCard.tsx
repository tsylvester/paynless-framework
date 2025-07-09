import React, { useEffect, useMemo, useState } from 'react';
import {
  useDialecticStore,
  selectIsStageReadyForSessionIteration,
  selectContributionGenerationStatus,
  selectGenerateContributionsError,
} from '@paynless/store';
import { DialecticProject, DialecticSession, DialecticStage, ContributionGenerationStatus } from '@paynless/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { Loader2, ArrowLeft, ChevronDown } from 'lucide-react';
import { WalletSelector } from '../ai/WalletSelector';
import { ChatContextSelector } from '../ai/ChatContextSelector';
import { AIModelSelector } from './AIModelSelector';
import { GenerateContributionButton } from './GenerateContributionButton';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface SessionInfoCardProps {
  // REMOVED: session?: DialecticSession;
}

export const SessionInfoCard: React.FC<SessionInfoCardProps> = (/* REMOVED: { session } */) => {
  const project: DialecticProject | null = useDialecticStore(state => state.currentProjectDetail);
  const session: DialecticSession | null = useDialecticStore(state => state.activeSessionDetail);
  const activeStage: DialecticStage | null = useDialecticStore(state => state.activeContextStage);
  const fetchInitialPromptContent = useDialecticStore(state => state.fetchInitialPromptContent);
  const contributionGenerationStatus: ContributionGenerationStatus = useDialecticStore(selectContributionGenerationStatus);
  const generateContributionsError = useDialecticStore(selectGenerateContributionsError);
  const navigate = useNavigate();
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const isStageReady = useDialecticStore(state => {
    if (!project || !session || !activeStage) {
      return false;
    }
    return selectIsStageReadyForSessionIteration(
      state,
      project.id,
      session.id,
      activeStage.slug,
      session.iteration_count
    );
  });

  const iterationUserPromptResourceId = useMemo(() => {
    if (!project?.id || !session?.id || !activeStage?.slug) return null;
    const projectResources = project.resources || [];
    
    const seedPromptResource = projectResources.find(r => {
      if (!r.resource_description) return false;
      
      if (typeof r.resource_description === 'string' && r.resource_description.trim().startsWith('{') && r.resource_description.trim().endsWith('}')) {
        try {
          const desc = JSON.parse(r.resource_description);
          return desc.type === 'seed_prompt' &&
                 desc.session_id === session.id &&
                 desc.stage_slug === activeStage.slug &&
                 desc.iteration === session.iteration_count;
        } catch (e) {
          return false;
        }
      } else {
        return false;
      }
    });
    return seedPromptResource?.id;
  }, [project?.id, project?.resources, session?.id, session?.iteration_count, activeStage?.slug]);

  const iterationPromptCacheEntry = useDialecticStore(state => {
    if (!iterationUserPromptResourceId) return undefined;
    return state.initialPromptContentCache?.[iterationUserPromptResourceId];
  });

  useEffect(() => {
    if (activeStage && isStageReady && iterationUserPromptResourceId && 
        (!iterationPromptCacheEntry || (!iterationPromptCacheEntry.content && !iterationPromptCacheEntry.isLoading && !iterationPromptCacheEntry.error))) {
      fetchInitialPromptContent(iterationUserPromptResourceId);
    }
  }, [activeStage, isStageReady, iterationUserPromptResourceId, iterationPromptCacheEntry, fetchInitialPromptContent]);

  if (!project || !session) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Loading Session Information...</CardTitle>
          <CardDescription>Waiting for project and session data from context...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6" aria-labelledby={`session-info-title-${session.id}`}>
      <CardHeader>
        <CardTitle data-testid={`session-info-title-${session.id}`} className="text-xl flex flex-col items-start gap-2">
          <div className="w-full flex items-center flex-wrap gap-x-4 gap-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => project && navigate(`/dialectic/${project.id}`)}
              disabled={!project}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sessions
            </Button>
            <div className="flex items-center gap-2">
              {session.session_description || 'Session Information'} |
              <Badge variant={session.status?.includes('error') ? 'destructive' : 'secondary'}>{session.status || 'N/A'}</Badge> |
              Iteration: {session.iteration_count}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" className="flex items-center gap-1" onClick={() => setIsPromptOpen(p => !p)}>
              Review Stage Seed Prompt
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isPromptOpen ? 'rotate-180' : ''}`} />
            </Button> |           
            <ChatContextSelector /> |
            <WalletSelector /> |
            <AIModelSelector /> |
            <GenerateContributionButton />

          </div>
        </CardTitle>
        {(contributionGenerationStatus === 'initiating' || contributionGenerationStatus === 'generating') && (
          <div className="flex items-center text-sm text-muted-foreground mt-2" data-testid="generating-contributions-indicator">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating contributions, please wait...
          </div>
        )}
        {contributionGenerationStatus === 'failed' && generateContributionsError && (
          <Alert variant="destructive" className="mt-2" data-testid="generate-contributions-error">
            <AlertTitle>Error Generating Contributions</AlertTitle>
            <AlertDescription>{generateContributionsError.message}</AlertDescription>
          </Alert>
        )}
      </CardHeader>
      {isPromptOpen && (
        <CardContent>
          {activeStage && !isStageReady && (
            <Alert className="mb-4">
              <AlertTitle>Stage Not Ready</AlertTitle>
              <AlertDescription>
                Stage not ready. Please complete prior stages or ensure the seed prompt for this stage and iteration is available.
              </AlertDescription>
            </Alert>
          )}

          {activeStage && isStageReady && (
            <div className="mt-2">
              {iterationPromptCacheEntry?.isLoading && (
                <div data-testid="iteration-prompt-loading">
                  <Skeleton className="h-4 w-1/4 mb-2" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
              {iterationPromptCacheEntry?.error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTitle>Error Loading Prompt</AlertTitle>
                  <AlertDescription>{iterationPromptCacheEntry.error.message}</AlertDescription>
                </Alert>
              )}
              {iterationPromptCacheEntry && !iterationPromptCacheEntry.isLoading && !iterationPromptCacheEntry.error && (
                iterationPromptCacheEntry.content ? (
                  <div className="p-2 border rounded-md bg-muted/30">
                    <MarkdownRenderer content={iterationPromptCacheEntry.content} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No specific prompt was set for this iteration.</p>
                )
              )}
              {!iterationUserPromptResourceId && (
                <p className="text-sm text-muted-foreground italic">No specific prompt is configured for this iteration/stage.</p>
              )}
              {iterationUserPromptResourceId && !iterationPromptCacheEntry?.content && !iterationPromptCacheEntry?.isLoading && !iterationPromptCacheEntry?.error && (
                <p className="text-sm text-muted-foreground italic">Loading iteration prompt...</p>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}; 