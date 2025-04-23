import { create } from 'zustand'
import {
  AuthStore as AuthStoreType,
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
import { api, ApiClient } from '@paynless/api-client'
import { analytics } from '@paynless/analytics-client'
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'
import { replayPendingAction } from './lib/replayPendingAction'

export const useAuthStore = create<AuthStoreType>()(
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
          const supabase = api.getSupabaseClient()
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          })
          if (error) throw error;
          set({ isLoading: false })
          return null // Listener handles state
        } catch (error) {
          const finalError = error instanceof Error ? error : new Error('Unknown login error')
          logger.error('Login action error:', { message: finalError.message })
          set({ isLoading: false, error: finalError, user: null, session: null, profile: null })
          return null
        }
      },

      register: async (email: string, password: string): Promise<User | null> => {
        set({ isLoading: true, error: null })
        try {
          const supabase = api.getSupabaseClient()
          const { error } = await supabase.auth.signUp({ email, password })
          if (error) throw error;
          set({ isLoading: false })
          return null // Listener handles state
        } catch (error) {
          const finalError = error instanceof Error ? error : new Error('Unknown registration error')
          logger.error('Register action error:', { message: finalError.message })
          set({ isLoading: false, error: finalError, user: null, session: null, profile: null })
          return null
        }
      },

      logout: async (): Promise<void> => {
        set({ isLoading: true, error: null })
        analytics.reset()
        try {
          const supabase = api.getSupabaseClient()
          const { error } = await supabase.auth.signOut()
          if (error) logger.error('Supabase sign-out error:', { error })
          localStorage.removeItem('pendingAction')
          localStorage.removeItem('loadChatIdOnRedirect')
        } catch (error) {
          logger.error('Unexpected error during logout action:', { error })
        } finally {
          set({ isLoading: false })
          const navigate = get().navigate
          if (navigate) navigate('login'); 
          else logger.warn('Logout: navigate function not available.')
        }
      },

      initialize: async (): Promise<void> => {
        logger.debug('AuthStore initialize action called (now minimal)')
      },

      refreshSession: async (): Promise<void> => {
        logger.warn('refreshSession not implemented for Supabase v2 listener pattern yet.');
        set({ isLoading: false }); 
      },

      updateProfile: async (profileData: UserProfileUpdate): Promise<UserProfile | null> => {
        logger.warn('updateProfile needs implementation using Supabase client.');
        const token = get().session?.access_token;
        if (!token) {
            set({ error: new Error('Not authenticated') });
            return null;
        }
        set({ error: null });
        try {
             const response = await api.put<UserProfile, UserProfileUpdate>(
               'me',
               profileData,
               { token }
             );
             if (response.data && !response.error) {
                set({ profile: response.data });
                return response.data;
             } else {
                throw new Error(response.error?.message || 'Failed to update profile');
             }
        } catch (error) {
             const finalError = error instanceof Error ? error : new Error('Update profile failed');
             logger.error('Update profile failed', { error: finalError });
             set({ error: finalError });
             return null;
        }
      },

      updateEmail: async (newEmail: string): Promise<boolean> => {
        logger.warn('updateEmail needs implementation using Supabase client.');
         const token = get().session?.access_token; 
         if (!token) {
            set({ error: new Error('Not authenticated') });
            return false;
         }
        set({ error: null });
        try {
             const supabase = api.getSupabaseClient();
             const { error } = await supabase.auth.updateUser({ email: newEmail });
             if (error) throw error;
             logger.info('Supabase email update initiated. Confirmation likely required.');
             return true; 
        } catch (error) {
            const finalError = error instanceof Error ? error : new Error('Update email failed');
            logger.error('Update email failed', { error: finalError });
            set({ error: finalError });
            return false;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({}),
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
