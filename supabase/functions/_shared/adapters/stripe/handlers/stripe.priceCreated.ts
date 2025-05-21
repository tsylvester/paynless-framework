import Stripe from "npm:stripe";
import { PaymentConfirmation } from "../../../types/payment.types.ts";
import { parseProductDescription } from '../../../utils/productDescriptionParser.ts';
import type { ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { TablesInsert, Json } from "../../../../types_db.ts";

export async function handlePriceCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event
): Promise<PaymentConfirmation> {
  const { supabaseClient, logger, stripe } = context;
  const price = event.data.object as Stripe.Price;
  const functionName = 'handlePriceCreated';

  logger.info(
    `[${functionName}] Handling ${event.type} for price ${price.id}. Product ID: ${typeof price.product === 'string' ? price.product : price.product?.id}, Active: ${price.active}`,
    {
      eventId: event.id,
      priceId: price.id,
      productId: typeof price.product === 'string' ? price.product : price.product?.id,
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

  if (typeof price.product !== 'string') {
    const errDetail = `Product ID is missing or not a string on price object. Found: ${JSON.stringify(price.product)}`;
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
    const stripeProduct = productResponse as Stripe.Product;

    const parsedDescription = parseProductDescription(stripeProduct.name, stripeProduct.description);

    let tokensAwarded: number | undefined = undefined;
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

    const planDataToUpsert = {
      stripe_price_id: price.id,
      stripe_product_id: stripeProduct.id,
      name: stripeProduct.name,
      description: parsedDescription,
      amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval || 'day',
      interval_count: price.recurring?.interval_count || 1,
      active: price.active,
      metadata: price.metadata || {},
      tokens_to_award: tokensAwarded,
      item_id_internal: price.id,
      plan_type: price.type === 'recurring' ? 'subscription' : 'one_time_purchase',
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      `[${functionName}] Unexpected error processing ${event.type} for price ${price.id}: ${errorMessage}`,
      { error: err, eventId: event.id, priceId: price.id }
    );
    return {
      success: false,
      error: `Unexpected error processing ${event.type} for price ${price.id}: ${errorMessage}`,
      transactionId: event.id,
      status: 500,
    };
  }
}
