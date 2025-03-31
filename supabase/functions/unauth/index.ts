import { handleCorsPreflightRequest, createErrorResponse } from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";

// Import the register handler
const { default: handleRegister } = await import('./register/index.ts');

Deno.serve(async (req) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    // Parse the request body to get the action
    const body = await req.json();
    const action = body.action;

    // Route to the appropriate handler based on the action
    switch (action) {
      case 'register': {
        // Pass the parsed body to the register handler
        return await handleRegister(body);
      }
      default:
        return createErrorResponse("Invalid action", 400);
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "An unexpected error occurred",
      500
    );
  }
}); 