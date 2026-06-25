import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { stub } from 'jsr:@std/testing@0.225.1/mock';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';

import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
import type { PaymentConfirmation } from '../../../types/payment.types.ts';
import type { PaymentTransaction } from '../../../types.ts';
import { Database } from '../../../../types_db.ts';
import {
  createMockStripe,
  MockStripe,
  createMockCheckoutSessionCompletedEvent,
  createMockInvoicePaymentSucceededEvent,
  createMockInvoiceLineItem,
  createMockCustomerSubscriptionDeletedEvent,
  createMockSubscription,
  createMockSubscriptionItem,
  createMockPrice,
} from '../../../stripe.mock.ts';
import {
  createMockSupabaseClient,
  MockSupabaseClientSetup,
  MockSupabaseDataConfig,
  MockQueryBuilderState,
} from '../../../supabase.mock.ts';
import {
  createMockAdminTokenWalletService,
  MockAdminTokenWalletService,
} from '../../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { isRecord } from '../../../utils/type-guards/type_guards.common.ts';

const MOCK_WEBHOOK_SECRET = 'whsec_integration_subscription_deleted';
const SITE_URL = 'http://localhost:3000';
const FUNCTIONS_URL = 'http://localhost:54321';

const FREE_TIER_ITEM_INTERNAL = 'SYS_FREE_TIER';

const TIMESTAMP_FIXTURE = '2024-01-01T00:00:00.000Z';

function makePaymentTransaction(
  id: string,
  user_id: string,
  target_wallet_id: string,
  tokens_to_award: number,
  status: string,
  gateway_transaction_id: string | null,
): PaymentTransaction {
  return {
    amount_requested_crypto: null,
    amount_requested_fiat: null,
    created_at: TIMESTAMP_FIXTURE,
    currency_requested_crypto: null,
    currency_requested_fiat: null,
    gateway_transaction_id: gateway_transaction_id,
    id: id,
    metadata_json: null,
    organization_id: null,
    payment_gateway_id: 'stripe',
    status: status,
    target_wallet_id: target_wallet_id,
    tokens_to_award: tokens_to_award,
    updated_at: TIMESTAMP_FIXTURE,
    user_id: user_id,
  };
}

