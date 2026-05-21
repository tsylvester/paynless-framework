import type Stripe from "npm:stripe";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { Database } from "../../../types_db.ts";
import { StripePaymentAdapter } from "./stripePaymentAdapter.ts";
import type { IAdminTokenWalletService } from "../../services/tokenwallet/admin/adminTokenWalletService.interface.ts";
import {
  asSupabaseAdminClientForTests,
  createMockAdminTokenWalletService,
  type MockAdminTokenWalletService,
} from "../../services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import {
  createMockCheckoutSession,
  createMockPaymentIntent,
  createMockStripe,
  type MockStripe,
} from "../../stripe.mock.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
  type MockSupabaseDataConfig,
} from "../../supabase.mock.ts";
import type {
  OrchestrationLineItem,
  OrchestrationLineItemMetadata,
  PaymentConfirmation,
  PaymentInitiationResult,
  PaymentOrchestrationContext,
  StripeCheckoutSessionMetadata,
  StripeCheckoutSessionMetadataMultiItem,
} from "../../types/payment.types.ts";

export const MOCK_SITE_URL: string = "http://localhost:3000";
export const MOCK_WEBHOOK_SECRET: string = "whsec_test_dummy";
export const MOCK_PLAN_TS: string = "2026-04-10T12:00:00.000Z";

export const MOCK_MULTI_SUB_ITEM: OrchestrationLineItem = {
  itemId: "item-multi-sub-premium",
  stripePriceId: "price_multi_sub_premium",
  quantity: 1,
  tokensToAward: 5000,
  planType: "subscription",
  amount: 2500,
  currency: "usd",
};

export const MOCK_MULTI_OTP_ITEM: OrchestrationLineItem = {
  itemId: "item-multi-otp-standard",
  stripePriceId: "price_multi_otp_standard",
  quantity: 2,
  tokensToAward: 1000,
  planType: "one_time_purchase",
  amount: 1000,
  currency: "usd",
};

export const MOCK_MULTI_OTP_ITEM_2: OrchestrationLineItem = {
  itemId: "item-multi-otp-large",
  stripePriceId: "price_multi_otp_large",
  quantity: 1,
  tokensToAward: 10000,
  planType: "one_time_purchase",
  amount: 5000,
  currency: "usd",
};

export type OrchestrationLineItemOverrides = {
  [K in keyof OrchestrationLineItem]?: OrchestrationLineItem[K] | null;
};

export type OrchestrationLineItemMetadataOverrides = {
  [K in keyof OrchestrationLineItemMetadata]?:
    | OrchestrationLineItemMetadata[K]
    | null;
};

export type StripeCheckoutSessionMetadataOverrides = {
  [K in keyof StripeCheckoutSessionMetadata]?:
    | StripeCheckoutSessionMetadata[K]
    | null;
};

export type StripeCheckoutSessionMetadataMultiItemOverrides = {
  [K in keyof StripeCheckoutSessionMetadataMultiItem]?:
    | StripeCheckoutSessionMetadataMultiItem[K]
    | null;
};

export type PaymentOrchestrationContextOverrides = {
  [K in keyof PaymentOrchestrationContext]?:
    | PaymentOrchestrationContext[K]
    | null;
};

export type PaymentInitiationResultOverrides = {
  [K in keyof PaymentInitiationResult]?:
    | PaymentInitiationResult[K]
    | null;
};

export type PaymentConfirmationOverrides = {
  [K in keyof PaymentConfirmation]?: PaymentConfirmation[K] | null;
};

function applyOrchestrationLineItemOverrides(
  base: OrchestrationLineItem,
  overrides: OrchestrationLineItemOverrides | undefined,
): OrchestrationLineItem {
  if (overrides === undefined) {
    return base;
  }
  const item: OrchestrationLineItem = { ...base };
  if (overrides.itemId !== undefined && overrides.itemId !== null) {
    item.itemId = overrides.itemId;
  }
  if (overrides.stripePriceId !== undefined && overrides.stripePriceId !== null) {
    item.stripePriceId = overrides.stripePriceId;
  }
  if (overrides.quantity !== undefined && overrides.quantity !== null) {
    item.quantity = overrides.quantity;
  }
  if (overrides.tokensToAward !== undefined && overrides.tokensToAward !== null) {
    item.tokensToAward = overrides.tokensToAward;
  }
  if (overrides.planType !== undefined && overrides.planType !== null) {
    item.planType = overrides.planType;
  }
  if (overrides.amount !== undefined && overrides.amount !== null) {
    item.amount = overrides.amount;
  }
  if (overrides.currency !== undefined && overrides.currency !== null) {
    item.currency = overrides.currency;
  }
  return item;
}

