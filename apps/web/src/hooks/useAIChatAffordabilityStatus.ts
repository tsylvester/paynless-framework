import { useWalletStore } from '@paynless/store';
import { useMemo } from 'react';

interface AffordabilityStatus {
  currentBalance: string;
  estimatedNextCost: number;
  canAffordNext: boolean;
  lowBalanceWarning: boolean;
}

const LOW_BALANCE_MULTIPLIER = 3;

export const useAIChatAffordabilityStatus = (estimatedNextCost: number): AffordabilityStatus => {
  const currentBalanceStr = useWalletStore(state => state.selectCurrentWalletBalance());

  return useMemo(() => {
    const currentBalanceForDisplay = currentBalanceStr || '0';
    const numericBalance = parseInt(currentBalanceStr, 10);

    if (currentBalanceStr === null || isNaN(numericBalance)) {
      // Handle cases where balance might be null or not a valid number
      return {
        currentBalance: '0',
        estimatedNextCost,
        canAffordNext: false,
        lowBalanceWarning: true,
      };
    }

    const canAfford = numericBalance >= estimatedNextCost;
    const isLowBalance = !canAfford || (numericBalance < estimatedNextCost * LOW_BALANCE_MULTIPLIER);
    const lowWarning = (estimatedNextCost === 0 && numericBalance >= 0) ? false : isLowBalance;

    return {
      currentBalance: currentBalanceForDisplay,
      estimatedNextCost,
      canAffordNext: canAfford,
      lowBalanceWarning: lowWarning,
    };
  }, [currentBalanceStr, estimatedNextCost]);
}; 