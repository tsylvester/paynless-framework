import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from "jsr:@std/assert";
import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "jsr:@std/testing/bdd";
import {
  spy,
  type Spy,
  assertSpyCalls,
} from "jsr:@std/testing/mock";
// import * as AuthModule from "../_shared/auth.ts"; // Will be part of deps
import type { TokenWallet, TokenWalletTransaction } from "../_shared/types/tokenWallet.types.ts";
import { 
    walletHistoryRequestHandler, 
    type WalletHistoryHandlerDeps, 
    defaultDeps 
} from "./index.ts"; 
import { TokenWalletService as ActualTokenWalletService } from "../_shared/services/tokenWalletService.ts";
// import { logger as appLogger } from "../_shared/logger.ts"; // logger is part of deps

// --- Mock Data & Constants ---
const testUserId = "test-user-history-123";
const testOrgId = "test-org-history-456";
const mockUser = { id: testUserId, email: "test-history@example.com" };

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
  userId: undefined, // Or could be an admin user's ID if your model supports it
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

// --- Spies for Handler Dependencies ---
let mockGetUserSpy: Spy<any, [], Promise<{ data: { user: any | null }; error: any | null }>>;
let loggerInfoSpy: Spy<(...args: any[]) => void>;
let loggerErrorSpy: Spy<(...args: any[]) => void>;

// Spies for TokenWalletService methods
let mockGetWalletForContext: Spy<TokenWalletServiceInstanceType, [userId?: string, organizationId?: string], Promise<TokenWallet | null>>;
let mockGetTransactionHistory: Spy<TokenWalletServiceInstanceType, [walletId: string, limit?: number, offset?: number], Promise<TokenWalletTransaction[]>>;

// Spies for shared utility functions
let mockCreateErrorResponse: Spy<any>; // Adjust type based on actual createErrorResponse
let mockCreateSuccessResponse: Spy<any>; // Adjust type based on actual createSuccessResponse
let mockHandleCorsPreflightRequest: Spy<any>; // Adjust type based on actual handleCorsPreflightRequest

// Dummy type for TokenWalletService instance methods for spy typing
interface TokenWalletServiceInstanceType {
  getWalletForContext: (userId?: string, organizationId?: string) => Promise<TokenWallet | null>;
  getTransactionHistory: (walletId: string, limit?: number, offset?: number) => Promise<TokenWalletTransaction[]>;
  // Add other methods if they are ever called by the handler, even if not directly tested for output
  createWallet: () => Promise<any>;
  getWallet: () => Promise<any>;
  getBalance: () => Promise<any>;
  recordTransaction: () => Promise<any>;
  checkBalance: () => Promise<any>;
}

// Helper to create test dependencies - to be fleshed out
function createTestDeps(
  getWalletForContextImpl?: (userId?: string, organizationId?: string) => Promise<TokenWallet | null>,
  getTransactionHistoryImpl?: (walletId: string, limit?: number, offset?: number) => Promise<TokenWalletTransaction[]>
): Partial<WalletHistoryHandlerDeps> {
  // Use provided implementations or default to a new spy
  mockGetWalletForContext = spy(getWalletForContextImpl || (() => Promise.resolve(null))); 
  mockGetTransactionHistory = spy(getTransactionHistoryImpl || (() => Promise.resolve([])));

  const mockTokenWalletServiceInstance = {
    getWalletForContext: mockGetWalletForContext,
    getTransactionHistory: mockGetTransactionHistory,
    // Ensure all methods of ITokenWalletService are present, even if as basic spies
    // These are typically not called by this specific handler but fulfill the interface for the mock.
    createWallet: spy(() => Promise.reject(new Error("Not mocked in history test createWallet"))),
    getWallet: spy(() => Promise.reject(new Error("Not mocked in history test getWallet"))),
    getBalance: spy(() => Promise.reject(new Error("Not mocked in history test getBalance"))),
    recordTransaction: spy(() => Promise.reject(new Error("Not mocked in history test recordTransaction"))),
    checkBalance: spy(() => Promise.reject(new Error("Not mocked in history test checkBalance"))),
  } as unknown as ActualTokenWalletService; // Cast to ensure type compatibility

  const mockLogger = { info: loggerInfoSpy, error: loggerErrorSpy, warn: spy(), debug: spy() };
  const mockClientAuth = { getUser: mockGetUserSpy };
  const mockClientInstance = { auth: mockClientAuth };

  return {
    createSupabaseClient: () => mockClientInstance as any,
    tokenWalletServiceInstance: mockTokenWalletServiceInstance, // Use the fully mocked service instance
    logger: mockLogger as any,
    createErrorResponse: mockCreateErrorResponse,
    createSuccessResponse: mockCreateSuccessResponse,
    handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    NewTokenWalletService: ActualTokenWalletService, // Provide the actual service constructor for defaultDeps merge
  };
}

