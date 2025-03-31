import { corsHeaders } from './cors-headers.ts';

/**
 * Verify the request has a valid apikey
 * This is used for client-side requests that don't need JWT authentication
 */
export function verifyApiKey(req: Request): boolean {
  // Log all headers for debugging
  console.log("All request headers:", Object.fromEntries(req.headers.entries()));
  
  // Check for apikey in headers
  const apiKey = req.headers.get('apikey');
  console.log("API key from headers:", apiKey ? "present" : "missing");
  
  if (apiKey) {
    // If we have an apikey header, verify it matches the anon key
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) {
      console.error("SUPABASE_ANON_KEY not configured");
      return false;
    }
    
    const isValid = apiKey === anonKey;
    console.log("API key validation result:", isValid);
    return isValid;
  }

  // If no apikey in headers, check Authorization header (might include Bearer token)
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log("Found Bearer token in Authorization header");
    // For this endpoint, we're allowing access with any valid Bearer token
    return true;
  }

  // If no apikey or auth header, check for sb parameter in search params
  const url = new URL(req.url);
  const sb = url.searchParams.get('sb');
  console.log("SB parameter:", sb ? "present" : "missing");
  
  if (sb) {
    try {
      const sbData = JSON.parse(sb);
      console.log("Parsed SB data:", JSON.stringify(sbData));
      
      // Check JWT validity from sb parameter
      if (sbData.jwt && sbData.jwt.length > 0) {
        const jwt = sbData.jwt[0];
        if (jwt.apikey && jwt.apikey.length > 0) {
          const apikey = jwt.apikey[0];
          if (apikey.payload && apikey.payload.length > 0) {
            const payload = apikey.payload[0];
            const role = payload.role;
            const invalid = apikey.invalid;
            
            console.log("JWT role:", role);
            console.log("JWT invalid:", invalid);
            
            return role === "anon" && !invalid;
          }
        }
      }
    } catch (e) {
      console.error("Error parsing SB data:", e);
    }
  }

  console.log("No valid authentication found");
  return false;
}

/**
 * Verify the request has a valid Authorization header
 * This is used for authenticated requests that need JWT authentication
 */
export const verifyAuthHeader = (req: Request): boolean => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }
  return authHeader.startsWith('Bearer ');
};

/**
 * Create an unauthorized response
 */
export function createUnauthorizedResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: { code: "unauthorized", message } }),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}