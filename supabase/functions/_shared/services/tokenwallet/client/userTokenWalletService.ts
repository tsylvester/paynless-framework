import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../../../types_db.ts";
import type { IUserTokenWalletService } from "./userTokenWalletService.interface.ts";
import type {
  GetTransactionHistoryParams,
  PaginatedTransactions,
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

/**
 * User-scoped token wallet reads (RLS-enforced Supabase client).
 */
export class UserTokenWalletService implements IUserTokenWalletService {
  private readonly userClient: SupabaseClient<Database>;

  constructor(userClient: SupabaseClient<Database>) {
    this.userClient = userClient;
  }

  private _transformDbWalletToTokenWallet(dbData: {
    wallet_id: string;
    user_id: string | null;
    organization_id: string | null;
    balance: number | null;
    currency: string;
    created_at: string;
    updated_at: string;
  }): TokenWallet {
    if (dbData.currency !== "AI_TOKEN") {
      throw new Error(`Unexpected wallet currency: ${dbData.currency}`);
    }
    if (dbData.balance === null) {
      throw new Error("Wallet row missing balance");
    }
    if (dbData.user_id === null && dbData.organization_id === null) {
      throw new Error(
        "Wallet row missing user_id and organization_id",
      );
    }
    const balanceStr: string = dbData.balance.toString();
    const createdAt: Date = new Date(dbData.created_at);
    const updatedAt: Date = new Date(dbData.updated_at);
    if (dbData.user_id !== null && dbData.organization_id !== null) {
      return {
        walletId: dbData.wallet_id,
        userId: dbData.user_id,
        organizationId: dbData.organization_id,
        balance: balanceStr,
        currency: "AI_TOKEN",
        createdAt,
        updatedAt,
      };
    }
    if (dbData.user_id !== null) {
      return {
        walletId: dbData.wallet_id,
        userId: dbData.user_id,
        balance: balanceStr,
        currency: "AI_TOKEN",
        createdAt,
        updatedAt,
      };
    }
    if (dbData.organization_id === null) {
      throw new Error("Wallet row missing organization_id");
    }
    return {
      walletId: dbData.wallet_id,
      organizationId: dbData.organization_id,
      balance: balanceStr,
      currency: "AI_TOKEN",
      createdAt,
      updatedAt,
    };
  }

  private _mapDbTransactionTypeToDomain(
    raw: string,
  ): TokenWalletTransactionType {
    switch (raw) {
      case "CREDIT_PURCHASE":
        return "CREDIT_PURCHASE";
      case "CREDIT_ADJUSTMENT":
        return "CREDIT_ADJUSTMENT";
      case "CREDIT_REFERRAL":
        return "CREDIT_REFERRAL";
      case "CREDIT_INITIAL_FREE_ALLOCATION":
        return "CREDIT_INITIAL_FREE_ALLOCATION";
      case "CREDIT_MONTHLY_FREE_ALLOCATION":
        return "CREDIT_MONTHLY_FREE_ALLOCATION";
      case "DEBIT_USAGE":
        return "DEBIT_USAGE";
      case "DEBIT_ADJUSTMENT":
        return "DEBIT_ADJUSTMENT";
      case "TRANSFER_IN":
        return "TRANSFER_IN";
      case "TRANSFER_OUT":
        return "TRANSFER_OUT";
      default:
        throw new Error(`Unknown token transaction_type from DB: ${raw}`);
    }
  }

  async getWallet(walletId: string): Promise<TokenWallet | null> {
    // console.log('[UserTokenWalletService GW_ENTRY] Attempting to get wallet', { walletId });

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      // console.warn(`[UserTokenWalletService GW_DEBUG_INVALID_UUID_FORMAT] Invalid walletId format, returning null: ${walletId}`);
      return null;
    }

    try {
      // console.log('[UserTokenWalletService GW_DEBUG_TRY_BLOCK] Entering try block for Supabase call.', { walletId });
      const { data, error } = await this.userClient
        .from("token_wallets")
        .select(
          "wallet_id, user_id, organization_id, balance, currency, created_at, updated_at",
        )
        .eq("wallet_id", walletId)
        .single();

      // console.log('[UserTokenWalletService GW_DEBUG_AFTER_CALL] Supabase call completed.', { walletId, dataIsTruthy: !!data, errorIsTruthy: !!error });

      if (error) {
        // console.error(`[UserTokenWalletService GW_DEBUG_ERROR_RECEIVED] Error object is present.`, { walletId, errorCode: error.code, errorMessage: error.message });
        if (
          error.code === "PGRST116"
        ) { // "JSON object requested, multiple (or no) rows returned" - typically means not found or RLS prevented access
          // console.warn(`[UserTokenWalletService GW_DEBUG_PGRST116] Wallet not found (PGRST116), returning null: ${walletId}`);
          return null;
        }
        // console.error(`[UserTokenWalletService GW_ERROR] Error fetching wallet ${walletId}:`, error);
        throw new Error(`Error fetching wallet ${walletId}: ${error.message}`);
      }

      if (!data) {
        // console.warn(`[UserTokenWalletService GW_DEBUG_NO_DATA] No data returned for wallet (but no error), returning null: ${walletId}`);
        return null;
      }

      // console.log(`[UserTokenWalletService GW_DEBUG_SUCCESS] Wallet found, returning transformed wallet for: ${walletId}`);
      return this._transformDbWalletToTokenWallet(data);

    } catch (e) {
      if (
        e instanceof Error &&
        e.message.startsWith(`Error fetching wallet ${walletId}:`)
      ) {
        throw e;
      }
      return null;
    }
  }

  async getWalletForContext(
    userId?: string,
    organizationId?: string,
  ): Promise<TokenWallet | null> {
    console.log(
      "[UserTokenWalletService GCTX_ENTRY] Attempting to get wallet for context",
      { userId, organizationId },
    ); // GCTX for GetContext
    if (!userId && !organizationId) {
      console.log(
        "[UserTokenWalletService GCTX_DEBUG] getWalletForContext requires userId or organizationId",
        { userId, organizationId },
      );
      return null;
    }

    let query = this.userClient
      .from("token_wallets")
      .select(
        "wallet_id, user_id, organization_id, balance, currency, created_at, updated_at",
      );

    if (organizationId) {
      console.log(
        "[UserTokenWalletService GCTX_DEBUG] Querying for organization wallet",
        { organizationId },
      );
      query = query.eq("organization_id", organizationId);
      if (userId) {
        console.log(
          "[UserTokenWalletService GCTX_DEBUG] UserID also provided with OrgID, RLS will handle access based on org.",
          { userId },
        );
        // query = query.eq('user_id', userId); // Not typically needed if RLS on org is primary
      }
    } else if (userId) {
      console.log(
        "[UserTokenWalletService GCTX_DEBUG] Querying for user-specific wallet",
        { userId },
      );
      query = query.eq("user_id", userId).is("organization_id", null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error(
        "[UserTokenWalletService GCTX_ERROR] Error fetching wallet for context:",
        {
          userId,
          organizationId,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
        },
      );
      return null;
    }

    if (!data) {
      console.log(
        "[UserTokenWalletService GCTX_DEBUG] Wallet not found for context (data is null/undefined after query)",
        { userId, organizationId },
      );
      return null;
    }

    console.log(
      "[UserTokenWalletService GCTX_SUCCESS_RAW_DB_DATA] RAW DB DATA for wallet context:",
      JSON.stringify(data),
    );

    const transformedWallet = this._transformDbWalletToTokenWallet(data);
    console.log(
      "[UserTokenWalletService GCTX_SUCCESS_TRANSFORMED_DATA] Transformed wallet data:",
      JSON.stringify(transformedWallet),
    );

    return transformedWallet;
  }

  async getBalance(walletId: string): Promise<string> {
    console.log(
      `[UserTokenWalletService] Attempting to get balance for wallet`,
      { walletId },
    );

    // Basic UUID validation
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.error(
        "[UserTokenWalletService] Invalid walletId format for getBalance:",
        walletId,
      );
      throw new Error("Invalid wallet ID format");
    }

    const { data, error } = await this.userClient
      .from("token_wallets")
      .select("balance::text") // Cast balance to text to ensure string type
      .eq("wallet_id", walletId)
      .single();

    if (error) {
      // Log the error for debugging, especially for RLS issues or unexpected DB problems
      console.error(
        "[UserTokenWalletService] Error fetching balance for wallet:",
        { walletId, errorDetails: error },
      );
      // If RLS denies access, Supabase often returns a PGRST116 error (row not found),
      // which is treated similarly to a non-existent wallet for the user.
      if (error.code === "PGRST116") { // PGRST116: "Searched for a single row, but found no rows (or multiple rows)"
        throw new Error("Wallet not found");
      }
      throw new Error(`Failed to fetch balance: ${error.message}`);
    }

    if (!data) {
      // This case should ideally be covered by error.code === 'PGRST116' from .single()
      // but as a fallback, explicitly throw if data is null/undefined without an error object.
      console.log(
        "[UserTokenWalletService] Wallet not found (no data) for getBalance:",
        { walletId },
      );
      throw new Error("Wallet not found");
    }

    if (typeof data.balance !== "string") {
      throw new Error(
        "getBalance: expected string balance from balance::text select",
      );
    }
    console.log(
      "[UserTokenWalletService] Balance fetched successfully for wallet:",
      { walletId, balance: data.balance, typeOfBalance: typeof data.balance },
    );
    return data.balance;
  }

  async checkBalance(
    walletId: string,
    amountToSpend: string,
  ): Promise<boolean> {
    console.log(
      `[UserTokenWalletService] Checking balance for wallet ${walletId} against amount ${amountToSpend}`,
    );

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.error(
        `[UserTokenWalletService] Invalid walletId format for checkBalance: ${walletId}`,
      );
      throw new Error("Invalid wallet ID format");
    }

    // Validate amountToSpend: must be a string representing a non-negative integer
    if (typeof amountToSpend !== "string" || !/^\d+$/.test(amountToSpend)) {
      console.error(
        `[UserTokenWalletService] Invalid amountToSpend format for checkBalance: ${amountToSpend}`,
      );
      throw new Error("Amount to spend must be a non-negative integer string");
    }

    const amountToSpendBigInt = BigInt(amountToSpend);
    if (amountToSpendBigInt < 0) {
      // This case should be caught by the regex, but as a safeguard:
      console.error(
        `[UserTokenWalletService] Negative amountToSpend for checkBalance: ${amountToSpend}`,
      );
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
      console.error(
        `[UserTokenWalletService] Error in checkBalance while getting balance for wallet ${walletId}:`,
        error,
      );
      throw error; // Re-throw the original error from getBalance
    }
  }

  async getTransactionHistory(
    walletId: string,
    params?: GetTransactionHistoryParams,
  ): Promise<PaginatedTransactions> {
    const { limit = 20, offset = 0, fetchAll = false } = params || {}; // Destructure with defaults

    console.log(
      `[UserTokenWalletService] Getting transaction history for wallet ${walletId}`,
      { limit, offset, fetchAll },
    );

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.error(
        `[UserTokenWalletService] Invalid walletId format for getTransactionHistory: ${walletId}`,
      );
      throw new Error("Invalid input: walletId must be a valid UUID.");
    }

    // Temporary logging to diagnose test failures
    console.log(`[DIAGNOSTIC] Fetching count for walletId: ${walletId}`);

    // Fetch total count (always useful)
    const { count, error: countError } = await this.userClient
      .from("token_wallet_transactions")
      .select("*", { count: "exact", head: true })
      .eq("wallet_id", walletId);

    if (countError) {
      console.error(
        "[UserTokenWalletService] Error fetching transaction count:",
        { walletId, error: countError },
      );
      return { transactions: [], totalCount: 0 };
    }
    const totalCount = count === null ? 0 : count;

    // Temporary logging to diagnose test failures
    console.log(`[DIAGNOSTIC] Building query for walletId: ${walletId}`);

    // Build query for transactions
    let query = this.userClient
      .from("token_wallet_transactions")
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
      .eq("wallet_id", walletId)
      .order("timestamp", { ascending: false });

    // Apply pagination if not fetching all
    if (!fetchAll) {
      query = query.range(offset, offset + limit - 1);
    }
    // If fetchAll is true, no .range() is applied, so Supabase returns all matching rows.

    const { data, error } = await query;

    if (error) {
      console.error(
        "[UserTokenWalletService] Error fetching transaction history:",
        { walletId, error },
      );
      return { transactions: [], totalCount: totalCount };
    }

    if (!data) {
      console.log(
        `[UserTokenWalletService] No transaction history found for wallet ${walletId}`,
      );
      return { transactions: [], totalCount: totalCount };
    }

    const transactions: TokenWalletTransaction[] = data.map((tx) => {
      if (
        tx.idempotency_key === null || tx.idempotency_key === undefined
      ) {
        throw new Error(
          "getTransactionHistory: row missing idempotency_key",
        );
      }
      const domainType: TokenWalletTransactionType =
        this._mapDbTransactionTypeToDomain(tx.transaction_type);
      const out: TokenWalletTransaction = {
        transactionId: tx.transaction_id,
        walletId: tx.wallet_id,
        type: domainType,
        amount: tx.amount.toString(),
        balanceAfterTxn: tx.balance_after_txn.toString(),
        timestamp: new Date(tx.timestamp),
        recordedByUserId: tx.recorded_by_user_id,
        idempotencyKey: tx.idempotency_key,
      };
      if (tx.related_entity_id !== null) {
        out.relatedEntityId = tx.related_entity_id;
      }
      if (tx.related_entity_type !== null) {
        out.relatedEntityType = tx.related_entity_type;
      }
      if (tx.payment_transaction_id !== null) {
        out.paymentTransactionId = tx.payment_transaction_id;
      }
      if (tx.notes !== null) {
        out.notes = tx.notes;
      }
      return out;
    });

    console.log(
      `[UserTokenWalletService] Successfully fetched ${transactions.length} transactions (total: ${totalCount}) for wallet ${walletId}`,
    );
    return { transactions, totalCount };
  }

  async getWalletByIdAndUser(
    walletId: string,
    userId: string,
  ): Promise<TokenWallet | null> {
    console.log(
      "[UserTokenWalletService GWID_ENTRY] Attempting to get wallet by ID for user",
      { walletId, userId },
    );

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(walletId)) {
      console.warn(
        `[UserTokenWalletService GWID_DEBUG_INVALID_UUID_FORMAT] Invalid walletId format, returning null: ${walletId}`,
      );
      return null;
    }

    // Note: userId is implicitly used by RLS because we are using this.userClient (user-context client)
    // The RLS policy on token_wallets should ensure that the user can only fetch wallets they own
    // or organization wallets they have access to.
    try {
      const { data, error } = await this.userClient
        .from("token_wallets")
        .select(
          "wallet_id, user_id, organization_id, balance, currency, created_at, updated_at",
        )
        .eq("wallet_id", walletId)
        .single(); // Use single() as we expect one wallet or none (due to RLS or not found)

      if (error) {
        if (error.code === "PGRST116") { // Not found or RLS prevented access
          console.warn(
            `[UserTokenWalletService GWID_DEBUG_PGRST116] Wallet not found or access denied for wallet ${walletId} by user ${userId}.`,
            { errorDetails: error },
          );
          return null;
        }
        console.error(
          `[UserTokenWalletService GWID_ERROR] Error fetching wallet ${walletId} for user ${userId}:`,
          error,
        );
        // Do not throw generic error, let the caller decide based on null
        return null;
      }

      if (!data) {
        console.warn(
          `[UserTokenWalletService GWID_DEBUG_NO_DATA] No data returned for wallet ${walletId} by user ${userId} (but no error).`,
        );
        return null;
      }

      console.log(
        `[UserTokenWalletService GWID_DEBUG_SUCCESS] Wallet ${walletId} found for user ${userId}, returning transformed wallet.`,
      );
      return this._transformDbWalletToTokenWallet(data);

    } catch (e) {
      console.error(
        `[UserTokenWalletService GWID_CATCH_ERROR] Unexpected error fetching wallet ${walletId} for user ${userId}:`,
        e,
      );
      return null; // Return null on unexpected errors as well
    }
  }
}
