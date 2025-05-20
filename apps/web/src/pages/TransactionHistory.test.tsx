import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useWalletStore } from '@paynless/store';
import { TransactionHistoryPage } from './TransactionHistory';
import type { TokenWalletTransaction, ApiError } from '@paynless/types';
import type { WalletStateValues } from '@paynless/store';

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Layout component
vi.mock('../components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

const mockLoadTransactionHistory = vi.fn();

const mockTransactions: TokenWalletTransaction[] = [
  {
    transactionId: 'tx1',
    walletId: 'wallet1',
    type: 'CREDIT_PURCHASE',
    amount: '1000',
    balanceAfterTxn: '1500',
    timestamp: new Date('2023-10-26T10:00:00Z'),
    notes: 'Purchased 1000 tokens',
    relatedEntityId: 'payment1',
    relatedEntityType: 'payment_transaction',
    recordedByUserId: 'user1',
  },
  {
    transactionId: 'tx2',
    walletId: 'wallet1',
    type: 'DEBIT_USAGE',
    amount: '50',
    balanceAfterTxn: '1450',
    timestamp: new Date('2023-10-26T11:00:00Z'),
    notes: 'Used 50 tokens for AI chat',
    relatedEntityId: 'chat1',
    relatedEntityType: 'chat_message',
    recordedByUserId: 'user1',
  },
];

const initialWalletStoreState = {
  transactionHistory: [],
  isLoadingHistory: false,
  walletError: null,
  loadTransactionHistory: mockLoadTransactionHistory,
  // Add other necessary state properties and mocks from WalletStore
  currentWallet: null,
  isLoadingWallet: false,
  isLoadingPurchase: false,
  purchaseError: null,
  loadWallet: vi.fn(),
  initiatePurchase: vi.fn(),
  _resetForTesting: vi.fn(),
  // Assuming selectWalletTransactions is used like this, or adjust if it's a direct state property
  // For the purpose of this test, we'll set transactionHistory directly.
};

// Mock the store module
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual, // Import all actual exports
    useWalletStore: actual.useWalletStore, // Use the actual hook
    selectWalletTransactions: (state: WalletStateValues) => state.transactionHistory, // Typed state
  };
});

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

describe('TransactionHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      // Reset store to initial state before each test
      useWalletStore.setState(initialWalletStoreState, true);
    });
    mockLoadTransactionHistory.mockResolvedValue(undefined); // Default mock behavior
  });

  it('should render the page title', () => {
    renderWithRouter(<TransactionHistoryPage />);
    expect(screen.getByRole('heading', { name: /Transaction History/i })).toBeInTheDocument();
  });

  it('should call loadTransactionHistory on mount', () => {
    renderWithRouter(<TransactionHistoryPage />);
    expect(mockLoadTransactionHistory).toHaveBeenCalledTimes(1);
  });

  it('should display loading spinner when isLoadingHistory is true and no transactions yet', () => {
    act(() => {
      useWalletStore.setState({ isLoadingHistory: true, transactionHistory: [] });
    });
    renderWithRouter(<TransactionHistoryPage />);
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
    expect(screen.getByText(/Loading transaction history.../i)).toBeInTheDocument();
  });

  it('should display error message if walletError is present', () => {
    const error: ApiError = { message: 'Failed to load history', code: 'LOAD_ERROR' };
    act(() => {
      useWalletStore.setState({ walletError: error });
    });
    renderWithRouter(<TransactionHistoryPage />);
    expect(screen.getByTestId('wallet-error-message')).toHaveTextContent(error.message);
  });

  it('should display "No transactions found" message when history is empty and not loading', () => {
    act(() => {
      useWalletStore.setState({ transactionHistory: [], isLoadingHistory: false });
    });
    renderWithRouter(<TransactionHistoryPage />);
    expect(screen.getByTestId('no-transactions-message')).toBeInTheDocument();
  });

  it('should display transaction table with data when history is available', () => {
    act(() => {
      useWalletStore.setState({ transactionHistory: mockTransactions, isLoadingHistory: false });
    });
    renderWithRouter(<TransactionHistoryPage />);
    
    const row1 = screen.getByTestId('transaction-row-tx1');
    expect(within(row1).getByText(new Date('2023-10-26T10:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }))).toBeInTheDocument();
    expect(within(row1).getByText('CREDIT PURCHASE')).toBeInTheDocument(); // Expect ALL CAPS
    expect(within(row1).getByText('+1,000')).toBeInTheDocument(); 
    expect(within(row1).getByText('1,500')).toBeInTheDocument(); 
    expect(within(row1).getByText(mockTransactions[0].notes!)).toBeInTheDocument();

    const row2 = screen.getByTestId('transaction-row-tx2');
    expect(within(row2).getByText(new Date('2023-10-26T11:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }))).toBeInTheDocument();
    expect(within(row2).getByText('DEBIT USAGE')).toBeInTheDocument(); // Expect ALL CAPS
    expect(within(row2).getByText('-50')).toBeInTheDocument(); 
    expect(within(row2).getByText('1,450')).toBeInTheDocument(); 

    const tableBody = screen.getByRole('table').querySelector('tbody');
    expect(tableBody?.querySelectorAll('tr').length).toBe(mockTransactions.length);
  });

  it('should correctly format various transaction types', () => {
    const variedTransactions: TokenWalletTransaction[] = [
      { ...mockTransactions[0], transactionId: 'tx1v', type: 'CREDIT_ADJUSTMENT' }, // Ensure unique IDs for rows
      { ...mockTransactions[1], transactionId: 'tx2v', type: 'DEBIT_ADJUSTMENT' },
      { ...mockTransactions[0], transactionId: 'tx3v', type: 'TRANSFER_IN' },
      { ...mockTransactions[1], transactionId: 'tx4v', type: 'TRANSFER_OUT' },
    ];
    act(() => {
      useWalletStore.setState({ transactionHistory: variedTransactions, isLoadingHistory: false });
    });
    renderWithRouter(<TransactionHistoryPage />);
    expect(screen.getByText('CREDIT ADJUSTMENT')).toBeInTheDocument(); // Expect ALL CAPS
    expect(screen.getByText('DEBIT ADJUSTMENT')).toBeInTheDocument(); // Expect ALL CAPS
    expect(screen.getByText('TRANSFER IN')).toBeInTheDocument();     // Expect ALL CAPS
    expect(screen.getByText('TRANSFER OUT')).toBeInTheDocument();    // Expect ALL CAPS
  });

  // TODO: Add tests for pagination when implemented
  // Example:
  // it('should call loadTransactionHistory with correct page number when pagination changes', async () => {
  //   act(() => {
  //     useWalletStore.setState({ transactionHistory: mockTransactions, isLoadingHistory: false }); 
  //   });
  //   mockLoadTransactionHistory.mockClear(); // Clear previous mount call
  //   renderWithRouter(<TransactionHistoryPage />);
    
  //   const nextButton = screen.getByRole('button', { name: /Next/i });
  //   await userEvent.click(nextButton);
    
  //   expect(mockLoadTransactionHistory).toHaveBeenCalledWith(/* page 2 arguments */);
  // });
}); 