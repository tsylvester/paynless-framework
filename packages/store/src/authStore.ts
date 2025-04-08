import { create } from 'zustand';
import { AuthStore as AuthStoreType, AuthResponse, User, Session, UserProfile, UserProfileUpdate } from '@paynless/types';
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

// Placeholder navigate function type until AuthStoreType is updated
type NavigateFunction = (path: string) => void;

export const useAuthStore = create<AuthStoreType>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true, // Start true until initialize runs
      error: null,
      navigate: null as NavigateFunction | null, // Added for navigation

      // Action to inject the navigate function from the app
      setNavigate: (navigateFn: NavigateFunction) => set({ navigate: navigateFn }),

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

          // Navigate on success
          const navigate = get().navigate;
          if (navigate) {
            logger.info('Login successful, navigating to dashboard.');
            navigate('/dashboard'); // Or appropriate success route
          } else {
            logger.warn('Login successful but navigate function not set in store.');
          }

          return result.user ?? null;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown login error';
          logger.error('Login error in store', { message: errorMessage });
          set({
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to login'),
            user: null, session: null, profile: null
          });
          // Do NOT re-throw error
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
            profile: null, // Profile usually created by trigger or needs separate fetch/creation
            isLoading: false,
            error: null,
          });

          // Navigate on success
          const navigate = get().navigate;
          if (navigate) {
             logger.info('Registration successful, navigating to dashboard.');
             navigate('/dashboard'); // Or '/profile/edit' or other onboarding step
          } else {
             logger.warn('Registration successful but navigate function not set in store.');
          }

          return result.user ?? null;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown registration error';
          logger.error('Registration error in store', { message: errorMessage });
          set({
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to register'),
             user: null, session: null, profile: null
          });
          // Do NOT re-throw error
          return null;
        }
      },
      
      logout: async () => {
        set({ isLoading: true, error: null }); 
        const token = get().session?.access_token;

        if (!token) {
          // If there's no token, we can't really call the backend logout.
          // Just clear local state.
          logger.warn('Logout called but no session token found. Clearing local state only.');
          set({
            user: null,
            session: null,
            profile: null,
            isLoading: false, 
            error: null,
          });
          return; // Exit early
        }

        try {
          // Pass the token in options
          await api.post('/logout', {}, { token }); 
          logger.info('AuthStore: Logout API call successful.');
        } catch (error) {
          logger.error('Logout error caught in store', { 
             message: error instanceof Error ? error.message : 'Unknown error' 
          });
          // Even if API fails, clear local state as the user intent is to logout
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
        set({ isLoading: true }); // Ensure loading is true at start
        const session = get().session;

        if (session?.access_token) {
          logger.info('Verifying token / fetching initial profile...');
          try {
            const result = await api.get<AuthResponse>('me', { token: session.access_token });
            logger.info('Initialize: /me call result:', { result });

            // Refined Logic: If user data is present, update state, profile might be null
            if (result?.user) {
              logger.info('Initialize: User data found. Updating state.');
              set((currentState) => ({ // Use function form to access current session
                user: result.user,
                profile: result.profile, // Will be null if API returned null
                session: currentState.session, // Preserve existing session
                isLoading: false,
                error: null
              }));
            } else {
              // API succeeded but returned no user data - invalid state
              logger.error('Initialize: /me call succeeded but returned no user data.');
              set({
                user: null, profile: null, session: null,
                isLoading: false,
                error: new Error('Initialization failed: Invalid user data received')
              });
            }
          } catch(e) {
            // API call itself failed
            logger.error('Initialize: Error during /me API call.', {e});
            set({ 
              user: null, profile: null, session: null, 
              isLoading: false, 
              error: e instanceof Error ? e : new Error('Initialization failed (API error)') 
            });
          }
        } else {
          // No initial session token found
          logger.info('No persisted session token found.');
          set({ user: null, profile: null, session: null, isLoading: false, error: null });
        }
      },
      
      refreshSession: async () => {
        const currentSession = get().session;
        if (!currentSession?.refresh_token) {
          logger.warn('refreshSession called without a refresh token.');
          set({ error: new Error('No refresh token available to refresh session.') });
          set({ isLoading: false }); // Ensure loading is set to false
          return;
        }

        set({ isLoading: true, error: null }); // Set loading state
        try {
          const result = await api.post<RefreshResponse>('refresh', 
            {}, // Empty body
            { 
              headers: { 
                'Authorization': `Bearer ${currentSession.refresh_token}` 
              },
              isPublic: true // Refresh might be considered public from client perspective? Check API setup. If not, remove.
                           // Or maybe it needs the *refresh* token passed differently?
                           // Let's assume Authorization header is correct for now.
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
              session: null, user: null, profile: null,
              isLoading: false,
              error: new Error('Failed to refresh session (invalid response)')
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown refresh error';
          logger.error('Refresh session: Error during refresh attempt.', { message: errorMessage });
          set({
            session: null, user: null, profile: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error('Failed to refresh session (API error)')
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
            const errorMessage = error instanceof Error ? error.message : 'Unknown profile update error';
            logger.error('updateProfile error in store', { message: errorMessage });
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