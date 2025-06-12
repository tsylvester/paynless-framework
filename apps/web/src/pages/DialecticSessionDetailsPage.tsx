import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  useDialecticStore,
  selectActiveContextStageSlug,
} from '@paynless/store';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DialecticSession, DialecticProject, DialecticStage } from '@paynless/types';

// New Component Imports
import { SessionInfoCard } from '../components/dialectic/SessionInfoCard';
import { StageTabCard } from '../components/dialectic/StageTabCard';
import { SessionContributionsDisplayCard } from '../components/dialectic/SessionContributionsDisplayCard';
import { DIALECTIC_STAGES, getStageSlugFromStatus } from '@/config/dialecticConfig';

export const DialecticSessionDetailsPage: React.FC = () => {
  const { projectId: projectIdFromParams, sessionId: sessionIdFromParams } = useParams<{ projectId: string; sessionId: string }>();
  
  // Actions from store
  const fetchDialecticProjectDetailsAction = useDialecticStore(state => state.fetchDialecticProjectDetails);
  const setActiveContextProjectIdAction = useDialecticStore(state => state.setActiveContextProjectId);
  const setActiveContextSessionIdAction = useDialecticStore(state => state.setActiveContextSessionId);
  const setActiveContextStageSlugAction = useDialecticStore(state => state.setActiveContextStageSlug);

  // Selectors from store
  const projectFromStore = useDialecticStore(state => 
    (state.currentProjectDetail?.id === projectIdFromParams) ? state.currentProjectDetail : null
  ) as DialecticProject | null;
  
  const isLoadingProject = useDialecticStore(state => state.isLoadingProjectDetail);
  const projectError = useDialecticStore(state => state.projectDetailError);
  const activeStageSlugFromStore = useDialecticStore(selectActiveContextStageSlug);
  
  console.log('[DialecticSessionDetailsPage] Render - activeStageSlugFromStore:', activeStageSlugFromStore, 'projectIdFromParams:', projectIdFromParams, 'sessionIdFromParams:', sessionIdFromParams);

  const session = projectFromStore?.dialectic_sessions?.find((s: DialecticSession) => s.id === sessionIdFromParams);

  useEffect(() => {
    if (projectIdFromParams && (!projectFromStore || projectFromStore.id !== projectIdFromParams) && !isLoadingProject) {
      console.log('[DialecticSessionDetailsPage] Effect1: Fetching project details for', projectIdFromParams);
      fetchDialecticProjectDetailsAction(projectIdFromParams);
    }
  }, [fetchDialecticProjectDetailsAction, projectIdFromParams, projectFromStore, isLoadingProject]);

  useEffect(() => {
    console.log('[DialecticSessionDetailsPage] Effect2: Running. projectId:', projectIdFromParams, 'sessionId:', sessionIdFromParams, 'session status:', session?.status, 'projectFromStore available:', !!projectFromStore, 'isLoadingProject:', isLoadingProject);
    if (projectIdFromParams) {
      console.log('[DialecticSessionDetailsPage] Effect2: Setting active context projectId:', projectIdFromParams);
      setActiveContextProjectIdAction(projectIdFromParams);
    }
    if (sessionIdFromParams) {
      console.log('[DialecticSessionDetailsPage] Effect2: Setting active context sessionId:', sessionIdFromParams);
      setActiveContextSessionIdAction(sessionIdFromParams);
    }

    if (session?.status) {
      const initialSlug = getStageSlugFromStatus(session.status);
      console.log('[DialecticSessionDetailsPage] Effect2: Session status available. Derived initialSlug:', initialSlug, 'from session.status:', session.status, '. Calling setActiveContextStageSlugAction.');
      setActiveContextStageSlugAction(initialSlug as DialecticStage);
    } else if (!session && projectFromStore && !isLoadingProject) {
      console.log('[DialecticSessionDetailsPage] Effect2: No session found but project loaded. Setting active slug to null.');
      setActiveContextStageSlugAction(null);
    } else {
      console.log('[DialecticSessionDetailsPage] Effect2: Conditions for setting slug not met or session/project not ready. session:', !!session, 'projectFromStore:', !!projectFromStore, 'isLoadingProject:', isLoadingProject);
    }
    return () => {
      console.log('[DialecticSessionDetailsPage] Effect2: Cleanup. Setting context IDs and slug to null. Current projectId:', projectIdFromParams, 'sessionId:', sessionIdFromParams);
      setActiveContextProjectIdAction(null);
      setActiveContextSessionIdAction(null);
      setActiveContextStageSlugAction(null);
    }
  }, [
    projectIdFromParams, 
    sessionIdFromParams, 
    session,
    projectFromStore, 
    isLoadingProject,
    setActiveContextProjectIdAction,
    setActiveContextSessionIdAction,
    setActiveContextStageSlugAction
  ]);

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
  
  if (!projectFromStore) {
    return (
      <Alert className="m-4">
        <AlertTitle>Project Not Available</AlertTitle>
        <AlertDescription>
            Project details are currently unavailable. Please ensure the Project ID '{projectIdFromParams}' is correct or try refreshing.
        </AlertDescription>
      </Alert>
    );
  }
  
  if (!session) {
     return (
        <Alert className="m-4">
            <AlertTitle>Session Data Unavailable</AlertTitle>
            <AlertDescription>Session data is not available within the loaded project. Please check data integrity or try refreshing.</AlertDescription>
        </Alert>
     );
  }

  return (
    <div className="container mx-auto p-4" role="main">
      <SessionInfoCard />

      <div className="flex space-x-2 my-4 overflow-x-auto pb-2" role="tablist" aria-label="Dialectic Stages">
        {DIALECTIC_STAGES.map(stageDef => (
          <StageTabCard
            key={stageDef.slug}
            stageDefinition={stageDef}
          />
        ))}
      </div>

      {activeStageSlugFromStore && (
        <SessionContributionsDisplayCard />
      )}

      {!activeStageSlugFromStore && DIALECTIC_STAGES.length > 0 && !isLoadingProject && (
        <Alert className="mt-4">
          <AlertTitle>Select a Stage</AlertTitle>
          <AlertDescription>Please select a dialectic stage to view its contributions.</AlertDescription>
        </Alert>
      )}
      {DIALECTIC_STAGES.length === 0 && (
         <Alert variant="destructive" className="mt-4">
          <AlertTitle>Configuration Error</AlertTitle>
          <AlertDescription>Dialectic stages are not configured. Please check the application setup.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}; 