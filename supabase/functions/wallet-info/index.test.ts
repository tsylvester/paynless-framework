import {
  assert,
  assertEquals,
  assertExists,
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
import type { TokenWallet } from "../_shared/types/tokenWallet.types.ts";
import {
  walletInfoRequestHandler,
  type WalletInfoHandlerDeps,
  defaultDeps,
} from "./index.ts";
import { createMockUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.provides.ts";
import type { IUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import type { ILogger, LogMetadata } from "../_shared/types.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";

const mockLogger: ILogger = new MockLogger();
const testUserId: string = "test-user-123";
const testOrgId: string = "test-org-456";
const mockUser = { id: testUserId, email: "test@example.com" };

const mockUserWallet: TokenWallet = {
  walletId: "wallet-user-abc-123",
  userId: testUserId,
  balance: "1000",
  currency: "AI_TOKEN",
  createdAt: new Date(),
  updatedAt: new Date(),
};

let mockGetUserSpy: Spy<
  any,
  [],
  Promise<{ data: { user: typeof mockUser | null }; error: { message: string } | null }>
>;
let loggerInfoSpy: Spy<ILogger, [string, LogMetadata?], void>;
let loggerErrorSpy: Spy<ILogger, [string | Error, LogMetadata?], void>;

let mockCreateErrorResponse: Spy<typeof defaultDeps.createErrorResponse>;
let mockHandleCorsPreflightRequest: Spy<typeof defaultDeps.handleCorsPreflightRequest>;

function createTestDeps(
  getWalletImpl?: () => Promise<TokenWallet | null>,
): Partial<WalletInfoHandlerDeps> & {
  getWalletForContextStub: ReturnType<
    typeof createMockUserTokenWalletService
  >["stubs"]["getWalletForContext"];
  spyIdToLog: string;
} {
  const spyIdToLog: string = `spy-${Math.random().toString(36).substring(2, 9)}`;

  const getWalletForContextImpl: IUserTokenWalletService["getWalletForContext"] =
    getWalletImpl === undefined
      ? async (
        _userId?: string,
        _organizationId?: string,
      ): Promise<TokenWallet | null> => mockUserWallet
      : async (
        _userId?: string,
        _organizationId?: string,
      ): Promise<TokenWallet | null> => {
        return getWalletImpl();
      };

  const mockUserTokenWallet: ReturnType<typeof createMockUserTokenWalletService> =
    createMockUserTokenWalletService({
      getWalletForContext: getWalletForContextImpl,
    });

  const mockClientAuth: { getUser: typeof mockGetUserSpy } = {
    getUser: mockGetUserSpy,
  };
  const mockClientInstance: { auth: typeof mockClientAuth } = {
    auth: mockClientAuth,
  };

  return {
    createSupabaseClient: (_req: Request): SupabaseClient<Database> =>
      mockClientInstance as unknown as SupabaseClient<Database>,
    createUserTokenWalletService: (
      _userClient: SupabaseClient<Database>,
    ): IUserTokenWalletService => {
      return mockUserTokenWallet.instance;
    },
    logger: mockLogger,
    createErrorResponse: mockCreateErrorResponse,
    handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
    getWalletForContextStub: mockUserTokenWallet.stubs.getWalletForContext,
    spyIdToLog,
  };
}

describe("Wallet Info API Endpoint (/wallet-info)", () => {
  beforeEach(() => {
    mockGetUserSpy = spy(() =>
      Promise.resolve({ data: { user: mockUser }, error: null })
    );

    loggerInfoSpy = spy(mockLogger, "info");
    loggerErrorSpy = spy(mockLogger, "error");

    mockCreateErrorResponse = spy((message, status, _req, _originalError) => {
      return new Response(JSON.stringify({ error: { message: message } }), {
        status: status,
        headers: { "Content-Type": "application/json" },
      });
    });

    mockHandleCorsPreflightRequest = spy((_req) => {
      return null;
    });
  });

  afterEach(() => {
    loggerInfoSpy.restore();
    loggerErrorSpy.restore();
  });

  it("should return 401 if auth.getUser returns an error", async () => {
    mockGetUserSpy = spy(() =>
      Promise.resolve({ data: { user: null }, error: { message: "Auth failed" } })
    );

    const { getWalletForContextStub: _stub, spyIdToLog: _log, ...partialDeps } =
      createTestDeps();
    const testDeps: WalletInfoHandlerDeps = {
      ...defaultDeps,
      ...partialDeps,
    };

    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer some-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error.message, "Unauthorized");
    assertSpyCalls(loggerErrorSpy, 1);
    assertSpyCalls(mockGetUserSpy, 1);
    assert(
      String(loggerErrorSpy.calls[0].args[0]).includes(
        "Authentication error in /wallet-info",
      ),
    );
  });

  it("should return 401 if auth.getUser returns no user", async () => {
    mockGetUserSpy = spy(() =>
      Promise.resolve({ data: { user: null }, error: null })
    );

    const { getWalletForContextStub: _stub, spyIdToLog: _log, ...partialDeps } =
      createTestDeps();
    const testDeps: WalletInfoHandlerDeps = {
      ...defaultDeps,
      ...partialDeps,
    };

    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer some-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error.message, "Unauthorized");
    assertSpyCalls(loggerErrorSpy, 1);
    assertSpyCalls(mockGetUserSpy, 1);
    assert(
      String(loggerErrorSpy.calls[0].args[0]).includes(
        "Authentication error in /wallet-info",
      ),
    );
  });

  it(
    "should call IUserTokenWalletService.getWalletForContext with userId and undefined orgId if no orgId in query",
    async () => {
      const { getWalletForContextStub, spyIdToLog, ...partialDeps } = createTestDeps();
      const testDeps: WalletInfoHandlerDeps = {
        ...defaultDeps,
        ...partialDeps,
      };
      await walletInfoRequestHandler(new Request("http://localhost/wallet-info", {
        method: "GET",
        headers: { Authorization: "Bearer valid-token" },
      }), testDeps);

      assertEquals(getWalletForContextStub.calls.length, 1, `Stub ${spyIdToLog} should have been called once.`);
      assertEquals(getWalletForContextStub.calls[0].args[0], testUserId);
      assertEquals(getWalletForContextStub.calls[0].args[1], undefined);
      assertSpyCalls(loggerInfoSpy, 3);
      assert(loggerInfoSpy.calls[0].args[0].includes(`Fetching wallet info for user: ${testUserId}, org: undefined`));
      assert(loggerInfoSpy.calls[1].args[0].includes(`Wallet data returned by tokenWalletService.getWalletForContext:`));
      assert(loggerInfoSpy.calls[2].args[0].includes(`Sending wallet directly as response body:`));
    },
  );

  it(
    "should call IUserTokenWalletService.getWalletForContext with userId and orgId if orgId is in query",
    async () => {
      const { getWalletForContextStub, spyIdToLog, ...partialDeps } = createTestDeps();
      const testDeps: WalletInfoHandlerDeps = {
        ...defaultDeps,
        ...partialDeps,
      };
      await walletInfoRequestHandler(new Request(`http://localhost/wallet-info?organizationId=${testOrgId}`, {
        method: "GET",
        headers: { Authorization: "Bearer valid-token" },
      }), testDeps);

      assertEquals(getWalletForContextStub.calls.length, 1, `Stub ${spyIdToLog} should have been called once.`);
      assertEquals(getWalletForContextStub.calls[0].args[0], testUserId);
      assertEquals(getWalletForContextStub.calls[0].args[1], testOrgId);
      assertSpyCalls(loggerInfoSpy, 3);
      assert(loggerInfoSpy.calls[0].args[0].includes(`Fetching wallet info for user: ${testUserId}, org: ${testOrgId}`));
      assert(loggerInfoSpy.calls[1].args[0].includes(`Wallet data returned by tokenWalletService.getWalletForContext:`));
      assert(loggerInfoSpy.calls[2].args[0].includes(`Sending wallet directly as response body:`));
    },
  );

  it("should return 200 and wallet data if wallet is found", async () => {
    const { getWalletForContextStub: _stub, spyIdToLog: _log, ...partialDeps } = createTestDeps();
    const testDeps: WalletInfoHandlerDeps = {
      ...defaultDeps,
      ...partialDeps,
    };
    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertExists(body);
    assertEquals(body.walletId, mockUserWallet.walletId);
    assertEquals(body.userId, mockUserWallet.userId);
    assertEquals(new Date(body.createdAt).toISOString(), mockUserWallet.createdAt.toISOString());
    assertSpyCalls(loggerInfoSpy, 3);
  });

  it("should return 200 and data:null if wallet is not found by service", async () => {
    const { getWalletForContextStub, spyIdToLog, ...partialDeps } = createTestDeps(() =>
      Promise.resolve(null)
    );
    const testDeps: WalletInfoHandlerDeps = {
      ...defaultDeps,
      ...partialDeps,
    };
    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body, null);
    assertEquals(getWalletForContextStub.calls.length, 1, `Stub ${spyIdToLog} should have been called once.`);
    assertSpyCalls(loggerInfoSpy, 3);
  });

  it("should return 500 if getWalletForContext throws an error", async () => {
    const errorMessage: string = "Simulated service error";
    const { getWalletForContextStub, ...partialDeps } = createTestDeps(() =>
      Promise.reject(new Error(errorMessage))
    );
    const testDeps: WalletInfoHandlerDeps = {
      ...defaultDeps,
      ...partialDeps,
    };
    const req = new Request("http://localhost/wallet-info", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await walletInfoRequestHandler(req, testDeps);
    assertEquals(res.status, 500);
    const body = await res.json();
    assertExists(body.error);
    assertEquals(body.error.message, errorMessage);
    assertEquals(getWalletForContextStub.calls.length, 1);
    assertSpyCalls(loggerErrorSpy, 1);
    assert(
      String(loggerErrorSpy.calls[0].args[0]).includes("Error in /wallet-info function"),
    );
    const errorLogMeta: LogMetadata | undefined = loggerErrorSpy.calls[0].args[1];
    assertExists(errorLogMeta);
    assert(typeof errorLogMeta === "object" && errorLogMeta !== null && "error" in errorLogMeta);
    const nestedError: unknown = errorLogMeta.error;
    assert(typeof nestedError === "string" && nestedError.includes(errorMessage));
  });

  it("should handle CORS preflight OPTIONS request", async () => {
    mockHandleCorsPreflightRequest = spy((_req) => {
      const headers = new Headers();
      headers.set("access-control-allow-origin", "http://example.com");
      headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("access-control-allow-headers", "authorization, x-client-info, apikey, content-type");
      return new Response(null, { status: 204, headers: headers });
    });

    const { getWalletForContextStub: _unusedWalletStub, ...partialDeps } = createTestDeps();
    const testDeps: WalletInfoHandlerDeps = {
      ...defaultDeps,
      ...partialDeps,
    };
    const req = new Request("http://localhost/wallet-info", {
      method: "OPTIONS",
      headers: {
        "Origin": "http://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    const res = await walletInfoRequestHandler(req, testDeps);
    assertEquals(res.status, 204);
    assertExists(res.headers.get("access-control-allow-origin"));
    assertExists(res.headers.get("access-control-allow-methods"));
  });
});
