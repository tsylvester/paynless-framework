// Path: src/services/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { networkMonitor } from '../utils/network';
import { withRetry, isRetryableError } from '../utils/retry';
import { AuthError, AuthErrorType } from '../types/auth.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('Missing Supabase environment variables');
  throw new Error('Missing Supabase environment variables');
}

// Configure Supabase client with proper persistence options
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Enable persistent sessions
    storageKey: 'auth-storage', // Custom storage key
    autoRefreshToken: true, // Auto-refresh the token
    detectSessionInUrl: true, // Detect auth redirects
    storage: localStorage // Explicitly set storage to localStorage
  }
});

/**
 * Categorizes an error into a specific auth error type
 */
export function categorizeAuthError(error: unknown): AuthErrorType {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  
  if (!networkMonitor.isOnline()) {
    return AuthErrorType.NETWORK_ERROR;
  }
  
  if (message.includes('not authenticated') || message.includes('session')) {
    return AuthErrorType.NOT_AUTHENTICATED;
  }
  
  if (message.includes('expired')) {
    return AuthErrorType.EXPIRED_SESSION;
  }
  
  if (message.includes('invalid') && (message.includes('password') || message.includes('credentials'))) {
    return AuthErrorType.INVALID_CREDENTIALS;
  }
  
  if (isRetryableError(error)) {
    return AuthErrorType.NETWORK_ERROR;
  }
  
  if (error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status >= 500) {
    return AuthErrorType.SERVER_ERROR;
  }
  
  return AuthErrorType.UNKNOWN_ERROR;
}

/**
 * Gets the current authenticated user
 * Returns the user or null if not authenticated
 * Throws an error for unexpected errors that should be handled by the caller
 */
export const getUser = async () => {
  try {
    // Try to get session from localStorage first
    const storedSession = localStorage.getItem('auth-storage');
    
    // Check if we have a stored session before making network requests
    if (storedSession) {
      try {
        const parsedSession = JSON.parse(storedSession);
        if (parsedSession && parsedSession.user) {
          logger.debug('Retrieved user from localStorage');
          // If we have a valid local session and we're offline, use it
          if (!networkMonitor.isOnline()) {
            return parsedSession.user;
          }
        }
      } catch (e) {
        logger.debug('Error parsing stored session', e);
        // Continue to network request if parsing fails
      }
    }
    
    // Only try network operations if we're online
    if (!networkMonitor.isOnline()) {
      logger.debug('Network offline, cannot fetch user');
      return null;
    }
    
    // Use retry pattern for network operations
    const { data, error } = await withRetry(
      () => supabase.auth.getUser(),
      {
        maxRetries: 2,
        initialDelay: 300,
        onRetry: (attempt) => {
          logger.debug(`Retrying getUser, attempt ${attempt}`);
        }
      }
    );
    
    if (error) {
      const errorType = categorizeAuthError(error);
      
      // Return null for authentication-related errors
      if (
        errorType === AuthErrorType.NOT_AUTHENTICATED ||
        errorType === AuthErrorType.EXPIRED_SESSION
      ) {
        logger.debug(`Auth error in getUser: ${errorType}`);
        return null;
      }
      
      // Throw the categorized error for other error types
      logger.error(`Error fetching user: ${errorType}`, error);
      const authError = new Error(error.message) as AuthError;
      authError.type = errorType;
      authError.originalError = error;
      throw authError;
    }
    
    return data.user;
  } catch (error) {
    // Categorize unexpected errors
    const errorType = categorizeAuthError(error);
    logger.error(`Unexpected error in getUser: ${errorType}`, error);
    
    // Attach the error category and rethrow
    const authError = new Error(error instanceof Error ? error.message : 'Unknown error') as AuthError;
    authError.type = errorType;
    authError.originalError = error;
    throw authError;
  }
};

/**
 * Gets the current authentication session
 * Returns the session or null if not authenticated
 * Throws an error for unexpected errors that should be handled by the caller
 */
export const getSession = async () => {
  try {
    // Try to get session from localStorage first (for offline support)
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      const errorType = categorizeAuthError(error);
      logger.error(`Error fetching session: ${errorType}`, error);
      
      if (errorType === AuthErrorType.NOT_AUTHENTICATED || 
          errorType === AuthErrorType.EXPIRED_SESSION) {
        return null;
      }
      
      const authError = new Error(error.message) as AuthError;
      authError.type = errorType;
      authError.originalError = error;
      throw authError;
    }
    
    // If we have a session but we're online, refresh it to ensure it's valid
    if (data.session && networkMonitor.isOnline()) {
      try {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          logger.warn('Session refresh failed', refreshError);
          // If refresh fails, still return the existing session
          return data.session;
        }
        
        return refreshData.session;
      } catch (refreshError) {
        logger.warn('Session refresh failed with exception', refreshError);
        return data.session;
      }
    }
    
    return data.session;
  } catch (error) {
    // Log but don't throw to improve resilience
    const errorType = categorizeAuthError(error);
    logger.error(`Unexpected error in getSession: ${errorType}`, error);
    
    return null;
  }
};

/**
 * Attempts to refresh the current session
 * Returns true if successful, false otherwise
 */
export const refreshSession = async (): Promise<boolean> => {
  try {
    if (!networkMonitor.isOnline()) {
      logger.debug('Network offline, cannot refresh session');
      return false;
    }
    
    const { data, error } = await withRetry(
      () => supabase.auth.refreshSession(),
      { maxRetries: 2 }
    );
    
    if (error) {
      logger.debug('Session refresh failed', error);
      return false;
    }
    
    if (data.session) {
      logger.debug('Session refreshed successfully');
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Error refreshing session', error);
    return false;
  }
};

/**
 * Safely sign out the user, handling network errors
 */
export const safeSignOut = async (): Promise<boolean> => {
  try {
    // Always try to sign out on the server first (if online)
    if (networkMonitor.isOnline()) {
      const { error } = await withRetry(
        () => supabase.auth.signOut({ scope: 'global' }), // Use global scope explicitly
        { maxRetries: 2 }
      );
      
      if (error) {
        logger.error('Error during server sign out', error);
        // Continue to local sign out even if server sign out fails
      }
    } 
    
    // Always perform local sign out to clean up client state
    try {
      // This handles the localStorage clearing properly
      await supabase.auth.signOut({ scope: 'local' });
      
      // Force clear any localStorage auth items as a fallback
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('supabase.auth') || key.startsWith('sb-') || key === 'auth-storage') {
          localStorage.removeItem(key);
        }
      }
      
      logger.debug('Local sign out completed');
    } catch (localError) {
      logger.error('Local sign out failed', localError);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Unexpected error during sign out', error);
    return false;
  }
};