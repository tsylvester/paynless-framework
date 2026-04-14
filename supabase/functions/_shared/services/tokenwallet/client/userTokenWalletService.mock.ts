import { stub, type Stub } from "jsr:@std/testing@0.225.1/mock";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import type {
  GetTransactionHistoryParams,
  PaginatedTransactions,
  TokenWallet,
  TokenWalletTransaction,
} from "../../../types/tokenWallet.types.ts";
import type {
  IMockSupabaseClient,
  MockQueryBuilderState,
  MockSupabaseDataConfig,
} from "../../../supabase.mock.ts";
import type { IUserTokenWalletService } from "./userTokenWalletService.interface.ts";

type TokenWalletRow = Database["public"]["Tables"]["token_wallets"]["Row"];
type TokenWalletTxnRow =
  Database["public"]["Tables"]["token_wallet_transactions"]["Row"];

/** Stable UUIDs and timestamp shared by `userTokenWalletService` unit tests. */
export const userTokenWalletServiceTestIds = {
  walletIdA: "11111111-1111-4111-8111-111111111111",
  walletIdB: "22222222-2222-4222-8222-222222222222",
  userIdA: "33333333-3333-4333-8333-333333333333",
  orgIdA: "44444444-4444-4444-8444-444444444444",
  userWithNoWallet: "55555555-5555-4555-8555-555555555555",
  timestampIso: "2024-01-01T00:00:00.000Z",
} as const;

const mockDefaultUserId: string =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mockCtxUserWalletId: string =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mockCtxOrgWalletId: string =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const mockDefaultTxnId: string =
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

export type UserTokenWalletServiceMethodImplementations = {
  getWallet?: IUserTokenWalletService["getWallet"];
  getWalletForContext?: IUserTokenWalletService["getWalletForContext"];
  getBalance?: IUserTokenWalletService["getBalance"];
  checkBalance?: IUserTokenWalletService["checkBalance"];
  getTransactionHistory?: IUserTokenWalletService["getTransactionHistory"];
  getWalletByIdAndUser?: IUserTokenWalletService["getWalletByIdAndUser"];
};

const getMockUserTokenWalletServiceInternalDefaults =
  (): Required<UserTokenWalletServiceMethodImplementations> => ({
    getWallet: (walletId: string): Promise<TokenWallet | null> => {
      const now: Date = new Date();
      const wallet: TokenWallet = {
        walletId,
        userId: mockDefaultUserId,
        balance: "1000",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      };
      return Promise.resolve(wallet);
    },
    getWalletForContext: (
      userId?: string,
      organizationId?: string,
    ): Promise<TokenWallet | null> => {
      if (userId === undefined && organizationId === undefined) {
        return Promise.resolve(null);
      }
      const now: Date = new Date();
      if (organizationId !== undefined) {
        const wallet: TokenWallet = {
          walletId: mockCtxOrgWalletId,
          organizationId,
          balance: "0",
          currency: "AI_TOKEN",
          createdAt: now,
          updatedAt: now,
        };
        return Promise.resolve(wallet);
      }
      if (userId !== undefined) {
        const wallet: TokenWallet = {
          walletId: mockCtxUserWalletId,
          userId,
          balance: "0",
          currency: "AI_TOKEN",
          createdAt: now,
          updatedAt: now,
        };
        return Promise.resolve(wallet);
      }
      return Promise.resolve(null);
    },
    getBalance: (_walletId: string): Promise<string> => {
      return Promise.resolve("750");
    },
    checkBalance: (
      _walletId: string,
      _amountToSpend: string,
    ): Promise<boolean> => {
      return Promise.resolve(true);
    },
    getTransactionHistory: (
      walletId: string,
      params?: GetTransactionHistoryParams,
    ): Promise<PaginatedTransactions> => {
      const now: Date = new Date();
      const txn: TokenWalletTransaction = {
        transactionId: mockDefaultTxnId,
        walletId,
        type: "CREDIT_PURCHASE",
        amount: "0",
        balanceAfterTxn: "0",
        recordedByUserId: mockDefaultUserId,
        idempotencyKey: "mock-user-token-wallet-default",
        timestamp: now,
      };
      if (params?.fetchAll === true) {
        return Promise.resolve({
          transactions: [txn],
          totalCount: 1,
        });
      }
      return Promise.resolve({ transactions: [], totalCount: 0 });
    },
    getWalletByIdAndUser: (
      walletId: string,
      userId: string,
    ): Promise<TokenWallet | null> => {
      const now: Date = new Date();
      const wallet: TokenWallet = {
        walletId,
        userId,
        balance: "0",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      };
      return Promise.resolve(wallet);
    },
  });

