import { createContext, ReactNode, useEffect, useState } from 'react';
import { AuthState, User } from '../types/auth.types';
import { authService } from '../services/auth';
import { logger } from '../utils/logger';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<User | null>;
  register: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
}

// Create context with default values
export const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  error: null,
  login: async () => null,
  register: async () => null,
  logout: async () => {},
  resetPassword: async () => false,
  refreshSession: async () => false,
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    error: null,
  });
  
  // Function to refresh the session
  const refreshSession = async (): Promise<boolean> => {
    try {
      // Check if we have refresh token in localStorage
      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        logger.warn('Cannot refresh session: missing refresh token');
        return false;
      }

      const user = await authService.refreshSession(refreshToken);
      
      if (user) {
        setState({
          user,
          session: {
            accessToken: localStorage.getItem('accessToken') || '',
            refreshToken: localStorage.getItem('refreshToken') || '',
            expiresAt: 0, // We'd get this from the token if needed
          },
          isLoading: false,
          error: null,
        });
        logger.info('Session refreshed successfully');
        return true;
      }

      logger.warn('Session refresh failed');
      return false;
    } catch (error) {
      logger.error('Failed to refresh session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  };
  
  useEffect(() => {
    const loadUser = async () => {
      try {
        logger.info('Loading auth state');
        
        // Check if we have tokens in localStorage
        const accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken');

        // Log token status
        logger.debug('Token status:', { 
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          accessTokenLength: accessToken?.length,
          refreshTokenLength: refreshToken?.length
        });

        // If no tokens, set not loading and return
        if (!accessToken || !refreshToken) {
          logger.info('No tokens found in localStorage');
          setState({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
          return;
        }

        // Try to get current user using the tokens
        try {
          logger.info('Attempting to get current user');
          const user = await authService.getCurrentUser();
          
          if (user) {
            logger.info('Current user retrieved successfully');
            setState({
              user,
              session: {
                accessToken,
                refreshToken,
                expiresAt: 0,
              },
              isLoading: false,
              error: null,
            });
            return;
          }
          
          logger.warn('getCurrentUser returned null');
        } catch (error) {
          // If getting current user fails, try to refresh the session
          logger.info('Current user fetch failed, trying to refresh session', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          
          const success = await refreshSession();
          
          if (success) {
            logger.info('Session refreshed successfully');
            return;
          }
          
          logger.warn('Session refresh failed');
        }
        
        // If we get here, both getCurrentUser and refreshSession failed
        // Clear tokens and set user to null
        logger.info('Clearing auth state after failed attempts');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        setState({
          user: null,
          session: null,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        logger.error('Failed to load auth state', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        // Clear tokens on error
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        setState({
          user: null,
          session: null,
          isLoading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };
    
    loadUser();
  }, []);
  
  const login = async (email: string, password: string): Promise<User | null> => {
    setState({ ...state, isLoading: true, error: null });
    
    try {
      const user = await authService.login({ email, password });
      
      setState({
        user,
        session: user ? {
          accessToken: localStorage.getItem('accessToken') || '',
          refreshToken: localStorage.getItem('refreshToken') || '',
          expiresAt: 0,
        } : null,
        isLoading: false,
        error: null,
      });
      
      return user;
    } catch (error) {
      logger.error('Login error in context', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      setState({
        ...state,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to login'),
      });
      
      return null;
    }
  };
  
  const register = async (email: string, password: string): Promise<User | null> => {
    setState({ ...state, isLoading: true, error: null });
    
    try {
      const user = await authService.register({
        email,
        password,
      });
      
      setState({
        user,
        session: user ? {
          accessToken: localStorage.getItem('accessToken') || '',
          refreshToken: localStorage.getItem('refreshToken') || '',
          expiresAt: 0,
        } : null,
        isLoading: false,
        error: null,
      });
      
      return user;
    } catch (error) {
      logger.error('Registration error in context', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      setState({
        ...state,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to register'),
      });
      
      return null;
    }
  };
  
  const logout = async (): Promise<void> => {
    setState({ ...state, isLoading: true, error: null });
    
    try {
      await authService.logout();
      
      // Clear tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      
      setState({
        user: null,
        session: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      logger.error('Logout error in context', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      setState({
        ...state,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to logout'),
      });
    }
  };
  
  const resetPassword = async (email: string): Promise<boolean> => {
    try {
      return await authService.resetPassword(email);
    } catch (error) {
      logger.error('Password reset error in context', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  };
  
  const contextValue = {
    ...state,
    login,
    register,
    logout,
    resetPassword,
    refreshSession,
  };
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}