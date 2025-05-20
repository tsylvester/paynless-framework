import { useEffect } from 'react';
import { useWalletStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { AlertCircle } from 'lucide-react';
import { Layout } from '../components/layout/Layout'; // Assuming a Layout component exists

// TODO: Define a proper type for transactions if not already available globally
// For now, using 'any' as a placeholder from selectWalletTransactions if it returns any[]
// import type { TokenWalletTransaction } from '@paynless/types';

export function TransactionHistoryPage() {
  const {
    transactionHistory,
    isLoadingHistory,
    walletError,
    loadTransactionHistory,
  } = useWalletStore(state => ({
    transactionHistory: state.transactionHistory,
    isLoadingHistory: state.isLoadingHistory,
    walletError: state.walletError,
    loadTransactionHistory: state.loadTransactionHistory,
  }));

  // TODO: Implement pagination state and handlers if API supports it
  // const [currentPage, setCurrentPage] = useState(1);
  // const [pageSize, setPageSize] = useState(20); // Default page size

  useEffect(() => {
    logger.info('TransactionHistoryPage: Attempting to load transaction history.');
    // TODO: Pass pagination params when implemented: loadTransactionHistory(currentPage, pageSize);
    loadTransactionHistory(); 
  }, [loadTransactionHistory]); // Add currentPage, pageSize to dependency array when pagination is live

  const formatDate = (timestamp: string | Date | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error('Error formatting date:', { error: errorMessage });
      return 'Invalid Date';
    }
  };

  const formatAmount = (amount: string | number | undefined): string => {
    if (amount === undefined || amount === null) return 'N/A';
    // Assuming amount is a string representing a BigInt or a number
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'Invalid Amount';
    // This is a simple display; for actual token amounts, consider precision and decimal places if tokens can be fractional
    return numAmount.toLocaleString(); 
  };
  
  const getTransactionTypeDisplay = (type: string): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-textPrimary">Transaction History</h1>

        {isLoadingHistory && !transactionHistory.length && (
          <div data-testid="loading-spinner-container" className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="ml-4 text-textSecondary">Loading transaction history...</p>
          </div>
        )}

        {walletError && (
          <div data-testid="wallet-error-message" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-3 text-red-700">
            <AlertCircle size={20} />
            <span>{walletError.message || 'An error occurred while fetching wallet data.'}</span>
          </div>
        )}

        {!isLoadingHistory && !walletError && transactionHistory.length === 0 && (
          <div data-testid="no-transactions-message" className="text-center py-12">
            <p className="text-xl text-textSecondary">No transactions found.</p>
          </div>
        )}

        {transactionHistory.length > 0 && (
          <div className="overflow-x-auto shadow-md sm:rounded-lg">
            <table className="min-w-full divide-y divide-border bg-backgroundOffset">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Date</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Type</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Amount</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Balance After</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {transactionHistory.map((tx) => (
                  <tr key={tx.transactionId} data-testid={`transaction-row-${tx.transactionId}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textPrimary">{formatDate(tx.timestamp)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textPrimary">{getTransactionTypeDisplay(tx.type)}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${(tx.type.startsWith('CREDIT') || tx.type.startsWith('TRANSFER_IN')) ? 'text-green-500' : 'text-red-500'}`}>
                      {(tx.type.startsWith('CREDIT') || tx.type.startsWith('TRANSFER_IN')) ? '+' : '-'}{formatAmount(tx.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textPrimary">{formatAmount(tx.balanceAfterTxn)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textSecondary">
                      {tx.notes ? <span title={tx.notes}>{tx.notes.substring(0,50)}{tx.notes.length > 50 ? '...' : ''}</span> : '-'}
                      {tx.relatedEntityId && <div className="text-xs">Ref: {tx.relatedEntityType}/{tx.relatedEntityId.substring(0,8)}...</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* TODO: Implement Pagination Controls Here */}
            {/* Example:
            <div className="py-4 flex justify-between items-center">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1 || isLoadingHistory}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-textSecondary">Page {currentPage}</span>
              <button 
                onClick={() => setCurrentPage(p => p + 1)} 
                disabled={isLoadingHistory || transactionHistory.length < pageSize} // Approximation
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50"
              >
                Next
              </button>
            </div>
            */}
          </div>
        )}
      </div>
    </Layout>
  );
} 