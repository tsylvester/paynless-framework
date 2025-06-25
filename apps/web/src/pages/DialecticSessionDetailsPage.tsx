import React, { useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DialecticSession, DialecticProject, DialecticStage, ApiError } from '@paynless/types';

// New Component Imports
import { SessionInfoCard } from '../components/dialectic/SessionInfoCard';
import { StageTabCard } from '../components/dialectic/StageTabCard';
import { SessionContributionsDisplayCard } from '../components/dialectic/SessionContributionsDisplayCard';

export const DialecticSessionDetailsPage: React.FC = () => {
  const { projectId: urlProjectId, sessionId: urlSessionId } = useParams<{ projectId: string; sessionId: string }>();
  
  // Actions from store
  const activateContextForDeepLink = useDialecticStore(state => state.activateProjectAndSessionContextForDeepLink);
  const setActiveDialecticContextAction = useDialecticStore(state => state.setActiveDialecticContext);

  // Selectors from store for context and data
  const activeContextProjectId = useDialecticStore(state => state.activeContextProjectId);
  const activeContextSessionId = useDialecticStore(state => state.activeContextSessionId);
  const activeSessionDetail = useDialecticStore(state => state.activeSessionDetail) as DialecticSession | null;
  const currentProjectDetail = useDialecticStore(state => state.currentProjectDetail) as DialecticProject | null;
  const activeContextStage = useDialecticStore(state => state.activeContextStage) as DialecticStage | null;
  const currentProcessTemplate = useDialecticStore(state => state.currentProcessTemplate);
  
  // Loading and error states from store
  const isLoadingProject = useDialecticStore(state => state.isLoadingProjectDetail);
  const projectError = useDialecticStore(state => state.projectDetailError);
  const isLoadingSession = useDialecticStore(state => state.isLoadingActiveSessionDetail);
  const sessionError = useDialecticStore(state => state.activeSessionDetailError) as ApiError | null;
  
  const stagesForCurrentProcess = useMemo(() => currentProcessTemplate?.stages || [], [currentProcessTemplate]);

  useEffect(() => {
    // Deep-link hydration logic
    if (urlProjectId && urlSessionId) {
      if (
        urlProjectId !== activeContextProjectId ||
        urlSessionId !== activeContextSessionId ||
        !activeSessionDetail ||
        activeSessionDetail.id !== urlSessionId
      ) {
        activateContextForDeepLink(urlProjectId, urlSessionId);
      }
    }
  }, [urlProjectId, urlSessionId, activeContextProjectId, activeContextSessionId, activeSessionDetail, activateContextForDeepLink]);

  useEffect(() => {
    return () => {
    };
  }, []);
  
  const handleStageCardClick = (selectedStage: DialecticStage) => {
    if (activeContextProjectId && activeContextSessionId) {
        setActiveDialecticContextAction({
            projectId: activeContextProjectId,
            sessionId: activeContextSessionId,
            stage: selectedStage,
        });
    }
  };

  const isLoading = isLoadingProject || isLoadingSession;

  if (isLoading && !activeSessionDetail && !sessionError) {
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
  
  const displayError = projectError || sessionError;
  if (displayError) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTitle>Error Loading Session</AlertTitle>
        <AlertDescription>
          {displayError.message || 'Failed to load session details.'}
          {currentProjectDetail && (
            <Button variant="link" asChild className="ml-2">
              <Link to={`/dialectic/${currentProjectDetail.id}`}>Back to Project</Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!activeSessionDetail) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTitle>Session Not Found</AlertTitle>
        <AlertDescription>
          The session data could not be loaded. Please check the URL or try navigating again.
          {activeContextProjectId && (
             <Button variant="link" asChild className="ml-2">
                <Link to={`/dialectic/${activeContextProjectId}`}>Back to Project Details</Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="container mx-auto p-4" role="main">
      <SessionInfoCard />

      <div className="flex space-x-2 my-4 overflow-x-auto pb-2" role="tablist" aria-label="Dialectic Stages">
        {stagesForCurrentProcess.map(stage => (
          <StageTabCard
            key={stage.id}
            stage={stage}
            isActiveStage={activeContextStage?.id === stage.id}
            onCardClick={handleStageCardClick}
          />
        ))}
      </div>

      {activeContextStage && activeSessionDetail && (
        <SessionContributionsDisplayCard />
      )}

      {!activeContextStage && stagesForCurrentProcess.length > 0 && !isLoading && (
        <Alert className="mt-4">
          <AlertTitle>Select a Stage</AlertTitle>
          <AlertDescription>Please select a dialectic stage to view its contributions.</AlertDescription>
        </Alert>
      )}
      {stagesForCurrentProcess.length === 0 && !isLoading && (
         <Alert variant="destructive" className="mt-4">
          <AlertTitle>Configuration Error</AlertTitle>
          <AlertDescription>Dialectic stages are not configured. Please check the application setup.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}; 