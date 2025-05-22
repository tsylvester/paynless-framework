import React, { useEffect } from 'react';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';
import { useChatWalletDecision } from '@/hooks/useChatWalletDecision';
import { Button } from '@/components/ui/button';

interface ChatAffordabilityIndicatorProps {
  textInput: string;
  onAffordabilityChange: (canAfford: boolean, reason?: string) => void;
}

export const ChatAffordabilityIndicator: React.FC<ChatAffordabilityIndicatorProps> = ({ textInput, onAffordabilityChange }) => {
  const estimatedTokens = useTokenEstimator(textInput);
  const { canAffordNext, lowBalanceWarning } = useAIChatAffordabilityStatus(estimatedTokens);
  const { effectiveOutcome, giveConsent, refuseConsent, isLoadingConsent, resetConsent } = useChatWalletDecision();

  useEffect(() => {
    let overallCanAfford = false;
    let affordabilityReason = "";

    switch (effectiveOutcome.outcome) {
      case 'use_personal_wallet':
      case 'use_personal_wallet_for_org':
        overallCanAfford = canAffordNext;
        break;
      case 'org_wallet_not_available_policy_org':
        overallCanAfford = false;
        affordabilityReason = "Organization wallet is not yet available for use.";
        break;
      case 'user_consent_required':
        overallCanAfford = false;
        affordabilityReason = "Consent required to use personal tokens for this organization.";
        break;
      case 'user_consent_refused':
        overallCanAfford = false;
        affordabilityReason = "Chat disabled: Consent refused for using personal tokens.";
        break;
      case 'loading':
        overallCanAfford = false;
        affordabilityReason = "Checking wallet policy...";
        break;
      case 'error':
        overallCanAfford = false;
        affordabilityReason = effectiveOutcome.message;
        break;
      default:
        overallCanAfford = false;
        affordabilityReason = "Unknown wallet status.";
    }
    onAffordabilityChange(overallCanAfford, affordabilityReason);
  }, [canAffordNext, effectiveOutcome, onAffordabilityChange]);

  if (isLoadingConsent || effectiveOutcome.outcome === 'loading') {
    return <div className="p-2 text-xs text-muted-foreground bg-muted rounded-md">Loading wallet information...</div>;
  }

  if (effectiveOutcome.outcome === 'error') {
    return <div className="p-2 text-xs text-destructive-foreground bg-destructive rounded-md">Error: {effectiveOutcome.message}</div>;
  }

  if (effectiveOutcome.outcome === 'org_wallet_not_available_policy_org') {
    return <div className="p-2 text-xs text-warning-foreground bg-warning rounded-md">Organization wallet is selected by policy, but not yet available for use. Chat will be unavailable.</div>;
  }

  if (effectiveOutcome.outcome === 'user_consent_required') {
    return (
      <div className="p-2 text-xs text-info-foreground bg-info rounded-md">
        This organization chat will use your personal tokens. Do you agree?
        <div className="mt-2 space-x-2">
          <Button size="sm" onClick={giveConsent}>Accept</Button>
          <Button size="sm" variant="outline" onClick={refuseConsent}>Decline</Button>
        </div>
      </div>
    );
  }

  if (effectiveOutcome.outcome === 'user_consent_refused') {
    return (
        <div className="p-2 text-xs text-destructive-foreground bg-destructive rounded-md">
            Chat disabled. You declined to use your personal tokens for this organization chat.
            <Button size="sm" variant="link" onClick={resetConsent} className="ml-2 p-0 h-auto text-destructive-foreground hover:text-destructive-foreground/80">
                Change preference?
            </Button>
        </div>
    );
  }

  if (effectiveOutcome.outcome === 'use_personal_wallet' || effectiveOutcome.outcome === 'use_personal_wallet_for_org') {
    if (!canAffordNext) {
      return <div className="p-2 text-xs text-destructive-foreground bg-destructive rounded-md">Insufficient balance for this message.</div>;
    }
    if (lowBalanceWarning) {
      return <div className="p-2 text-xs text-warning-foreground bg-warning rounded-md">Token balance is low.</div>;
    }
  }
  
  return null;
}; 