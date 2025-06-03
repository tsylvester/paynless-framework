import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import {
  selectCurrentProjectDetail,
  selectIsLoadingProjectDetail,
  selectProjectDetailError,
} from '@paynless/store';
import { ContributionCard } from './ContributionCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';
import { DialecticContribution, DialecticSession, DialecticStore } from '@paynless/types';

// Helper to get model name from session_model_id
const getModelNameFromContribution = (contribution: DialecticContribution, session: DialecticSession | undefined): string => {
  if (!session || !session.dialectic_session_models) return 'Unknown Model';
  const sessionModel = session.dialectic_session_models.find(sm => sm.id === contribution.session_model_id);
  if (!sessionModel) return 'Unknown Model';
  if (sessionModel.ai_provider) {
    return `${sessionModel.ai_provider.provider_name} ${sessionModel.ai_provider.model_name}`;
  }
  return sessionModel.model_id;
};

export const DialecticSessionDetails: React.FC = () => {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();

  const projectDetail = useDialecticStore(selectCurrentProjectDetail);
  const isLoading = useDialecticStore(selectIsLoadingProjectDetail);
  const error = useDialecticStore(selectProjectDetailError);
  const fetchProjectDetails = useDialecticStore((s: DialecticStore) => s.fetchDialecticProjectDetails);

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

  const session = projectDetail.sessions?.find((s: DialecticSession) => s.id === sessionId);

  if (!session) {
    return <div className="p-4">Session not found in this project.</div>;
  }

  const contributionsByStage: Record<string, DialecticContribution[]> = {};
  session.dialectic_contributions?.forEach((contrib: DialecticContribution) => {
    if (!contributionsByStage[contrib.stage]) {
      contributionsByStage[contrib.stage] = [];
    }
    contributionsByStage[contrib.stage].push(contrib);
  });

  const stageOrder = ['thesis', 'antithesis', 'synthesis', 'parenthesis', 'paralysis'];

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Session: {session.session_description || sessionId}</CardTitle>
          <CardDescription>
            Status: {session.status} | Iteration: {session.iteration_count}
            {session.convergence_status && ` | Convergence: ${session.convergence_status}`}
          </CardDescription>
        </CardHeader>
        {session.current_stage_seed_prompt && (
            <CardContent>
                <h4 className="text-sm font-semibold mb-1">Current Stage Seed Prompt:</h4>
                <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">
                    {session.current_stage_seed_prompt}
                </pre>
            </CardContent>
        )}
      </Card>

      {stageOrder.map((stageName) => {
        const contributions = contributionsByStage[stageName];
        if (!contributions || contributions.length === 0) return null;

        return (
          <div key={stageName}>
            <h2 className="text-2xl font-semibold mb-3 capitalize">{stageName}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {contributions.map((contrib: DialecticContribution) => (
                <ContributionCard
                  key={contrib.id}
                  contributionId={contrib.id}
                  title={`${getModelNameFromContribution(contrib, session)}`}
                />
              ))}
            </div>
          </div>
        );
      })}

      {Object.keys(contributionsByStage).length === 0 && (
        <p>No contributions found for this session yet.</p>
      )}
    </div>
  );
}; 