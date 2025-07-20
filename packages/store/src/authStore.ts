import { create } from 'zustand'
import {
  AuthStore,
  UserProfileUpdate,
  UserProfile,
  ProfileResponse,
  SupabaseUser,
  SupabaseSession,
  Session,
  User,
} from '@paynless/types'
import { NavigateFunction } from '@paynless/types'
import { logger, isUserRole } from '@paynless/utils'
import { api, getApiClient } from '@paynless/api'
import { analytics } from '@paynless/analytics'
import { SupabaseClient } from '@supabase/supabase-js'
import { useNotificationStore } from './notificationStore'
import { useOrganizationStore } from './organizationStore'

// +++ Add Session Mapping Helper +++
const mapSupabaseSession = (supabaseSession: SupabaseSession | null): Session | null => {
  if (!supabaseSession) {
    return null;
  }
  // Explicitly map only the fields needed for the internal Session type
  return {
    access_token: supabaseSession.access_token,
    refresh_token: supabaseSession.refresh_token,
    expiresAt: supabaseSession.expires_at!,
    token_type: supabaseSession.token_type,
    expires_in: supabaseSession.expires_in,
    // IMPORTANT: DO NOT INCLUDE supabaseSession.user here
  };
};
// +++ End Helper +++

// +++ User Mapping Helper +++
const mapSupabaseUser = (supabaseUser: SupabaseUser | null): User | null => {
  if (!supabaseUser) {
    return null;
  }

  // Map only the fields needed for the internal User type
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    role: isUserRole(supabaseUser.role) ? supabaseUser.role : undefined,
    created_at: supabaseUser.created_at,
    updated_at: supabaseUser.updated_at,
    // Exclude other Supabase-specific fields like app_metadata, user_metadata
  };
};
// +++ End Helper +++

export const useAuthStore = create<AuthStore>()((set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true,
      error: null,
      navigate: null,
      showWelcomeModal: false,

      setNavigate: (navigateFn: NavigateFunction) => set({ navigate: navigateFn }),

      setUser: (user: User | null) => set({ user }),

      setSession: (session: Session | null) => set({ session }),

      setProfile: (profile: UserProfile | null) => set({ profile }),

      setIsLoading: (isLoading: boolean) => set({ isLoading }),

      setError: (error: Error | null) => set({ error }),

      clearError: () => set({ error: null }),

      setShowWelcomeModal: (show: boolean) => set({ showWelcomeModal: show }),

      updateSubscriptionAndDismissWelcome: async (subscribe: boolean) => {
        set({ isLoading: true });
        try {
          const updatedProfile = await get().updateProfile({
            is_subscribed_to_newsletter: subscribe,
            has_seen_welcome_modal: true,
          });
          
          if (updatedProfile) {
            set({ showWelcomeModal: false });
          }
        } catch (error) {
          logger.error('Failed to update subscription and dismiss welcome modal', { error });
          // Optionally, set an error state to be displayed to the user
        } finally {
          set({ isLoading: false });
        }
      },

      toggleNewsletterSubscription: async (isSubscribed: boolean) => {
        set({ isLoading: true, error: null });
        try {
          // Re-use the existing updateProfile logic for consistency
          const updatedProfile = await get().updateProfile({
            is_subscribed_to_newsletter: isSubscribed,
          });

          if (!updatedProfile) {
            // updateProfile handles its own errors, but if it returns null,
            // it indicates a failure (e.g., no session).
            throw new Error('Failed to update profile for newsletter subscription.');
          }

          // Success is handled by updateProfile setting the state.
          // No need to set state here again.
        } catch (error) {
          const finalError = error instanceof Error ? error : new Error('Unknown error toggling newsletter subscription');
          logger.error('Failed to toggle newsletter subscription', { error: finalError.message });
          // The error state is already set by updateProfile, but we can set it again
          // to be safe in case the error originated here.
          set({ error: finalError, isLoading: false });
        } finally {
          // updateProfile sets isLoading to false on completion/error.
          set({ isLoading: false });
        }
      },

      login: async (email: string, password: string): Promise<void> => {
        logger.info('Attempting to login user via form', { email });
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
          set({ error: finalError });
        } finally {
             set({ isLoading: false });
        }
      },

      loginWithGoogle: async (): Promise<void> => {
        logger.info('Attempting to login user via Google OAuth');
        set({ isLoading: true, error: null });
        try {
          const supabase = api.getSupabaseClient();
          if (!supabase) {
            throw new Error('Supabase client not available');
          }

          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: window.location.origin + '/dashboard',
            },
          });

          if (error) {
            throw error;
          }
          // On success, Supabase redirects. No state change needed here.
        } catch (error) {
          const finalError =
            error instanceof Error ? error : new Error('Unknown Google login error');
          logger.error('Google login error in store', { message: finalError.message });
          set({ error: finalError });
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
          set({ error: finalError });
        } finally {
            set({ isLoading: false });
        }
      },

      subscribeToNewsletter: async (email: string): Promise<void> => {
        try {
          const supabase = api.getSupabaseClient();
          if (!supabase) {
            throw new Error('Supabase client not available for newsletter subscription.');
          }
          const { error } = await supabase.functions.invoke('subscribe-to-newsletter', {
            body: { email },
          });
          if (error) {
            throw error;
          }
          logger.info('Successfully subscribed user to newsletter', { email });
        } catch (error) {
          // Log the error but don't bubble it up or set state, as it's a non-critical background task
          const finalError = error instanceof Error ? error : new Error('Unknown newsletter subscription error');
          logger.error('Newsletter subscription error in store', { message: finalError.message });
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
        set({ error: null }); // Clear previous errors immediately
        const token = get().session?.access_token;
        const currentProfile = get().profile;

        if (!token) {
          logger.error(
            'updateProfile: Cannot update profile, user not authenticated.'
          );
          // Do not set isLoading: false here if it might be true from initial app load
          set({ error: new Error('Authentication required') }); 
          return null;
        }

        if (!currentProfile) {
          logger.error(
            'updateProfile: Cannot update profile, no current profile loaded.'
          );
          set({ error: new Error('Profile not loaded') });
          return null;
        }

        const keys = Object.keys(profileData);
        const backgroundUpdateKeys = ['chat_context']; // Define keys that won't trigger the global loader
        const isBackgroundUpdate = keys.length === 1 && backgroundUpdateKeys.includes(keys[0]);


        if (!isBackgroundUpdate) {
          set({ isLoading: true });
        }
        
        try {
          const response = await api.post<UserProfile, UserProfileUpdate>(
            'me',
            profileData,
            { token }
          );

          if (!response.error && response.data) {
            const updatedProfile = response.data;
            set({
              profile: updatedProfile,
              error: null, // Clear error on success
            });
            logger.info('Profile updated successfully.', updatedProfile);
            return updatedProfile;
          } else {
            const errorMsg = response.error?.message || 'Failed to update profile';
            logger.error('updateProfile: Profile update failed.', { error: errorMsg });
            set({ error: new Error(errorMsg) }); 
            return null;
          }
        } catch (error) {
          const finalError =
            error instanceof Error ? error : new Error('Unknown error updating profile');
          logger.error('updateProfile: Unexpected error.', { message: finalError.message });
          set({ error: finalError }); 
          return null;
        } finally {
          if (!isBackgroundUpdate) {
            set({ isLoading: false });
          }
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

      updateProfileWithAvatar: async (
        _profileData: UserProfileUpdate,
        // _file: File | null // Commented out as it's unused for now
      ): Promise<UserProfile | null> => {
        // Implementation for updating profile with avatar
        // This is a placeholder and should be implemented
        return null;
      },
    }))

