import React, { useEffect } from 'react';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';
import { useWalletStore, selectActiveChatWalletInfo } from '@paynless/store';
import { logger } from '@paynless/utils';

interface ChatAffordabilityIndicatorProps {
  textInput: string;
  onAffordabilityChange: (canAfford: boolean, reason?: string) => void;
}

// Placeholder for organization wallet affordability check - to be implemented properly
const checkOrgWalletAffordability = (estimatedTokens: number, balanceString: string | null): { canAfford: boolean; reason?: string } => {
  if (balanceString === null) return { canAfford: false, reason: "Organization wallet balance not available." };
  const balance = parseFloat(balanceString);
  if (isNaN(balance)) return { canAfford: false, reason: "Invalid organization wallet balance." };
  
  // TODO: Implement actual token cost calculation for org wallets if different from personal
  // For now, a simple check: can afford if balance > estimated tokens (assuming 1 token = 1 unit of balance)
  // This is a placeholder and needs proper implementation based on actual tokenomics for orgs.
  const canAfford = balance >= estimatedTokens;
  if (!canAfford) {
    return { canAfford: false, reason: "Insufficient organization tokens for this message." };
  }
  // TODO: Add low balance warning for org wallets if required
  return { canAfford: true }; 
};

export const ChatAffordabilityIndicator: React.FC<ChatAffordabilityIndicatorProps> = ({ textInput, onAffordabilityChange }) => {
  const estimatedTokens = useTokenEstimator(textInput);
  const { canAffordNext: canAffordNextWithPersonalWallet, lowBalanceWarning: lowBalanceWarningWithPersonalWallet } = useAIChatAffordabilityStatus(estimatedTokens);
  
  const activeWalletInfo = useWalletStore(selectActiveChatWalletInfo);

  useEffect(() => {
    let overallCanAfford = false;
    let affordabilityReason: string | undefined = undefined;

    logger.debug('[ChatAffordabilityIndicator] Evaluating affordability. Active Wallet Info:', { activeWalletInfo });

    if (activeWalletInfo.status === 'ok') {
      if (activeWalletInfo.type === 'personal') {
        overallCanAfford = canAffordNextWithPersonalWallet;
        if (!overallCanAfford) {
          affordabilityReason = "Insufficient personal tokens for this message.";
        } else if (lowBalanceWarningWithPersonalWallet) {
          affordabilityReason = "Personal token balance is low."; // This is a warning, still can afford
        }
      } else if (activeWalletInfo.type === 'organization') {
        const orgAffordability = checkOrgWalletAffordability(estimatedTokens, activeWalletInfo.balance);
        overallCanAfford = orgAffordability.canAfford;
        affordabilityReason = orgAffordability.reason;
      } else {
        // Should not happen if status is 'ok' and type is null
        overallCanAfford = false;
        affordabilityReason = "Affordability check error: Wallet type unclear but status is OK.";
      }
    } else {
      // Wallet is not in an 'ok' state (e.g., loading, error, consent needed)
      // Affordability cannot be determined or is blocked by other factors.
      overallCanAfford = false;
      affordabilityReason = activeWalletInfo.message || "Wallet not ready for chat or affordability check.";
      // More specific messages like consent required, etc., are handled by WalletSelector/OrgTokenConsentModal.
      // This component just signals it can't proceed with an affordability check.
    }
    
    onAffordabilityChange(overallCanAfford, affordabilityReason);

  }, [activeWalletInfo, estimatedTokens, canAffordNextWithPersonalWallet, lowBalanceWarningWithPersonalWallet, onAffordabilityChange]);

  // This component no longer renders any direct UI based on wallet status (consent prompts, errors, etc.)
  // That is handled by WalletSelector and OrgTokenConsentModal.
  // It only communicates affordability via onAffordabilityChange.
  return null;
}; 