function applyOrchestrationLineItemMetadataOverrides(
  base: OrchestrationLineItemMetadata,
  overrides: OrchestrationLineItemMetadataOverrides | undefined,
): OrchestrationLineItemMetadata {
  if (overrides === undefined) {
    return base;
  }
  const entry: OrchestrationLineItemMetadata = { ...base };
  if (overrides.itemId !== undefined && overrides.itemId !== null) {
    entry.itemId = overrides.itemId;
  }
  if (overrides.quantity !== undefined && overrides.quantity !== null) {
    entry.quantity = overrides.quantity;
  }
  if (
    overrides.tokensToAward !== undefined &&
    overrides.tokensToAward !== null
  ) {
    entry.tokensToAward = overrides.tokensToAward;
  }
  return entry;
}

function applyStripeCheckoutSessionMetadataOverrides(
  base: StripeCheckoutSessionMetadata,
  overrides: StripeCheckoutSessionMetadataOverrides | undefined,
): StripeCheckoutSessionMetadata {
  if (overrides === undefined) {
    return base;
  }
  const metadata: StripeCheckoutSessionMetadata = { ...base };
  if (
    overrides.internal_payment_id !== undefined &&
    overrides.internal_payment_id !== null
  ) {
    metadata.internal_payment_id = overrides.internal_payment_id;
  }
  if (overrides.user_id !== undefined && overrides.user_id !== null) {
    metadata.user_id = overrides.user_id;
  }
  if (
    overrides.organization_id !== undefined &&
    overrides.organization_id !== null
  ) {
    metadata.organization_id = overrides.organization_id;
  }
  if (overrides.item_id !== undefined && overrides.item_id !== null) {
    metadata.item_id = overrides.item_id;
  }
  if (
    overrides.tokens_to_award !== undefined &&
    overrides.tokens_to_award !== null
  ) {
    metadata.tokens_to_award = overrides.tokens_to_award;
  }
  if (
    overrides.target_wallet_id !== undefined &&
    overrides.target_wallet_id !== null
  ) {
    metadata.target_wallet_id = overrides.target_wallet_id;
  }
  return metadata;
}

function applyStripeCheckoutSessionMetadataMultiItemOverrides(
  base: StripeCheckoutSessionMetadataMultiItem,
  overrides: StripeCheckoutSessionMetadataMultiItemOverrides | undefined,
): StripeCheckoutSessionMetadataMultiItem {
  if (overrides === undefined) {
    return base;
  }
  const metadata: StripeCheckoutSessionMetadataMultiItem = { ...base };
  if (
    overrides.internal_payment_id !== undefined &&
    overrides.internal_payment_id !== null
  ) {
    metadata.internal_payment_id = overrides.internal_payment_id;
  }
  if (overrides.user_id !== undefined && overrides.user_id !== null) {
    metadata.user_id = overrides.user_id;
  }
  if (
    overrides.organization_id !== undefined &&
    overrides.organization_id !== null
  ) {
    metadata.organization_id = overrides.organization_id;
  }
  if (overrides.item_id !== undefined && overrides.item_id !== null) {
    metadata.item_id = overrides.item_id;
  }
  if (
    overrides.tokens_to_award !== undefined &&
    overrides.tokens_to_award !== null
  ) {
    metadata.tokens_to_award = overrides.tokens_to_award;
  }
  if (
    overrides.target_wallet_id !== undefined &&
    overrides.target_wallet_id !== null
  ) {
    metadata.target_wallet_id = overrides.target_wallet_id;
  }
  if (overrides.items !== undefined && overrides.items !== null) {
    metadata.items = overrides.items;
  }
  return metadata;
}

