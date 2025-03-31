export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: Error | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
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
  user: User | null;
  session: Session | null;
  error?: Error;
}