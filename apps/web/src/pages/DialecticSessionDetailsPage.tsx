import React, { useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DialecticSession, DialecticProject, DialecticStage } from '@paynless/types';

// New Component Imports
import { SessionInfoCard } from '../components/dialectic/SessionInfoCard';
import { StageTabCard } from '../components/dialectic/StageTabCard';
import { SessionContributionsDisplayCard } from '../components/dialectic/SessionContributionsDisplayCard';

export const DialecticSessionDetailsPage: React.FC = () => {
  const { projectId: projectIdFromParams, sessionId: sessionIdFromParams } = useParams<{ projectId: string; sessionId: string }>();
  
  // Actions from store
  const fetchDialecticProjectDetailsAction = useDialecticStore(state => state.fetchDialecticProjectDetails);
  const setActiveDialecticContextAction = useDialecticStore(state => state.setActiveDialecticContext);

  // Selectors from store
  const projectFromStore = useDialecticStore(state => 
    (state.currentProjectDetail?.id === projectIdFromParams) ? state.currentProjectDetail : null
  ) as DialecticProject | null;
  
  const isLoadingProject = useDialecticStore(state => state.isLoadingProjectDetail);
  const projectError = useDialecticStore(state => state.projectDetailError);
  const activeStage = useDialecticStore(state => state.activeContextStage);
  const currentProcessTemplate = useDialecticStore(state => state.currentProcessTemplate);
  
  const session = useMemo(() => 
    projectFromStore?.dialectic_sessions?.find((s: DialecticSession) => s.id === sessionIdFromParams),
    [projectFromStore, sessionIdFromParams]
  );

  const stagesForCurrentProcess = useMemo(() => currentProcessTemplate?.stages || [], [currentProcessTemplate]);

  useEffect(() => {
    if (projectIdFromParams && (!projectFromStore || projectFromStore.id !== projectIdFromParams) && !isLoadingProject) {
      fetchDialecticProjectDetailsAction(projectIdFromParams);
    }
  }, [fetchDialecticProjectDetailsAction, projectIdFromParams, projectFromStore, isLoadingProject]);

  useEffect(() => {
    // The store now determines the active stage when the process template is loaded.
    // This effect syncs the project/session/stage from the page context into the global store context.
    setActiveDialecticContextAction({
      projectId: projectIdFromParams || null,
      sessionId: sessionIdFromParams || null,
      stage: activeStage, // Use the stage object from the store
    });
    
    return () => {
      setActiveDialecticContextAction({ projectId: null, sessionId: null, stage: null });
    };
  }, [
    projectIdFromParams,
    sessionIdFromParams,
    session,
    setActiveDialecticContextAction,
    stagesForCurrentProcess,
    activeStage,
  ]);

  const handleStageCardClick = (selectedStage: DialecticStage) => {
    setActiveDialecticContextAction({
      projectId: projectIdFromParams || null,
      sessionId: sessionIdFromParams || null,
      stage: selectedStage,
    });
  };

  if (isLoadingProject && !projectFromStore) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Loading session details...</h1>
        <Skeleton className="h-40 w-full mb-4" />
        <div className="flex space-x-2 my-4 overflow-x-auto pb-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-32" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  if (projectError) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTitle>Error Loading Project</AlertTitle>
        <AlertDescription>{projectError.message || 'Failed to load project details for the session.'}</AlertDescription>
      </Alert>
    );
  }

  if (projectFromStore && !session) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTitle>Session Not Found</AlertTitle>
        <AlertDescription>
          The session with ID '{sessionIdFromParams}' was not found in project '{projectFromStore.project_name}'.
          <Button variant="link" asChild className="ml-2">
            <Link to={`/dialectic/${projectIdFromParams}`}>Back to Project</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  
  if (!projectFromStore || !session) {
    return (
      <Alert className="m-4">
        <AlertTitle>Project or Session Not Available</AlertTitle>
        <AlertDescription>
          Project or session data is currently unavailable. Please ensure the IDs are correct or try refreshing.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto p-4" role="main">
      <SessionInfoCard session={session} />

      <div className="flex space-x-2 my-4 overflow-x-auto pb-2" role="tablist" aria-label="Dialectic Stages">
        {stagesForCurrentProcess.map(stage => (
          <StageTabCard
            key={stage.id}
            stage={stage}
            isActiveStage={activeStage?.id === stage.id}
            onCardClick={handleStageCardClick}
          />
        ))}
      </div>

      {activeStage && (
        <SessionContributionsDisplayCard session={session} activeStage={activeStage} />
      )}

      {!activeStage && stagesForCurrentProcess.length > 0 && !isLoadingProject && (
        <Alert className="mt-4">
          <AlertTitle>Select a Stage</AlertTitle>
          <AlertDescription>Please select a dialectic stage to view its contributions.</AlertDescription>
        </Alert>
      )}
      {stagesForCurrentProcess.length === 0 && !isLoadingProject && (
         <Alert variant="destructive" className="mt-4">
          <AlertTitle>Configuration Error</AlertTitle>
          <AlertDescription>Dialectic stages are not configured. Please check the application setup.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}; 