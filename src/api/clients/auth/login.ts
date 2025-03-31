import { BaseApiClient } from '../base.api';
import { getSupabaseClient } from '../../../utils/supabase';
import { logger } from '../../../utils/logger';
import { ApiResponse, AuthResponse, LoginCredentials } from '../../../types/auth.types';

/**
 * API client for authentication login operations
 */
export class AuthApiLogin {
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
}