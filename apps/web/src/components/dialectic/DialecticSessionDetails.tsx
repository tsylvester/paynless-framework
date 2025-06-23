import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import {
  selectCurrentProjectDetail,
  selectIsLoadingProjectDetail,
  selectProjectDetailError,
} from '@paynless/store';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';
import { DialecticContribution, DialecticSession, DialecticStore } from '@paynless/types';
import { StageTabCard } from './StageTabCard';
import { SessionInfoCard } from './SessionInfoCard';
import { SessionContributionsDisplayCard } from './SessionContributionsDisplayCard'

export const DialecticSessionDetails: React.FC = () => {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();

  const projectDetail = useDialecticStore(selectCurrentProjectDetail);
  const isLoading = useDialecticStore(selectIsLoadingProjectDetail);
  const error = useDialecticStore(selectProjectDetailError);
  const fetchProjectDetails = useDialecticStore((s: DialecticStore) => s.fetchDialecticProjectDetails);
  const currentProcessTemplate = useDialecticStore(s => s.currentProcessTemplate);
  const activeContextStage = useDialecticStore(s => s.activeContextStage);

  useEffect(() => {
    if (projectId && (!projectDetail || projectDetail.id !== projectId)) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, projectDetail, fetchProjectDetails]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error Fetching Project Details</AlertTitle>
        <AlertDescription>{error.message || 'Could not load project details.'}</AlertDescription>
      </Alert>
    );
  }

  if (!projectDetail) {
    return <div className="p-4">Project details not found or not loaded yet.</div>;
  }

  const session = projectDetail.dialectic_sessions?.find((s: DialecticSession) => s.id === sessionId);

  if (!session) {
    return <div className="p-4">Session not found in this project.</div>;
  }

  if (!currentProcessTemplate?.stages) {
    return (
        <Alert variant="destructive" className="m-4">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription>Dialectic stages are not configured. Please check the application setup.</AlertDescription>
        </Alert>
    );
  }
  
  const stageOrder = currentProcessTemplate.stages;

  const contributionsByStage: Record<string, DialecticContribution[]> = {};
  session.dialectic_contributions?.forEach((contrib: DialecticContribution) => {
    const stageSlug = contrib.stage?.slug;
    if (stageSlug) {
      if (!contributionsByStage[stageSlug]) {
        contributionsByStage[stageSlug] = [];
      }
      contributionsByStage[stageSlug].push(contrib);
    }
  });

  return (
    <div className="p-4 space-y-6">
      <SessionInfoCard />

      <div className="flex space-x-2 overflow-x-auto pb-4">
        {stageOrder.map((stage) => (
          <StageTabCard
            key={stage.id}
            stage={stage}
            isActiveStage={activeContextStage?.id === stage.id}
            onCardClick={() => {}}
          />
        ))}
      </div>
      
      {activeContextStage && (
        <SessionContributionsDisplayCard />
      )}

      {Object.keys(contributionsByStage).length === 0 && (
        <p>No contributions found for this session yet.</p>
      )}
    </div>
  );
}; 