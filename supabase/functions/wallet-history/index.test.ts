import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert";
import {
  describe,
  it,
  beforeEach,
} from "jsr:@std/testing/bdd";
import {
  spy,
  type Spy,
  assertSpyCalls,
} from "jsr:@std/testing/mock";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  PaginatedTransactions,
  TokenWallet,
  TokenWalletTransaction,
} from "../_shared/types/tokenWallet.types.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
} from "../_shared/supabase.mock.ts";
import {
  createMockUserTokenWalletService,
  type MockUserTokenWalletService,
  type UserTokenWalletServiceMethodImplementations,
} from "../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import {
  walletHistoryRequestHandler,
  type WalletHistoryHandlerDeps,
  defaultDeps,
} from "./index.ts";

// --- Mock data ---
const testUserId: string = "test-user-history-123";
const testOrgId: string = "test-org-history-456";

const mockWallet: TokenWallet = {
  walletId: "wallet-history-abc-123",
  userId: testUserId,
  balance: "1000",
  currency: "AI_TOKEN",
  createdAt: new Date("2023-01-01T00:00:00Z"),
  updatedAt: new Date("2023-01-01T00:00:00Z"),
};

const mockOrgWallet: TokenWallet = {
  walletId: "wallet-history-org-xyz-789",
  organizationId: testOrgId,
  balance: "5000",
  currency: "AI_TOKEN",
  createdAt: new Date("2023-02-01T00:00:00Z"),
  updatedAt: new Date("2023-02-01T00:00:00Z"),
};

const mockTransactionArray: TokenWalletTransaction[] = [
  {
    transactionId: "txn-1",
    walletId: mockWallet.walletId,
    type: "CREDIT_PURCHASE",
    amount: "500",
    balanceAfterTxn: "1000",
    recordedByUserId: testUserId,
    timestamp: new Date("2023-01-01T10:00:00Z"),
    idempotencyKey: "idem-key-txn-1",
  },
  {
    transactionId: "txn-2",
    walletId: mockWallet.walletId,
    type: "DEBIT_USAGE",
    amount: "50",
    balanceAfterTxn: "950",
    recordedByUserId: testUserId,
    relatedEntityId: "chat-123",
    relatedEntityType: "chat_message",
    timestamp: new Date("2023-01-01T11:00:00Z"),
    idempotencyKey: "idem-key-txn-2",
  },
];

let mockCreateErrorResponse: Spy<typeof defaultDeps.createErrorResponse>;
let mockCreateSuccessResponse: Spy<typeof defaultDeps.createSuccessResponse>;
let mockHandleCorsPreflightRequest: Spy<typeof defaultDeps.handleCorsPreflightRequest>;

function buildWalletHistoryDeps(input: {
  supabase: MockSupabaseClientSetup;
  tokenWallet: MockUserTokenWalletService;
  createErrorResponse?: typeof defaultDeps.createErrorResponse;
  createSuccessResponse?: typeof defaultDeps.createSuccessResponse;
  handleCorsPreflightRequest?: typeof defaultDeps.handleCorsPreflightRequest;
}): WalletHistoryHandlerDeps {
  const createSupabaseClient: WalletHistoryHandlerDeps["createSupabaseClient"] = (
    _req: Request,
  ): SupabaseClient => {
    return input.supabase.client as unknown as SupabaseClient;
  };
  return {
    ...defaultDeps,
    createSupabaseClient,
    tokenWalletServiceInstance: input.tokenWallet.instance,
    NewTokenWalletService: defaultDeps.NewTokenWalletService,
    createErrorResponse: input.createErrorResponse ?? defaultDeps.createErrorResponse,
    createSuccessResponse: input.createSuccessResponse ?? defaultDeps.createSuccessResponse,
    handleCorsPreflightRequest: input.handleCorsPreflightRequest ??
      defaultDeps.handleCorsPreflightRequest,
  };
}

