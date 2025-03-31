import { createContext, ReactNode, useEffect, useState } from 'react';
import { AuthState, User } from '../types/auth.types';
import { authService } from '../services/auth.service';
import { logger } from '../utils/logger';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<User | null>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<User | null>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
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
  
  useEffect(() => {
    const loadUser = async () => {
      try {
        const accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken');

        // Only try to load user if we have tokens
        if (!accessToken || !refreshToken) {
          setState({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
          return;
        }

        const user = await authService.getCurrentUser();
        
        setState({
          user,
          session: user ? {
            accessToken,
            refreshToken,
            expiresAt: 0, // We'd get this from the token if needed
          } : null,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        logger.error('Failed to load auth state', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
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
          expiresAt: 0, // We'd get this from the token if needed
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
  
  const register = async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<User | null> => {
    setState({ ...state, isLoading: true, error: null });
    
    try {
      const user = await authService.register({
        email,
        password,
        firstName,
        lastName,
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
  };
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}