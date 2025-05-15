import Stripe from "npm:stripe";
import { ProductPriceHandlerContext, PaymentConfirmation } from "../types.ts";
// Assuming SyncPlansFunctionResult might be defined elsewhere or we use a simpler type for now.
// For now, let's assume invoke returns { data: any, error: any }
// import { SyncPlansFunctionResult } from "../../../sync-stripe-plans/index.ts"; // This path might need verification

export async function handlePriceCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event // Price object is in event.data.object
): Promise<PaymentConfirmation> {
  const { supabaseClient, logger, functionsUrl } = context;
  const price = event.data.object as Stripe.Price;
  const functionName = 'handlePriceCreated'; // For logger clarity

  logger.info(
    `[${functionName}] Handling ${event.type} for price ${price.id}. Active: ${price.active}, Product: ${typeof price.product === 'string' ? price.product : price.product.id}`,
    {
      eventId: event.id,
      priceId: price.id,
      productId: typeof price.product === 'string' ? price.product : price.product.id,
      active: price.active,
      livemode: event.livemode
    }
  );

  const isTestMode = event.livemode === false;

  if (price.id === 'price_FREE') {
    logger.info(`[${functionName}] Ignoring price.created event for 'price_FREE'.`, {
      eventId: event.id,
      priceId: price.id
    });
    return {
      success: true, 
      transactionId: event.id,
      error: "Price 'price_FREE' event ignored as per specific rule.", // Using error to convey info as per PaymentConfirmation
    };
  }

  try {
    // 1. Update the specific plan linked to this price (if it somehow exists already, or to set active status)
    //    This step might be redundant if sync-stripe-plans handles creation and active status thoroughly.
    //    However, the old handler (price.ts) did an updatePlanStatusByPriceId first.
    const { error: updateError } = await supabaseClient
      .from('subscription_plans')
      .update({ active: price.active, updated_at: new Date().toISOString() })
      .eq('stripe_price_id', price.id);

    if (updateError) {
      // Log error but don't necessarily fail yet, as sync might fix it.
      logger.warn(
        `[${functionName}] Error updating subscription_plan for new price ${price.id} (might not exist yet). Sync will follow.`,
        {
          eventId: event.id,
          priceId: price.id,
          active: price.active,
          error: updateError
        }
      );
    } else {
      logger.info(
        `[${functionName}] Initial update for price ${price.id} active status to ${price.active} processed (if plan existed).`,
        {
          eventId: event.id,
          priceId: price.id
        }
      );
    }

    // 2. Invoke sync-stripe-plans
    logger.info(`[${functionName}] Invoking sync-stripe-plans function (isTestMode: ${isTestMode}).`, {
      eventId: event.id,
      priceId: price.id,
      isTestMode
    });
    
    // Construct the full URL for invoking the function
    const syncPlansUrl = `${functionsUrl}/sync-stripe-plans`;

    const { data: invokeData, error: invokeError } = await supabaseClient.functions.invoke(
      syncPlansUrl, // Use the fully qualified URL
      {
        body: { isTestMode }, // Body must be an object for invoke
        // If headers are needed, like Authorization for service_role, add them here
        // headers: { Authorization: `Bearer ${context.supabaseServiceRoleKey}` } // Example
      }
    );

    if (invokeError) {
      logger.error(
        `[${functionName}] Error invoking sync-stripe-plans function for new price.`, {
          eventId: event.id,
          priceId: price.id,
          isTestMode,
          error: invokeError,
          syncPlansUrl
        }
      );
      return {
        success: false,
        transactionId: event.id,
        error: `Price created, but failed to invoke sync-stripe-plans: ${invokeError.message || JSON.stringify(invokeError)}`,
      };
    }

    logger.info(
      `[${functionName}] Successfully invoked sync-stripe-plans for new price.`, {
        eventId: event.id,
        priceId: price.id,
        invokeData,
        syncPlansUrl
      }
    );
    return {
      success: true,
      transactionId: event.id,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      `[${functionName}] Unexpected error: ${errorMessage}`,
      {
        eventId: event.id,
        priceId: price.id,
        error: err 
      }
    );
    return {
      success: false,
      transactionId: event.id,
      error: `Unexpected error processing price.created: ${errorMessage}`,
    };
  }
}
