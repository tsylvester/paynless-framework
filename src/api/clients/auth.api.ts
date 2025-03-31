import { BaseApiClient } from './base.api';
import { AuthResponse, LoginCredentials, RegisterCredentials } from '../../types/auth.types';
import { ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';
import axios from 'axios';

/**
 * API client for authentication operations
 */
export class AuthApiClient {
  private baseClient: BaseApiClient;
  private baseUrl: string;
  
  constructor() {
    this.baseClient = new BaseApiClient('auth');
    this.baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth`;
  }
  
  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Logging in user', { email });
      return await this.baseClient.post<AuthResponse>('/login', { email, password });
    } catch (error) {
      logger.error('Error logging in', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
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
   * Register a new user
   */
  async register(credentials: RegisterCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Registering user', { email: credentials.email });
      // Use axios directly for registration to avoid auth requirements
      const response = await axios.post<AuthResponse>(`${this.baseUrl}/register`, credentials, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      logger.error('Error registering user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: credentials.email,
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
   * Logout the current user
   */
  async logout(): Promise<ApiResponse<void>> {
    try {
      logger.info('Logging out user');
      return await this.baseClient.post<void>('/logout');
    } catch (error) {
      logger.error('Error logging out', {
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
   * Get the current user
   */
  async getCurrentUser(): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Getting current user');
      return await this.baseClient.get<AuthResponse>('/me');
    } catch (error) {
      logger.error('Error getting current user', {
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
      logger.info('Requesting password reset', { email });
      return await this.baseClient.post<void>('/reset-password', { email });
    } catch (error) {
      logger.error('Error requesting password reset', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
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

export const authApiClient = new AuthApiClient();