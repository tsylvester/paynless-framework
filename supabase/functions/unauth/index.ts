import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../_shared/cors-headers.ts";
import { verifyApiKey } from "../_shared/auth.ts";

// Import the register handler
import handleRegister from './register/index.ts';

serve(async (req) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  console.log("Request received:", {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });

  // Verify API key for all requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    console.error("API key verification failed");
    return new Response(
      JSON.stringify({ 
        error: { 
          code: "unauthorized", 
          message: "Invalid or missing API key" 
        } 
      }),
      {
        status: 401,
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        },
      }
    );
  }

  try {
    // Parse the request body to get the action
    const body = await req.json();
    console.log("Request body:", body);

    const action = body.action;

    // Route to the appropriate handler based on the action
    switch (action) {
      case 'register': {
        // Destructure the registration data and call the handler
        const { email, password, firstName, lastName } = body;
        return await handleRegister({ email, password, firstName, lastName });
      }
      default:
        return createErrorResponse(`Invalid action: ${action}`, 400);
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "An unexpected error occurred",
      500
    );
  }
});