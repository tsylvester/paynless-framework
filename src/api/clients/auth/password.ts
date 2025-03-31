import { BaseApiClient } from '../base.api';
import { getSupabaseClient } from '../../../utils/supabase';
import { ApiResponse } from '../../../types/auth.types';

/**
 * API client for authentication password operations
 */
export class AuthApiPassword {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/auth`);
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