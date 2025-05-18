import { useMemo } from 'react';
import { useWalletStore } from '../../../../packages/store/src/walletStore'; // Assuming path
// It's common for Zustand stores to export selectors directly, or for the component/hook to define its own selector function.
// For this example, let's assume selectCurrentWalletBalance is a conceptual selector we implement here or is exported.

// Conceptual selector (if not directly exported by useWalletStore, or if you prefer inline)
const selectCurrentWalletBalance = (state: any): string | null => state.currentWallet?.balance ?? null;

export interface AIChatAffordabilityStatus {
  currentBalance: string;
  estimatedNextCost: number;
  canAffordNext: boolean;
  lowBalanceWarning: boolean;
}

export const useAIChatAffordabilityStatus = (estimatedNextCost: number): AIChatAffordabilityStatus => {
  // Subscribe to the specific piece of state needed from the wallet store
  const currentBalanceString = useWalletStore(selectCurrentWalletBalance);

  return useMemo(() => {
    const balanceNum = parseFloat(currentBalanceString || '0');
    const costNum = estimatedNextCost < 0 ? 0 : estimatedNextCost; // Ensure cost is not negative

    const canAfford = balanceNum >= costNum;
    // Low balance warning if balance is less than 3 times the cost, but only if they can actually afford it.
    // Or, always show if balance is low, even if they can't afford (as per test cases implying this).
    // Let's stick to the test case implication: warning if balance < cost * 3.
    const lowWarning = balanceNum < (costNum * 3);

    return {
      currentBalance: currentBalanceString || '0',
      estimatedNextCost: costNum,
      canAffordNext: canAfford,
      lowBalanceWarning: lowWarning,
    };
  }, [currentBalanceString, estimatedNextCost]);
}; 