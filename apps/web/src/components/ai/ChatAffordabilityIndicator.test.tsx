import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ChatAffordabilityIndicator } from './ChatAffordabilityIndicator';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';
import { useWalletStore, selectActiveChatWalletInfo } from '@paynless/store';

// --- Mock Modules ---
vi.mock('@/hooks/useTokenEstimator', () => ({
  useTokenEstimator: vi.fn(),
}));
vi.mock('@/hooks/useAIChatAffordabilityStatus', () => ({
  useAIChatAffordabilityStatus: vi.fn(),
}));
vi.mock('@paynless/store', async (importOriginal) => {
  const original = await importOriginal<typeof import('@paynless/store')>();
  return {
    selectActiveChatWalletInfo: original.selectActiveChatWalletInfo,
    useWalletStore: vi.fn(),
  };
});

vi.mock('@paynless/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// --- Assign Mocks to typed variables for test usage ---
const mockedUseTokenEstimator = vi.mocked(useTokenEstimator);
const mockedUseAIChatAffordabilityStatus = vi.mocked(useAIChatAffordabilityStatus);
const mockedUseWalletStore = vi.mocked(useWalletStore);

describe('ChatAffordabilityIndicator', () => {
  let mockOnAffordabilityChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnAffordabilityChange = vi.fn();
    mockedUseTokenEstimator.mockReset();
    mockedUseAIChatAffordabilityStatus.mockReset();
    mockedUseWalletStore.mockReset();

    // Default mock for useTokenEstimator
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 0, isLoading: false });

    // Default mock for useWalletStore to simulate a ready personal wallet
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: 'personal-wallet-id',
          name: 'Personal Wallet',
          type: 'personal',
          provider: 'Paynless',
          address: '0x123',
          balance: '500',
          rawBalance: BigInt(500),
          symbol: 'ETH',
          status: 'ok',
          message: undefined,
        };
      }
      return undefined; // Should not happen in this component
    });

    // Default mock for useAIChatAffordabilityStatus
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true, 
      lowBalanceWarning: false, 
      currentBalance: '0', 
      estimatedNextCost: 0 
    });
  });

  it('should call onAffordabilityChange with loading state when token estimation is in progress', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 0, isLoading: true });

    render(
      <ChatAffordabilityIndicator
        textInput="still typing..."
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, 'Estimating message size...');
  });

  it('Scenario 1: Personal Wallet - Sufficient Balance, No Warning', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 100, isLoading: false });
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true,
      lowBalanceWarning: false,
      currentBalance: '500',
      estimatedNextCost: 100,
    });

    render(
      <ChatAffordabilityIndicator
        textInput="test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(true, undefined);
  });

  it('Scenario 2: Personal Wallet - Sufficient Balance, Low Balance Warning', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 100, isLoading: false });
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true,
      lowBalanceWarning: true,
      currentBalance: '120',
      estimatedNextCost: 100,
    });

    render(
      <ChatAffordabilityIndicator
        textInput="test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(true, "Personal token balance is low.");
  });

  it('Scenario 3: Personal Wallet - Insufficient Balance', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 100, isLoading: false });
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: false,
      lowBalanceWarning: true,
      currentBalance: '50',
      estimatedNextCost: 100,
    });

    render(
      <ChatAffordabilityIndicator
        textInput="test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Insufficient personal tokens for this message.");
  });

  it('Scenario 4: Personal Wallet - Input Text Changes, leading to different affordability', () => {
    // Initial render: affordable
    mockedUseTokenEstimator.mockReturnValueOnce({ estimatedTokens: 10, isLoading: false });
    mockedUseAIChatAffordabilityStatus.mockReturnValueOnce({
      canAffordNext: true,
      lowBalanceWarning: false,
      currentBalance: '500',
      estimatedNextCost: 10,
    });

    const { rerender } = render(
      <ChatAffordabilityIndicator
        textInput="hello"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(true, undefined);
    mockOnAffordabilityChange.mockClear();

    // Rerender with new text: unaffordable
    mockedUseTokenEstimator.mockReturnValueOnce({ estimatedTokens: 200, isLoading: false });
    mockedUseAIChatAffordabilityStatus.mockReturnValueOnce({
      canAffordNext: false,
      lowBalanceWarning: true,
      currentBalance: '150',
      estimatedNextCost: 200,
    });

    rerender(
      <ChatAffordabilityIndicator
        textInput="hello world this is a long message"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    
    expect(mockedUseTokenEstimator).toHaveBeenCalledWith("hello world this is a long message");
    expect(mockedUseAIChatAffordabilityStatus).toHaveBeenCalledWith(200);
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Insufficient personal tokens for this message.");
  });

  it('Scenario 5: Personal Wallet - Zero Estimated Tokens', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 0, isLoading: false });
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true,
      lowBalanceWarning: false,
      currentBalance: '100',
      estimatedNextCost: 0,
    });

    render(
      <ChatAffordabilityIndicator
        textInput=""
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );

    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(true, undefined);
  });

  // --- New tests for Organization Wallets ---
  it('Scenario 6: Organization Wallet - Sufficient Balance', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 50, isLoading: false });
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: 'org-wallet-id',
          name: 'Org Wallet',
          type: 'organization',
          provider: 'Paynless',
          address: '0xorg',
          balance: '1000',
          rawBalance: BigInt(1000),
          symbol: 'ORG_TOKEN',
          status: 'ok',
          message: undefined,
        };
      }
      return undefined;
    });

    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(true, undefined);
  });

  it('Scenario 7: Organization Wallet - Insufficient Balance', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 1500, isLoading: false });
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: 'org-wallet-id',
          name: 'Org Wallet',
          type: 'organization',
          provider: 'Paynless',
          address: '0xorg',
          balance: '50',
          rawBalance: BigInt(50),
          symbol: 'ORG_TOKEN',
          status: 'ok',
          message: undefined,
        };
      }
      return undefined;
    });

    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Insufficient organization tokens for this message.");
  });

  it('Scenario 8: Organization Wallet - Invalid Balance', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 100, isLoading: false });
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: 'org-wallet-id',
          name: 'Org Wallet',
          type: 'organization',
          provider: 'Paynless',
          address: '0xorg',
          balance: 'not-a-number',
          rawBalance: null,
          symbol: 'ORG_TOKEN',
          status: 'ok',
          message: undefined,
        };
      }
      return undefined;
    });

    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Invalid organization wallet balance.");
  });

  it('Scenario 9: Organization Wallet - Null Balance', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 100, isLoading: false });
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: 'org-wallet-id',
          name: 'Org Wallet',
          type: 'organization',
          provider: 'Paynless',
          address: '0xorg',
          balance: null,
          rawBalance: null,
          symbol: 'ORG_TOKEN',
          status: 'ok',
          message: undefined,
        };
      }
      return undefined;
    });

    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Organization wallet balance not available.");
  });

  // --- New tests for Wallet Status (not 'ok') ---
  it('Scenario 10: Wallet Status is Not OK (e.g., loading, error)', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 100, isLoading: false });
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: null,
          name: null,
          type: null,
          provider: null,
          address: null,
          balance: null,
          rawBalance: null,
          symbol: null,
          status: 'loading',
          message: 'Wallet is currently loading...',
        };
      }
      return undefined;
    });

    render(
      <ChatAffordabilityIndicator
        textInput="any input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Wallet is currently loading...");
  });
  
  it('Scenario 11: Wallet Status is OK but type is null', () => {
    mockedUseTokenEstimator.mockReturnValue({ estimatedTokens: 100, isLoading: false });
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: 'some-id', name: 'Some Wallet', type: null, provider: 'SomeProvider', address: '0x456', balance: '100', rawBalance: BigInt(100), symbol: 'TOK',
          status: 'ok', 
          message: undefined,
        };
      }
      return undefined;
    });

    render(
      <ChatAffordabilityIndicator
        textInput="any input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Affordability check error: Wallet type unclear but status is OK.");
  });

  it('Scenario 12: Wallet Status - Not OK, No Specific Message', () => {
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: null, name: null, type: null, provider: null, address: null, balance: null, rawBalance: null, symbol: null,
          status: 'not_connected',
          message: undefined,
        };
      }
      return undefined;
    });
  
    render(
      <ChatAffordabilityIndicator
        textInput="any input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Wallet not ready for chat or affordability check.");
  });
}); 