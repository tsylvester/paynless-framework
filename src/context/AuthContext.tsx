// Path: src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase, getUser, getSession, refreshSession, safeSignOut, categorizeAuthError } from '../services/supabase';
import { AuthErrorType } from '../types/auth.types';
import { AuthContextType, AuthState, AuthError, User, Session } from '../types/auth.types';
import { logger } from '../utils/logger';
import { networkMonitor } from '../utils/network';
import { withRetry } from '../utils/retry';

const initialState: AuthState = {
  user: null,
  session: null,
  isLoading: true,
  error: null,
  authStatus: 'unauthenticated',
  networkStatus: 'unknown',
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState);
  const refreshTimerRef = useRef<number | null>(null);
  const initializingRef = useRef<boolean>(false);
  const safeInitializeRef = useRef<(() => Promise<void>) | null>(null);
  
  // Track auth status changes
  const updateAuthStatus = useCallback((newState: Partial<AuthState>) => {
    setState(prev => {
      // Determine the auth status based on user, session, and loading
      let authStatus = prev.authStatus;
      
      if (newState.isLoading) {
        authStatus = 'loading';
      } else if (newState.user && newState.session) {
        authStatus = 'authenticated';
      } else {
        authStatus = 'unauthenticated';
      }
      
      return { ...prev, ...newState, authStatus };
    });
  }, []);
  
  // Function to schedule session refresh before expiry
  const scheduleSessionRefresh = useCallback((session: Session) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    
    if (!session?.expires_at) return;
    
    // Calculate time until session expiry (in milliseconds)
    const expiresAt = session.expires_at * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    
    // Refresh 5 minutes before expiry, or immediately if already expired
    const refreshDelay = Math.max(0, timeUntilExpiry - 5 * 60 * 1000);
    
    logger.debug(`Scheduling session refresh in ${Math.floor(refreshDelay / 1000)} seconds`);
    
    refreshTimerRef.current = window.setTimeout(async () => {
      logger.debug('Attempting session refresh');
      try {
        const success = await refreshSession();
        if (!success && safeInitializeRef.current) {
          // If refresh fails, try to re-initialize auth
          logger.debug('Session refresh failed, reinitializing auth');
          await safeInitializeRef.current();
        }
      } catch (error) {
        logger.error('Error during scheduled session refresh', error);
      }
    }, refreshDelay);
  }, []);
  
  // Safe initialize function that prevents duplicate initialization
  const safeInitialize = useCallback(async () => {
    // Prevent multiple simultaneous initializations
    if (initializingRef.current) {
      logger.debug('Auth initialization already in progress, skipping duplicate request');
      return;
    }
    
    initializingRef.current = true;
    updateAuthStatus({ isLoading: true, error: null });
    
    try {
      // Get current network status first
      const isOnline = networkMonitor.isOnline();
      const networkStatus = isOnline ? 'online' : 'offline';
      
      logger.debug(`Auth initializing with network status: ${networkStatus}`);
      updateAuthStatus({ networkStatus });
      
      // First, try to get the session from Supabase - this should use the
      // persisted session in localStorage if available
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        logger.error('Error getting session:', sessionError);
      } else if (sessionData.session) {
        logger.info('Found existing session');
        
        // Get the user data based on the session
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          logger.error('Error getting user from session:', userError);
        } else if (userData.user) {
          // We have both a valid session and a user - update state
          updateAuthStatus({
            user: userData.user as User | null,
            session: sessionData.session as Session | null,
            isLoading: false,
            authStatus: 'authenticated',
          });
          
          // Set up session refresh
          scheduleSessionRefresh(sessionData.session as Session);
          
          initializingRef.current = false;
          return;
        }
      }
      
      // If we reach here, either there was no session or it wasn't valid
      // Continue with normal initialization
      if (!isOnline) {
        logger.debug('Network offline during auth initialization - using cached data if available');
        // Even offline, we can still check for local session data
        try {
          const localSession = await supabase.auth.getSession();
          if (localSession.data.session) {
            logger.info('Retrieved cached session while offline');
            updateAuthStatus({
              session: localSession.data.session as Session | null,
              isLoading: false,
              authStatus: 'authenticated',
            });
            initializingRef.current = false;
            return;
          }
        } catch {
          logger.debug('No cached session available while offline');
        }
        
        updateAuthStatus({ isLoading: false, authStatus: 'unauthenticated' });
        initializingRef.current = false;
        return;
      }
      
      // Standard online initialization
      // Attempt to get both user and session
      const [user, session] = await Promise.all([getUser(), getSession()]);
      
      // It's normal to not have a user or session when first loading the app
      updateAuthStatus({
        user: user as User | null,
        session: session as Session | null,
        isLoading: false,
      });
      
      if (user && session) {
        logger.info('Auth initialized successfully with active session');
        
        // Set up session refresh
        scheduleSessionRefresh(session as Session);
      } else {
        logger.debug('Auth initialized with no active session');
      }
    } catch (error) {
      const errorType = categorizeAuthError(error);
      logger.error(`Error initializing auth: ${errorType}`, error);
      
      // Different handling based on error type
      if (errorType === AuthErrorType.NETWORK_ERROR) {
        updateAuthStatus({
          isLoading: false,
          error: new Error('Network connection error. Please check your internet connection.'),
          networkStatus: 'offline',
        });
      } else if (errorType === AuthErrorType.SERVER_ERROR) {
        updateAuthStatus({
          isLoading: false,
          error: new Error('Authentication service unavailable. Please try again later.'),
        });
      } else {
        // Capture the error but still allow the app to function
        updateAuthStatus({
          user: null,
          session: null,
          isLoading: false,
          error: error as Error,
        });
      }
    } finally {
      initializingRef.current = false;
    }
  }, [updateAuthStatus, scheduleSessionRefresh]);
  
  // Store safeInitialize in ref
  useEffect(() => {
    safeInitializeRef.current = safeInitialize;
  }, [safeInitialize]);
  
  // Initialize auth state
  useEffect(() => {
    // Add checkPersistedSession call at the beginning
    const checkPersistedSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          logger.debug('Found persisted session');
          // Update auth state with the persisted session
          updateAuthStatus({
            user: data.session.user as User | null,
            session: data.session as Session | null,
            isLoading: false,
          });
          
          // Schedule session refresh
          if (data.session) {
            scheduleSessionRefresh(data.session as Session);
          }
        }
      } catch (error) {
        logger.error('Error checking persisted session:', error);
      }
    };
    
    // Run persistence check first
    checkPersistedSession();
    
    // Then proceed with normal initialization
    safeInitialize();
    
    // Set up network status monitoring
    const removeNetworkListener = networkMonitor.addListener((status) => {
      // Update network status in state
      updateAuthStatus({ networkStatus: status });
      
      // If going from offline to online, re-initialize auth to sync with server
      if (status === 'online' && state.networkStatus === 'offline') {
        logger.debug('Network reconnected, reinitializing auth state');
        safeInitialize();
      }
    });
    
    // Set up auth change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state changed:', event);
        
        try {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            // Get fresh user data
            const user = await getUser();
            
            updateAuthStatus({
              user: user as User | null,
              session: session as Session | null,
              isLoading: false,
            });
            
            // Update session refresh timer
            if (session) {
              scheduleSessionRefresh(session as Session);
            }
            
            logger.info(`Auth state updated: ${event}`);
          } else if (event === 'SIGNED_OUT') {
            // Clear session refresh timer
            if (refreshTimerRef.current) {
              window.clearTimeout(refreshTimerRef.current);
              refreshTimerRef.current = null;
            }
            
            updateAuthStatus({
              user: null,
              session: null,
              isLoading: false,
            });
            
            logger.info(`Auth state updated: ${event}`);
          }
        } catch (error) {
          logger.error(`Error handling auth state change (${event}):`, error);
          
          // Update state with the error, but keep any existing user/session
          updateAuthStatus({
            isLoading: false,
            error: error as Error,
          });
        }
      }
    );

    // Cleanup function
    return () => {
      subscription.unsubscribe();
      removeNetworkListener();
      
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [safeInitialize, updateAuthStatus, scheduleSessionRefresh, state.networkStatus]);

  const signIn = async (email: string, password: string) => {
    updateAuthStatus({ isLoading: true, error: null });
    
    // Check network state first
    if (!networkMonitor.isOnline()) {
      updateAuthStatus({
        isLoading: false,
        error: new Error('Cannot sign in while offline. Please check your internet connection.'),
      });
      throw new Error('Cannot sign in while offline');
    }
    
    try {
      // Use retry logic for network operations
      const { data, error } = await withRetry(
        () => supabase.auth.signInWithPassword({
          email,
          password,
        }),
        {
          maxRetries: 2,
          initialDelay: 500,
          onRetry: (attempt) => {
            logger.debug(`Retrying sign in, attempt ${attempt}`);
          }
        }
      );
      
      if (error) {
        const errorType = categorizeAuthError(error);
        logger.error(`Sign in error: ${errorType}`, error);
        
        // Format user-friendly error message based on error type
        let userMessage = 'An error occurred during sign in.';
        
        if (errorType === AuthErrorType.INVALID_CREDENTIALS) {
          userMessage = 'Invalid email or password.';
        } else if (errorType === AuthErrorType.NETWORK_ERROR) {
          userMessage = 'Network error. Please check your connection and try again.';
        } else if (errorType === AuthErrorType.SERVER_ERROR) {
          userMessage = 'Authentication service is temporarily unavailable. Please try again later.';
        }
        
        const enhancedError = new Error(userMessage) as AuthError;
        enhancedError.originalError = error;
        enhancedError.type = errorType;
        
        updateAuthStatus({
          isLoading: false,
          error: enhancedError,
        });
        
        throw enhancedError;
      }
      
      // Schedule session refresh if we have a valid session
      if (data.session) {
        scheduleSessionRefresh(data.session as Session);
      }
      
      updateAuthStatus({
        user: data.user as User | null,
        session: data.session as Session | null,
        isLoading: false,
        error: null,
      });
      
      logger.info('User signed in successfully');
    } catch (error) {
      // This catch handles unexpected errors not caught by the Supabase response
      const errorType = categorizeAuthError(error);
      logger.error(`Unexpected error signing in: ${errorType}`, error);
      
      updateAuthStatus({
        isLoading: false,
        error: error as AuthError,
      });
      
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    updateAuthStatus({ isLoading: true, error: null });
    
    // Check network state first
    if (!networkMonitor.isOnline()) {
      updateAuthStatus({
        isLoading: false,
        error: new Error('Cannot sign up while offline. Please check your internet connection.'),
      });
      throw new Error('Cannot sign up while offline');
    }
    
    try {
      const { data, error } = await withRetry(
        () => supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        }),
        { maxRetries: 2 }
      );
      
      if (error) {
        const errorType = categorizeAuthError(error);
        logger.error(`Sign up error: ${errorType}`, error);
        
        // Format user-friendly error message
        let userMessage = 'An error occurred during sign up.';
        
        if (error.message.includes('email')) {
          userMessage = 'This email address is already registered.';
        } else if (errorType === AuthErrorType.NETWORK_ERROR) {
          userMessage = 'Network error. Please check your connection and try again.';
        } else if (errorType === AuthErrorType.SERVER_ERROR) {
          userMessage = 'Registration service is temporarily unavailable. Please try again later.';
        }
        
        const enhancedError = new Error(userMessage) as AuthError;
        enhancedError.originalError = error;
        enhancedError.type = errorType;
        
        updateAuthStatus({
          isLoading: false,
          error: enhancedError,
        });
        
        throw enhancedError;
      }
      
      updateAuthStatus({
        user: data.user as User | null,
        session: data.session as Session | null,
        isLoading: false,
        error: null,
      });
      
      logger.info('User signed up successfully');
    } catch (error) {
      logger.error('Error signing up:', error);
      
      updateAuthStatus({
        isLoading: false,
        error: error as AuthError,
      });
      
      throw error;
    }
  };

  const signOut = async () => {
    updateAuthStatus({ isLoading: true, error: null });
    
    try {
      // Use the safe sign out function that handles offline state
      const success = await safeSignOut();
      
      if (!success) {
        // If server-side sign out failed but we're offline, we still want to update local state
        if (!networkMonitor.isOnline()) {
          logger.debug('Offline sign out - updating local state only');
          updateAuthStatus({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
          return;
        }
        
        throw new Error('Unable to complete sign out process');
      }
      
      // Clear session refresh timer
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      
      updateAuthStatus({
        user: null,
        session: null,
        isLoading: false,
        error: null,
      });
      
      logger.info('User signed out successfully');
    } catch (error) {
      logger.error('Error signing out:', error);
      
      // Even if there's an error, we should update the local state
      // This prevents the user from getting "stuck" in a signed-in state
      updateAuthStatus({
        user: null,
        session: null,
        isLoading: false,
        error: error as AuthError,
      });
      
      // We don't rethrow here because we've already cleaned up local state,
      // so from the user's perspective they are signed out
    }
  };

  const resetPassword = async (email: string) => {
    updateAuthStatus({ isLoading: true, error: null });
    
    if (!networkMonitor.isOnline()) {
      updateAuthStatus({
        isLoading: false,
        error: new Error('Cannot reset password while offline. Please check your internet connection.'),
      });
      throw new Error('Cannot reset password while offline');
    }
    
    try {
      const { error } = await withRetry(
        () => supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        }),
        { maxRetries: 2 }
      );
      
      if (error) {
        const errorType = categorizeAuthError(error);
        logger.error(`Password reset error: ${errorType}`, error);
        
        const enhancedError = new Error(
          errorType === AuthErrorType.NETWORK_ERROR
            ? 'Network error. Please check your connection and try again.'
            : 'Error sending password reset email. Please try again later.'
        ) as AuthError;
        enhancedError.originalError = error;
        enhancedError.type = errorType;
        
        updateAuthStatus({
          isLoading: false,
          error: enhancedError,
        });
        
        throw enhancedError;
      }
      
      updateAuthStatus({
        isLoading: false,
        error: null,
      });
      
      logger.info('Password reset email sent successfully');
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      
      updateAuthStatus({
        isLoading: false,
        error: error as AuthError,
      });
      
      throw error;
    }
  };

  const updatePassword = async (password: string) => {
    updateAuthStatus({ isLoading: true, error: null });
    
    if (!networkMonitor.isOnline()) {
      updateAuthStatus({
        isLoading: false,
        error: new Error('Cannot update password while offline. Please check your internet connection.'),
      });
      throw new Error('Cannot update password while offline');
    }
    
    try {
      const { error } = await withRetry(
        () => supabase.auth.updateUser({
          password,
        }),
        { maxRetries: 2 }
      );
      
      if (error) {
        const errorType = categorizeAuthError(error);
        logger.error(`Update password error: ${errorType}`, error);
        
        const enhancedError = new Error(
          errorType === AuthErrorType.NETWORK_ERROR
            ? 'Network error. Please check your connection and try again.'
            : 'Error updating password. Please try again later.'
        ) as AuthError;
        enhancedError.originalError = error;
        enhancedError.type = errorType;
        
        updateAuthStatus({
          isLoading: false,
          error: enhancedError,
        });
        
        throw enhancedError;
      }
      
      updateAuthStatus({
        isLoading: false,
        error: null,
      });
      
      logger.info('Password updated successfully');
    } catch (error) {
      logger.error('Error updating password:', error);
      
      updateAuthStatus({
        isLoading: false,
        error: error as AuthError,
      });
      
      throw error;
    }
  };

  // Expose a method to retry authentication
  const retryAuth = async () => {
    logger.debug('Manually retrying authentication');
    return safeInitialize();
  };

  const value = {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    retryAuth,
    isOnline: networkMonitor.isOnline(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};