import type {
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

/** Params for `record_token_transaction` / admin wallet ledger writes. */
export interface RecordTransactionParams {
  walletId: string;
  type: TokenWalletTransactionType;
  amount: string;
  recordedByUserId: string;
  idempotencyKey: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  paymentTransactionId?: string;
  notes?: string;
}

export interface IAdminTokenWalletService {
  createWallet(
    userId?: string,
    organizationId?: string,
  ): Promise<TokenWallet>;

  recordTransaction(
    params: RecordTransactionParams,
  ): Promise<TokenWalletTransaction>;
}
