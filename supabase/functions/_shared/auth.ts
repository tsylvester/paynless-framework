import { corsHeaders } from './cors-headers.ts';

/**
 * Verify the request has a valid apikey
 * This is used for client-side requests that don't need JWT authentication
 */
export const verifyApiKey = (req: Request): boolean => {
  // First try to get apikey from headers
  const headerApikey = req.headers.get('apikey');
  if (headerApikey) {
    return headerApikey === Deno.env.get('SUPABASE_ANON_KEY');
  }

  // If not in headers, try to get from sb section
  const url = new URL(req.url);
  const sb = url.searchParams.get('sb');
  if (sb) {
    try {
      const sbData = JSON.parse(sb);
      if (sbData.apikey && sbData.apikey.length > 0) {
        return true; // The apikey is already verified by Supabase's proxy
      }
    } catch (e) {
      console.error('Error parsing sb parameter:', e);
    }
  }

  return false;
};

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
export const createUnauthorizedResponse = (message: string = 'Unauthorized'): Response => {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}; 