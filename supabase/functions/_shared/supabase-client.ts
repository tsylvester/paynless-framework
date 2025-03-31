import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

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
  const supabase = createSupabaseClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error("Unauthorized");
  }
  
  return user.id;
};