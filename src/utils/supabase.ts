import { createClient } from '@supabase/supabase-js';

// Ensure environment variables are available
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Creates and returns a Supabase client instance
 */
export const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key must be provided');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
};

/**
 * Use this function to get a client with admin rights (server-side only)
 * WARNING: This should never be used in client-side code
 */
export const getSupabaseServiceClient = () => {
  const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL and Service Key must be provided');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
};