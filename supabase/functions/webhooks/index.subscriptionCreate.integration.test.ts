import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "jsr:@std/testing@0.225.1/mock";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";

import {
  coreCleanupTestResources,
  coreInitializeTestStep,
  initializeTestDeps,
  registerUndoAction,
} from "../_shared/_integration.test.utils.ts";
import { StripePaymentAdapter } from "../_shared/adapters/stripe/stripePaymentAdapter.ts";
import {
  createMockCheckoutSessionCompletedEvent,
  createMockInvoicePaymentSucceededEvent,
  createMockInvoiceLineItem,
} from "../_shared/stripe.mock.ts";
import type { IAdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts";
import { AdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.ts";
import type { Database, Json, TablesInsert } from "../types_db.ts";
import { handleWebhookRequestLogic, type PaymentAdapterFactoryFn } from "./index.ts";

const WEBHOOK_SECRET: string = "whsec_integration_subscription_create_test";
const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-03-31.basil";

function buildStripeSubscriptionResponse(params: {
  subscriptionId: string;
  customerId: string;
  priceId: string;
}): Stripe.Response<Stripe.Subscription> {
  const now: number = Math.floor(Date.now() / 1000);
  return {
    object: "subscription",
    id: params.subscriptionId,
    customer: params.customerId,
    status: "active",
    items: {
      object: "list",
      data: [
        {
          object: "subscription_item",
          id: `si_integ_${params.subscriptionId}`,
          price: {
            object: "price",
            id: params.priceId,
            product: "prod_integ_subscription_create",
            active: true,
            currency: "usd",
          },
          quantity: 1,
          created: now - 5000,
          subscription: params.subscriptionId,
        },
      ],
      has_more: false,
      url: `/v1/subscription_items?subscription=${params.subscriptionId}`,
    },
    cancel_at_period_end: false,
    created: now - 20000,
    current_period_end: now + 10000,
    current_period_start: now - 10000,
    livemode: false,
    metadata: {},
    start_date: now - 20000,
    lastResponse: {
      headers: {},
      requestId: "req_integ_sub_retrieve",
      statusCode: 200,
    },
  } as unknown as Stripe.Response<Stripe.Subscription>;
}

async function countPaymentTransactionsForUser(
  adminClient: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { count, error } = await adminClient
    .from("payment_transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  assertEquals(error, null, error?.message ?? "");
  return count ?? 0;
}

Deno.test({
  name: "webhooks: subscription create + invoice.payment_succeeded integration",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  initializeTestDeps();

  const runSuffix: string = crypto.randomUUID().slice(0, 8);
  const integrationPriceId: string = `price_integ_sub_${runSuffix}`;
  const stripeCustomerId: string = `cus_integ_${runSuffix}`;
  const stripeSubscriptionId: string = `sub_integ_${runSuffix}`;
  const checkoutSessionId: string = `cs_integ_${runSuffix}`;
  const invoiceSubscriptionCreateId: string = `in_integ_subcreate_${runSuffix}`;
  const invoiceSubscriptionCycleId: string = `in_integ_cycle_${runSuffix}`;
  const renewalEventId: string = `evt_integ_cycle_${runSuffix}`;

  const stripe: Stripe = new Stripe("sk_test_integration_placeholder", {
    apiVersion: STRIPE_API_VERSION,
  });

  const stripeEventQueue: Stripe.Event[] = [];
  const constructStub: Stub<
    Stripe.Webhooks,
    Parameters<Stripe.Webhooks["constructEventAsync"]>,
    Promise<Stripe.Event>
  > = stub(
    stripe.webhooks,
    "constructEventAsync",
    async (): Promise<Stripe.Event> => {
      const next: Stripe.Event | undefined = stripeEventQueue.shift();
      if (next === undefined) {
        throw new Error("stripeEventQueue empty: no event queued for constructEventAsync");
      }
      return next;
    },
  );

  const retrieveStub: Stub<
    Stripe.SubscriptionsResource,
    Parameters<Stripe.SubscriptionsResource["retrieve"]>,
    Promise<Stripe.Response<Stripe.Subscription>>
  > = stub(stripe.subscriptions, "retrieve", async (id: string) => {
    if (id === stripeSubscriptionId) {
      return Promise.resolve(
        buildStripeSubscriptionResponse({
          subscriptionId: stripeSubscriptionId,
          customerId: stripeCustomerId,
          priceId: integrationPriceId,
        }),
      );
    }
    throw new Error(`subscriptions.retrieve unexpected id: ${id}`);
  });

  let primaryUserId: string = "";
  let adminForCleanup: SupabaseClient<Database> | null = null;
  let walletId: string = "";
  let paymentTxId: string = "";
  try {
    const init = await coreInitializeTestStep(
      {
        initialWalletBalance: 0,
        resources: [
          {
            tableName: "subscription_plans",
            identifier: { stripe_price_id: integrationPriceId },
            desiredState: {
              name: `Integration plan ${runSuffix}`,
              plan_type: "subscription",
              item_id_internal: `item_integ_${runSuffix}`,
              tokens_to_award: 100,
              active: true,
            },
          },
        ],
      },
      "local",
    );
    primaryUserId = init.primaryUserId;
    const adminClient: SupabaseClient<Database> = init.adminClient;
    adminForCleanup = adminClient;

    const walletRow: { wallet_id: string; balance: number } | null = (
      await adminClient
        .from("token_wallets")
        .select("wallet_id, balance")
        .eq("user_id", primaryUserId)
        .is("organization_id", null)
        .single()
    ).data;
    assertExists(walletRow);
    walletId = walletRow.wallet_id;

    paymentTxId = crypto.randomUUID();
    const metadataJson: Json = {
      itemId: integrationPriceId,
    };
    const pendingPayment: TablesInsert<"payment_transactions"> = {
      id: paymentTxId,
      payment_gateway_id: "stripe",
      status: "PENDING",
      target_wallet_id: walletId,
      tokens_to_award: 100,
      user_id: primaryUserId,
      metadata_json: metadataJson,
    };
    const insertPtError = (await adminClient.from("payment_transactions").insert(pendingPayment))
      .error;
    assertEquals(insertPtError, null, insertPtError?.message ?? "");
    registerUndoAction({
      type: "DELETE_CREATED_ROW",
      tableName: "payment_transactions",
      criteria: { id: paymentTxId },
      scope: "local",
    });

    const paymentAdapterFactory: PaymentAdapterFactoryFn = (
      source: string,
      client: SupabaseClient<Database>,
      tokenWalletService: IAdminTokenWalletService,
    ) => {
      if (source !== "stripe") {
        return null;
      }
      const adapter: StripePaymentAdapter = new StripePaymentAdapter(
        stripe,
        client,
        tokenWalletService,
        WEBHOOK_SECRET,
      );
      return adapter;
    };

    const dispatchStripeWebhook = async (event: Stripe.Event): Promise<Response> => {
      stripeEventQueue.push(event);
      const request: Request = new Request("http://127.0.0.1/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "t=123,v1=integration_test",
        },
        body: new Uint8Array([1]),
      });
      return await handleWebhookRequestLogic(request, {
        adminClient,
        tokenWalletService: new AdminTokenWalletService(adminClient),
        paymentAdapterFactory,
        getEnv: (key: string): string | undefined => {
          if (key === "SUPABASE_INTERNAL_FUNCTIONS_URL" || key === "SUPABASE_URL") {
            return Deno.env.get("SUPABASE_URL");
          }
          return Deno.env.get(key);
        },
      });
    };

    await t.step("Case 1: subscription_plans row is readable via admin client", async () => {
      const row = (
        await adminClient
          .from("subscription_plans")
          .select("id, stripe_price_id, tokens_to_award")
          .eq("stripe_price_id", integrationPriceId)
          .single()
      ).data;
      assertExists(row);
      assertEquals(row.stripe_price_id, integrationPriceId);
      assertEquals(row.tokens_to_award, 100);
    });

    await t.step(
      "Case 2: checkout.session.completed creates user_subscriptions, COMPLETED payment_transactions, credits wallet",
      async () => {
        const checkoutEvent: Stripe.CheckoutSessionCompletedEvent =
          createMockCheckoutSessionCompletedEvent(
            {
              id: checkoutSessionId,
              mode: "subscription",
              customer: stripeCustomerId,
              subscription: stripeSubscriptionId,
              payment_intent: null,
              metadata: {
                internal_payment_id: paymentTxId,
                item_id: integrationPriceId,
                user_id: primaryUserId,
                organization_id: "",
                tokens_to_award: "100",
              },
            },
            { id: `evt_checkout_${runSuffix}` },
          );

        const response: Response = await dispatchStripeWebhook(checkoutEvent);
        assertEquals(response.status, 200);
        const body: { transactionId?: string } = await response.json();
        assertEquals(body.transactionId, paymentTxId);

        const pt = (
          await adminClient
            .from("payment_transactions")
            .select("status, gateway_transaction_id")
            .eq("id", paymentTxId)
            .single()
        ).data;
        assertExists(pt);
        assertEquals(pt.status, "COMPLETED");
        assertEquals(pt.gateway_transaction_id, checkoutSessionId);

        const us = (
          await adminClient
            .from("user_subscriptions")
            .select("user_id, stripe_customer_id, stripe_subscription_id")
            .eq("user_id", primaryUserId)
            .single()
        ).data;
        assertExists(us);
        assertEquals(us.stripe_customer_id, stripeCustomerId);
        assertEquals(us.stripe_subscription_id, stripeSubscriptionId);

        const w = (
          await adminClient
            .from("token_wallets")
            .select("balance")
            .eq("wallet_id", walletId)
            .single()
        ).data;
        assertExists(w);
        assertEquals(w.balance, 100);
      },
    );

    await t.step(
      "Case 3: invoice.payment_succeeded subscription_create skips — no new payment_transactions, no wallet credit",
      async () => {
        const ptCountBefore: number = await countPaymentTransactionsForUser(adminClient, primaryUserId);
        const walletBefore: number = (
          await adminClient.from("token_wallets").select("balance").eq("wallet_id", walletId).single()
        ).data?.balance ?? -1;
        assert(walletBefore >= 0);

        const subCreateEvent: Stripe.InvoicePaymentSucceededEvent = createMockInvoicePaymentSucceededEvent(
          {
            id: invoiceSubscriptionCreateId,
            customer: stripeCustomerId,
            billing_reason: "subscription_create",
            lines: {
              object: "list",
              data: [
                createMockInvoiceLineItem({
                  subscription: stripeSubscriptionId,
                  invoice: invoiceSubscriptionCreateId,
                }),
              ],
              has_more: false,
              url: `/v1/invoices/${invoiceSubscriptionCreateId}/lines`,
            },
          },
          { id: `evt_sub_create_${runSuffix}` },
        );

        const response: Response = await dispatchStripeWebhook(subCreateEvent);
        assertEquals(response.status, 200);

        const ptCountAfter: number = await countPaymentTransactionsForUser(adminClient, primaryUserId);
        assertEquals(ptCountAfter, ptCountBefore);

        const walletAfter: number = (
          await adminClient.from("token_wallets").select("balance").eq("wallet_id", walletId).single()
        ).data?.balance ?? -1;
        assertEquals(walletAfter, walletBefore);
      },
    );

    await t.step(
      "Case 4: invoice.payment_succeeded subscription_cycle creates COMPLETED payment_transaction and credits wallet",
      async () => {
        const cycleEvent: Stripe.InvoicePaymentSucceededEvent = createMockInvoicePaymentSucceededEvent(
          {
            id: invoiceSubscriptionCycleId,
            customer: stripeCustomerId,
            billing_reason: "subscription_cycle",
            lines: {
              object: "list",
              data: [
                createMockInvoiceLineItem({
                  id: `il_cycle_${runSuffix}`,
                  subscription: stripeSubscriptionId,
                  invoice: invoiceSubscriptionCycleId,
                }),
              ],
              has_more: false,
              url: `/v1/invoices/${invoiceSubscriptionCycleId}/lines`,
            },
          },
          { id: renewalEventId },
        );

        const response: Response = await dispatchStripeWebhook(cycleEvent);
        assertEquals(response.status, 200);

        const renewalPt = (
          await adminClient
            .from("payment_transactions")
            .select("id, status, gateway_transaction_id")
            .eq("gateway_transaction_id", invoiceSubscriptionCycleId)
            .single()
        ).data;
        assertExists(renewalPt);
        assertEquals(renewalPt.status, "COMPLETED");

        const w = (
          await adminClient
            .from("token_wallets")
            .select("balance")
            .eq("wallet_id", walletId)
            .single()
        ).data;
        assertExists(w);
        assertEquals(w.balance, 200);
      },
    );

    await t.step("Case 5: replay same subscription_cycle event — idempotent, no extra row or credit", async () => {
      const ptCountBefore: number = await countPaymentTransactionsForUser(adminClient, primaryUserId);
      const balanceBefore: number = (
        await adminClient.from("token_wallets").select("balance").eq("wallet_id", walletId).single()
      ).data?.balance ?? -1;

      const cycleReplay: Stripe.InvoicePaymentSucceededEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceSubscriptionCycleId,
          customer: stripeCustomerId,
          billing_reason: "subscription_cycle",
          lines: {
            object: "list",
            data: [
              createMockInvoiceLineItem({
                id: `il_cycle_${runSuffix}`,
                subscription: stripeSubscriptionId,
                invoice: invoiceSubscriptionCycleId,
              }),
            ],
            has_more: false,
            url: `/v1/invoices/${invoiceSubscriptionCycleId}/lines`,
          },
        },
        { id: renewalEventId },
      );

      const response: Response = await dispatchStripeWebhook(cycleReplay);
      assertEquals(response.status, 200);

      const ptCountAfter: number = await countPaymentTransactionsForUser(adminClient, primaryUserId);
      assertEquals(ptCountAfter, ptCountBefore);

      const balanceAfter: number = (
        await adminClient.from("token_wallets").select("balance").eq("wallet_id", walletId).single()
      ).data?.balance ?? -1;
      assertEquals(balanceAfter, balanceBefore);
      assertEquals(balanceAfter, 200);
    });
  } finally {
    constructStub.restore();
    retrieveStub.restore();
    if (primaryUserId !== "" && walletId !== "" && adminForCleanup !== null) {
      await adminForCleanup.from("token_wallet_transactions").delete().eq("wallet_id", walletId);
      await adminForCleanup.from("payment_transactions").delete().eq("user_id", primaryUserId);
      await adminForCleanup.from("user_subscriptions").delete().eq("user_id", primaryUserId);
    }
    await coreCleanupTestResources("local");
  }
});
