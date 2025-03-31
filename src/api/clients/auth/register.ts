import { BaseApiClient } from '../base.api';
import { getSupabaseClient } from '../../../utils/supabase';
import { logger } from '../../../utils/logger';
import { ApiResponse, AuthResponse, RegisterCredentials } from '../../../types/auth.types';

/**
 * API client for authentication registration operations
 */
export class AuthApiRegister {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/auth`);
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
}