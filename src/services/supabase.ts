// Path: src/services/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_DATABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = 'Missing Supabase environment variables';
  logger.error(errorMsg);
  throw new Error(errorMsg);
}

// Create Supabase client with proper session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit', // Good for web applications
  }
});

// Log initial auth info in development for debugging
if (process.env.NODE_ENV !== 'production') {
  // Wait for next tick to avoid initial log clutter
  setTimeout(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      logger.debug(
        'Initial Supabase auth state:',
        data.session ? 'Session exists' : 'No session'
      );
    } catch (e) {
      logger.error('Error checking initial Supabase auth state:', e);
    }
  }, 0);
}