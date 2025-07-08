import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  useDialecticStore,
  selectSelectedModelIds,
  selectSessionById,
  selectActiveStage,
} from '@paynless/store';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerateContributionButtonProps {
  className?: string;
}

export const GenerateContributionButton: React.FC<GenerateContributionButtonProps> = ({
  className,
}) => {
  const store = useDialecticStore();
  const {
    generateContributions,
    generatingSessions,
    currentProjectDetail,
    activeContextSessionId,
  } = useDialecticStore((state) => ({
    generateContributions: state.generateContributions,
    generatingSessions: state.generatingSessions,
    currentProjectDetail: state.currentProjectDetail,
    activeContextSessionId: state.activeContextSessionId,
  }));

  const selectedModelIds = useDialecticStore(selectSelectedModelIds);
  const activeStage = useMemo(() => selectActiveStage(store), [store]);
  const activeSession = useMemo(
    () => (activeContextSessionId ? selectSessionById(store, activeContextSessionId) : null),
    [store, activeContextSessionId]
  );

  const isSessionGenerating = activeContextSessionId ? generatingSessions[activeContextSessionId] || false : false;
  const areAnyModelsSelected = selectedModelIds && selectedModelIds.length > 0;

  // Final, correct logic based on user feedback
  const contributionsForStageAndIterationExist = useMemo(() => {
    if (!activeSession || !activeStage) return false;
    return activeSession.dialectic_contributions?.some(
      (c) => c.stage === activeStage.slug && c.iteration_number === activeSession.iteration_count
    );
  }, [activeSession, activeStage]);

  const didGenerationFail = useMemo(() => {
    if (!activeSession || !activeStage) return false;
    // As per plan (12.b), the status for a failed stage is dynamic.
    const failedStatus = `${activeStage.slug}_generation_failed`;
    return activeSession.status === failedStatus;
  }, [activeSession, activeStage]);


  const handleClick = async () => {
    if (
      !activeSession ||
      typeof activeSession.iteration_count !== 'number' ||
      !currentProjectDetail ||
      !activeStage ||
      !activeContextSessionId
    ) {
      toast.error('Could not determine the required context. Please ensure a project, session, and stage are active.');
      return;
    }
    const currentIterationNumber = activeSession.iteration_count;

    toast.success('Contribution generation started!', {
      description: 'The AI is working. We will notify you when it is complete.',
    });

    try {
      await generateContributions({
        sessionId: activeContextSessionId,
        projectId: currentProjectDetail.id,
        stageSlug: activeStage.slug,
        iterationNumber: currentIterationNumber,
      });
    } catch (e: unknown) {
      const errorMessage = (e as Error)?.message || `An unexpected error occurred while starting the generation process.`;
      toast.error(errorMessage);
    }
  };

  // The button is only disabled if essential data is missing or a generation is in progress.
  const isDisabled = isSessionGenerating || !areAnyModelsSelected || !activeStage || !activeSession;
  const friendlyName = activeStage?.display_name || '...';

  const getButtonText = () => {
    if (isSessionGenerating) return <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>;
    if (!areAnyModelsSelected) return 'Choose AI Models';
    if (!activeStage || !activeSession) return 'Stage Not Ready';
    if (didGenerationFail) return `Retry ${friendlyName}`;
    if (contributionsForStageAndIterationExist) return `Regenerate ${friendlyName}`;
    return `Generate ${friendlyName}`;
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(className, { 'animate-pulse': !isDisabled && !contributionsForStageAndIterationExist })}
      data-testid={`generate-${activeStage?.slug || 'unknown'}-button`}
    >
      {getButtonText()}
    </Button>
  );
}; 