// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import { 
    type SupabaseClient,
    type PostgrestError,
    type FunctionsError
} from 'npm:@supabase/supabase-js@2';
import { Database, Tables, TablesInsert, TablesUpdate } from "../../types_db.ts";
import { logger } from "../../_shared/logger.ts"; // Use relative path
import type { SyncResult } from '../sync-ai-models/index.ts'; // Import SyncResult

/**
 * Interface for Supabase interactions needed by product webhook handlers.
 * This abstraction simplifies mocking in unit tests.
 */
export interface ISupabaseProductWebhookService { // <--- Add export here
  /**
   * Updates the 'active' status of subscription plans linked to a Stripe Product ID.
   * @param productId The Stripe Product ID.
   * @param active The target active status.
   * @returns An object containing only the potential error.
   */
  updatePlanStatus(productId: string, active: boolean): Promise<{ error: PostgrestError | null }>;

  /**
   * Invokes the 'sync-stripe-plans' Edge Function.
   * @param isTestMode Indicates whether to run the sync in test mode.
   * @returns The result of the function invocation (data and/or error).
   */
  invokeSyncPlans(isTestMode: boolean): Promise<{ data: SyncResult | null; error: FunctionsError | { message: string, name: string } | null }>;
}

/**
 * Concrete implementation of ISupabaseProductWebhookService using SupabaseClient.
 */
export class SupabaseProductWebhookService implements ISupabaseProductWebhookService {
  private supabase: SupabaseClient<Database>;

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
  }

  async updatePlanStatus(productId: string, active: boolean): Promise<{ error: PostgrestError | null }> {
    const { error } = await this.supabase
      .from('subscription_plans')
      .update({ active: active, updated_at: new Date().toISOString() }) // Removed 'satisfies' based on previous findings
      .eq('stripe_product_id', productId)
      .neq('stripe_price_id', 'price_FREE'); // Ensure we don't touch the Free plan row

    if (error) {
      logger.error(`[SupabaseProductWebhookService] Error updating plan status for product ${productId}: ${error.message}`);
    }
    // Return only the error part, consistent with original handler logic
    return { error };
  }

  async invokeSyncPlans(isTestMode: boolean): Promise<{ data: SyncResult | null; error: FunctionsError | { message: string, name: string } | null }> {
    logger.info(`[SupabaseProductWebhookService] Attempting to invoke sync-stripe-plans with mode: ${isTestMode ? 'test' : 'live'}`);
    try {
      const { data, error } = await this.supabase.functions.invoke('sync-stripe-plans', {
        body: JSON.stringify({ isTestMode: isTestMode })
      });

      if (error) {
        logger.error(`[SupabaseProductWebhookService] Error invoking sync-stripe-plans function: ${JSON.stringify(error, null, 2)}`);
      } else {
         logger.info("[SupabaseProductWebhookService] Successfully invoked sync-stripe-plans. Result:", data);
      }
      return { data, error }; // Return the result

    } catch (invokeCatchError) {
       const errorMessage = invokeCatchError instanceof Error ? invokeCatchError.message : String(invokeCatchError);
       logger.error(`[SupabaseProductWebhookService] CRITICAL: Caught exception during function invocation: ${errorMessage}`);
       // Return an error structure consistent with Supabase function errors
       return { data: null, error: { message: `Caught exception: ${errorMessage}`, name: 'InvokeException' } };
    }
  }
} 