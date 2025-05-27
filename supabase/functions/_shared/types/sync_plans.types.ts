import { PostgrestError } from "npm:@supabase/supabase-js";

// Define shape for plan data used in upsert
// Match the structure created in the original handler
export interface PlanUpsertData {
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
    upsertPlans(plans: PlanUpsertData[]): Promise<{ error: PostgrestError | null }>;
  
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
  