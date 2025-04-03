export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatarUrl?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}
export interface AuthStore {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: Error | null) => void;
  login: (email: string, password: string) => Promise<User | null>;
  register: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  error: Error | null;
}
export interface Session {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  session: Session;
  profile: UserProfile;
}

// Type for successful Profile Edge Function Data Payload
export interface ProfileResponse {
  user: User;
  profile: UserProfile;
}