import {
  assert,
  assertEquals,
  assertExists,
  assertMatch,
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
  resolvesNext,
  assertSpyCalls,
} from "jsr:@std/testing/mock";

// Import the handler from the module we want to test
import { handleAllocatePeriodicTokens } from "./index.ts"; 

// Mock utilities
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { createMockTokenWalletService, type MockTokenWalletService } from "../_shared/services/tokenWalletService.mock.ts";
import type { TokenWalletService } from "../_shared/services/tokenWalletService.ts"; // Import concrete class for casting
import type { ITokenWalletService } from "../_shared/types/tokenWallet.types.ts"; // Import ITokenWalletService for parameter typing

// Types
import type { Database } from '../types_db.ts';
import type { TokenWalletTransaction } from "../_shared/types/tokenWallet.types.ts";

const mockServiceRoleKey = "test-service-role-key";
const mockSupabaseUrl = "http://localhost:54321";
const SYSTEM_USER_ID = '19c35c50-eab5-49db-997f-e6fea60253eb'; // Define SYSTEM_USER_ID

describe("POST /allocate-periodic-tokens", () => {
  let mockSupabase: MockSupabaseClientSetup;
  let mockTokenWallet: MockTokenWalletService;
  let denoEnvGetStub: Stub<typeof Deno.env, [string], string | undefined>;

  beforeEach(() => {
    denoEnvGetStub = stub(Deno.env, "get", (key: string) => {
      if (key === "SB_URL") return mockSupabaseUrl;
      if (key === "SB_SERVICE_ROLE_KEY") return mockServiceRoleKey;
      console.warn(`[Test Env Stub] Deno.env.get called with unmocked key: ${key}`);
      return undefined;
    });

    // Create fresh mocks for each test
    mockSupabase = createMockSupabaseClient({
      // genericMockResults: { /* configure specific table responses if needed */ },
      // rpcResults: { /* configure specific rpc responses if needed */ }
    });
    
    mockTokenWallet = createMockTokenWalletService({
      // recordTransaction: async (params) => { /* custom mock logic */ return mockTransaction; }
    });
  });

  afterEach(() => {
    denoEnvGetStub.restore();
    if (mockSupabase && mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
    if (mockTokenWallet && mockTokenWallet.clearStubs) {
      mockTokenWallet.clearStubs();
    }
  });

  it("should return 405 Method Not Allowed if method is not POST", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
      method: "GET", 
    });
    
    // Pass the mocked Supabase client and TokenWalletService instances
    const response = await handleAllocatePeriodicTokens(
      request, 
      mockSupabase.client as any, // Cast to any to satisfy SupabaseClient<Database> temporarily if types mismatch
      mockTokenWallet.instance as TokenWalletService // Cast to concrete type
    );
    
    assertEquals(response.status, 405);
    const body = await response.text();
    assertEquals(body, "Method Not Allowed");
  });

  it("should return 500 if free plan details cannot be fetched", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    // Configure the mock Supabase client to return an error for the 'subscription_plans' query
    mockSupabase = createMockSupabaseClient({
      genericMockResults: {
        subscription_plans: {
          select: () => Promise.resolve({ data: null, error: new Error("DB error fetching plan"), count: 0, status: 500, statusText: "DB Error" })
        }
      }
    });
    
    const response = await handleAllocatePeriodicTokens(
      request,
      mockSupabase.client as any, 
      mockTokenWallet.instance as TokenWalletService // Cast to concrete type
    );

    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(body.error, "Free plan configuration not found.");
    
    // Verify that 'from' was called on 'subscription_plans'
    assertSpyCalls(mockSupabase.spies.fromSpy, 1);
    const fromSpyCall = mockSupabase.spies.fromSpy.calls[0];
    assertEquals(fromSpyCall.args[0], 'subscription_plans');

    // Get the query builder for 'subscription_plans' and verify its spies
    const qbSpies = mockSupabase.spies.getLatestQueryBuilderSpies('subscription_plans');
    assertExists(qbSpies, "Query builder spies for 'subscription_plans' should exist");
    assertExists(qbSpies.select, "Select spy for 'subscription_plans' should exist");
    assertSpyCalls(qbSpies.select, 1);
    assertExists(qbSpies.eq, "Eq spy for 'subscription_plans' should exist");
    assertSpyCalls(qbSpies.eq, 2); // item_id_internal and name
    assertExists(qbSpies.single, "Single spy for 'subscription_plans' should exist");
    assertSpyCalls(qbSpies.single, 1);
  });
  
  it("should return 500 if free plan has no tokens_to_award", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });

    mockSupabase = createMockSupabaseClient({
        genericMockResults: {
            subscription_plans: {
                select: () => Promise.resolve({
                    data: [{ 
                        id: 'free-plan-id-mock', 
                        tokens_to_award: 0, // Key condition for this test
                        interval: 'month', 
                        interval_count: 1 
                    }],
                    error: null,
                    count: 1,
                    status: 200,
                    statusText: "OK"
                })
            }
        }
    });

    const response = await handleAllocatePeriodicTokens(
        request,
        mockSupabase.client as any,
        mockTokenWallet.instance as TokenWalletService // Cast to concrete type
    );

    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(body.error, "Free plan tokens_to_award is not configured or is zero.");
  });

  it("should return 200 if no users are due for allocation", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });

    mockSupabase = createMockSupabaseClient({
        genericMockResults: {
            subscription_plans: {
                select: () => Promise.resolve({
                    data: [{ id: 'free-plan-id-mock', tokens_to_award: 100000, interval: 'month', interval_count: 1 }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            user_subscriptions: { // No users found or all are up-to-date
                select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" })
            }
        }
    });

    const response = await handleAllocatePeriodicTokens(
        request,
        mockSupabase.client as any,
        mockTokenWallet.instance as TokenWalletService // Cast to concrete type
    );

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.message, "No users due for allocation.");
  });
  
  it("should successfully allocate tokens to one user", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });

    const mockUserId = "user-due-for-tokens";
    const mockPlanId = "free-plan-id-mock";
    const mockWalletId = "wallet-for-user-due";
    const tokensToAward = 100000;
    const oldPeriodEnd = new Date();
    oldPeriodEnd.setDate(oldPeriodEnd.getDate() - 1); // 1 day in the past
    const oldPeriodStart = new Date(oldPeriodEnd);
    oldPeriodStart.setMonth(oldPeriodStart.getMonth() - 1);

    const mockTransactionResult: TokenWalletTransaction = {
        transactionId: "txn-mock-id-success",
        walletId: mockWalletId,
        type: "CREDIT_MONTHLY_FREE_ALLOCATION",
        amount: String(tokensToAward),
        balanceAfterTxn: String(tokensToAward), // Assuming starts from 0 for simplicity
        recordedByUserId: "19c35c50-eab5-49db-997f-e6fea60253eb", // Actual SYSTEM_USER_ID from index.ts
        timestamp: new Date(),
        // notes, relatedEntityId, etc., are optional
    };

    const updateSubscriptionSpy = spy((_state: MockQueryBuilderState) => 
        Promise.resolve({ data: [{id: "sub-id-due"}], error: null, count: 1, status: 200, statusText: "OK" })
    );

    mockSupabase = createMockSupabaseClient({
        genericMockResults: {
            subscription_plans: {
                select: () => Promise.resolve({
                    data: [{ id: mockPlanId, tokens_to_award: tokensToAward, interval: 'month', interval_count: 1 }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            user_subscriptions: { 
                select: (state: MockQueryBuilderState) => { 
                    return Promise.resolve({ 
                        data: [{
                            id: "sub-id-due", 
                            user_id: mockUserId, 
                            plan_id: mockPlanId,
                            current_period_start: oldPeriodStart.toISOString(),
                            current_period_end: oldPeriodEnd.toISOString(),
                            status: 'free'
                        }], 
                        error: null, 
                        count: 1, 
                        status: 200, 
                        statusText: "OK" 
                    });
                },
                update: updateSubscriptionSpy // Use the spy here
            },
            token_wallets: {
                select: () => Promise.resolve({
                    data: [{ wallet_id: mockWalletId, user_id: mockUserId }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            }
        }
    });
    
    // Define the mock implementation with correct signature
    const actualMockRecordTransactionImpl = async (
      _params: Parameters<ITokenWalletService['recordTransaction']>[0]
    ): Promise<TokenWalletTransaction> => {
      return mockTransactionResult;
    };
    
    mockTokenWallet = createMockTokenWalletService({
        recordTransaction: actualMockRecordTransactionImpl // Pass the raw implementation directly
    });

    const response = await handleAllocatePeriodicTokens(
        request,
        mockSupabase.client as any,
        mockTokenWallet.instance as TokenWalletService
    );

    assertEquals(response.status, 200);
    const body = await response.json();
    assert(body.summary.includes("Tokens awarded to: 1"), "Summary should indicate 1 user allocated");
    assert(body.summary.includes("Failed attempts: 0"), "Summary should indicate 0 failed attempts");

    // Check Supabase calls
    // fromSpy is called for subscription_plans, user_subscriptions (select), token_wallets, user_subscriptions (update)
    assertSpyCalls(mockSupabase.spies.fromSpy, 4); 

    // Check subscription_plans call
    const planQbSpies = mockSupabase.spies.getLatestQueryBuilderSpies('subscription_plans');
    assertExists(planQbSpies?.select, "Select spy for subscription_plans should exist");
    assertSpyCalls(planQbSpies!.select, 1);

    // Ensure user_subscriptions select spy is asserted correctly if needed, getHistoricBuildersForTable might be better here too
    const historicUserSubBuildersForSelect = mockSupabase.client.getHistoricBuildersForTable('user_subscriptions');
    assertExists(historicUserSubBuildersForSelect, "Historic builders for user_subscriptions should exist.");
    const userSubSelectBuilder = historicUserSubBuildersForSelect.find(b => (b as any)._state.operation === 'select');
    assertExists(userSubSelectBuilder, "Select query builder for user_subscriptions should exist in history.");
    assertExists(userSubSelectBuilder.methodSpies.select, "Select spy for user_subscriptions should exist on historic builder.");
    assertSpyCalls(userSubSelectBuilder.methodSpies.select, 1);

    // Check token_wallets select call
    const walletQbSpies = mockSupabase.spies.getLatestQueryBuilderSpies('token_wallets');
    assertExists(walletQbSpies, "QB spies for token_wallets should exist");
    assertExists(walletQbSpies.select, "Select spy for token_wallets should exist");
    assertSpyCalls(walletQbSpies.select, 1);
    assertExists(walletQbSpies.eq, "Eq spy for token_wallets should exist");
    assertSpyCalls(walletQbSpies.eq, 1); // Called for user_id
    assertEquals(walletQbSpies.eq.calls[0].args[0], 'user_id');
    assertEquals(walletQbSpies.eq.calls[0].args[1], mockUserId);

    // Check TokenWalletService.recordTransaction call
    const serviceInternalRecordTransactionStub = mockTokenWallet.stubs.recordTransaction;
    assertSpyCalls(serviceInternalRecordTransactionStub, 1); 
    
    const firstCall = serviceInternalRecordTransactionStub.calls[0];
    assertExists(firstCall, "First call to serviceInternalRecordTransactionStub should exist after spy call assertion.");
    
    const recordTxnArgs = firstCall.args[0];
    assertExists(recordTxnArgs, "Arguments for recordTransaction should exist.");

    assertEquals(recordTxnArgs.walletId, mockWalletId);
    assertEquals(recordTxnArgs.type, "CREDIT_MONTHLY_FREE_ALLOCATION");
    assertEquals(recordTxnArgs.amount, String(tokensToAward));
    assertEquals(recordTxnArgs.relatedEntityId, mockPlanId);
    assertEquals(recordTxnArgs.recordedByUserId, '19c35c50-eab5-49db-997f-e6fea60253eb');

    // Check user_subscriptions update call
    const userSubUpdateQbSpies = mockSupabase.spies.getLatestQueryBuilderSpies('user_subscriptions');
    assertExists(userSubUpdateQbSpies, "QB spies for user_subscriptions (update) should exist");

    assertExists(userSubUpdateQbSpies.update, "Update spy for user_subscriptions should exist");
    assertSpyCalls(userSubUpdateQbSpies.update, 1);
    const updateCallArgs = userSubUpdateQbSpies.update.calls[0].args[0];
    assertExists(updateCallArgs, "Arguments for user_subscriptions.update should exist");

    const updateData = updateCallArgs as { current_period_start?: string, current_period_end?: string, updated_at?: string };
    assertEquals(updateData.current_period_start, oldPeriodEnd.toISOString(), "New period start should be old period end");
    assertExists(updateData.current_period_end, "New period end should be defined");
    const newPeriodEnd = new Date(updateData.current_period_end!);
    const expectedNewPeriodEnd = new Date(oldPeriodEnd);
    expectedNewPeriodEnd.setMonth(expectedNewPeriodEnd.getMonth() + 1);
    assertEquals(newPeriodEnd.toISOString().substring(0,10), expectedNewPeriodEnd.toISOString().substring(0,10));
    assertExists(updateData.updated_at, "updated_at should be set");

    assertExists(userSubUpdateQbSpies.eq, "Eq spy for user_subscriptions (update) should exist");
    assertSpyCalls(userSubUpdateQbSpies.eq, 1); // Called for id on the update builder
    assertEquals(userSubUpdateQbSpies.eq.calls[0].args[0], 'id');
    assertEquals(userSubUpdateQbSpies.eq.calls[0].args[1], 'sub-id-due');
  });

  it("should successfully allocate tokens to multiple users", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });

    const mockPlanId = "free-plan-id-multi-mock";
    const tokensToAward = 150000;
    const now = new Date();
    const oldPeriodEnd = new Date(now);
    oldPeriodEnd.setDate(oldPeriodEnd.getDate() - 1);
    const oldPeriodStart = new Date(oldPeriodEnd);
    oldPeriodStart.setMonth(oldPeriodStart.getMonth() - 1);

    const users = [
      { userId: "user-multi-1", subId: "sub-multi-1", walletId: "wallet-multi-1", current_period_end_iso: oldPeriodEnd.toISOString() },
      { userId: "user-multi-2", subId: "sub-multi-2", walletId: "wallet-multi-2", current_period_end_iso: oldPeriodEnd.toISOString() },
      { userId: "user-multi-3", subId: "sub-multi-3", walletId: "wallet-multi-3", current_period_end_iso: oldPeriodEnd.toISOString() },
    ];

    const mockSubscriptionPlanData = { id: mockPlanId, tokens_to_award: tokensToAward, interval: 'month', interval_count: 1 };
    const mockUserSubscriptionsData = users.map(u => ({ id: u.subId, user_id: u.userId, plan_id: mockPlanId, current_period_start: oldPeriodStart.toISOString(), current_period_end: u.current_period_end_iso, status: 'free' }));
    const mockTokenWalletsData = users.map(u => ({ wallet_id: u.walletId, user_id: u.userId }));
    const mockTransactionResults: TokenWalletTransaction[] = users.map(u => ({ transactionId: `txn-${u.userId}`, walletId: u.walletId, type: "CREDIT_MONTHLY_FREE_ALLOCATION", amount: String(tokensToAward), balanceAfterTxn: String(tokensToAward), recordedByUserId: "19c35c50-eab5-49db-997f-e6fea60253eb", timestamp: new Date(), relatedEntityId: mockPlanId, relatedEntityType: 'subscription_plan' }));

    let recordTransactionCallCount = 0;
    const actualMockRecordTransactionImpl = async (_params: Parameters<ITokenWalletService['recordTransaction']>[0]): Promise<TokenWalletTransaction> => {
      const result = mockTransactionResults[recordTransactionCallCount];
      recordTransactionCallCount++;
      return result;
    };

    mockSupabase = createMockSupabaseClient({
      genericMockResults: {
        subscription_plans: { select: () => Promise.resolve({ data: [mockSubscriptionPlanData], error: null, count: 1, status: 200, statusText: "OK" }) },
        user_subscriptions: {
          select: () => Promise.resolve({ data: mockUserSubscriptionsData, error: null, count: users.length, status: 200, statusText: "OK" }),
          update: () => Promise.resolve({ data: [{ id: "updated-sub-id" }], error: null, count: 1, status: 200, statusText: "OK" })
        },
        token_wallets: {
          select: (state: MockQueryBuilderState) => {
            const userIdFilter = state.filters?.find(f => f.column === 'user_id');
            if (userIdFilter) {
              const wallet = mockTokenWalletsData.find(w => w.user_id === userIdFilter.value);
              return Promise.resolve({ data: wallet ? [wallet] : null, error: null, count: wallet ? 1 : 0, status: 200, statusText: "OK" });
            }
            return Promise.resolve({ data: null, error: new Error("Missing user_id filter in token_wallets select"), count: 0, status: 500, statusText: "Error" });
          }
        }
      }
    });

    mockTokenWallet = createMockTokenWalletService({ recordTransaction: actualMockRecordTransactionImpl });

    const response = await handleAllocatePeriodicTokens(request, mockSupabase.client as any, mockTokenWallet.instance as TokenWalletService);

    assertEquals(response.status, 200);
    const body = await response.json();
    assert(body.summary.includes(`Tokens awarded to: ${users.length}`), `Summary should indicate ${users.length} users allocated`);
    assert(body.summary.includes("Failed attempts: 0"), "Summary should indicate 0 failed attempts");

    assertSpyCalls(mockSupabase.spies.fromSpy, 1 + 1 + users.length + users.length);
    
    const planQbSpies = mockSupabase.spies.getLatestQueryBuilderSpies('subscription_plans');
    assertExists(planQbSpies?.select, "Select spy for subscription_plans should exist");
    assertSpyCalls(planQbSpies!.select, 1);

    const historicUserSubBuilders = mockSupabase.client.getHistoricBuildersForTable('user_subscriptions');
    assertExists(historicUserSubBuilders, "Historic builders for user_subscriptions should exist.");

    const userSubSelectBuilder = historicUserSubBuilders.find(b => (b as any)._state.operation === 'select');
    assertExists(userSubSelectBuilder, "Select query builder for user_subscriptions should exist in history.");
    assertExists(userSubSelectBuilder.methodSpies.select, "Select spy for user_subscriptions should exist on historic builder.");
    assertSpyCalls(userSubSelectBuilder.methodSpies.select, 1);
    assertExists(userSubSelectBuilder.methodSpies.eq, "Eq spy for user_subscriptions select should exist.");
    assertSpyCalls(userSubSelectBuilder.methodSpies.eq, 2); // plan_id, status
    assertExists(userSubSelectBuilder.methodSpies.lte, "Lte spy for user_subscriptions select should exist.");
    assertSpyCalls(userSubSelectBuilder.methodSpies.lte, 1); // current_period_end

    const recordTransactionStub = mockTokenWallet.stubs.recordTransaction;
    assertSpyCalls(recordTransactionStub, users.length);
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const call = recordTransactionStub.calls[i];
      assertExists(call, `Call ${i} to recordTransaction should exist`);
      const args = call.args[0] as Parameters<ITokenWalletService['recordTransaction']>[0];
      assertEquals(args.walletId, user.walletId);
      assertEquals(args.amount, String(tokensToAward));
      assertEquals(args.type, "CREDIT_MONTHLY_FREE_ALLOCATION");
      assertEquals(args.relatedEntityId, mockPlanId);
    }

    const userSubUpdateBuilders = historicUserSubBuilders.filter(b => (b as any)._state.operation === 'update');
    assertEquals(userSubUpdateBuilders.length, users.length, "Should be one update QueryBuilder instance per user");
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const qb = userSubUpdateBuilders[i];
      assertExists(qb, `Update QueryBuilder for user ${user.userId} should exist`);
      const updateSpy = qb.methodSpies.update;
      assertExists(updateSpy, `Update spy for user_subscriptions user ${user.userId} should exist`);
      assertSpyCalls(updateSpy, 1);
      const updateArgs = updateSpy.calls[0].args[0] as { current_period_start?: string, current_period_end?: string, updated_at?: string };
      assertEquals(updateArgs.current_period_start, user.current_period_end_iso);
      assertExists(updateArgs.current_period_end);
      const newPeriodEnd = new Date(updateArgs.current_period_end!);
      const expectedOldPeriodEnd = new Date(user.current_period_end_iso);
      const expectedNewPeriodEnd = new Date(expectedOldPeriodEnd);
      expectedNewPeriodEnd.setMonth(expectedNewPeriodEnd.getMonth() + 1);
      assertEquals(newPeriodEnd.toISOString().substring(0,10), expectedNewPeriodEnd.toISOString().substring(0,10));
      const eqSpy = qb.methodSpies.eq;
      assertExists(eqSpy, `Eq spy for user_subscriptions update user ${user.userId} should exist`);
      assertSpyCalls(eqSpy, 1);
      assertEquals(eqSpy.calls[0].args[0], 'id');
      assertEquals(eqSpy.calls[0].args[1], user.subId);
    }
  });

  it("should handle missing wallet for a user and continue with others", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const mockPlanId = "free-plan-missing-wallet-mock";
    const tokensToAward = 75000;
    const now = new Date();
    const oldPeriodEnd = new Date(now);
    oldPeriodEnd.setDate(oldPeriodEnd.getDate() - 1);
    const oldPeriodStart = new Date(oldPeriodEnd);
    oldPeriodStart.setMonth(oldPeriodStart.getMonth() - 1);

    const usersSetup = [
      { userId: "user-mw-1", subId: "sub-mw-1", walletId: "wallet-mw-1", hasWallet: true, current_period_end_iso: oldPeriodEnd.toISOString() },
      { userId: "user-mw-2-no-wallet", subId: "sub-mw-2", walletId: null, hasWallet: false, current_period_end_iso: oldPeriodEnd.toISOString() },
      { userId: "user-mw-3", subId: "sub-mw-3", walletId: "wallet-mw-3", hasWallet: true, current_period_end_iso: oldPeriodEnd.toISOString() },
    ];

    const mockSubscriptionPlanData = { id: mockPlanId, tokens_to_award: tokensToAward, interval: 'month', interval_count: 1 };
    
    const mockUserSubscriptionsData = usersSetup.map(u => ({
      id: u.subId,
      user_id: u.userId,
      plan_id: mockPlanId,
      current_period_start: oldPeriodStart.toISOString(),
      current_period_end: u.current_period_end_iso,
      status: 'free'
    }));

    const mockTokenWalletsData = usersSetup
      .filter(u => u.hasWallet)
      .map(u => ({ wallet_id: u.walletId!, user_id: u.userId }));

    let recordTransactionCallCount = 0;
    const successfulUsers = usersSetup.filter(u => u.hasWallet);
    const mockTransactionResults: TokenWalletTransaction[] = successfulUsers.map(u => ({
        transactionId: `txn-${u.userId}`,
        walletId: u.walletId!,
        type: "CREDIT_MONTHLY_FREE_ALLOCATION",
        amount: String(tokensToAward),
        balanceAfterTxn: String(tokensToAward),
        recordedByUserId: SYSTEM_USER_ID,
        timestamp: new Date(),
        relatedEntityId: mockPlanId,
        relatedEntityType: 'subscription_plan'
    }));    

    const actualMockRecordTransactionImpl = async (
        _params: Parameters<ITokenWalletService['recordTransaction']>[0]
    ): Promise<TokenWalletTransaction> => {
        const result = mockTransactionResults[recordTransactionCallCount];
        recordTransactionCallCount++;
        return result;
    };

    mockSupabase = createMockSupabaseClient({
      genericMockResults: {
        subscription_plans: {
          select: () => Promise.resolve({ data: [mockSubscriptionPlanData], error: null, count: 1, status: 200, statusText: "OK" })
        },
        user_subscriptions: {
          select: () => Promise.resolve({ data: mockUserSubscriptionsData, error: null, count: usersSetup.length, status: 200, statusText: "OK" }),
          update: () => Promise.resolve({ data: [{ id: "updated-sub-id" }], error: null, count: 1, status: 200, statusText: "OK" })
        },
        token_wallets: {
          select: (state: MockQueryBuilderState) => {
            const userIdFilter = state.filters?.find(f => f.column === 'user_id');
            if (userIdFilter?.value) {
              const wallet = mockTokenWalletsData.find(w => w.user_id === userIdFilter.value);
              // Align with the object[] | null type for data; .single() will handle extraction.
              return Promise.resolve({ data: wallet ? [wallet] : null, error: null, count: wallet ? 1 : 0, status: 200, statusText: "OK" }); 
            }
            return Promise.resolve({ data: null, error: new Error("Missing user_id filter in token_wallets select"), count: 0, status: 500, statusText: "Error" });
          }
        }
      }
    });

    mockTokenWallet = createMockTokenWalletService({ recordTransaction: actualMockRecordTransactionImpl });

    const consoleErrorSpy = spy(console, "error");

    const response = await handleAllocatePeriodicTokens(request, mockSupabase.client as any, mockTokenWallet.instance as TokenWalletService);
    consoleErrorSpy.restore();

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.summary, `Periodic token allocation complete. Users processed: ${usersSetup.length}. Tokens awarded to: ${successfulUsers.length}. Failed attempts: ${usersSetup.length - successfulUsers.length}.`);

    const userWithoutWallet = usersSetup.find(u => !u.hasWallet);
    assert(consoleErrorSpy.calls.some(call => call.args.some(arg => typeof arg === 'string' && arg.includes(`Wallet not found for user ${userWithoutWallet?.userId}. Subscription ID: ${userWithoutWallet?.subId}`))), `Should log error for missing wallet for user ${userWithoutWallet?.userId}`);
    
    assertSpyCalls(mockSupabase.spies.fromSpy, 1 + 1 + usersSetup.length + successfulUsers.length);

    const historicUserSubBuilders = mockSupabase.client.getHistoricBuildersForTable('user_subscriptions');
    assertExists(historicUserSubBuilders, "Historic builders for user_subscriptions should exist.");

    const historicTokenWalletBuilders = mockSupabase.client.getHistoricBuildersForTable('token_wallets');
    assertExists(historicTokenWalletBuilders, "Historic builders for token_wallets should exist.");
    assertEquals(historicTokenWalletBuilders.length, usersSetup.length, "Should have queried token_wallets for each user");
    historicTokenWalletBuilders.forEach((builder, index) => {
        assertExists(builder.methodSpies.select, "Select spy on token_wallets QB should exist");
        assertSpyCalls(builder.methodSpies.select, 1);
        assertExists(builder.methodSpies.eq, "Eq spy on token_wallets QB should exist");
        assertEquals(builder.methodSpies.eq.calls[0].args[0], 'user_id');
        assertEquals(builder.methodSpies.eq.calls[0].args[1], usersSetup[index].userId);
        assertExists(builder.methodSpies.is, "Is spy on token_wallets QB should exist"); // for .is('organization_id', null)
        assertSpyCalls(builder.methodSpies.is, 1);
        assertEquals(builder.methodSpies.is.calls[0].args[0], 'organization_id');
        assertEquals(builder.methodSpies.is.calls[0].args[1], null);
        assertExists(builder.methodSpies.single, "Single spy on token_wallets QB should exist");
        assertSpyCalls(builder.methodSpies.single, 1);
    });

    const recordTransactionStub = mockTokenWallet.stubs.recordTransaction;
    assertSpyCalls(recordTransactionStub, successfulUsers.length);
    for (let i = 0; i < successfulUsers.length; i++) {
      const user = successfulUsers[i];
      const call = recordTransactionStub.calls[i];
      assertExists(call, `Call ${i} to recordTransaction should exist`);
      const args = call.args[0] as Parameters<ITokenWalletService['recordTransaction']>[0];
      assertEquals(args.walletId, user.walletId!);
      assertEquals(args.amount, String(tokensToAward));
    }

    const userSubUpdateBuilders = historicUserSubBuilders.filter(b => (b as any)._state.operation === 'update');
    assertEquals(userSubUpdateBuilders.length, successfulUsers.length, "Should be one update QueryBuilder instance per successful user");
    for (let i = 0; i < successfulUsers.length; i++) {
      const user = successfulUsers[i];
      const qb = userSubUpdateBuilders[i];
      assertExists(qb, `Update QueryBuilder for user ${user.userId} should exist`);
      const updateSpy = qb.methodSpies.update;
      assertExists(updateSpy, `Update spy for user_subscriptions user ${user.userId} should exist`);
      assertSpyCalls(updateSpy, 1);
      const updateArgs = updateSpy.calls[0].args[0] as { current_period_start?: string, current_period_end?: string, updated_at?: string };
      assertEquals(updateArgs.current_period_start, user.current_period_end_iso);
      const eqSpy = qb.methodSpies.eq;
      assertExists(eqSpy, `Eq spy for user_subscriptions update user ${user.userId} should exist`);
      assertSpyCalls(eqSpy, 1);
      assertEquals(eqSpy.calls[0].args[0], 'id');
      assertEquals(eqSpy.calls[0].args[1], user.subId);
    }
  });

  it("should handle failure in TokenWalletService.recordTransaction and continue with others", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const mockPlanId = "free-plan-txn-fail-mock";
    const tokensToAward = 80000;
    const now = new Date();
    const oldPeriodEnd = new Date(now);
    oldPeriodEnd.setDate(oldPeriodEnd.getDate() - 1);
    const oldPeriodStart = new Date(oldPeriodEnd);
    oldPeriodStart.setMonth(oldPeriodStart.getMonth() - 1);

    const usersSetup = [
      { userId: "user-tf-1-ok", subId: "sub-tf-1", walletId: "wallet-tf-1", current_period_end_iso: oldPeriodEnd.toISOString(), shouldFailTxn: false },
      { userId: "user-tf-2-fail-txn", subId: "sub-tf-2", walletId: "wallet-tf-2", current_period_end_iso: oldPeriodEnd.toISOString(), shouldFailTxn: true },
      { userId: "user-tf-3-ok", subId: "sub-tf-3", walletId: "wallet-tf-3", current_period_end_iso: oldPeriodEnd.toISOString(), shouldFailTxn: false },
    ];
    const userWhoFailsTxn = usersSetup.find(u => u.shouldFailTxn)!;
    const successfulUsers = usersSetup.filter(u => !u.shouldFailTxn);

    const mockSubscriptionPlanData = { id: mockPlanId, tokens_to_award: tokensToAward, interval: 'month', interval_count: 1 };
    
    const mockUserSubscriptionsData = usersSetup.map(u => ({
      id: u.subId,
      user_id: u.userId,
      plan_id: mockPlanId,
      current_period_start: oldPeriodStart.toISOString(),
      current_period_end: u.current_period_end_iso,
      status: 'free'
    }));

    const mockTokenWalletsData = usersSetup.map(u => ({ wallet_id: u.walletId, user_id: u.userId }));
    
    let recordTransactionCallCount = 0;
    const mockTransactionError = new Error("Simulated Transaction Error");
    const mockSuccessfulTransactionResults: Record<string, TokenWalletTransaction> = {};

    successfulUsers.forEach(u => {
      mockSuccessfulTransactionResults[u.userId] = {
        transactionId: `txn-${u.userId}`,
        walletId: u.walletId,
        type: "CREDIT_MONTHLY_FREE_ALLOCATION",
        amount: String(tokensToAward),
        balanceAfterTxn: String(tokensToAward),
        recordedByUserId: SYSTEM_USER_ID,
        timestamp: new Date(),
        relatedEntityId: mockPlanId,
        relatedEntityType: 'subscription_plan'
      };
    });

    const actualMockRecordTransactionImpl = async (
        params: Parameters<ITokenWalletService['recordTransaction']>[0]
    ): Promise<TokenWalletTransaction> => {
      const userForCall = usersSetup[recordTransactionCallCount]; // relies on order
      recordTransactionCallCount++;
      if (userForCall.shouldFailTxn) {
        throw mockTransactionError;
      }
      // Find walletId in params, then find corresponding userId to fetch correct mock result
      const callingUserId = mockTokenWalletsData.find(w => w.wallet_id === params.walletId)?.user_id;
      if (!callingUserId || !mockSuccessfulTransactionResults[callingUserId]) {
        throw new Error(`Test setup error: No successful transaction mock for userId derived from walletId ${params.walletId}`);
      }
      return mockSuccessfulTransactionResults[callingUserId];
    };

    mockSupabase = createMockSupabaseClient({
      genericMockResults: {
        subscription_plans: {
          select: () => Promise.resolve({ data: [mockSubscriptionPlanData], error: null, count: 1, status: 200, statusText: "OK" })
        },
        user_subscriptions: {
          select: () => Promise.resolve({ data: mockUserSubscriptionsData, error: null, count: usersSetup.length, status: 200, statusText: "OK" }),
          update: () => Promise.resolve({ data: [{ id: "updated-sub-id" }], error: null, count: 1, status: 200, statusText: "OK" })
        },
        token_wallets: {
          select: (state: MockQueryBuilderState) => {
            const userIdFilter = state.filters?.find(f => f.column === 'user_id');
            if (userIdFilter?.value) {
              const wallet = mockTokenWalletsData.find(w => w.user_id === userIdFilter.value);
              return Promise.resolve({ data: wallet ? [wallet] : null, error: null, count: wallet ? 1 : 0, status: 200, statusText: "OK" });
            }
            return Promise.resolve({ data: null, error: new Error("Missing user_id filter in token_wallets select"), count: 0, status: 500, statusText: "Error" });
          }
        }
      }
    });

    mockTokenWallet = createMockTokenWalletService({ recordTransaction: actualMockRecordTransactionImpl });
    const consoleErrorSpy = spy(console, "error");

    const response = await handleAllocatePeriodicTokens(request, mockSupabase.client as any, mockTokenWallet.instance as TokenWalletService);
    consoleErrorSpy.restore();

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.summary, `Periodic token allocation complete. Users processed: ${usersSetup.length}. Tokens awarded to: ${successfulUsers.length}. Failed attempts: ${usersSetup.length - successfulUsers.length}.`);

    // Verify console.error was called for the failed transaction
    assert(
      consoleErrorSpy.calls.some(call => 
        call.args.some(arg => typeof arg === 'string' && arg.includes(`Failed to process token allocation for user ${userWhoFailsTxn.userId}`)) &&
        call.args.some(arg => typeof arg === 'string' && arg.includes(mockTransactionError.message))
      ),
      `Should log error for failed recordTransaction for user ${userWhoFailsTxn.userId}`
    );
    
    // from: plans(1) + user_subs_select(1) + token_wallets_select(usersSetup.length) + user_subs_update(successfulUsers.length)
    assertSpyCalls(mockSupabase.spies.fromSpy, 1 + 1 + usersSetup.length + successfulUsers.length);

    // Check recordTransaction calls
    const recordTransactionStub = mockTokenWallet.stubs.recordTransaction;
    assertSpyCalls(recordTransactionStub, usersSetup.length); // Called for everyone, one fails

    // Check user_subscriptions update calls (only for successful users)
    const historicUserSubBuilders = mockSupabase.client.getHistoricBuildersForTable('user_subscriptions');
    assertExists(historicUserSubBuilders);
    const userSubUpdateBuilders = historicUserSubBuilders.filter(b => (b as any)._state.operation === 'update');
    assertEquals(userSubUpdateBuilders.length, successfulUsers.length, "Should only update subscriptions for users with successful transactions");

    for (const successfulUser of successfulUsers) {
      const qb = userSubUpdateBuilders.find(b => {
        const eqCall = b.methodSpies.eq?.calls.find(c => c.args[0] === 'id');
        return eqCall?.args[1] === successfulUser.subId;
      });
      assertExists(qb, `Update QueryBuilder for successful user ${successfulUser.userId} should exist`);
      assertSpyCalls(qb.methodSpies.update, 1);
      const updateArgs = qb.methodSpies.update.calls[0].args[0] as { current_period_start?: string, current_period_end?: string, updated_at?: string };
      assertEquals(updateArgs.current_period_start, successfulUser.current_period_end_iso);
    }
    
    const qbForFailedUser = userSubUpdateBuilders.find(b => {
        const eqCall = b.methodSpies.eq?.calls.find(c => c.args[0] === 'id');
        return eqCall?.args[1] === userWhoFailsTxn.subId;
    });
    assert(!qbForFailedUser, `Subscription for user ${userWhoFailsTxn.userId} (txn failure) should NOT have been updated.`);

  });

  it("should handle failure in updating user_subscription period after successful token allocation", async () => {
    // TODO: Implement test
  });

  it("should handle failure in updating user_subscription period after successful token allocation", async () => {
    const request = new Request(`${mockSupabaseUrl}/functions/v1/allocate-periodic-tokens`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const mockPlanId = "free-plan-sub-update-fail-mock";
    const tokensToAward = 90000;
    const now = new Date();
    const oldPeriodEnd = new Date(now);
    oldPeriodEnd.setDate(oldPeriodEnd.getDate() - 1);
    const oldPeriodStart = new Date(oldPeriodEnd);
    oldPeriodStart.setMonth(oldPeriodStart.getMonth() - 1);

    const usersSetup = [
      { userId: "user-suf-1-ok", subId: "sub-suf-1", walletId: "wallet-suf-1", current_period_end_iso: oldPeriodEnd.toISOString(), shouldFailSubUpdate: false },
      { userId: "user-suf-2-fail-sub-update", subId: "sub-suf-2", walletId: "wallet-suf-2", current_period_end_iso: oldPeriodEnd.toISOString(), shouldFailSubUpdate: true },
      { userId: "user-suf-3-ok", subId: "sub-suf-3", walletId: "wallet-suf-3", current_period_end_iso: oldPeriodEnd.toISOString(), shouldFailSubUpdate: false },
    ];
    const userWhoFailsSubUpdate = usersSetup.find(u => u.shouldFailSubUpdate)!;
    const successfulUsersOverall = usersSetup.filter(u => !u.shouldFailSubUpdate);
    const mockSubUpdateError = new Error("Simulated Subscription Update Error");

    const mockSubscriptionPlanData = { id: mockPlanId, tokens_to_award: tokensToAward, interval: 'month', interval_count: 1 };
    
    const mockUserSubscriptionsData = usersSetup.map(u => ({
      id: u.subId,
      user_id: u.userId,
      plan_id: mockPlanId,
      current_period_start: oldPeriodStart.toISOString(),
      current_period_end: u.current_period_end_iso,
      status: 'free'
    }));

    const mockTokenWalletsData = usersSetup.map(u => ({ wallet_id: u.walletId, user_id: u.userId }));

    const mockTransactionResults: Record<string, TokenWalletTransaction> = {};
    usersSetup.forEach(u => { // All transactions succeed initially
      mockTransactionResults[u.userId] = {
        transactionId: `txn-${u.userId}`,
        walletId: u.walletId,
        type: "CREDIT_MONTHLY_FREE_ALLOCATION",
        amount: String(tokensToAward),
        balanceAfterTxn: String(tokensToAward),
        recordedByUserId: SYSTEM_USER_ID,
        timestamp: new Date(),
        relatedEntityId: mockPlanId,
        relatedEntityType: 'subscription_plan'
      };
    });

    let recordTransactionCallIdx = 0;
    const actualMockRecordTransactionImpl = async (
        params: Parameters<ITokenWalletService['recordTransaction']>[0]
    ): Promise<TokenWalletTransaction> => {
        const callingUserId = mockTokenWalletsData.find(w => w.wallet_id === params.walletId)?.user_id;
        recordTransactionCallIdx++;
        if (!callingUserId || !mockTransactionResults[callingUserId]) {
            throw new Error(`Test setup error: No transaction mock for userId derived from walletId ${params.walletId}`);
        }
        return mockTransactionResults[callingUserId];
    };

    // Mock for user_subscriptions.update
    // To ensure we can target a specific user's update to fail, we need to inspect the state
    // This spy will be used by mockSupabase client for the 'update' operation on 'user_subscriptions'.
    const userSubscriptionUpdateSpy = spy((state: MockQueryBuilderState) => {
      const filterById = state.filters?.find(f => f.column === 'id');
      const subIdBeingUpdated = filterById?.value;
      const userSetupForThisSub = usersSetup.find(u => u.subId === subIdBeingUpdated);

      if (userSetupForThisSub?.shouldFailSubUpdate) {
        return Promise.resolve({ data: null, error: mockSubUpdateError, count: 0, status: 500, statusText: "Internal Server Error" });
      }
      return Promise.resolve({ data: [{ id: subIdBeingUpdated }], error: null, count: 1, status: 200, statusText: "OK" });
    });

    mockSupabase = createMockSupabaseClient({
      genericMockResults: {
        subscription_plans: {
          select: () => Promise.resolve({ data: [mockSubscriptionPlanData], error: null, count: 1, status: 200, statusText: "OK" })
        },
        user_subscriptions: {
          select: () => Promise.resolve({ data: mockUserSubscriptionsData, error: null, count: usersSetup.length, status: 200, statusText: "OK" }),
          update: userSubscriptionUpdateSpy // Use the sophisticated spy here
        },
        token_wallets: {
          select: (state: MockQueryBuilderState) => {
            const userIdFilter = state.filters?.find(f => f.column === 'user_id');
            if (userIdFilter?.value) {
              const wallet = mockTokenWalletsData.find(w => w.user_id === userIdFilter.value);
              return Promise.resolve({ data: wallet ? [wallet] : null, error: null, count: wallet ? 1 : 0, status: 200, statusText: "OK" });
            }
            return Promise.resolve({ data: null, error: new Error("Missing user_id filter in token_wallets select"), count: 0, status: 500, statusText: "Error" });
          }
        }
      }
    });

    mockTokenWallet = createMockTokenWalletService({ recordTransaction: actualMockRecordTransactionImpl });
    const consoleErrorSpy = spy(console, "error");

    const response = await handleAllocatePeriodicTokens(request, mockSupabase.client as any, mockTokenWallet.instance as TokenWalletService);
    consoleErrorSpy.restore();

    assertEquals(response.status, 200);
    const body = await response.json();
    // In this case, token allocation might be considered successful for the user, but the period update failed.
    // The summary reflects users allocated (tokens granted) vs. failed attempts (where the loop iteration had an issue).
    // If subscription update fails, 'usersFailed' is incremented, 'usersAllocated' is NOT for that user.
    assertEquals(body.summary, `Periodic token allocation complete. Users processed: ${usersSetup.length}. Tokens awarded to: ${successfulUsersOverall.length}. Failed attempts: ${usersSetup.length - successfulUsersOverall.length}.`);

    // Verify console.error was called for the failed subscription update
    const expectedErrorMessage = `Failed to update subscription period for user ${userWhoFailsSubUpdate.userId} after token grant. Sub ID: ${userWhoFailsSubUpdate.subId}. Error: ${mockSubUpdateError.message}. CRITICAL: This may lead to double allocation if not manually corrected.`;
    assert(
      consoleErrorSpy.calls.some(call => 
        call.args.some(arg => typeof arg === 'string' && arg.includes(expectedErrorMessage))
      ),
      `Should log critical error for failed subscription update for user ${userWhoFailsSubUpdate.userId}. Expected: "${expectedErrorMessage}"`
    );

    // from: plans(1) + user_subs_select(1) + token_wallets_select(usersSetup.length) + user_subs_update(usersSetup.length because update is ATTEMPTED for all)
    assertSpyCalls(mockSupabase.spies.fromSpy, 1 + 1 + usersSetup.length + usersSetup.length);

    // Check recordTransaction calls - should be called for ALL users, as txn succeeds before sub update fails
    const recordTransactionStub = mockTokenWallet.stubs.recordTransaction;
    assertSpyCalls(recordTransactionStub, usersSetup.length);
    usersSetup.forEach((user, i) => {
      const call = recordTransactionStub.calls[i];
      assertExists(call, `Record transaction call for ${user.userId} should exist`);
      assertEquals(call.args[0].walletId, user.walletId);
    });

    // Check user_subscriptions update attempts (attempted for all users)
    const historicUserSubBuilders = mockSupabase.client.getHistoricBuildersForTable('user_subscriptions');
    assertExists(historicUserSubBuilders);
    const userSubUpdateBuilders = historicUserSubBuilders.filter(b => (b as any)._state.operation === 'update');
    assertEquals(userSubUpdateBuilders.length, usersSetup.length, "Should ATTEMPT to update subscriptions for all users whose transactions succeeded");
    
    assertSpyCalls(userSubscriptionUpdateSpy, usersSetup.length); // The main spy we used for update should have been called for each user

  });

}); 