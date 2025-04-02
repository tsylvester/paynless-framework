import { create } from 'zustand';
import { AuthState, User, Session } from '../types/auth.types';
import { authService } from '../services/auth';
import { logger } from '../utils/logger';
import { persist } from 'zustand/middleware';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: Error | null) => void;
  login: (email: string, password: string) => Promise<User | null>;
  register: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isLoading: true,
      error: null,
      
      setUser: (user) => set({ user }),
      
      setSession: (session) => set({ session }),
      
      setIsLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),
      
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const user = await authService.login({ email, password });
          if (user) {
            // Get tokens from localStorage (set by the auth service)
            const access_token = localStorage.getItem('access_token') || '';
            const refresh_token = localStorage.getItem('refresh_token') || '';
            // Calculate expires time based on JWT expiry (default 1 hour)
            const expiresAt = Date.now() + (60 * 60 * 1000);
            
            set({
              user,
              session: {
                access_token,
                refresh_token,
                expiresAt,
              },
              isLoading: false,
              error: null,
            });
          } else {
            set({ isLoading: false });
          }
          return user;
        } catch (error) {
          logger.error('Login error in store', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          set({
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to login'),
          });
          return null;
        }
      },
      
      register: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const user = await authService.register({ email, password });
          if (user) {
            // Get tokens from localStorage (set by the auth service)
            const access_token = localStorage.getItem('access_token') || '';
            const refresh_token = localStorage.getItem('refresh_token') || '';
            // Calculate expires time based on JWT expiry (default 1 hour)
            const expiresAt = Date.now() + (60 * 60 * 1000);
            
            set({
              user,
              session: {
                access_token,
                refresh_token,
                expiresAt,
              },
              isLoading: false,
              error: null,
            });
          } else {
            set({ isLoading: false });
          }
          return user;
        } catch (error) {
          logger.error('Registration error in store', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          set({
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to register'),
          });
          return null;
        }
      },
      
      logout: async () => {
        set({ isLoading: true, error: null });
        try {
          await authService.logout();
          // Clear localStorage
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          set({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          logger.error('Logout error in store', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Still clear data even on error for robustness
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          set({
            user: null,
            session: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to logout'),
          });
        }
      },
      
      resetPassword: async (email) => {
        try {
          return await authService.resetPassword(email);
        } catch (error) {
          logger.error('Password reset error in store', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          return false;
        }
      },
      
      refreshSession: async () => {
        try {
          const refresh_token = localStorage.getItem('refresh_token');
          if (!refresh_token) {
            logger.warn('Cannot refresh session: missing refresh token');
            return false;
          }
          
          const user = await authService.refreshSession(refresh_token);
          if (user) {
            // Get tokens from localStorage (updated by the auth service)
            const access_token = localStorage.getItem('access_token') || '';
            const refresh_token = localStorage.getItem('refresh_token') || '';
            // Calculate expires time based on JWT expiry (default 1 hour)
            const expiresAt = Date.now() + (60 * 60 * 1000);
            
            set({
              user,
              session: {
                access_token,
                refresh_token,
                expiresAt,
              },
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
      },
      
      initialize: async () => {
        try {
          logger.info('Initializing auth state');
          const access_token = localStorage.getItem('access_token');
          const refresh_token = localStorage.getItem('refresh_token');
          
          if (!access_token || !refresh_token) {
            logger.info('No tokens found in localStorage');
            set({ isLoading: false });
            return;
          }
          
          try {
            const user = await authService.getCurrentUser();
            if (user) {
              logger.info('Current user retrieved successfully');
              // Calculate new expiresAt
              const expiresAt = Date.now() + (60 * 60 * 1000);
              
              set({
                user,
                session: {
                  access_token,
                  refresh_token,
                  expiresAt,
                },
                isLoading: false,
                error: null,
              });
              return;
            }
            
            logger.warn('getCurrentUser returned null');
          } catch (error) {
            logger.info('Current user fetch failed, trying to refresh session', {
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            
            const success = await get().refreshSession();
            if (success) {
              logger.info('Session refreshed successfully');
              return;
            }
            
            logger.warn('Session refresh failed');
          }
          
          // If we get here, both getCurrentUser and refreshSession failed
          logger.info('Clearing auth state after failed attempts');
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          set({
            user: null,
            session: null,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          logger.error('Error initializing auth state', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          set({
            user: null,
            session: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to initialize auth state'),
          });
        }
      },
    }),
    {
      name: 'auth-storage', // name for localStorage
      partialize: (state) => ({ user: state.user, session: state.session }), // only store user and session
    }
  )
);