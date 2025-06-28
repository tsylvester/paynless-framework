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
  stub,
  type Stub,
  type Spy,
  assertSpyCalls,
} from "jsr:@std/testing/mock";
import * as AuthModule from "../_shared/auth.ts";
// Actual TokenWalletService is not directly used for instantiation in tests anymore
// import { TokenWalletService } from "../_shared/services/tokenWalletService.ts"; 
import type { TokenWallet } from "../_shared/types/tokenWallet.types.ts";
import { 
    walletInfoRequestHandler, 
    type WalletInfoHandlerDeps, 
    defaultDeps 
} from "./index.ts";
import { logger as appLogger } from "../_shared/logger.ts";

// --- Mock Data & Constants ---
const testUserId = "test-user-123";
const testOrgId = "test-org-456";
const mockUser = { id: testUserId, email: "test@example.com" };

const mockUserWallet: TokenWallet = {
  walletId: "wallet-user-abc-123",
  userId: testUserId,
  balance: "1000",
  currency: "AI_TOKEN",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- Mock Service Implementations ---
// REMOVE: let mockGetWalletForContext: Spy<any, [userId?: string, organizationId?: string], Promise<TokenWallet | null>>;

// --- Stubs and Spies for other deps ---
let mockGetUserSpy: Spy<any, [], Promise<{ data: { user: any | null }; error: any | null }>>;
let loggerInfoSpy: Spy<(...args: any[]) => void>;
let loggerErrorSpy: Spy<(...args: any[]) => void>;

let mockCreateErrorResponse: Spy<typeof defaultDeps.createErrorResponse>;
let mockHandleCorsPreflightRequest: Spy<typeof defaultDeps.handleCorsPreflightRequest>;

// Optional: Add spies for other logger methods if they are used and need assertion
// let loggerWarnSpy: Spy<(...args: any[]) => void>;
// let loggerDebugSpy: Spy<(...args: any[]) => void>;

// Helper to create test dependencies
function createTestDeps(getWalletImpl?: () => Promise<TokenWallet | null>): Partial<WalletInfoHandlerDeps> & { getWalletForContextSpy: Spy<any, [userId?: string, organizationId?: string], Promise<TokenWallet | null>>; spyIdToLog: string } {
  const defaultSpyImpl = getWalletImpl || (() => Promise.resolve(mockUserWallet));
  let callCount = 0; // Counter for this specific spy instance
  const spyId = `spy-${Math.random().toString(36).substring(2, 9)}`; // Unique ID for this spy instance

  const currentSpyInstanceLogger = (label: string, ...args: any[]) => {
    // console.log(`[SPY_TRACE ${label} #${currentSpyInstanceId}]`, ...args);
  };

  const getWalletForContextSpy = spy(async (userId?: string, organizationId?: string) => { 
    callCount++;
    const loggedArgs = [userId, organizationId];
    console.log(`[TEST_SPY_DEBUG spyId=${spyId}] mockGetWalletForContext CALLED. Local callCount: ${callCount}. Args: ${JSON.stringify(loggedArgs)}`);
    currentSpyInstanceLogger('mockGetWalletForContext_CALL', `Count: ${callCount}, Args: ${JSON.stringify(loggedArgs)}`);
    try {
      const result = await defaultSpyImpl(); 
      currentSpyInstanceLogger('mockGetWalletForContext_RESULT', `Result: ${JSON.stringify(result)}`);
      console.log(`[TEST_SPY_DEBUG spyId=${spyId}] mockGetWalletForContext returning. Result: ${JSON.stringify(result)}`);
      return result;
    } catch (e) {
      currentSpyInstanceLogger('mockGetWalletForContext_ERROR', `Error: ${e}`);
      console.error(`[TEST_SPY_DEBUG spyId=${spyId}] mockGetWalletForContext THREW. Error: ${e}`);
      throw e;
    }
  });
  (getWalletForContextSpy as any)._testSpyId = spyId; // Attach our ID to the spy object itself
  
  const mockLogger = {
    info: loggerInfoSpy,
    error: loggerErrorSpy,
    // Add other methods from appLogger as spies to ensure the mock logger matches the expected type.
    // If these are not asserted, a simple spy() is fine.
    warn: spy(), // Default spy if not asserting warn calls
    debug: spy(), // Default spy if not asserting debug calls
    // Ensure this mockLogger object fulfills the 'typeof actualLogger' or 'typeof appLogger' interface
  };

  const mockClientAuth = { getUser: mockGetUserSpy };
  const mockClientInstance = { auth: mockClientAuth };

  return {
    createSupabaseClient: () => mockClientInstance as any, 
    tokenWalletServiceInstance: {
      getWalletForContext: getWalletForContextSpy,
      createWallet: spy(() => Promise.reject(new Error("Not mocked"))),
      getWallet: spy(() => Promise.reject(new Error("Not mocked"))),
      getBalance: spy(() => Promise.reject(new Error("Not mocked"))),
      recordTransaction: spy(() => Promise.reject(new Error("Not mocked"))),
      checkBalance: spy(() => Promise.reject(new Error("Not mocked"))),
      getTransactionHistory: spy(() => Promise.reject(new Error("Not mocked"))),
    } as any, 
    logger: mockLogger as any, 
    createErrorResponse: mockCreateErrorResponse,
    handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    getWalletForContextSpy: getWalletForContextSpy, // Return the spy
    spyIdToLog: spyId, // Return the spyId for logging
  };
}


describe("Wallet Info API Endpoint (/wallet-info)", () => {
  beforeEach(() => {
    mockGetUserSpy = spy(() => Promise.resolve({ data: { user: mockUser }, error: null }));
    
    loggerInfoSpy = spy();
    loggerErrorSpy = spy();

    // Default mock for createErrorResponse
    // It takes the message, status, and original request
    mockCreateErrorResponse = spy((message, status, _req, _originalError) => {
      return new Response(JSON.stringify({ error: { message: message } }), {
        status: status,
        headers: { "Content-Type": "application/json" },
      });
    });

    // Default mock for handleCorsPreflightRequest
    // For most tests, we assume it's not a CORS preflight call it handles.
    mockHandleCorsPreflightRequest = spy((_req) => {
      return null; // Indicates not a CORS preflight handled by this function
    });
  });

  afterEach(() => {
    // Clear mock history after each test if necessary, or reset implementations
    // mockGetUserSpy.mockClear(); // REMOVE: Spies are new instances per test via beforeEach re-assignment
    // mockGetWalletForContext is re-initialized in createTestDeps, spies on logger are new
  });

  it("should return 401 if auth.getUser returns an error", async () => {
    // Configure mockGetUserSpy for this test case
    // mockGetUserSpy.mockReturnValue(Promise.resolve({ data: { user: null }, error: { message: "Auth failed" } })); // REPLACE
    mockGetUserSpy = spy(() => Promise.resolve({ data: { user: null }, error: { message: "Auth failed" } })); // RE-ASSIGN SPY
    
    const { getWalletForContextSpy, ...partialDeps } = createTestDeps(); 
    const testDeps = { ...defaultDeps, ...partialDeps };

    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer some-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps as WalletInfoHandlerDeps);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error.message, "Unauthorized");
    assertSpyCalls(loggerErrorSpy, 1);
    assertSpyCalls(mockGetUserSpy, 1);
    assert(loggerErrorSpy.calls[0].args[0].includes("Authentication error in /wallet-info"));
  });

  it("should return 401 if auth.getUser returns no user", async () => {
    // Configure mockGetUserSpy for this test case
    // mockGetUserSpy.mockReturnValue(Promise.resolve({ data: { user: null }, error: null })); // REPLACE
    mockGetUserSpy = spy(() => Promise.resolve({ data: { user: null }, error: null })); // RE-ASSIGN SPY

    const { getWalletForContextSpy, ...partialDeps } = createTestDeps();
    const testDeps = { ...defaultDeps, ...partialDeps }; 

    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer some-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps as WalletInfoHandlerDeps);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error.message, "Unauthorized");
    assertSpyCalls(loggerErrorSpy, 1);
    assertSpyCalls(mockGetUserSpy, 1);
    assert(loggerErrorSpy.calls[0].args[0].includes("Authentication error in /wallet-info"));
  });

  it("should call TokenWalletService.getWalletForContext with userId and undefined orgId if no orgId in query", async () => {
    // Default mockGetUserSpy behavior is fine (successful auth)
    const { getWalletForContextSpy, spyIdToLog, ...partialDeps } = createTestDeps();
    const testDeps = { ...defaultDeps, ...partialDeps }; 
    await walletInfoRequestHandler(new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    }), testDeps as WalletInfoHandlerDeps);

    console.log(`[TEST_ASSERT_DEBUG spyId=${spyIdToLog}] Asserting spy instance with _testSpyId: ${(getWalletForContextSpy as any)._testSpyId}. calls.length = ${getWalletForContextSpy.calls.length}. Calls array: ${JSON.stringify(getWalletForContextSpy.calls)}`);
    assertEquals(getWalletForContextSpy.calls.length, 1, `Spy ${spyIdToLog} should have been called once.`);
    assertEquals(getWalletForContextSpy.calls[0].args[0], testUserId);
    assertEquals(getWalletForContextSpy.calls[0].args[1], undefined);
    assertSpyCalls(loggerInfoSpy, 3); // EXPECT 3 CALLS
    assert(loggerInfoSpy.calls[0].args[0].includes(`Fetching wallet info for user: ${testUserId}, org: undefined`));
    assert(loggerInfoSpy.calls[1].args[0].includes(`Wallet data returned by tokenWalletService.getWalletForContext:`));
    assert(loggerInfoSpy.calls[2].args[0].includes(`Sending wallet directly as response body:`));
  });

  it("should call TokenWalletService.getWalletForContext with userId and orgId if orgId is in query", async () => {
    const { getWalletForContextSpy, spyIdToLog, ...partialDeps } = createTestDeps();
    const testDeps = { ...defaultDeps, ...partialDeps }; 
    await walletInfoRequestHandler(new Request(`http://localhost/wallet-info?organizationId=${testOrgId}`, {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    }), testDeps as WalletInfoHandlerDeps);

    console.log(`[TEST_ASSERT_DEBUG spyId=${spyIdToLog}] Asserting spy instance with _testSpyId: ${(getWalletForContextSpy as any)._testSpyId}. calls.length = ${getWalletForContextSpy.calls.length}. Calls array: ${JSON.stringify(getWalletForContextSpy.calls)}`);
    assertEquals(getWalletForContextSpy.calls.length, 1, `Spy ${spyIdToLog} should have been called once.`);
    assertEquals(getWalletForContextSpy.calls[0].args[0], testUserId);
    assertEquals(getWalletForContextSpy.calls[0].args[1], testOrgId);
    assertSpyCalls(loggerInfoSpy, 3); // EXPECT 3 CALLS
    assert(loggerInfoSpy.calls[0].args[0].includes(`Fetching wallet info for user: ${testUserId}, org: ${testOrgId}`));
    assert(loggerInfoSpy.calls[1].args[0].includes(`Wallet data returned by tokenWalletService.getWalletForContext:`));
    assert(loggerInfoSpy.calls[2].args[0].includes(`Sending wallet directly as response body:`));
  });

  it("should return 200 and wallet data if wallet is found", async () => {
    const { getWalletForContextSpy, spyIdToLog, ...partialDeps } = createTestDeps(); 
    const testDeps = { ...defaultDeps, ...partialDeps };
    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps as WalletInfoHandlerDeps);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertExists(body);
    assertEquals(body.walletId, mockUserWallet.walletId);
    assertEquals(body.userId, mockUserWallet.userId);
    assertEquals(new Date(body.createdAt).toISOString(), mockUserWallet.createdAt.toISOString());
    assertSpyCalls(loggerInfoSpy, 3); // EXPECT 3 CALLS
  });

  it("should return 200 and data:null if wallet is not found by service", async () => {
    const { getWalletForContextSpy, spyIdToLog, ...partialDeps } = createTestDeps(() => Promise.resolve(null)); 
    const testDeps = { ...defaultDeps, ...partialDeps };
    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps as WalletInfoHandlerDeps);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body, null);
    console.log(`[TEST_ASSERT_DEBUG spyId=${spyIdToLog}] Asserting spy instance with _testSpyId: ${(getWalletForContextSpy as any)._testSpyId}. calls.length = ${getWalletForContextSpy.calls.length}. Calls array: ${JSON.stringify(getWalletForContextSpy.calls)}`);
    assertEquals(getWalletForContextSpy.calls.length, 1, `Spy ${spyIdToLog} should have been called once.`);
    assertSpyCalls(loggerInfoSpy, 3); // EXPECT 3 CALLS
  });

  it("should return 500 if getWalletForContext throws an error", async () => {
    // Default mockGetUserSpy behavior is fine
    const errorMessage = "Simulated service error";
    const { getWalletForContextSpy, ...partialDeps } = createTestDeps(() => Promise.reject(new Error(errorMessage)));
    const testDeps = { ...defaultDeps, ...partialDeps };
    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps as WalletInfoHandlerDeps);
    assertEquals(res.status, 500);
    const body = await res.json();
    assertExists(body.error);
    assertEquals(body.error.message, errorMessage);
    assertSpyCalls(getWalletForContextSpy, 1);
    assertSpyCalls(loggerErrorSpy, 1);
    assert(loggerErrorSpy.calls[0].args[0].includes("Error in /wallet-info function"));
    assert(loggerErrorSpy.calls[0].args[1].error.includes(errorMessage));
  });

  it("should handle CORS preflight OPTIONS request", async () => {
    // Specific mock for this test: handleCorsPreflightRequest returns a CORS response
    mockHandleCorsPreflightRequest = spy((_req) => {
      const headers = new Headers();
      headers.set("access-control-allow-origin", "http://example.com"); // Or "*" if that's your general policy
      headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("access-control-allow-headers", "authorization, x-client-info, apikey, content-type");
      // Add other necessary CORS headers
      return new Response(null, { status: 204, headers: headers });
    });
    
    const { getWalletForContextSpy, ...partialDeps } = createTestDeps(); 
    const testDeps = { ...defaultDeps, ...partialDeps };
    const req = new Request("http://localhost/wallet-info", {
      method: "OPTIONS",
      headers: {
        "Origin": "http://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    const res = await walletInfoRequestHandler(req, testDeps as WalletInfoHandlerDeps);
    assertEquals(res.status, 204); 
    assertExists(res.headers.get("access-control-allow-origin"));
    assertExists(res.headers.get("access-control-allow-methods"));
  });
}); 