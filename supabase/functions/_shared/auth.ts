import { corsHeaders } from './cors-headers.ts';
import { createClient as actualCreateClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, SupabaseClientOptions, AuthError } from "npm:@supabase/supabase-js@2";

// Define the dependency type (the createClient function signature)
type CreateClientFn = (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;

/**
 * Initialize Supabase client from request authorization
 * Uses injected createClient function.
 */
export const createSupabaseClient = (
    req: Request,
    createClientFn: CreateClientFn = actualCreateClient // Default to actual implementation
): SupabaseClient => {
  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  return createClientFn(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader ?? "" } },
    auth: { persistSession: false },
  });
};

/**
 * Initialize Supabase client with service role
 * Uses injected createClient function.
 */
export const createSupabaseAdminClient = (
    createClientFn: CreateClientFn = actualCreateClient // Default to actual implementation
): SupabaseClient => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase URL or service role key");
  }
  
  return createClientFn(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
};

/**
 * Get authenticated user ID from a pre-initialized Supabase client.
 * Modified to accept the client instance directly for easier testing.
 */
export const getUserIdFromClient = async (supabase: SupabaseClient): Promise<string> => {
  console.log("getUserIdFromClient called");
  try {
    console.log("Attempting to get user from auth");
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error("Auth error getting user:", error);
      throw new Error("Unauthorized - getUser error");
    }
    
    if (!data || !data.user) {
      console.error("No user data returned from auth");
      throw new Error("Unauthorized - No user data");
    }
    
    console.log("Successfully obtained user ID:", data.user.id);
    return data.user.id;
  } catch (err) {
    console.error("Error in getUserIdFromClient:", err);
    // Re-throw a generic error to avoid leaking details potentially
    // Or handle specific known errors differently if needed
    throw new Error("Unauthorized - Exception");
  }
};

/**
 * Verify the request has a valid apikey
 * This is used for client-side requests that don't need JWT authentication
 */
export function verifyApiKey(req: Request): boolean {
  const apiKeyHeader = req.headers.get('apikey');
  const expectedApiKey = Deno.env.get("SUPABASE_ANON_KEY");

  // ---> Add Detailed Logging <---
  console.log(`[verifyApiKey] Received apikey header: ${apiKeyHeader}`);
  console.log(`[verifyApiKey] Expected apikey from env: ${expectedApiKey}`);
  // ---> End Logging <---

  if (!apiKeyHeader) {
    console.log("[verifyApiKey] Result: false (header missing)");
    return false;
  }

  if (!expectedApiKey) {
    console.error("[verifyApiKey] CRITICAL: SUPABASE_ANON_KEY not found in function environment!");
    console.log("[verifyApiKey] Result: false (env var missing)");
    return false;
  }

  const isValid = apiKeyHeader === expectedApiKey;
  console.log(`[verifyApiKey] Comparison result: ${isValid}`);
  return isValid;
}

/**
 * Verify the request has a valid JWT token using a pre-initialized client.
 * Modified to accept the client instance directly for easier testing.
 */
export async function isAuthenticatedWithClient(req: Request, supabase: SupabaseClient): Promise<{ 
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

    // Verify the token using the provided client
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