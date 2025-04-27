import { create } from 'zustand'
import {
  AuthStore,
  AuthState,
  User,
  Session,
  UserProfileUpdate,
  UserProfile,
  UserRole,
  ISupabaseAuthClient,
  ISupabaseDataClient,
  NavigateFunction,
} from '@paynless/types'
import { logger } from '@paynless/utils'
import { analytics } from '@paynless/analytics'
import type { AuthChangeEvent, Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js'
import { devtools } from 'zustand/middleware'

const initialAuthState: Omit<AuthState, 'navigate'> = {
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  error: null,
  supabaseClient: null,
  _listenerInitialized: false,
}

const authStoreCreator = (set: (partial: Partial<AuthState>) => void, get: () => AuthState): AuthStore => ({
  ...initialAuthState,
  navigate: null,

  setNavigate: (navigateFn: NavigateFunction) => set({ navigate: navigateFn }),

  setUser: (user: User | null) => set({ user }),

  setSession: (session: Session | null) => set({ session }),

  setProfile: (profile: UserProfile | null) => set({ profile }),

  setIsLoading: (isLoading: boolean) => set({ isLoading }),

  setError: (error: Error | null) => set({ error }),

  setSupabaseClient: (client: any | null) => set({ supabaseClient: client }),

  _setListenerInitialized: (initialized: boolean) => set({ _listenerInitialized: initialized }),

  login: async (authClient: ISupabaseAuthClient, email: string, password: string): Promise<User | null> => {
    set({ isLoading: true, error: null })
    logger.info('Attempting to login user via form', { email: email })
    try {
      const { error: signInError } = await authClient.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      return null;
    } catch (error) {
      const finalError =
        error instanceof Error ? error : new Error('Unknown login error');
      logger.error('Login error in store', { message: finalError.message });
      set({
        isLoading: false,
        error: finalError,
      });
      return null;
    } finally {
        set({ isLoading: false });
    }
  },

  register: async (authClient: ISupabaseAuthClient, email: string, password: string): Promise<User | null> => {
    set({ isLoading: true, error: null })
    try {
      const { error: signUpError } = await authClient.signUp({ email, password });
      if (signUpError) throw signUpError;
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
      });
      return null;
    } finally {
        set({ isLoading: false });
    }
  },

  logout: async (authClient: ISupabaseAuthClient | null) => {
    analytics.reset()

    const currentSession = get().session;

    if (currentSession) {
      try {
        if (!authClient) {
          logger.error('Logout cannot call Supabase: authClient not provided.');
        } else {
          const { error: signOutError } = await authClient.signOut()
          if (signOutError) {
              logger.error('Supabase signOut failed, proceeding with local cleanup.', { error: signOutError.message })
          }
        }
      } catch (error) {
        logger.error(
          'Logout Supabase call failed unexpectedly, proceeding with local cleanup.',
          { error: error instanceof Error ? error.message : String(error) }
        )
      }
    } else {
      logger.warn('Logout called but no session token found. Clearing local state only.');
    }
    
    try { 
      localStorage.removeItem('pendingAction')
      localStorage.removeItem('loadChatIdOnRedirect')
    } catch(storageError) {
       logger.error('Error clearing localStorage during logout', { error: storageError instanceof Error ? storageError.message : String(storageError) });
    }

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

  updateProfile: async (dataClient: ISupabaseDataClient, userId: string, profileData: UserProfileUpdate): Promise<UserProfile | null> => {
    set({ error: null })

    if (!userId) {
      logger.error(
        'updateProfile: Cannot update profile, user not authenticated or ID missing.'
      )
      set({ error: new Error('Authentication required'), isLoading: false }) 
      return null
    }

    set({ isLoading: true });
    try {
      const { data: updatedProfileData, error: updateError } = await dataClient
        .from('user_profiles')
        .update(profileData)
        .eq('id', userId)
        .select()
        .single();

      if (updateError) {
        logger.error('updateProfile: Failed to update profile in Supabase', { error: updateError });
        set({ error: new Error(updateError.message || 'Failed to update profile'), isLoading: false });
        return null;
      }

      if (!updatedProfileData) {
        logger.error('updateProfile: No profile data returned after update');
        set({ error: new Error('No profile data returned after update'), isLoading: false });
        return null;
      }

      const updatedProfile = updatedProfileData as UserProfile; 
      logger.info('updateProfile: Profile updated successfully', { userId });
      set({ profile: updatedProfile, isLoading: false, error: null });
      return updatedProfile;
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An unknown error occurred during profile update')
      logger.error('updateProfile: Unknown error', { error: error.message });
      set({ error, isLoading: false })
      return null
    } finally {
      set({ isLoading: false })
    }
  },

  updateEmail: async (authClient: ISupabaseAuthClient, newEmail: string): Promise<boolean> => {
    set({ error: null })
    
    set({ isLoading: true })
    try {
      const { error: updateError } = await authClient.updateUser({ email: newEmail });
      if (updateError) throw updateError;

      logger.info('Email update initiated via Supabase. User may need to confirm.');
      set({ isLoading: false });
      return true;

    } catch (error) {
      const finalError =
        error instanceof Error ? error : new Error('Unknown email update error');
      logger.error('Update email error', { message: finalError.message });
      set({ error: finalError, isLoading: false });
      return false;
    } finally {
       set({ isLoading: false }); 
    }
  },

  clearError: () => set({ error: null }),
})

