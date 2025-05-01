// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Import shared CORS helpers
import {
    handleCorsPreflightRequest,
    createSuccessResponse, // Assuming 'pong' is a success
    createErrorResponse     // For potential future error handling
} from "../_shared/cors-headers.ts";

console.log("[ping/index.ts] Function loaded.");

async function handler(req: Request): Promise<Response> {
  console.log("[ping/index.ts] Request received.");

  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) {
    return corsResponse;
  }

  // Only allow GET method for ping (optional, but good practice)
  if (req.method !== 'GET') {
      // Pass the request object to createErrorResponse for CORS headers
      return createErrorResponse('Method Not Allowed', 405, req);
  }

  try {
      const data = { message: "pong" };
      // Use createSuccessResponse, passing the request object
      return createSuccessResponse(data, 200, req);
  } catch (err) {
      console.error("[ping/index.ts] Error creating response:", err);
      // Pass the request object to createErrorResponse for CORS headers
      return createErrorResponse(
          err instanceof Error ? err.message : "Internal server error",
          500,
          req,
          err // Pass the original error for logging
      );
  }
}

serve(handler); 