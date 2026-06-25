import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCalls, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { createClient } from "npm:@supabase/supabase-js";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import {
  coreCleanupTestResources,
  coreInitializeTestStep,
  findProcessedResource,
  initializeTestDeps,
  registerUndoAction,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "../_shared/_integration.test.utils.ts";
import { StripePaymentAdapter } from "../_shared/adapters/stripe/stripePaymentAdapter.ts";
import { AdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.provides.ts";
import {
  createMockCheckoutSession,
  createMockStripe,
  type MockStripe,
} from "../_shared/stripe.mock.ts";
import { isOrchestrationLineItem } from "../_shared/types/payment.guard.ts";
import type {
  IPaymentGatewayAdapter,
  PaymentInitiationResult,
  PurchaseRequest,
} from "../_shared/types/payment.types.ts";
import type { Database } from "../types_db.ts";
import { initiatePaymentHandler } from "./index.ts";

const WEBHOOK_SECRET: string | undefined = Deno.env.get(
  "STRIPE_WEBHOOK_SIGNING_SECRET",
) ?? Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET");

const INTEGRATION_SITE_URL: string = Deno.env.get("SITE_URL") ??
  "http://localhost:5173";

if (
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  !Deno.env.get("SUPABASE_JWT_SECRET") ||
  !WEBHOOK_SECRET
) {
  console.error(
    "CRITICAL: Required environment variables missing for initiate-payment integration tests.",
  );
  Deno.exit(1);
}

Deno.test({
  name: "initiate-payment: multi-item orchestration integration",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  initializeTestDeps();

  const runSuffix: string = crypto.randomUUID().slice(0, 8);
  const integrationSubPriceId: string = `price_integ_sub_${runSuffix}`;
  const integrationOtpPriceId: string = `price_integ_otp_${runSuffix}`;
  const subTokensToAward: number = 500;
  const subAmount: number = 15;
  const otpTokensToAward: number = 1000;
  const otpAmount: number = 20;
  const integrationCurrency: string = "usd";
  const expectedAggregateTokens: number = subTokensToAward * 1 +
    otpTokensToAward * 2;
  const expectedAggregateAmount: number = subAmount * 1 + otpAmount * 2;

  let mockStripe: MockStripe | undefined = undefined;

  try {
    mockStripe = createMockStripe();
    const stripeMock: MockStripe = mockStripe;

    const integrationCheckoutSessionId: string = `cs_integ_${runSuffix}`;
    const integrationPaymentIntentId: string = `pi_integ_${runSuffix}`;
    const stripeSessionResponse = {
      ...createMockCheckoutSession({
        id: integrationCheckoutSessionId,
        mode: "subscription",
        url: `https://checkout.stripe.com/pay/${integrationCheckoutSessionId}`,
        payment_intent: integrationPaymentIntentId,
      }),
      lastResponse: {
        headers: {},
        requestId: `req_integ_checkout_${runSuffix}`,
        statusCode: 200,
      },
    } as Stripe.Response<Stripe.Checkout.Session>;

    if (stripeMock.stubs.checkoutSessionsCreate.restore) {
      stripeMock.stubs.checkoutSessionsCreate.restore();
    }
    stripeMock.stubs.checkoutSessionsCreate = stub(
      stripeMock.instance.checkout.sessions,
      "create",
      () => Promise.resolve(stripeSessionResponse),
    );

    if (stripeMock.stubs.paymentIntentsRetrieve.restore) {
      stripeMock.stubs.paymentIntentsRetrieve.restore();
    }
    const mockPaymentIntentResponse = {
      id: integrationPaymentIntentId,
      object: "payment_intent",
      client_secret: `${integrationPaymentIntentId}_secret_integration`,
      status: "succeeded",
      lastResponse: {
        headers: {},
        requestId: `req_integ_pi_${runSuffix}`,
        statusCode: 200,
      },
    } as Stripe.Response<Stripe.PaymentIntent>;
    stripeMock.stubs.paymentIntentsRetrieve = stub(
      stripeMock.instance.paymentIntents,
      "retrieve",
      () => Promise.resolve(mockPaymentIntentResponse),
    );

    await t.step(
      "authenticated multi-item request integrates DB plans, wallet, payment_transactions, and StripePaymentAdapter",
      async () => {
        const init = await coreInitializeTestStep(
          {
            initialWalletBalance: 0,
            resources: [
              {
                tableName: "subscription_plans",
                identifier: { stripe_price_id: integrationSubPriceId },
                exportId: "integrationSubPlan",
                desiredState: {
                  name: `Integration subscription ${runSuffix}`,
                  plan_type: "subscription",
                  item_id_internal: `item_integ_sub_${runSuffix}`,
                  tokens_to_award: subTokensToAward,
                  amount: subAmount,
                  currency: integrationCurrency,
                  active: true,
                },
              },
              {
                tableName: "subscription_plans",
                identifier: { stripe_price_id: integrationOtpPriceId },
                exportId: "integrationOtpPlan",
                desiredState: {
                  name: `Integration OTP ${runSuffix}`,
                  plan_type: "one_time_purchase",
                  item_id_internal: `item_integ_otp_${runSuffix}`,
                  tokens_to_award: otpTokensToAward,
                  amount: otpAmount,
                  currency: integrationCurrency,
                  active: true,
                },
              },
            ],
          },
          "local",
        );

        const primaryUserId: string = init.primaryUserId;
        const primaryUserJwt: string = init.primaryUserJwt;
        const adminClient: SupabaseClient<Database> = init.adminClient;

        const subPlan = findProcessedResource(
          init.processedResources,
          "subscription_plans",
          "integrationSubPlan",
        );
        const otpPlan = findProcessedResource(
          init.processedResources,
          "subscription_plans",
          "integrationOtpPlan",
        );
        assertExists(subPlan);
        assertExists(otpPlan);
        assertEquals(subPlan.stripe_price_id, integrationSubPriceId);
        assertEquals(otpPlan.stripe_price_id, integrationOtpPriceId);
        assertEquals(subPlan.tokens_to_award, subTokensToAward);
        assertEquals(otpPlan.tokens_to_award, otpTokensToAward);

        const walletRow: { wallet_id: string } | null = (
          await adminClient
            .from("token_wallets")
            .select("wallet_id")
            .eq("user_id", primaryUserId)
            .is("organization_id", null)
            .single()
        ).data;
        assertExists(walletRow);

        const getPaymentAdapterFn = (
          gatewayId: string,
          adminSupabaseClient: SupabaseClient<Database>,
        ): IPaymentGatewayAdapter => {
          if (gatewayId !== "stripe") {
            throw new Error(`Unsupported payment gateway: ${gatewayId}`);
          }
          const adapter: StripePaymentAdapter = new StripePaymentAdapter(
            stripeMock.instance,
            adminSupabaseClient,
            new AdminTokenWalletService(adminSupabaseClient),
            WEBHOOK_SECRET,
          );
          return adapter;
        };

        const createUserClientFn = (authHeader: string): SupabaseClient<Database> => {
          return createClient<Database>(
            SUPABASE_URL!,
            SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: authHeader } } },
          );
        };

        const purchaseRequestBody: PurchaseRequest = {
          userId: primaryUserId,
          itemId: integrationSubPriceId,
          quantity: 1,
          currency: integrationCurrency,
          paymentGatewayId: "stripe",
          items: [
            { itemId: integrationSubPriceId, quantity: 1 },
            { itemId: integrationOtpPriceId, quantity: 2 },
          ],
        };

        const initiatePaymentUrl: URL = new URL(
          "/initiate-payment",
          INTEGRATION_SITE_URL,
        );
        const req: Request = new Request(initiatePaymentUrl.toString(), {
          method: "POST",
          headers: new Headers({
            Authorization: `Bearer ${primaryUserJwt}`,
            Origin: INTEGRATION_SITE_URL,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(purchaseRequestBody),
        });

        const res: Response = await initiatePaymentHandler(
          req,
          adminClient,
          createUserClientFn,
          getPaymentAdapterFn,
        );
        const resBody: PaymentInitiationResult = await res.json();

        assertEquals(res.status, 200);
        assertEquals(resBody.success, true);
        assertEquals(
          resBody.paymentGatewayTransactionId,
          integrationCheckoutSessionId,
        );

        const txnRow: {
          id: string;
          tokens_to_award: number | null;
          amount_requested_fiat: number | null;
          currency_requested_fiat: string | null;
          target_wallet_id: string | null;
          metadata_json: Database["public"]["Tables"]["payment_transactions"]["Row"]["metadata_json"];
        } | null = (
          await adminClient
            .from("payment_transactions")
            .select(
              "id, tokens_to_award, amount_requested_fiat, currency_requested_fiat, target_wallet_id, metadata_json",
            )
            .eq("user_id", primaryUserId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single()
        ).data;
        assertExists(txnRow);
        registerUndoAction({
          type: "DELETE_CREATED_ROW",
          tableName: "payment_transactions",
          criteria: { id: txnRow.id },
          scope: "local",
        });

        assertEquals(txnRow.tokens_to_award, expectedAggregateTokens);
        assertEquals(txnRow.amount_requested_fiat, expectedAggregateAmount);
        assertEquals(txnRow.currency_requested_fiat, integrationCurrency);
        assertEquals(txnRow.target_wallet_id, walletRow.wallet_id);

        const metadataJson: Database["public"]["Tables"]["payment_transactions"]["Row"]["metadata_json"] =
          txnRow.metadata_json;
        assert(typeof metadataJson === "object" && metadataJson !== null);
        assert(!Array.isArray(metadataJson));
        const metadataItemsRaw: unknown = metadataJson["items"];
        if (typeof metadataItemsRaw !== "string") {
          assert(false, "metadata_json.items must be a string");
        }
        const metadataItemsJson: string = metadataItemsRaw;
        const parsedMetadataItems: unknown = JSON.parse(metadataItemsJson);
        assert(Array.isArray(parsedMetadataItems));
        let orchestrationLineItemCount: number = 0;
        for (const entry of parsedMetadataItems) {
          if (isOrchestrationLineItem(entry)) {
            orchestrationLineItemCount += 1;
          }
        }
        assertEquals(orchestrationLineItemCount, 2);

        assertSpyCalls(stripeMock.stubs.checkoutSessionsCreate, 1);
        const sessionCreateCallArgs: unknown[] = stripeMock.stubs.checkoutSessionsCreate
          .calls[0].args;
        const sessionParamsUnknown: unknown = sessionCreateCallArgs[0];
        if (typeof sessionParamsUnknown !== "object" || sessionParamsUnknown === null) {
          assert(false, "checkout.sessions.create first argument must be an object");
        }
        if (!("mode" in sessionParamsUnknown)) {
          assert(false, "checkout.sessions.create params must include mode");
        }
        const sessionMode: unknown = sessionParamsUnknown["mode"];
        assertEquals(sessionMode, "subscription");
        if (!("metadata" in sessionParamsUnknown)) {
          assert(false, "checkout.sessions.create params must include metadata");
        }
        const sessionMetadataUnknown: unknown = sessionParamsUnknown["metadata"];
        if (
          typeof sessionMetadataUnknown !== "object" ||
          sessionMetadataUnknown === null ||
          Array.isArray(sessionMetadataUnknown)
        ) {
          assert(false, "checkout.sessions.create metadata must be an object");
        }
        const sessionItemId: unknown = Reflect.get(
          sessionMetadataUnknown,
          "item_id",
        );
        assertEquals(sessionItemId, integrationSubPriceId);
        if (!("line_items" in sessionParamsUnknown)) {
          assert(false, "checkout.sessions.create params must include line_items");
        }
        const sessionLineItemsUnknown: unknown = sessionParamsUnknown["line_items"];
        if (!Array.isArray(sessionLineItemsUnknown)) {
          assert(false, "checkout.sessions.create line_items must be an array");
        }
        assertEquals(sessionLineItemsUnknown.length, 1);
        const firstLineItemUnknown: unknown = sessionLineItemsUnknown[0];
        if (typeof firstLineItemUnknown !== "object" || firstLineItemUnknown === null) {
          assert(false, "checkout.sessions.create line item must be an object");
        }
        const firstLinePrice: unknown = Reflect.get(firstLineItemUnknown, "price");
        const firstLineQuantity: unknown = Reflect.get(
          firstLineItemUnknown,
          "quantity",
        );
        assertEquals(firstLinePrice, integrationSubPriceId);
        assertEquals(firstLineQuantity, 1);
      },
    );
  } finally {
    if (mockStripe !== undefined) {
      mockStripe.clearStubs();
    }
    await coreCleanupTestResources("local");
  }
});
