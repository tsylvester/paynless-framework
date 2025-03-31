import { BaseApiClient } from './base.api';
import { AuthResponse, LoginCredentials, RegisterCredentials } from '../../types/auth.types';
import { ApiResponse } from '../../types/api.types';
import { getSupabaseClient } from '../../utils/supabase';
import { logger } from '../../utils/logger';

/**
 * API client for authentication operations
 */
export class AuthApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/auth`);
  }
  
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      const { data: authData, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });
      
      if (error) {
        return {
          error: {
            code: 'auth_error',
            message: error.message,
            details: error,
          },
          status: 401,
        };
      }
      
      if (!authData?.session) {
        return {
          error: {
            code: 'auth_error',
            message: 'Failed to get session',
          },
          status: 401,
        };
      }
      
      // Get user profile data - use maybeSingle() instead of single() to handle when profile doesn't exist
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authData.user?.id)
        .maybeSingle();
      
      // If profile doesn't exist, create one
      if (!profile && authData.user) {
        logger.info('Profile not found during login, creating new profile', { userId: authData.user.id });
        
        try {
          await this.supabase.from('user_profiles').insert([
            {
              id: authData.user.id,
              first_name: '',
              last_name: '',
              role: 'user',
            },
          ]);
          
          logger.info('Created profile during login', { userId: authData.user.id });
        } catch (insertError) {
          logger.error('Failed to create profile during login', { 
            error: insertError instanceof Error ? insertError.message : 'Unknown error',
            userId: authData.user.id,
          });
        }
      }
      
      // Store tokens
      localStorage.setItem('accessToken', authData.session.access_token);
      localStorage.setItem('refreshToken', authData.session.refresh_token);
      
      return {
        data: {
          user: {
            id: authData.user?.id || '',
            email: authData.user?.email || '',
            firstName: profile?.first_name || '',
            lastName: profile?.last_name || '',
            avatarUrl: profile?.avatar_url || '',
            role: profile?.role || 'user',
            createdAt: authData.user?.created_at || new Date().toISOString(),
            updatedAt: profile?.updated_at || new Date().toISOString(),
          },
          session: {
            accessToken: authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            expiresAt: new Date(authData.session.expires_at || 0).getTime(),
          },
        },
        status: 200,
      };
    } catch (error) {
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Register a new user
   */
  async register(credentials: RegisterCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      const { data: authData, error } = await this.supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
      });
      
      if (error) {
        return {
          error: {
            code: 'auth_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      if (!authData?.user) {
        return {
          error: {
            code: 'auth_error',
            message: 'Failed to create user',
          },
          status: 400,
        };
      }
      
      // Create user profile
      try {
        logger.info('Creating user profile during registration', { userId: authData.user.id });
        const { error: profileError } = await this.supabase.from('user_profiles').insert([
          {
            id: authData.user.id,
            first_name: credentials.firstName || '',
            last_name: credentials.lastName || '',
            role: 'user',
          },
        ]);
        
        if (profileError) {
          logger.error('Failed to create profile during registration', { 
            error: profileError.message,
            userId: authData.user.id,
          });
        } else {
          logger.info('Created profile during registration', { userId: authData.user.id });
        }
      } catch (profileError) {
        logger.error('Exception creating profile during registration', { 
          error: profileError instanceof Error ? profileError.message : 'Unknown error',
          userId: authData.user.id,
        });
      }
      
      return {
        data: {
          user: {
            id: authData.user.id,
            email: authData.user.email || '',
            firstName: credentials.firstName || '',
            lastName: credentials.lastName || '',
            role: 'user',
            createdAt: authData.user.created_at || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          session: authData.session ? {
            accessToken: authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            expiresAt: new Date(authData.session.expires_at || 0).getTime(),
          } : null,
        },
        status: 201,
      };
    } catch (error) {
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Logout the current user
   */
  async logout(): Promise<ApiResponse<void>> {
    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) {
        return {
          error: {
            code: 'auth_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Clear stored tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      
      return {
        status: 200,
      };
    } catch (error) {
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get the current user
   */
  async getCurrentUser(): Promise<ApiResponse<AuthResponse>> {
    try {
      // Try to get the current user from Supabase
      let authDataResult;
      try {
        authDataResult = await this.supabase.auth.getUser();
      } catch (fetchError) {
        logger.error('Error fetching current user from Supabase', {
          error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        });
        
        return {
          data: { user: null, session: null },
          status: 401,
        };
      }
      
      const { data: authData, error } = authDataResult;
      
      if (error || !authData?.user) {
        return {
          data: { user: null, session: null },
          status: 401,
        };
      }
      
      // Get user profile data - use maybeSingle() instead of single() to handle when profile doesn't exist
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();
      
      // If profile doesn't exist, create one
      if (!profile) {
        logger.info('Profile not found during getCurrentUser, creating new profile', { userId: authData.user.id });
        
        try {
          await this.supabase.from('user_profiles').insert([
            {
              id: authData.user.id,
              first_name: '',
              last_name: '',
              role: 'user',
            },
          ]);
          
          logger.info('Created profile during getCurrentUser', { userId: authData.user.id });
        } catch (insertError) {
          logger.error('Failed to create profile during getCurrentUser', { 
            error: insertError instanceof Error ? insertError.message : 'Unknown error',
            userId: authData.user.id,
          });
        }
      }
      
      // Get current session
      const { data: sessionData } = await this.supabase.auth.getSession();
      
      return {
        data: {
          user: {
            id: authData.user.id,
            email: authData.user.email || '',
            firstName: profile?.first_name || '',
            lastName: profile?.last_name || '',
            avatarUrl: profile?.avatar_url || '',
            role: profile?.role || 'user',
            createdAt: authData.user.created_at || new Date().toISOString(),
            updatedAt: profile?.updated_at || new Date().toISOString(),
          },
          session: sessionData.session ? {
            accessToken: sessionData.session.access_token,
            refreshToken: sessionData.session.refresh_token,
            expiresAt: new Date(sessionData.session.expires_at || 0).getTime(),
          } : null,
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Unexpected error in getCurrentUser', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<ApiResponse<void>> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email);
      
      if (error) {
        return {
          error: {
            code: 'auth_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        status: 200,
      };
    } catch (error) {
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

export const authApiClient = new AuthApiClient();