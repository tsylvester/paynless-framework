import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom'; // Import MemoryRouter
import { WalletBalanceDisplay } from './WalletBalanceDisplay';
import { useWalletStore } from '@paynless/store'; // Adjust path as needed

// Mock useWalletStore
vi.mock('@paynless/store', () => ({
  useWalletStore: vi.fn(),
}));

const mockUseWalletStore = useWalletStore as vi.Mock;

describe('WalletBalanceDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation, now includes the selector
    mockUseWalletStore.mockImplementation(selector => {
      const mockState = {
        currentWallet: null,
        isLoadingWallet: false,
        walletError: null,
        loadWallet: vi.fn(),
        selectCurrentWalletBalance: () => (mockState.currentWallet?.balance || '0'),
      };
      return selector(mockState);
    });
  });

  it('should render loading state when isLoadingWallet is true', () => {
    mockUseWalletStore.mockImplementation(selector => {
      const mockState = {
        currentWallet: null,
        isLoadingWallet: true,
        walletError: null,
        loadWallet: vi.fn(),
        selectCurrentWalletBalance: () => (mockState.currentWallet?.balance || '0'),
      };
      return selector(mockState);
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(/Loading wallet balance.../i)).toBeInTheDocument();
  });

  it('should render error message if walletError is present', () => {
    const errorMessage = 'Failed to load balance';
    mockUseWalletStore.mockImplementation(selector => {
      const mockState = {
        currentWallet: null,
        isLoadingWallet: false,
        walletError: { message: errorMessage },
        loadWallet: vi.fn(),
        selectCurrentWalletBalance: () => (mockState.currentWallet?.balance || '0'),
      };
      return selector(mockState);
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
  });

  it('should render balance when isLoadingWallet is false and balance is available', () => {
    mockUseWalletStore.mockImplementation(selector => {
      const mockState = {
        currentWallet: { balance: '1000' },
        isLoadingWallet: false,
        walletError: null,
        loadWallet: vi.fn(),
        selectCurrentWalletBalance: () => (mockState.currentWallet?.balance || '0'),
      };
      return selector(mockState);
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(/1,000 Tokens/i)).toBeInTheDocument();
  });

  it('should render N/A if balance is not available (currentWallet is null)', () => {
    mockUseWalletStore.mockImplementation(selector => {
      const mockState = {
        currentWallet: null,
        isLoadingWallet: false,
        walletError: null,
        loadWallet: vi.fn(),
        selectCurrentWalletBalance: () => null,
      };
      return selector(mockState);
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('should render 0 if balance is "0" (currentWallet.balance is "0")', () => {
    mockUseWalletStore.mockImplementation(selector => {
      const mockState = {
        currentWallet: { balance: '0' },
        isLoadingWallet: false,
        walletError: null,
        loadWallet: vi.fn(),
        selectCurrentWalletBalance: () => (mockState.currentWallet?.balance || '0'),
      };
      return selector(mockState);
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(/0 Tokens/i)).toBeInTheDocument();
  });
}); 