describe("Wallet History API Endpoint (/wallet-history)", () => {
  beforeEach(() => {
    mockCreateErrorResponse = spy((message, status, _req, _originalError) => {
      return new Response(JSON.stringify({ error: { message: message } }), {
        status: status,
        headers: { "Content-Type": "application/json" },
      });
    });

    mockCreateSuccessResponse = spy((body, status, _req) => {
      return new Response(JSON.stringify(body), {
        status: status,
        headers: { "Content-Type": "application/json" },
      });
    });

    mockHandleCorsPreflightRequest = spy((_req) => null);
  });

  it("should return 401 if auth.getUser returns an error", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {
      simulateAuthError: new Error("Auth failed"),
    });
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService();
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 401);
    const body: { error: { message: string } } = await res.json();
    assertEquals(body.error.message, "Unauthorized");
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should handle CORS preflight OPTIONS request", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService();
    mockHandleCorsPreflightRequest = spy((_req) => {
      const headers = new Headers({ "Content-Type": "application/json" });
      headers.set("access-control-allow-origin", "*");
      headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set(
        "access-control-allow-headers",
        "authorization, x-client-info, apikey, content-type",
      );
      return new Response(null, { status: 204, headers: headers });
    });
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history", { method: "OPTIONS" });
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 204);
    assertExists(res.headers.get("access-control-allow-origin"));
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should return 200 and empty paginated payload if wallet context is not found", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const walletConfig: UserTokenWalletServiceMethodImplementations = {
      getWalletForContext: () => Promise.resolve(null),
    };
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService(walletConfig);
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 200);
    const body: PaginatedTransactions = await res.json();
    assertEquals(body.transactions, []);
    assertEquals(body.totalCount, 0);
    assertEquals(tokenWallet.stubs.getWalletForContext.calls.length, 1);
    assertEquals(tokenWallet.stubs.getWalletForContext.calls[0].args[0], testUserId);
    assertEquals(tokenWallet.stubs.getWalletForContext.calls[0].args[1], undefined);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls.length, 0);
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should return 200 and empty transactions if wallet found but no transactions", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const emptyPage: PaginatedTransactions = { transactions: [], totalCount: 0 };
    const walletConfig: UserTokenWalletServiceMethodImplementations = {
      getWalletForContext: () => Promise.resolve(mockWallet),
      getTransactionHistory: () => Promise.resolve(emptyPage),
    };
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService(walletConfig);
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 200);
    const body: PaginatedTransactions = await res.json();
    assertEquals(body.transactions, []);
    assertEquals(body.totalCount, 0);
    assertEquals(tokenWallet.stubs.getWalletForContext.calls.length, 1);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls.length, 1);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls[0].args[0], mockWallet.walletId);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls[0].args[1], {});
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should return 200 with transactions for user wallet (default pagination)", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const page: PaginatedTransactions = {
      transactions: mockTransactionArray,
      totalCount: mockTransactionArray.length,
    };
    const walletConfig: UserTokenWalletServiceMethodImplementations = {
      getWalletForContext: () => Promise.resolve(mockWallet),
      getTransactionHistory: () => Promise.resolve(page),
    };
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService(walletConfig);
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 200);
    const body: PaginatedTransactions = await res.json();
    const expectedSerialized: string = JSON.stringify(
      mockTransactionArray.map((tx) => ({
        ...tx,
        timestamp: tx.timestamp.toISOString(),
      })),
    );
    assertEquals(JSON.stringify(body.transactions), expectedSerialized);
    assertEquals(body.totalCount, mockTransactionArray.length);
    assertEquals(tokenWallet.stubs.getWalletForContext.calls.length, 1);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls.length, 1);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls[0].args[0], mockWallet.walletId);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls[0].args[1], {});
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should return 200 with transactions for org wallet (custom pagination)", async () => {
    const customLimit = 5;
    const customOffset = 10;
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const slice: TokenWalletTransaction[] = mockTransactionArray.slice(0, 1);
    const page: PaginatedTransactions = {
      transactions: slice,
      totalCount: mockTransactionArray.length,
    };
    const walletConfig: UserTokenWalletServiceMethodImplementations = {
      getWalletForContext: (userId?: string, orgId?: string) => {
        assertEquals(userId, testUserId);
        assertEquals(orgId, testOrgId);
        return Promise.resolve(mockOrgWallet);
      },
      getTransactionHistory: () => Promise.resolve(page),
    };
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService(walletConfig);
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request(
      `http://localhost/wallet-history?organizationId=${testOrgId}&limit=${customLimit}&offset=${customOffset}`,
    );
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 200);
    const body: PaginatedTransactions = await res.json();
    const expectedOrgSerialized: string = JSON.stringify(
      slice.map((tx) => ({
        ...tx,
        timestamp: tx.timestamp.toISOString(),
      })),
    );
    assertEquals(JSON.stringify(body.transactions), expectedOrgSerialized);
    assertEquals(body.totalCount, mockTransactionArray.length);
    assertEquals(tokenWallet.stubs.getWalletForContext.calls.length, 1);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls.length, 1);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls[0].args[0], mockOrgWallet.walletId);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls[0].args[1], {
      limit: customLimit,
      offset: customOffset,
    });
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should return 400 for invalid limit parameter", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService();
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history?limit=-1");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 400);
    const body: { error: { message: string } } = await res.json();
    assertEquals(body.error.message, "Invalid limit parameter");
    assertEquals(tokenWallet.stubs.getWalletForContext.calls.length, 0);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls.length, 0);
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should return 400 for invalid offset parameter (NaN)", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService();
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history?offset=abc");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 400);
    const body: { error: { message: string } } = await res.json();
    assertEquals(body.error.message, "Invalid offset parameter");
    assertEquals(tokenWallet.stubs.getWalletForContext.calls.length, 0);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls.length, 0);
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });

  it("should return 500 if getTransactionHistory throws an error", async () => {
    const serviceErrorMessage = "Service failure during transaction fetch";
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const walletConfig: UserTokenWalletServiceMethodImplementations = {
      getWalletForContext: () => Promise.resolve(mockWallet),
      getTransactionHistory: () => {
        throw new Error(serviceErrorMessage);
      },
    };
    const tokenWallet: MockUserTokenWalletService = createMockUserTokenWalletService(walletConfig);
    const testDeps: WalletHistoryHandlerDeps = buildWalletHistoryDeps({
      supabase: mockSupabase,
      tokenWallet,
      createErrorResponse: mockCreateErrorResponse,
      createSuccessResponse: mockCreateSuccessResponse,
      handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    });

    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 500);
    const body: { error: { message: string } } = await res.json();
    assertEquals(body.error.message, serviceErrorMessage);
    assertEquals(tokenWallet.stubs.getWalletForContext.calls.length, 1);
    assertEquals(tokenWallet.stubs.getTransactionHistory.calls.length, 1);
    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    tokenWallet.clearStubs();
  });
});
