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
    return {
      walletId: data.wallet_id,
      userId: data.user_id || undefined, // Ensure undefined if null
      organizationId: data.organization_id || undefined, // Ensure undefined if null
      balance: data.balance?.toString() || '0', // Convert numeric balance to string, default to '0' if null/undefined
      currency: data.currency, // Assuming currency is always returned and matches
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    } as TokenWallet; // Cast needed because of potential snake_case vs camelCase and type differences (Date, string for balance)
  }

  async getWallet(walletId: string): Promise<TokenWallet | null> {
    console.log('[TokenWalletService] Attempting to get wallet', { walletId });
    // TODO: Implement logic to fetch a wallet by its ID
    throw new Error('Method getWallet not implemented.');
  }

  async getWalletForContext(
    userId?: string,
    organizationId?: string
  ): Promise<TokenWallet | null> {
    console.log('[TokenWalletService] Attempting to get wallet for context', { userId, organizationId });
    if (!userId && !organizationId) {
      console.error('[TokenWalletService] getWalletForContext requires userId or organizationId', { userId, organizationId });
      return null;
    }
    // TODO: Implement logic to fetch wallet based on user/org context
    throw new Error('Method getWalletForContext not implemented.');
  }

  async getBalance(walletId: string): Promise<string> {
    console.log('[TokenWalletService] Attempting to get balance for wallet', { walletId });
    // TODO: Implement logic to fetch wallet balance
    throw new Error('Method getBalance not implemented.');
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