/**
 * Access Router for Unauthenticated Users
 * 
 * This file is a router ONLY. It does not contain any function implementations.
 * All function implementations must be in their respective folders under /access/.
 * 
 * IMPORTANT: This router is for unauthenticated users only. It handles operations
 * that don't require a JWT token (login, register). For authenticated operations,
 * see the /auth router instead.
 * 
 * The router strips '/functions/v1/access' from the path before routing to the appropriate handler.
 * Example: /functions/v1/access/login -> /login -> handleLogin
 */

import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";
import handleLogin from "./login/index.ts";
import handleRegister from "./register/index.ts";


Deno.serve(async (req) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  // Parse the URL to get the path
  const url = new URL(req.url);
  const path = url.pathname.replace('/functions/v1/access', '');

  // Route to the appropriate handler based on the path
  switch (path) {
    case '/login':
      return handleLogin(req);
    case '/register':
      return handleRegister(req);
    default:
      return createErrorResponse("Not found", 404);
  }
});
