import Stripe from "npm:stripe";
import { PaymentConfirmation } from "../../../types/payment.types.ts";
import { parseProductDescription } from '../../../utils/productDescriptionParser.ts';
import type { ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { Json, TablesInsert } from "../../../../types_db.ts";

export async function handlePriceCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event
): Promise<PaymentConfirmation> {
  const { supabaseClient, logger, stripe } = context;

  if (event.type !== 'price.created') {
    return {
      success: false,
      transactionId: event.id,
      error: 'Invalid event type for handlePriceCreated',
    };
  }
  const price: Stripe.Price = event.data.object;
  const functionName = 'handlePriceCreated';

  logger.info(
    `[${functionName}] Handling ${event.type} for price ${price.id}. Product ID: ${price.product}, Active: ${price.active}`,
    {
      eventId: event.id,
      priceId: price.id,
      productId: price.product,
      active: price.active,
      metadata: price.metadata,
      livemode: event.livemode
    }
  );

  if (price.id === 'price_FREE') {
    logger.info(`[${functionName}] Ignoring price.created event for 'price_FREE'.`, {
      eventId: event.id,
      priceId: price.id
    });
    return {
      success: true,
      transactionId: event.id,
      error: "Price 'price_FREE' event ignored as per specific rule.",
    };
  }

  if (typeof price.product !== 'string' || !price.product) {
    const errDetail = `Product ID is missing, not a string, or empty on price object. Found: ${JSON.stringify(price.product)}`;
    logger.error(
      `[${functionName}] ${errDetail}`,
      { priceId: price.id, productField: price.product }
    );
    return {
      success: false,
      error: "Product ID missing or invalid on price object.",
      transactionId: event.id,
    };
  }
  
  if (price.unit_amount === null || price.unit_amount === undefined) {
    const errMsg = `Price ${price.id} has null or undefined unit_amount (${price.unit_amount}), which is required and must be a number. Skipping upsert.`;
    logger.error(`[${functionName}] ${errMsg}`);
    return {
      success: false,
      error: `Price ${price.id} has invalid unit_amount. Cannot sync.`,
      transactionId: event.id,
    };
  }

  try {
    const productResponse = await stripe.products.retrieve(price.product);
    logger.info(
      `[${functionName}] Successfully retrieved product ${price.product} for price ${price.id}.`,
      { eventId: event.id, priceId: price.id, productId: price.product }
    );

    if (productResponse.deleted) {
      logger.warn(
        `[${functionName}] Product ${price.product} is marked as deleted by Stripe. Skipping upsert for price ${price.id}.`,
        { productId: price.product }
      );
      return {
        success: true,
        transactionId: event.id,
        error: `Product ${price.product} is deleted and cannot be synced.`,
      };
    }
    const stripeProduct: Stripe.Product = productResponse;

    const parsedDescription = parseProductDescription(stripeProduct.name, stripeProduct.description);
    const descriptionJson: Json = {
      subtitle: parsedDescription.subtitle,
      features: parsedDescription.features,
    };

    let planType: 'subscription' | 'one_time_purchase';
    let interval: string | null;
    let intervalCount: number | null;
    if (price.type === 'recurring') {
      planType = 'subscription';
      if (price.recurring == null) {
        logger.error(
          `[${functionName}] Price ${price.id} is recurring but price.recurring is missing. Cannot sync.`,
          { priceId: price.id }
        );
        return {
          success: false,
          transactionId: event.id,
          error: `Price ${price.id} is recurring but recurring data is missing. Cannot sync.`,
        };
      }
      interval = price.recurring.interval;
      intervalCount = price.recurring.interval_count;
    } else if (price.type === 'one_time') {
      planType = 'one_time_purchase';
      interval = null;
      intervalCount = null;
    } else {
      logger.error(
        `[${functionName}] Price ${price.id} has unknown type "${price.type}". Cannot sync.`,
        { priceId: price.id, priceType: price.type }
      );
      return {
        success: false,
        transactionId: event.id,
        error: `Price ${price.id} has unknown type. Cannot sync.`,
      };
    }

    let tokensAwarded: number | undefined;
    if (stripeProduct.metadata?.tokens_to_award) {
      const parsedTokens = parseInt(stripeProduct.metadata.tokens_to_award, 10);
      if (isNaN(parsedTokens)) {
        logger.warn(
          `[${functionName}] Invalid non-numeric value for tokens_to_award metadata: "${stripeProduct.metadata.tokens_to_award}". Product ID: ${stripeProduct.id}, Price ID: ${price.id}. Setting tokens_to_award to undefined.`
        );
      } else {
        tokensAwarded = parsedTokens;
      }
    }

    const planDataToUpsert: TablesInsert<'subscription_plans'> = {
      stripe_price_id: price.id,
      stripe_product_id: stripeProduct.id,
      name: stripeProduct.name,
      description: descriptionJson,
      amount: price.unit_amount,
      currency: price.currency,
      interval,
      interval_count: intervalCount,
      active: price.active,
      metadata: price.metadata,
      tokens_to_award: tokensAwarded,
      item_id_internal: price.id,
      plan_type: planType,
    };

    logger.info(
      `[${functionName}] Prepared data for subscription_plans upsert.`,
      { planData: JSON.stringify(planDataToUpsert, null, 2) }
    );

    const { error: upsertError } = await supabaseClient
      .from('subscription_plans')
      .upsert(planDataToUpsert, { onConflict: 'stripe_price_id' });

    if (upsertError) {
      logger.error(
        `[${functionName}] Error upserting subscription_plan for price ${price.id}.`,
        { error: upsertError, priceId: price.id }
      );
      return {
        success: false,
        error: `Failed to upsert plan for price ${price.id}: ${upsertError.message}`,
        transactionId: event.id,
        status: 500,
      };
    }

    logger.info(
      `[${functionName}] Successfully upserted plan for price ${price.id}.`,
    );
    return {
      success: true,
      transactionId: event.id,
    };

  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }
    logger.error(
      `[${functionName}] Unexpected error processing ${event.type} for price ${price.id}: ${err.message}`,
      { error: err, eventId: event.id, priceId: price.id }
    );
    return {
      success: false,
      error: `Unexpected error processing ${event.type} for price ${price.id}: ${err.message}`,
      transactionId: event.id,
      status: 500,
    };
  }
}
