/**
* Standard CORS headers for API responses
* Used in all API endpoints to ensure consistent CORS handling
*/
export const corsHeaders = {
 "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
 "Access-Control-Allow-Credentials": "true",
 "Access-Control-Max-Age": "86400", // 24 hours
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
   JSON.stringify({ 
     error: { 
       code: status === 400 ? "bad_request" : 
             status === 401 ? "unauthorized" : 
             status === 403 ? "forbidden" : 
             status === 404 ? "not_found" : 
             status === 429 ? "rate_limit_exceeded" : 
             "server_error",
       message 
     } 
   }),
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