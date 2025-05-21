import Stripe from 'npm:stripe';
import { ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
import { TablesInsert, Json } from "../../../../types_db.ts";
import { parseProductDescription } from '../../../utils/productDescriptionParser.ts';

/**
 * Handles the 'plan.created' event from Stripe.
 * Stripe typically uses 'price.created' for recurring payment setups (plans/subscriptions attach to prices).
 * A 'plan.created' event might be from an older Stripe API version or specific integration.
 * This handler will log the event and acknowledge it.
 *
 * @param context The product/price handler context.
 * @param event The Stripe 'plan.created' event.
 * @returns A PaymentConfirmation object.
 */
export async function handlePlanCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event
): Promise<PaymentConfirmation> {
  const plan = event.data.object as Stripe.Plan;
  const { logger, supabaseClient, stripe } = context;
  const functionName = "handlePlanCreated";

  logger.info(
    `[${functionName}] Handling ${event.type} for plan ID: ${plan.id}, Product ID: ${plan.product}, Active: ${plan.active}`,
    {
      eventId: event.id,
      planId: plan.id,
      productId: plan.product,
      active: plan.active,
      metadata: plan.metadata,
      livemode: event.livemode
    }
  );
  
  if (typeof plan.product !== 'string') {
    const errDetail = `Product ID is missing or not a string on Stripe Plan object. Found: ${JSON.stringify(plan.product)}`;
    logger.error(
      `[${functionName}] ${errDetail}`,
      { eventId: event.id, planId: plan.id, productField: plan.product }
    );
    return {
      success: false,
      error: "Product ID missing or invalid on Stripe Plan object.",
      transactionId: event.id,
    };
  }

  if (plan.amount === null || plan.amount === undefined) {
    // Stripe Plan amounts are typically non-null integers for valid plans.
    const errMsg = `Stripe Plan ${plan.id} has null or undefined amount (${plan.amount}), which is required. Skipping upsert.`;
    logger.warn(`[${functionName}] ${errMsg}`, { eventId: event.id, planId: plan.id });
    return {
      success: true, // Handled by skipping
      error: `Stripe Plan ${plan.id} has invalid amount. Sync skipped.`,
      transactionId: event.id,
    };
  }

  try {
    const productResponse = await stripe.products.retrieve(plan.product);
    logger.info(
      `[${functionName}] Successfully retrieved product ${plan.product} for plan ${plan.id}.`,
      { eventId: event.id, planId: plan.id, productId: plan.product }
    );

    if (productResponse.deleted) {
      logger.warn(
        `[${functionName}] Product ${plan.product} (associated with plan ${plan.id}) is marked as deleted by Stripe. Skipping upsert for plan.`,
        { eventId: event.id, planId: plan.id, productId: plan.product }
      );
      return {
        success: true, // Handled by skipping
        transactionId: event.id,
        error: `Product ${plan.product} is deleted, cannot sync plan ${plan.id}.`,
      };
    }
    const stripeProduct = productResponse as Stripe.Product;

    const parsedDescription = parseProductDescription(stripeProduct.name, stripeProduct.description);
    const planType = 'subscription'; // Stripe Plans are inherently for subscriptions

    let itemIdInternal: string | null = null;
    if (plan.metadata?.item_id_internal) {
      itemIdInternal = String(plan.metadata.item_id_internal);
    } else if (stripeProduct.metadata?.item_id_internal) {
      itemIdInternal = String(stripeProduct.metadata.item_id_internal);
    }
    if (itemIdInternal === "") itemIdInternal = null;

    let tokensAwarded: number | null = null;
    let tokensAwardedSource: 'plan' | 'product' | null = null;
    let rawTokensValue: string | number | undefined | null = undefined;

    if (plan.metadata && Object.prototype.hasOwnProperty.call(plan.metadata, 'tokens_to_award')) {
        rawTokensValue = plan.metadata.tokens_to_award;
        tokensAwardedSource = 'plan';
    } else if (stripeProduct.metadata && Object.prototype.hasOwnProperty.call(stripeProduct.metadata, 'tokens_to_award')) {
        rawTokensValue = stripeProduct.metadata.tokens_to_award;
        tokensAwardedSource = 'product';
    }

    if (rawTokensValue !== undefined && rawTokensValue !== null && String(rawTokensValue).trim() !== "") {
        const parsedTokens = parseInt(String(rawTokensValue), 10);
        if (!isNaN(parsedTokens)) {
            tokensAwarded = parsedTokens;
        } else {
            logger.warn(
              `[${functionName}] Invalid non-numeric value for tokens_to_award metadata: "${rawTokensValue}" from ${tokensAwardedSource} metadata. Plan ID: ${plan.id}, Product ID: ${stripeProduct.id}. Setting tokens_to_award to null.`,
              { eventId: event.id, planId: plan.id }
            );
        }
    } 

    // Stripe Plan object has interval and interval_count as non-nullable if plan is valid.
    const determinedInterval: string = plan.interval; 
    const determinedIntervalCount: number = plan.interval_count;

    const planDataToUpsert: TablesInsert<'subscription_plans'> = {
      stripe_price_id: plan.id, // Using plan.id as the equivalent of a price ID
      stripe_product_id: stripeProduct.id,
      name: stripeProduct.name, 
      description: parsedDescription as unknown as Json, 
      amount: plan.amount, // Use plan.amount directly, per user instruction
      currency: plan.currency,
      interval: determinedInterval,
      interval_count: determinedIntervalCount,
      active: plan.active, 
      metadata: plan.metadata as unknown as Json ?? null, // Store Plan's metadata
      tokens_to_award: tokensAwarded, 
      item_id_internal: itemIdInternal, 
      plan_type: planType, 
    };
    
    Object.keys(planDataToUpsert).forEach(key => {
      if (planDataToUpsert[key as keyof typeof planDataToUpsert] === undefined) {
        delete planDataToUpsert[key as keyof typeof planDataToUpsert];
      }
    });

    logger.info(
      `[${functionName}] Prepared data for subscription_plans upsert for plan ${plan.id}.`,
      { eventId: event.id, planId: plan.id, planData: JSON.stringify(planDataToUpsert, null, 2) }
    );

    const { error: upsertError, data: upsertedData } = await supabaseClient
      .from('subscription_plans')
      .upsert(planDataToUpsert, { onConflict: 'stripe_price_id' }) // Ensure Conflict is on stripe_price_id (plan.id)
      .select();

    if (upsertError) {
      logger.error(
        `[${functionName}] Error upserting subscription_plan for plan ${plan.id}.`,
        { eventId: event.id, planId: plan.id, error: upsertError.message, details: upsertError }
      );
      return {
        success: false,
        error: `Failed to upsert subscription_plan for plan ${plan.id}: ${upsertError.message}`,
        transactionId: event.id,
        status: 500,
      };
    }

    logger.info(
      `[${functionName}] Successfully upserted subscription_plan for plan ${plan.id}. Result count: ${upsertedData?.length || 0}.`,
       { eventId: event.id, planId: plan.id, upsertedCount: upsertedData?.length || 0 }
    );
    return {
      success: true,
      transactionId: event.id,
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(
      `[${functionName}] Unexpected error processing ${event.type} for plan ${plan.id}: ${errorMessage}`,
      { eventId: event.id, planId: plan.id, error: errorMessage, stack }
    );
    return {
      success: false,
      error: `Unexpected error processing ${event.type} for plan ${plan.id}: ${errorMessage}`,
      transactionId: event.id,
      status: 500,
    };
  }
} 