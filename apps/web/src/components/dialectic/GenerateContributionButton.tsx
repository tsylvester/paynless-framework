import React from 'react';
import { Button } from '@/components/ui/button';
import { useDialecticStore } from '@paynless/store';
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
    // generateContributionsError, // Error is handled via toast and callback
  } = useDialecticStore((state) => ({
    generateContributions: state.generateContributions,
    isGeneratingContributions: state.isGeneratingContributions,
    generateContributionsError: state.generateContributionsError,
  }));

  const handleClick = async () => {
    if (onGenerationStart) {
      onGenerationStart();
    }

    try {
      // The thunk in the store now expects { sessionId: string; projectId: string; }
      // It handles the API call and subsequent project detail refetching.
      const result = await generateContributions({ sessionId, projectId });

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
      disabled={disabled || isGeneratingContributions}
      className={className}
      data-testid={`generate-${currentStage}-button`}
    >
      {isGeneratingContributions ? (
        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
      ) : (
        `Generate ${currentStageFriendlyName} Contributions`
      )}
    </Button>
  );
}; 