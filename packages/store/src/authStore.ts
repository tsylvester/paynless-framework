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
          const response = await api.post<AuthResponse, {email: string, password: string}>(
            '/login',
            { email, password } 
          );
          
          if (!response.error && response.data) {
              const authData = response.data;
              set({
                user: authData.user,
                session: authData.session,
                profile: authData.profile,
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

              return authData.user ?? null;
          } else {
              const errorMessage = response.error?.message || 'Login failed without specific error';
              throw new Error(errorMessage);
          }
        } catch (error) {
          const finalError = error instanceof Error ? error : new Error('Unknown login error');
          logger.error('Login error in store', { message: finalError.message });
          set({
            isLoading: false,
            error: finalError,
            user: null, session: null, profile: null
          });
          return null;
        }
      },
      
      register: async (email: string, password: string): Promise<{ success: boolean; user: User | null; redirectTo: string | null }> => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<AuthResponse, {email: string, password: string}>(
            '/register', 
            { email, password }
          );
          
          if (!response.error && response.data) {
              const authData = response.data;
              set({
                user: authData.user,
                session: authData.session,
                profile: null, 
                isLoading: false,
                error: null,
              });

              // --- Post-Registration Logic (as per AI Plan) ---
              let redirectTo = '/dashboard'; // Default redirect
              try {
                  const pendingMessage = sessionStorage.getItem('pendingChatMessage');
                  if (pendingMessage) {
                     logger.info('Pending chat message found after registration. Redirecting to chat.');
                     // Optional: Parse and validate `pendingMessage` if needed before changing redirect
                     redirectTo = '/'; // Redirect to home/chat page
                     // Note: The actual sending of the stashed message is handled by the frontend component
                  } else {
                     logger.info('No pending chat message found. Redirecting to default dashboard.');
                  }
              } catch (e) {
                  // Handle potential sessionStorage access errors (e.g., in private browsing)
                  const errorMsg = e instanceof Error ? e.message : String(e);
                  logger.error('Error accessing sessionStorage after registration:', { error: errorMsg });
              }

              // Use the navigate function if available (set via setNavigate)
              const navigate = get().navigate;
              if (navigate) {
                 logger.info(`Registration successful, navigating to: ${redirectTo}`);
                 navigate(redirectTo);
              } else {
                 logger.warn('Registration successful but navigate function not set in store.');
              }
              
              // --- Return success indication and redirect target --- 
              // Modify return value to signal success and target page for components not using navigate function directly
              return { 
                  success: true, 
                  user: authData.user ?? null, 
                  redirectTo: redirectTo 
              };

          } else {
               const errorMessage = response.error?.message || 'Registration failed without specific error';
               throw new Error(errorMessage);
          }
        } catch (error) {
          const finalError = error instanceof Error ? error : new Error('Unknown registration error');
          logger.error('Registration error in store', { message: finalError.message });
          set({
            isLoading: false,
            error: finalError,
             user: null, session: null, profile: null
          });
          // Return failure indication
          return { success: false, user: null, redirectTo: null };
        }
      },
      
      logout: async () => {
        const token = get().session?.access_token;
        
        if (token) {
             set({ isLoading: true, error: null }); 
             try {
                await api.post('/logout', {}, { token }); 
                logger.info('AuthStore: Logout API call successful.');
             } catch (error) {
                const finalError = error instanceof Error ? error : new Error('Unknown logout error');
                logger.error('Logout error caught in store', { message: finalError.message });
             }
        } else if (!token) {
             logger.warn('Logout called but no session token found. Clearing local state only.');
        }

        // Always clear local state regardless of API call success/failure or client initialization
        logger.info('AuthStore: Clearing state after logout attempt.');
        set({
          user: null,
          session: null,
          profile: null,
          isLoading: false, 
          error: null,
        });
      },
      
      initialize: async () => {
        logger.info('Initializing auth state from persisted data...');
        set({ isLoading: true });
        const session = get().session;

        if (session?.access_token) {
          logger.info('Verifying token / fetching initial profile...');
          try {
            const response = await api.get<AuthResponse>('me', { token: session.access_token });
            
            if (!response.error && response.data) {
                const authData = response.data;
                if (authData?.user) {
                    set((currentState) => ({ user: authData.user, profile: authData.profile, session: currentState.session, isLoading: false, error: null }));
                } else { 
                    /* handle no user data */ 
                    set({ user: null, profile: null, session: null, isLoading: false, error: new Error('Initialization failed: Invalid user data received') }); 
                }
            } else {
                 const errorMessage = response.error?.message || 'Initialization failed: Could not fetch user data';
                 throw new Error(errorMessage);
            }
          } catch(e) {
            // API call itself failed
            const finalError = e instanceof Error ? e : new Error('Initialization failed (API error)');
            logger.error('Initialize: Error during /me API call.', { message: finalError.message });
            set({ 
              user: null, profile: null, session: null, 
              isLoading: false, 
              error: finalError 
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
          set({ error: new Error('No refresh token available to refresh session.'), isLoading: false });
          return;
        }
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<RefreshResponse, {}>('refresh', 
            {}, { headers: { 'Authorization': `Bearer ${currentSession.refresh_token}` } }
          );
           
           if (!response.error && response.data) {
                const refreshData = response.data;
                if (refreshData?.session && refreshData?.user) {
                    set({ session: refreshData.session, user: refreshData.user, profile: refreshData.profile, isLoading: false, error: null });
                } else { 
                    /* handle invalid response */ 
                    set({ session: null, user: null, profile: null, isLoading: false, error: new Error('Failed to refresh session (invalid response)') }); 
                }
           } else {
                const errorMessage = response.error?.message || 'Failed to refresh session';
                throw new Error(errorMessage);
           }
        } catch (error) {
          const finalError = error instanceof Error ? error : new Error('Failed to refresh session (API error)');
          logger.error('Refresh session: Error during refresh attempt.', { message: finalError.message });
          set({
            session: null, user: null, profile: null,
            isLoading: false,
            error: finalError
          });
        }
      },
      
      updateProfile: async (profileData: UserProfileUpdate): Promise<boolean> => {
        set({ isLoading: true, error: null });
        const token = get().session?.access_token;
        const currentProfile = get().profile;

        // Check if authenticated first
        if (!token) {
            logger.error('updateProfile: Cannot update profile, user not authenticated.');
            set({ error: new Error('Not authenticated'), isLoading: false });
            return false;
        }

        // Then check if profile is loaded
        if (!currentProfile) {
            logger.error('updateProfile: Cannot update profile, no current profile loaded.');
            set({ error: new Error('Profile not loaded'), isLoading: false });
            return false;
        }

        // Original try-catch block for API call
        try {
            const response = await api.put<UserProfile, UserProfileUpdate>('profile', profileData, { token });
            
            if (!response.error && response.data) {
                 const updatedProfile = response.data;
                 set({ profile: updatedProfile, isLoading: false, error: null });
                 logger.info('Profile updated successfully.');
                 return true;
            } else {
                 const errorMessage = response.error?.message || 'Failed to update profile';
                 throw new Error(errorMessage);
            }
        } catch (error) {
            const finalError = error instanceof Error ? error : new Error('Failed to update profile (API error)');
            logger.error('Update profile: Error during API call.', { message: finalError.message });
            set({ isLoading: false, error: finalError });
            return false;
        }
      },
      // Add clearError if missing from original file
       clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ session: state.session }),
    }
  )
);