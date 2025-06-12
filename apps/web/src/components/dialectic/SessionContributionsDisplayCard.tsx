import React, { useState, useMemo, useEffect } from 'react';
import { 
  useDialecticStore, 
  selectActiveContextSessionId, 
  selectActiveContextStageSlug 
} from '@paynless/store';
import { DialecticSession, DialecticContribution, ApiError } from '@paynless/types';
import { DIALECTIC_STAGES } from '@/config/dialecticConfig';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { GenerateContributionButton } from './GenerateContributionButton';

interface SessionContributionsDisplayCardProps {
  // Props removed: sessionId, activeStageSlug
}

interface StageResponse {
  originalContributionId: string;
  responseText: string;
}

export const SessionContributionsDisplayCard: React.FC<SessionContributionsDisplayCardProps> = () => {
  // Get context from store
  const sessionIdFromStore = useDialecticStore(selectActiveContextSessionId);
  const activeStageSlugFromStore = useDialecticStore(selectActiveContextStageSlug);

  const session = useDialecticStore(state => 
    sessionIdFromStore ? state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionIdFromStore) : undefined
  ) as DialecticSession | undefined;

  const submitStageResponsesAndPrepareNextSeed = useDialecticStore(state => state.submitStageResponsesAndPrepareNextSeed);
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
  }, [activeStageSlugFromStore, resetSubmitError, submissionError]); // Depend on activeStageSlugFromStore

  const displayedContributions = useMemo(() => {
    if (!session?.dialectic_contributions || !session.current_iteration || !activeStageSlugFromStore) return [];

    const contributionsForStageAndIteration = session.dialectic_contributions.filter(
      c => c.stage === activeStageSlugFromStore && c.iteration_number === session.current_iteration
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

  }, [session, activeStageSlugFromStore]); // Depend on session (derived from sessionIdFromStore) and activeStageSlugFromStore

  const handleResponseChange = (originalModelContributionId: string, responseText: string) => {
    setStageResponses(prev => ({ ...prev, [originalModelContributionId]: responseText }));
    setSubmissionSuccessMessage(null);
    if (submissionError) {
        resetSubmitError?.();
    }
  };

  const handleSubmitResponses = async () => {
    if (!session || !session.current_iteration || !sessionIdFromStore || !activeStageSlugFromStore) return;
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
      const result = await submitStageResponsesAndPrepareNextSeed({
        sessionId: sessionIdFromStore, // Use from store
        currentIterationNumber: session.current_iteration,
        responses: responsesToSubmit.map(r => ({
          originalModelContributionId: r.originalContributionId,
          responseText: r.responseText,
        })),
        projectId: session.project_id,
        stageSlug: activeStageSlugFromStore,
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
    DIALECTIC_STAGES.find(s => s.slug === activeStageSlugFromStore)?.displayName || activeStageSlugFromStore || 'Current Stage';

  const canSubmit = Object.values(stageResponses).some(text => text.trim() !== '') && !isSubmitting;

  if (!sessionIdFromStore || !activeStageSlugFromStore) {
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
            sessionId={sessionIdFromStore}
            projectId={session.project_id}
            currentStage={activeStageSlugFromStore}
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
                // Changed variant to default as success is not standard for ShadCN Alert
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
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
            {isSubmitting ? 'Submitting...' : `Submit Responses for ${activeStageDisplayName} & Prepare Next Stage`}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}; 