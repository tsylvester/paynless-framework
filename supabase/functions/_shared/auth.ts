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

  // If no apikey in headers, check sb parameter
  const url = new URL(req.url);
  const sb = url.searchParams.get('sb');
  console.log("SB parameter:", sb ? "present" : "missing");
  
  if (sb) {
    try {
      const sbData = JSON.parse(sb);
      console.log("Parsed SB data:", JSON.stringify(sbData, null, 2));
      
      // Check for valid JWT with anon role
      const jwt = sbData.jwt?.[0]?.apikey?.[0];
      if (jwt) {
        const payload = jwt.payload?.[0];
        const role = payload?.role;
        const invalid = jwt.invalid;
        
        console.log("JWT role:", role);
        console.log("JWT invalid:", invalid);
        
        return role === "anon" && !invalid;
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
    JSON.stringify({ error: { code: 401, message } }),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
} 