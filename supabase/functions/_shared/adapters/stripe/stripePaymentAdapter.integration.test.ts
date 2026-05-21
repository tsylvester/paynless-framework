import { StripePaymentAdapter } from "./stripePaymentAdapter.ts";
import Stripe from "npm:stripe";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertSpyCalls,
  stub,
  type SpyCall,
} from "jsr:@std/testing@0.225.1/mock";
import type { MockStripe } from "../../stripe.mock.ts";
import type { MockAdminTokenWalletService } from "../../services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import type { MockSupabaseClientSetup } from "../../supabase.mock.ts";
import type {
  OrchestrationLineItem,
  OrchestrationLineItemMetadata,
  PaymentCheckoutMode,
  PaymentOrchestrationContext,
  StripeCheckoutSessionMetadataMultiItem,
} from "../../types/payment.types.ts";
import { isOrchestrationLineItem } from "../../types/payment.guard.ts";
import {
  MOCK_MULTI_OTP_ITEM,
  MOCK_MULTI_SUB_ITEM,
  MOCK_SITE_URL,
  mockOrchestrationLineItem,
  mockOrchestrationLineItemMetadata,
  mockPaymentOrchestrationContext,
  mockStripeCheckoutSessionMetadataMultiItem,
  mockStripeCheckoutSessionResponse,
  mockStripePaymentIntentResponse,
  setupMocksAndAdapter,
  teardownMocks,
} from "./stripePaymentAdapter.mock.ts";

