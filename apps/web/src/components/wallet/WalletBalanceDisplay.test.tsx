import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
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
  });

  it('should render loading state when isLoadingWallet is true', () => {
    mockUseWalletStore.mockReturnValue({
      currentWalletBalance: null,
      isLoadingWallet: true,
      errorLoadingWallet: null,
    });
    render(<WalletBalanceDisplay />);
    expect(screen.getByText(/Loading wallet balance.../i)).toBeInTheDocument();
  });

  it('should render error message if errorLoadingWallet is present', () => {
    mockUseWalletStore.mockReturnValue({
      currentWalletBalance: null,
      isLoadingWallet: false,
      errorLoadingWallet: 'Failed to load balance',
    });
    render(<WalletBalanceDisplay />);
    expect(screen.getByText(/Error: Failed to load balance/i)).toBeInTheDocument();
  });

  it('should render balance when isLoadingWallet is false and balance is available', () => {
    mockUseWalletStore.mockReturnValue({
      currentWalletBalance: '1000',
      isLoadingWallet: false,
      errorLoadingWallet: null,
    });
    render(<WalletBalanceDisplay />);
    expect(screen.getByText(/Current Balance: 1000 AI Tokens/i)).toBeInTheDocument();
  });

  it('should render N/A if balance is not available, not loading, and no error', () => {
    mockUseWalletStore.mockReturnValue({
      currentWalletBalance: null,
      isLoadingWallet: false,
      errorLoadingWallet: null,
    });
    render(<WalletBalanceDisplay />);
    expect(screen.getByText(/Current Balance: N\/A/i)).toBeInTheDocument();
  });

  it('should render 0 if balance is "0"', () => {
    mockUseWalletStore.mockReturnValue({
      currentWalletBalance: '0',
      isLoadingWallet: false,
      errorLoadingWallet: null,
    });
    render(<WalletBalanceDisplay />);
    expect(screen.getByText(/Current Balance: 0 AI Tokens/i)).toBeInTheDocument();
  });
}); 