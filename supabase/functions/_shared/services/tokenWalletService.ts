import { SupabaseClient } from 'npm:@supabase/supabase-js';
import { Database } from '../../types_db.ts';
import {
  ITokenWalletService,
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
  PaginatedTransactions,
  GetTransactionHistoryParams
} from '../types/tokenWallet.types.ts';

/**
 * Service class for managing token wallets and transactions.
 */
export class TokenWalletService implements ITokenWalletService {
  private supabaseClient: SupabaseClient<Database>;
  private supabaseAdminClient: SupabaseClient<Database>; // For operations requiring service_role

  constructor(
    userSupabaseClient: SupabaseClient<Database>,
    adminSupabaseClient: SupabaseClient<Database>
    ) {
    this.supabaseClient = userSupabaseClient; // Client with user's auth context
    this.supabaseAdminClient = adminSupabaseClient;
  }

  private _transformDbWalletToTokenWallet(dbData: {
    wallet_id: string;
    user_id: string | null;
    organization_id: string | null;
    balance: number | null;
    currency: string; // Keep as string from DB
    created_at: string;
    updated_at: string;
  }): TokenWallet {
    return {
      walletId: dbData.wallet_id,
      userId: dbData.user_id || undefined,
      organizationId: dbData.organization_id || undefined,
      balance: dbData.balance?.toString() || '0',
      currency: dbData.currency as 'AI_TOKEN', // Cast to 'AI_TOKEN' here
      createdAt: new Date(dbData.created_at),
      updatedAt: new Date(dbData.updated_at),
    };
  }

