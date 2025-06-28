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
export interface ITokenWalletService {
  /**
   * Creates a new token wallet, typically linked to either a user or an organization.
   * @param userId - Optional ID of the user for a personal wallet.
   * @param organizationId - Optional ID of the organization for an org wallet.
   * @returns A promise resolving to the newly created wallet.
   */
  createWallet(userId?: string, organizationId?: string): Promise<TokenWallet>;

  /**
   * Retrieves a specific wallet by its ID.
   * @param walletId - The ID of the wallet to retrieve.
   * @returns A promise resolving to the wallet, or null if not found.
   */
  getWallet(walletId: string): Promise<TokenWallet | null>;

  /**
   * Retrieves the wallet associated with the given user or organization context.
   * Assumes a user/org has one primary wallet.
   * @param userId - Optional ID of the user.
   * @param organizationId - Optional ID of the organization.
   * @returns A promise resolving to the relevant wallet, or null if none exists for the context.
   */
  getWalletForContext(userId?: string, organizationId?: string): Promise<TokenWallet | null>;

  /**
   * Retrieves a specific wallet by its ID if the given user has permissions for it.
   * @param walletId - The ID of the wallet to retrieve.
   * @param userId - The ID of the user requesting the wallet.
   * @returns A promise resolving to the wallet, or null if not found or access denied.
   */
  getWalletByIdAndUser(walletId: string, userId: string): Promise<TokenWallet | null>;

  /**
   * Gets the current balance of a specific wallet.
   * @param walletId - The ID of the wallet.
   * @returns A promise resolving to the balance as a string.
   */
  getBalance(walletId: string): Promise<string>;

  /**
   * Records a transaction in the wallet ledger and updates the wallet balance atomically.
   * @param params - The details of the transaction to record.
   * @returns A promise resolving to the newly created transaction record.
   */
  recordTransaction(params: {
    walletId: string;
    type: TokenWalletTransactionType;
    amount: string; // Absolute amount for the transaction type
    recordedByUserId: string;
    idempotencyKey: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
    paymentTransactionId?: string;
    notes?: string;
  }): Promise<TokenWalletTransaction>;

  /**
   * Checks if a wallet has sufficient balance for a potential debit.
   * @param walletId - The ID of the wallet to check.
   * @param amountToSpend - The amount intended to be debited, as a string.
   * @returns A promise resolving to true if the balance is sufficient, false otherwise.
   */
  checkBalance(walletId: string, amountToSpend: string): Promise<boolean>;

  /**
   * Retrieves the transaction history for a specific wallet.
   * Can be paginated or fetch all transactions.
   * @param walletId - The ID of the wallet.
   * @param params - Parameters for fetching history (limit, offset, fetchAll).
   * @returns A promise resolving to PaginatedTransactions (transactions and totalCount).
   */
  getTransactionHistory(
    walletId: string,
    params?: GetTransactionHistoryParams
  ): Promise<PaginatedTransactions>;
}

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