function eqFilterValueString(state: MockQueryBuilderState, column: string): string | undefined {
  const filter = state.filters.find((f) => f.column === column && f.type === 'eq');
  if (filter === undefined) {
    return undefined;
  }
  const value = filter.value;
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function encodeWebhookBody(event: Stripe.Event): ArrayBuffer {
  const raw = JSON.stringify(event);
  const encoded = new TextEncoder().encode(raw);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

Deno.test('[stripe.subscriptionDeleted.integration] subscription lifecycle + atomic cancel', async (t) => {
  await t.step(
    'full payment lifecycle — checkout → invoice (renewal) → subscription deleted — ratchet + tiers + PTX + tokens',
    async () => {
      const internalPaymentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
      const sessionId = 'cs_integration_lifecycle_1';
      const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
      const walletId = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
      const stripeSubscriptionId = 'sub_integration_lifecycle_1';
      const stripeCustomerId = 'cus_integration_lifecycle_1';
      const stripePriceId = 'price_integration_full_lifecycle';
      const internalPlanId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
      const freePlanId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      const invoiceId = 'in_integration_cycle_1';
      const checkoutTokens = 1000;
      const renewalTokens = 2500;

      const simulatedPtx = [
        makePaymentTransaction(internalPaymentId, userId, walletId, checkoutTokens, 'PENDING', null),
      ];

      let hasEverPaidScenario = false;
      let tierAfterDelete = 0;

      const tokenTxnCheckout = 'ffffffff-ffff-ffff-ffff-fffffffffff1';
      const tokenTxnInvoice = 'ffffffff-ffff-ffff-ffff-fffffffffff2';
      const invoicePtxId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';

      const supabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const gatewayVal = eqFilterValueString(state, 'gateway_transaction_id');
              const statusVal = eqFilterValueString(state, 'status');
              const idVal = eqFilterValueString(state, 'id');
              if (gatewayVal !== undefined && statusVal !== undefined && statusVal === 'COMPLETED') {
                const hit = simulatedPtx.find(
                  (p) => p.gateway_transaction_id === gatewayVal && p.status === 'COMPLETED',
                );
                if (hit !== undefined) {
                  return {
                    data: [{ id: hit.id, status: hit.status, tokens_to_award: hit.tokens_to_award }],
                    error: null,
                    count: 1,
                    status: 200,
                    statusText: 'OK',
                  };
                }
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
              }
              if (idVal !== undefined) {
                const hitById = simulatedPtx.find((p) => p.id === idVal);
                if (hitById !== undefined) {
                  return {
                    data: [hitById],
                    error: null,
                    count: 1,
                    status: 200,
                    statusText: 'OK',
                  };
                }
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
          subscription_plans: {
            select: async (state: MockQueryBuilderState) => {
              const priceFilterVal = eqFilterValueString(state, 'stripe_price_id');
              if (priceFilterVal !== undefined && priceFilterVal === stripePriceId) {
                return {
                  data: [{ id: internalPlanId }],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: 'OK',
                };
              }
              const internalFilterVal = eqFilterValueString(state, 'item_id_internal');
              if (internalFilterVal !== undefined && internalFilterVal === FREE_TIER_ITEM_INTERNAL) {
                return {
                  data: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_INTERNAL }],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: 'OK',
                };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
          token_wallets: {
            select: async (state: MockQueryBuilderState) => {
              const walletEqVal = eqFilterValueString(state, 'wallet_id');
              if (walletEqVal !== undefined && walletEqVal === walletId) {
                return {
                  data: [{ user_id: userId, wallet_id: walletId }],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: 'OK',
                };
              }
              const userEqVal = eqFilterValueString(state, 'user_id');
              if (userEqVal !== undefined && userEqVal === userId) {
                return {
                  data: [{ user_id: userId, wallet_id: walletId }],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: 'OK',
                };
              }
              return {
                data: null,
                error: { name: 'PostgresError', message: 'no rows', code: 'PGRST116' },
                count: 0,
                status: 406,
                statusText: 'OK',
              };
            },
          },
          user_subscriptions: {
            select: async (state: MockQueryBuilderState) => {
              const cusEqVal = eqFilterValueString(state, 'stripe_customer_id');
              if (cusEqVal !== undefined && cusEqVal === stripeCustomerId) {
                return {
                  data: [{ user_id: userId }],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: 'OK',
                };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
        },
        rpcResults: {
          complete_checkout_payment: async () => {
            const row = simulatedPtx.find((p) => p.id === internalPaymentId);
            if (row !== undefined) {
              row.status = 'COMPLETED';
              row.gateway_transaction_id = sessionId;
            }
            hasEverPaidScenario = true;
            return {
              data: [{ status: 'COMPLETED', tier_level: 50, token_transaction_id: tokenTxnCheckout }],
              error: null,
            };
          },
          complete_invoice_payment: async () => {
            simulatedPtx.push(
              makePaymentTransaction(invoicePtxId, userId, walletId, renewalTokens, 'COMPLETED', invoiceId),
            );
            return {
              data: [
                {
                  payment_transaction_id: invoicePtxId,
                  tier_level: 50,
                  token_transaction_id: tokenTxnInvoice,
                },
              ],
              error: null,
            };
          },
          update_subscription_with_tier: async () => {
            let tier: number;
            if (hasEverPaidScenario === true) {
              tier = 10;
            } else {
              tier = 0;
            }
            tierAfterDelete = tier;
            return {
              data: [{ user_id: userId, tier_level: tier, rows_updated: 1 }],
              error: null,
            };
          },
          create_notification_for_user: {
            data: null,
            error: null,
          },
        },
      };

      Deno.env.set('SITE_URL', SITE_URL);
      Deno.env.set('STRIPE_WEBHOOK_SECRET', MOCK_WEBHOOK_SECRET);
      Deno.env.set('SUPABASE_INTERNAL_FUNCTIONS_URL', FUNCTIONS_URL);

      const mockStripe = createMockStripe();
      const mockTokenWallet = createMockAdminTokenWalletService();
      const mockSetup = createMockSupabaseClient(undefined, supabaseConfig);

      const adapter = new StripePaymentAdapter(
        mockStripe.instance,
        mockSetup.client as unknown as SupabaseClient<Database>,
        mockTokenWallet.instance,
        MOCK_WEBHOOK_SECRET,
      );

      const stripePrice = createMockPrice({ id: stripePriceId });
      const mockStripeSubscriptionObject = createMockSubscription({
        id: stripeSubscriptionId,
        status: 'active',
        customer: stripeCustomerId,
        cancel_at_period_end: false,
        items: {
          object: 'list',
          data: [
            createMockSubscriptionItem({
              id: 'si_integration_item',
              subscription: stripeSubscriptionId,
              price: stripePrice,
              current_period_start: Math.floor(Date.now() / 1000) - 3600,
              current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            }),
          ],
          has_more: false,
          url: `/v1/subscriptions/${stripeSubscriptionId}/items`,
        },
      });

      const checkoutSessionEvent = createMockCheckoutSessionCompletedEvent(
        {
          id: sessionId,
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
          metadata: {
            internal_payment_id: internalPaymentId,
            user_id: userId,
            item_id: stripePriceId,
          },
        },
        { id: 'evt_integration_checkout_1' },
      );

      const renewalInvoice = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: stripeCustomerId,
          billing_reason: 'subscription_cycle',
          metadata: { tokens_to_award: String(renewalTokens) },
          lines: {
            object: 'list',
            data: [
              createMockInvoiceLineItem({
                invoice: invoiceId,
                subscription: stripeSubscriptionId,
                period: {
                  start: Math.floor(Date.now() / 1000),
                  end: Math.floor(Date.now() / 1000) + 2592000,
                },
              }),
            ],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: 'evt_integration_invoice_cycle_1' },
      );

      const deletedEvent = createMockCustomerSubscriptionDeletedEvent(
        { id: stripeSubscriptionId, status: 'canceled' },
        { id: 'evt_integration_deleted_1' },
      );

      const eventQueue = [checkoutSessionEvent, renewalInvoice, deletedEvent];

      if (!mockStripe.stubs.webhooksConstructEvent.restored) {
        mockStripe.stubs.webhooksConstructEvent.restore();
      }
      const constructStub = stub(
        mockStripe.instance.webhooks,
        'constructEventAsync',
        async (): Promise<Stripe.Event> => {
          const shifted = eventQueue.shift();
          if (shifted === undefined) {
            throw new Error('constructEventAsync called without a queued event');
          }
          return shifted;
        },
      );

      if (!mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
      }
      mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, 'retrieve', async () =>
        Promise.resolve({
          ...mockStripeSubscriptionObject,
          lastResponse: {
            headers: {},
            requestId: 'req_integration_sub',
            statusCode: 200,
            apiVersion: undefined,
            idempotencyKey: undefined,
            stripeAccount: undefined,
          },
        } as Stripe.Response<Stripe.Subscription>));

      const checkoutConfirmation = await adapter.handleWebhook(
        encodeWebhookBody(checkoutSessionEvent),
        'sig_integration_1',
      );
      assert(checkoutConfirmation.success === true, String(checkoutConfirmation.error));

      const invoiceConfirmation = await adapter.handleWebhook(
        encodeWebhookBody(renewalInvoice),
        'sig_integration_2',
      );
      assert(invoiceConfirmation.success === true, String(invoiceConfirmation.error));

      const deleteConfirmation = await adapter.handleWebhook(
        encodeWebhookBody(deletedEvent),
        'sig_integration_3',
      );
      assert(deleteConfirmation.success === true, String(deleteConfirmation.error));

      assertEquals(hasEverPaidScenario, true);
      assertEquals(tierAfterDelete, 10);

      const tierRpcCalls = mockSetup.spies.rpcSpy.calls.filter((c) => c.args[0] === 'update_subscription_with_tier');
      assertEquals(tierRpcCalls.length, 1);
      assert(isRecord(tierRpcCalls[0].args[1]));
      const tierRpcPayload = tierRpcCalls[0].args[1];
      assertEquals(tierRpcPayload['p_status'], 'canceled');
      assertEquals(tierRpcPayload['p_set_ratchet'], false);
      assertEquals(tierRpcPayload['p_plan_id'], freePlanId);

      const allCompleted = simulatedPtx.every((p) => p.status === 'COMPLETED');
      assertEquals(allCompleted, true);

      let checkoutAwarded = 0;
      if (checkoutConfirmation.tokensAwarded !== undefined) {
        checkoutAwarded = checkoutConfirmation.tokensAwarded;
      }
      let invoiceAwarded = 0;
      if (invoiceConfirmation.tokensAwarded !== undefined) {
        invoiceAwarded = invoiceConfirmation.tokensAwarded;
      }
      const totalAwarded = checkoutAwarded + invoiceAwarded;
      assertEquals(totalAwarded, checkoutTokens + renewalTokens);

      constructStub.restore();
      mockStripe.stubs.subscriptionsRetrieve.restore();
      mockTokenWallet.clearStubs();
      Deno.env.delete('SITE_URL');
      Deno.env.delete('STRIPE_WEBHOOK_SECRET');
      Deno.env.delete('SUPABASE_INTERNAL_FUNCTIONS_URL');
    },
  );

  await t.step('new user with no payments — subscription deleted must succeed (free tier)', async () => {
    const stripeSubscriptionId = 'sub_integration_edge_nopay';
    const freePlanId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef';

    let tierEdgeResult = -1;

    const supabaseConfigEdge: MockSupabaseDataConfig = {
      genericMockResults: {
        subscription_plans: {
          select: async (state: MockQueryBuilderState) => {
            const internalFilterVal = eqFilterValueString(state, 'item_id_internal');
            if (internalFilterVal !== undefined && internalFilterVal === FREE_TIER_ITEM_INTERNAL) {
              return {
                data: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_INTERNAL }],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
              };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
          },
        },
      },
      rpcResults: {
        update_subscription_with_tier: async () => {
          tierEdgeResult = 0;
          return {
            data: [{ user_id: null, tier_level: 0, rows_updated: 1 }],
            error: null,
          };
        },
      },
    };

    Deno.env.set('SUPABASE_INTERNAL_FUNCTIONS_URL', FUNCTIONS_URL);
    Deno.env.set('STRIPE_WEBHOOK_SECRET', MOCK_WEBHOOK_SECRET);

    const mockStripeEdge = createMockStripe();
    const mockWalletEdge = createMockAdminTokenWalletService();
    const setupEdge = createMockSupabaseClient(undefined, supabaseConfigEdge);

    const adapterEdge = new StripePaymentAdapter(
      mockStripeEdge.instance,
      setupEdge.client as unknown as SupabaseClient<Database>,
      mockWalletEdge.instance,
      MOCK_WEBHOOK_SECRET,
    );

    const deletedOnly = createMockCustomerSubscriptionDeletedEvent(
      { id: stripeSubscriptionId, status: 'canceled' },
      { id: 'evt_integration_edge_deleted' },
    );

    if (!mockStripeEdge.stubs.webhooksConstructEvent.restored) {
      mockStripeEdge.stubs.webhooksConstructEvent.restore();
    }
    const constructEdge = stub(
      mockStripeEdge.instance.webhooks,
      'constructEventAsync',
      async (): Promise<Stripe.Event> => deletedOnly,
    );

    const edgeResult = await adapterEdge.handleWebhook(
      encodeWebhookBody(deletedOnly),
      'sig_integration_edge',
    );

    assertEquals(edgeResult.success, true);
    assertEquals(tierEdgeResult, 0);

    const noCheckoutRpc = setupEdge.spies.rpcSpy.calls.filter((c) => c.args[0] === 'complete_checkout_payment');
    const noInvoiceRpc = setupEdge.spies.rpcSpy.calls.filter((c) => c.args[0] === 'complete_invoice_payment');
    assertEquals(noCheckoutRpc.length, 0);
    assertEquals(noInvoiceRpc.length, 0);

    const edgeTierCalls = setupEdge.spies.rpcSpy.calls.filter((c) => c.args[0] === 'update_subscription_with_tier');
    assertEquals(edgeTierCalls.length, 1);
    assert(isRecord(edgeTierCalls[0].args[1]));
    const edgeRpcPayload = edgeTierCalls[0].args[1];
    assertEquals(edgeRpcPayload['p_status'], 'canceled');
    assertEquals(edgeRpcPayload['p_set_ratchet'], false);

    constructEdge.restore();
    mockWalletEdge.clearStubs();
    Deno.env.delete('SUPABASE_INTERNAL_FUNCTIONS_URL');
    Deno.env.delete('STRIPE_WEBHOOK_SECRET');
  });
});
