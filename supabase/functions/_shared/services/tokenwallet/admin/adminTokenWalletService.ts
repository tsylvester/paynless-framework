import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../../../types_db.ts";
import type {
  IAdminTokenWalletService,
  RecordTransactionParams,
} from "./adminTokenWalletService.interface.ts";
import type {
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

export class AdminTokenWalletService implements IAdminTokenWalletService {
  private readonly adminClient: SupabaseClient<Database>;

  constructor(adminClient: SupabaseClient<Database>) {
    this.adminClient = adminClient;
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
    return {
      walletId: dbData.wallet_id,
      userId: dbData.user_id || undefined,
      organizationId: dbData.organization_id || undefined,
      balance: dbData.balance?.toString() || "0",
      currency: "AI_TOKEN",
      createdAt: new Date(dbData.created_at),
      updatedAt: new Date(dbData.updated_at),
    };
  }

  private _rpcTransactionTypeToDomain(
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
        throw new Error(`Unknown token transaction_type from RPC: ${raw}`);
    }
  }

  async createWallet(
    userId?: string,
    organizationId?: string,
  ): Promise<TokenWallet> {
    console.log("[AdminTokenWalletService] Attempting to create wallet", {
      userId,
      organizationId,
    });
    if (!userId && !organizationId) {
      const errorMsg =
        "Cannot create wallet: userId or organizationId must be provided.";
      console.error(`[AdminTokenWalletService] ${errorMsg}`, {
        userId,
        organizationId,
      });
      throw new Error(errorMsg);
    }
    if (userId && organizationId) {
      // This scenario is allowed by the current DB constraint (`user_or_org_wallet` - name defined in migration 20250512200957_create_tokenomics_tables.sql)
      // but we might want to enforce mutual exclusivity at the service layer for clarity,
      // or define specific logic if a wallet can truly belong to both simultaneously in some contexts.
      // For now, proceeding with the insert as DB allows it.
      // If mutual exclusivity is desired, uncomment the following:
      // const errorMsg = 'Cannot create wallet: provide either userId or organizationId, not both.';
      // console.error(`[AdminTokenWalletService] ${errorMsg}`, { userId, organizationId });
      // throw new Error(errorMsg);
    }

    const insertData: {
      user_id?: string;
      organization_id?: string;
      currency: string;
    } = {
      currency: "AI_TOKEN",
    };

    if (userId) {
      insertData.user_id = userId;
    }
    if (organizationId) {
      insertData.organization_id = organizationId;
    }

    const { data, error } = await this.adminClient
      .from("token_wallets")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[AdminTokenWalletService] Error creating wallet in DB", {
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
      console.error(
        "[AdminTokenWalletService] Wallet creation returned no data",
        { userId, organizationId },
      );
      throw new Error("Failed to create token wallet: No data returned after insert.");
    }

    return this._transformDbWalletToTokenWallet(data);
  }

  async recordTransaction(
    params: RecordTransactionParams,
  ): Promise<TokenWalletTransaction> {
    console.log("[AdminTokenWalletService] Recording transaction via RPC", params);

    const { data, error } = await this.adminClient.rpc(
      "record_token_transaction",
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
      },
    );

    if (error) {
      console.error(
        "[AdminTokenWalletService] Error recording token transaction via RPC",
        {
          errorMessage: error.message,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
          paramsSent: params,
        },
      );
      throw new Error(`Failed to record token transaction: ${error.message}`);
    }

    if (!data) {
      console.error(
        "[AdminTokenWalletService] RPC record_token_transaction returned no data",
        { paramsSent: params },
      );
      throw new Error("Failed to record token transaction: RPC returned no data.");
    }

    if (!Array.isArray(data) || data.length === 0) {
      console.error(
        "[AdminTokenWalletService] RPC record_token_transaction returned unexpected data format (not a non-empty array)",
        { data },
      );
      throw new Error(
        "Failed to record token transaction: Unexpected data format from RPC.",
      );
    }

    const rpcResult = data[0];

    try {
      const { data: walletData, error: walletError } = await this.adminClient
        .from("token_wallets")
        .select("user_id")
        .eq("wallet_id", params.walletId)
        .single();

      if (walletError) {
        throw new Error(
          `Failed to retrieve wallet owner for notification: ${walletError.message}`,
        );
      }

      if (walletData && walletData.user_id) {
        await this.adminClient.rpc("create_notification_for_user", {
          p_target_user_id: walletData.user_id,
          p_notification_type: "WALLET_TRANSACTION",
          p_notification_data: {
            subject: "Wallet Balance Updated",
            message:
              `Your token balance has changed. New balance: ${rpcResult.balance_after_txn}`,
            target_path: "/transaction-history",
            walletId: params.walletId,
            newBalance: rpcResult.balance_after_txn,
          },
        });
      }
    } catch (notificationError) {
      console.error(
        "[AdminTokenWalletService] Failed to create wallet transaction notification:",
        {
          walletId: params.walletId,
          error: notificationError,
        },
      );
    }

    const domainType: TokenWalletTransactionType =
      this._rpcTransactionTypeToDomain(rpcResult.transaction_type);

    const transaction: TokenWalletTransaction = {
      transactionId: rpcResult.transaction_id,
      walletId: rpcResult.wallet_id,
      type: domainType,
      amount: rpcResult.amount.toString(),
      balanceAfterTxn: rpcResult.balance_after_txn.toString(),
      recordedByUserId: rpcResult.recorded_by_user_id,
      relatedEntityId: rpcResult.related_entity_id || undefined,
      relatedEntityType: rpcResult.related_entity_type || undefined,
      paymentTransactionId: rpcResult.payment_transaction_id || undefined,
      notes: rpcResult.notes || undefined,
      timestamp: new Date(rpcResult.timestamp),
      idempotencyKey: rpcResult.idempotency_key,
    };

    return transaction;
  }
}
