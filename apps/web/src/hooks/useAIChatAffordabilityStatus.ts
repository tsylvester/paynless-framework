import { useWalletStore, selectPersonalWalletBalance } from '@paynless/store';
import { useMemo } from 'react';

interface AffordabilityStatus {
  currentBalance: string;
  estimatedNextCost: number;
  canAffordNext: boolean;
  lowBalanceWarning: boolean;
}

const LOW_BALANCE_MULTIPLIER = 3;

export const useAIChatAffordabilityStatus = (estimatedNextCost: number): AffordabilityStatus => {
  const currentBalanceStr = useWalletStore(selectPersonalWalletBalance);

  return useMemo(() => {
    const balanceForParsing = currentBalanceStr ?? '0';
    const numericBalance = parseInt(balanceForParsing, 10);
    const currentBalanceForDisplay = currentBalanceStr ?? 'N/A';

    if (isNaN(numericBalance)) {
      return {
        currentBalance: currentBalanceForDisplay,
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