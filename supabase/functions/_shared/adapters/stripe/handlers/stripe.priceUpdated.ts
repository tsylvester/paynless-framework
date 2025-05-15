import Stripe from "npm:stripe";
import { ProductPriceHandlerContext, PaymentConfirmation } from "../types.ts";
import { TablesUpdate } from "../../../../types_db.ts"; // Adjusted path

export async function handlePriceUpdated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event // Price object is in event.data.object
): Promise<PaymentConfirmation> {
  const { supabaseClient, logger } = context;
  const price = event.data.object as Stripe.Price;
  const functionName = 'handlePriceUpdated'; // For logger clarity

  logger.info(
    `[${functionName}] Handling ${event.type} for price ${price.id}. Active: ${price.active}`,
    {
      eventId: event.id,
      priceId: price.id,
      active: price.active,
      livemode: event.livemode
    }
  );

  if (price.id === 'price_FREE') {
    logger.info(`[${functionName}] Ignoring price.updated event for 'price_FREE'.`, {
      eventId: event.id,
      priceId: price.id
    });
    return {
      success: true,
      transactionId: event.id,
      error: "Price 'price_FREE' update event ignored.", // Using error to convey info
    };
  }

  try {
    const updateData: TablesUpdate<'subscription_plans'> = {
      active: price.active,
      // If you decide to sync more price fields (e.g., nickname, metadata), add them here.
      // For now, only `active` status is managed based on the old handler logic.
      // metadata_json: price.metadata as unknown as Json, // Example if syncing metadata
      updated_at: new Date().toISOString(),
    };

    const { error: updateError, data: updatedPlans } = await supabaseClient
      .from('subscription_plans')
      .update(updateData)
      .eq('stripe_price_id', price.id)
      .select(); // select to see if anything was updated and for logging count

    if (updateError) {
      logger.error(
        `[${functionName}] Error updating subscription_plan for price ${price.id}.`,
        {
          eventId: event.id,
          priceId: price.id,
          active: price.active,
          error: updateError
        }
      );
      return {
        success: false,
        transactionId: event.id,
        error: `Failed to update plan status for price ${price.id}: ${updateError.message}`,
      };
    }

    logger.info(
      `[${functionName}] Successfully updated ${updatedPlans?.length || 0} subscription plan(s) for price ${price.id}. Active: ${price.active}.`,
      {
        eventId: event.id,
        priceId: price.id,
        active: price.active,
        updatedCount: updatedPlans?.length || 0,
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
      error: `Unexpected error processing price.updated: ${errorMessage}`,
    };
  }
}