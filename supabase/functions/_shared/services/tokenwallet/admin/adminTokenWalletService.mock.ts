import { stub, type Stub } from "jsr:@std/testing@0.225.1/mock";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  IMockSupabaseClient,
  MockSupabaseDataConfig,
} from "../../../supabase.mock.ts";
import type { Database } from "../../../../types_db.ts";
import type {
  IAdminTokenWalletService,
  RecordTransactionParams,
} from "./adminTokenWalletService.interface.ts";
import type {
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

export type RecordTokenTransactionRpcRow =
  Database["public"]["Functions"]["record_token_transaction"]["Returns"][number];

export function asSupabaseAdminClientForTests(
  client: IMockSupabaseClient,
): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}

const defaultWalletTimestamps = {
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

export function buildMockSupabaseConfigAdminCreateWalletUser(
  userId: string,
  walletId: string,
): MockSupabaseDataConfig {
  return {
    genericMockResults: {
      token_wallets: {
        insert: {
          data: [
            {
              wallet_id: walletId,
              user_id: userId,
              organization_id: null,
              balance: 0,
              currency: "AI_TOKEN",
              ...defaultWalletTimestamps,
            },
          ],
          error: null,
        },
      },
    },
  };
}

export function buildMockSupabaseConfigAdminCreateWalletOrg(
  organizationId: string,
  walletId: string,
): MockSupabaseDataConfig {
  return {
    genericMockResults: {
      token_wallets: {
        insert: {
          data: [
            {
              wallet_id: walletId,
              user_id: null,
              organization_id: organizationId,
              balance: 0,
              currency: "AI_TOKEN",
              ...defaultWalletTimestamps,
            },
          ],
          error: null,
        },
      },
    },
  };
}

export type AdminRecordTransactionMockSuccessInput = {
  walletId: string;
  recordedByUserId: string;
  targetUserId: string;
  txnType: TokenWalletTransactionType;
  idempotencyKey: string;
  transactionId: string;
  amount: number;
  balanceAfterTxn: number;
  timestamp: string;
};

export function buildRecordTokenTransactionRpcRow(
  input: AdminRecordTransactionMockSuccessInput,
): RecordTokenTransactionRpcRow {
  return {
    transaction_id: input.transactionId,
    wallet_id: input.walletId,
    transaction_type: input.txnType,
    amount: input.amount,
    balance_after_txn: input.balanceAfterTxn,
    recorded_by_user_id: input.recordedByUserId,
    idempotency_key: input.idempotencyKey,
    related_entity_id: "",
    related_entity_type: "",
    payment_transaction_id: "",
    notes: "",
    timestamp: input.timestamp,
  };
}

export function buildMockSupabaseConfigAdminRecordTransactionSuccess(
  input: AdminRecordTransactionMockSuccessInput,
): MockSupabaseDataConfig {
  const rpcRow: RecordTokenTransactionRpcRow = buildRecordTokenTransactionRpcRow(
    input,
  );
  return {
    rpcResults: {
      record_token_transaction: { data: [rpcRow], error: null },
      create_notification_for_user: { data: null, error: null },
    },
    genericMockResults: {
      token_wallets: {
        select: {
          data: [{ user_id: input.targetUserId }],
          error: null,
        },
      },
    },
  };
}

export type AdminRecordTransactionMockNotifyFailureInput =
  AdminRecordTransactionMockSuccessInput & {
    notificationError: Error;
  };

export function buildMockSupabaseConfigAdminRecordTransactionNotifyFailure(
  input: AdminRecordTransactionMockNotifyFailureInput,
): MockSupabaseDataConfig {
  const rpcRow: RecordTokenTransactionRpcRow = buildRecordTokenTransactionRpcRow(
    input,
  );
  return {
    rpcResults: {
      record_token_transaction: { data: [rpcRow], error: null },
      create_notification_for_user: {
        data: null,
        error: input.notificationError,
      },
    },
    genericMockResults: {
      token_wallets: {
        select: {
          data: [{ user_id: input.targetUserId }],
          error: null,
        },
      },
    },
  };
}

export function buildMockSupabaseConfigAdminRecordTransactionRpcFailure(
  rpcError: Error,
): MockSupabaseDataConfig {
  return {
    rpcResults: {
      record_token_transaction: { data: null, error: rpcError },
    },
  };
}

export type AdminTokenWalletServiceMethodImplementations = {
  createWallet?: IAdminTokenWalletService["createWallet"];
  recordTransaction?: IAdminTokenWalletService["recordTransaction"];
};

const getMockAdminTokenWalletServiceInternalDefaults =
  (): Required<AdminTokenWalletServiceMethodImplementations> => ({
    createWallet: (
      userId?: string,
      organizationId?: string,
    ): Promise<TokenWallet> => {
      const now: Date = new Date();
      const wallet: TokenWallet = {
        walletId: "00000000-0000-4000-8000-000000000001",
        balance: "0",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      };
      if (userId !== undefined) {
        wallet.userId = userId;
      }
      if (organizationId !== undefined) {
        wallet.organizationId = organizationId;
      }
      return Promise.resolve(wallet);
    },
    recordTransaction: (
      params: RecordTransactionParams,
    ): Promise<TokenWalletTransaction> => {
      const now: Date = new Date();
      const transaction: TokenWalletTransaction = {
        transactionId: "00000000-0000-4000-8000-000000000002",
        walletId: params.walletId,
        type: params.type,
        amount: params.amount,
        balanceAfterTxn: "0",
        recordedByUserId: params.recordedByUserId,
        idempotencyKey: params.idempotencyKey,
        timestamp: now,
      };
      return Promise.resolve(transaction);
    },
  });

export interface MockAdminTokenWalletService {
  instance: IAdminTokenWalletService;
  stubs: {
    createWallet: Stub<
      IAdminTokenWalletService,
      Parameters<IAdminTokenWalletService["createWallet"]>,
      ReturnType<IAdminTokenWalletService["createWallet"]>
    >;
    recordTransaction: Stub<
      IAdminTokenWalletService,
      Parameters<IAdminTokenWalletService["recordTransaction"]>,
      ReturnType<IAdminTokenWalletService["recordTransaction"]>
    >;
  };
  clearStubs: () => void;
}

export function createMockAdminTokenWalletService(
  config: AdminTokenWalletServiceMethodImplementations = {},
): MockAdminTokenWalletService {
  const defaults: Required<AdminTokenWalletServiceMethodImplementations> =
    getMockAdminTokenWalletServiceInternalDefaults();

  const mockServiceInstance: IAdminTokenWalletService = {
    createWallet: defaults.createWallet,
    recordTransaction: defaults.recordTransaction,
  };

  const stubs = {
    createWallet: stub(
      mockServiceInstance,
      "createWallet",
      config.createWallet ?? defaults.createWallet,
    ),
    recordTransaction: stub(
      mockServiceInstance,
      "recordTransaction",
      config.recordTransaction ?? defaults.recordTransaction,
    ),
  };

  const clearStubs = (): void => {
    if (
      stubs.createWallet &&
      typeof stubs.createWallet.restore === "function" &&
      !stubs.createWallet.restored
    ) {
      stubs.createWallet.restore();
    }
    if (
      stubs.recordTransaction &&
      typeof stubs.recordTransaction.restore === "function" &&
      !stubs.recordTransaction.restored
    ) {
      stubs.recordTransaction.restore();
    }
  };

  return {
    instance: mockServiceInstance,
    stubs,
    clearStubs,
  };
}
