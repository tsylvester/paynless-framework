import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { LoginRequest, LoginResponse } from '../../../types/auth.types';

/**
 * API client for login operations
 */
export class LoginApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('auth');
  }
  
  /**
   * Login with email and password
   */
  async login(request: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    try {
      logger.info('Logging in user', { email: request.email });
      return await this.baseClient.post<LoginResponse>('/login', request);
    } catch (error) {
      logger.error('Error logging in', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'login_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}