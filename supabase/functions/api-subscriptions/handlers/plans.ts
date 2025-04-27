// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "npm:@supabase/supabase-js";
// Fix: Import DB types and HandlerError
import type { Database } from '../../types_db.ts';
import { HandlerError } from "./current.ts"; // Reuse HandlerError from current.ts (or move to shared)

// Fix: Define return type based on DB schema
type SubscriptionPlanData = Database['public']['Tables']['subscription_plans']['Row'];

// Remove old imports and Deps interface
// import { type SubscriptionPlan } from "../../_shared/types.ts"; // Use DB type instead
// import { corsHeaders } from "../../_shared/cors-headers.ts"; // Removed
// import { 
//   createErrorResponse as CreateErrorResponseType, 
//   createSuccessResponse as CreateSuccessResponseType 
// } from "../../_shared/responses.ts"; // Removed
// 
// interface GetPlansDeps {
//   createErrorResponse: typeof CreateErrorResponseType;
//   createSuccessResponse: typeof CreateSuccessResponseType;
// } // Removed

/**
 * Get available subscription plans data.
 * Returns an array of plan data on success, throws HandlerError on failure.
 */
export const getSubscriptionPlans = async (
  supabase: SupabaseClient<Database>,
  isTestMode: boolean
  // Remove deps parameter
): Promise<SubscriptionPlanData[]> => {
  // Remove destructuring of removed deps
  // const { createErrorResponse, createSuccessResponse } = deps;
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .order("amount", { ascending: true })
      .returns<SubscriptionPlanData[]>(); // Specify return type
    
    if (error) {
      console.error("Error fetching subscription plans:", error);
      // Fix: Throw HandlerError for DB error
      throw new HandlerError("Failed to retrieve subscription plans", 500, error);
    }
    
    // Handle case where data is null/undefined (shouldn't happen with select * unless error, but good practice)
    if (!data) {
        console.warn("No subscription plan data returned, even without error.");
        return []; // Return empty array for success with no data
    }

    // Filter plans based on the test_mode field in metadata
    const filteredPlans = data.filter(plan => {
      // Fix: Add type guard for metadata object
      const metadata = plan.metadata;
      if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        // If metadata is not a valid object, include the plan (or decide based on requirements)
        return true; 
      }
      // Now it's safe to access potential properties
      const testMode = (metadata as { [key: string]: any })['test_mode'];

      // If no test_mode specified in metadata, include the plan in both modes
      if (testMode === undefined) return true;
      // Otherwise, only include if the test_mode matches the current mode
      return testMode === isTestMode;
    });
    
    // Remove transformation - return raw DB data
    // const subscriptionPlans: SubscriptionPlan[] = filteredPlans.map(plan => ({
    //   id: plan.id,
    //   stripePriceId: plan.stripe_price_id,
    //   name: plan.name,
    //   description: plan.description,
    //   amount: plan.amount,
    //   currency: plan.currency,
    //   interval: plan.interval,
    //   intervalCount: plan.interval_count,
    //   metadata: plan.metadata,
    // }));
    
    // ---> Add Logging <---
    console.log('[plans.ts] Handler returning success payload (filtered DB data):', JSON.stringify(filteredPlans));
    // ---> End Logging <---

    // Return the filtered array of DB data
    return filteredPlans;

  } catch (err) {
    // Fix: Handle/re-throw HandlerError or wrap other errors
    if (err instanceof HandlerError) {
      throw err;
    }
    console.error("Unexpected error getting subscription plans:", err);
    const message = err instanceof Error ? err.message : String(err);
    throw new HandlerError(message, 500, err);
  }
};