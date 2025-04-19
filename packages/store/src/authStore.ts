import { create } from 'zustand'
import {
  AuthStore as AuthStoreType,
  AuthResponse,
  User,
  Session,
  UserProfile,
  UserProfileUpdate,
  ApiResponse,
  AuthRequiredError
} from '@paynless/types'
import { logger } from '@paynless/utils'
import { persist } from 'zustand/middleware'
import { api } from '@paynless/api-client'
import { analytics } from '@paynless/analytics-client'
// Define the structure of the response from the refresh endpoint
interface RefreshResponse {
  session: Session | null
  user: User | null
  profile: UserProfile | null
}

// Placeholder navigate function type
type NavigateFunction = (path: string) => void

// Helper function type for replay logic
type CheckAndReplayFunction = (
  token: string,
  specifiedReturnPath?: string
) => Promise<boolean>

export const useAuthStore = create<
  AuthStoreType & { _checkAndReplayPendingAction: CheckAndReplayFunction }
>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true, // Start true until initialize runs
      error: null,
      navigate: null as NavigateFunction | null,

      // Action to inject the navigate function from the app
      setNavigate: (navigateFn: NavigateFunction) =>
        set({ navigate: navigateFn }),

      setUser: (user: User | null) => set({ user }),

      setSession: (session: Session | null) => set({ session }),

      setProfile: (profile: UserProfile | null) => set({ profile }),

      setIsLoading: (isLoading: boolean) => set({ isLoading }),

      setError: (error: Error | null) => set({ error }),

      login: async (email: string, password: string): Promise<User | null> => {
        set({ isLoading: true, error: null })
        logger.info('Attempting to login user via form', { email: email })
        try {
          const response = await api.post<
            AuthResponse,
            { email: string; password: string }
          >('login', { email, password }, { isPublic: true })

          if (response.error || !response.data?.user || !response.data?.session) {
            throw new Error(response.error?.message || 'Login failed: Invalid response from server')
          }

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

          // ---> Phase 3: Check for and replay pending action <---
          let navigated = false // Flag to track if we navigated due to pending action
          try {
            const pendingActionJson = localStorage.getItem('pendingAction')
            if (pendingActionJson) {
              logger.info(
                'Found pending action after login. Attempting replay...'
              )

              const pendingAction = JSON.parse(pendingActionJson)
              localStorage.removeItem('pendingAction') // Clear AFTER parse

              const { endpoint, method, body, returnPath } = pendingAction
              const newToken = authData.session?.access_token

              if (endpoint && method && newToken) {
                logger.info(`Replaying action: ${method} ${endpoint}`, {
                  body,
                })
                let replayResponse: ApiResponse<unknown> // Use unknown for generic replay

                switch (method.toUpperCase()) {
                  case 'POST':
                    replayResponse = await api.post(endpoint, body ?? {}, {
                      token: newToken,
                    })
                    break
                  case 'PUT':
                    replayResponse = await api.put(endpoint, body ?? {}, {
                      token: newToken,
                    })
                    break
                  case 'DELETE':
                    replayResponse = await api.delete(endpoint, {
                      token: newToken,
                    })
                    break
                  case 'GET':
                    replayResponse = await api.get(endpoint, {
                      token: newToken,
                    })
                    break
                  default:
                    logger.error(
                      'Unsupported method in pending action replay:',
                      { method }
                    )
                    replayResponse = {
                      status: 0,
                      error: {
                        code: 'UNSUPPORTED_METHOD',
                        message: 'Unsupported replay method',
                      },
                    }
                }

                if (replayResponse.error) {
                  logger.error('Error replaying pending action:', {
                    status: replayResponse.status,
                    error: replayResponse.error,
                  })
                } else {
                  logger.info(
                    '[AuthStore] Successfully replayed pending action.',
                    { status: replayResponse.status }
                  )

                  // Check if it was the chat endpoint and data has chat_id
                  if (
                    endpoint === 'chat' &&
                    method.toUpperCase() === 'POST' &&
                    replayResponse.data &&
                    typeof (replayResponse.data as any).chat_id === 'string'
                  ) {
                    const chatId = (replayResponse.data as any).chat_id
                    logger.info(
                      `Chat action replayed successfully, storing chatId ${chatId} for redirect.`
                    )
                    try {
                      localStorage.setItem('loadChatIdOnRedirect', chatId)
                    } catch (e: unknown) {
                      logger.error(
                        'Failed to set loadChatIdOnRedirect in localStorage:',
                        {
                          error: e instanceof Error ? e.message : String(e),
                        }
                      )
                    }
                  }
                }

                // Navigate to original path if possible
                const navigate = get().navigate
                if (navigate && returnPath) {
                  logger.info(
                    `Replay complete, navigating to original path: ${returnPath}`
                  )
                  navigate(returnPath)
                  navigated = true
                } else {
                  logger.warn(
                    'Could not navigate to returnPath after replay.',
                    { hasNavigate: !!navigate, returnPath }
                  )
                }
              } else {
                logger.error('Invalid pending action data found:', {
                  pendingAction,
                })
              }
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e)
            logger.error('Error processing pending action after login:', {
              error: errorMsg,
            })
          }

          // Navigate to dashboard only if we didn't navigate based on returnPath
          if (!navigated) {
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
          }

          return authData.user ?? null
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
          >('register', { email, password }, { isPublic: true })

          if (response.error || !response.data?.user || !response.data?.session) {
            throw new Error(response.error?.message || 'Registration failed: Invalid response from server')
          }

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

          // ---> Phase 3: Check for and replay pending action (Register) <---
          let navigated = false // Flag to track if we navigated due to pending action
          try {
            const pendingActionJson = localStorage.getItem('pendingAction')
            if (pendingActionJson) {
              logger.info(
                'Found pending action after registration. Attempting replay...'
              )

              const pendingAction = JSON.parse(pendingActionJson)
              localStorage.removeItem('pendingAction')

              const { endpoint, method, body, returnPath } = pendingAction
              const newToken = authData.session?.access_token

              if (endpoint && method && newToken) {
                logger.info(`Replaying action: ${method} ${endpoint}`, {
                  body,
                })
                let replayResponse: ApiResponse<unknown> =
                  await (async () => {
                    switch (method.toUpperCase()) {
                      case 'POST':
                        return await api.post(endpoint, body ?? {}, {
                          token: newToken,
                        })
                      case 'PUT':
                        return await api.put(endpoint, body ?? {}, {
                          token: newToken,
                        })
                      case 'DELETE':
                        return await api.delete(endpoint, { token: newToken })
                      case 'GET':
                        return await api.get(endpoint, { token: newToken })
                      default:
                        logger.error(
                          'Unsupported method in pending action replay:',
                          { method }
                        )
                        return {
                          status: 0,
                          error: {
                            code: 'UNSUPPORTED_METHOD',
                            message: 'Unsupported replay method',
                          },
                        }
                    }
                  })()

                if (replayResponse.error) {
                  logger.error('Error replaying pending action:', {
                    status: replayResponse.status,
                    error: replayResponse.error,
                  })
                } else {
                  logger.info(
                    '[AuthStore] Successfully replayed pending action.',
                    { status: replayResponse.status }
                  )

                  // Check if it was the chat endpoint and data has chat_id

                  if (
                    endpoint === 'chat' &&
                    method.toUpperCase() === 'POST' &&
                    replayResponse.data &&
                    typeof (replayResponse.data as any).chat_id === 'string'
                  ) {
                    const chatId = (replayResponse.data as any).chat_id
                    logger.info(
                      `Chat action replayed successfully, storing chatId ${chatId} for redirect.`
                    )
                    try {
                      localStorage.setItem('loadChatIdOnRedirect', chatId)
                    } catch (e: unknown) {
                      logger.error(
                        'Failed to set loadChatIdOnRedirect in localStorage:',
                        {
                          error: e instanceof Error ? e.message : String(e),
                        }
                      )
                    }
                  }
                }

                const navigate = get().navigate
                if (navigate && returnPath) {
                  logger.info(
                    `Replay complete, navigating to original path: ${returnPath}`
                  )
                  navigate(returnPath)
                  navigated = true
                } else {
                  logger.warn(
                    'Could not navigate to returnPath after replay.',
                    { hasNavigate: !!navigate, returnPath }
                  )
                }
              } else {
                logger.error('Invalid pending action data found:', {
                  pendingAction,
                })
              }
            } else {
              logger.info('No pending action found after registration.')
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e)
            logger.error(
              'Error processing pending action after registration:',
              { error: errorMsg }
            )
          }

          // Use the navigate function if available AND if we didn't navigate via returnPath
          if (!navigated) {
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
          }

          return authData.user ?? null
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
          set({ isLoading: true })
          try {
            await api.post('logout', {})
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
        logger.info('App initializing auth store...')
        const storedSession = get().session
        if (!storedSession) {
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
        if (storedSession.expiresAt * 1000 < Date.now()) {
          logger.info('Stored session is expired.')

          // Try to refresh if we have a refresh token
          if (storedSession.refresh_token) {
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
        set({ isLoading: true })
        try {
          const response = await api.get<AuthResponse>('me', {
            token: storedSession.access_token,
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
          const expiresAt = storedSession.expiresAt * 1000
          const now = Date.now()
          const timeUntilExpiry = expiresAt - now

          if (timeUntilExpiry < 10 * 60 * 1000) {
            logger.info('Token expires soon, refreshing...')
            await get().refreshSession()
          }

          // Check for pending action and replay
          await get()._checkAndReplayPendingAction(storedSession.access_token)
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
              await get()._checkAndReplayPendingAction(
                refreshData.session.access_token
              )
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
        const userId = get().user?.id
        if (!userId) {
          set({ error: new AuthRequiredError('User must be logged in to update profile') })
          return null
        }
        set({ isLoading: true, error: null })
        try {
          const response = await api.put<UserProfile, UserProfileUpdate>(
            'me',
            profileData,
            { token: get().session?.access_token }
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

      _checkAndReplayPendingAction: async (
        token: string,
        specifiedReturnPath?: string
      ): Promise<boolean> => {
        let navigated = false
        const navigate = get().navigate
        const pendingActionJson = localStorage.getItem('pendingAction')

        // Early return if no pending action
        if (!pendingActionJson) {
          logger.info('No pending action found in localStorage.')
          return false
        }

        // Remove pending action from storage
        localStorage.removeItem('pendingAction')

        try {
          logger.info('Found pending action. Attempting replay...')
          const pendingAction = JSON.parse(pendingActionJson)
          const { endpoint, method, body, returnPath } = pendingAction
          const effectiveReturnPath = specifiedReturnPath || returnPath

          if (!endpoint || !method || !token) {
            logger.error('Invalid pending action data found:', {
              pendingAction,
            })
            return false
          }

          logger.info(`Replaying action: ${method} ${endpoint}`, { body })

          let replayResponse: ApiResponse<unknown> | null = null

          switch (method.toUpperCase()) {
            case 'POST':
              replayResponse = await api.post(endpoint, body ?? {}, { token })
              break
            case 'PUT':
              replayResponse = await api.put(endpoint, body ?? {}, { token })
              break
            case 'DELETE':
              replayResponse = await api.delete(endpoint, { token })
              break
            case 'GET':
              replayResponse = await api.get(endpoint, { token })
              break
            default:
              logger.error('Unsupported method in pending action replay:', {
                method,
              })
              replayResponse = {
                status: 0,
                error: {
                  code: 'UNSUPPORTED_METHOD',
                  message: 'Unsupported replay method',
                },
              }
          }

          if (replayResponse && !replayResponse.error) {
            logger.info('Successfully replayed pending action.', {
              status: replayResponse.status,
            })

            // Handle special case for chat endpoint
            if (
              (endpoint === 'chat' || endpoint === '/chat') &&
              method.toUpperCase() === 'POST' &&
              replayResponse.data
            ) {
              const chatId = (replayResponse.data as any)?.chat_id
              if (typeof chatId === 'string') {
                logger.info(
                  `Chat action replayed successfully, storing chatId ${chatId} for redirect.`
                )
                try {
                  localStorage.setItem('loadChatIdOnRedirect', chatId)
                } catch (e: unknown) {
                  logger.error('Failed to set loadChatIdOnRedirect:', {
                    error: e instanceof Error ? e.message : String(e),
                  })
                }
              } else {
                logger.warn('Replayed chat response missing string chat_id', {
                  data: replayResponse.data,
                })
              }
            }
          } else if (replayResponse?.error) {
            logger.error('Error replaying pending action:', {
              status: replayResponse.status,
              error: replayResponse.error,
            })
          }

          // Navigate if we have a path and navigation function
          if (navigate && effectiveReturnPath) {
            logger.info(
              `Replay complete, navigating to: ${effectiveReturnPath}`
            )
            navigate(effectiveReturnPath)
            navigated = true
          } else {
            logger.warn('Could not navigate after replay.', {
              hasNavigate: !!navigate,
              returnPath: effectiveReturnPath,
            })
          }

          return navigated
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e)
          logger.error('Error processing pending action:', { error: errorMsg })
          return false
        }
      },
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
