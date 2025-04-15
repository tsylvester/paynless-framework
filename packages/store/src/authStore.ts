import { create } from 'zustand';
import { AuthStore as AuthStoreType, AuthResponse, User, Session, UserProfile, UserProfileUpdate, ApiResponse } from '@paynless/types';
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

// --- Helper function type for replay logic ---
type CheckAndReplayFunction = (token: string, specifiedReturnPath?: string) => Promise<boolean>; // Returns true if navigation occurred

export const useAuthStore = create<AuthStoreType & { _checkAndReplayPendingAction: CheckAndReplayFunction }>()(
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

              // ---> Phase 3: Check for and replay pending action <---
              let navigated = false; // Flag to track if we navigated due to pending action
              try {
                  const pendingActionJson = sessionStorage.getItem('pendingAction');
                  if (pendingActionJson) {
                      logger.info('Found pending action after login. Attempting replay...');
                      
                      const pendingAction = JSON.parse(pendingActionJson);
                      sessionStorage.removeItem('pendingAction'); // <-- Clear AFTER parse
                      
                      const { endpoint, method, body, returnPath } = pendingAction;
                      const newToken = authData.session?.access_token;

                      if (endpoint && method && newToken) {
                           logger.info(`Replaying action: ${method} ${endpoint}`, { body });
                           let replayResponse: ApiResponse<unknown>; // Use unknown for generic replay
                           
                           // TODO: Use a more robust way to call the correct api method (Phase 4)
                           switch (method.toUpperCase()) {
                               case 'POST':
                                   replayResponse = await api.post(endpoint, body ?? {}, { token: newToken });
                                   break;
                               case 'PUT':
                                   replayResponse = await api.put(endpoint, body ?? {}, { token: newToken });
                                   break;
                               case 'DELETE':
                                   replayResponse = await api.delete(endpoint, { token: newToken });
                                   break;
                               case 'GET':
                                   replayResponse = await api.get(endpoint, { token: newToken });
                                   break;
                               default:
                                   logger.error('Unsupported method in pending action replay:', { method });
                                   replayResponse = { status: 0, error: { code: 'UNSUPPORTED_METHOD', message: 'Unsupported replay method' } }; 
                           }

                           if (replayResponse.error) {
                               logger.error('Error replaying pending action:', { 
                                   status: replayResponse.status,
                                   error: replayResponse.error 
                               });
                               // TODO: Decide how to handle replay error (e.g., notify user?)
                           } else {
                               logger.info('[AuthStore] Successfully replayed pending action.', { status: replayResponse.status });
                               // ---> START Log Replay Data <---
                               logger.info('[AuthStore] Inspecting replayResponse.data:', { 
                                   data: replayResponse.data, 
                                   dataType: typeof replayResponse.data, 
                                   hasChatId: replayResponse.data ? (replayResponse.data as any).chat_id !== undefined : false,
                                   chatIdType: replayResponse.data ? typeof (replayResponse.data as any).chat_id : 'N/A'
                               });
                               // ---> END Log Replay Data <---
                               // Check if it was the chat endpoint and data has chat_id
                               if (endpoint === '/chat' && method.toUpperCase() === 'POST' && replayResponse.data && typeof (replayResponse.data as any).chat_id === 'string') {
                                   const chatId = (replayResponse.data as any).chat_id;
                                   logger.info(`Chat action replayed successfully, storing chatId ${chatId} for redirect.`);
                                   try {
                                       sessionStorage.setItem('loadChatIdOnRedirect', chatId);
                                   } catch (e: unknown) {
                                       logger.error('Failed to set loadChatIdOnRedirect in sessionStorage:', { 
                                           error: e instanceof Error ? e.message : String(e) 
                                       });
                                   }
                               }
                           }

                           // Navigate to original path if possible
                           const navigate = get().navigate;
                           if (navigate && returnPath) {
                               logger.info(`Replay complete, navigating to original path: ${returnPath}`);
                               navigate(returnPath);
                               navigated = true;
                           } else {
                               logger.warn('Could not navigate to returnPath after replay.', { hasNavigate: !!navigate, returnPath });
                           }
                      } else {
                          logger.error('Invalid pending action data found:', { pendingAction });
                      }
                  }
              } catch (e) {
                  const errorMsg = e instanceof Error ? e.message : String(e);
                  logger.error('Error processing pending action after login:', { error: errorMsg });
                  // Continue with default navigation if processing fails
              }
              // --- End Phase 3 ---

              // Navigate to dashboard only if we didn't navigate based on returnPath
              if (!navigated) {
                  const navigate = get().navigate;
                  if (navigate) {
                    logger.info('Login successful (no pending action/navigation), navigating to dashboard.');
                    navigate('/dashboard');
                  } else {
                    logger.warn('Login successful but navigate function not set in store.');
                  }
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
      
      register: async (email: string, password: string): Promise<User | null> => {
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
                profile: authData.profile,
                isLoading: false,
                error: null,
              });

              // ---> Phase 3: Check for and replay pending action (Register) <---
              let navigated = false; // Flag to track if we navigated due to pending action
              try {
                  const pendingActionJson = sessionStorage.getItem('pendingAction');
                  if (pendingActionJson) {
                      logger.info('Found pending action after registration. Attempting replay...');
                      
                      const pendingAction = JSON.parse(pendingActionJson);
                      sessionStorage.removeItem('pendingAction'); // <-- Clear AFTER parse
                      
                      const { endpoint, method, body, returnPath } = pendingAction;
                      const newToken = authData.session?.access_token;

                      if (endpoint && method && newToken) {
                           logger.info(`Replaying action: ${method} ${endpoint}`, { body });
                           let replayResponse: ApiResponse<unknown> = await (async () => {
                               switch (method.toUpperCase()) {
                                   case 'POST': return await api.post(endpoint, body ?? {}, { token: newToken });
                                   case 'PUT': return await api.put(endpoint, body ?? {}, { token: newToken });
                                   case 'DELETE': return await api.delete(endpoint, { token: newToken });
                                   case 'GET': return await api.get(endpoint, { token: newToken });
                                   default:
                                       logger.error('Unsupported method in pending action replay:', { method });
                                       return { status: 0, error: { code: 'UNSUPPORTED_METHOD', message: 'Unsupported replay method' } }; 
                               }
                           })();

                           if (replayResponse.error) {
                               logger.error('Error replaying pending action:', { status: replayResponse.status, error: replayResponse.error });
                           } else {
                               logger.info('[AuthStore] Successfully replayed pending action.', { status: replayResponse.status });
                               // ---> START Log Replay Data <---
                               logger.info('[AuthStore] Inspecting replayResponse.data:', { 
                                   data: replayResponse.data, 
                                   dataType: typeof replayResponse.data, 
                                   hasChatId: replayResponse.data ? (replayResponse.data as any).chat_id !== undefined : false,
                                   chatIdType: replayResponse.data ? typeof (replayResponse.data as any).chat_id : 'N/A'
                               });
                               // ---> END Log Replay Data <---
                               // Check if it was the chat endpoint and data has chat_id
                               if (endpoint === '/chat' && method.toUpperCase() === 'POST' && replayResponse.data && typeof (replayResponse.data as any).chat_id === 'string') {
                                   const chatId = (replayResponse.data as any).chat_id;
                                   logger.info(`Chat action replayed successfully, storing chatId ${chatId} for redirect.`);
                                   try {
                                       sessionStorage.setItem('loadChatIdOnRedirect', chatId);
                                   } catch (e: unknown) {
                                       logger.error('Failed to set loadChatIdOnRedirect in sessionStorage:', { 
                                           error: e instanceof Error ? e.message : String(e) 
                                       });
                                   }
                               }
                           }

                           const navigate = get().navigate;
                           if (navigate && returnPath) {
                               logger.info(`Replay complete, navigating to original path: ${returnPath}`);
                               navigate(returnPath);
                               navigated = true;
                           } else {
                               logger.warn('Could not navigate to returnPath after replay.', { hasNavigate: !!navigate, returnPath });
                           }
                      } else {
                          logger.error('Invalid pending action data found:', { pendingAction });
                      }
                  } else {
                     logger.info('No pending action found after registration.');
                  }
              } catch (e) {
                  const errorMsg = e instanceof Error ? e.message : String(e);
                  logger.error('Error processing pending action after registration:', { error: errorMsg });
              }
              // --- End Phase 3 (Register) ---

              // Use the navigate function if available AND if we didn't navigate via returnPath
              if (!navigated) {
                 const navigate = get().navigate;
                 if (navigate) {
                     logger.info('Registration successful (no pending action/navigation), navigating to dashboard.');
                     navigate('/dashboard');
                 } else {
                     logger.warn('Registration successful but navigate function not set in store.');
                 }
              }
              
              // Return the user object consistent with login
              return authData.user ?? null;

          } else {
               const errorMessage = response.error?.message || 'Registration failed';
               throw new Error(errorMessage);
          }
        } catch (error) {
          const finalError = error instanceof Error ? error : new Error('Unknown registration error');
          logger.error('Register error in store', { message: finalError.message });
          set({ isLoading: false, error: finalError, user: null, session: null, profile: null });
          // Return null on error, consistent with login
          return null;
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
                logger.error('Logout API call failed, proceeding with local cleanup.', { error: error instanceof Error ? error.message : String(error) });
             } finally {
               // Always clear local state and navigate regardless of API call success/failure
               set({ user: null, session: null, profile: null, isLoading: false, error: null });
               sessionStorage.removeItem('auth-session'); // Clear stored session
               sessionStorage.removeItem('pendingAction'); // Clear any pending action too
             }
        } else if (!token) {
             logger.warn('Logout called but no session token found. Clearing local state only.');
        }
        
        // Move navigation call outside finally block
        const navigate = get().navigate; // Retrieve navigate function
        if (navigate) {
          navigate('/login');
          logger.info('Cleared local state and navigated to /login.');
        } else {
          logger.error('Logout cleanup complete but navigate function not available in store.');
        }
      },
      
      initialize: async () => {
        set({ isLoading: true });
        let session: Session | null = null;
        try {
          const sessionJson = sessionStorage.getItem('auth-session');
          if (sessionJson) {
             try {
                session = JSON.parse(sessionJson) as Session;
                // Validate structure slightly
                if (!session || typeof session.access_token !== 'string' || typeof session.expiresAt !== 'number') {
                  logger.warn('Stored session JSON is invalid or missing required fields.');
                  session = null;
                  sessionStorage.removeItem('auth-session');
                }
             } catch (parseError) {
                logger.error('Failed to parse stored session JSON.', { error: parseError instanceof Error ? parseError.message : String(parseError) });
                session = null;
                sessionStorage.removeItem('auth-session'); 
             }
          } else {
             logger.info('No session found in sessionStorage.');
          }

          // Check if session is expired (only if valid session was parsed)
          if (session && session.expiresAt * 1000 < Date.now()) {
            logger.info('Stored session is expired.');
            session = null;
            sessionStorage.removeItem('auth-session');
          }

          if (session?.access_token) {
            // Session exists and is not expired, try calling /me
            logger.info('Valid session found, verifying token / fetching initial profile...');
            set({ session }); // Optimistically set the session
            const response = await api.get<AuthResponse>('/me', { token: session.access_token });

            if (response.error || !response.data || !response.data.user) {
              const errMsg = response.error?.message || 'Failed to validate session or get user data';
              logger.error('/me call failed after restoring session.', { error: response.error });
              sessionStorage.removeItem('auth-session'); // Clear session on failure
              set({ isLoading: false, user: null, session: null, profile: null, error: new Error(errMsg) });
              return; // Stop initialization
            }

            // /me successful, update user/profile
            logger.info('/me call successful, user authenticated.');
            set({ user: response.data.user, profile: response.data.profile, isLoading: false, error: null });

            // Check for pending action and replay
            await get()._checkAndReplayPendingAction(session.access_token);

          } else {
            // No valid session token found after checks
            logger.info('No valid session token available after checks.');
            set({ user: null, profile: null, session: null, isLoading: false, error: null });
          }

        } catch (error) {
          // Catch errors from api.get or _checkAndReplayPendingAction
          logger.error('Error during initialization process', { error: error instanceof Error ? error.message : String(error) });
          sessionStorage.removeItem('auth-session'); // Ensure removal on any unexpected error
          set({
            isLoading: false,
            user: null,
            session: null,
            profile: null,
            error: new Error('Error during initialization', { cause: error instanceof Error ? error : undefined }),
          });
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
                    // Call replay after successful refresh and state update
                    await get()._checkAndReplayPendingAction(refreshData.session.access_token);
                } else { 
                    /* handle invalid response */ 
                    set({ session: null, user: null, profile: null, isLoading: false, error: new Error('Failed to refresh session (invalid response)') }); 
                    sessionStorage.removeItem('auth-session'); // <-- Add removal for invalid data
                }
           } else {
                const errorMessage = response.error?.message || 'Failed to refresh session';
                // Remove session if API resolves with an error structure
                sessionStorage.removeItem('auth-session'); // <-- Add removal for resolved API error
                throw new Error(errorMessage);
           }
        } catch (error) {
          // Fix: Use original error message, similar to login/register
          const finalError = error instanceof Error ? error : new Error('Error refreshing session');
          logger.error('Refresh session: Error during refresh attempt.', { message: finalError.message });
          // Remove session if API call throws
          sessionStorage.removeItem('auth-session'); // <-- Add removal for caught error
          set({
            session: null, user: null, profile: null,
            isLoading: false,
            error: finalError // Set the new error object
          });
        }
      },
      
      updateProfile: async (profileData: UserProfileUpdate): Promise<UserProfile | null> => {
        set({ isLoading: true });
        const { session, profile } = get(); // Get current session and profile

        if (!session?.access_token) {
          set({ isLoading: false, error: new Error('Authentication required to update profile') });
          return null;
        }

        if (!profile) {
           set({ isLoading: false, error: new Error('Profile not loaded') });
           return null;
        }

        try {
          const payload: Partial<UserProfileUpdate> = {};
          if (profileData.first_name !== undefined) payload.first_name = profileData.first_name;
          if (profileData.last_name !== undefined) payload.last_name = profileData.last_name;

          const response = await api.put<UserProfile, Partial<UserProfileUpdate>>('/profile', payload, { token: session.access_token });

          if (response.error || !response.data) {
            const errMsg = response.error?.message || 'Failed to update profile';
            logger.error('Profile update failed:', { error: response.error });
            set({ isLoading: false, error: new Error(errMsg) });
            return null;
          }

          logger.info('Profile updated successfully.');
          set({ profile: response.data, isLoading: false, error: null });
          return response.data;

        } catch (error) {
          logger.error('Error during profile update:', { error });
          set({
            isLoading: false,
            error: new Error('Failed to update profile'),
          });
          return null;
        }
      },
      clearError: () => set({ error: null }),

      _checkAndReplayPendingAction: async (token: string, specifiedReturnPath?: string): Promise<boolean> => {
        let navigated = false;
        const navigate = get().navigate;
        const pendingActionJson = sessionStorage.getItem('pendingAction');
        // Ensure item is removed regardless of whether it existed or was valid
        sessionStorage.removeItem('pendingAction');
        try {
            if (pendingActionJson) {
                logger.info('Found pending action. Attempting replay...');
                const pendingAction = JSON.parse(pendingActionJson);
                // Destructure needed properties, including providerId
                const { endpoint, method, body, returnPath } = pendingAction;
                const effectiveReturnPath = specifiedReturnPath || returnPath; // Keep effective path logic
                
                if (endpoint && method && token) {
                     logger.info(`Replaying action: ${method} ${endpoint}`, { body });
                     
                     let replayResponse: ApiResponse<unknown> | null = null;
                     
                     switch (method.toUpperCase()) {
                         case 'POST':
                             replayResponse = await api.post(endpoint, body ?? {}, { token });
                             break;
                         case 'PUT':
                             replayResponse = await api.put(endpoint, body ?? {}, { token });
                             break;
                         case 'DELETE':
                             replayResponse = await api.delete(endpoint, { token });
                             break;
                         case 'GET':
                             replayResponse = await api.get(endpoint, { token });
                             break;
                         default:
                             logger.error('Unsupported method in pending action replay:', { method });
                             replayResponse = { status: 0, error: { code: 'UNSUPPORTED_METHOD', message: 'Unsupported replay method' } }; 
                     }

                     if (replayResponse && !replayResponse.error) { 
                         logger.info('Successfully replayed pending action.', { status: replayResponse.status });
                         
                         if (endpoint === 'chat' && method.toUpperCase() === 'POST' && replayResponse.data) {
                            // Keep the essential logic: Store chatId for redirect
                            const chatId = (replayResponse.data as any)?.chat_id;
                            if (typeof chatId === 'string') {
                                logger.info(`Chat action replayed successfully, storing chatId ${chatId} for redirect.`);
                                try {
                                    sessionStorage.setItem('loadChatIdOnRedirect', chatId);
                                } catch (e: unknown) {
                                    logger.error('Failed to set loadChatIdOnRedirect in sessionStorage:', { 
                                        error: e instanceof Error ? e.message : String(e) 
                                    });
                                }
                            } else {
                                 logger.warn('[AuthStore] Replayed chat response missing string chat_id', { data: replayResponse.data });
                            }
                         }
                     } else if (replayResponse?.error) { 
                         logger.error('Error replaying pending action:', { 
                             status: replayResponse.status,
                             error: replayResponse.error 
                         });
                         // TODO: Decide how to handle replay error (e.g., notify user?)
                     } else {
                        logger.error('Pending action replay failed: Unsupported method or other issue.', { method });
                     }

                     if (navigate && effectiveReturnPath) {
                         logger.info(`Replay complete, navigating to original path: ${effectiveReturnPath}`);
                         navigate(effectiveReturnPath);
                         navigated = true;
                     } else {
                         logger.warn('Could not navigate to returnPath after replay.', { hasNavigate: !!navigated, returnPath: effectiveReturnPath });
                     }
                } else {
                    logger.error('Invalid pending action data found:', { pendingAction });
                }
            } else {
                logger.info('No pending action found in sessionStorage.');
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logger.error('Error processing pending action:', { error: errorMsg });
        }
        return navigated;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ session: state.session }),
    }
  )
);