export interface MockUserTokenWalletService {
  instance: IUserTokenWalletService;
  stubs: {
    getWallet: Stub<
      IUserTokenWalletService,
      Parameters<IUserTokenWalletService["getWallet"]>,
      ReturnType<IUserTokenWalletService["getWallet"]>
    >;
    getWalletForContext: Stub<
      IUserTokenWalletService,
      Parameters<IUserTokenWalletService["getWalletForContext"]>,
      ReturnType<IUserTokenWalletService["getWalletForContext"]>
    >;
    getBalance: Stub<
      IUserTokenWalletService,
      Parameters<IUserTokenWalletService["getBalance"]>,
      ReturnType<IUserTokenWalletService["getBalance"]>
    >;
    checkBalance: Stub<
      IUserTokenWalletService,
      Parameters<IUserTokenWalletService["checkBalance"]>,
      ReturnType<IUserTokenWalletService["checkBalance"]>
    >;
    getTransactionHistory: Stub<
      IUserTokenWalletService,
      Parameters<IUserTokenWalletService["getTransactionHistory"]>,
      ReturnType<IUserTokenWalletService["getTransactionHistory"]>
    >;
    getWalletByIdAndUser: Stub<
      IUserTokenWalletService,
      Parameters<IUserTokenWalletService["getWalletByIdAndUser"]>,
      ReturnType<IUserTokenWalletService["getWalletByIdAndUser"]>
    >;
  };
  clearStubs: () => void;
}

export function createMockUserTokenWalletService(
  config: UserTokenWalletServiceMethodImplementations = {},
): MockUserTokenWalletService {
  const defaults: Required<UserTokenWalletServiceMethodImplementations> =
    getMockUserTokenWalletServiceInternalDefaults();

  const mockServiceInstance: IUserTokenWalletService = {
    getWallet: defaults.getWallet,
    getWalletForContext: defaults.getWalletForContext,
    getBalance: defaults.getBalance,
    checkBalance: defaults.checkBalance,
    getTransactionHistory: defaults.getTransactionHistory,
    getWalletByIdAndUser: defaults.getWalletByIdAndUser,
  };

  const stubs: MockUserTokenWalletService["stubs"] = {
    getWallet: stub(
      mockServiceInstance,
      "getWallet",
      config.getWallet ?? defaults.getWallet,
    ),
    getWalletForContext: stub(
      mockServiceInstance,
      "getWalletForContext",
      config.getWalletForContext ?? defaults.getWalletForContext,
    ),
    getBalance: stub(
      mockServiceInstance,
      "getBalance",
      config.getBalance ?? defaults.getBalance,
    ),
    checkBalance: stub(
      mockServiceInstance,
      "checkBalance",
      config.checkBalance ?? defaults.checkBalance,
    ),
    getTransactionHistory: stub(
      mockServiceInstance,
      "getTransactionHistory",
      config.getTransactionHistory ?? defaults.getTransactionHistory,
    ),
    getWalletByIdAndUser: stub(
      mockServiceInstance,
      "getWalletByIdAndUser",
      config.getWalletByIdAndUser ?? defaults.getWalletByIdAndUser,
    ),
  };

  const clearStubs = (): void => {
    for (const s of Object.values(stubs)) {
      if (typeof s.restore === "function" && !s.restored) {
        s.restore();
      }
    }
  };

  return {
    instance: mockServiceInstance,
    stubs,
    clearStubs,
  };
}

