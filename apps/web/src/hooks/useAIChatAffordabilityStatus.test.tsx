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
  const mockSelectCurrentWalletBalance = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup the mock for useWalletStore to return our specific selector mock
    mockedUseWalletStore.mockImplementation((selector?: (state: any) => any) => {
      if (selector && selector.toString().includes('selectCurrentWalletBalance')) {
        return mockSelectCurrentWalletBalance();
      }
      return {}; // Default mock for other parts of the store
    });
  });

  it('should return canAffordNext: true and no warning when balance is sufficient', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('1000'); // Wallet has 1000 tokens
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.currentBalance).toBe('1000');
    expect(result.current.estimatedNextCost).toBe(100);
    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(false);
  });

  it('should return canAffordNext: false when balance is insufficient', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('50'); // Wallet has 50 tokens
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(false);
    expect(result.current.lowBalanceWarning).toBe(true); // Also a low balance warning
  });

  it('should return lowBalanceWarning: true when balance is low (e.g., < cost * 3) but still affordable', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('250'); // Wallet has 250 tokens
    const estimatedNextCost = 100; // Cost * 3 = 300. Balance is < 300 but > 100.
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(true);
  });

  it('should handle zero balance and zero cost correctly (can afford, no warning)', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('0');
    const estimatedNextCost = 0;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(true); // Can afford to send a zero-cost message
    expect(result.current.lowBalanceWarning).toBe(false); // Not a low balance if cost is also zero
  });

  it('should handle non-zero balance and zero cost correctly (can afford, no warning)', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('100');
    const estimatedNextCost = 0;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(false);
  });

  it('should return canAffordNext: false for zero balance and non-zero cost', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('0');
    const estimatedNextCost = 10;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));

    expect(result.current.canAffordNext).toBe(false);
    expect(result.current.lowBalanceWarning).toBe(true); // Warning because balance is 0 and cost > 0
  });

  it('should parse string balance from store correctly', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('500');
    const estimatedNextCost = 50;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));
    expect(result.current.currentBalance).toBe('500');
    expect(result.current.canAffordNext).toBe(true);
  });

  it('should consider balance exactly equal to cost * 3 as not a low balance warning but affordable', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('300');
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));
    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(false);
  });

   it('should consider balance exactly equal to cost as affordable and warning', () => {
    mockSelectCurrentWalletBalance.mockReturnValue('100');
    const estimatedNextCost = 100;
    const { result } = renderHook(() => useAIChatAffordabilityStatus(estimatedNextCost));
    expect(result.current.canAffordNext).toBe(true);
    expect(result.current.lowBalanceWarning).toBe(true);
  });
}); 