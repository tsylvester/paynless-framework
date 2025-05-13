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
    console.log('[TokenWalletService] Attempting to get wallet', { walletId });

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.warn(`[TokenWalletService] Invalid walletId format: ${walletId}`);
      return null;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('token_wallets')
        .select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at')
        .eq('wallet_id', walletId)
        .single(); // Use .single() to expect one row or throw PostgrestError if not exactly one (or zero)

      if (error) {
        // PostgREST errors include code 'PGRST116' (0 rows) or 'PGRST111' (ambiguous result, >1 row)
        // If it's a "0 rows" error, that means not found, so we return null.
        // For other errors, log them and return null (or rethrow as a service error if preferred).
        if (error.code === 'PGRST116') { // PGRST116: "The result contains 0 rows"
          console.log(`[TokenWalletService] Wallet not found (PGRST116): ${walletId}`);
          return null;
        }
        console.error(`[TokenWalletService] Error fetching wallet ${walletId}:`, {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        return null; // For other errors, also return null to simplify error handling for the caller
      }

      if (!data) {
        // This case should ideally be covered by error.code === 'PGRST116' from .single()
        console.log(`[TokenWalletService] Wallet not found (no data): ${walletId}`);
        return null;
      }

      // Transform DB result to TokenWallet type
      return this._transformDbWalletToTokenWallet(data);

    } catch (e) {
      // Catch any unexpected errors during the process
      console.error(`[TokenWalletService] Unexpected error in getWallet for ${walletId}:`, e);
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
    // TODO: Implement balance check
    throw new Error('Method checkBalance not implemented.');
  }

  async getTransactionHistory(
    walletId: string,
    limit?: number,
    offset?: number
  ): Promise<TokenWalletTransaction[]> {
    console.log('[TokenWalletService] Fetching transaction history for wallet', {
      walletId,
      limit,
      offset,
    });
    // TODO: Implement logic to fetch transaction history with pagination
    throw new Error('Method getTransactionHistory not implemented.');
  }
} 