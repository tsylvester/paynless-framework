import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
// No longer need useWalletStore or ApiError/TokenWalletTransaction types here
// import { useWalletStore } from '@paynless/store';
import { TransactionHistoryPage } from './TransactionHistory';
// import type { TokenWalletTransaction, ApiError } from '@paynless/types';
// import type { WalletStateValues } from '@paynless/store';

// Mock logger (can remain if TransactionHistoryPage itself uses logger, otherwise remove)
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Layout component (can remain if relevant to page structure, otherwise remove if not used by page itself)
vi.mock('../components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

// Mock TransactionHistoryCard
// The path must be relative to the test file's location or an alias if configured in Vitest/TS.
// Assuming TransactionHistoryCard is in '@/components/wallet/TransactionHistoryCard'
// and '@/components/' resolves to 'apps/web/src/components/'
vi.mock('@/components/wallet/TransactionHistoryCard', () => ({
  TransactionHistoryCard: vi.fn((props) => (
    <div data-testid="mock-transaction-history-card">
      {/* Optionally, render props to assert them */}
      <span data-testid="org-id">{String(props.organizationId)}</span>
      <span>{props.cardTitle}</span>
    </div>
  )),
}));


// No longer need mockTransactions, initialWalletStoreState, or mockLoadTransactionHistory
// const mockLoadTransactionHistory = vi.fn();
// const mockTransactions: TokenWalletTransaction[] = [ ... ];
// const initialWalletStoreState = { ... };

// Store mock is no longer needed here
// vi.mock('@paynless/store', async (importOriginal) => { ... });

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

describe('TransactionHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No more store state resetting needed here
    // act(() => {
    //   useWalletStore.setState(initialWalletStoreState, true);
    // });
    // mockLoadTransactionHistory.mockResolvedValue(undefined);
  });

  it('should render the TransactionHistoryCard with null organizationId', async () => {
    renderWithRouter(<TransactionHistoryPage />);
    
    // Check if the mocked card is in the document
    const mockedCard = screen.getByTestId('mock-transaction-history-card');
    expect(mockedCard).toBeInTheDocument();

    // Check if the TransactionHistoryCard mock was called with the correct props
    const { TransactionHistoryCard } = await import('@/components/wallet/TransactionHistoryCard');
    expect(TransactionHistoryCard).toHaveBeenCalledTimes(1);
    expect(TransactionHistoryCard).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
      }),
      expect.anything() // For the second argument (context/ref) if any
    );
    
    // Optional: Check the rendered prop if you included it in the mock
    const orgIdSpan = screen.getByTestId('org-id');
    expect(orgIdSpan).toHaveTextContent('null');
  });

  // The page itself doesn't have a title anymore; it's in the card.
  // This test should be removed or adapted if a page-specific title is reintroduced.
  // it('should render the page title', () => {
  //   renderWithRouter(<TransactionHistoryPage />);
  //   expect(screen.getByRole('heading', { name: /Transaction History/i })).toBeInTheDocument();
  // });

  // All these tests below are now the responsibility of TransactionHistoryCard.test.tsx
  // and should be removed from this file.

  // it('should call loadTransactionHistory on mount', () => { ... });
  // it('should display loading spinner when isLoadingHistory is true and no transactions yet', () => { ... });
  // it('should display error message if walletError is present', () => { ... });
  // it('should display "No transactions found" message when history is empty and not loading', () => { ... });
  // it('should display transaction table with data when history is available', () => { ... });
  // it('should correctly format various transaction types', () => { ... });
  // it('should call loadTransactionHistory with correct page number when pagination changes', async () => { ... });
}); 