import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import {
  createMockStripe,
  createMockPrice,
  createMockProduct,
  ProductPriceHandlerContext,
} from '../_shared/stripe.mock.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { logger } from '../_shared/logger.ts';
import { syncAllPrices } from './syncAllPrices.ts';
import type { SyncStripePlansResult } from '../_shared/types/sync_plans.types.ts';

const mockLastResponseObject: Stripe.Response<Stripe.Product>['lastResponse'] = {
  headers: {},
  requestId: 'req_mock_sync_test',
  statusCode: 200,
};

const emptyPriceListResponse: Stripe.Response<Stripe.ApiList<Stripe.Price>> = {
  object: 'list',
  data: [],
  has_more: false,
  url: '/v1/prices',
  lastResponse: mockLastResponseObject,
};

type PriceListFn = (
  params?: Stripe.PriceListParams,
  options?: Stripe.RequestOptions
) => Promise<Stripe.Response<Stripe.ApiList<Stripe.Price>>>;

function assignPricesList(
  stripe: Stripe,
  listFn: PriceListFn
): void {
  const prices = stripe.prices;
  Object.defineProperty(prices, 'list', { value: listFn, writable: true });
}

Deno.test('syncAllPrices', async (t) => {
  let mockStripeSdk: ReturnType<typeof createMockStripe>;
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;

  const initContext = () => {
    mockStripeSdk = createMockStripe();
    mockSupabase = createMockSupabaseClient();
    handlerContext = {
      stripe: mockStripeSdk.instance,
      supabaseClient: mockSupabase.client as unknown as SupabaseClient,
      logger,
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_test',
    };
  };

  const teardown = () => {
    mockStripeSdk.clearStubs();
  };

  await t.step('fetches active and inactive prices via stripe.prices.list() and auto-pagination', async () => {
    initContext();
    try {
      const activeParamsSeen: (boolean | undefined)[] = [];
      const listFn: PriceListFn = async (
        params?: Stripe.PriceListParams
      ): Promise<Stripe.Response<Stripe.ApiList<Stripe.Price>>> => {
        assertExists(params);
        activeParamsSeen.push(params.active);
        assertEquals(params.limit, 100);
        return Promise.resolve(emptyPriceListResponse);
      };
      assignPricesList(handlerContext.stripe, listFn);

      const result: SyncStripePlansResult = await syncAllPrices(handlerContext);

      assertEquals(activeParamsSeen, [true, false], 'Should fetch both active and inactive prices');
      assertEquals(result.success, true);
      assertEquals(result.synced, 0);
      assertEquals(result.failed, 0);
      assertEquals(result.errors.length, 0);
    } finally {
      teardown();
    }
  });

  await t.step('handles empty price list (no prices in Stripe) gracefully', async () => {
    initContext();
    try {
      const listFn: PriceListFn = async (): Promise<Stripe.Response<Stripe.ApiList<Stripe.Price>>> =>
        Promise.resolve(emptyPriceListResponse);
      assignPricesList(handlerContext.stripe, listFn);

      const result: SyncStripePlansResult = await syncAllPrices(handlerContext);

      assertEquals(result.success, true);
      assertEquals(result.synced, 0);
      assertEquals(result.failed, 0);
      assertEquals(result.errors.length, 0);
    } finally {
      teardown();
    }
  });

  await t.step('correctly counts successes and failures from handler results', async () => {
    initContext();
    try {
      const oneTimePrice = createMockPrice({ id: 'price_sync_1', product: 'prod_1', type: 'one_time', unit_amount: 1000 });
      const recurringPrice = createMockPrice({
        id: 'price_sync_2',
        product: 'prod_2',
        type: 'recurring',
        unit_amount: 2000,
        recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: null, meter: null },
      });
      const prod1 = createMockProduct({ id: 'prod_1', name: 'Product 1' });
      const prod2 = createMockProduct({ id: 'prod_2', name: 'Product 2' });

      const productsRetrieveSpy = spy(async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === 'prod_1') return Promise.resolve({ ...prod1, lastResponse: mockLastResponseObject });
        if (id === 'prod_2') return Promise.resolve({ ...prod2, lastResponse: mockLastResponseObject });
        return Promise.reject(new Error(`Unexpected product id: ${id}`));
      });
      handlerContext.stripe.products.retrieve = productsRetrieveSpy;

      const listFn: PriceListFn = async (params?: Stripe.PriceListParams): Promise<Stripe.Response<Stripe.ApiList<Stripe.Price>>> =>
        Promise.resolve({
          object: 'list',
          data: params?.active === true ? [oneTimePrice, recurringPrice] : [],
          has_more: false,
          url: '/v1/prices',
          lastResponse: mockLastResponseObject,
        });
      assignPricesList(handlerContext.stripe, listFn);

      mockSupabase.client.from('subscription_plans');

      const result: SyncStripePlansResult = await syncAllPrices(handlerContext);

      assertEquals(result.success, true);
      assertEquals(result.synced, 2);
      assertEquals(result.failed, 0);
      assertEquals(result.errors.length, 0);
    } finally {
      teardown();
    }
  });

  await t.step('handles handlePriceCreated returning success: false for individual prices without aborting the batch', async () => {
    initContext();
    try {
      const successPrice = createMockPrice({ id: 'price_ok', product: 'prod_ok', unit_amount: 1000 });
      const failPrice = createMockPrice({ id: 'price_fail', product: 'prod_fail', unit_amount: null });
      const prodOk = createMockProduct({ id: 'prod_ok' });

      const productsRetrieveSpy = spy(async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === 'prod_ok') return Promise.resolve({ ...prodOk, lastResponse: mockLastResponseObject });
        if (id === 'prod_fail') return Promise.reject(new Error('Product not found'));
        return Promise.reject(new Error(`Unexpected: ${id}`));
      });
      handlerContext.stripe.products.retrieve = productsRetrieveSpy;

      const listFn: PriceListFn = async (params?: Stripe.PriceListParams): Promise<Stripe.Response<Stripe.ApiList<Stripe.Price>>> =>
        Promise.resolve({
          object: 'list',
          data: params?.active === true ? [successPrice, failPrice] : [],
          has_more: false,
          url: '/v1/prices',
          lastResponse: mockLastResponseObject,
        });
      assignPricesList(handlerContext.stripe, listFn);

      mockSupabase.client.from('subscription_plans');

      const result: SyncStripePlansResult = await syncAllPrices(handlerContext);

      assertEquals(result.synced, 1);
      assertEquals(result.failed, 1);
      assertEquals(result.errors.length, 1);
    } finally {
      teardown();
    }
  });

  await t.step('both recurring and one-time prices are included in the fetch', async () => {
    initContext();
    try {
      const oneTime = createMockPrice({ id: 'price_ot', type: 'one_time', product: 'prod_ot' });
      const recurring = createMockPrice({
        id: 'price_rec',
        type: 'recurring',
        product: 'prod_rec',
        recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed', trial_period_days: null, meter: null },
      });
      const prodOt = createMockProduct({ id: 'prod_ot' });
      const prodRec = createMockProduct({ id: 'prod_rec' });

      const productsRetrieveSpy = spy(async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === 'prod_ot') return Promise.resolve({ ...prodOt, lastResponse: mockLastResponseObject });
        if (id === 'prod_rec') return Promise.resolve({ ...prodRec, lastResponse: mockLastResponseObject });
        return Promise.reject(new Error(`Unexpected: ${id}`));
      });
      handlerContext.stripe.products.retrieve = productsRetrieveSpy;

      const listFn: PriceListFn = async (params?: Stripe.PriceListParams): Promise<Stripe.Response<Stripe.ApiList<Stripe.Price>>> =>
        Promise.resolve({
          object: 'list',
          data: params?.active === true ? [oneTime, recurring] : [],
          has_more: false,
          url: '/v1/prices',
          lastResponse: mockLastResponseObject,
        });
      assignPricesList(handlerContext.stripe, listFn);

      mockSupabase.client.from('subscription_plans');

      const result: SyncStripePlansResult = await syncAllPrices(handlerContext);

      assertEquals(result.synced, 2);
      assertEquals(result.failed, 0);
    } finally {
      teardown();
    }
  });
});
