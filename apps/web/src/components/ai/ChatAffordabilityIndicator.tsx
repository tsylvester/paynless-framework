import React, { useEffect } from 'react';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';

interface ChatAffordabilityIndicatorProps {
  textInput: string;
  onAffordabilityChange: (canAfford: boolean) => void;
}

export const ChatAffordabilityIndicator: React.FC<ChatAffordabilityIndicatorProps> = ({ textInput, onAffordabilityChange }) => {
  const estimatedTokens = useTokenEstimator(textInput);
  const { canAffordNext, lowBalanceWarning } = useAIChatAffordabilityStatus(estimatedTokens);

  useEffect(() => {
    onAffordabilityChange(canAffordNext);
  }, [canAffordNext, onAffordabilityChange]);

  if (!canAffordNext) {
    return <div className="p-2 text-xs text-destructive-foreground bg-destructive rounded-md">Insufficient balance for this message.</div>;
  }
  if (lowBalanceWarning) {
    return <div className="p-2 text-xs text-warning-foreground bg-warning rounded-md">Token balance is low.</div>;
  }

  return null; // No message if affordable and not low balance
}; 