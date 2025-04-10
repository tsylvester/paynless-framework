// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import { logger } from "../../_shared/logger.ts"; // Use relative path
import Stripe from "npm:stripe";
// Import the service interface
import { ISupabasePriceWebhookService } from "../services/price_webhook_service.ts"; 

/**
 * Handles price.created, price.updated, price.deleted events:
 * Uses the injected service to update plan status and trigger sync.
 */
export async function handlePriceChange(
  supabaseService: ISupabasePriceWebhookService, // Use the service interface
  _stripe: Stripe,
  price: Stripe.Price,
  _eventId: string,
  eventType: string, 
  isTestMode: boolean
): Promise<void> {
  const targetActiveStatus = eventType === 'price.deleted' ? false : price.active;
  logger.info(`[handlePriceChange] Handling ${eventType} for price ${price.id}. Setting active: ${targetActiveStatus}`);

  if (price.id === 'price_FREE') {
     logger.info("[handlePriceChange] Ignoring price event for Free plan ID.");
     return; // Do nothing for the free plan price ID
  }

  // Update the specific plan linked to this price via the service
  const { error: updateError } = await supabaseService.updatePlanStatusByPriceId(price.id, targetActiveStatus);

  if (updateError) {
    logger.error(`[handlePriceChange] Service reported error updating plan status for price ${price.id}`);
    // Original handler doesn't throw, maintain that behavior
  } else {
    logger.info(`[handlePriceChange] Service successfully updated active status to ${targetActiveStatus} for plan with price ${price.id}`);
  }

  // If a new price was created, trigger sync via the service
  if (eventType === 'price.created') {
     logger.info(`[handlePriceChange] Price ${price.id} created. Triggering sync via service.`);
     const { error: invokeError } = await supabaseService.invokeSyncPlans(isTestMode);
     
     // Log result of invocation attempt
     if (invokeError) {
       logger.error(`[handlePriceChange] Service reported error invoking sync-stripe-plans function.`);
     } else {
       logger.info("[handlePriceChange] Service successfully invoked sync-stripe-plans.");
     }
  }
} 