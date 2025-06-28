import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TransactionHistoryCard } from './TransactionHistoryCard';
import type { TokenWalletTransaction, ApiError, PaginatedTransactions } from '@paynless/types';

// Mock Logger
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock API
const mockGetWalletTransactionHistory = vi.fn();
vi.mock('@paynless/api', () => ({
  api: {
    wallet: () => ({
      getWalletTransactionHistory: mockGetWalletTransactionHistory,
    }),
  },
}));

// Mock PaginationComponent
const mockOnPageChange = vi.fn();
const mockOnPageSizeChange = vi.fn();
vi.mock('@/components/common/PaginationComponent', () => ({
  PaginationComponent: vi.fn((props) => {
    // Store the callbacks to simulate them later
    mockOnPageChange.mockImplementation(props.onPageChange);
    mockOnPageSizeChange.mockImplementation(props.onPageSizeChange);
    return (
      <div data-testid="mock-pagination">
        <span>Page: {props.currentPage}</span>
        <span>Size: {props.pageSize}</span>
        <span>Total: {props.totalItems}</span>
        {props.allowedPageSizes && <span>Allowed: {props.allowedPageSizes.join(',')}</span>}
        <button onClick={() => props.onPageChange(props.currentPage + 1)}>Next Page</button>
        <button onClick={() => props.onPageSizeChange(props.allowedPageSizes ? props.allowedPageSizes[1] : 20)}>Change Size</button>
      </div>
    );
  }),
}));

const mockTransaction: TokenWalletTransaction = {
  transactionId: 'tx123',
  walletId: 'wallet1',
  type: 'CREDIT_PURCHASE',
  amount: '100.00',
  balanceAfterTxn: '200.00',
  timestamp: new Date('2023-01-15T10:30:00Z'),
  notes: 'Test transaction notes',
  relatedEntityId: 'entity1',
  relatedEntityType: 'test_entity',
  recordedByUserId: 'user123',
  idempotencyKey: 'idempotencyKey123',
};

const mockTransactionsResponse: PaginatedTransactions = {
  transactions: [mockTransaction],
  totalCount: 1,
};

const mockEmptyTransactionsResponse: PaginatedTransactions = {
  transactions: [],
  totalCount: 0,
};

const mockApiError: ApiError = {
  message: 'Failed to fetch data from API',
  code: 'API_ERROR',
};

