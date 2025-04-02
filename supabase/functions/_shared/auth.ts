import { corsHeaders } from './cors-headers.ts';
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Initialize Supabase client from request authorization
 * Used for authenticated endpoints to get the current user
 */
export const createSupabaseClient = (req: Request): SupabaseClient => {
  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader ?? "" } },
    auth: { persistSession: false },
  });
};

/**
 * Initialize Supabase client with service role
 * Used for admin operations and webhooks
 */
export const createSupabaseAdminClient = (): SupabaseClient => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase URL or service role key");
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
};

/**
 * Get authenticated user ID from request
 * Helper function to simplify getting the current user ID
 */
export const getUserId = async (req: Request): Promise<string> => {
  console.log("getUserId called");
  const supabase = createSupabaseClient(req);
  
  try {
    console.log("Attempting to get user from auth");
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error("Auth error getting user:", error);
      throw new Error("Unauthorized");
    }
    
    if (!data || !data.user) {
      console.error("No user data returned from auth");
      throw new Error("Unauthorized");
    }
    
    console.log("Successfully obtained user ID:", data.user.id);
    return data.user.id;
  } catch (err) {
    console.error("Error in getUserId:", err);
    throw new Error("Unauthorized");
  }
};

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

  console.log("No valid authentication found");
  return false;
}

/**
 * Verify the request has a valid JWT token
 */
export async function isAuthenticated(req: Request): Promise<{ 
  isValid: boolean; 
  userId?: string;
  error?: string;
}> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { isValid: false, error: 'Missing or invalid Authorization header' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return { isValid: false, error: 'Missing token' };
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return { isValid: false, error: 'Server configuration error' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autorefresh_token: false,
      },
    });

    // Verify the token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Token verification failed:', error);
      return { isValid: false, error: error?.message || 'Invalid token' };
    }

    return { isValid: true, userId: user.id };
  } catch (error) {
    console.error('Error verifying authentication:', error);
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Authentication error' 
    };
  }
}

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