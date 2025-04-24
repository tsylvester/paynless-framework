import { create } from 'zustand'
import {
  AuthStore,
  User,
  Session,
  UserProfile,
  UserProfileUpdate,
  UserRole,
  AuthResponse
} from '@paynless/types'
import { NavigateFunction } from '@paynless/types'
import { logger } from '@paynless/utils'
import { api, getApiClient } from '@paynless/api-client'
import { analytics } from '@paynless/analytics-client'
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'

export const useAuthStore = create<AuthStore>()((set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true,
      error: null,
      navigate: null as NavigateFunction | null,

      setNavigate: (navigateFn: NavigateFunction) => set({ navigate: navigateFn }),

      setUser: (user: User | null) => set({ user }),

      setSession: (session: Session | null) => set({ session }),

      setProfile: (profile: UserProfile | null) => set({ profile }),

      setIsLoading: (isLoading: boolean) => set({ isLoading }),

      setError: (error: Error | null) => set({ error }),

      login: async (email: string, password: string): Promise<User | null> => {
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

          // On success, Supabase call is done. 
          // The onAuthStateChange listener will handle setting user, session, profile.
          // We don't need to manually set state here anymore.
          
          // Keep navigation logic? (The listener might handle this too via replay)
          // For now, let's assume login still triggers default navigation if listener doesn't
          const navigate = get().navigate;
          if (navigate) {
            logger.info(
              'Supabase Login successful, navigating to dashboard (listener will handle state).',
            );
            navigate('dashboard');
          } else {
            logger.warn(
              'Supabase Login successful but navigate function not set in store.',
            );
          }

          // What should login return now? Listener handles state. 
          // Returning null seems appropriate as the action itself doesn't provide the final user state.
          return null; 

        } catch (error) {
          const finalError =
            error instanceof Error ? error : new Error('Unknown login error');
          logger.error('Login error in store', { message: finalError.message });
          set({
            // Only set error and loading false. User/session/profile cleared by listener or remain null.
            isLoading: false,
            error: finalError,
            // user: null, // Let listener handle this
            // session: null,
            // profile: null,
          });
          return null;
        } finally {
            // Ensure isLoading is always set to false
            // Note: The catch block also sets isLoading: false, 
            // so this might be redundant if the catch always runs before finally on error.
            // However, setting it here guarantees it in case of unexpected non-error exits from try.
             set({ isLoading: false });
        }
      },

      register: async (
        email: string,
        password: string
      ): Promise<User | null> => {
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

          // On success, Supabase call is done.
          // The onAuthStateChange listener handles setting state.
          
          // Keep navigation logic?
          const navigate = get().navigate;
          if (navigate) {
            logger.info(
              'Supabase Registration successful, navigating to dashboard (listener will handle state).'
            );
            navigate('dashboard');
          } else {
            logger.warn(
              'Supabase Registration successful but navigate function not set in store.'
            );
          }

          // Return null as listener handles final user state
          return null;

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
            // user: null, // Let listener handle
            // session: null,
            // profile: null,
          });
          return null;
        } finally {
            set({ isLoading: false });
        }
      },

      logout: async () => {
        analytics.reset()

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
          navigate('login')
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

      clearError: () => set({ error: null }),
    }))

const mapSupabaseUser = (supabaseUser: SupabaseUser | null): User | null => {
  if (!supabaseUser) return null;
  return {
    id: supabaseUser.id,
    role: (supabaseUser.role as UserRole) ?? 'authenticated',
    email: supabaseUser.email ?? '',
    created_at: supabaseUser.created_at,
    updated_at: supabaseUser.updated_at,
  };
};

const mapSupabaseSession = (supabaseSession: SupabaseSession | null): Session | null => {
  if (!supabaseSession) return null;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const expiresAtTimestamp = supabaseSession.expires_at ?? (supabaseSession.expires_in ? nowInSeconds + supabaseSession.expires_in : nowInSeconds);
  return {
    access_token: supabaseSession.access_token,
    refresh_token: supabaseSession.refresh_token,
    expiresAt: expiresAtTimestamp,
    token_type: supabaseSession.token_type,
    expires_in: supabaseSession.expires_in,
  };
};

