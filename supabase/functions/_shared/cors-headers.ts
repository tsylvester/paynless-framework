// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.

// Define allowed origins. Replace 'YOUR_PRODUCTION_FRONTEND_URL' with your actual production frontend URL.
// You might also want to load this from environment variables for more flexibility.
const allowedOrigins = [
  'http://localhost:5173', // Local Vite dev server
  'https://paynless.app', // Production URL 1
  'https://paynless-framework.netlify.app' // Production URL 2 (Netlify)
  // Add any other origins (e.g., staging environment) if needed
];

/**
* Base CORS headers (excluding Access-Control-Allow-Origin, which is now dynamic)
* Used in all API endpoints to ensure consistent CORS handling
*/
// Export base headers for use in SSE or other custom responses
export const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paynless-anon-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", // SSE usually uses GET
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400", // 24 hours
};

/**
 * Helper function to check if a given origin is allowed.
 * Exported for use in special cases like SSE streams.
 */
export const isOriginAllowed = (requestOrigin: string | null): boolean => {
  return !!requestOrigin && allowedOrigins.includes(requestOrigin);
};

/**
* Helper function to get CORS headers for a specific request origin.
*/
// Keep this internal, used by the response creators below
const getCorsHeadersForRequest = (request: Request): Record<string, string> => {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = { ...baseCorsHeaders };
  if (isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin!;
  }
  return headers;
};

/**
* Create a CORS preflight response handler
* Standard OPTIONS response for CORS preflight requests
*/
export const handleCorsPreflightRequest = (req: Request): Response | null => {
 if (req.method === "OPTIONS") {
   const corsHeaders = getCorsHeadersForRequest(req);
   // Only return a 204 if the origin is actually allowed
   if (corsHeaders["Access-Control-Allow-Origin"]) {
     return new Response(null, {
       status: 204,
       headers: corsHeaders,
     });
   } else {
     // If origin is not allowed, return a simple 204 without CORS headers
     // or potentially a 403 Forbidden.
     return new Response(null, { status: 204 }); 
   }
 }
 return null;
};

/**
* Create an error response with proper CORS headers and optional logging.
* @param message - The error message.
* @param status - The HTTP status code (default: 500).
* @param request - The original Request object (for CORS origin).
* @param error - The original error object (optional, for logging).
* @param additionalHeaders - Additional headers to merge.
* @returns A Response object.
*/
export const createErrorResponse = (
 message: string,
 status = 500,
 request: Request, // request is now mandatory
 error?: Error | unknown, // Optional error for logging
 additionalHeaders: Record<string, string> = {}
): Response => {
  // Logging logic from responses.ts
  const logParts: any[] = [`API Error (${status}): ${message}`];
  if (error instanceof Error) {
    logParts.push("\nError Details:", error.stack || error.message);
  } else if (error) {
    logParts.push("\nError Details:", error);
  }
  console.error(...logParts);

  // Get dynamic CORS headers
  const corsHeaders = getCorsHeadersForRequest(request);

  // Merge headers
  const finalHeaders = {
     ...corsHeaders, 
     "Content-Type": "application/json", 
     ...additionalHeaders 
  };

 return new Response(
   JSON.stringify({ error: message }), // Standardized error body
   {
     status,
     headers: finalHeaders,
   }
 );
};

/**
* Create a success response with proper CORS headers.
* @param data - The payload to include in the response body.
* @param status - The HTTP status code (default: 200).
* @param request - The original Request object (for CORS origin).
* @param additionalHeaders - Additional headers to merge.
* @returns A Response object.
*/
export const createSuccessResponse = (
 data: any, // Keep as any to match previous flexibility
 status = 200,
 request: Request, // request is now mandatory
 additionalHeaders: Record<string, string> = {}
): Response => {
  // Get dynamic CORS headers
  const corsHeaders = getCorsHeadersForRequest(request);

  // Merge headers
  const finalHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
    ...additionalHeaders
  };

 return new Response(
   JSON.stringify(data),
   {
     status,
     headers: finalHeaders,
   }
 );
};