  async createWallet(
    userId?: string,
    organizationId?: string
  ): Promise<TokenWallet> {
    console.log('[TokenWalletService] Attempting to create wallet', { userId, organizationId });
    if (!userId && !organizationId) {
      const errorMsg = 'Cannot create wallet: userId or organizationId must be provided.';
      console.error(`[TokenWalletService] ${errorMsg}`, { userId, organizationId });
      throw new Error(errorMsg);
    }
    if (userId && organizationId) {
      // This scenario is allowed by the current DB constraint (`user_or_org_wallet` - name defined in migration 20250512200957_create_tokenomics_tables.sql)
      // but we might want to enforce mutual exclusivity at the service layer for clarity,
      // or define specific logic if a wallet can truly belong to both simultaneously in some contexts.
      // For now, proceeding with the insert as DB allows it.
      // If mutual exclusivity is desired, uncomment the following:
      // const errorMsg = 'Cannot create wallet: provide either userId or organizationId, not both.';
      // console.error(`[TokenWalletService] ${errorMsg}`, { userId, organizationId });
      // throw new Error(errorMsg);
    }

    const insertData: {
      user_id?: string;
      organization_id?: string;
      currency: string;
    } = {
      currency: 'AI_TOKEN', // Corrected to match DB constraint
    };

    if (userId) {
      insertData.user_id = userId;
    }
    if (organizationId) {
      insertData.organization_id = organizationId;
    }

    // Use supabaseAdminClient for this insert to bypass RLS if needed
    const { data, error } = await this.supabaseAdminClient
      .from('token_wallets')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[TokenWalletService] Error creating wallet in DB', {
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        userId,
        organizationId,
      });
      throw new Error(`Failed to create token wallet: ${error.message}`);
    }

    if (!data) {
      console.error('[TokenWalletService] Wallet creation returned no data', { userId, organizationId });
      throw new Error('Failed to create token wallet: No data returned after insert.');
    }

    // Transform DB result to TokenWallet type
    // The balance from the DB will be a number (numeric), but TokenWallet expects a string.
    // The DB also returns snake_case, but TokenWallet expects camelCase for some fields (e.g. walletId).
    // The select() automatically returns columns like wallet_id, user_id, organization_id, balance, currency, created_at, updated_at
    return this._transformDbWalletToTokenWallet(data);
  }

  async getWallet(walletId: string): Promise<TokenWallet | null> {
    // console.log('[TokenWalletService GW_ENTRY] Attempting to get wallet', { walletId });

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      // console.warn(`[TokenWalletService GW_DEBUG_INVALID_UUID_FORMAT] Invalid walletId format, returning null: ${walletId}`);
      return null;
    }

    try {
      // console.log('[TokenWalletService GW_DEBUG_TRY_BLOCK] Entering try block for Supabase call.', { walletId });
      const { data, error } = await this.supabaseClient
        .from('token_wallets')
        .select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at')
        .eq('wallet_id', walletId)
        .single();

      // console.log('[TokenWalletService GW_DEBUG_AFTER_CALL] Supabase call completed.', { walletId, dataIsTruthy: !!data, errorIsTruthy: !!error });

      if (error) {
        // console.error(`[TokenWalletService GW_DEBUG_ERROR_RECEIVED] Error object is present.`, { walletId, errorCode: error.code, errorMessage: error.message });
        if (error.code === 'PGRST116') { // "JSON object requested, multiple (or no) rows returned" - typically means not found or RLS prevented access
          // console.warn(`[TokenWalletService GW_DEBUG_PGRST116] Wallet not found (PGRST116), returning null: ${walletId}`);
          return null;
        }
        // console.error(`[TokenWalletService GW_ERROR] Error fetching wallet ${walletId}:`, error);
        throw new Error(`Error fetching wallet ${walletId}: ${error.message}`);
      }

      if (!data) {
        // console.warn(`[TokenWalletService GW_DEBUG_NO_DATA] No data returned for wallet (but no error), returning null: ${walletId}`);
        return null;
      }

      // console.log(`[TokenWalletService GW_DEBUG_SUCCESS] Wallet found, returning transformed wallet for: ${walletId}`);
      return this._transformDbWalletToTokenWallet(data);

    } catch (e) {
      // The console.error was here, now fully removed.
      return null;
    }
  }

  async getWalletForContext(
    userId?: string,
    organizationId?: string
  ): Promise<TokenWallet | null> {
    console.log("[TokenWalletService GCTX_ENTRY] Attempting to get wallet for context", { userId, organizationId }); // GCTX for GetContext
    if (!userId && !organizationId) {
      console.log("[TokenWalletService GCTX_DEBUG] getWalletForContext requires userId or organizationId", { userId, organizationId });
      return null;
    }

    let query = this.supabaseClient
      .from('token_wallets')
      .select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at');

    if (organizationId) {
      console.log("[TokenWalletService GCTX_DEBUG] Querying for organization wallet", { organizationId });
      query = query.eq('organization_id', organizationId);
      if (userId) {
        console.log("[TokenWalletService GCTX_DEBUG] UserID also provided with OrgID, RLS will handle access based on org.", { userId });
        // query = query.eq('user_id', userId); // Not typically needed if RLS on org is primary
      }
    } else if (userId) {
      console.log("[TokenWalletService GCTX_DEBUG] Querying for user-specific wallet", { userId });
      query = query.eq('user_id', userId).is('organization_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[TokenWalletService GCTX_ERROR] Error fetching wallet for context:", { userId, organizationId, errorCode: error.code, errorMessage: error.message, errorDetails: error.details, errorHint: error.hint });
      return null;
    }

    if (!data) {
      console.log("[TokenWalletService GCTX_DEBUG] Wallet not found for context (data is null/undefined after query)", { userId, organizationId });
      return null;
    }

    console.log("[TokenWalletService GCTX_SUCCESS_RAW_DB_DATA] RAW DB DATA for wallet context:", JSON.stringify(data));
    
    const transformedWallet = this._transformDbWalletToTokenWallet(data);
    console.log("[TokenWalletService GCTX_SUCCESS_TRANSFORMED_DATA] Transformed wallet data:", JSON.stringify(transformedWallet));

    return transformedWallet;
  }

  async getBalance(walletId: string): Promise<string> {
    console.log(`[TokenWalletService] Attempting to get balance for wallet`, { walletId });

    // Basic UUID validation
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.error("[TokenWalletService] Invalid walletId format for getBalance:", walletId);
      throw new Error("Invalid wallet ID format");
    }

    const { data, error } = await this.supabaseClient
      .from('token_wallets')
      .select('balance::text') // Cast balance to text to ensure string type
      .eq('wallet_id', walletId)
      .single();

    if (error) {
      // Log the error for debugging, especially for RLS issues or unexpected DB problems
      console.error("[TokenWalletService] Error fetching balance for wallet:", { walletId, errorDetails: error });
      // If RLS denies access, Supabase often returns a PGRST116 error (row not found), 
      // which is treated similarly to a non-existent wallet for the user.
      if (error.code === 'PGRST116') { // PGRST116: "Searched for a single row, but found no rows (or multiple rows)"
        throw new Error("Wallet not found"); 
      }
      throw new Error(`Failed to fetch balance: ${error.message}`);
    }

    if (!data) {
      // This case should ideally be covered by error.code === 'PGRST116' from .single()
      // but as a fallback, explicitly throw if data is null/undefined without an error object.
      console.log("[TokenWalletService] Wallet not found (no data) for getBalance:", { walletId });
      throw new Error("Wallet not found");
    }

    console.log("[TokenWalletService] Balance fetched successfully for wallet:", { walletId, balance: data.balance, typeOfBalance: typeof data.balance });
    // Balance from DB is NUMERIC, Supabase client might return it as number or string depending on value/driver.
    // By casting to ::text in the select, data.balance should already be a string.
    return data.balance; // Should now be a string directly
  }

  async recordTransaction(params: {
    walletId: string;
    type: TokenWalletTransactionType;
    amount: string;
    recordedByUserId: string;
    idempotencyKey: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
    paymentTransactionId?: string;
    notes?: string;
  }): Promise<TokenWalletTransaction> {
    console.log('[TokenWalletService] Recording transaction via RPC', params);
    
    const { data, error } = await this.supabaseClient.rpc(
      'record_token_transaction',
      {
        p_wallet_id: params.walletId,
        p_transaction_type: params.type,
        p_input_amount_text: params.amount,
        p_recorded_by_user_id: params.recordedByUserId,
        p_idempotency_key: params.idempotencyKey,
        p_related_entity_id: params.relatedEntityId,
        p_related_entity_type: params.relatedEntityType,
        p_payment_transaction_id: params.paymentTransactionId,
        p_notes: params.notes,
      }
    );

    if (error) {
      console.error('[TokenWalletService] Error recording token transaction via RPC', { 
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        paramsSent: params 
      });
      throw new Error(`Failed to record token transaction: ${error.message}`);
    }
    
    if (!data) {
        console.error('[TokenWalletService] RPC record_token_transaction returned no data', { paramsSent: params });
        throw new Error('Failed to record token transaction: RPC returned no data.');
    }
    // console.log('[TokenWalletService] RPC returned data:', JSON.stringify(data)); // Can be removed after confirming fix

    // The RPC returns an array with a single object containing the transaction details
    if (!Array.isArray(data) || data.length === 0) {
      console.error('[TokenWalletService] RPC record_token_transaction returned unexpected data format (not a non-empty array)', { data });
      throw new Error('Failed to record token transaction: Unexpected data format from RPC.');
    }

    const rpcResult = data[0];

    // After successfully recording the transaction, create a notification.
    try {
      const { data: walletData, error: walletError } = await this.supabaseAdminClient
        .from('token_wallets')
        .select('user_id')
        .eq('wallet_id', params.walletId)
        .single();

      if (walletError) {
        throw new Error(`Failed to retrieve wallet owner for notification: ${walletError.message}`);
      }

      if (walletData && walletData.user_id) {
        await this.supabaseAdminClient.rpc('create_notification_for_user', {
          target_user_id: walletData.user_id,
          notification_type: 'WALLET_TRANSACTION',
          notification_data: {
            subject: 'Wallet Balance Updated',
            message: `Your token balance has changed. New balance: ${rpcResult.balance_after_txn}`,
            target_path: '/transaction-history',
            walletId: params.walletId,
            newBalance: rpcResult.balance_after_txn,
          }
        });
      }
    } catch (notificationError) {
      // Log the error but do not throw, as the primary transaction succeeded.
      console.error('[TokenWalletService] Failed to create wallet transaction notification:', {
        walletId: params.walletId,
        error: notificationError,
      });
    }

    return {
      transactionId: rpcResult.transaction_id,
      walletId: rpcResult.wallet_id,
      type: rpcResult.transaction_type as TokenWalletTransactionType,
      amount: rpcResult.amount?.toString(),
      balanceAfterTxn: rpcResult.balance_after_txn?.toString(),
      recordedByUserId: rpcResult.recorded_by_user_id,
      relatedEntityId: rpcResult.related_entity_id || undefined,
      relatedEntityType: rpcResult.related_entity_type || undefined,
      paymentTransactionId: rpcResult.payment_transaction_id || undefined,
      notes: rpcResult.notes || undefined,
      timestamp: new Date(rpcResult.timestamp),
    } as TokenWalletTransaction;
  }

  async checkBalance(walletId: string, amountToSpend: string): Promise<boolean> {
    console.log(`[TokenWalletService] Checking balance for wallet ${walletId} against amount ${amountToSpend}`);

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.error(`[TokenWalletService] Invalid walletId format for checkBalance: ${walletId}`);
      throw new Error("Invalid wallet ID format");
    }

    // Validate amountToSpend: must be a string representing a non-negative integer
    if (typeof amountToSpend !== 'string' || !/^\d+$/.test(amountToSpend)) {
      console.error(`[TokenWalletService] Invalid amountToSpend format for checkBalance: ${amountToSpend}`);
      throw new Error("Amount to spend must be a non-negative integer string");
    }

    const amountToSpendBigInt = BigInt(amountToSpend);
    if (amountToSpendBigInt < 0) {
      // This case should be caught by the regex, but as a safeguard:
      console.error(`[TokenWalletService] Negative amountToSpend for checkBalance: ${amountToSpend}`);
      throw new Error("Amount to spend cannot be negative");
    }

    try {
      const currentBalanceStr = await this.getBalance(walletId); // getBalance returns string and throws if wallet not found
      const currentBalanceBigInt = BigInt(currentBalanceStr);
      
      return currentBalanceBigInt >= amountToSpendBigInt;
    } catch (error) {
      // If getBalance throws (e.g. "Wallet not found", "Invalid wallet ID format", or other DB errors),
      // re-throw the error to be handled by the caller or test.
      // This ensures that RLS violations or non-existent wallets correctly result in an error.
      console.error(`[TokenWalletService] Error in checkBalance while getting balance for wallet ${walletId}:`, error);
      throw error; // Re-throw the original error from getBalance
    }
  }

  async getTransactionHistory(
    walletId: string,
    params?: GetTransactionHistoryParams
  ): Promise<PaginatedTransactions> {
    const { limit = 20, offset = 0, fetchAll = false } = params || {}; // Destructure with defaults

    console.log(`[TokenWalletService] Getting transaction history for wallet ${walletId}`, 
      { limit, offset, fetchAll });

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.error(`[TokenWalletService] Invalid walletId format for getTransactionHistory: ${walletId}`);
      throw new Error("Invalid input: walletId must be a valid UUID.");
    }

    // Temporary logging to diagnose test failures
    console.log(`[DIAGNOSTIC] Fetching count for walletId: ${walletId}`);

    // Fetch total count (always useful)
    const { count, error: countError } = await this.supabaseClient
      .from('token_wallet_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_id', walletId);

    if (countError) {
      console.error('[TokenWalletService] Error fetching transaction count:', { walletId, error: countError });
      return { transactions: [], totalCount: 0 };
    }
    const totalCount = count === null ? 0 : count;

    // Temporary logging to diagnose test failures
    console.log(`[DIAGNOSTIC] Building query for walletId: ${walletId}`);

    // Build query for transactions
    let query = this.supabaseClient
      .from('token_wallet_transactions')
      .select(`
        transaction_id, 
        wallet_id, 
        transaction_type,
        amount, 
        balance_after_txn, 
        timestamp, 
        related_entity_id, 
        related_entity_type, 
        payment_transaction_id,
        recorded_by_user_id,
        idempotency_key,
        notes
      `)
      .eq('wallet_id', walletId)
      .order('timestamp', { ascending: false });

    // Apply pagination if not fetching all
    if (!fetchAll) {
      query = query.range(offset, offset + limit - 1);
    }
    // If fetchAll is true, no .range() is applied, so Supabase returns all matching rows.

    const { data, error } = await query;

    if (error) {
      console.error('[TokenWalletService] Error fetching transaction history:', { walletId, error });
      return { transactions: [], totalCount: totalCount }; 
    }

    if (!data) {
      console.log(`[TokenWalletService] No transaction history found for wallet ${walletId}`);
      return { transactions: [], totalCount: totalCount };
    }

    const transactions: TokenWalletTransaction[] = data.map(tx => ({
      transactionId: tx.transaction_id,
      walletId: tx.wallet_id,
      type: tx.transaction_type as TokenWalletTransactionType,
      amount: tx.amount.toString(),
      balanceAfterTxn: tx.balance_after_txn.toString(),
      timestamp: new Date(tx.timestamp),
      relatedEntityId: tx.related_entity_id || undefined,
      relatedEntityType: tx.related_entity_type || undefined,
      paymentTransactionId: tx.payment_transaction_id || undefined,
      recordedByUserId: tx.recorded_by_user_id,
      idempotencyKey: tx.idempotency_key!,
      notes: tx.notes || undefined,
    }));

    console.log(`[TokenWalletService] Successfully fetched ${transactions.length} transactions (total: ${totalCount}) for wallet ${walletId}`);
    return { transactions, totalCount };
  }

  async getWalletByIdAndUser(walletId: string, userId: string): Promise<TokenWallet | null> {
    console.log('[TokenWalletService GWID_ENTRY] Attempting to get wallet by ID for user', { walletId, userId });

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.warn(`[TokenWalletService GWID_DEBUG_INVALID_UUID_FORMAT] Invalid walletId format, returning null: ${walletId}`);
      return null;
    }

    // Note: userId is implicitly used by RLS because we are using this.supabaseClient (user-context client)
    // The RLS policy on token_wallets should ensure that the user can only fetch wallets they own
    // or organization wallets they have access to.
    try {
      const { data, error } = await this.supabaseClient
        .from('token_wallets')
        .select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at')
        .eq('wallet_id', walletId)
        .single(); // Use single() as we expect one wallet or none (due to RLS or not found)

      if (error) {
        if (error.code === 'PGRST116') { // Not found or RLS prevented access
          console.warn(`[TokenWalletService GWID_DEBUG_PGRST116] Wallet not found or access denied for wallet ${walletId} by user ${userId}.`, { errorDetails: error });
          return null;
        }
        console.error(`[TokenWalletService GWID_ERROR] Error fetching wallet ${walletId} for user ${userId}:`, error);
        // Do not throw generic error, let the caller decide based on null
        return null; 
      }

      if (!data) {
        console.warn(`[TokenWalletService GWID_DEBUG_NO_DATA] No data returned for wallet ${walletId} by user ${userId} (but no error).`);
        return null;
      }

      console.log(`[TokenWalletService GWID_DEBUG_SUCCESS] Wallet ${walletId} found for user ${userId}, returning transformed wallet.`);
      return this._transformDbWalletToTokenWallet(data);

    } catch (e) {
      console.error(`[TokenWalletService GWID_CATCH_ERROR] Unexpected error fetching wallet ${walletId} for user ${userId}:`, e);
      return null; // Return null on unexpected errors as well
    }
  }
} 