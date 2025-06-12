import React, { useEffect } from 'react';
import { useDialecticStore, selectActiveContextProjectId, selectActiveContextSessionId } from '@paynless/store';
import { DialecticProject, DialecticSession } from '@paynless/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';

interface SessionInfoCardProps {
  // Props removed: projectId and sessionId
}

export const SessionInfoCard: React.FC<SessionInfoCardProps> = () => {
  // Get projectId and sessionId from the store
  const projectIdFromStore = useDialecticStore(selectActiveContextProjectId);
  const sessionIdFromStore = useDialecticStore(selectActiveContextSessionId);

  // Selectors from the store, now using IDs from the store context
  const project = useDialecticStore(state => 
    projectIdFromStore && state.currentProjectDetail?.id === projectIdFromStore 
      ? state.currentProjectDetail 
      : null
  ) as DialecticProject | null;
  
  const session = project?.dialectic_sessions?.find(s => s.id === sessionIdFromStore) as DialecticSession | undefined;

  const fetchInitialPromptContent = useDialecticStore(state => state.fetchInitialPromptContent);
  
  // Determine the prompt path from the session object's current_stage_seed_prompt
  const iterationUserPromptPath = session?.current_stage_seed_prompt;

  const iterationPromptCacheEntry = useDialecticStore(state => {
    // Only attempt to get from cache if iterationUserPromptPath is valid
    if (!iterationUserPromptPath) return undefined;
    return state.contributionContentCache?.[iterationUserPromptPath];
  });

  useEffect(() => {
    // Only fetch if a valid iterationUserPromptPath is available from the session
    if (iterationUserPromptPath && project && session) {
      // Check cache: if not present, or present but not loading, no content, and no error, then fetch.
      if (!iterationPromptCacheEntry || (!iterationPromptCacheEntry.content && !iterationPromptCacheEntry.isLoading && !iterationPromptCacheEntry.error)) {
        fetchInitialPromptContent(iterationUserPromptPath);
      }
    }
  }, [project, session, fetchInitialPromptContent, iterationPromptCacheEntry, iterationUserPromptPath]); // Added iterationUserPromptPath to dependency array

  // Loading/error states before project/session are available from store context
  if (!projectIdFromStore || !sessionIdFromStore) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle><Skeleton className="h-6 w-1/2" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-3/4" /></CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  // This loading state can be further refined, e.g. show skeleton if project/session is being fetched by parent
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

  // If no specific prompt path is defined for the current stage/iteration in the session
  if (!iterationUserPromptPath) {
    return (
      <Card className="mb-6" aria-labelledby={`session-info-title-${session.id}-no-prompt`}>
        <CardHeader>
          <CardTitle id={`session-info-title-${session.id}-no-prompt`} className="text-xl">
            {session.session_description || 'Session Information'}
          </CardTitle>
          <CardDescription>
            Project: {project.project_name} | 
            Status: <Badge variant={session.status?.includes('error') ? 'destructive' : 'secondary'}>{session.status || 'N/A'}</Badge> | 
            Iteration: {session.current_iteration} (of {session.iteration_count})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mt-2">
            <h4 className="text-sm font-semibold text-muted-foreground mb-1">Iteration User Prompt:</h4>
            <p className="text-sm text-muted-foreground italic">No specific prompt is configured for this iteration/stage.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  

  return (
    <Card className="mb-6" aria-labelledby={`session-info-title-${session.id}`}>
      <CardHeader>
        <CardTitle id={`session-info-title-${session.id}`} className="text-xl">
          {session.session_description || 'Session Information'}
        </CardTitle>
        <CardDescription>
          Project: {project.project_name} | 
          Status: <Badge variant={session.status?.includes('error') ? 'destructive' : 'secondary'}>{session.status || 'N/A'}</Badge> | 
          Iteration: {session.current_iteration} (of {session.iteration_count})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-2">
          <h4 className="text-sm font-semibold text-muted-foreground mb-1">Iteration User Prompt:</h4>
          {iterationPromptCacheEntry?.isLoading && (
            <div data-testid="iteration-prompt-loading">
              <Skeleton className="h-4 w-1/4 mb-2" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
          {iterationPromptCacheEntry?.error && (
            <Alert variant="destructive" className="mt-2">
              <AlertTitle>Error Loading Prompt</AlertTitle>
              <AlertDescription>{iterationPromptCacheEntry.error}</AlertDescription>
            </Alert>
          )}
          {iterationPromptCacheEntry && !iterationPromptCacheEntry.isLoading && !iterationPromptCacheEntry.error && (
            iterationPromptCacheEntry.content ? (
              <div className="p-2 border rounded-md bg-muted/30 max-h-48 overflow-y-auto">
                <MarkdownRenderer content={iterationPromptCacheEntry.content} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No specific prompt was set for this iteration.</p>
            )
          )}
          {/* Render this part only if iterationUserPromptPath was valid to begin with */}
          {iterationUserPromptPath && !iterationPromptCacheEntry && !session?.current_stage_seed_prompt && (
             <p className="text-sm text-muted-foreground italic">Loading iteration prompt...</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}; 