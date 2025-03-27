import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { networkMonitor } from '../utils/network';
import { withRetry, isRetryableError } from '../utils/retry';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('Missing Supabase environment variables');
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Error categories for better handling
export enum AuthErrorType {
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  EXPIRED_SESSION = 'EXPIRED_SESSION',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Categorizes an error into a specific auth error type
 */
export function categorizeAuthError(error: any): AuthErrorType {
  const message = error?.message?.toLowerCase() || '';
  
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
  
  if (error?.status >= 500) {
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
      error.type = errorType;
      throw error;
    }
    
    return data.user;
  } catch (error) {
    // Categorize unexpected errors
    const errorType = categorizeAuthError(error);
    logger.error(`Unexpected error in getUser: ${errorType}`, error);
    
    // Attach the error category and rethrow
    (error as any).type = errorType;
    throw error;
  }
};

/**
 * Gets the current authentication session
 * Returns the session or null if not authenticated
 * Throws an error for unexpected errors that should be handled by the caller
 */
export const getSession = async () => {
  try {
    // Only try network operations if we're online
    if (!networkMonitor.isOnline()) {
      logger.debug('Network offline, cannot fetch session');
      return null;
    }
    
    // Use retry pattern for network operations
    const { data, error } = await withRetry(
      () => supabase.auth.getSession(),
      {
        maxRetries: 2,
        initialDelay: 300,
        onRetry: (attempt) => {
          logger.debug(`Retrying getSession, attempt ${attempt}`);
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
        logger.debug(`Auth error in getSession: ${errorType}`);
        return null;
      }
      
      // Throw the categorized error for other error types
      logger.error(`Error fetching session: ${errorType}`, error);
      error.type = errorType;
      throw error;
    }
    
    return data.session;
  } catch (error) {
    // Categorize unexpected errors
    const errorType = categorizeAuthError(error);
    logger.error(`Unexpected error in getSession: ${errorType}`, error);
    
    // Attach the error category and rethrow
    (error as any).type = errorType;
    throw error;
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
    // Always update local state first for better UX
    // Then try to sync with server if online
    if (networkMonitor.isOnline()) {
      const { error } = await withRetry(
        () => supabase.auth.signOut(),
        { maxRetries: 2 }
      );
      
      if (error) {
        logger.error('Error during sign out', error);
        return false;
      }
    } else {
      // If offline, we can only clean up client-side
      logger.debug('Offline sign out - clearing local state only');
      await supabase.auth.signOut({ scope: 'local' });
    }
    
    return true;
  } catch (error) {
    logger.error('Unexpected error during sign out', error);
    
    // Try to clean up locally even if the server request failed
    try {
      await supabase.auth.signOut({ scope: 'local' });
      logger.debug('Fallback to local sign out after error');
    } catch (localError) {
      logger.error('Even local sign out failed', localError);
    }
    
    return false;
  }
};