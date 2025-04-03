import { create } from 'zustand';
import { AuthStore as AuthStoreType, AuthResponse, ProfileResponse } from '../types/auth.types';
import { logger } from '../utils/logger';
import { persist } from 'zustand/middleware';
import { api } from '../api/apiClient';

export const useAuthStore = create<AuthStoreType>()(
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
        set({ isLoading: true, error: null });
        try {
          const result = await api.post<AuthResponse>('login', { email, password }, { isPublic: true });
          
          set({
            user: result.user,
            session: result.session,
            profile: result.profile,
            isLoading: false,
            error: null,
          });
          return result.user;
        } catch (error) {
          logger.error('Login error in store', {
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          set({
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to login'),
            user: null, session: null, profile: null
          });
          return null;
        }
      },
      
      register: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const result = await api.post<AuthResponse>('register', { email, password }, { isPublic: true });
          
          set({
            user: result.user,
            session: result.session,
            profile: result.profile,
            isLoading: false,
            error: null,
          });
          return result.user;
        } catch (error) {
          logger.error('Registration error in store', {
             message: error instanceof Error ? error.message : 'Unknown error',
          });
          set({
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to register'),
             user: null, session: null, profile: null
          });
          return null;
        }
      },
      
      logout: async () => {
        set({ isLoading: true, error: null }); 
        try {
          await api.post('logout', {}); 
          logger.info('AuthStore: Logout API call successful.');
        } catch (error) {
          logger.error('Logout error caught in store', { 
             message: error instanceof Error ? error.message : 'Unknown error' 
          });
        } finally {
          logger.info('AuthStore: Clearing state after logout attempt.');
          set({
            user: null,
            session: null,
            profile: null,
            isLoading: false, 
            error: null,
          });
        }
      },
      
      initialize: async () => {
        logger.info('Initializing auth state from persisted data...');
        const session = get().session;

        if (session?.access_token) {
          logger.info('Verifying token / fetching initial profile...');
          try {
            const result = await api.get<ProfileResponse>('profile'); 
            logger.info('Initialize: Profile fetch result:', { result });

            if (result?.user && result?.profile) { 
              logger.info('Initialize: Got user and profile data. Setting state.');
              set({
                user: result.user,
                profile: result.profile,
                isLoading: false,
                error: null
              });
            } else {
               logger.warn('Initialize: Profile fetch incomplete/invalid data.', {result});
               set({ user: null, profile: null, session: null, isLoading: false, error: new Error('Profile fetch failed during init (invalid data)') });
            }
          } catch(e) {
            logger.error('Initialize: Error during profile fetch.', {e});
            set({ user: null, profile: null, session: null, isLoading: false, error: e instanceof Error ? e : new Error('Initialization failed') });
          }
        } else {
          logger.info('No persisted session token found.');
          set({ user: null, profile: null, session: null, isLoading: false, error: null });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ session: state.session }),
    }
  )
);