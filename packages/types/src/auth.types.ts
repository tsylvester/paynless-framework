import type { Database } from '@paynless/db-types';
import { NavigateFunction } from './navigation.types'; // Import NavigateFunction

// Keep User interface for combined frontend state, but align properties
// and derive role from DB enum.
export interface User {
  // Properties typically from supabase.auth.user
  id: string; // From SupabaseAuthUser['id']
  email?: string; // From SupabaseAuthUser['email']
  // Properties typically from user_profiles table
  first_name?: string | null; // From Database['public']['Tables']['user_profiles']['Row']['first_name']
  last_name?: string | null; // From Database['public']['Tables']['user_profiles']['Row']['last_name']
  // Role from DB enum
  role: Database['public']['Enums']['user_role']; // Use DB Enum
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

export interface AuthStore {
  setUser: (user: User | null) => void // Uses combined User type
  setSession: (session: Session | null) => void
  // Use DB type for profile state
  setProfile: (profile: Database['public']['Tables']['user_profiles']['Row'] | null) => void
  setIsLoading: (isLoading: boolean) => void
  setError: (error: Error | null) => void
  setNavigate: (navigateFn: NavigateFunction) => void
  login: (email: string, password: string) => Promise<User | null> // Returns combined User
  register: (email: string, password: string) => Promise<User | null> // Returns combined User
  logout: () => Promise<void>
  // updateProfile returns the updated DB profile row
  updateProfile: (profileData: UserProfileUpdate) => Promise<Database['public']['Tables']['user_profiles']['Row'] | null>
  updateEmail: (email: string) => Promise<boolean>
  clearError: () => void
  // State properties
  session: Session | null
  user: User | null // Uses combined User type
  // Use DB type for profile state
  profile: Database['public']['Tables']['user_profiles']['Row'] | null
  isLoading: boolean
  error: Error | null
  navigate: NavigateFunction | null
}

export interface Session {
  access_token: string
  refresh_token: string
  expiresAt: number
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
