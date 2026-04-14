import { assertEquals, assert, assertObjectMatch } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { stub, spy, type Spy, type Stub, assertSpyCall, assertSpyCalls } from "https://deno.land/std@0.224.0/testing/mock.ts";

// Import the actual handler function
import { initiatePaymentHandler } from "./index.ts"; 
import type { Database } from '../types_db.ts';
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type {
    PurchaseRequest,
    PaymentInitiationResult,
    PaymentOrchestrationContext,
    IPaymentGatewayAdapter,
    PaymentConfirmation
} from '../_shared/types/payment.types.ts';

// Mock Creators
// import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';
import { createMockSupabaseClient, type MockQueryBuilderState, type MockSupabaseDataConfig, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
// Target wiring: handler uses UserTokenWalletService(user client) for getWalletForContext; production
// getPaymentAdapter builds AdminTokenWalletService(admin client) for StripePaymentAdapter. We mock Supabase
// so the real user-scoped service can resolve wallets, and we spy getPaymentAdapterFn instead of constructing adapters.

// --- Constants for Mocking ---
const MOCK_USER_ID = 'test-user-id-123';
const MOCK_ORGANIZATION_ID = 'test-org-id-456';
const MOCK_ITEM_ID = 'item_abc_123';
const MOCK_INVALID_ITEM_ID = 'item_invalid_xxx';
const MOCK_INCOMPLETE_ITEM_ID = 'item_incomplete_cfg';
const MOCK_WRONG_CURRENCY_ITEM_ID = 'item_wrong_currency';
const MOCK_tokens_to_award = 1000;
const MOCK_ITEM_AMOUNT = 20; // e.g., 20 USD
const MOCK_CURRENCY = 'usd';
const MOCK_WALLET_ID = 'wallet-id-for-user';
const MOCK_PAYMENT_TRANSACTION_ID = 'ptxn_new_id_789';
const MOCK_SITE_URL = 'http://localhost:5173';

function messageFromUnknown(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}

function firstRowFromInsertData(insertData: MockQueryBuilderState["insertData"]): Record<string, unknown> {
    if (insertData === null) {
        return {};
    }
    if (Array.isArray(insertData)) {
        const row0: unknown = insertData[0];
        if (typeof row0 === "object" && row0 !== null && !Array.isArray(row0)) {
            return { ...row0 };
        }
        return {};
    }
    return { ...insertData };
}

/** IMockSupabaseClient is structurally used as SupabaseClient in handler tests; double assertion is required by deno-ts. */
function supabaseClientForHandlerTests(setup: MockSupabaseClientSetup): SupabaseClient<Database> {
    return setup.client as unknown as SupabaseClient<Database>;
}

function isDenoSpy<F extends (...args: never[]) => unknown>(value: unknown): value is Spy<F> {
    if (typeof value !== "function") {
        return false;
    }
    return (
        "calls" in value &&
        "restore" in value &&
        "restored" in value &&
        "original" in value
    );
}

type InitiatePaymentSpy = Spy<
    (context: PaymentOrchestrationContext) => Promise<PaymentInitiationResult>
>;
type HandleWebhookSpy = Spy<
    (rawBody: ArrayBuffer, signature: string | undefined) => Promise<PaymentConfirmation>
>;

interface MockPaymentAdapterWithSpies {
    gatewayId: string;
    initiatePayment: InitiatePaymentSpy;
    handleWebhook: HandleWebhookSpy;
}

// --- Common Test Setup ---
// Utility to create a mock Request
function createMockRequest(
    method: string,
    urlPath: string, // e.g. /initiate-payment
    body: unknown | null,
    headers?: Record<string, string>
): Request {
    const url = new URL(urlPath, MOCK_SITE_URL); 
    return new Request(url.toString(), {
        method,
        headers: new Headers(headers || {}),
        body: body ? JSON.stringify(body) : undefined,
    });
}

const originalDenoEnvGet = Deno.env.get;
let globalEnvGetStub: Stub<Deno.Env, [string], string | undefined> | null = null;

function setupGlobalTestEnvironment(initialEnvVars: Record<string, string> = {}): void {
    if (globalEnvGetStub && !globalEnvGetStub.restored) { // Check if already stubbed and not restored
        try {
            globalEnvGetStub.restore();
        } catch (e) {
            console.warn("Previous globalEnvGetStub restore failed:", messageFromUnknown(e));
        }
    }
    const defaultEnvVars: Record<string, string> = {
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        STRIPE_WEBHOOK_SIGNING_SECRET: 'whsec_test_dummy',
        SITE_URL: MOCK_SITE_URL,
        ENV_TYPE: 'DEVELOPMENT',
        LOG_LEVEL: 'DEBUG',
        ...initialEnvVars,
    };
    globalEnvGetStub = stub(Deno.env, "get", (key: string) => defaultEnvVars[key] === undefined ? originalDenoEnvGet(key) : defaultEnvVars[key]);
}

function teardownGlobalTestEnvironment(): void {
    if (globalEnvGetStub && !globalEnvGetStub.restored) {
        try {
            globalEnvGetStub.restore();
        } catch (e) {
             console.warn("globalEnvGetStub restore failed in teardown:", messageFromUnknown(e));
        }
    }
    globalEnvGetStub = null;
}


// Test suite for the initiate-payment Edge Function
Deno.test("initiate-payment function tests", async (t) => {
    setupGlobalTestEnvironment(); // Setup env once for all tests in this Deno.test block

    let mockAdminSbSetup: MockSupabaseClientSetup;
    let mockUserSbSetup: MockSupabaseClientSetup;
    
    // Declare spies in the broader scope of Deno.test to manage their lifecycle across t.steps
    let mockCreateUserClientFn: Spy<(authHeader: string) => SupabaseClient<Database>> | undefined;
    let mockGetPaymentAdapterFn: Spy<
        (gatewayId: string, adminSupabaseClient: SupabaseClient<Database>) => IPaymentGatewayAdapter | null
    > | undefined;
    let mockPaymentAdapter: MockPaymentAdapterWithSpies;

    const MOCK_DEFAULT_USER: User = {
        id: MOCK_USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'user@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
    };

    const beforeEachScoped = (options: {
        userAuthConfig?: MockSupabaseDataConfig,
        adminSupaConfig?: MockSupabaseDataConfig,
        adapterBehavior?: Partial<IPaymentGatewayAdapter>,
        getAdapterShouldReturnNull?: boolean
    } = {}) => {
        const { userAuthConfig, adminSupaConfig, adapterBehavior, getAdapterShouldReturnNull = false } = options;

        // Restore existing spies before creating new ones for this scope
        if (mockCreateUserClientFn && typeof mockCreateUserClientFn.restore === 'function' && !mockCreateUserClientFn.restored) {
            try { mockCreateUserClientFn.restore(); } catch (e) { console.warn('[beforeEachScoped] Pre-restore failed for mockCreateUserClientFn:', messageFromUnknown(e)); }
        }
        if (mockGetPaymentAdapterFn && typeof mockGetPaymentAdapterFn.restore === 'function' && !mockGetPaymentAdapterFn.restored) {
            try { mockGetPaymentAdapterFn.restore(); } catch (e) { console.warn('[beforeEachScoped] Pre-restore failed for mockGetPaymentAdapterFn:', messageFromUnknown(e)); }
        }
        if (mockPaymentAdapter?.initiatePayment && typeof mockPaymentAdapter.initiatePayment.restore === 'function' && !mockPaymentAdapter.initiatePayment.restored) {
            try { mockPaymentAdapter.initiatePayment.restore(); } catch (e) { console.warn('[beforeEachScoped] Pre-restore failed for initiatePayment spy:', messageFromUnknown(e)); }
        }
        if (mockPaymentAdapter?.handleWebhook && typeof mockPaymentAdapter.handleWebhook.restore === 'function' && !mockPaymentAdapter.handleWebhook.restored) {
            try { mockPaymentAdapter.handleWebhook.restore(); } catch (e) { console.warn('[beforeEachScoped] Pre-restore failed for handleWebhook spy:', messageFromUnknown(e)); }
        }


        // Default admin client mocks
        const defaultAdminSupaConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                'subscription_plans': {
                    select: async (state: MockQueryBuilderState) => {
                        const itemIdFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.type === 'eq');
                        const activeFilter = state.filters.find(f => f.column === 'active' && f.type === 'eq' && f.value === true);

                        if (itemIdFilter && activeFilter) {
                            if (itemIdFilter.value === MOCK_ITEM_ID) {
                                return { data: [{ stripe_price_id: MOCK_ITEM_ID, item_id_internal: MOCK_ITEM_ID, tokens_to_award: MOCK_tokens_to_award, amount: MOCK_ITEM_AMOUNT, currency: MOCK_CURRENCY, active: true }], error: null, count: 1, status: 200, statusText: 'OK' };
                            }
                            if (itemIdFilter.value === MOCK_INCOMPLETE_ITEM_ID) {
                                return { data: [{ stripe_price_id: MOCK_INCOMPLETE_ITEM_ID, item_id_internal: MOCK_INCOMPLETE_ITEM_ID, tokens_to_award: null, amount: MOCK_ITEM_AMOUNT, currency: MOCK_CURRENCY, active: true }], error: null, count: 1, status: 200, statusText: 'OK' };
                            }
                            if (itemIdFilter.value === MOCK_WRONG_CURRENCY_ITEM_ID) {
                                return { data: [{ stripe_price_id: MOCK_WRONG_CURRENCY_ITEM_ID, item_id_internal: MOCK_WRONG_CURRENCY_ITEM_ID, tokens_to_award: MOCK_tokens_to_award, amount: MOCK_ITEM_AMOUNT, currency: 'eur', active: true }], error: null, count: 1, status: 200, statusText: 'OK' };
                            }
                            if (itemIdFilter.value === MOCK_INVALID_ITEM_ID) { // Simulate item not found or inactive by returning empty
                                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
                            }
                        }
                        return { data: [], error: new Error('Mock: Item not found or query unexpected'), count: 0, status: 404, statusText: 'Not Found' };
                    },
                },
                'payment_transactions': {
                    insert: async (state: MockQueryBuilderState) => {
                        const row = firstRowFromInsertData(state.insertData);
                        return { data: [{ id: MOCK_PAYMENT_TRANSACTION_ID, ...row }], error: null, count: 1, status: 201, statusText: 'Created' };
                    },
                    update: async (_state: MockQueryBuilderState) => ({ data: [{ id: MOCK_PAYMENT_TRANSACTION_ID }], error: null, count: 1, status: 200, statusText: 'OK' }),
                }
            }
        };
        
        // Default user client mocks for UserTokenWalletService.getWalletForContext (token_wallets + maybeSingle)
        const defaultUserSupaConfig: MockSupabaseDataConfig = {
            mockUser: MOCK_DEFAULT_USER,
            getUserResult: { data: { user: MOCK_DEFAULT_USER }, error: null },
            genericMockResults: {
                'token_wallets': {
                     select: async (state: MockQueryBuilderState) => {
                        const filters = state.filters;
                        const userEq = filters.find((f) => f.column === 'user_id' && f.type === 'eq');
                        const orgEq = filters.find((f) => f.column === 'organization_id' && f.type === 'eq');
                        const userWalletRow = {
                            wallet_id: MOCK_WALLET_ID,
                            user_id: MOCK_USER_ID,
                            organization_id: null,
                            balance: 5000,
                            currency: 'AI_TOKEN',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        };
                        // Personal wallet: UserTokenWalletService uses .eq(user_id).is(organization_id, null).
                        // MockQueryBuilder only records .is() when the value is the string 'null', not JS null
                        // (see isIsValue in supabase.mock.ts), so filters often omit organization_id.is.
                        if (userEq && userEq.value === MOCK_USER_ID && !orgEq) {
                            return { data: [userWalletRow], error: null, count: 1, status: 200, statusText: 'OK' };
                        }
                        if (orgEq && orgEq.value === MOCK_ORGANIZATION_ID) {
                            return {
                                data: [{
                                    ...userWalletRow,
                                    user_id: null,
                                    organization_id: MOCK_ORGANIZATION_ID,
                                }],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            };
                        }
                        return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
                    },
                }
            }
        };

        // First arg is currentTestUserId: MockSupabaseAuth forces user.id to this value (overrides mockUser.id).
        mockUserSbSetup = createMockSupabaseClient(MOCK_USER_ID, userAuthConfig || defaultUserSupaConfig);
        mockAdminSbSetup = createMockSupabaseClient('admin', adminSupaConfig || defaultAdminSupaConfig);
        
        mockCreateUserClientFn = spy((_authHeader: string) => supabaseClientForHandlerTests(mockUserSbSetup));

        const defaultInitiatePaymentBehavior = async (ctx: PaymentOrchestrationContext): Promise<PaymentInitiationResult> => {
            return { success: true, transactionId: ctx.internalPaymentId, paymentGatewayTransactionId: 'stripe_session_mock_' + ctx.internalPaymentId, redirectUrl: `${MOCK_SITE_URL}/stripe/pay/mock_session` };
        };
        const defaultHandleWebhookBehavior = async (
            _rawBody: ArrayBuffer,
            _signature: string | undefined,
        ): Promise<PaymentConfirmation> => ({ success: true, transactionId: 'wh_mock' });

        let initiatePayment: InitiatePaymentSpy;
        if (adapterBehavior?.initiatePayment) {
            const provided = adapterBehavior.initiatePayment;
            if (isDenoSpy<(context: PaymentOrchestrationContext) => Promise<PaymentInitiationResult>>(provided)) {
                initiatePayment = provided;
            } else {
                initiatePayment = spy(provided);
            }
        } else {
            initiatePayment = spy(defaultInitiatePaymentBehavior);
        }

        let handleWebhook: HandleWebhookSpy;
        if (adapterBehavior?.handleWebhook) {
            const provided = adapterBehavior.handleWebhook;
            if (isDenoSpy<(rawBody: ArrayBuffer, signature: string | undefined) => Promise<PaymentConfirmation>>(provided)) {
                handleWebhook = provided;
            } else {
                handleWebhook = spy(provided);
            }
        } else {
            handleWebhook = spy(defaultHandleWebhookBehavior);
        }

        mockPaymentAdapter = {
            gatewayId: 'stripe',
            initiatePayment,
            handleWebhook,
        };

        mockGetPaymentAdapterFn = spy((_gatewayId: string, adminClient: SupabaseClient<Database>) => {
            console.log('mockGetPaymentAdapterFn', _gatewayId, adminClient);
            return getAdapterShouldReturnNull ? null : mockPaymentAdapter;
        });
    };

    const afterEachScoped = () => {
        mockAdminSbSetup?.clearAllStubs?.(); 
        mockUserSbSetup?.clearAllStubs?.();

        // Restore spies
        if (mockCreateUserClientFn && typeof mockCreateUserClientFn.restore === 'function' && !mockCreateUserClientFn.restored) {
            try { mockCreateUserClientFn.restore(); } catch (e) { console.warn('[afterEachScoped] Failed to restore mockCreateUserClientFn:', messageFromUnknown(e)); }
        }
        if (mockGetPaymentAdapterFn && typeof mockGetPaymentAdapterFn.restore === 'function' && !mockGetPaymentAdapterFn.restored) {
            try { mockGetPaymentAdapterFn.restore(); } catch (e) { console.warn('[afterEachScoped] Failed to restore mockGetPaymentAdapterFn:', messageFromUnknown(e)); }
        }

        const activeInitiatePaymentSpy = mockPaymentAdapter?.initiatePayment;
        if (activeInitiatePaymentSpy && typeof activeInitiatePaymentSpy.restore === 'function' && !activeInitiatePaymentSpy.restored) {
            try { activeInitiatePaymentSpy.restore(); } catch (e) { console.warn('[afterEachScoped] Failed to restore activeInitiatePaymentSpy:', messageFromUnknown(e)); }
        }

        const activeHandleWebhookSpy = mockPaymentAdapter?.handleWebhook;
        if (activeHandleWebhookSpy && typeof activeHandleWebhookSpy.restore === 'function' && !activeHandleWebhookSpy.restored) {
            try { activeHandleWebhookSpy.restore(); } catch (e) { console.warn('[afterEachScoped] Failed to restore activeHandleWebhookSpy:', messageFromUnknown(e)); }
        }
        
        // Nullify to ensure clean state for next beforeEach, though Deno test runner might re-scope variables per t.step
        mockCreateUserClientFn = undefined;
        mockGetPaymentAdapterFn = undefined;
        // mockPaymentAdapter itself is an object, its spied methods are handled above
    };

    try { // To ensure global teardown

        await t.step("OPTIONS request should return CORS headers", async () => {
            beforeEachScoped();
            const req = createMockRequest('OPTIONS', '/initiate-payment', null, { Origin: MOCK_SITE_URL });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            
            assertEquals(res.status, 204);
            assertEquals(res.headers.get('access-control-allow-origin'), MOCK_SITE_URL);
            assert(res.headers.get('access-control-allow-headers')?.includes('authorization'));
            afterEachScoped();
        });

        await t.step("should return 401 if Authorization header is missing", async () => {
            beforeEachScoped();
            const req = createMockRequest('POST', '/initiate-payment', { itemId: 'test' }); // No Auth header
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 401);
            assertEquals(resBody.error, 'Missing Authorization header');
            assertSpyCalls(mockCreateUserClientFn!, 0);
            afterEachScoped();
        });
        
        await t.step("should return 401 for invalid Authorization token", async () => {
            const invalidJwtError: Error = new Error("Invalid JWT");
            invalidJwtError.name = "AuthApiError";
            beforeEachScoped({ 
                userAuthConfig: { 
                    mockUser: null, 
                    getUserResult: { data: { user: null }, error: invalidJwtError },
                }
            });

            const req = createMockRequest('POST', '/initiate-payment', { itemId: 'test' }, { Authorization: 'Bearer invalid.token' });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();
            
            assertEquals(res.status, 401);
            assertEquals(resBody.error, 'Authentication failed');
            assertSpyCall(mockCreateUserClientFn!, 0, { args: ['Bearer invalid.token'] });
            assert(mockUserSbSetup.spies?.auth?.getUserSpy, "getUserSpy should exist");
            assertSpyCalls(mockUserSbSetup.spies.auth.getUserSpy!, 1);
            afterEachScoped();
        });

        await t.step("should return 400 if request body is missing", async () => {
            beforeEachScoped(); 
            const req = createMockRequest('POST', '/initiate-payment', null, { Authorization: 'Bearer valid.token' });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 400);
            assertEquals(resBody.error, 'Request body is missing');
            assertSpyCall(mockCreateUserClientFn!, 0, { args: ['Bearer valid.token'] });
            assertSpyCalls(mockUserSbSetup.spies.auth.getUserSpy!, 1);
            afterEachScoped();
        });

        await t.step("should return 400 for invalid PurchaseRequest body (missing itemId)", async () => {
            beforeEachScoped(); // Default: auth success
            const purchaseRequestBody = { quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'stripe' }; // Missing itemId
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 400);
            assertEquals(resBody.error, 'Invalid PurchaseRequest body: missing required fields');
            afterEachScoped();
        });
        
        await t.step("should return 404 if item ID is not found or inactive", async () => {
            beforeEachScoped(); // Uses default admin mock which will return empty for MOCK_INVALID_ITEM_ID
            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_INVALID_ITEM_ID, quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'stripe', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();
            
            assertEquals(res.status, 404);
            assert(resBody.error.includes(`Item ID ${MOCK_INVALID_ITEM_ID} not found`));
            afterEachScoped();
        });

        await t.step("should return 500 if plan data is incomplete (e.g., missing tokens_to_award)", async () => {
            beforeEachScoped(); // Default admin mock returns incomplete plan for MOCK_INCOMPLETE_ITEM_ID
            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_INCOMPLETE_ITEM_ID, quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'stripe', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 500);
            assertEquals(resBody.error, 'Service offering configuration error for the selected item.');
            afterEachScoped();
        });
        
        await t.step("should return 400 if requested currency does not match plan currency", async () => {
            beforeEachScoped(); // MOCK_WRONG_CURRENCY_ITEM_ID is set to 'eur'
            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_WRONG_CURRENCY_ITEM_ID, quantity: 1, currency: 'usd', paymentGatewayId: 'stripe', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();
            
            assertEquals(res.status, 400);
            assertEquals(resBody.error, 'Requested currency does not match item currency.');
            afterEachScoped();
        });

        await t.step("should return 404 if wallet is not found for the user/org", async () => {
            beforeEachScoped({
                 userAuthConfig: { // Configure user client to find no wallet
                    mockUser: MOCK_DEFAULT_USER,
                    getUserResult: { data: { user: MOCK_DEFAULT_USER }, error: null },
                    genericMockResults: { 'token_wallets': { select: { data: [], error: null, count: 0 } } }
                 }
            });
            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_ITEM_ID, quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'stripe', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 404);
            assertEquals(resBody.error, 'User/Organization wallet not found. A wallet must be provisioned before payment.');
            afterEachScoped();
        });

        await t.step("should create a PENDING payment_transactions record and call adapter", async () => {
            beforeEachScoped(); // All defaults are for success path
            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_ITEM_ID, quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'stripe', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 200); // Success from adapter
            assertEquals(resBody.success, true);
            assertEquals(resBody.transactionId, MOCK_PAYMENT_TRANSACTION_ID);
            assert(resBody.paymentGatewayTransactionId.startsWith('stripe_session_mock_'));

            // Verify admin client was used to insert payment_transaction
            const insertSpy = mockAdminSbSetup.spies.getLatestQueryBuilderSpies('payment_transactions')?.insert;
            assert(insertSpy, "payment_transactions insert spy should exist");
            assertSpyCalls(insertSpy, 1);
            const insertArg = insertSpy.calls[0].args[0];
            assertEquals(insertArg.user_id, MOCK_USER_ID);
            assertEquals(insertArg.target_wallet_id, MOCK_WALLET_ID);
            assertEquals(insertArg.status, 'PENDING');
            assertEquals(insertArg.tokens_to_award, MOCK_tokens_to_award);
            assertEquals(insertArg.amount_requested_fiat, MOCK_ITEM_AMOUNT * purchaseRequestBody.quantity); // Total amount
            
            assertSpyCalls(mockGetPaymentAdapterFn!, 1);
            const adapterFactoryArgs: unknown[] = mockGetPaymentAdapterFn!.calls[0].args;
            assertEquals(adapterFactoryArgs.length, 2);
            assertEquals(adapterFactoryArgs[0], 'stripe');
            assertEquals(adapterFactoryArgs[1], mockAdminSbSetup.client);
            const initiatePaymentSpy = mockPaymentAdapter.initiatePayment;
            assertSpyCalls(initiatePaymentSpy, 1);
            const adapterContext = initiatePaymentSpy.calls[0].args[0];
            assertEquals(adapterContext.internalPaymentId, MOCK_PAYMENT_TRANSACTION_ID);
            assertEquals(adapterContext.itemId, MOCK_ITEM_ID);

            afterEachScoped();
        });
        
        await t.step("should return 400 if payment gateway is not supported", async () => {
            beforeEachScoped({ getAdapterShouldReturnNull: true }); // Configure getPaymentAdapterFn to return null

            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_ITEM_ID, quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'unsupported_gateway', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 400);
            assertEquals(resBody.error, "Payment gateway 'unsupported_gateway' is not supported.");
            
            // Verify payment_transactions was updated to FAILED
             const updateSpy = mockAdminSbSetup.spies.getLatestQueryBuilderSpies('payment_transactions')?.update;
            assert(updateSpy, "payment_transactions update spy should exist");
            assertSpyCalls(updateSpy, 1);
            assertEquals(updateSpy.calls[0].args[0].status, 'FAILED');

            afterEachScoped();
        });

        await t.step("should update payment_transaction to FAILED if adapter returns failure", async () => {
            const adapterErrorMessage = "Adapter failed to process";
            beforeEachScoped({
                adapterBehavior: {
                    initiatePayment: spy(async (ctx) => ({ success: false, transactionId: ctx.internalPaymentId, error: adapterErrorMessage }))
                }
            });

            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_ITEM_ID, quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'stripe', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 400); // As per createSuccessResponse(initiationResult, initiationResult.success ? 200 : 400, req )
            assertEquals(resBody.success, false);
            assertEquals(resBody.error, adapterErrorMessage);
            
            const updateSpy = mockAdminSbSetup.spies.getLatestQueryBuilderSpies('payment_transactions')?.update;
            assert(updateSpy, "payment_transactions update spy should exist");
            assertSpyCalls(updateSpy, 1);
            const updateArg = updateSpy.calls[0].args[0];
            assertEquals(updateArg.status, 'FAILED');
            assertEquals(updateArg.metadata_json.adapter_error_details, adapterErrorMessage);
            
            afterEachScoped();
        });
        
        await t.step("should handle unhandled errors gracefully with a 500 status (e.g., plan fetch throws)", async () => {
            beforeEachScoped({
                adminSupaConfig: { // Override admin client for this test
                    genericMockResults: {
                        'subscription_plans': {
                            select: async () => {
                                throw new Error("Simulated DB error fetching plans");
                            },
                        },
                    },
                },
            });
            const purchaseRequestBody: PurchaseRequest = { itemId: MOCK_ITEM_ID, quantity: 1, currency: MOCK_CURRENCY, paymentGatewayId: 'stripe', userId: MOCK_USER_ID };
            const req = createMockRequest('POST', '/initiate-payment', purchaseRequestBody, { Authorization: 'Bearer valid.token' });
            
            const res = await initiatePaymentHandler(req, supabaseClientForHandlerTests(mockAdminSbSetup), mockCreateUserClientFn!, mockGetPaymentAdapterFn!);
            const resBody = await res.json();

            assertEquals(res.status, 500);
            assertEquals(resBody.error, "Simulated DB error fetching plans"); // Error from createErrorResponse
            afterEachScoped();
        });


    } finally {
        teardownGlobalTestEnvironment(); // Teardown env once after all tests in this block
    }
});