function applyPaymentOrchestrationContextOverrides(
  base: PaymentOrchestrationContext,
  overrides: PaymentOrchestrationContextOverrides | undefined,
): PaymentOrchestrationContext {
  if (overrides === undefined) {
    return base;
  }
  const context: PaymentOrchestrationContext = { ...base };
  if (overrides.userId !== undefined && overrides.userId !== null) {
    context.userId = overrides.userId;
  }
  if (overrides.organizationId !== undefined) {
    context.organizationId = overrides.organizationId;
  }
  if (overrides.itemId !== undefined && overrides.itemId !== null) {
    context.itemId = overrides.itemId;
  }
  if (overrides.quantity !== undefined && overrides.quantity !== null) {
    context.quantity = overrides.quantity;
  }
  if (
    overrides.paymentGatewayId !== undefined &&
    overrides.paymentGatewayId !== null
  ) {
    context.paymentGatewayId = overrides.paymentGatewayId;
  }
  if (overrides.metadata !== undefined) {
    context.metadata = overrides.metadata === null
      ? undefined
      : overrides.metadata;
  }
  if (overrides.siteUrl !== undefined) {
    context.siteUrl = overrides.siteUrl === null
      ? undefined
      : overrides.siteUrl;
  }
  if (overrides.request_origin !== undefined) {
    context.request_origin = overrides.request_origin === null
      ? undefined
      : overrides.request_origin;
  }
  if (
    overrides.internalPaymentId !== undefined &&
    overrides.internalPaymentId !== null
  ) {
    context.internalPaymentId = overrides.internalPaymentId;
  }
  if (
    overrides.targetWalletId !== undefined &&
    overrides.targetWalletId !== null
  ) {
    context.targetWalletId = overrides.targetWalletId;
  }
  if (
    overrides.tokensToAward !== undefined &&
    overrides.tokensToAward !== null
  ) {
    context.tokensToAward = overrides.tokensToAward;
  }
  if (
    overrides.amountForGateway !== undefined &&
    overrides.amountForGateway !== null
  ) {
    context.amountForGateway = overrides.amountForGateway;
  }
  if (
    overrides.currencyForGateway !== undefined &&
    overrides.currencyForGateway !== null
  ) {
    context.currencyForGateway = overrides.currencyForGateway;
  }
  if (overrides.lineItems !== undefined) {
    context.lineItems = overrides.lineItems === null
      ? undefined
      : overrides.lineItems;
  }
  if ("checkoutMode" in overrides) {
    context.checkoutMode = overrides.checkoutMode === null
      ? undefined
      : overrides.checkoutMode;
  }
  return context;
}

function applyPaymentInitiationResultOverrides(
  base: PaymentInitiationResult,
  overrides: PaymentInitiationResultOverrides | undefined,
): PaymentInitiationResult {
  if (overrides === undefined) {
    return base;
  }
  const result: PaymentInitiationResult = { ...base };
  if (overrides.success !== undefined && overrides.success !== null) {
    result.success = overrides.success;
  }
  if (overrides.transactionId !== undefined) {
    result.transactionId = overrides.transactionId === null
      ? undefined
      : overrides.transactionId;
  }
  if (overrides.paymentGatewayTransactionId !== undefined) {
    result.paymentGatewayTransactionId = overrides.paymentGatewayTransactionId ===
        null
      ? undefined
      : overrides.paymentGatewayTransactionId;
  }
  if (overrides.redirectUrl !== undefined) {
    result.redirectUrl = overrides.redirectUrl === null
      ? undefined
      : overrides.redirectUrl;
  }
  if (overrides.clientSecret !== undefined) {
    result.clientSecret = overrides.clientSecret === null
      ? undefined
      : overrides.clientSecret;
  }
  if (overrides.error !== undefined) {
    result.error = overrides.error === null ? undefined : overrides.error;
  }
  return result;
}

function applyPaymentConfirmationOverrides(
  base: PaymentConfirmation,
  overrides: PaymentConfirmationOverrides | undefined,
): PaymentConfirmation {
  if (overrides === undefined) {
    return base;
  }
  const confirmation: PaymentConfirmation = { ...base };
  if (overrides.success !== undefined && overrides.success !== null) {
    confirmation.success = overrides.success;
  }
  if (overrides.transactionId !== undefined) {
    confirmation.transactionId = overrides.transactionId === null
      ? undefined
      : overrides.transactionId;
  }
  if (overrides.paymentGatewayTransactionId !== undefined) {
    confirmation.paymentGatewayTransactionId =
      overrides.paymentGatewayTransactionId === null
        ? undefined
        : overrides.paymentGatewayTransactionId;
  }
  if (overrides.tokensAwarded !== undefined) {
    confirmation.tokensAwarded = overrides.tokensAwarded === null
      ? undefined
      : overrides.tokensAwarded;
  }
  if (overrides.error !== undefined) {
    confirmation.error = overrides.error === null
      ? undefined
      : overrides.error;
  }
  if (overrides.message !== undefined) {
    confirmation.message = overrides.message === null
      ? undefined
      : overrides.message;
  }
  if (overrides.status !== undefined) {
    confirmation.status = overrides.status === null
      ? undefined
      : overrides.status;
  }
  return confirmation;
}

