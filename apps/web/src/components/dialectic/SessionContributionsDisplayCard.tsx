import React, { useState, useMemo, useEffect } from 'react';
import { 
  useDialecticStore, 
  selectActiveContextSessionId, 
  selectActiveContextStage 
} from '@paynless/store';
import { DialecticContribution, ApiError, DialecticSession, DialecticStage } from '@paynless/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { GenerateContributionButton } from './GenerateContributionButton';

interface SessionContributionsDisplayCardProps {
  session: DialecticSession | undefined;
  activeStage: DialecticStage | null;
}

interface StageResponse {
  originalContributionId: string;
  responseText: string;
}

export const SessionContributionsDisplayCard: React.FC<SessionContributionsDisplayCardProps> = ({ session, activeStage }) => {
  const project = useDialecticStore(state => state.currentProjectDetail);
  const sessionIdFromStore = useDialecticStore(selectActiveContextSessionId);
  const activeStageFromStore = useDialecticStore(selectActiveContextStage);

  const submitStageResponses = useDialecticStore(state => state.submitStageResponses);
  const isSubmitting = useDialecticStore(state => state.isSubmittingStageResponses);
  const submissionError = useDialecticStore(state => state.submitStageResponsesError as ApiError | null);
  const resetSubmitError = useDialecticStore(state => state.resetSubmitStageResponsesError);

  const [stageResponses, setStageResponses] = useState<Record<string, string>>({});
  const [submissionSuccessMessage, setSubmissionSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setStageResponses({});
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }
  }, [activeStage, resetSubmitError, submissionError]);

  const displayedContributions = useMemo(() => {
    if (!session?.dialectic_contributions || !session.iteration_count || !activeStage) return [];

    const contributionsForStageAndIteration = session.dialectic_contributions.filter(
      c => c.stage.slug === activeStage.slug && c.iteration_number === session.iteration_count
    );

    const latestEditsMap = new Map<string, DialecticContribution>();

    for (const contrib of contributionsForStageAndIteration) {
      const originalId = contrib.original_model_contribution_id || contrib.id;
      const existing = latestEditsMap.get(originalId);
      if (!existing || contrib.edit_version > existing.edit_version) {
        latestEditsMap.set(originalId, contrib);
      } else if (contrib.edit_version === existing.edit_version && contrib.is_latest_edit) {
        latestEditsMap.set(originalId, contrib);
      }
    }
    for (const contrib of contributionsForStageAndIteration) {
        const originalId = contrib.original_model_contribution_id || contrib.id;
        if (!latestEditsMap.has(originalId) || contrib.edit_version > (latestEditsMap.get(originalId)?.edit_version || 0)) {
            latestEditsMap.set(originalId, contrib);
        } else if (contrib.edit_version === (latestEditsMap.get(originalId)?.edit_version || 0) && contrib.id === originalId && !latestEditsMap.get(originalId)?.is_latest_edit) {
            const currentDisplayable = latestEditsMap.get(originalId);
            if(currentDisplayable && !currentDisplayable.is_latest_edit && contrib.is_latest_edit){
                 latestEditsMap.set(originalId, contrib);
            }
        }
    }
    const finalContributions: DialecticContribution[] = [];
    const originalIdsWithLatestEdit = new Set<string>();

    contributionsForStageAndIteration.forEach(c => {
        if (c.is_latest_edit) {
            originalIdsWithLatestEdit.add(c.original_model_contribution_id || c.id);
        }
    });

    latestEditsMap.forEach((value, key) => {
        if(originalIdsWithLatestEdit.has(key)){
            if(value.is_latest_edit) finalContributions.push(value);
        } else {
            finalContributions.push(value);
        }
    });
    
    return finalContributions.sort((a,b) => (a.model_name || '').localeCompare(b.model_name || ''));

  }, [session, activeStage]);

  const handleResponseChange = (originalModelContributionId: string, responseText: string) => {
    setStageResponses(prev => ({ ...prev, [originalModelContributionId]: responseText }));
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }
  };

  const handleSubmitResponses = async () => {
    if (!session || !session.iteration_count || !activeStage) return;
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }

    const responsesToSubmit: StageResponse[] = Object.entries(stageResponses)
      .filter(([, text]) => text.trim() !== '')
      .map(([originalContributionId, responseText]) => ({ originalContributionId, responseText }));

    if (responsesToSubmit.length === 0 && !Object.values(stageResponses).some(text => text.trim() !== '')) {
        toast.info("No responses to submit", { description: "Please provide feedback or responses to one or more contributions before submitting." });
        return;
    }

    try {
      const result = await submitStageResponses({
        sessionId: session.id,
        currentIterationNumber: session.iteration_count,
        responses: responsesToSubmit.map(r => ({
          originalModelContributionId: r.originalContributionId,
          responseText: r.responseText,
        })),
        projectId: session.project_id,
        stageSlug: activeStage.slug,
      });
      if ((result as unknown as { success: boolean })?.success || !(result as unknown as { error: ApiError })?.error) {
        setSubmissionSuccessMessage('Responses submitted successfully. The next stage is being prepared.');
        toast.success("Responses Submitted", { description: "The next stage is being prepared." });
        setStageResponses({});
      } else {
        const errorPayload = result as unknown as { error: ApiError };
        if (errorPayload?.error?.message) {
             toast.error("Submission Failed", { description: errorPayload.error.message });
        } else {
            toast.error("Submission Failed", { description: "An unexpected error occurred." });
        }
      }
    } catch (e: unknown) {
      console.error("Error submitting stage responses:", e);
      toast.error("Submission Error", { description: (e as Error).message || "An unexpected client-side error occurred." });
    }
  };

  const activeStageDisplayName =
    activeStage?.display_name || 'Current Stage';

  const canSubmit = Object.values(stageResponses).some(text => text.trim() !== '') && !isSubmitting;

  if (!session || !activeStage) {
    return (
        <Card className="mt-4">
            <CardHeader><CardTitle>Loading Contributions...</CardTitle></CardHeader>
            <CardContent><p>Waiting for active session and stage context...</p></CardContent>
        </Card>
    );
  }

  if (!session) {
    return <Card className="mt-4"><CardContent><p>Loading session details for contributions...</p></CardContent></Card>;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Contributions for: {activeStageDisplayName}</CardTitle>
        <CardDescription>
          Review the AI-generated contributions for this stage. 
          You can directly edit them for minor fixes or provide more substantial feedback in the response areas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {displayedContributions.length === 0 && (
          <>
            <p className="text-muted-foreground italic">No contributions found for this stage yet.</p>
            <GenerateContributionButton
              sessionId={session.id}
              projectId={session.project_id}
              currentStage={activeStage}
              currentStageFriendlyName={activeStageDisplayName}
            />
          </>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedContributions.map(contrib => (
            <GeneratedContributionCard
              key={contrib.id}
              contributionId={contrib.id}
              originalModelContributionIdForResponse={contrib.original_model_contribution_id || contrib.id}
              initialResponseText={stageResponses[contrib.original_model_contribution_id || contrib.id] || ''}
              onResponseChange={handleResponseChange}
            />
          ))}
        </div>
      </CardContent>
      {displayedContributions.length > 0 && (
        <CardFooter className="flex-col items-stretch gap-3 pt-4 border-t">
            {submissionError && (
                <Alert variant="destructive">
                    <AlertTitle>Submission Error</AlertTitle>
                    <AlertDescription>{submissionError.message || 'An unknown error occurred while submitting.'}</AlertDescription>
                </Alert>
            )}
            {submissionSuccessMessage && (
                <Alert variant="default" className="border-green-500/50 text-green-700 dark:border-green-500/60 dark:text-green-400 bg-green-50/50 dark:bg-green-900/30">
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{submissionSuccessMessage}</AlertDescription>
                </Alert>
            )}
          <Button 
            onClick={handleSubmitResponses} 
            disabled={!canSubmit || isSubmitting}
            className="w-full"
          >
            {isSubmitting && <Loader2 data-testid="loader" className="mr-2 h-4 w-4 animate-spin" />} 
            {isSubmitting ? 'Submitting...' : `Submit Responses for ${activeStageDisplayName} & Prepare Next Stage`}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}; 