describe('TransactionHistoryCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    // Default successful response
    mockGetWalletTransactionHistory.mockResolvedValue({ data: mockTransactionsResponse, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderCard = (props: Partial<React.ComponentProps<typeof TransactionHistoryCard>> = {}) => {
    const defaultProps = {
      organizationId: null,
      // initialPageSize: 10, // Default in component
      // cardTitle: 'Transaction History', // Default in component
    };
    return render(<TransactionHistoryCard {...defaultProps} {...props} />);
  };

  describe('Rendering and Initial State', () => {
    it('renders the default card title', () => {
      renderCard();
      expect(screen.getByRole('heading', { name: /Transaction History/i })).toBeInTheDocument();
    });

    it('renders a custom card title if provided', () => {
      renderCard({ cardTitle: 'My Custom Transactions' });
      expect(screen.getByRole('heading', { name: /My Custom Transactions/i })).toBeInTheDocument();
    });

    it('renders table headers', () => {
      renderCard();
      expect(screen.getByRole('columnheader', { name: /Date/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Type/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Debit/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Credit/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Balance After/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Details/i })).toBeInTheDocument();
    });

    it('shows loading spinner initially and fetches transactions', async () => {
      mockGetWalletTransactionHistory.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: mockTransactionsResponse, error: null }), 100))
      );
      renderCard();
      expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
      expect(screen.getByText(/Loading transaction history.../i)).toBeInTheDocument();
      
      await waitFor(() => {
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledTimes(1);
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledWith(null, { limit: 10, offset: 0 });
      });
      
      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner-container')).not.toBeInTheDocument();
      });
    });
  });

  describe('Data Display', () => {
    it('displays transactions correctly when data is fetched', async () => {
      renderCard();
      await waitFor(() => {
        expect(screen.getByText(mockTransaction.notes!)).toBeInTheDocument();
      });
      const row = screen.getByTestId(`transaction-row-${mockTransaction.transactionId}`);
      expect(within(row).getByText('January 15, 2023 at 04:30 AM')).toBeInTheDocument();
      expect(within(row).getByText('CREDIT PURCHASE')).toBeInTheDocument();
      expect(within(row).getByText(/^100$/)).toBeInTheDocument();
      expect(within(row).getAllByText('-').length).toBeGreaterThanOrEqual(1);
      expect(within(row).getByText(/^200$/)).toBeInTheDocument();
      expect(within(row).getByText(mockTransaction.notes!)).toBeInTheDocument();
    });

    it('displays "No transactions found" when history is empty', async () => {
      mockGetWalletTransactionHistory.mockResolvedValue({ data: mockEmptyTransactionsResponse, error: null });
      renderCard();
      await waitFor(() => {
        expect(screen.getByTestId('no-transactions-message')).toBeInTheDocument();
        expect(screen.getByText(/No transactions found./i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
    
    it('handles debit transaction display correctly', async () => {
      const debitTransaction: TokenWalletTransaction = {
        ...mockTransaction,
        transactionId: 'txDebit',
        type: 'DEBIT_USAGE',
        amount: '50.00',
        balanceAfterTxn: '150.00',
      };
      mockGetWalletTransactionHistory.mockResolvedValue({ data: { transactions: [debitTransaction], totalCount: 1 }, error: null });
      renderCard();
       await waitFor(() => {
        expect(screen.getByText(debitTransaction.notes!)).toBeInTheDocument();
      });
      const row = screen.getByTestId(`transaction-row-${debitTransaction.transactionId}`);
      expect(within(row).getByText('DEBIT USAGE')).toBeInTheDocument();
      expect(within(row).getByText(/^50$/)).toBeInTheDocument();
      expect(within(row).getAllByText('-').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('displays error message when API call fails', async () => {
      mockGetWalletTransactionHistory.mockResolvedValue({ data: null, error: mockApiError });
      renderCard();
      await waitFor(() => {
        expect(screen.getByTestId('wallet-error-message')).toBeInTheDocument();
        expect(screen.getByText(mockApiError.message)).toBeInTheDocument();
      });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('displays error message when API call throws an exception', async () => {
      const networkErrorMessage = 'Network Error';
      mockGetWalletTransactionHistory.mockRejectedValue(new Error(networkErrorMessage));
      renderCard();
      await waitFor(() => {
        expect(screen.getByTestId('wallet-error-message')).toBeInTheDocument();
        expect(screen.getByText(networkErrorMessage)).toBeInTheDocument();
      });
    });
  });
  
  describe('Organization ID Handling', () => {
    it('calls API with organizationId if provided', async () => {
      const orgId = 'org-xyz-789';
      renderCard({ organizationId: orgId });
      await waitFor(() => {
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledWith(orgId, { limit: 10, offset: 0 });
      });
    });
  });

  describe('Pagination Interaction', () => {
    it('renders PaginationComponent with correct initial props', async () => {
      renderCard({ initialPageSize: 5, allowedPageSizes: [5, 10, 15] });
      await waitFor(() => { // Wait for initial fetch and pagination render
        expect(screen.getByTestId('mock-pagination')).toBeInTheDocument();
      });
      expect(screen.getByText('Page: 1')).toBeInTheDocument();
      expect(screen.getByText('Size: 5')).toBeInTheDocument();
      expect(screen.getByText(`Total: ${mockTransactionsResponse.totalCount}`)).toBeInTheDocument();
      expect(screen.getByText('Allowed: 5,10,15')).toBeInTheDocument();
    });

    it('fetches new data when page is changed via PaginationComponent', async () => {
      renderCard();
      await waitFor(() => expect(mockGetWalletTransactionHistory).toHaveBeenCalledTimes(1)); // Initial fetch
      
      const paginationControls = screen.getByTestId('mock-pagination');
      const nextPageButton = within(paginationControls).getByRole('button', {name: /Next Page/i});
      await user.click(nextPageButton); // This should trigger mockOnPageChange defined in Pagination mock

      await waitFor(() => {
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledTimes(2);
        expect(mockGetWalletTransactionHistory).toHaveBeenLastCalledWith(null, { limit: 10, offset: 10 }); // Page 2, size 10
      });
       expect(screen.getByText('Page: 2')).toBeInTheDocument(); // Verify mock pagination updated
    });

    it('fetches new data and resets to page 1 when page size is changed', async () => {
      const allowedPageSizes = [10, 25, 50];
      mockGetWalletTransactionHistory.mockResolvedValue({ 
        data: { ...mockTransactionsResponse, totalCount: 100 }, 
        error: null 
      });
      renderCard({ allowedPageSizes });
      await waitFor(() => expect(mockGetWalletTransactionHistory).toHaveBeenCalledTimes(1)); // Initial fetch

      const paginationControls = screen.getByTestId('mock-pagination');
      const changeSizeButton = within(paginationControls).getByRole('button', {name: /Change Size/i}); // Uses the second allowed size (25)
      await user.click(changeSizeButton);

      await waitFor(() => {
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledTimes(2);
        expect(mockGetWalletTransactionHistory).toHaveBeenLastCalledWith(null, { limit: allowedPageSizes[1], offset: 0 }); // New size, page 1
      });
      expect(screen.getByText('Page: 1')).toBeInTheDocument();
      expect(screen.getByText(`Size: ${allowedPageSizes[1]}`)).toBeInTheDocument();
    });
  });
}); 