export function mockOrchestrationLineItem(
  overrides?: OrchestrationLineItemOverrides,
): OrchestrationLineItem {
  const base: OrchestrationLineItem = {
    itemId: "price_mock_item",
    stripePriceId: "price_mock_item",
    quantity: 1,
    tokensToAward: 1000,
    planType: "one_time_purchase",
    amount: 1000,
    currency: "usd",
  };
  return applyOrchestrationLineItemOverrides(base, overrides);
}

export function mockOrchestrationLineItemMetadata(
  overrides?: OrchestrationLineItemMetadataOverrides,
): OrchestrationLineItemMetadata {
  const base: OrchestrationLineItemMetadata = {
    itemId: "price_mock_item",
    quantity: 1,
    tokensToAward: 1000,
  };
  return applyOrchestrationLineItemMetadataOverrides(base, overrides);
}

export function mockStripeCheckoutSessionMetadata(
  overrides?: StripeCheckoutSessionMetadataOverrides,
): StripeCheckoutSessionMetadata {
  const base: StripeCheckoutSessionMetadata = {
    internal_payment_id: "ptxn_mock_001",
    user_id: "user-stripe-adapter-test",
    organization_id: "",
    item_id: "price_mock_item",
    tokens_to_award: "1000",
    target_wallet_id: "wallet_mock_001",
  };
  return applyStripeCheckoutSessionMetadataOverrides(base, overrides);
}

export function mockStripeCheckoutSessionMetadataMultiItem(
  overrides?: StripeCheckoutSessionMetadataMultiItemOverrides,
  lineItemMetadataOverrides?: OrchestrationLineItemMetadata[],
): StripeCheckoutSessionMetadataMultiItem {
  const lineMetadata: OrchestrationLineItemMetadata[] =
    lineItemMetadataOverrides ?? [
      mockOrchestrationLineItemMetadata({
        itemId: MOCK_MULTI_SUB_ITEM.itemId,
        quantity: MOCK_MULTI_SUB_ITEM.quantity,
        tokensToAward: MOCK_MULTI_SUB_ITEM.tokensToAward,
      }),
      mockOrchestrationLineItemMetadata({
        itemId: MOCK_MULTI_OTP_ITEM.itemId,
        quantity: MOCK_MULTI_OTP_ITEM.quantity,
        tokensToAward: MOCK_MULTI_OTP_ITEM.tokensToAward,
      }),
    ];
  const base: StripeCheckoutSessionMetadataMultiItem = {
    ...mockStripeCheckoutSessionMetadata({
      internal_payment_id: "ptxn_multi_sub_otp_001",
      user_id: "user-multi-sub-otp",
      item_id: MOCK_MULTI_SUB_ITEM.itemId,
      tokens_to_award: "7000",
      target_wallet_id: "wallet_multi_sub_otp",
    }),
    items: JSON.stringify(lineMetadata),
  };
  return applyStripeCheckoutSessionMetadataMultiItemOverrides(base, overrides);
}

export function mockStripeCheckoutSessionResponse(
  sessionOverrides: Partial<Stripe.Checkout.Session> = {},
  requestId?: string,
): Stripe.Response<Stripe.Checkout.Session> {
  const session: Stripe.Checkout.Session = createMockCheckoutSession(sessionOverrides);
  const resolvedRequestId: string = requestId ?? `req_${session.id}`;
  const response: Stripe.Response<Stripe.Checkout.Session> = {
    ...session,
    lastResponse: {
      headers: {},
      requestId: resolvedRequestId,
      statusCode: 200,
    },
  };
  return response;
}

export function mockStripePaymentIntentResponse(
  paymentIntentOverrides: Partial<Stripe.PaymentIntent> = {},
  requestId?: string,
): Stripe.Response<Stripe.PaymentIntent> {
  const paymentIntent: Stripe.PaymentIntent = createMockPaymentIntent(paymentIntentOverrides);
  const resolvedRequestId: string = requestId ?? `req_${paymentIntent.id}`;
  const response: Stripe.Response<Stripe.PaymentIntent> = {
    ...paymentIntent,
    lastResponse: {
      headers: {},
      requestId: resolvedRequestId,
      statusCode: 200,
    },
  };
  return response;
}

