// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
/**
 * Type definitions for the Stripe webhook handler
 */

// CORS headers for API responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface WebhookHandlerResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}