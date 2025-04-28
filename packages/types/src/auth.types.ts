import type { Database } from '@paynless/db-types';
import { NavigateFunction } from './navigation.types'; // Import NavigateFunction

// Define interfaces matching the structure of Supabase User/Session objects
// We only need properties used by our application.
export interface SupabaseUser {
  id: string;
  email?: string;
  role?: string; // Keep as string? or specific roles if known and enforced
  app_metadata: Record<string, any> & { provider?: string };
  user_metadata: Record<string, any>;
  aud: string;
  created_at?: string;
  updated_at?: string;
  // Add other fields if needed from Supabase User, e.g., phone, email_confirmed_at
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number; // In seconds since epoch
  token_type?: string;
  user: SupabaseUser;
  // Add other fields if needed from Supabase Session
}

// Export the DB enum type under the alias UserRole for easier consumption
export type UserRole = Database['public']['Enums']['user_role'];

// Define the type for profile updates - ONLY first/last name
export type UserProfileUpdate = {
  first_name?: string | null; // Match DB nullability
  last_name?: string | null; // Match DB nullability
}

// Define UserProfile using the DB type for consistency
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

export interface AuthStore {
  // Use Supabase types for parameters
  setUser: (user: SupabaseUser | null) => void 
  setSession: (session: SupabaseSession | null) => void
  // Use DB type for profile state
  setProfile: (profile: UserProfile | null) => void // Uses UserProfile alias
  setIsLoading: (isLoading: boolean) => void
  setError: (error: Error | null) => void
  setNavigate: (navigateFn: NavigateFunction) => void
  // Login/Register now just trigger Supabase flow, listener handles state
  login: (email: string, password: string) => Promise<void> 
  register: (email: string, password: string) => Promise<void> 
  logout: () => Promise<void>
  // updateProfile returns the updated DB profile row
  updateProfile: (profileData: UserProfileUpdate) => Promise<UserProfile | null> // Uses UserProfile alias
  updateEmail: (email: string) => Promise<boolean>
  clearError: () => void
  // State properties use Supabase types
  session: SupabaseSession | null
  user: SupabaseUser | null 
  // Use DB type for profile state
  profile: UserProfile | null // Uses UserProfile alias
  isLoading: boolean
  error: Error | null
  navigate: NavigateFunction | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
}

// Response type for login/register endpoints (if still needed)
export interface AuthResponse {
  user: SupabaseUser | null 
  session: SupabaseSession | null
  profile: Database['public']['Tables']['user_profiles']['Row'] | null
}

// Response type specifically for profile fetch (/me)
export interface ProfileResponse {
  user: SupabaseUser // Corrected: Use the imported SupabaseUser type
  profile: Database['public']['Tables']['user_profiles']['Row'] | null // Use DB type and allow null
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
