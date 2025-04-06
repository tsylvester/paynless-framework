import { create } from 'zustand';
import { AuthStore as AuthStoreType, AuthResponse, ProfileResponse, User, Session, UserProfile, UserProfileUpdate } from '@paynless/types';
import { logger } from '@paynless/utils';
import { persist } from 'zustand/middleware';
import { api } from '@paynless/api-client';

// Define the structure of the response from the refresh endpoint
// Updated to include user and profile, matching the backend
interface RefreshResponse {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
}

export const useAuthStore = create<AuthStoreType>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true,
      error: null,
      
      setUser: (user: User | null) => set({ user }),
      
      setSession: (session: Session | null) => set({ session }),
      
      setProfile: (profile: UserProfile | null) => set({ profile }),
      
      setIsLoading: (isLoading: boolean) => set({ isLoading }),
      
      setError: (error: Error | null) => set({ error }),
      
      login: async (email: string, password: string): Promise<User | null> => {
        set({ isLoading: true, error: null });
        try {
          const result = await api.post<AuthResponse>('/login', { email, password });
          
          set({
            user: result.user,
            session: result.session,
            profile: result.profile,
            isLoading: false,
            error: null,
          });
          return result.user ?? null;
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
      
      register: async (email: string, password: string): Promise<User | null> => {
        set({ isLoading: true, error: null });
        try {
          const result = await api.post<AuthResponse>('/register', { email, password });
          
          set({
            user: result.user,
            session: result.session,
            profile: null,
            isLoading: false,
            error: null,
          });
          return result.user ?? null;
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
          await api.post('/logout', {}); 
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
      
      refreshSession: async () => {
        const currentSession = get().session;
        if (!currentSession?.refresh_token) {
          logger.error('Refresh session: No refresh token found.');
          return;
        }

        try {
          const result = await api.post<RefreshResponse>('refresh', 
            {}, // Empty body
            { 
              headers: { 
                'Authorization': `Bearer ${currentSession.refresh_token}` 
              } 
            }
          );

          if (result?.session && result?.user && result?.profile) {
            logger.info('Session refreshed successfully.');
            set({
              session: result.session,
              user: result.user,
              profile: result.profile,
              isLoading: false,
              error: null
            });
          } else {
            logger.error('Refresh session: Invalid response from backend.');
            set({
              session: null,
              user: null,
              profile: null,
              isLoading: false,
              error: new Error('Failed to refresh session')
            });
          }
        } catch (error) {
          logger.error('Refresh session: Error during refresh attempt.', {
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          set({
            session: null,
            user: null,
            profile: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to refresh session')
          });
        }
      },
      
      updateProfile: async (profileData: UserProfileUpdate): Promise<boolean> => {
        const currentProfile = get().profile;
        const token = get().session?.access_token;
        if (!currentProfile) {
            logger.error('updateProfile: Cannot update profile, no current profile loaded.');
            set({ error: new Error('Cannot update profile: Not loaded') });
            return false;
        }
        if (!token) {
            logger.error('updateProfile: Cannot update profile, user not authenticated.');
            set({ error: new Error('Cannot update profile: Not authenticated') });
            return false;
        }
        
        set({ isLoading: true, error: null });
        try {
            // Assume your API endpoint for updating profile is 'profile' with PUT/PATCH
            const updatedProfile = await api.put<UserProfile>('profile', profileData, { token });

            // Update the local store state with the response from the backend
            set({
                profile: updatedProfile, 
                isLoading: false, 
                error: null 
            });
            logger.info('Profile updated successfully.');
            return true;
        } catch (error) {
            logger.error('updateProfile error in store', {
                message: error instanceof Error ? error.message : 'Unknown error',
            });
            set({
                isLoading: false,
                error: error instanceof Error ? error : new Error('Failed to update profile'),
            });
            return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ session: state.session }),
    }
  )
);