export function initAuthListener(
  supabaseClient: SupabaseClient
): () => void {
  logger.debug('[AuthListener] Initializing Supabase auth listener...');

  const { data: listener } = supabaseClient.auth.onAuthStateChange(
    (event, session) => {
      try {
        // --- Remove diagnostic log --- 
        // logger.warn('<<<<< onAuthStateChange CALLBACK EXECUTED >>>>>', { event });
        
        logger.debug(`[AuthListener] Event: ${event}`, { session });

        const storeSession = mapSupabaseSession(session);
        const storeUser = mapSupabaseUser(session?.user ?? null);

        // Handle state updates SYNCHRONOUSLY first
        switch (event) {
          case 'INITIAL_SESSION':
            // Update core session/user state immediately
            useAuthStore.setState({
              session: storeSession,
              user: storeUser,
              isLoading: false, // Set loading false here!
              error: null,
              profile: undefined, // Set profile undefined initially, let async part fetch it
            });
            break;
          case 'SIGNED_IN':
            // Update core session/user state immediately
            useAuthStore.setState({
              session: storeSession,
              user: storeUser,
              isLoading: false, // Set loading false here!
              error: null,
              profile: undefined, // Set profile undefined initially, let async part fetch it
            });
            
            // --- NEW: Check for pending action and navigate immediately ---
            try {
                const pendingActionJson = localStorage.getItem('pendingAction');
                if (pendingActionJson) {
                    logger.debug('[AuthListener] Found pending action on SIGNED_IN. Checking return path...');
                    const pendingAction = JSON.parse(pendingActionJson);
                    if (pendingAction && pendingAction.returnPath) {
                        const navigate = useAuthStore.getState().navigate;
                        if (navigate) {
                            logger.info(`[AuthListener] Navigating to pending action return path: ${pendingAction.returnPath}`);
                            // Navigate immediately, let the target page handle the action itself.
                            // Do NOT remove pendingAction here; target page needs it.
                            navigate(pendingAction.returnPath);
                        } else {
                            logger.warn('[AuthListener] Pending action exists but navigate function not available to redirect.');
                        }
                    } else {
                         logger.warn('[AuthListener] Could not parse returnPath from pending action JSON.', { pendingActionJson });
                    }
                } else {
                    // No pending action, normal sign-in flow (default navigation might happen elsewhere)
                }
            } catch (e) {
                logger.error('[AuthListener] Error checking/parsing pendingAction for navigation:', { 
                    error: e instanceof Error ? e.message : String(e) 
                });
                localStorage.removeItem('pendingAction'); // Clear potentially corrupted item
            }
            // --- End Immediate Navigation Check ---
            break;
          case 'TOKEN_REFRESHED':
            // Update core session/user state immediately
            useAuthStore.setState({
              session: storeSession,
              user: storeUser,
              isLoading: false, // Can likely set loading false here too
              error: null,
              // Profile should already exist, no need to reset to undefined
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
            useAuthStore.setState({ user: storeUser }); 
            break;
          case 'PASSWORD_RECOVERY':
            // Typically, you might navigate or set a specific state 
            // For now, ensure loading is false.
            useAuthStore.setState({ isLoading: false });
            break;
          default:
            logger.warn('[AuthListener] Unhandled auth event:', { event });
             // Ensure loading is false even for unhandled events
            useAuthStore.setState({ isLoading: false }); 
            break;
        }

        // Now, handle ASYNCHRONOUS tasks (profile fetch, replay) AFTER the main callback finishes
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && storeSession?.access_token) {
            setTimeout(async () => { 
                const startTime = Date.now(); // Start timer
                logger.debug(`[AuthListener] Performing async tasks for ${event}`);
                try {
                    const apiClientInstance = getApiClient();
                    const token = storeSession.access_token;

                    // --- Delay Point 1: Profile Fetch ---
                    logger.debug(`[AuthListener] Fetching profile for ${event}...`);
                    const profileStartTime = Date.now();
                    const profileResponse = await apiClientInstance.get<AuthResponse>('/me', { token });
                    const profileEndTime = Date.now();
                    logger.debug(`[AuthListener] Profile fetch completed for ${event}. Duration: ${profileEndTime - profileStartTime}ms`);
                    
                    if (profileResponse.data && profileResponse.data.profile) {
                        logger.debug(`[AuthListener] Profile fetched successfully for ${event}`);
                        useAuthStore.setState({ profile: profileResponse.data.profile });
                    } else {
                        logger.error(`[AuthListener] Failed to fetch profile for ${event}`, { error: profileResponse.error });
                        useAuthStore.setState({ profile: null, error: new Error(profileResponse.error?.message || 'Failed fetch profile') });
                    }

                    // --- Delay Point 2: Action Replay (REMOVED) ---
                    // logger.debug(`[AuthListener] Checking for pending action for ${event}...`);
                    // const replayStartTime = Date.now(); // Timer for replay call
                    // const navigate = useAuthStore.getState().navigate;
                    // await replayPendingAction(apiClientInstance, navigate, token);
                    // const replayEndTime = Date.now();
                    // logger.debug(`[AuthListener] replayPendingAction call completed for ${event}. Duration: ${replayEndTime - replayStartTime}ms`); 

                } catch (asyncError) {
                    logger.error(`[AuthListener] Error during async tasks for ${event}`, { 
                        error: asyncError instanceof Error ? asyncError.message : String(asyncError) 
                    });
                } finally {
                    const endTime = Date.now(); // End timer
                    logger.debug(`[AuthListener] Finished async tasks for ${event}. Total duration: ${endTime - startTime}ms`);
                }
            }, 0); // setTimeout 0ms
        } 
        // else if (event === 'SIGNED_OUT') {
            // If any async cleanup is needed for signout, add another setTimeout here.
        // }

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
