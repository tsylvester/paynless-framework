import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { corsHeaders, SubscriptionUsageMetrics } from "../types.ts";

/**
 * Get usage metrics for a specific metric type
 */
export const getUsageMetrics = async (
  supabase: SupabaseClient,
  userId: string,
  metric: string
): Promise<Response> => {
  try {
    // Get current subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        subscription_plans:plan_id (*)
      `)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (subscriptionError) {
      return new Response(JSON.stringify({ error: subscriptionError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Handle different metrics
    let usageData: SubscriptionUsageMetrics;
    
    switch (metric) {
      case "api-calls":
        // Simplified example - in a real app, you'd have a usage tracking table
        usageData = {
          current: 0,
          limit: subscription?.subscription_plans?.metadata?.api_limit || 0,
          reset_date: subscription?.current_period_end || null,
        };
        break;
        
      case "storage":
        // Simplified example - in a real app, you'd calculate actual storage used
        usageData = {
          current: 0, // MB used
          limit: subscription?.subscription_plans?.metadata?.storage_limit || 0, // MB allowed
        };
        break;
        
      default:
        return new Response(JSON.stringify({ error: "Unknown metric" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    return new Response(JSON.stringify(usageData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};