import { create } from 'zustand';
import { AuthState, User, Session, UserProfile } from '../types/auth.types';
import { authService } from '../services/auth';
import { logger } from '../utils/logger';
import { persist } from 'zustand/middleware';
import { profileService } from '../services/profile.service';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
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
      profile: null,
      isLoading: true,
      error: null,
      
      setUser: (user) => set({ user }),
      
      setSession: (session) => set({ session }),
      
      setProfile: (profile) => set({ profile }),
      
      setIsLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),
      
      login: async (email, password) => {
        set({ isLoading: true, error: null, profile: null });
        try {
          const user = await authService.login({ email, password });
          if (user) {
            const access_token = localStorage.getItem('access_token') || '';
            const refresh_token = localStorage.getItem('refresh_token') || '';
            const expiresAt = Date.now() + (60 * 60 * 1000);
            
            const profile = await profileService.getCurrentUserProfile();

            set({
              user,
              session: {
                access_token,
                refresh_token,
                expiresAt,
              },
              profile,
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
            profile: null,
          });
          return null;
        }
      },
      
      register: async (email, password) => {
        set({ isLoading: true, error: null, profile: null });
        try {
          const user = await authService.register({ email, password });
          if (user) {
            const access_token = localStorage.getItem('access_token') || '';
            const refresh_token = localStorage.getItem('refresh_token') || '';
            const expiresAt = Date.now() + (60 * 60 * 1000);

            const profile = await profileService.getCurrentUserProfile();
            
            set({
              user,
              session: {
                access_token,
                refresh_token,
                expiresAt,
              },
              profile,
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
            profile: null,
          });
          return null;
        }
      },
      
      logout: async () => {
        set({ isLoading: true, error: null }); 
        let logoutError: Error | null = null;

        try {
          await authService.logout(); 
          logger.info('AuthStore: Logout API call successful or did not throw.');
        } catch (error) {
          logoutError = error instanceof Error ? error : new Error('Failed to logout');
          logger.error('Logout error caught in store', { 
            error: logoutError.message
          });
        } finally {
          logger.info('AuthStore: Performing logout cleanup (localStorage and state).');
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          set({
            user: null,
            session: null,
            profile: null,
            isLoading: false, 
            error: logoutError, 
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
            const access_token = localStorage.getItem('access_token') || '';
            const refresh_token = localStorage.getItem('refresh_token') || '';
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
        set({ isLoading: true });
        try {
          logger.info('Initializing auth state');
          const access_token = localStorage.getItem('access_token');
          const refresh_token = localStorage.getItem('refresh_token');
          
          if (!access_token || !refresh_token) {
            logger.info('No tokens found in localStorage');
            set({ user: null, session: null, profile: null, isLoading: false, error: null });
            return;
          }
          
          let currentUser: User | null = null;
          let userProfile: UserProfile | null = null;

          try {
            currentUser = await authService.getCurrentUser();
            if (currentUser) {
              userProfile = await profileService.getCurrentUserProfile();
              logger.info('Current user and profile retrieved successfully');
            }
            
            if (currentUser && !userProfile) {
              logger.warn('getCurrentUser succeeded but getCurrentUserProfile returned null');
            }

          } catch (error) {
            logger.info('Current user/profile fetch failed, trying to refresh session', {
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            
            const success = await get().refreshSession();
            if (success) {
              logger.info('Session refreshed successfully after initial fetch fail');
              currentUser = get().user;
              if (currentUser) {
                 userProfile = await profileService.getCurrentUserProfile();
              }
            } else {
              logger.warn('Session refresh failed during initialization');
              currentUser = null;
              userProfile = null;
              localStorage.removeItem('access_token');
              localStorage.removeItem('refresh_token');
            }
          }

          if (currentUser) {
             const expiresAt = Date.now() + (60 * 60 * 1000);
             set({
                user: currentUser,
                session: { access_token, refresh_token, expiresAt },
                profile: userProfile,
                isLoading: false,
                error: null,
              });
          } else {
             logger.info('Clearing auth state after failed initialization attempts');
             localStorage.removeItem('access_token');
             localStorage.removeItem('refresh_token');
             set({ user: null, session: null, profile: null, isLoading: false, error: null });
          }

        } catch (error) {
          logger.error('Outer error initializing auth state', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          set({
            user: null,
            session: null,
            profile: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to initialize auth state'),
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
          user: state.user, 
          session: state.session, 
          profile: state.profile
      }), 
    }
  )
);