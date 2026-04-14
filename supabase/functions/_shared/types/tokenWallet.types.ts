/**
 * @file Defines interfaces and types related to the token wallet system for Supabase Edge Functions.
 */

/**
 * Represents an AI Token wallet, which can belong to a user or an organization.
 */
export interface TokenWallet {
  walletId: string;
  userId?: string; // Associated user, if a personal wallet
  organizationId?: string; // Associated organization, if an org wallet
  balance: string; // Using string to represent large numbers accurately (NUMERIC type in DB)
  currency: 'AI_TOKEN'; // Currently only supports internal AI Tokens
  createdAt: Date; // Should be string if coming directly from DB, or properly parsed.
  updatedAt: Date; // Should be string if coming directly from DB, or properly parsed.
}

/**
 * Defines the possible types for transactions recorded in the token wallet ledger.
 */
export type TokenWalletTransactionType =
  | 'CREDIT_PURCHASE' // Tokens added via payment
  | 'CREDIT_ADJUSTMENT' // Manual credit by admin
  | 'CREDIT_REFERRAL' // Tokens awarded for referral
  | 'CREDIT_INITIAL_FREE_ALLOCATION' // Tokens for initial free allocation on new user/org
  | 'CREDIT_MONTHLY_FREE_ALLOCATION' // Tokens for monthly free plan users (NEW)
  | 'DEBIT_USAGE' // Tokens consumed by AI service usage
  | 'DEBIT_ADJUSTMENT' // Manual debit by admin
  | 'TRANSFER_IN' // Tokens received from another wallet (future)
  | 'TRANSFER_OUT'; // Tokens sent to another wallet (future)

/**
 * Represents a single transaction entry in the token wallet ledger.
 */
export interface TokenWalletTransaction {
  transactionId: string;
  walletId: string;
  type: TokenWalletTransactionType;
  amount: string; // Change in balance, string for precision
  balanceAfterTxn: string; // Wallet balance after this transaction, string for precision
  recordedByUserId: string; // ID of the user or system entity that recorded this transaction
  relatedEntityId?: string; // e.g., chatMessageId, paymentTransactionId, referredUserId
  relatedEntityType?: string; // e.g., 'chat_message', 'payment_transaction', 'user_profile'
  paymentTransactionId?: string; // Link to payment if this was a purchase
  notes?: string; // Optional notes, e.g., reason for manual adjustment
  timestamp: Date; // Should be string if coming directly from DB, or properly parsed.
  idempotencyKey: string;
}

/**
 * Interface for the service responsible for managing token wallets and their transactions.
 */
/**
 * Parameters for getTransactionHistory method.
 */
export interface GetTransactionHistoryParams {
  limit?: number;
  offset?: number;
  fetchAll?: boolean;
}

/**
 * Represents a paginated list of transactions along with the total count.
 */
export interface PaginatedTransactions {
  transactions: TokenWalletTransaction[];
  totalCount: number;
} 