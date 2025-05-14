// supabase/functions/sync-stripe-plans/services/sync_plans_service.ts

// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import {
  SupabaseClient,
  PostgrestError
} from "jsr:@supabase/supabase-js@^2.4";
import { Database } from "../../types_db.ts"; // Adjust path relative to service file
import { logger } from "../../_shared/logger.ts"; // Use relative path to shared logger

// Define shape for plan data used in upsert
// This interface is used by the calling function (index.ts) to prepare data.
// It should be structurally compatible with Database['public']['Tables']['subscription_plans']['Insert']
export interface PlanUpsertData {
  stripe_price_id: string;
  stripe_product_id: string;
  name: string;
  description: object; // { subtitle: string, features: string[] }
  amount: number | null;
  currency: string;
  interval?: string | undefined; // Made optional as it's not always present
  interval_count?: number | undefined; // Made optional
  metadata: object | null; // This will carry Stripe's metadata
  active: boolean;
  item_id_internal?: string | undefined; 
  tokens_awarded?: number | undefined;   
  plan_type?: string | undefined;        
}

// Define shape for existing plan data needed for deactivation
export interface ExistingPlanData {
    id: string; // Assuming UUID from DB is string
    stripe_price_id: string;
    name: string;
    active: boolean;
}

/**
 * Interface for Supabase DB interactions needed by the sync-stripe-plans handler.
 */
export interface ISyncPlansService {
  /**
   * Upserts subscription plans into the database.
   * @param plans Array of plan data matching the DB schema.
   * @returns The PostgrestResponse from the upsert operation.
   */
  upsertPlans(plans: Database['public']['Tables']['subscription_plans']['Insert'][]): Promise<{ error: PostgrestError | null }>;

  /**
   * Fetches existing plans from the database for deactivation check.
   * @returns An object containing the plan data or an error.
   */
  getExistingPlans(): Promise<{ data: ExistingPlanData[] | null; error: PostgrestError | null }>;

   /**
   * Deactivates a single plan by its Stripe Price ID.
   * @param priceId The Stripe Price ID of the plan to deactivate.
   * @returns An object containing only the potential error from the update.
   */
   deactivatePlan(priceId: string): Promise<{ error: PostgrestError | null }>;
}

/**
 * Concrete implementation of ISyncPlansService using SupabaseClient.
 */
export class SyncPlansService implements ISyncPlansService {
  private supabase: SupabaseClient<Database>;

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
  }

  async upsertPlans(plans: Database['public']['Tables']['subscription_plans']['Insert'][]): Promise<{ error: PostgrestError | null }> {
     logger.info(`[SyncPlansService] Upserting ${plans.length} plans...`);
     // Ensure all objects in 'plans' conform to the expected Insert type
     // Additional validation could be added here if necessary before upserting
     const result = await this.supabase
      .from('subscription_plans')
      .upsert(plans, { onConflict: 'stripe_price_id' }); // Removed 'as any[]'

    if (result.error) {
      logger.error(`[SyncPlansService] Supabase upsert error:`, { error: result.error });
      return { error: result.error };
    } else {
      logger.info(`[SyncPlansService] Upsert successful. ${result.count ?? 0} rows affected.`);
      return { error: null };
    }
  }

  async getExistingPlans(): Promise<{ data: ExistingPlanData[] | null; error: PostgrestError | null }> {
    logger.info(`[SyncPlansService] Fetching existing plans...`);
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('id, stripe_price_id, name, active'); 

    if (error) {
       logger.error("[SyncPlansService] Could not fetch existing plans:", { errorMessage: error.message });
       return { data: null, error: error };
    } else {
        logger.info(`[SyncPlansService] Found ${data?.length ?? 0} plans in DB.`);
    }
    return { data: data as unknown as ExistingPlanData[] | null, error }; // Keep cast for now if ExistingPlanData is simpler than Row type
  }

  async deactivatePlan(priceId: string): Promise<{ error: PostgrestError | null }> {
    logger.info(`[SyncPlansService] Deactivating plan with stripe_price_id: ${priceId}`);
    const { error } = await this.supabase
      .from('subscription_plans')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('stripe_price_id', priceId);

    if (error) {
      logger.error(`[SyncPlansService] Error deactivating plan ${priceId}:`, { errorMessage: error.message });
    }
    return { error };
  }
} 