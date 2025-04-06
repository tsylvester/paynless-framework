import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "npm:stripe";
import { logger } from "@paynless/utils";
import { TablesUpdate } from "@supabase/types"; // USE ALIAS

/**
 * Handles price.created, price.updated, price.deleted events:
 * Updates the active status of the corresponding plan in the DB.
 * Triggers sync on price.created.
 */
export async function handlePriceChange(
  supabase: SupabaseClient,
  _stripe: Stripe,
  price: Stripe.Price,
  _eventId: string,
  eventType: string, // 'price.created', 'price.updated', 'price.deleted'
  isTestMode: boolean // Passed down from the main handler
): Promise<void> {
  const targetActiveStatus = eventType === 'price.deleted' ? false : price.active;
  logger.info(`[handlePriceChange] Handling ${eventType} for price ${price.id}. Setting active: ${targetActiveStatus}`);

  if (price.id === 'price_FREE') {
     logger.info("[handlePriceChange] Ignoring price event for Free plan ID.");
     return; // Do nothing for the free plan price ID
  }

  // Update the specific plan linked to this price
  const { error: updateError } = await supabase
    .from('subscription_plans')
    .update({ active: targetActiveStatus, updated_at: new Date().toISOString() } satisfies TablesUpdate<"subscription_plans">)
    .eq('stripe_price_id', price.id);

  if (updateError) {
    logger.error(`[handlePriceChange] Error updating plan status for price ${price.id}: ${updateError.message}`);
    // throw new Error(...); // Consider if retry needed
  } else {
    logger.info(`[handlePriceChange] Successfully updated active status to ${targetActiveStatus} for plan with price ${price.id}`);
  }

  // If a new price was created, trigger sync as well
  if (eventType === 'price.created') {
     logger.info(`[handlePriceChange] Price ${price.id} created. Triggering full plan sync.`);
     try {
       logger.info(`[handlePriceChange] Attempting to invoke sync-stripe-plans with mode: ${isTestMode ? 'test' : 'live'}`);
       const { data: invokeData, error: invokeError } = await supabase.functions.invoke('sync-stripe-plans', {
         body: JSON.stringify({ isTestMode: isTestMode })
       });
       if (invokeError) {
         logger.error(`[handlePriceChange] Error invoking sync-stripe-plans function: ${JSON.stringify(invokeError, null, 2)}`);
         // throw new Error(...); // Consider if retry needed
       } else {
         logger.info("[handlePriceChange] Successfully invoked sync-stripe-plans. Result:", invokeData);
       }
     } catch (invokeCatchError) {
        logger.error(`[handlePriceChange] CRITICAL: Caught exception during function invocation: ${invokeCatchError instanceof Error ? invokeCatchError.message : String(invokeCatchError)}`);
        // throw invokeCatchError; // Consider if retry needed
     }
  }
} 