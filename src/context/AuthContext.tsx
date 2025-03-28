// Path: src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
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
  authStatus: 'loading',
  networkStatus: 'unknown',
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState);
  const refreshTimerRef = useRef<number | null>(null);
  
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
      logger.debug('Executing scheduled session refresh');
      try {
        // Directly use Supabase's refresh method
        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
          logger.error('Error refreshing session:', error);
        } else if (data.session) {
          logger.debug('Session refreshed successfully');
          // Update state with new session info
          updateAuthStatus({
            session: data.session as Session,
            user: data.user as User,
          });
          // Schedule the next refresh
          scheduleSessionRefresh(data.session as Session);
        }
      } catch (error) {
        logger.error('Exception during scheduled session refresh', error);
      }
    }, refreshDelay);
  }, [updateAuthStatus]);

  // Initialize auth state and set up listeners
  useEffect(() => {
    // Initial loading state
    updateAuthStatus({ isLoading: true });
    
    // Set up network status monitoring
    const removeNetworkListener = networkMonitor.addListener((status) => {
      // Update network status in state
      updateAuthStatus({ networkStatus: status });
      
      // If reconnecting to the network, check auth state
      if (status === 'online' && state.networkStatus === 'offline') {
        logger.debug('Network reconnected, checking auth state');
        // Directly check the session when network comes back
        supabase.auth.getSession().then(({ data, error }) => {
          if (error) {
            logger.error('Error getting session after network reconnect:', error);
            return;
          }
          
          if (data.session) {
            logger.debug('Valid session found after network reconnect');
            // We have a valid session, update state
            supabase.auth.getUser().then(({ data: userData, error: userError }) => {
              if (userError) {
                logger.error('Error getting user after network reconnect:', userError);
                return;
              }
              
              updateAuthStatus({
                user: userData.user as User,
                session: data.session as Session,
              });
              
              // Schedule refresh for the session
              scheduleSessionRefresh(data.session as Session);
            });
          }
        });
      }
    });
    
    // Immediate session check on component mount
    const checkInitialSession = async () => {
      try {
        logger.debug('Checking initial session');
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          logger.error('Error checking initial session:', error);
          updateAuthStatus({ 
            isLoading: false, 
            error: error as Error,
            user: null,
            session: null
          });
          return;
        }
        
        if (data.session) {
          logger.debug('Initial session found, getting user');
          // We have a session, get the user
          const { data: userData, error: userError } = await supabase.auth.getUser();
          
          if (userError) {
            logger.error('Error getting user from initial session:', userError);
            updateAuthStatus({ 
              isLoading: false, 
              error: userError as Error,
              user: null,
              session: null
            });
            return;
          }
          
          logger.info('User authenticated on initial load');
          updateAuthStatus({
            user: userData.user as User,
            session: data.session as Session,
            isLoading: false,
            error: null,
          });
          
          // Schedule refresh for the session
          scheduleSessionRefresh(data.session as Session);
        } else {
          logger.debug('No initial session found');
          updateAuthStatus({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        logger.error('Unexpected error in initial session check:', error);
        updateAuthStatus({
          isLoading: false,
          error: error as Error,
          user: null,
          session: null
        });
      }
    };
    
    checkInitialSession();
    
    // Set up auth change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state changed:', event);
        
        try {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            // Get fresh user data
            const { data: userData, error: userError } = await supabase.auth.getUser();
            
            if (userError) {
              logger.error(`Error getting user after ${event}:`, userError);
              return;
            }
            
            updateAuthStatus({
              user: userData.user as User,
              session: session as Session,
              isLoading: false,
              error: null,
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
              error: null,
            });
            
            logger.info(`Auth state updated: ${event}`);
            
            // Clear any app-specific storage
            localStorage.removeItem('chatMessages');
            localStorage.removeItem('currentConversationId');
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
  }, [scheduleSessionRefresh, updateAuthStatus, state.networkStatus]);

  const signIn = async (email: string, password: string) => {
    try {
      updateAuthStatus({ isLoading: true, error: null });
      // Check network state first
      if (!networkMonitor.isOnline()) {
        throw new Error('Cannot sign in while offline');
      }

      logger.debug('Attempting sign in for email:', email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error('Sign in error:', error);

        // Format user-friendly error message
        let userMessage = 'Invalid email or password.';
        if (error.message.includes('network') || error.message.includes('fetch')) {
          userMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('not confirmed')) {
          userMessage = 'Please verify your email before signing in.';
        }

        const enhancedError = new Error(userMessage) as AuthError;
        enhancedError.originalError = error;

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
        user: data.user as User,
        session: data.session as Session,
        isLoading: false,
        error: null,
      });

      logger.info('User signed in successfully');
    } catch (error) {
      const enhancedError = error instanceof Error ? error : new Error('Unknown error signing in');
      if (error instanceof Error) {
        if (error.message.includes('offline')) {
          enhancedError.message = 'Cannot sign in while offline. Please check your internet connection.';
        }
      }
      logger.error('Error signing in:', error);
      updateAuthStatus({
        isLoading: false,
        error: enhancedError as AuthError,
      });

      throw enhancedError;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      updateAuthStatus({ isLoading: true, error: null });
      // Check network state first
      if (!networkMonitor.isOnline()) {
        throw new Error('Cannot sign up while offline');
      }

      logger.debug('Attempting sign up for email:', email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        logger.error('Sign up error:', error);

        // Format user-friendly error message
        let userMessage = 'An error occurred during sign up.';
        if (error.message.includes('email')) {
          userMessage = 'This email address is already registered.';
        } else if (error.message.includes('network')) {
          userMessage = 'Network error. Please check your connection and try again.';
        }

        const enhancedError = new Error(userMessage) as AuthError;
        enhancedError.originalError = error;

        updateAuthStatus({
          isLoading: false,
          error: enhancedError,
        });

        throw enhancedError;
      }

      updateAuthStatus({
        user: data.user as User,
        session: data.session as Session,
        isLoading: false,
        error: null,
      });

      logger.info('User signed up successfully');
    } catch (error) {
      const enhancedError = error instanceof Error ? error : new Error('Unknown error signing up');
      if (error instanceof Error) {
        if (error.message.includes('offline')) {
          enhancedError.message = 'Cannot sign up while offline. Please check your internet connection.';
        }
      }
      logger.error('Error signing up:', error);
      updateAuthStatus({
        isLoading: false,
        error: enhancedError as AuthError,
      });
      throw enhancedError;
    }
  };

  const signOut = async () => {
    updateAuthStatus({ isLoading: true, error: null });
    try {
      logger.debug('Signing out user');
      
      // Clear session refresh timer
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      
      // Always perform local sign out to clean up client state
      await supabase.auth.signOut();
      
      // Clear any application-specific storage
      const keysToRemove = [
        'chatMessages',
        'currentConversationId',
        'pendingChatMessage',
        'pendingSystemPrompt',
        'chatNavigationType'
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Update the state immediately for better UX
      updateAuthStatus({
        user: null,
        session: null,
        isLoading: false,
        error: null,
      });

      logger.info('User signed out successfully');
    } catch (error) {
      logger.error('Error signing out:', error);
      // Even if there's an error, we should clear the state
      updateAuthStatus({
        user: null,
        session: null,
        isLoading: false,
        error: error as Error,
      });
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
      logger.debug('Sending password reset email to:', email);
      const { error } = await withRetry(
        () => supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        }),
        { maxRetries: 2 }
      );
      
      if (error) {
        logger.error('Password reset error:', error);
        
        const enhancedError = new Error(
          error.message.includes('network')
            ? 'Network error. Please check your connection and try again.'
            : 'Error sending password reset email. Please try again later.'
        ) as AuthError;
        enhancedError.originalError = error;
        
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
      logger.debug('Updating password');
      const { error } = await withRetry(
        () => supabase.auth.updateUser({
          password,
        }),
        { maxRetries: 2 }
      );

      if (error) {
        logger.error('Update password error:', error);

        const enhancedError = new Error(
          error.message.includes('network')
            ? 'Network error. Please check your connection and try again.'
            : 'Error updating password. Please try again later.'
        ) as AuthError;
        enhancedError.originalError = error;

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
    updateAuthStatus({ isLoading: true });
    
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        logger.error('Error getting session during retry:', error);
        updateAuthStatus({ 
          isLoading: false, 
          error: error as Error,
          user: null,
          session: null
        });
        return;
      }
      
      if (data.session) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          logger.error('Error getting user during retry:', userError);
          updateAuthStatus({ 
            isLoading: false, 
            error: userError as Error,
            user: null,
            session: null
          });
          return;
        }
        
        updateAuthStatus({
          user: userData.user as User,
          session: data.session as Session,
          isLoading: false,
          error: null,
        });
        
        scheduleSessionRefresh(data.session as Session);
      } else {
        updateAuthStatus({
          user: null,
          session: null,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      logger.error('Unexpected error during auth retry:', error);
      updateAuthStatus({
        isLoading: false,
        error: error as Error,
        user: null,
        session: null
      });
    }
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