import type { Database } from '@paynless/db-types';
import { NavigateFunction } from './navigation.types'; // Import NavigateFunction
// Avoid direct Supabase types here, define interfaces instead
// import type { SupabaseClient } from '@supabase/supabase-js'; 
import type { User as SupabaseAuthUser, Session as SupabaseSession, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, UserAttributes } from '@supabase/supabase-js'; // Import only specific types needed for interfaces

// Export the DB enum type under the alias UserRole for easier consumption
export type UserRole = Database['public']['Enums']['user_role'];

// Keep User interface for combined frontend state, but align properties
// and derive role from DB enum.
export interface User {
  // Properties typically from supabase.auth.user
  id: string; // From SupabaseAuthUser['id']
  email?: string; // From SupabaseAuthUser['email']
  // Properties typically from user_profiles table
  first_name?: string | null; // From Database['public']['Tables']['user_profiles']['Row']['first_name']
  last_name?: string | null; // From Database['public']['Tables']['user_profiles']['Row']['last_name']
  // Use the exported alias
  role: UserRole; 
  // Timestamps might come from either or be app-specific
  created_at?: string;
  updated_at?: string;
  // avatarUrl is not standard, assuming it's in user_profiles or handled separately
  avatarUrl?: string; 
}

// Define the type for profile updates - ONLY first/last name
export type UserProfileUpdate = {
  first_name?: string | null; // Match DB nullability
  last_name?: string | null; // Match DB nullability
}

// Define UserProfile using the DB type for consistency
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

// +++ Define Minimal Client Interfaces +++

/** Represents the subset of Supabase Auth client needed by the store */
export interface ISupabaseAuthClient {
  signInWithPassword(credentials: SignInWithPasswordCredentials): Promise<{ error: Error | null, data: { user: SupabaseAuthUser | null, session: SupabaseSession | null } }>;
  signUp(credentials: SignUpWithPasswordCredentials): Promise<{ error: Error | null, data: { user: SupabaseAuthUser | null, session: SupabaseSession | null } }>;
  signOut(): Promise<{ error: Error | null }>;
  updateUser(attributes: UserAttributes): Promise<{ error: Error | null, data: { user: SupabaseAuthUser | null } }>;
  // Add other needed methods like resetPasswordForEmail, etc.
}

/** Represents the subset of Supabase Data client needed by the store */
export interface ISupabaseDataClient {
  // Simplified representation - adjust based on actual usage if needed
  from(table: string): {
    update(values: Partial<UserProfile>): any; // Use UserProfile from this file
    // Methods used after update:
    eq(column: string, value: any): any;
    select(columns?: string): any;
    // Method used after select:
    single(): Promise<{ data: UserProfile | null; error: Error | null; /* other potential props like status, count */ }>; 
  };
}

// +++ End Client Interfaces +++


// Define AuthActions separately for clarity
export interface AuthActions {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: Error | null) => void;
  setNavigate: (navigateFn: NavigateFunction) => void;
  // Use interfaces in action signatures
  login: (authClient: ISupabaseAuthClient, email: string, password: string) => Promise<User | null>; 
  register: (authClient: ISupabaseAuthClient, email: string, password: string) => Promise<User | null>; 
  logout: (authClient: ISupabaseAuthClient | null) => Promise<void>;
  updateProfile: (dataClient: ISupabaseDataClient, userId: string, profileData: UserProfileUpdate) => Promise<UserProfile | null>; 
  updateEmail: (authClient: ISupabaseAuthClient, email: string) => Promise<boolean>; 
  clearError: () => void;
  // Internal actions (consider if they should be part of the public interface)
  setSupabaseClient: (client: any | null) => void; // Keep 'any' for now if initAuthListener needs it directly
  _setListenerInitialized: (initialized: boolean) => void;
}

// Define AuthState separately
export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  error: Error | null;
  navigate: NavigateFunction | null;
  supabaseClient: any | null; // Keep 'any' here to match AuthActions
  _listenerInitialized: boolean;
}

// Combine state and actions for the final store type
export type AuthStore = AuthState & AuthActions;

export interface Session {
  access_token: string
  refresh_token: string
  expires_at: number
  token_type?: string
  expires_in?: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
}

// Response type for login/register/refresh endpoints
export interface AuthResponse {
  user: User | null // Keep combined User for convenience?
  session: Session | null
  profile: Database['public']['Tables']['user_profiles']['Row'] | null // Use DB type
}

// Response type specifically for profile fetch (/me)
// It might include user data again depending on backend implementation
export interface ProfileResponse {
  user: User // Keep combined User?
  profile: Database['public']['Tables']['user_profiles']['Row'] // Use DB type
}

/**
 * Structure of the response from the (potential) token refresh endpoint.
 */
export interface RefreshResponse {
  session: Session | null
  user: User | null // Keep combined User?
  profile: Database['public']['Tables']['user_profiles']['Row'] | null // Use DB type
}

/**
 * Structure of the pending action details stored in localStorage for replay.
 */
export interface PendingAction {
  endpoint: string;
  method: string;
  body?: Record<string, unknown> | null;
  returnPath: string;
}
