import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { RegisterRequest, RegisterResponse } from '../../../types/auth.types';

/**
 * API client for registration operations
 */
export class RegisterApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('auth');
  }
  
  /**
   * Register a new user
   */
  async register(request: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
    try {
      logger.info('Registering new user', { email: request.email });
      return await this.baseClient.post<RegisterResponse>('/register', request);
    } catch (error) {
      logger.error('Error registering user', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'register_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}