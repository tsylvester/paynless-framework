import type { Database } from '@paynless/db-types';
import { NavigateFunction } from './navigation.types'; // Import NavigateFunction

// Define interfaces matching the structure of Supabase User/Session objects
// We only need properties used by our application.
export interface SupabaseUser {
  id: string;
  email?: string;
  role?: string; // Keep as string? or specific roles if known and enforced
  app_metadata: Record<string, unknown> & { provider?: string };
  user_metadata: Record<string, unknown>;
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

// +++ ADDED Mapped Internal Session Type +++
export type Session = {
  access_token: string;
  refresh_token: string;
  expiresAt: number; // Mapped from expires_at (ensure conversion)
  token_type?: string;
  expires_in?: number;
  // Note: Excludes the nested user object
};
// +++ End Mapped Session Type +++

// Simple User representation based on common needs
// Let's define this type as well for mapping
export type User = {
  id: string;
  email?: string;
  role?: UserRole; // Use the defined UserRole type
  created_at?: string;
  updated_at?: string;
};

// Export the DB enum type under the alias UserRole for easier consumption
export type UserRole = Database['public']['Enums']['user_role'];

// Define the type for profile updates - ONLY first/last name
export type UserProfileUpdate = {
  first_name?: string | null; // Match DB nullability
  last_name?: string | null; // Match DB nullability
  last_selected_org_id?: string | null; // <<< ADD THIS LINE BACK
}

// Define UserProfile using the DB type for consistency
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

// Keep the original AuthStore structure, but use mapped types
export interface AuthStore {
  // Setters
  setUser: (user: User | null) => void // <<< Use mapped User type
  setSession: (session: Session | null) => void // <<< Use mapped Session type
  setProfile: (profile: UserProfile | null) => void // Uses UserProfile alias
  setIsLoading: (isLoading: boolean) => void
  setError: (error: Error | null) => void
  setNavigate: (navigateFn: NavigateFunction) => void

  // Core Auth Actions
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (profileData: UserProfileUpdate) => Promise<UserProfile | null> // Uses UserProfile alias
  updateEmail: (email: string) => Promise<boolean>
  uploadAvatar: (file: File) => Promise<string | null>
  fetchProfile: () => Promise<UserProfile | null>
  checkEmailExists: (email: string) => Promise<boolean>
  requestPasswordReset: (email: string) => Promise<boolean>
  handleOAuthLogin: (provider: 'google' | 'github') => Promise<void>

  // State properties
  session: Session | null // <<< Use mapped Session type
  user: User | null // <<< Use mapped User type
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

// Custom error class for authentication failures
export class AuthRequiredError extends Error {
  constructor(message: string = 'Authentication Required') {
    super(message);
    this.name = 'AuthRequiredError';
    // Ensure the prototype chain is correctly set for instanceof checks
    Object.setPrototypeOf(this, AuthRequiredError.prototype);
  }
}
// +++ End Added Types +++
