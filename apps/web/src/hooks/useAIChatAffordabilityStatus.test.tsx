import { renderHook } from '@testing-library/react-hooks';
import { useAIChatAffordabilityStatus } from './useAIChatAffordabilityStatus'; // To be created
import { useWalletStore } from '@paynless/store';
// We don't mock useTokenEstimator directly, but pass its output (estimatedNextCost) as an argument to our hook.
import { vi } from 'vitest';

// Mock useWalletStore
vi.mock('@paynless/store', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useWalletStore: vi.fn(),
    // Mock other stores if this hook somehow ends up using them, though it shouldn't
  };
});

const mockedUseWalletStore = useWalletStore as vi.MockedFunction<typeof useWalletStore>;

describe('useAIChatAffordabilityStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    mockedUseWalletStore.mockImplementation(selector => {
      const mockState = {
        personalWallet: null,
        isLoadingWallet: false,
        walletError: null,
        loadWallet: vi.fn(),
      };
      return selector(mockState);
    });
  });

  const setupMockWalletState = (balance: string | null) => {
    mockedUseWalletStore.mockImplementation(selector => {
      const mockState = {
        personalWallet: balance !== null ? { balance } : null,
        isLoadingWallet: false,
        walletError: null,
        loadWallet: vi.fn(),
      };
      return selector(mockState);
    });
  };

  it('should return canAffordNext: true and no warning when balance is sufficient', () => {
    setupMockWalletState('1000');
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.currentBalance).toBe('1000');
    expect(result.current.estimatedNextCost).toBe(100);
    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(false);
  });

  it('should return canAffordNext: false when balance is insufficient', () => {
    setupMockWalletState('50');
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(false);
    expect(result.current.lowBalanceWarning).toBe(true);
  });

  it('should return lowBalanceWarning: true when balance is low but still affordable', () => {
    setupMockWalletState('250');
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(true);
  });

  it('should handle zero balance and zero cost correctly (can afford, no warning)', () => {
    setupMockWalletState('0');
    const estimatedNextCost = 0;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(false);
  });

  it('should handle non-zero balance and zero cost correctly (can afford, no warning)', () => {
    setupMockWalletState('100');
    const estimatedNextCost = 0;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(false);
  });

  it('should return canAffordNext: false for zero balance and non-zero cost', () => {
    setupMockWalletState('0');
    const estimatedNextCost = 10;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(false);
    expect(result.current.lowBalanceWarning).toBe(true);
  });

  it('should parse string balance from store correctly', () => {
    setupMockWalletState('500');
    const estimatedNextCost = 50;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));
    expect(result.current.currentBalance).toBe('500');
    expect(result.current.canAffordNext).toBe(true);
  });

  it('should consider balance exactly equal to cost * 3 as not a low balance warning but affordable', () => {
    setupMockWalletState('300');
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));
    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(false);
  });

   it('should consider balance exactly equal to cost as affordable and warning', () => {
    setupMockWalletState('100');
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));
    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(true);
  });

  it('should correctly parse a decimal string balance from store to an integer', () => {
    setupMockWalletState('100.75'); // Wallet has 100.75 tokens, should be parsed as 100
    const estimatedNextCost = 50;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));
    expect(result.current.currentBalance).toBe('100.75'); // currentBalanceForDisplay keeps original string
    expect(result.current.canAffordNext).toBe(true); // 100 >= 50
    expect(result.current.lowBalanceWarning).toBe(true); // 100 < 50*3 (150)
  });
}); 