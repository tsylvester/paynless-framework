import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, MockInstance } from 'vitest';
import { ChatAffordabilityIndicator } from './ChatAffordabilityIndicator';
import { useTokenEstimator } from '@/hooks/useTokenEstimator';
import { useAIChatAffordabilityStatus } from '@/hooks/useAIChatAffordabilityStatus';
import { useWalletStore, selectActiveChatWalletInfo, WalletInfoBase } from '@paynless/store';
import { logger } from '@paynless/utils';

// Mock the hooks
vi.mock('@/hooks/useTokenEstimator');
vi.mock('@/hooks/useAIChatAffordabilityStatus');
vi.mock('@paynless/store', async (importOriginal) => {
  const originalModule = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...originalModule,
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

const mockedUseTokenEstimator = useTokenEstimator as unknown as MockInstance<[string], number>;
const mockedUseAIChatAffordabilityStatus = useAIChatAffordabilityStatus as unknown as MockInstance<
  [number],
  { canAffordNext: boolean; lowBalanceWarning: boolean; currentBalance: string; estimatedNextCost: number }
>;
const mockedUseWalletStore = useWalletStore as MockInstance<[typeof selectActiveChatWalletInfo], WalletInfoBase>;

describe('ChatAffordabilityIndicator', () => {
  let mockOnAffordabilityChange: (canAfford: boolean, reason?: string) => void;

  beforeEach(() => {
    mockOnAffordabilityChange = vi.fn();
    mockedUseTokenEstimator.mockReset();
    mockedUseAIChatAffordabilityStatus.mockReset();
    mockedUseWalletStore.mockReset();

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
        } as WalletInfoBase;
      }
      return undefined as any; // Should not happen in this component
    });

    // Default mock for useAIChatAffordabilityStatus
    mockedUseAIChatAffordabilityStatus.mockReturnValue({
      canAffordNext: true, 
      lowBalanceWarning: false, 
      currentBalance: '0', 
      estimatedNextCost: 0 
    });
  });

  it('Scenario 1: Personal Wallet - Sufficient Balance, No Warning', () => {
    mockedUseTokenEstimator.mockReturnValue(100);
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
    mockedUseTokenEstimator.mockReturnValue(100);
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
    mockedUseTokenEstimator.mockReturnValue(100);
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
    mockedUseTokenEstimator.mockReturnValueOnce(10);
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
    mockedUseTokenEstimator.mockReturnValueOnce(200);
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
    mockedUseTokenEstimator.mockReturnValue(0);
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
        } as WalletInfoBase;
      }
      return undefined as any;
    });
    mockedUseTokenEstimator.mockReturnValue(100);

    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(true, undefined);
  });

  it('Scenario 7: Organization Wallet - Insufficient Balance', () => {
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
        } as WalletInfoBase;
      }
      return undefined as any;
    });
    mockedUseTokenEstimator.mockReturnValue(100);

    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Insufficient organization tokens for this message.");
  });

  it('Scenario 8: Organization Wallet - Balance Not Available', () => {
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
        } as WalletInfoBase;
      }
      return undefined as any;
    });
    mockedUseTokenEstimator.mockReturnValue(100);

    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Organization wallet balance not available.");
  });
  
  it('Scenario 9: Organization Wallet - Invalid Balance Format', () => {
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
        } as WalletInfoBase;
      }
      return undefined as any;
    });
    mockedUseTokenEstimator.mockReturnValue(100);
  
    render(
      <ChatAffordabilityIndicator
        textInput="org test input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Invalid organization wallet balance.");
  });

  // --- New tests for Wallet Status (not 'ok') ---
  it('Scenario 10: Wallet Status - Loading', () => {
    const loadingMessage = "Wallet is currently loading...";
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
          message: loadingMessage,
        } as WalletInfoBase;
      }
      return undefined as any;
    });
    mockedUseTokenEstimator.mockReturnValue(50);

    render(
      <ChatAffordabilityIndicator
        textInput="any input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, loadingMessage);
  });
  
  it('Scenario 11: Wallet Status - Error', () => {
    const errorMessage = "An error occurred with the wallet.";
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: null, name: null, type: null, provider: null, address: null, balance: null, rawBalance: null, symbol: null,
          status: 'error', 
          message: errorMessage,
        } as WalletInfoBase;
      }
      return undefined as any;
    });
  
    render(
      <ChatAffordabilityIndicator
        textInput="any input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, errorMessage);
  });

  it('Scenario 12: Wallet Status - Not OK, No Specific Message', () => {
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: null, name: null, type: null, provider: null, address: null, balance: null, rawBalance: null, symbol: null,
          status: 'not_connected',
          message: undefined,
        } as WalletInfoBase;
      }
      return undefined as any;
    });
  
    render(
      <ChatAffordabilityIndicator
        textInput="any input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Wallet not ready for chat or affordability check.");
  });

  it('Scenario 13: Wallet Status OK, but type is null (edge case)', () => {
    mockedUseWalletStore.mockImplementation((selector) => {
      if (selector === selectActiveChatWalletInfo) {
        return {
          id: 'some-id', name: 'Some Wallet', type: null, provider: 'SomeProvider', address: '0x456', balance: '100', rawBalance: BigInt(100), symbol: 'TOK',
          status: 'ok', 
          message: undefined,
        } as WalletInfoBase;
      }
      return undefined as any;
    });
    mockedUseTokenEstimator.mockReturnValue(10);

    render(
      <ChatAffordabilityIndicator
        textInput="any input"
        onAffordabilityChange={mockOnAffordabilityChange}
      />
    );
    expect(mockOnAffordabilityChange).toHaveBeenCalledWith(false, "Affordability check error: Wallet type unclear but status is OK.");
  });
}); 