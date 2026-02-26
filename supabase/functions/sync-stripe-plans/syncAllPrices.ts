import Stripe from 'npm:stripe';
import { handlePriceCreated } from '../_shared/adapters/stripe/handlers/stripe.priceCreated.ts';
import type { ProductPriceHandlerContext } from '../_shared/stripe.mock.ts';
import type { SyncStripePlansResult } from '../_shared/types/sync_plans.types.ts';

function buildPriceCreatedEvent(price: Stripe.Price): Stripe.Event {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `evt_sync_${price.id}`,
    object: 'event',
    api_version: '2020-08-27',
    created,
    data: { object: price },
    livemode: price.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'price.created',
  };
}

export async function syncAllPrices(
  context: ProductPriceHandlerContext
): Promise<SyncStripePlansResult> {
  const prices: Stripe.Price[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Stripe.PriceListParams = {
      active: true,
      limit: 100,
    };
    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const response: Stripe.Response<Stripe.ApiList<Stripe.Price>> =
      await context.stripe.prices.list(params);

    prices.push(...response.data);
    hasMore = response.has_more;

    if (hasMore && response.data.length > 0) {
      const lastPrice: Stripe.Price = response.data[response.data.length - 1];
      startingAfter = lastPrice.id;
    }
  }

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const price of prices) {
    const syntheticEvent: Stripe.Event = buildPriceCreatedEvent(price);
    const result = await handlePriceCreated(context, syntheticEvent);

    if (result.success) {
      synced++;
    } else {
      failed++;
      const errMsg = result.error ?? `Price ${price.id}: unknown error`;
      errors.push(errMsg);
    }
  }

  const success = failed === 0;

  return {
    success,
    synced,
    failed,
    errors,
  };
}
