import { SupabaseClient, createClient } from '@supabase/supabase-js';
import {
  ITokenWalletService,
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from '../types/tokenWallet.types.ts';
//import { logError, logInfo } from '../utils/logging.ts';
import type { Database } from '../../types_db.ts';

/**
 * Service class for managing token wallets and transactions.
 */
export class TokenWalletService implements ITokenWalletService {
  private supabaseClient: SupabaseClient<Database>;
  private supabaseAdminClient: SupabaseClient<Database>; // For operations requiring service_role

  constructor(userSupabaseClient: SupabaseClient<Database>) {
    this.supabaseClient = userSupabaseClient; // Client with user's auth context
    // Initialize admin client - ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in env
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for TokenWalletService admin operations.');
    }
    this.supabaseAdminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false } // No user session for admin client
    });
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
      console.error(`[TokenWalletService GW_DEBUG_CATCH_BLOCK] Unexpected error in getWallet, returning null for ${walletId}:`, e);
      return null;
    }
  }

  async getWalletForContext(
    userId?: string,
    organizationId?: string
  ): Promise<TokenWallet | null> {
    console.log("[TokenWalletService] Attempting to get wallet for context", { userId, organizationId });
    if (!userId && !organizationId) {
      console.log("[TokenWalletService] getWalletForContext requires userId or organizationId", { userId, organizationId });
      return null;
    }

    let query = this.supabaseClient
      .from('token_wallets')
      .select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at');

    if (organizationId) {
      // If orgId is provided, always prioritize it.
      // RLS will ensure the user has access to this organization's wallet.
      query = query.eq('organization_id', organizationId);
      if (userId) {
        // If userId is also provided with orgId, it can be used as an additional filter
        // or for RLS policies that might depend on the user context for an org wallet.
        // For now, we assume RLS on organization_id is sufficient for access control.
        // If a specific user's view of an org wallet is needed, this might change.
        // query = query.eq('user_id', userId); // Example if user_id was also on org wallets for some reason
      }
    } else if (userId) {
      // If only userId is provided, fetch the user's personal wallet.
      // RLS will ensure it's the authenticated user's own wallet.
      query = query.eq('user_id', userId).is('organization_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[TokenWalletService] Error fetching wallet for context:", { userId, organizationId, error });
      // Consider specific error handling, e.g., if error is due to RLS (PostgREST might return 401/403 or empty data)
      // For now, any error results in null.
      return null;
    }

    if (!data) {
      console.log("[TokenWalletService] Wallet not found for context", { userId, organizationId });
      return null;
    }

    console.log("[TokenWalletService] Wallet found for context, transforming...", { data });
    // With explicit select, Supabase types might be more specific, but an explicit cast
    // can still be useful if the exact type for _transformDbWalletToTokenWallet is very precise.
    // For now, assuming the selected columns match the expected input structure of the helper.
    return this._transformDbWalletToTokenWallet(data); 
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
    relatedEntityId?: string;
    relatedEntityType?: string;
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
        p_related_entity_id: params.relatedEntityId,
        p_related_entity_type: params.relatedEntityType,
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
    console.log('[TokenWalletService] Checking balance for wallet', { walletId, amountToSpend });

    // 1. Validate walletId format (copied from getBalance for consistency)
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.error("[TokenWalletService] Invalid walletId format for checkBalance:", walletId);
      throw new Error("Invalid wallet ID format");
    }

    // 2. Validate amountToSpend
    let amountToSpendBigInt: bigint;
    try {
      amountToSpendBigInt = BigInt(amountToSpend);
    } catch (e) {
      console.error("[TokenWalletService] Invalid amountToSpend format (not a valid integer string):", amountToSpend);
      throw new Error("Invalid amount format: amountToSpend must be a string representing a valid integer.");
    }

    if (amountToSpendBigInt < 0) {
      console.error("[TokenWalletService] amountToSpend cannot be negative:", amountToSpend);
      throw new Error("Amount to spend must be non-negative");
    }

    // 3. Get current balance (this will also handle RLS and wallet not found errors)
    let currentBalanceStr: string;
    try {
      currentBalanceStr = await this.getBalance(walletId);
    } catch (error) {
      console.error(`[TokenWalletService] Error in checkBalance while calling getBalance for wallet ${walletId}:`, error);
      // Re-throw the error from getBalance (e.g., "Wallet not found", "Invalid wallet ID format", etc.)
      throw error;
    }

    // 4. Compare balance with amountToSpend using BigInt
    try {
      const currentBalanceBigInt = BigInt(currentBalanceStr);
      return currentBalanceBigInt >= amountToSpendBigInt;
    } catch (e) {
      console.error("[TokenWalletService] Error converting current balance to BigInt:", { currentBalanceStr, error: e });
      // This case should be rare if getBalance always returns a valid integer string or throws.
      throw new Error("Failed to compare balance due to internal error converting balance value.");
    }
  }

  async getTransactionHistory(
    walletId: string,
    //limit: number = 20,
    //offset: number = 0
  ): Promise<TokenWalletTransaction[]> {
    // console.log('[TokenWalletService GH_ENTRY] Fetching transaction history for wallet', { walletId, limit, offset });

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      // console.warn(`[TokenWalletService GH_DEBUG_INVALID_UUID_FORMAT] Invalid walletId format for getTransactionHistory, throwing error: ${walletId}`);
      throw new Error('Invalid walletId format');
    }

    // console.log('[TokenWalletService GH_DEBUG_BEFORE_GETWALLET] Calling this.getWallet()', { walletId });
    // First verify the wallet exists and user has access (RLS will handle this via getWallet)
    const wallet = await this.getWallet(walletId);
    // console.log('[TokenWalletService GH_DEBUG_AFTER_GETWALLET] Result of getWallet call:', wallet ? `Wallet object received for ${walletId}` : `null received for ${walletId}`);

    if (!wallet) {
      // console.log(`[TokenWalletService GH_DEBUG_WALLET_NULL] Wallet object is null. Wallet not found or access denied logic triggered for: ${walletId}`);
      // console.log("[TokenWalletService] Wallet not found or access denied:", walletId);
      // console.log('[TokenWalletService GH_EXIT_WALLET_NULL] Returning empty array due to null wallet.', { walletId });
      return []; // Return empty array if wallet not found or access denied by getWallet
    }
    // console.log('[TokenWalletService GH_DEBUG_WALLET_VALID] Wallet object is valid, proceeding to fetch transactions.', { walletId });

    // try {
    const { data: transactionsData, error: transactionsError } = await this.supabaseClient
      .from('token_wallet_transactions')
      .select(`
        transaction_id,
        wallet_id,
        transaction_type,
        amount,
        balance_after_txn,
        recorded_by_user_id,
        related_entity_id,
        related_entity_type,
        payment_transaction_id,
        notes,
        timestamp
      `)
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false }); // Get newest first

    // console.log('[TokenWalletService GH_DEBUG_AFTER_TX_QUERY] Transaction query completed.', { walletId, dataIsTruthy: !!transactionsData, errorIsTruthy: !!transactionsError });

    if (transactionsError) {
      // console.error(`[TokenWalletService GH_DEBUG_TX_ERROR] Error fetching transaction history for wallet ${walletId}:`, transactionsError);
      throw new Error(`Error fetching transaction history: ${transactionsError.message}`);
    }

    if (!transactionsData || transactionsData.length === 0) {
      // console.log(`[TokenWalletService GH_DEBUG_TX_EMPTY_ARRAY] Transaction data array is empty for wallet: ${walletId}`);
      // console.log('[TokenWalletService GH_EXIT_SUCCESS] Returning mapped transactions.', { walletId, count: 0 });
      return [];
    }

    // console.log(`[TokenWalletService GH_DEBUG_TX_DATA_FOUND] Transactions found (count: ${transactionsData.length}) for wallet: ${walletId}`);
    const mappedTransactions = transactionsData.map(tx => ({
      transactionId: tx.transaction_id,
      walletId: tx.wallet_id,
      type: tx.transaction_type as TokenWalletTransactionType,
      amount: tx.amount?.toString(),
      balanceAfterTxn: tx.balance_after_txn?.toString(),
      recordedByUserId: tx.recorded_by_user_id,
      relatedEntityId: tx.related_entity_id || undefined,
      relatedEntityType: tx.related_entity_type || undefined,
      paymentTransactionId: tx.payment_transaction_id || undefined,
      notes: tx.notes || undefined,
      timestamp: new Date(tx.timestamp),
    }));
    // console.log('[TokenWalletService GH_EXIT_SUCCESS] Returning mapped transactions.', { walletId, count: mappedTransactions.length });
    return mappedTransactions;
    // } catch (error) {
    //   // console.error(`[TokenWalletService GH_EXIT_CATCH_ERROR] Unexpected error in getTransactionHistory for wallet ${walletId}:`, error);
    //   throw error;
    // }
  }
} 