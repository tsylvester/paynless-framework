'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@paynless/api';
import type { TokenWalletTransaction, ApiError, GetTransactionHistoryParams } from '@paynless/types';
import { logger } from '@paynless/utils';
import { AlertCircle } from 'lucide-react';
import { PaginationComponent } from '@/components/common/PaginationComponent';
// Assuming ShadCN UI card components are available
// If not, these can be replaced with styled divs.
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; 
// We'll use a simple div with card styling for now to avoid dependency on specific UI lib setup.

interface TransactionHistoryCardProps {
  organizationId?: string | null;
  initialPageSize?: number;
  cardTitle?: string;
  allowedPageSizes?: number[];
  // Add a prop to control fetching all, if the card itself should have this capability
  // For now, it's designed for pagination.
  // fetchAll?: boolean; 
}

export function TransactionHistoryCard({
  organizationId,
  initialPageSize = 10,
  cardTitle = 'Transaction History',
  allowedPageSizes,
}: TransactionHistoryCardProps) {
  const [transactions, setTransactions] = useState<TokenWalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [totalItems, setTotalItems] = useState<number>(0);

  // Helper Functions (copied from TransactionHistoryPage)
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
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'Invalid Amount';
    return numAmount.toLocaleString();
  };

  const getTransactionTypeDisplay = (type: string): string => {
    return type.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
  };

  const fetchTransactions = useCallback(async (page: number, size: number) => {
    setIsLoading(true);
    setError(null);
    
    const historyParams: GetTransactionHistoryParams = { limit: size, offset: (page - 1) * size };

    try {
      logger.info(`[TransactionHistoryCard] Fetching transactions for org: ${organizationId}`, { params: historyParams });
      
      // Use the imported ApiResponse type for better type safety if needed, or rely on inference.
      // const response: ApiResponse<PaginatedTransactions> = 
      const response = await api.wallet().getWalletTransactionHistory(organizationId, historyParams);

      if (response.error) {
        const errorToSet: ApiError = 
          response.error && typeof response.error.message === 'string' // No need for code check if ApiError implies it
          ? response.error
          : { message: String(response.error) || 'Failed to fetch transaction history', code: 'UNKNOWN_API_ERROR' };
        setError(errorToSet);
        setTransactions([]);
        setTotalItems(0);
      } else if (response.data === null || response.data === undefined) { // Should not happen if API returns PaginatedTransactions with empty array
        setError({ message: 'Failed to fetch transaction history: No data structure returned', code: 'NO_DATA_STRUCTURE' });
        setTransactions([]);
        setTotalItems(0);
      } else {
        setTransactions(response.data.transactions);
        setTotalItems(response.data.totalCount);
      }
    } catch (err: unknown) {
      const fetchError: ApiError = { 
        message: err instanceof Error ? err.message : 'An unknown network error occurred', 
        code: 'NETWORK_ERROR' 
      };
      setError(fetchError);
      setTransactions([]);
      setTotalItems(0);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchTransactions(currentPage, pageSize);
  }, [fetchTransactions, currentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to page 1 when page size changes
    // Fetch will be triggered by useEffect dependencies
  };

  return (
    <div className="p-6 bg-backgroundOffset shadow-lg rounded-lg border border-border"> {/* Basic Card Styling */}
      <h2 className="text-2xl font-semibold mb-6 text-textPrimary">{cardTitle}</h2>

      {isLoading && transactions.length === 0 && ( // Show loading only if no data yet
        <div data-testid="loading-spinner-container" className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          <p className="ml-4 text-textSecondary">Loading transaction history...</p>
        </div>
      )}

      {error && (
        <div data-testid="wallet-error-message" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-3 text-red-700">
          <AlertCircle size={20} />
          <span>{error.message || 'An error occurred.'}</span>
        </div>
      )}

      {!isLoading && !error && transactions.length === 0 && totalItems === 0 && (
        <div data-testid="no-transactions-message" className="text-center py-12">
          <p className="text-xl text-textSecondary">No transactions found.</p>
        </div>
      )}

      {(transactions.length > 0 || isLoading) && ( // Keep table structure if loading new page but old data exists
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Debit</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Credit</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Balance After</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {/* Show skeleton or less disruptive loading for page changes if desired */}
              {isLoading && transactions.length > 0 && (
                <tr><td colSpan={6} className="text-center p-4 text-textSecondary">Loading more...</td></tr>
              )}
              {!isLoading && transactions.map((tx) => {
                const isDebit = tx.type.startsWith('DEBIT') || tx.type.startsWith('TRANSFER_OUT');
                const isCredit = tx.type.startsWith('CREDIT') || tx.type.startsWith('TRANSFER_IN');
                return (
                  <tr key={tx.transactionId} data-testid={`transaction-row-${tx.transactionId}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textPrimary">{formatDate(tx.timestamp)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textPrimary">{getTransactionTypeDisplay(tx.type)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-500">
                      {isDebit ? formatAmount(tx.amount) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-500">
                      {isCredit ? formatAmount(tx.amount) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textPrimary">{formatAmount(tx.balanceAfterTxn)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-textSecondary">
                      {tx.notes ? <span title={tx.notes}>{tx.notes.substring(0,50)}{tx.notes.length > 50 ? '...' : ''}</span> : '-'}
                      {tx.relatedEntityId && <div className="text-xs">Ref: {tx.relatedEntityType}/{tx.relatedEntityId.substring(0,8)}...</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {totalItems > 0 && (
            <PaginationComponent 
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              allowedPageSizes={allowedPageSizes}
            />
          )}
        </div>
      )}
    </div>
  );
} 