Deno.test("StripePaymentAdapter: initiatePayment integration", async (t) => {
  let mockStripe: MockStripe;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let adapter: StripePaymentAdapter;

  await t.step(
    "multi-item: context through real adapter to Stripe checkout with webhook-consumable metadata",
    async () => {
      const internalPaymentId: string = "ptxn_integration_multi_sub_otp_001";
      const sessionId: string = "cs_integration_multi_sub_otp";
      const sessionUrl: string = "https://stripe.com/pay/integration_multi_sub_otp";
      const paymentIntentId: string = "pi_integration_multi_sub_otp";
      const clientSecret: string = "pi_integration_multi_sub_otp_secret";
      const userId: string = "user-integration-multi-sub-otp";
      const targetWalletId: string = "wallet_integration_multi_sub_otp";
      const checkoutMode: PaymentCheckoutMode = "subscription";

      const expectedLineItemMetadata: OrchestrationLineItemMetadata[] = [
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

      const expectedCheckoutMetadata: StripeCheckoutSessionMetadataMultiItem =
        mockStripeCheckoutSessionMetadataMultiItem(
          {
            internal_payment_id: internalPaymentId,
            user_id: userId,
            organization_id: "",
            item_id: MOCK_MULTI_SUB_ITEM.itemId,
            tokens_to_award: "7000",
            target_wallet_id: targetWalletId,
          },
          expectedLineItemMetadata,
        );

      const expectedLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        {
          price: MOCK_MULTI_SUB_ITEM.stripePriceId,
          quantity: MOCK_MULTI_SUB_ITEM.quantity,
        },
        {
          price: MOCK_MULTI_OTP_ITEM.stripePriceId,
          quantity: MOCK_MULTI_OTP_ITEM.quantity,
        },
      ];

      const expectedStripeMetadata: Stripe.MetadataParam = {
        internal_payment_id: expectedCheckoutMetadata.internal_payment_id,
        user_id: expectedCheckoutMetadata.user_id,
        organization_id: expectedCheckoutMetadata.organization_id,
        item_id: expectedCheckoutMetadata.item_id,
        tokens_to_award: expectedCheckoutMetadata.tokens_to_award,
        target_wallet_id: expectedCheckoutMetadata.target_wallet_id,
        items: expectedCheckoutMetadata.items,
      };

      const expectedSessionParams: Stripe.Checkout.SessionCreateParams = {
        line_items: expectedLineItems,
        mode: checkoutMode,
        success_url:
          MOCK_SITE_URL +
          "/SubscriptionSuccess?payment_id=" +
          internalPaymentId +
          "&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: MOCK_SITE_URL + "/subscription?payment_id=" + internalPaymentId,
        client_reference_id: userId,
        metadata: expectedStripeMetadata,
      };

      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM, MOCK_MULTI_OTP_ITEM],
        checkoutMode: checkoutMode,
        tokensToAward: 7000,
        internalPaymentId: internalPaymentId,
        userId: userId,
        targetWalletId: targetWalletId,
        metadata: { request_origin: MOCK_SITE_URL },
      });

      if (context.lineItems === undefined) {
        throw new Error("lineItems required for multi-item integration test");
      }
      for (let lineIndex = 0; lineIndex < context.lineItems.length; lineIndex++) {
        const lineItem: OrchestrationLineItem = context.lineItems[lineIndex];
        assert(
          isOrchestrationLineItem(lineItem),
          `lineItems[${lineIndex}] must satisfy isOrchestrationLineItem before adapter`,
        );
      }

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      const stripeSessionData: Stripe.Response<Stripe.Checkout.Session> =
        mockStripeCheckoutSessionResponse({
          id: sessionId,
          url: sessionUrl,
          payment_intent: paymentIntentId,
          status: "open",
        });

      if (mockStripe.stubs.checkoutSessionsCreate.restored === false) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        "create",
        () => Promise.resolve(stripeSessionData),
      );

      const paymentIntentResponse: Stripe.Response<Stripe.PaymentIntent> =
        mockStripePaymentIntentResponse({
          id: paymentIntentId,
          client_secret: clientSecret,
        });

      if (mockStripe.stubs.paymentIntentsRetrieve.restored === false) {
        mockStripe.stubs.paymentIntentsRetrieve.restore();
      }
      mockStripe.stubs.paymentIntentsRetrieve = stub(
        mockStripe.instance.paymentIntents,
        "retrieve",
        () => Promise.resolve(paymentIntentResponse),
      );

      const result = await adapter.initiatePayment(context);

      assert(
        result.success,
        `Multi-item integration initiatePayment must succeed. Error: ${result.error}`,
      );
      assertEquals(result.transactionId, internalPaymentId);
      assertEquals(result.paymentGatewayTransactionId, sessionId);
      assertEquals(result.redirectUrl, sessionUrl);
      assertEquals(result.clientSecret, clientSecret);

      assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1);
      assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 1);

      const createCall = mockStripe.stubs.checkoutSessionsCreate.calls[0];
      assert(createCall !== undefined, "checkout.sessions.create must be called");
      assertEquals(
        JSON.stringify(createCall.args[0]),
        JSON.stringify(expectedSessionParams),
      );

      const parsedItems: OrchestrationLineItemMetadata[] = JSON.parse(
        expectedCheckoutMetadata.items,
      );
      assertEquals(parsedItems, expectedLineItemMetadata);

      assert(
        !mockSupabaseSetup.spies.fromSpy.calls.some(
          (call: SpyCall) => call.args[0] === "subscription_plans",
        ),
        "subscription_plans must not be queried on multi-item path",
      );

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    "multi-item: real isOrchestrationLineItem guard in adapter rejects invalid lineItems",
    async () => {
      const invalidLineItem: OrchestrationLineItem = mockOrchestrationLineItem({
        itemId: MOCK_MULTI_SUB_ITEM.itemId,
        stripePriceId: "",
        quantity: MOCK_MULTI_SUB_ITEM.quantity,
        tokensToAward: MOCK_MULTI_SUB_ITEM.tokensToAward,
        planType: MOCK_MULTI_SUB_ITEM.planType,
        amount: MOCK_MULTI_SUB_ITEM.amount,
        currency: MOCK_MULTI_SUB_ITEM.currency,
      });
      assert(
        !isOrchestrationLineItem(invalidLineItem),
        "invalid fixture must fail isOrchestrationLineItem before adapter call",
      );

      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [invalidLineItem],
        checkoutMode: "subscription",
        internalPaymentId: "ptxn_integration_invalid_line_item",
        metadata: { request_origin: MOCK_SITE_URL },
      });

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      const result = await adapter.initiatePayment(context);

      assertEquals(result.success, false);
      assertEquals(result.error, "Invalid lineItem at index 0");
      assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 0);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );
});
