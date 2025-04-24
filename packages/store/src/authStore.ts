import { create } from 'zustand'
import {
  AuthStore,
  AuthResponse,
  User,
  Session,
  UserProfile,
  UserProfileUpdate,
  UserRole,
  RefreshResponse,
} from '@paynless/types'
import { NavigateFunction } from '@paynless/types'
import { logger } from '@paynless/utils'
import { persist } from 'zustand/middleware'
import { api, getApiClient, ApiClient } from '@paynless/api-client'
import { analytics } from '@paynless/analytics-client'
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'
import { replayPendingAction } from './lib/replayPendingAction'

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
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
          const response = await api.post<
            AuthResponse,
            { email: string; password: string }
          >('login', { email, password })

          if (!response.error && response.data) {
            const authData = response.data
            set({
              user: authData.user,
              session: authData.session,
              profile: authData.profile,
              isLoading: false,
              error: null,
            })

            // ---> Identify user for analytics <---
            if (authData.user?.id) {
              analytics.identify(authData.user.id, {
                email: authData.user.email,
              })
            }

            // Navigate to dashboard only if we didn't navigate based on returnPath
              const navigate = get().navigate
              if (navigate) {
                logger.info(
                  'Login successful (no pending action/navigation), navigating to dashboard.'
                )
                navigate('dashboard')
              } else {
                logger.warn(
                  'Login successful but navigate function not set in store.'
                )
              }
          

            return authData.user ?? null
          } else {
            const errorMessage =
              response.error?.message || 'Login failed without specific error'
            throw new Error(errorMessage)
          }
        } catch (error) {
          const finalError =
            error instanceof Error ? error : new Error('Unknown login error')
          logger.error('Login error in store', { message: finalError.message })
          set({
            isLoading: false,
            error: finalError,
            user: null,
            session: null,
            profile: null,
          })
          return null
        }
      },

      register: async (
        email: string,
        password: string
      ): Promise<User | null> => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.post<
            AuthResponse,
            { email: string; password: string }
          >('register', { email, password })

          if (!response.error && response.data) {
            const authData = response.data
            set({
              user: authData.user,
              session: authData.session,
              profile: null,
              isLoading: false,
              error: null,
            })

            // ---> Identify user for analytics <---
            if (authData.user?.id) {
              analytics.identify(authData.user.id, {
                email: authData.user.email,
              })
            }

            // Use the navigate function if available AND if we didn't navigate via returnPath
              const navigate = get().navigate
              if (navigate) {
                logger.info(
                  'Registration successful (no pending action/navigation), navigating to dashboard.'
                )
                navigate('dashboard')
              } else {
                logger.warn(
                  'Registration successful but navigate function not set in store.'
                )
              }
          

            return authData.user ?? null
          } else {
            const errorMessage =
              response.error?.message || 'Registration failed'
            throw new Error(errorMessage)
          }
        } catch (error) {
          const finalError =
            error instanceof Error
              ? error
              : new Error('Unknown registration error')
          logger.error('Register error in store', {
            message: finalError.message,
          })
          set({
            isLoading: false,
            error: finalError,
            user: null,
            session: null,
            profile: null,
          })
          return null
        }
      },

      logout: async () => {
        // ---> Reset analytics user <---
        analytics.reset()

        const token = get().session?.access_token

        if (token) {
          set({ isLoading: true, error: null })
          try {
            await api.post('logout', {}, { token })
            logger.info('AuthStore: Logout API call successful.')
          } catch (error) {
            logger.error(
              'Logout API call failed, proceeding with local cleanup.',
              { error: error instanceof Error ? error.message : String(error) }
            )
          } finally {
            // Always clear local state
            set({
              user: null,
              session: null,
              profile: null,
              isLoading: false,
              error: null,
            })

            // Clear localStorage items including Zustand's persisted state
            localStorage.removeItem('auth-storage') // This is the Zustand persist key
            localStorage.removeItem('pendingAction')
            localStorage.removeItem('loadChatIdOnRedirect')
          }
        } else {
          logger.warn(
            'Logout called but no session token found. Clearing local state only.'
          )
          set({
            user: null,
            session: null,
            profile: null,
            isLoading: false,
            error: null,
          })
          localStorage.removeItem('auth-storage')
          localStorage.removeItem('pendingAction')
          localStorage.removeItem('loadChatIdOnRedirect')
        }

        // Navigate to login
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

      initialize: async () => {
        try {
          // Get session from Zustand's persisted state
          const session = get().session
          //const user = get().user;

          // If no session or expired session, clear state and return
          if (!session || !session.access_token) {
            logger.info('No session found in store.')
            set({
              user: null,
              profile: null,
              session: null,
              isLoading: false,
              error: null,
            })
            return
          }

          // Check for expired session
          if (session.expiresAt * 1000 < Date.now()) {
            logger.info('Stored session is expired.')

            // Try to refresh if we have a refresh token
            if (session.refresh_token) {
              logger.info('Attempting to refresh expired token...')
              await get().refreshSession()
            } else {
              // No refresh token, clear state
              set({
                user: null,
                profile: null,
                session: null,
                isLoading: false,
                error: null,
              })
              localStorage.removeItem('auth-storage')
            }
            return
          }
          // Session exists and is not expired, verify with backend
          logger.info(
            'Valid session found, verifying token / fetching initial profile...'
          )
          const response = await api.get<AuthResponse>('me', {
            token: session.access_token,
          })
          if (response.error || !response.data || !response.data.user) {
            // Token invalid or expired
            logger.error('/me call failed after restoring session.', {
              error: response.error,
            })

            // Try refreshing the token
            logger.info('Attempting to refresh token after failed /me call...')
            await get().refreshSession()
            return
          }
          // /me successful, update user/profile
          logger.info('/me call successful, user authenticated.')
          set({
            user: response.data.user,
            profile: response.data.profile,
            isLoading: false,
            error: null,
          })

          // ---> Identify user for analytics <---
          if (response.data.user?.id) {
            analytics.identify(response.data.user.id, {
              email: response.data.user.email,
              // Add traits from profile if available
              firstName: response.data.profile?.first_name,
              lastName: response.data.profile?.last_name,
            })
          }

          // Refresh token if it expires soon (within 10 minutes)
          const expiresAt = session.expiresAt * 1000
          const now = Date.now()
          const timeUntilExpiry = expiresAt - now

          if (timeUntilExpiry < 10 * 60 * 1000) {
            logger.info('Token expires soon, refreshing...')
            await get().refreshSession()
          }

          // Check for pending action and replay
          const navigate = get().navigate;
          const apiClientInstance = getApiClient();
          
          if (navigate) {
            await replayPendingAction(apiClientInstance, navigate);
          } else {
            logger.warn('Cannot replay pending action: navigate function not available.');
          }
        } catch (error) {
          logger.error('Error during initialization process', {
            error: error instanceof Error ? error.message : String(error),
          })
          set({
            isLoading: false,
            user: null,
            session: null,
            profile: null,
            error: new Error('Error during initialization', {
              cause: error instanceof Error ? error : undefined,
            }),
          })
          // Clear localStorage on error
          localStorage.removeItem('auth-storage')
        }
      },

      refreshSession: async () => {
        const currentSession = get().session
        if (!currentSession?.refresh_token) {
          logger.warn('refreshSession called without a refresh token.')
          set({
            error: new Error('No refresh token available to refresh session.'),
            isLoading: false,
          })
          return
        }
        set({ isLoading: true, error: null })
        try {
          const response = await api.post<RefreshResponse, {}>(
            'refresh',
            {},
            {
              headers: {
                Authorization: `Bearer ${currentSession.refresh_token}`,
              },
            }
          )

          if (!response.error && response.data) {
            const refreshData = response.data
            if (refreshData?.session && refreshData?.user) {
              set({
                session: refreshData.session,
                user: refreshData.user,
                profile: refreshData.profile,
                isLoading: false,
                error: null,
              })

              logger.info('Session refreshed successfully')

              // Call replay after successful refresh and state update
              const navigate = get().navigate;
              const apiClientInstance = getApiClient();
              
              if (navigate) {
                await replayPendingAction(apiClientInstance, navigate);
              } else {
                logger.warn('Cannot replay pending action: navigate function not available.');
              }
            } else {
              logger.error('Refresh returned invalid data', { refreshData })
              set({
                session: null,
                user: null,
                profile: null,
                isLoading: false,
                error: new Error(
                  'Failed to refresh session (invalid response)'
                ),
              })
              localStorage.removeItem('auth-storage')
            }
          } else {
            const errorMessage =
              response.error?.message || 'Failed to refresh session'
            logger.error('Refresh API error', { error: response.error })
            localStorage.removeItem('auth-storage')
            throw new Error(errorMessage)
          }
        } catch (error) {
          const finalError =
            error instanceof Error
              ? error
              : new Error('Error refreshing session')
          logger.error('Refresh session error', { message: finalError.message })
          localStorage.removeItem('auth-storage')
          set({
            session: null,
            user: null,
            profile: null,
            isLoading: false,
            error: finalError,
          })
        }
      },

      updateProfile: async (
        profileData: UserProfileUpdate
      ): Promise<UserProfile | null> => {
        set({ error: null })
        const token = get().session?.access_token
        const currentProfile = get().profile

        // Check if authenticated first
        if (!token) {
          logger.error(
            'updateProfile: Cannot update profile, user not authenticated.'
          )
          set({ error: new Error('Not authenticated') })
          return null
        }

        // Then check if profile is loaded
        if (!currentProfile) {
          logger.error(
            'updateProfile: Cannot update profile, no current profile loaded.'
          )
          set({
            error: new Error('Profile not loaded'),
          })
          return null
        }

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
    }),
    {
      name: 'auth-storage',
      // Store session and user in localStorage through Zustand persist
      partialize: (state) => ({
        session: state.session,
        user: state.user, // Include user to prevent user/session mismatch
      }),
    }
  )
)

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
  supabaseClient: SupabaseClient,
  apiClientInstance: ApiClient
): () => void {
  logger.debug('[AuthListener] Initializing Supabase auth listener...');

  const { data: listener } = supabaseClient.auth.onAuthStateChange(
    async (event, session) => {
      logger.debug(`[AuthListener] Event: ${event}`, { session });

      const storeSession = mapSupabaseSession(session);
      const storeUser = mapSupabaseUser(session?.user ?? null);

      switch (event) {
        case 'INITIAL_SESSION':
          useAuthStore.setState({
            session: storeSession,
            user: storeUser,
            profile: storeSession ? undefined : null,
            isLoading: false,
            error: null,
          });
          if (storeSession?.access_token) {
            try {
              const profileResponse = await apiClientInstance.get<UserProfile>('/me', {
                token: storeSession.access_token,
              });
              if (profileResponse.data) useAuthStore.setState({ profile: profileResponse.data });
              else useAuthStore.setState({ profile: null, error: new Error(profileResponse.error?.message || 'Failed fetch profile') });
            } catch (err) {
              useAuthStore.setState({ profile: null, error: err instanceof Error ? err : new Error('Error fetch profile') });
            }
            const navigate = useAuthStore.getState().navigate;
            await replayPendingAction(apiClientInstance, navigate); 
          } else {
             // Explicitly set profile to null if there was no session during INITIAL_SESSION
             // useAuthStore.setState({ profile: null }); // REMOVED: Redundant, first setState handles this.
          }
          break;

        case 'SIGNED_IN':
          useAuthStore.setState({
            session: storeSession,
            user: storeUser,
            isLoading: false, 
            error: null,
          });
          if (storeSession?.access_token) {
             try {
                const profileResponse = await apiClientInstance.get<UserProfile>('/me', {
                  token: storeSession.access_token,
                });
                if (profileResponse.data) useAuthStore.setState({ profile: profileResponse.data });
                else useAuthStore.setState({ profile: null, error: new Error(profileResponse.error?.message || 'Failed fetch profile') });
             } catch (err) {
                useAuthStore.setState({ profile: null, error: err instanceof Error ? err : new Error('Error fetch profile') });
             }
            const navigate = useAuthStore.getState().navigate;
            await replayPendingAction(apiClientInstance, navigate);
          }
          break;

        case 'SIGNED_OUT':
          useAuthStore.setState({
            user: null,
            session: null,
            profile: null,
            isLoading: false, 
            error: null,
          });
          localStorage.removeItem('pendingAction')
          localStorage.removeItem('loadChatIdOnRedirect')
          break;

        case 'TOKEN_REFRESHED':
          useAuthStore.setState({
            session: storeSession, 
            user: storeUser, 
            isLoading: false,
            error: null,
          });
          break;

        case 'USER_UPDATED':
          useAuthStore.setState({ user: storeUser }); 
          break;

        case 'PASSWORD_RECOVERY':
          break;

        default:
          logger.warn('[AuthListener] Unhandled auth event:', { event });
      }
    }
  );

  return () => {
    logger.debug('[AuthListener] Unsubscribing Supabase auth listener.');
    listener?.subscription.unsubscribe();
  };
}