describe("Wallet History API Endpoint (/wallet-history)", () => {
  beforeEach(() => {
    mockGetUserSpy = spy(() => Promise.resolve({ data: { user: mockUser }, error: null }));
    loggerInfoSpy = spy();
    loggerErrorSpy = spy();

    // Default mock for createErrorResponse
    mockCreateErrorResponse = spy((message, status, _req, _originalError) => {
      return new Response(JSON.stringify({ error: { message: message } }), {
        status: status, headers: { "Content-Type": "application/json" },
      });
    });

    // Default mock for createSuccessResponse
    mockCreateSuccessResponse = spy((body, status, _req) => {
      return new Response(JSON.stringify(body), {
        status: status, headers: { "Content-Type": "application/json" },
      });
    });
    
    // Default mock for handleCorsPreflightRequest
    mockHandleCorsPreflightRequest = spy((_req) => null);

    // Reset spies for TokenWalletService methods - these will be set in createTestDeps or per test
    // mockGetWalletForContext and mockGetTransactionHistory will be fresh for each createTestDeps call
  });

  afterEach(() => {
    // Spies are new instances per test or re-assigned
  });

  // Pending initial implementation of the handler and full deps
  it("should return 401 if auth.getUser returns an error", async () => {
    mockGetUserSpy = spy(() => Promise.resolve({ data: { user: null }, error: { message: "Auth failed" } }));
    const partialTestDeps = createTestDeps();
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error.message, "Unauthorized");
    assertSpyCalls(loggerErrorSpy, 1);
    assertSpyCalls(mockGetUserSpy, 1);
  });

  it("should handle CORS preflight OPTIONS request", async () => {
    mockHandleCorsPreflightRequest = spy((_req) => {
      const headers = new Headers({"Content-Type": "application/json"});
      headers.set("access-control-allow-origin", "*");
      headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("access-control-allow-headers", "authorization, x-client-info, apikey, content-type");
      return new Response(null, { status: 204, headers: headers });
    });
    const partialTestDeps = createTestDeps();
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history", { method: "OPTIONS" });
    const res = await walletHistoryRequestHandler(req, testDeps);
    assertEquals(res.status, 204);
    assertExists(res.headers.get("access-control-allow-origin"));
  });
  
  it("should return 200 and empty data if wallet context is not found", async () => {
    // mockGetWalletForContext = spy(async (_userId?: string, _organizationId?: string) => Promise.resolve(null));

    const partialTestDeps = createTestDeps(
      async (_userId?: string, _organizationId?: string) => Promise.resolve(null) // Provide impl directly
    );
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data, []);
    assertSpyCalls(mockGetWalletForContext, 1);
    assertEquals(mockGetWalletForContext.calls[0].args[0], testUserId);
    assertEquals(mockGetWalletForContext.calls[0].args[1], undefined);
    assertSpyCalls(mockGetTransactionHistory, 0); // Should not be called
  });

  it("should return 200 and empty data if wallet found but no transactions", async () => {
    // mockGetWalletForContext = spy(async (_userId?: string, _organizationId?: string) => Promise.resolve(mockWallet));
    // mockGetTransactionHistory = spy(async (_walletId: string, _limit?: number, _offset?: number) => Promise.resolve([]));

    const partialTestDeps = createTestDeps(
      async (_userId?: string, _organizationId?: string) => Promise.resolve(mockWallet),
      async (_walletId: string, _limit?: number, _offset?: number) => Promise.resolve([])
    );
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data, []);
    assertSpyCalls(mockGetWalletForContext, 1);
    assertSpyCalls(mockGetTransactionHistory, 1);
    assertEquals(mockGetTransactionHistory.calls[0].args[0], mockWallet.walletId);
    assertEquals(mockGetTransactionHistory.calls[0].args[1], 20); // Default limit
    assertEquals(mockGetTransactionHistory.calls[0].args[2], 0);  // Default offset
  });

  it("should return 200 with transactions for user wallet (default pagination)", async () => {
    // mockGetWalletForContext = spy(async (_userId?: string, _organizationId?: string) => Promise.resolve(mockWallet));
    // mockGetTransactionHistory = spy(async (_walletId: string, _limit?: number, _offset?: number) => Promise.resolve(mockTransactionArray));

    const partialTestDeps = createTestDeps(
      async (_userId?: string, _organizationId?: string) => Promise.resolve(mockWallet),
      async (_walletId: string, _limit?: number, _offset?: number) => Promise.resolve(mockTransactionArray)
    );
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data, mockTransactionArray.map(tx => ({ ...tx, timestamp: tx.timestamp.toISOString() }))); // Compare with ISO strings for dates
    assertSpyCalls(mockGetWalletForContext, 1);
    assertSpyCalls(mockGetTransactionHistory, 1);
    assertEquals(mockGetTransactionHistory.calls[0].args[0], mockWallet.walletId);
    assertEquals(mockGetTransactionHistory.calls[0].args[1], 20);
    assertEquals(mockGetTransactionHistory.calls[0].args[2], 0);
  });

  it("should return 200 with transactions for org wallet (custom pagination)", async () => {
    const customLimit = 5;
    const customOffset = 10;
    // mockGetWalletForContext = spy(async (userId?: string, orgId?: string) => {
    //   assertEquals(userId, testUserId);
    //   assertEquals(orgId, testOrgId);
    //   return Promise.resolve(mockOrgWallet);
    // });
    // mockGetTransactionHistory = spy(async (_walletId: string, _limit?: number, _offset?: number) => Promise.resolve(mockTransactionArray.slice(0,1)));

    const partialTestDeps = createTestDeps(
      async (userId?: string, orgId?: string) => { // mockGetWalletForContext impl
        assertEquals(userId, testUserId);
        assertEquals(orgId, testOrgId);
        return Promise.resolve(mockOrgWallet);
      },
      async (_walletId: string, _limit?: number, _offset?: number) => { // mockGetTransactionHistory impl
        return Promise.resolve(mockTransactionArray.slice(0,1));
      }
    );
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request(`http://localhost/wallet-history?organizationId=${testOrgId}&limit=${customLimit}&offset=${customOffset}`);
    const res = await walletHistoryRequestHandler(req, testDeps);

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data, mockTransactionArray.slice(0,1).map(tx => ({ ...tx, timestamp: tx.timestamp.toISOString() })));
    assertSpyCalls(mockGetWalletForContext, 1);
    assertSpyCalls(mockGetTransactionHistory, 1);
    assertEquals(mockGetTransactionHistory.calls[0].args[0], mockOrgWallet.walletId);
    assertEquals(mockGetTransactionHistory.calls[0].args[1], customLimit);
    assertEquals(mockGetTransactionHistory.calls[0].args[2], customOffset);
  });

  it("should return 400 for invalid limit parameter", async () => {
    const partialTestDeps = createTestDeps(); // Default spy behavior is fine, not called
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history?limit=-1");
    const res = await walletHistoryRequestHandler(req, testDeps);

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.message, "Invalid limit or offset parameters");
    assertSpyCalls(mockGetWalletForContext, 0);
    assertSpyCalls(mockGetTransactionHistory, 0);
  });

  it("should return 400 for invalid offset parameter (NaN)", async () => {
    const partialTestDeps = createTestDeps(); // Default spy behavior is fine, not called
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history?offset=abc");
    const res = await walletHistoryRequestHandler(req, testDeps);

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.message, "Invalid limit or offset parameters");
    assertSpyCalls(mockGetWalletForContext, 0);
    assertSpyCalls(mockGetTransactionHistory, 0);
  });

  it("should return 500 if getTransactionHistory throws an error", async () => {
    const serviceErrorMessage = "Service failure during transaction fetch";
    // mockGetWalletForContext = spy(async (_userId?: string, _organizationId?: string) => Promise.resolve(mockWallet));
    // mockGetTransactionHistory = spy((_walletId: string, _limit?: number, _offset?: number) => {
    //   throw new Error(serviceErrorMessage);
    // });

    const partialTestDeps = createTestDeps(
      async (_userId?: string, _organizationId?: string) => Promise.resolve(mockWallet),
      (_walletId: string, _limit?: number, _offset?: number) => { // Synchronous throw
        throw new Error(serviceErrorMessage);
      }
    );
    const testDeps = { ...defaultDeps, ...partialTestDeps } as WalletHistoryHandlerDeps;
    const req = new Request("http://localhost/wallet-history");
    const res = await walletHistoryRequestHandler(req, testDeps);

    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error.message, serviceErrorMessage);
    assertSpyCalls(mockGetWalletForContext, 1);
    assertSpyCalls(mockGetTransactionHistory, 1);
  });

  // More tests to be added once handler is defined:
  // - getWalletForContext returns null -> 200 with empty data
  // - getWalletForContext returns wallet, getTransactionHistory returns empty array -> 200 with empty data
  // - getWalletForContext returns wallet, getTransactionHistory returns transactions -> 200 with transactions
  // - Correct parsing of limit and offset
  // - getTransactionHistory throws error -> 500
}); 