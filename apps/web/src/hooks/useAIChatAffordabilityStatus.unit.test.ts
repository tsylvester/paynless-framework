import { renderHook } from '@testing-library/react-hooks';
import { vi, describe, beforeEach, it, expect, MockedFunction } from 'vitest'; // Removed MockedFunction
import { useWalletStore } from '@paynless/store'; // Assuming path
import { useAIChatAffordabilityStatus } from './useAIChatAffordabilityStatus';

// Mock useWalletStore with Vitest
vi.mock('../../../../packages/store/src/walletStore', () => ({
  useWalletStore: vi.fn(),
}));

const mockUseWalletStore = useWalletStore as MockedFunction<typeof useWalletStore>;

interface AffordabilityStatus {
  currentBalance: string;
  estimatedNextCost: number;
  canAffordNext: boolean;
  lowBalanceWarning: boolean;
}

describe('useAIChatAffordabilityStatus', () => {
  beforeEach(() => {
    mockUseWalletStore.mockReset();
  });

  const setupHook = (balance: string | null, estimatedCost: number) => {
    mockUseWalletStore.mockImplementation(
      // Zustand selectors can be mocked by returning the selected value directly
      (selectorFn: (state: WalletStore) => any) => {
        // Simulate selectCurrentWalletBalance selector
        if (selectorFn.name.includes('selectCurrentWalletBalance') || selectorFn.toString().includes('currentWallet.balance')) {
          return balance;
        }
        // Add more selectors if the hook uses them
        return undefined;
      }
    );
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedCost));
    return result.current;
  };

  // Test cases from the plan (4.4.5.1)
  describe('Basic Affordability', () => {
    it('should allow when balance is sufficient', () => {
      const status = setupHook('100', 50);
      expect(status.canAffordNext).toBe(true);
      expect(status.lowBalanceWarning).toBe(true); // 100 < 50*3 (150)
    });

    it('should allow when balance equals cost, with warning', () => {
      const status = setupHook('50', 50);
      expect(status.canAffordNext).toBe(true);
      expect(status.lowBalanceWarning).toBe(true); // 50 < 50*3 (150)
    });

    it('should deny when balance is insufficient', () => {
      const status = setupHook('49', 50);
      expect(status.canAffordNext).toBe(false);
      expect(status.lowBalanceWarning).toBe(true); // 49 < 50*3 (150)
    });
  });

  describe('Low Balance Warning Logic (threshold: balance < cost * 3)', () => {
    it('should not warn if balance is exactly cost * 3', () => {
      const status = setupHook('150', 50);
      expect(status.canAffordNext).toBe(true);
      expect(status.lowBalanceWarning).toBe(false); // 150 is not < 150
    });

    it('should warn if balance is just below cost * 3', () => {
      const status = setupHook('149', 50);
      expect(status.canAffordNext).toBe(true);
      expect(status.lowBalanceWarning).toBe(true); // 149 < 150
    });

    it('should warn and deny if balance is very low', () => {
      const status = setupHook('10', 50);
      expect(status.canAffordNext).toBe(false);
      expect(status.lowBalanceWarning).toBe(true); // 10 < 150
    });
  });

  describe('Edge Cases', () => {
    it('should deny if balance is zero and cost is positive', () => {
      const status = setupHook('0', 1);
      expect(status.canAffordNext).toBe(false);
      expect(status.lowBalanceWarning).toBe(true); // 0 < 1*3
    });

    it('should allow if cost is zero, regardless of balance (unless balance is null)', () => {
      const status1 = setupHook('1000', 0);
      expect(status1.canAffordNext).toBe(true);
      expect(status1.lowBalanceWarning).toBe(false); // 1000 is not < 0*3 (0)

      const status2 = setupHook('0', 0);
      expect(status2.canAffordNext).toBe(true);
      expect(status2.lowBalanceWarning).toBe(false); // 0 is not < 0*3 (0)
    });

    it('should handle null balance as cannot afford and low warning', () => {
      const status = setupHook(null, 50);
      expect(status.canAffordNext).toBe(false);
      expect(status.lowBalanceWarning).toBe(true);
      expect(status.currentBalance).toBe('0'); // Expect default/fallback balance in output
    });

    it('should parse string balance correctly', () => {
        const status = setupHook('100.00', 20); // Assuming wallet might store as string with decimals
        expect(status.canAffordNext).toBe(true);
        expect(status.lowBalanceWarning).toBe(false); // 100 is not < 60
      });
  });

  it('should correctly return all fields in the status object', () => {
    const estimatedCost = 75;
    const balance = '200';
    const status = setupHook(balance, estimatedCost);
    expect(status).toEqual({
      currentBalance: balance,
      estimatedNextCost: estimatedCost,
      canAffordNext: true, // 200 >= 75
      lowBalanceWarning: true, // 200 < 75*3 (225)
    });
  });
}); 