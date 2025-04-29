import { create } from 'zustand'
import {
  AuthStore,
  UserProfileUpdate,
  UserProfile,
  ProfileResponse,
  SupabaseUser,
  SupabaseSession
} from '@paynless/types'
import { NavigateFunction } from '@paynless/types'
import { logger } from '@paynless/utils'
import { api, getApiClient } from '@paynless/api'
import { analytics } from '@paynless/analytics'
import { SupabaseClient } from '@supabase/supabase-js'
import { useNotificationStore } from './notificationStore'

export const useAuthStore = create<AuthStore>()((set, get) => ({
      user: null,
      session: null,
      profile: null as UserProfile | null,
      isLoading: true,
      error: null,
      navigate: null as NavigateFunction | null,

      setNavigate: (navigateFn: NavigateFunction) => set({ navigate: navigateFn }),

      setUser: (user: SupabaseUser | null) => set({ user }),

      setSession: (session: SupabaseSession | null) => set({ session }),

      setProfile: (profile: UserProfile | null) => set({ profile }),

      setIsLoading: (isLoading: boolean) => set({ isLoading }),

      setError: (error: Error | null) => set({ error }),

      clearError: () => set({ error: null }),

      login: async (email: string, password: string): Promise<void> => {
        set({ isLoading: true, error: null })
        try {
          // Get Supabase client instance
          const supabase = api.getSupabaseClient(); // Assuming api is accessible here
          if (!supabase) {
            throw new Error('Supabase client not available');
          }

          // Call Supabase auth method
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

          if (signInError) {
            // Throw the error to be caught by the catch block
            throw signInError;
          }
          // No return value needed, listener handles state
        } catch (error) {
          const finalError =
            error instanceof Error ? error : new Error('Unknown login error');
          logger.error('Login error in store', { message: finalError.message });
          set({
            isLoading: false,
            error: finalError,
          });
          // No return value needed
        } finally {
             set({ isLoading: false });
        }
      },

      register: async (
        email: string,
        password: string
      ): Promise<void> => {
        set({ isLoading: true, error: null })
        try {
          // Get Supabase client instance
          const supabase = api.getSupabaseClient(); 
          if (!supabase) {
            throw new Error('Supabase client not available');
          }

          // Call Supabase auth method
          const { error: signUpError } = await supabase.auth.signUp({ email, password });

          if (signUpError) {
            throw signUpError;
          }
          // No return value needed, listener handles state
        } catch (error) {
          const finalError =
            error instanceof Error
              ? error
              : new Error('Unknown registration error');
          logger.error('Register error in store', {
            message: finalError.message,
          });
          set({
            isLoading: false,
            error: finalError,
          });
          // No return value needed
        } finally {
            set({ isLoading: false });
        }
      },

      logout: async () => {
        analytics.reset()

        // --- NEW: Unsubscribe from Notifications ---
        try {
           // Get the action directly
           const unsubscribeNotifications = useNotificationStore.getState().unsubscribeFromUserNotifications;
           logger.info('[AuthStore Logout] Unsubscribing from notifications...');
           unsubscribeNotifications(); // Call the new action
        } catch (streamError) {
           // Log error but proceed with logout
           logger.error('[AuthStore Logout] Error unsubscribing from notifications:', { error: streamError instanceof Error ? streamError.message : String(streamError) });
        }
        // -----------------------------------------

        // Check if there's a session in the store state first
        const currentSession = get().session;

        if (currentSession) {
          // Only attempt Supabase signOut if we think we have a session
          try {
            // Get Supabase client instance
            const supabase = api.getSupabaseClient(); 
            if (!supabase) {
              logger.error('Logout cannot call Supabase: client not available.');
            } else {
              const { error: signOutError } = await supabase.auth.signOut()
              if (signOutError) {
                  logger.error(
                      'Supabase signOut failed, proceeding with local cleanup.',
                      { error: signOutError.message }
                  )
              }
            }
          } catch (error) {
            logger.error(
              'Logout Supabase call failed unexpectedly, proceeding with local cleanup.',
              { error: error instanceof Error ? error.message : String(error) }
            )
          }
        } else {
          // Log warning if logout is called without a session in the store
           logger.warn('Logout called but no session token found. Clearing local state only.');
        }
        
        // Actions common to both paths (logged in or not)
        try { 
          // Always clear local state items NOT managed by listener/persist
          localStorage.removeItem('pendingAction')
          localStorage.removeItem('loadChatIdOnRedirect')
        } catch(storageError) {
           logger.error('Error clearing localStorage during logout', { error: storageError instanceof Error ? storageError.message : String(storageError) });
        }

        // Navigate to login - This should always happen
        const navigate = get().navigate
        if (navigate) {
          navigate('/login')
          logger.info('Cleared local state and navigated to /login.')
        } else {
          logger.error(
            'Logout cleanup complete but navigate function not available in store.'
          )
        }
      },

      updateProfile: async (
        profileData: UserProfileUpdate
      ): Promise<UserProfile | null> => {
        set({ error: null })
        const token = get().session?.access_token
        const currentProfile = get().profile

        if (!token) {
          logger.error(
            'updateProfile: Cannot update profile, user not authenticated.'
          )
          set({ error: new Error('Authentication required'), isLoading: false }) 
          return null
        }

        // Then check if profile is loaded
        if (!currentProfile) {
          logger.error(
            'updateProfile: Cannot update profile, no current profile loaded.'
          )
          set({
            error: new Error('Profile not loaded'),
            isLoading: false 
          })
          return null
        }

        // Set loading true only if proceeding to API call
        set({ isLoading: true });
        try {
          const response = await api.put<UserProfile, UserProfileUpdate>(
            'me',
            profileData,
            { token }
          )

          if (!response.error && response.data) {
            const updatedProfile = response.data
            set({
              profile: updatedProfile,
              error: null,
            })
            logger.info('Profile updated successfully.')
            return updatedProfile
          } else {
            const errorMessage =
              response.error?.message || 'Failed to update profile'
            throw new Error(errorMessage)
          }
        } catch (error) {
          const finalError =
            error instanceof Error
              ? error
              : new Error('Failed to update profile (API error)')
          logger.error('Update profile: Error during API call.', {
            message: finalError.message,
          })
          set({ error: finalError })
          return null
        } finally {
            set({ isLoading: false });
        }
      },

      updateEmail: async (newEmail: string): Promise<boolean> => {
        set({ error: null })
        const token = get().session?.access_token

        if (!token) {
          const error = new Error('Authentication required to update email.')
          set({ error })
          return false // Indicate failure
        }

        logger.info('[AuthStore] Attempting to update email...', {
          email: newEmail,
        })

        try {
          // Call the new Supabase Edge Function
          const response = await api.post<
            { success: boolean },
            { email: string }
          >(
            'update-email', // Endpoint name for the new function
            { email: newEmail },
            { token }
          )

          if (!response.error && response.data?.success) {
            logger.info(
              '[AuthStore] Email update request successful. Verification email likely sent.'
            )
            set({ error: null })
            // Note: The user object in the store might not reflect the change immediately.
            // Supabase Auth handles the email change flow (verification).
            // We might need to fetch the user again or rely on Supabase listeners if immediate UI update is needed.
            // For now, we just return success.
            return true // Indicate success
          } else {
            const errorMessage =
              response.error?.message || 'Failed to update email via API'
            logger.error('[AuthStore] Email update API call failed:', {
              error: errorMessage,
            })
            throw new Error(errorMessage)
          }
        } catch (error) {
          const finalError =
            error instanceof Error
              ? error
              : new Error('Unknown error during email update')
          logger.error('[AuthStore] updateEmail action failed:', {
            message: finalError.message,
          })
          set({ error: finalError })
          return false // Indicate failure
        }
      },

      uploadAvatar: async (_file: File): Promise<string | null> => {
        // Implementation for uploading avatar
        // This is a placeholder and should be implemented
        return null;
      },

      fetchProfile: async (): Promise<UserProfile | null> => {
        // Implementation for fetching profile
        // This is a placeholder and should be implemented
        return null;
      },

      checkEmailExists: async (_email: string): Promise<boolean> => {
        // Implementation for checking if email exists
        // This is a placeholder and should be implemented
        return false;
      },

      requestPasswordReset: async (_email: string): Promise<boolean> => {
        // Implementation for requesting password reset
        // This is a placeholder and should be implemented
        return false;
      },

      handleOAuthLogin: async (_provider: 'google' | 'github'): Promise<void> => {
        // Implementation for handling OAuth login
        // This is a placeholder and should be implemented
      },
    }))

