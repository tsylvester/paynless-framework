// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from "npm:stripe";
import { ISyncPlansService } from "../../sync-stripe-plans/services/sync_plans_service.ts";
import { ISupabaseProductWebhookService } from "../services/product_webhook_service.ts";
// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import { logger } from "../../_shared/logger.ts"; // Use relative path
import { Database, TablesInsert, TablesUpdate } from "../../types_db.ts";

/**
 * Handles product.updated events: Uses the injected service to update plan status.
 */
export async function handleProductUpdated(
  supabaseService: ISupabaseProductWebhookService, // Use the correct type
  _stripe: Stripe,
  product: Stripe.Product,
  _eventId: string,
  _eventType: string
): Promise<void> {
  logger.info(`[handleProductUpdated] Handling product.updated for ${product.id}. Active: ${product.active}`);
  const targetActiveStatus = product.active;

  // Call the service method
  const { error: updateError } = await supabaseService.updatePlanStatus(product.id, targetActiveStatus);

  // Logging logic remains based on the service result
  if (updateError) {
    logger.error(`[handleProductUpdated] Service reported error updating plan status for product ${product.id}`);
    // Original handler logic decided not to throw, so we maintain that.
  } else {
    logger.info(`[handleProductUpdated] Service successfully updated active status to ${targetActiveStatus} for plans linked to product ${product.id}`);
  }
}

/**
 * Handles product.created events: Uses the injected service to trigger a plan sync.
 */
export async function handleProductCreated(
  supabaseService: ISupabaseProductWebhookService, // Use the correct type
  _stripe: Stripe,
  _product: Stripe.Product,
  _eventId: string,
  _eventType: string,
  isTestMode: boolean 
): Promise<void> {
  logger.info(`[handleProductCreated] Received product.created event. Triggering sync via service.`);
  
  // Call the service method
  const { data: invokeData, error: invokeError } = await supabaseService.invokeSyncPlans(isTestMode);
  
  // Logging logic remains based on the service result
  if (invokeError) {
      logger.error(`[handleProductCreated] Service reported error invoking sync-stripe-plans function.`);
      // Original handler logic decided not to throw.
    } else {
      logger.info("[handleProductCreated] Service successfully invoked sync-stripe-plans.");
  }
} 