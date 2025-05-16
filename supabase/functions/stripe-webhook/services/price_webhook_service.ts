// supabase/functions/stripe-webhook/services/price_webhook_service.ts

// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import { 
    type SupabaseClient, 
    type PostgrestError, // Import PostgrestError
    type FunctionsError // Import FunctionsError
} from 'npm:@supabase/supabase-js@2';
import { Database, TablesInsert, TablesUpdate } from "../../types_db.ts";
import { logger } from "../../_shared/logger.ts"; // Use relative path
import type { SyncResult } from '../../sync-ai-models/index.ts'; // Import SyncResult

/**
 * Interface for Supabase interactions needed by the price change webhook handler.
 * This abstraction simplifies mocking in unit tests.
 */
export interface ISupabasePriceWebhookService {
  /**
   * Updates the 'active' status of a specific subscription plan based on its Stripe Price ID.
   * @param priceId The Stripe Price ID.
   * @param active The target active status.
   * @returns An object containing only the potential error.
   */
  updatePlanStatusByPriceId(priceId: string, active: boolean): Promise<{ error: PostgrestError | null }>;

  /**
   * Invokes the 'sync-stripe-plans' Edge Function.
   * @param isTestMode Indicates whether to run the sync in test mode.
   * @returns The result of the function invocation (data and/or error).
   */
  invokeSyncPlans(isTestMode: boolean): Promise<{ data: SyncResult | null; error: FunctionsError | { message: string, name: string } | null }>;
}

/**
 * Concrete implementation of ISupabasePriceWebhookService using SupabaseClient.
 */
export class SupabasePriceWebhookService implements ISupabasePriceWebhookService {
  private supabase: SupabaseClient<Database>;

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
  }

  async updatePlanStatusByPriceId(priceId: string, active: boolean): Promise<{ error: PostgrestError | null }> {
    // Note: We intentionally don't filter out 'price_FREE' here because the handler
    // already checks for and ignores that specific price ID before calling the service.
    const { error } = await this.supabase
      .from('subscription_plans')
      .update({ active: active, updated_at: new Date().toISOString() })
      .eq('stripe_price_id', priceId); // Filter by price ID

    if (error) {
      logger.error(`[SupabasePriceWebhookService] Error updating plan status for price ${priceId}: ${error.message}`);
    }
    return { error };
  }

  // Re-use the same function invocation logic as the product service
  // If this becomes common, consider extracting to a shared sync service/utility
  async invokeSyncPlans(isTestMode: boolean): Promise<{ data: SyncResult | null; error: FunctionsError | { message: string, name: string } | null }> {
    logger.info(`[SupabasePriceWebhookService] Attempting to invoke sync-stripe-plans with mode: ${isTestMode ? 'test' : 'live'}`);
    try {
      const { data, error } = await this.supabase.functions.invoke('sync-stripe-plans', {
        body: JSON.stringify({ isTestMode: isTestMode })
      });

      if (error) {
        logger.error(`[SupabasePriceWebhookService] Error invoking sync-stripe-plans function: ${JSON.stringify(error, null, 2)}`);
      } else {
         logger.info("[SupabasePriceWebhookService] Successfully invoked sync-stripe-plans. Result:", data);
      }
      return { data, error };

    } catch (invokeCatchError) {
       const errorMessage = invokeCatchError instanceof Error ? invokeCatchError.message : String(invokeCatchError);
       logger.error(`[SupabasePriceWebhookService] CRITICAL: Caught exception during function invocation: ${errorMessage}`);
       return { data: null, error: { message: `Caught exception: ${errorMessage}`, name: 'InvokeException' } };
    }
  }
} 