export function initAuthListener(
  supabaseClient: SupabaseClient
): () => void {
  logger.debug('[AuthListener] Initializing Supabase auth listener...');

  const { data: listener } = supabaseClient.auth.onAuthStateChange(
    (event, session) => {
      try {
        logger.debug(`[AuthListener] Event: ${event}`, { session });

        const currentUser = session?.user ?? null;
        const currentSession = session;

        switch (event) {
          case 'INITIAL_SESSION':
            useAuthStore.setState({
              session: currentSession,
              user: currentUser,
              isLoading: false,
              error: null,
              profile: undefined,
            });
            break;
          case 'SIGNED_IN':
            useAuthStore.setState({
              session: currentSession,
              user: currentUser,
              isLoading: false,
              error: null,
              profile: undefined,
            });
            
            try {
                const pendingActionJson = localStorage.getItem('pendingAction');
                if (pendingActionJson) {
                    logger.debug('[AuthListener] Found pending action on SIGNED_IN. Checking return path...');
                    const pendingAction = JSON.parse(pendingActionJson);
                    if (pendingAction && pendingAction.returnPath) {
                        const navigate = useAuthStore.getState().navigate;
                        if (navigate) {
                            logger.info(`[AuthListener] Navigating to pending action return path: ${pendingAction.returnPath}`);
                            navigate(pendingAction.returnPath);
                        } else {
                            logger.warn('[AuthListener] Pending action exists but navigate function not available to redirect.');
                        }
                    } else {
                         logger.warn('[AuthListener] Could not parse returnPath from pending action JSON.', { pendingActionJson });
                    }
                } else {
                    logger.info('[AuthListener] No pending action found on SIGNED_IN. Navigating to default route dashboard.');
                    const navigate = useAuthStore.getState().navigate;
                    if (navigate) {
                        navigate('dashboard');
                    } else {
                        logger.warn('[AuthListener] Navigate function not available for default redirection.');
                    }
                }
            } catch (e) {
                logger.error('[AuthListener] Error checking/parsing pendingAction for navigation:', { 
                    error: e instanceof Error ? e.message : String(e) 
                });
                localStorage.removeItem('pendingAction');
            }
            break;
          case 'TOKEN_REFRESHED':
            useAuthStore.setState({
              session: currentSession,
              user: currentUser,
              isLoading: false,
              error: null,
            });
            break;
          case 'SIGNED_OUT':
            useAuthStore.setState({
              user: null,
              session: null,
              profile: null,
              isLoading: false, 
              error: null,
            });
            localStorage.removeItem('pendingAction');
            localStorage.removeItem('loadChatIdOnRedirect');
            break;
          case 'USER_UPDATED':
            useAuthStore.setState({ user: currentUser });
            break;
          case 'PASSWORD_RECOVERY':
            useAuthStore.setState({ isLoading: false });
            break;
          default:
            logger.warn('[AuthListener] Unhandled auth event:', { event });
            useAuthStore.setState({ isLoading: false }); 
            break;
        }

        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && currentSession?.access_token && currentUser?.id) { // Ensure currentUser.id exists
            // Added timeout to allow other potential listeners to finish first and avoid race conditions
            setTimeout(async () => { 
                const startTime = Date.now();
                logger.debug(`[AuthListener] Performing async tasks for ${event}`);
                const userId = currentUser.id; // Store user ID
                try {
                    const apiClientInstance = getApiClient();
                    const token = currentSession.access_token;

                    logger.debug(`[AuthListener] Fetching profile for ${event}...`);
                    const profileStartTime = Date.now();
                    const profileResponse = await apiClientInstance.get<ProfileResponse>('me', { token });
                    const profileEndTime = Date.now();
                    logger.debug(`[AuthListener] Profile fetch completed for ${event}. Duration: ${profileEndTime - profileStartTime}ms`);
                    
                    if (profileResponse.data && profileResponse.data.profile) {
                        logger.debug(`[AuthListener] Profile fetched successfully for ${event}`);
                        useAuthStore.setState({ profile: profileResponse.data.profile });
                        
                        // --- NEW: Subscribe to Notifications ---
                        try {
                           // Match logger signature: message (string), metadata (object)
                           logger.info(`[AuthListener] Subscribing to notifications after successful ${event} and profile fetch`, { userId });
                           // Get notification store action and call it with user ID
                           const { subscribeToUserNotifications } = useNotificationStore.getState();
                           subscribeToUserNotifications(userId); // Pass the user ID
                        } catch (subscribeError) {
                            logger.error(`[AuthListener] Failed to subscribe to notifications during ${event}:`, {
                                error: subscribeError instanceof Error ? subscribeError.message : String(subscribeError)
                            });
                            // Decide if we need to set an error state here or just log
                        }
                        // ---------------------------------------

                    } else {
                        logger.error(`[AuthListener] Failed to fetch profile for ${event}`, { error: profileResponse.error });
                        useAuthStore.setState({ profile: null, error: new Error(profileResponse.error?.message || 'Failed fetch profile') });
                        // Note: Subscription is NOT initiated if profile fetch fails
                    }

                } catch (asyncError) {
                    logger.error(`[AuthListener] Error during async tasks for ${event}`, { 
                        error: asyncError instanceof Error ? asyncError.message : String(asyncError) 
                    });
                } finally {
                    const endTime = Date.now();
                    logger.debug(`[AuthListener] Finished async tasks for ${event}. Total duration: ${endTime - startTime}ms`);
                }
            }, 0); // setTimeout ensures this runs after the current event loop tick
        } else if (event === 'SIGNED_OUT') {
             // Explicitly unsubscribe on sign out event as well
             try {
                 const unsubscribeNotifications = useNotificationStore.getState().unsubscribeFromUserNotifications;
                 logger.info('[AuthListener SIGNED_OUT] Unsubscribing from notifications...');
                 unsubscribeNotifications();
             } catch (unsubscribeError) {
                  logger.error('[AuthListener SIGNED_OUT] Error unsubscribing from notifications:', { error: unsubscribeError instanceof Error ? unsubscribeError.message : String(unsubscribeError) });
             }
        }

      } catch (callbackError) {
        logger.error('!!!!!! ERROR INSIDE onAuthStateChange CALLBACK !!!!!!', {
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
          stack: callbackError instanceof Error ? callbackError.stack : undefined,
          event,
          session
        });
        useAuthStore.setState({ 
            isLoading: false, 
            error: new Error('Auth listener callback failed') 
        });
      }
    }
  );

  return () => {
    logger.debug('[AuthListener] Unsubscribing Supabase auth listener.');
    listener?.subscription.unsubscribe();
  };
}
