/**
 * Auth Router for Authenticated Users
 * 
 * This file is a router ONLY. It does not contain any function implementations.
 * All function implementations must be in their respective folders under /auth/.
 * 
 * IMPORTANT: All routes handled by this router REQUIRE a valid JWT token in the Authorization header.
 * This router is for authenticated users only. For unauthenticated operations (login, register),
 * see the /access router instead.
 * 
 * The router strips '/functions/v1/auth' from the path before routing to the appropriate handler.
 * Example: /functions/v1/auth/logout -> /logout -> handleLogout
 */

import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";
import handleLogout from "./logout/index.ts";
import handleGetCurrentUser from "./me/index.ts";
import handleResetPassword from "./reset-password/index.ts";
import handleRefresh from "./refresh/index.ts";


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
  const path = url.pathname.replace('/functions/v1/auth', '');

  // Route to the appropriate handler based on the path
  switch (path) {
    case '/logout':
      return handleLogout(req);
    case '/me':
      return handleGetCurrentUser(req);
    case '/reset-password':
      return handleResetPassword(req);
    case '/refresh':
      return handleRefresh(req);
    default:
      return createErrorResponse("Not found", 404);
  }
});