export function asSupabaseUserClientForTests(
  client: IMockSupabaseClient,
): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}

export function buildUserTokenWalletRow(input: {
  walletId: string;
  userId: string | null;
  organizationId: string | null;
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}): TokenWalletRow {
  return {
    wallet_id: input.walletId,
    user_id: input.userId,
    organization_id: input.organizationId,
    balance: input.balance,
    currency: input.currency,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  };
}

export function buildUserTokenTransactionRow(input: {
  transactionId: string;
  walletId: string;
  transactionType: string;
  amount: number;
  balanceAfterTxn: number;
  recordedByUserId: string;
  idempotencyKey: string;
  timestamp: string;
  notes: string | null;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  paymentTransactionId: string | null;
}): TokenWalletTxnRow {
  return {
    transaction_id: input.transactionId,
    wallet_id: input.walletId,
    transaction_type: input.transactionType,
    amount: input.amount,
    balance_after_txn: input.balanceAfterTxn,
    recorded_by_user_id: input.recordedByUserId,
    idempotency_key: input.idempotencyKey,
    timestamp: input.timestamp,
    notes: input.notes,
    related_entity_id: input.relatedEntityId,
    related_entity_type: input.relatedEntityType,
    payment_transaction_id: input.paymentTransactionId,
  };
}

export function buildUserMockConfigGetWalletSelectSingle(
  row: TokenWalletRow | null,
  options: { error?: Error | null } = {},
): MockSupabaseDataConfig {
  const err: Error | null = options.error !== undefined ? options.error : null;
  if (row === null && err === null) {
    return {
      genericMockResults: {
        token_wallets: {
          select: { data: [], error: null },
        },
      },
    };
  }
  if (row === null && err !== null) {
    return {
      genericMockResults: {
        token_wallets: {
          select: { data: [], error: err },
        },
      },
    };
  }
  return {
    genericMockResults: {
      token_wallets: {
        select: { data: row !== null ? [row] : [], error: err },
      },
    },
  };
}

export function buildUserMockConfigGetWalletForContextMaybeSingle(
  row: TokenWalletRow | null,
  options: { error?: Error | null } = {},
): MockSupabaseDataConfig {
  const err: Error | null = options.error !== undefined ? options.error : null;
  return {
    genericMockResults: {
      token_wallets: {
        select: { data: row !== null ? [row] : [], error: err },
      },
    },
  };
}

export function buildUserMockConfigGetBalance(
  balanceText: string,
  options: { error?: Error | null } = {},
): MockSupabaseDataConfig {
  // Mock column validation treats `balance::text` as selecting `balance`; row must expose `balance`.
  const row: Record<string, string> = { balance: balanceText };
  return {
    genericMockResults: {
      token_wallets: {
        select: {
          data: [row],
          error: options.error !== undefined ? options.error : null,
        },
      },
    },
  };
}

export function buildUserMockConfigGetBalanceNotFound(): MockSupabaseDataConfig {
  return {
    genericMockResults: {
      token_wallets: {
        select: { data: [], error: null },
      },
    },
  };
}

export function buildUserMockConfigTransactionHistory(
  totalCount: number,
  rows: TokenWalletTxnRow[],
  options: { countError?: Error | null; dataError?: Error | null } = {},
): MockSupabaseDataConfig {
  const countErr: Error | null = options.countError !== undefined
    ? options.countError
    : null;
  const dataErr: Error | null = options.dataError !== undefined
    ? options.dataError
    : null;
  return {
    genericMockResults: {
      token_wallet_transactions: {
        select: (state: MockQueryBuilderState) => {
          const cols: string = state.selectColumns ?? "";
          const isCountHead: boolean = cols === "*";
          if (isCountHead) {
            return Promise.resolve({
              data: [],
              error: countErr,
              count: totalCount,
            });
          }
          return Promise.resolve({
            data: rows,
            error: dataErr,
            count: null,
          });
        },
      },
    },
  };
}
