import Stripe from "npm:stripe";
import { PaymentConfirmation } from "../../../types/payment.types.ts";
import { TablesUpdate, Json } from "../../../../types_db.ts"; // Reverted import
import type { ProductPriceHandlerContext } from '../../../stripe.mock.ts';

export async function handlePriceUpdated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event // Price object is in event.data.object
): Promise<PaymentConfirmation> {
  const { supabaseClient, logger } = context;
  const price = event.data.object as Stripe.Price;
  const functionName = 'handlePriceUpdated'; // For logger clarity

  logger.info(
    `[${functionName}] Handling ${event.type} for price ${price.id}. Active: ${price.active}, Nickname: ${price.nickname}, Currency: ${price.currency}, UnitAmount: ${price.unit_amount}`,
    {
      eventId: event.id,
      priceId: price.id,
      active: price.active,
      nickname: price.nickname,
      currency: price.currency,
      unitAmount: price.unit_amount,
      metadata: price.metadata, // Log full metadata for debugging
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
    // Extract tokens_awarded from metadata
    let tokensAwarded: number | undefined = undefined;
    const tokensAwardedString = price.metadata?.tokens_awarded;
    if (tokensAwardedString) {
      const parsedTokens = parseInt(tokensAwardedString, 10);
      if (!isNaN(parsedTokens)) {
        tokensAwarded = parsedTokens;
      } else {
        logger.warn(`[${functionName}] Invalid non-numeric value for tokens_awarded metadata: "${tokensAwardedString}". Price ID: ${price.id}. Not updating tokens_awarded.`);
      }
    }

    const planType = price.type === 'one_time' ? 'one_time_purchase' : 'subscription';

    const updateData: TablesUpdate<'subscription_plans'> = {
      active: price.active,
      metadata: price.metadata as unknown as Json,
      item_id_internal: price.nickname,
      currency: price.currency,
      amount: typeof price.unit_amount === 'number' ? price.unit_amount / 100 : undefined,
      plan_type: planType,
      interval: price.recurring?.interval,
      interval_count: price.recurring?.interval_count,
      updated_at: new Date().toISOString(),
    };

    // Conditionally add tokens_awarded to updateData if it's valid
    if (tokensAwarded !== undefined) {
      updateData.tokens_awarded = tokensAwarded;
    } else if (tokensAwardedString !== undefined && tokensAwarded === undefined) {
      // If tokens_awarded was in metadata but invalid, explicitly set to null to clear potentially old valid values.
      // If tokens_awarded was never in metadata, we don't add it to updateData, leaving existing db value.
      updateData.tokens_awarded = null;
    }

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
        status: 500,
      };
    }

    logger.info(
      `[${functionName}] Successfully updated ${updatedPlans?.length || 0} subscription plan(s) for price ${price.id}. Details: ${JSON.stringify(updateData)}`,
      {
        eventId: event.id,
        priceId: price.id,
        updatedData: updateData, // Log the data we attempted to update with
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