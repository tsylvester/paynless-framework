// Path: src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { AuthContextType, AuthState, User, Session } from '../types/auth.types';
import { logger } from '../utils/logger';

// Initial state with clear defaults
const initialState: AuthState = {
  user: null,
  session: null,
  isLoading: true,
  error: null,
  authStatus: 'loading',
  networkStatus: navigator.onLine ? 'online' : 'offline',
};

// Create context with default value
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState);

  // Simple state updater
  const updateState = (newState: Partial<AuthState>) => {
    setState(prev => {
      const authStatus = newState.isLoading 
        ? 'loading' 
        : (newState.user || prev.user) ? 'authenticated' : 'unauthenticated';
      
      return { ...prev, ...newState, authStatus };
    });
  };

  // Set up auth state listener on mount
  useEffect(() => {
    logger.debug('Setting up auth state');
    updateState({ isLoading: true });

    // Track online/offline status
    const handleNetworkChange = () => {
      updateState({ networkStatus: navigator.onLine ? 'online' : 'offline' });
    };
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    // First, get the initial session (this checks localStorage)
    const getInitialSession = async () => {
      try {
        logger.debug('Getting initial session');
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          logger.error('Error getting initial session:', error);
          updateState({ 
            isLoading: false, 
            error: error as Error,
            user: null,
            session: null
          });
          return;
        }
        
        if (data.session) {
          logger.debug('Initial session found');
          updateState({
            user: data.session.user as User,
            session: data.session as Session,
            isLoading: false,
            error: null,
          });
        } else {
          logger.debug('No initial session found');
          updateState({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        logger.error('Unexpected error getting initial session:', error);
        updateState({
          isLoading: false,
          error: error as Error,
        });
      }
    };
    
    getInitialSession();

    // Set up the auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        logger.debug('Auth state changed:', event);
        
        if (session) {
          updateState({
            user: session.user as User,
            session: session as Session,
            isLoading: false,
            error: null,
          });
        } else {
          updateState({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
        }
      }
    );

    // Clean up on unmount
    return () => {
      logger.debug('Cleaning up auth listeners');
      subscription.unsubscribe();
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    };
  }, []);

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    updateState({ isLoading: true, error: null });
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error('Sign in error:', error);
        updateState({
          isLoading: false,
          error: error as Error,
        });
        throw error;
      }

      updateState({
        user: data.user as User,
        session: data.session as Session,
        isLoading: false,
        error: null,
      });

      logger.info('User signed in successfully');
    } catch (error) {
      logger.error('Error signing in:', error);
      updateState({
        isLoading: false,
        error: error as Error,
      });
      throw error;
    }
  };

  // Sign up with email and password
  const signUp = async (email: string, password: string) => {
    updateState({ isLoading: true, error: null });
    
    try {
      // Store the current location before redirecting
      const currentPath = window.location.pathname;
      localStorage.setItem('authRedirectPath', currentPath);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        logger.error('Sign up error:', error);
        updateState({
          isLoading: false,
          error: error as Error,
        });
        throw error;
      }

      updateState({
        user: data.user as User,
        session: data.session as Session,
        isLoading: false,
        error: null,
      });

      logger.info('User signed up successfully');
    } catch (error) {
      logger.error('Error signing up:', error);
      updateState({
        isLoading: false,
        error: error as Error,
      });
      throw error;
    }
  };

  // Sign out
  const signOut = async () => {
    updateState({ isLoading: true, error: null });
    
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        logger.error('Error signing out:', error);
      }
      
      // Always clear state regardless of API errors
      updateState({
        user: null,
        session: null,
        isLoading: false,
        error: null,
      });
      
      // Clear any app-specific items
      const appKeys = [
        'chatMessages',
        'currentConversationId',
        'pendingChatMessage',
        'pendingSystemPrompt',
        'chatNavigationType'
      ];
      
      appKeys.forEach(key => {
        localStorage.removeItem(key);
      });
      
      logger.info('User signed out successfully');
    } catch (error) {
      logger.error('Error signing out:', error);
      
      // Still update state to signed out
      updateState({
        user: null,
        session: null,
        isLoading: false,
        error: error as Error,
      });
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    updateState({ isLoading: true, error: null });
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      
      if (error) {
        logger.error('Reset password error:', error);
        updateState({
          isLoading: false,
          error: error as Error,
        });
        throw error;
      }
      
      updateState({
        isLoading: false,
        error: null,
      });
      
      logger.info('Password reset email sent successfully');
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      updateState({
        isLoading: false,
        error: error as Error,
      });
      throw error;
    }
  };

  // Update password
  const updatePassword = async (password: string) => {
    updateState({ isLoading: true, error: null });
    
    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });
      
      if (error) {
        logger.error('Update password error:', error);
        updateState({
          isLoading: false,
          error: error as Error,
        });
        throw error;
      }
      
      updateState({
        isLoading: false,
        error: null,
      });
      
      logger.info('Password updated successfully');
    } catch (error) {
      logger.error('Error updating password:', error);
      updateState({
        isLoading: false,
        error: error as Error,
      });
      throw error;
    }
  };

  // Retry auth method
  const retryAuth = async () => {
    logger.debug('Manually retrying authentication');
    updateState({ isLoading: true });
    
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        logger.error('Error getting session during retry:', error);
        updateState({ 
          isLoading: false, 
          error: error as Error,
        });
        return;
      }
      
      if (data.session) {
        updateState({
          user: data.session.user as User,
          session: data.session as Session,
          isLoading: false,
          error: null,
        });
      } else {
        updateState({
          user: null,
          session: null,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      logger.error('Unexpected error during auth retry:', error);
      updateState({
        isLoading: false,
        error: error as Error,
      });
    }
  };

  // Create the auth context value
  const value: AuthContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    retryAuth,
    isOnline: navigator.onLine,
  };

  // Provide the auth context to children
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};