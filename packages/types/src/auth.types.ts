import { NavigateFunction } from './navigation.types'; // Import NavigateFunction

export interface User {
  id: string
  email: string
  first_name?: string
  last_name?: string
  avatarUrl?: string
  role: UserRole
  created_at?: string
  updated_at?: string
}

export interface UserProfile {
  id: string
  first_name?: string
  last_name?: string
  avatarUrl?: string
  role: UserRole
  created_at?: string
  updated_at?: string
}

export enum UserRole {
  USER = 'authenticated',
  ADMIN = 'admin',
}

// Define the type for profile updates - ONLY first/last name
export type UserProfileUpdate = {
  first_name?: string
  last_name?: string
}

// Uncomment and modify this interface
export interface AuthStore {
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: UserProfile | null) => void
  setIsLoading: (isLoading: boolean) => void
  setError: (error: Error | null) => void
  setNavigate: (navigateFn: NavigateFunction) => void
  login: (email: string, password: string) => Promise<User | null>
  // Update register signature
  register: (email: string, password: string) => Promise<User | null>
  logout: () => Promise<void>
  initialize: () => Promise<void>
  refreshSession: () => Promise<void>
  // Update updateProfile signature
  updateProfile: (profileData: UserProfileUpdate) => Promise<UserProfile | null>
  updateEmail: (email: string) => Promise<boolean>
  clearError: () => void
  // State properties
  session: Session | null
  user: User | null
  profile: UserProfile | null
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
  user: User | null
  session: Session | null
  profile: UserProfile | null
}

// Response type specifically for profile fetch (/me)
// It might include user data again depending on backend implementation
export interface ProfileResponse {
  user: User
  profile: UserProfile
}

/**
 * Structure of the response from the (potential) token refresh endpoint.
 */
export interface RefreshResponse {
  session: Session | null
  user: User | null
  profile: UserProfile | null
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
