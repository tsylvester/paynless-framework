// supabase/functions/sync-stripe-plans/services/sync_plans_service.ts

import { SupabaseClient, PostgrestResponse } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts"; // Adjust path relative to service file
import { logger } from "@paynless/utils"; // Use alias from import_map

// Define shape for plan data used in upsert
// Match the structure created in the original handler
interface PlanUpsertData {
  stripe_price_id: string;
  stripe_product_id: string;
  name: string;
  description: object; // { subtitle: string, features: string[] }
  amount: number | null;
  currency: string;
  interval: string | undefined;
  interval_count: number | undefined;
  metadata: object | null;
  active: boolean;
}

// Define shape for existing plan data needed for deactivation
interface ExistingPlanData {
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
  upsertPlans(plans: PlanUpsertData[]): Promise<PostgrestResponse<any>>;

  /**
   * Fetches existing plans from the database for deactivation check.
   * @returns An object containing the plan data or an error.
   */
  getExistingPlans(): Promise<{ data: ExistingPlanData[] | null; error: any | null }>;

   /**
   * Deactivates a single plan by its Stripe Price ID.
   * @param priceId The Stripe Price ID of the plan to deactivate.
   * @returns An object containing only the potential error from the update.
   */
   deactivatePlan(priceId: string): Promise<{ error: any | null }>;
}

/**
 * Concrete implementation of ISyncPlansService using SupabaseClient.
 */
export class SyncPlansService implements ISyncPlansService {
  private supabase: SupabaseClient<Database>;

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
  }

  async upsertPlans(plans: PlanUpsertData[]): Promise<PostgrestResponse<any>> {
     logger.info(`[SyncPlansService] Upserting ${plans.length} plans...`);
     const result = await this.supabase
      .from('subscription_plans')
      .upsert(plans, { onConflict: 'stripe_price_id' });

    if (result.error) {
      logger.error(`[SyncPlansService] Supabase upsert error:`, result.error);
    } else {
      logger.info(`[SyncPlansService] Upsert successful. ${result.count ?? 0} rows affected.`);
    }
    return result;
  }

  async getExistingPlans(): Promise<{ data: ExistingPlanData[] | null; error: any | null }> {
    logger.info(`[SyncPlansService] Fetching existing plans...`);
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('id, stripe_price_id, name, active'); // Select only needed fields

    if (error) {
       logger.error("[SyncPlansService] Could not fetch existing plans:", error.message);
    } else {
        logger.info(`[SyncPlansService] Found ${data?.length ?? 0} plans in DB.`);
    }
    // Cast data to the specific interface shape
    return { data: data as ExistingPlanData[] | null, error };
  }

  async deactivatePlan(priceId: string): Promise<{ error: any | null }> {
    logger.info(`[SyncPlansService] Deactivating plan with stripe_price_id: ${priceId}`);
    const { error } = await this.supabase
      .from('subscription_plans')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('stripe_price_id', priceId);

    if (error) {
      logger.error(`[SyncPlansService] Error deactivating plan ${priceId}:`, error.message);
    }
    return { error };
  }
} 