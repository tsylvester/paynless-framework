import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useDialecticStore, selectSelectedModelIds, selectSessionById } from '@paynless/store';
import type { ApiError, DialecticContribution, DialecticStage } from '@paynless/types';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface GenerateContributionButtonProps {
  sessionId: string;
  projectId: string;
  currentStage: DialecticStage;
  currentStageFriendlyName: string;
  disabled?: boolean;
  className?: string;
}

export const GenerateContributionButton: React.FC<GenerateContributionButtonProps> = ({
  sessionId,
  projectId,
  currentStage,
  currentStageFriendlyName,
  disabled = false,
  className,
}) => {
  const store = useDialecticStore();
  const {
    generateContributions,
    isSessionGenerating,
  } = useDialecticStore((state) => ({
    generateContributions: state.generateContributions,
    isSessionGenerating: state.generatingSessions[sessionId] || false,
  }));

  const currentSelectedModelIds = useDialecticStore(selectSelectedModelIds);
  const areAnyModelsSelected = currentSelectedModelIds && currentSelectedModelIds.length > 0;

  const activeSession = useMemo(() => selectSessionById(store, sessionId), [store, sessionId]);

  const contributionsForStageAndIterationExist = activeSession?.dialectic_contributions?.some(
    c => c.stage === currentStage.slug && c.iteration_number === activeSession.iteration_count
  );

  const handleClick = async () => {
    if (!activeSession || typeof activeSession.iteration_count !== 'number') {
      toast.error('Could not determine the current iteration number. Please ensure the session is active.');
      return;
    }
    const currentIterationNumber = activeSession.iteration_count;

    toast.success('Contribution generation started!', {
      description: 'The AI is working. We will notify you when it is complete.',
    });
    
    try {
      await generateContributions({ 
        sessionId, 
        projectId, 
        stageSlug: currentStage.slug, 
        iterationNumber: currentIterationNumber
      });
      // No need to handle success/error here anymore, as it's asynchronous.
      // The UI will update based on the generatingSessions state and notifications.
    } catch (e: unknown) {
      // This catch block is for unexpected errors in dispatching or thunk execution itself
      const errorMessage = (e as Error)?.message || `An unexpected error occurred while starting the generation process.`;
      toast.error(errorMessage);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || isSessionGenerating || !areAnyModelsSelected || currentStageFriendlyName === "Stage Not Ready"}
      className={className}
      data-testid={`generate-${currentStage.slug}-button`}
    >
      {isSessionGenerating ? (
        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
      ) : !areAnyModelsSelected ? (
        "Choose AI Models"
      ) : currentStageFriendlyName === "Stage Not Ready" ? (
        "Stage Not Ready"
      ) : contributionsForStageAndIterationExist ? (
        `Regenerate ${currentStageFriendlyName}`
      ) : (
        `Generate ${currentStageFriendlyName}`
      )}
    </Button>
  );
}; 