import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "npm:stripe";
import { logger } from "@paynless/utils";
import { TablesUpdate } from "@supabase/types"; // USE ALIAS

/**
 * Handles product.updated events: Updates the active status of corresponding plans in the DB.
 */
export async function handleProductUpdated(
  supabase: SupabaseClient,
  _stripe: Stripe,
  product: Stripe.Product,
  _eventId: string,
  _eventType: string
): Promise<void> {
  logger.info(`[handleProductUpdated] Handling product.updated for ${product.id}. Active: ${product.active}`);
  const targetActiveStatus = product.active;

  const { error: updateError } = await supabase
    .from('subscription_plans')
    .update({ active: targetActiveStatus, updated_at: new Date().toISOString() } satisfies TablesUpdate<"subscription_plans">)
    .eq('stripe_product_id', product.id)
    .neq('stripe_price_id', 'price_FREE'); // Ensure we don't touch the Free plan row

  if (updateError) {
    logger.error(`[handleProductUpdated] Error updating plan status for product ${product.id}: ${updateError.message}`);
    // Throwing here would cause Stripe to retry. Consider if this is desired.
    // For now, log the error and allow Stripe to see 200 OK from the main handler.
    // throw new Error(`Failed to update plan status for product ${product.id}: ${updateError.message}`);
  } else {
    logger.info(`[handleProductUpdated] Successfully updated active status to ${targetActiveStatus} for plans linked to product ${product.id}`);
  }
}

/**
 * Handles product.created events: Currently triggers a full plan sync.
 * Consider if specific logic is needed here instead of relying on sync.
 */
export async function handleProductCreated(
  supabase: SupabaseClient,
  _stripe: Stripe,
  _product: Stripe.Product,
  _eventId: string,
  _eventType: string,
  isTestMode: boolean // Passed down from the main handler
): Promise<void> {
  logger.info(`[handleProductCreated] Received product.created event. Triggering full plan sync.`);
  try {
    logger.info(`[handleProductCreated] Attempting to invoke sync-stripe-plans with mode: ${isTestMode ? 'test' : 'live'}`);
    const { data: invokeData, error: invokeError } = await supabase.functions.invoke('sync-stripe-plans', {
      body: JSON.stringify({ isTestMode: isTestMode })
    });
    if (invokeError) {
      logger.error(`[handleProductCreated] Error invoking sync-stripe-plans function: ${JSON.stringify(invokeError, null, 2)}`);
      // throw new Error(`Failed to invoke sync-stripe-plans: ${invokeError.message}`); // Consider if retry needed
    } else {
      logger.info("[handleProductCreated] Successfully invoked sync-stripe-plans. Result:", invokeData);
    }
  } catch (invokeCatchError) {
     logger.error(`[handleProductCreated] CRITICAL: Caught exception during function invocation: ${invokeCatchError instanceof Error ? invokeCatchError.message : String(invokeCatchError)}`);
     // throw invokeCatchError; // Consider if retry needed
  }
} 