export const useAuthStore = create<AuthStore>()(authStoreCreator)

const mapSupabaseUser = (supabaseUser: any): User | null => {
  if (!supabaseUser) return null;

  let role: UserRole = 'user';
  if (supabaseUser.role === 'admin' || supabaseUser.role === 'user') {
    role = supabaseUser.role;
  }
  
  const updatedAt = supabaseUser.updated_at ?? supabaseUser.created_at;

  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    role: role,
    created_at: supabaseUser.created_at,
    updated_at: updatedAt,
  };
};

const mapSupabaseSession = (supabaseSession: any): Session | null => {
  if (!supabaseSession) return null;
  
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const expiresAtTimestamp = supabaseSession.expires_at ?? (supabaseSession.expires_in ? nowInSeconds + supabaseSession.expires_in : nowInSeconds);
  
  return {
    access_token: supabaseSession.access_token,
    refresh_token: supabaseSession.refresh_token,
    expires_at: expiresAtTimestamp, 
    token_type: supabaseSession.token_type,
    expires_in: supabaseSession.expires_in,
  };
};

export function initAuthListener(supabaseClient: SupabaseClient): () => void {
  if (!supabaseClient) {
    logger.error('[AuthListener] Invalid Supabase client passed. Cannot initialize listener.');
    useAuthStore.setState({ isLoading: false, error: new Error('Auth listener failed: Invalid Supabase client') });
    return () => { logger.warn('[AuthListener] No-op unsubscribe called (listener never initialized).'); };
  }
  if (typeof supabaseClient.auth?.onAuthStateChange !== 'function') {
      logger.error('[AuthListener] Passed client is missing auth.onAuthStateChange method.', { clientReceived: supabaseClient });
      useAuthStore.setState({ isLoading: false, error: new Error('Auth listener failed: Invalid client object') });
      return () => { logger.warn('[AuthListener] No-op unsubscribe called (listener never initialized - invalid client).'); };
  }

  logger.debug('[AuthListener] Initializing Supabase auth listener with passed client...');
  let initialSessionEventFired = false;

  const { data: listener } = supabaseClient.auth.onAuthStateChange(
    (event: AuthChangeEvent, session: SupabaseSession | null) => {
      try {
        logger.debug(`[AuthListener] Event received: ${event}`);
        if (event === 'INITIAL_SESSION') {
          initialSessionEventFired = true;
        }

        const storeSession = mapSupabaseSession(session);
        const storeUser = mapSupabaseUser(session?.user ?? null);

        switch (event) {
          case 'INITIAL_SESSION':
            useAuthStore.setState({
              session: storeSession,
              user: storeUser,
              isLoading: false, 
              error: null,
              profile: undefined, 
            });
            break;
          case 'SIGNED_IN':
            useAuthStore.setState({
              session: storeSession,
              user: storeUser,
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
              session: storeSession,
              user: storeUser,
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
            useAuthStore.setState({ user: storeUser }); 
            break;
          case 'PASSWORD_RECOVERY':
            useAuthStore.setState({ isLoading: false });
            break;
          default:
            useAuthStore.setState({ isLoading: false }); 
            break;
        }

        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && storeSession?.access_token) {
            setTimeout(async () => { 
                const startTime = Date.now();
                logger.debug(`[AuthListener] Performing async tasks for ${event}`);
                try {
                    if (!storeUser?.id) {
                      logger.error(`[AuthListener] Cannot fetch profile for ${event}: User ID is missing.`);
                      useAuthStore.setState({ profile: null, error: new Error('User ID missing for profile fetch') });
                      return;
                    }

                    logger.debug(`[AuthListener] Fetching profile for user ${storeUser.id} during ${event}...`);
                    const profileStartTime = Date.now();
                    const { data: profileData, error: profileError } = await supabaseClient
                      .from('profiles')
                      .select('*')
                      .eq('id', storeUser.id)
                      .single();
                    const profileEndTime = Date.now();
                    logger.debug(`[AuthListener] Profile fetch completed for ${event}. Duration: ${profileEndTime - profileStartTime}ms`);

                    if (profileError) {
                        logger.error(`[AuthListener] Failed to fetch profile for ${event}`, { error: profileError });
                        const errorMessage = `Failed to fetch profile: ${profileError.message}${profileError.code ? ` (Code: ${profileError.code})` : ''}`;
                        useAuthStore.setState({ profile: null, error: new Error(errorMessage) });
                    } else if (profileData) {
                        logger.debug(`[AuthListener] Profile fetched successfully for ${event}`);
                        useAuthStore.setState({ profile: profileData as UserProfile });
                    } else {
                        logger.warn(`[AuthListener] Profile fetch for ${event} returned no data and no error for user ${storeUser.id}.`);
                        useAuthStore.setState({ profile: null });
                    }

                } catch (asyncError) {
                    logger.error(`[AuthListener] Error during async tasks for ${event}`, { 
                        error: asyncError instanceof Error ? asyncError.message : String(asyncError) 
                    });
                } finally {
                    const endTime = Date.now();
                    logger.debug(`[AuthListener] Finished async tasks for ${event}. Total duration: ${endTime - startTime}ms`);
                }
            }, 0);
        } 

      } catch (callbackError) {
        logger.error('!!!!!! ERROR INSIDE onAuthStateChange CALLBACK !!!!!!', {
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
          stack: callbackError instanceof Error ? callbackError.stack : undefined,
          event,
          session
        });
        useAuthStore.setState({ isLoading: false, error: new Error('Auth listener callback failed') });
      }
    }
  );
  logger.debug('[AuthListener] Listener attached.');

  logger.debug('[AuthListener] Manually fetching initial session using passed client...');
  supabaseClient.auth.getSession()
    .then(({ data }: { data: { session: SupabaseSession | null } }) => {
        if (!initialSessionEventFired) {
            logger.warn('[AuthListener] Listener likely missed INITIAL_SESSION event. Manually setting initial state from getSession().');
            const initialSession = data.session;
            const storeSession = mapSupabaseSession(initialSession);
            const storeUser = mapSupabaseUser(initialSession?.user ?? null);

            useAuthStore.setState({
              session: storeSession,
              user: storeUser,
              isLoading: false,
              error: null,
              profile: undefined,
            });
            
            if (storeSession?.access_token) {
                  setTimeout(async () => {
                    try {
                       logger.debug('[AuthListener] Manually triggering profile fetch after getSession()');
                       if (!storeUser?.id) {
                          logger.error('[AuthListener] Cannot fetch profile manually: User ID is missing.');
                          useAuthStore.setState({ profile: null, error: new Error('User ID missing for manual profile fetch') });
                          return; 
                       }
                       const { data: profileData, error: profileError } = await supabaseClient
                         .from('profiles')
                         .select('*')
                         .eq('id', storeUser.id)
                         .single();

                       if (profileError) {
                           logger.error('[AuthListener] Error during manual profile fetch', { error: profileError });
                           const errorMessage = `Manual profile fetch failed: ${profileError.message}${profileError.code ? ` (Code: ${profileError.code})` : ''}`;
                           useAuthStore.setState({ profile: null, error: new Error(errorMessage) });
                       } else if (profileData) {
                           logger.debug('[AuthListener] Manual profile fetch successful.');
                           useAuthStore.setState({ profile: profileData as UserProfile });
                       } else {
                           logger.warn('[AuthListener] Manual profile fetch returned no data and no error.');
                           useAuthStore.setState({ profile: null });
                       }
                    } catch(e) {
                         logger.error('[AuthListener] Unexpected error during manual profile fetch execution', { error: e });
                         const error = e instanceof Error ? e : new Error('Unknown error during manual profile fetch');
                         useAuthStore.setState({ profile: null, error: error });
                    }
                  }, 0);
            }
        } else {
             logger.debug('[AuthListener] Initial session event was handled by listener, manual getSession() update skipped.');
        }
    })
    .catch((error: any) => {
        logger.error('[AuthListener] Error during manual getSession() call:', { error });
        if (!initialSessionEventFired) {
             useAuthStore.setState({ isLoading: false, error: new Error('Failed to get initial session') });
        }
    });

  logger.debug('[AuthListener] Function execution finished.');
  return () => {
    logger.debug('[AuthListener] Unsubscribing Supabase auth listener.');
    listener?.subscription.unsubscribe();
  };
}

export const useAuthStoreDevtools = devtools(useAuthStore)
