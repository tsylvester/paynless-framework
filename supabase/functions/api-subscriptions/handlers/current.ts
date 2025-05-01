// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient, PostgrestError } from "npm:@supabase/supabase-js";
// Import DB types for clarity
import type { Database } from '../../types_db.ts';

// Define structured error for handlers
export class HandlerError extends Error {
  constructor(message: string, public status: number, cause?: unknown) {
    super(message);
    this.name = 'HandlerError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

// Define return type based on DB schema (adjust if structure differs)
// We might need a more specific type if `subscription_plans` relationship is complex
type UserSubscriptionData = Database['public']['Tables']['user_subscriptions']['Row'] & {
  subscription_plans: Database['public']['Tables']['subscription_plans']['Row'] | null;
};

/**
 * Get current user subscription data.
 * Returns subscription data on success, throws HandlerError on failure.
 */
export const getCurrentSubscription = async (
  supabase: SupabaseClient<Database>, // Use Database type
  userId: string
  // Remove response creation deps
): Promise<UserSubscriptionData> => {
  try {
    // Define the select query string
    const selectQuery = `
      *,
      subscription_plans:plan_id (*)
    `;

    const { data, error } = await supabase
      .from("user_subscriptions")
      .select(selectQuery)
      .eq("user_id", userId)
      .returns<UserSubscriptionData[]>() // Specify return type for clarity
      .maybeSingle();
    
    if (error) {
      console.error(`Error fetching user subscription for ${userId}:`, error);
      // Throw structured error for DB issues
      throw new HandlerError("Failed to retrieve subscription data", 500, error);
    }
    
    // User should always have a subscription record thanks to the database trigger
    // But handle the rare case where they might not
    if (!data) {
      console.warn(`Subscription record not found for user ${userId}. This might indicate an issue with the profile creation trigger.`);
      // Throw structured error for not found
      throw new HandlerError("Subscription not found", 404);
    }
    
    // Return the raw data fetched from the database
    return data;

  } catch (err) {
     // If it's already a HandlerError, re-throw it
    if (err instanceof HandlerError) {
      throw err;
    }
    // Otherwise, wrap unexpected errors
    console.error(`Unexpected error getting subscription for user ${userId}:`, err);
    const message = err instanceof Error ? err.message : String(err);
    throw new HandlerError(message, 500, err); 
  }
};