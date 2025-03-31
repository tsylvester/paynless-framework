/**
 * Standard CORS headers for API responses
 * Used in all API endpoints to ensure consistent CORS handling
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

/**
 * Create a CORS preflight response handler
 * Standard OPTIONS response for CORS preflight requests
 */
export const handleCorsPreflightRequest = (req: Request): Response | null => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return null;
};

/**
 * Create an error response with proper CORS headers
 * Standardized error response format for all API endpoints
 */
export const createErrorResponse = (
  message: string,
  status: number = 500
): Response => {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
};

/**
 * Create a success response with proper CORS headers
 * Standardized success response format for all API endpoints
 */
export const createSuccessResponse = (
  data: any,
  status: number = 200
): Response => {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
};