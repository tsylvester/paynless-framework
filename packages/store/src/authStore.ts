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

  const handleAuthStateChange = async (event: AuthChangeEvent, session: SupabaseSession | null) => {
    logger.info(`[AuthListener] Auth state change event: ${event}`, { session: !!session });
    initialSessionEventFired = initialSessionEventFired || event === 'INITIAL_SESSION';

    const currentState = useAuthStore.getState();
    const currentMappedSession = mapSupabaseSession(session);
    const currentMappedUser = mapSupabaseUser(session?.user ?? null);

    // Update user and session regardless of the event type initially
    const userChanged = currentState.user?.id !== currentMappedUser?.id || currentState.user?.email !== currentMappedUser?.email;
    const sessionChanged = currentState.session?.access_token !== currentMappedSession?.access_token || currentState.session?.expires_at !== currentMappedSession?.expires_at;

    // Always update user/session if they changed or if it's sign-out
    if (userChanged || sessionChanged || event === 'SIGNED_OUT') {
      set({ 
        user: currentMappedUser, 
        session: currentMappedSession, 
        // Reset profile only on SIGNED_OUT or if user ID changes
        profile: event === 'SIGNED_OUT' || (currentMappedUser?.id !== currentState.user?.id) ? null : currentState.profile,
        isLoading: false, // Mark loading complete after session update
        error: null, // Clear previous errors on auth change
      });
    } else {
      // If only user metadata changed (e.g., USER_UPDATED), just update user
      if (event === 'USER_UPDATED') {
        set({ user: currentMappedUser, isLoading: false });
      } else {
        // Otherwise, just ensure loading is false if nothing significant changed
        set({ isLoading: false });
      }
    }

    // --- Refined Profile Fetching Logic ---
    const shouldFetchProfile = 
        session?.user && 
        (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED');

    if (shouldFetchProfile) {
        logger.debug(`[AuthListener] Fetching profile for ${event}...`, { userId: session.user.id });
        try {
            const { data: profileData, error: profileError } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profileError) {
                // Throw the error to be caught below
                throw profileError;
            }

            if (profileData) {
                set({ profile: profileData as UserProfile, error: null });
                logger.info('[AuthListener] Profile fetched successfully.', { userId: session.user.id });
                // Identify user with analytics after profile is loaded
                analytics.identify(session.user.id, { 
                  email: session.user.email, 
                  name: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim(),
                  // Add other relevant traits from profileData
                });
            } else {
                 // Handle case where profile fetch succeeds but returns no data (shouldn't usually happen if RLS is correct)
                 logger.warn('[AuthListener] Profile fetch returned no data.', { userId: session.user.id });
                 set({ profile: null, error: new Error('User profile not found.') });
            }

        } catch (error: any) {
            logger.error('[AuthListener] Error fetching profile:', error);
            set({ 
                profile: null, 
                error: new Error(`Failed to fetch profile: ${error.message} (Code: ${error.code || 'UNKNOWN'})`) 
            });
        }
    }
    // --- End Refined Profile Fetching Logic ---

  };

  // Subscribe to auth state changes
  const { data: { subscription }, error: subscriptionError } = supabaseClient.auth.onAuthStateChange(handleAuthStateChange);

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
    subscription?.unsubscribe();
  };
}

export const useAuthStoreDevtools = devtools(useAuthStore)