export function initAuthListener(
  supabaseClient: SupabaseClient
): () => void {
  logger.debug('[AuthListener] Initializing Supabase auth listener...');

  // --- Helper function to fetch profile ---
  const _fetchAndSetProfile = async (session: SupabaseSession, userId: string) => {
    if (!session?.access_token) {
        logger.warn('[AuthListener Helper] No access token found, cannot fetch profile.');
        useAuthStore.setState({ profile: null }); // Ensure profile is null if fetch is skipped
        return;
    }
    const startTime = Date.now();
    logger.debug(`[AuthListener Helper] Fetching profile for user ${userId}...`);
    try {
        const apiClientInstance = getApiClient();
        const token = session.access_token;
        const profileResponse = await apiClientInstance.get<ProfileResponse>('me', { token });
        const profileEndTime = Date.now();
        logger.debug(`[AuthListener Helper] Profile fetch completed. Duration: ${profileEndTime - startTime}ms`);

        if (profileResponse.data?.profile) {
            const fetchedProfile = profileResponse.data.profile;
            logger.debug(`[AuthListener Helper] Profile fetched successfully.`);
            useAuthStore.setState({ profile: fetchedProfile, error: null });

            // --- BEGIN Initialize Organization Context --- 
            const lastSelectedOrgId = fetchedProfile.last_selected_org_id; 
            logger.info(`[AuthListener Helper] Initializing organization context with lastSelectedOrgId: ${lastSelectedOrgId}`);
            try {
              useOrganizationStore.getState().setCurrentOrganizationId(lastSelectedOrgId);
            } catch (orgStoreError) {
              logger.error('[AuthListener Helper] Failed to set initial organization context:', {
                 error: orgStoreError instanceof Error ? orgStoreError.message : String(orgStoreError)
              });
              // Decide if we need to handle this error more explicitly
            }
            // --- END Initialize Organization Context ---

            // --- Subscribe to Notifications ---
            try {
               logger.info(`[AuthListener Helper] Subscribing to notifications after profile fetch`, { userId });
               const { subscribeToUserNotifications } = useNotificationStore.getState();
               subscribeToUserNotifications(userId);
            } catch (subscribeError) {
                logger.error(`[AuthListener Helper] Failed to subscribe to notifications:`, {
                    error: subscribeError instanceof Error ? subscribeError.message : String(subscribeError)
                });
            }
            // -----------------------------------
        } else {
            logger.error(`[AuthListener Helper] Failed to fetch profile`, { error: profileResponse.error });
            useAuthStore.setState({ profile: null, error: new Error(profileResponse.error?.message || 'Failed fetch profile') });
            // Note: Subscription is NOT initiated if profile fetch fails
            // Set org context to null if profile fails
            try {
                useOrganizationStore.getState().setCurrentOrganizationId(null);
            } catch (orgStoreError) { /* log */ }
        }
    } catch (asyncError) {
        logger.error(`[AuthListener Helper] Error during profile fetch`, { 
            error: asyncError instanceof Error ? asyncError.message : String(asyncError) 
        });
         useAuthStore.setState({ profile: null, error: new Error('Failed fetch profile') });
         // Set org context to null if profile fails
         try {
             useOrganizationStore.getState().setCurrentOrganizationId(null);
         } catch (orgStoreError) { /* log */ }
    } 
  };
  // --- End Helper ---

  const { data: listener } = supabaseClient.auth.onAuthStateChange(
    (event, session) => {
      try {
        logger.debug(`[AuthListener] Event: ${event}`, { session });

        const supabaseUser = session?.user ?? null;
        const currentSession = session;
        const mappedSession = mapSupabaseSession(currentSession);
        const mappedUser = mapSupabaseUser(supabaseUser);
        let shouldFetchProfile = false;

        switch (event) {
          case 'INITIAL_SESSION':
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            // Common initial state update for session-related events
            useAuthStore.setState({
              session: mappedSession,
              user: mappedUser,
              profile: null,
              isLoading: false,
              error: null,
            });
            shouldFetchProfile = !!(currentSession?.access_token && supabaseUser?.id);
            
            // Navigation logic specific to SIGNED_IN
            if (event === 'SIGNED_IN') {
                 try {
                    const pendingActionJson = localStorage.getItem('pendingAction');
                    if (pendingActionJson) {
                        logger.debug('[AuthListener] Found pending action on SIGNED_IN. Checking return path...');
                        const pendingAction = JSON.parse(pendingActionJson);
                        if (pendingAction?.returnPath) {
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
                    }
                } catch (e) {
                    logger.error('[AuthListener] Error checking/parsing pendingAction for navigation:', { 
                        error: e instanceof Error ? e.message : String(e) 
                    });
                    localStorage.removeItem('pendingAction');
                }
            }
            break;
            
          case 'USER_UPDATED':
            // Update user and potentially session, then trigger profile fetch
            useAuthStore.setState({
              user: mappedUser,
              // Also update session if provided, keeps state consistent
              ...(currentSession && { session: mappedSession }),
              profile: null,
              isLoading: false,
              error: null,
            });
            shouldFetchProfile = !!(currentSession?.access_token && supabaseUser?.id);
            break;

          case 'SIGNED_OUT':
            {
              useAuthStore.setState({
                user: null,
                session: null,
                profile: null,
                isLoading: false,
                error: null,
              });
              localStorage.removeItem('pendingAction');
              localStorage.removeItem('loadChatIdOnRedirect');
              // Explicitly unsubscribe notifications on sign out
              try {
                  const unsubscribeNotifications = useNotificationStore.getState().unsubscribeFromUserNotifications;
                  logger.info('[AuthListener SIGNED_OUT] Unsubscribing from notifications...');
                  unsubscribeNotifications();
              } catch (unsubscribeError) {
                    logger.error('[AuthListener SIGNED_OUT] Error unsubscribing from notifications:', { error: unsubscribeError instanceof Error ? unsubscribeError.message : String(unsubscribeError) });
              }
              // Navigate to root
              const navigate = useAuthStore.getState().navigate;
              if (navigate) {
                  navigate('/');
              } else {
                  logger.warn('[AuthListener] Navigate function not available for SIGNED_OUT redirection.');
              }
              break;
            }

          case 'PASSWORD_RECOVERY':
            {
                useAuthStore.setState({ isLoading: false });
                break;
            }
          default:
            {
                logger.warn('[AuthListener] Unhandled auth event:', { event });
                useAuthStore.setState({ isLoading: false }); 
                break;
            }
        }

        // --- Trigger Profile Fetch if needed ---
        if (shouldFetchProfile && currentSession && supabaseUser?.id) {
             logger.debug(`[AuthListener] Triggering profile fetch for event: ${event}`);
            // Pass the original Supabase session and user ID
            setTimeout(() => _fetchAndSetProfile(currentSession, supabaseUser!.id), 0);
        }
        // --- End Profile Fetch Trigger ---

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

  logger.debug('[AuthListener] Listener attached.');

  // Return the unsubscribe function
  return () => {
    if (listener?.subscription) {
      logger.debug('[AuthListener] Unsubscribing from auth state changes.');
      listener.subscription.unsubscribe();
    } else {
      logger.warn('[AuthListener] Could not unsubscribe, listener object or subscription missing.');
    }
  };
}