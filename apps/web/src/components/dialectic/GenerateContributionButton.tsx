import React from 'react';
import { Button } from '@/components/ui/button';
import { useDialecticStore, selectSelectedModelIds } from '@paynless/store';
import type { ApiError, DialecticContribution, DialecticStage } from '@paynless/types';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface GenerateContributionButtonProps {
  sessionId: string;
  projectId: string;
  currentStage: DialecticStage; // To determine button label and potentially future stage-specific logic
  currentStageFriendlyName: string; // e.g., "Thesis", "Antithesis"
  disabled?: boolean; // External disabled state
  onGenerationStart?: () => void;
  onGenerationComplete?: (success: boolean, data?: DialecticContribution[], error?: ApiError) => void;
  className?: string;
}

export const GenerateContributionButton: React.FC<GenerateContributionButtonProps> = ({
  sessionId,
  projectId,
  currentStage,
  currentStageFriendlyName,
  disabled = false,
  onGenerationStart,
  onGenerationComplete,
  className,
}) => {
  const {
    generateContributions,
    isGeneratingContributions,
    currentProjectDetail,
  } = useDialecticStore((state) => ({
    generateContributions: state.generateContributions,
    isGeneratingContributions: state.contributionGenerationStatus === 'generating',
    generateContributionsError: state.generateContributionsError,
    currentProjectDetail: state.currentProjectDetail,
  }));

  const currentSelectedModelIds = useDialecticStore(selectSelectedModelIds);
  const areAnyModelsSelected = currentSelectedModelIds && currentSelectedModelIds.length > 0;

  const activeSession = currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
  const contributionsForStageAndIterationExist = activeSession?.dialectic_contributions?.some(
    c => c.stage === currentStage.slug && c.iteration_number === activeSession.iteration_count
  );

  const handleClick = async () => {
    if (onGenerationStart) {
      onGenerationStart();
    }

    if (!activeSession || typeof activeSession.iteration_count !== 'number') {
      toast.error('Could not determine the current iteration number. Please ensure the session is active.');
      if (onGenerationComplete) {
        onGenerationComplete(false, undefined, { message: 'Missing session iteration data', code: 'CLIENT_SETUP_ERROR' });
      }
      return;
    }
    const currentIterationNumber = activeSession.iteration_count;

    try {
      const result = await generateContributions({ 
        sessionId, 
        projectId, 
        stageSlug: currentStage.slug, 
        iterationNumber: currentIterationNumber
      });

      if (result && !result.error && result.data) {
        toast.success(`${currentStageFriendlyName} contributions generated successfully!`);
        if (onGenerationComplete) {
          onGenerationComplete(true, result.data.contributions || []);
        }
      } else {
        const errorMessage = result?.error?.message || `Failed to generate ${currentStageFriendlyName.toLowerCase()} contributions.`;
        toast.error(errorMessage);
        if (onGenerationComplete) {
          onGenerationComplete(false, undefined, result?.error);
        }
      }
    } catch (e: unknown) {
      // This catch block is for unexpected errors in dispatching or thunk execution itself
      const errorMessage = (e as Error)?.message || `An unexpected error occurred while generating ${currentStageFriendlyName.toLowerCase()} contributions.`;
      toast.error(errorMessage);
      if (onGenerationComplete) {
        onGenerationComplete(false, undefined, { message: errorMessage, code: 'CLIENT_EXCEPTION' });
      }
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || isGeneratingContributions || !areAnyModelsSelected}
      className={className}
      data-testid={`generate-${currentStage.slug}-button`}
    >
      {isGeneratingContributions ? (
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