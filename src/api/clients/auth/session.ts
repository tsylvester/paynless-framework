import { BaseApiClient } from '../base.api';
import { getSupabaseClient } from '../../../utils/supabase';
import { logger } from '../../../utils/logger';
import { ApiResponse, AuthResponse } from '../../../types/auth.types';

/**
 * API client for authentication session operations
 */
export class AuthApiSession {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/auth`);
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
}