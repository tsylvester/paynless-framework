// Path: src/services/supabase.ts
import { createClient, AuthResponse } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { AuthError, AuthErrorType } from '../types/auth.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_DATABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('Missing Supabase environment variables');
  throw new Error('Missing Supabase environment variables');
}

// Configure Supabase client with optimal persistence options
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Enable persistent sessions
    autoRefreshToken: true, // Auto-refresh the token
    detectSessionInUrl: true, // Detect auth redirects
    storage: localStorage, // Explicitly set storage to localStorage
    storageKey: 'supabase.auth.token', // Custom storage key for better control
    flowType: 'implicit', // Use implicit flow for better cross-site handling
  }
});

// Add listener for auth changes to debug session issues
if (process.env.NODE_ENV !== 'production') {
  supabase.auth.onAuthStateChange((event, session) => {
    logger.debug('Auth state change:', event, session ? 'Session exists' : 'No session');
    
    // Log session expiry if available
    if (session?.expires_at) {
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      const minutesUntilExpiry = Math.round(timeUntilExpiry / (1000 * 60));
      
      logger.debug(`Session expires in ${minutesUntilExpiry} minutes (${expiresAt.toLocaleString()})`);
    }
  });
}

/**
 * Categorizes an error into a specific auth error type
 */
export function categorizeAuthError(error: unknown): AuthErrorType {
  if (!error) return AuthErrorType.UNKNOWN_ERROR;
  
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const supabaseError = error as { code?: string; status?: number };

  // Network errors
  if (
    message.includes('network') || 
    message.includes('fetch') || 
    message.includes('failed to fetch') ||
    message.includes('connection') ||
    supabaseError.code === 'NETWORK_ERROR'
  ) {
    return AuthErrorType.NETWORK_ERROR;
  }

  // Authentication errors
  if (message.includes('not authenticated') || message.includes('session')) {
    return AuthErrorType.NOT_AUTHENTICATED;
  }

  if (message.includes('expired')) {
    return AuthErrorType.EXPIRED_SESSION;
  }

  if (
    message.includes('invalid') && 
    (message.includes('password') || message.includes('credentials'))
  ) {
    return AuthErrorType.INVALID_CREDENTIALS;
  }

  // Server errors
  if (supabaseError.status && supabaseError.status >= 500) {
    return AuthErrorType.SERVER_ERROR;
  }

  return AuthErrorType.UNKNOWN_ERROR;
}

/**
 * Safely sign out the user, handling network errors and cleanup
 */
export const safeSignOut = async (): Promise<boolean> => {
  try {
    logger.debug('Executing safe sign out');
    
    // Use Supabase's built-in signOut method
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      logger.error('Error during sign out:', error);
      // Continue to local cleanup even if server sign out fails
    }
    
    // Force clear any sensitive auth-related items
    logger.debug('Clearing auth storage items');
    
    // Core Supabase auth items
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('sb-refresh-token');
    localStorage.removeItem('sb-access-token');
    
    // App-specific items
    const appKeys = [
      'chatMessages',
      'currentConversationId',
      'pendingChatMessage',
      'pendingSystemPrompt',
      'chatNavigationType'
    ];
    
    appKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
      }
    });
    
    logger.debug('Sign out completed successfully');
    return true;
  } catch (error) {
    logger.error('Unexpected error during sign out:', error);
    
    // Best effort to clear storage even if there was an error
    try {
      localStorage.removeItem('supabase.auth.token');
    } catch (e) {
      // Ignore errors in cleanup
    }
    
    return false;
  }
};