export function mockStripeCheckoutSessionWithExpandedPaymentIntent(
  sessionOverrides: Partial<Stripe.Checkout.Session>,
  paymentIntentOverrides: Partial<Stripe.PaymentIntent>,
): Stripe.Response<Stripe.Checkout.Session> {
  const paymentIntent: Stripe.PaymentIntent = createMockPaymentIntent(paymentIntentOverrides);
  return mockStripeCheckoutSessionResponse({
    ...sessionOverrides,
    payment_intent: paymentIntent,
  });
}

export function mockPaymentIntentRetrieveNoData(
  _paymentIntentId: string,
): Promise<Stripe.Response<Stripe.PaymentIntent>> {
  const retrieveError: Error = new Error(
    "PaymentIntent retrieve returned no data for checkout session payment_intent",
  );
  return Promise.reject(retrieveError);
}

export function mockPaymentOrchestrationContext(
  overrides?: PaymentOrchestrationContextOverrides,
): PaymentOrchestrationContext {
  const base: PaymentOrchestrationContext = {
    userId: "user-stripe-adapter-test",
    organizationId: null,
    itemId: "price_mock_item",
    quantity: 1,
    paymentGatewayId: "stripe",
    metadata: { request_origin: MOCK_SITE_URL },
    internalPaymentId: "ptxn_mock_001",
    targetWalletId: "wallet_mock_001",
    tokensToAward: 1000,
    amountForGateway: 1000,
    currencyForGateway: "usd",
  };
  return applyPaymentOrchestrationContextOverrides(base, overrides);
}

export function mockPaymentInitiationResult(
  overrides?: PaymentInitiationResultOverrides,
): PaymentInitiationResult {
  const base: PaymentInitiationResult = {
    success: true,
    transactionId: "ptxn_mock_001",
    paymentGatewayTransactionId: "cs_mock_session",
    redirectUrl: "https://checkout.stripe.com/pay/cs_mock_session",
    clientSecret: "pi_mock_secret",
  };
  return applyPaymentInitiationResultOverrides(base, overrides);
}

export function mockPaymentConfirmation(
  overrides?: PaymentConfirmationOverrides,
): PaymentConfirmation {
  const base: PaymentConfirmation = {
    success: true,
    transactionId: "ptxn_mock_001",
    paymentGatewayTransactionId: "cs_mock_session",
    tokensAwarded: undefined,
    error: undefined,
    message: undefined,
    status: undefined,
  };
  return applyPaymentConfirmationOverrides(base, overrides);
}

export function setupMocksAndAdapter(
  supabaseConfig: MockSupabaseDataConfig = {},
): {
  mockStripe: MockStripe;
  mockSupabaseSetup: MockSupabaseClientSetup;
  mockTokenWalletService: MockAdminTokenWalletService;
  adapter: StripePaymentAdapter;
} {
  Deno.env.set("SITE_URL", MOCK_SITE_URL);
  const mockStripe: MockStripe = createMockStripe();
  const mockSupabaseSetup: MockSupabaseClientSetup = createMockSupabaseClient(
    undefined,
    supabaseConfig,
  );
  const mockTokenWalletService: MockAdminTokenWalletService =
    createMockAdminTokenWalletService();
  const adapter: StripePaymentAdapter = mockStripePaymentAdapter(
    mockStripe.instance,
    asSupabaseAdminClientForTests(mockSupabaseSetup.client),
    mockTokenWalletService.instance,
    MOCK_WEBHOOK_SECRET,
  );
  return {
    mockStripe,
    mockSupabaseSetup,
    mockTokenWalletService,
    adapter,
  };
}

export function teardownMocks(
  mockStripe: MockStripe,
  mockTokenWalletService: MockAdminTokenWalletService,
): void {
  Deno.env.delete("SITE_URL");
  mockStripe.clearStubs();
  mockTokenWalletService.clearStubs();
}

export function mockStripePaymentAdapter(
  stripeInstance: Stripe,
  adminSupabaseClient: SupabaseClient<Database>,
  tokenWalletService: IAdminTokenWalletService,
  stripeWebhookSecret: string,
): StripePaymentAdapter {
  const adapter: StripePaymentAdapter = new StripePaymentAdapter(
    stripeInstance,
    adminSupabaseClient,
    tokenWalletService,
    stripeWebhookSecret,
  );
  return adapter;
}
