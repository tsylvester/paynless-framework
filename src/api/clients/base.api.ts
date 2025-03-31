import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { ApiError, ApiRequestConfig, ApiResponse, CacheConfig } from '../../types/api.types';
import { logger } from '../../utils/logger';

const API_VERSION = 'v1';

/**
 * Base API client that handles HTTP requests and error handling
 */
export class BaseApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  
  constructor(path: string) {
    // Use Supabase Edge Functions URL
    this.baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.setupInterceptors();
  }
  
  /**
   * Set up request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor for adding auth tokens etc
    this.client.interceptors.request.use(
      (config) => {
        // Don't add auth token for registration requests
        if (!config.url?.includes('/register')) {
          const token = localStorage.getItem('accessToken');
          if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Response interceptor for handling common errors and rate limits
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Handle API errors
        if (error.response) {
          // If unauthorized and not a registration request, try to refresh the token
          if (error.response.status === 401 && !error.config?.url?.includes('/register')) {
            try {
              const refreshToken = localStorage.getItem('refreshToken');
              if (!refreshToken) {
                // If no refresh token, it's a genuine auth error
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                // Only redirect if not on auth pages
                if (!window.location.pathname.match(/^\/(register|login)$/)) {
                  window.location.href = '/login';
                }
                throw new Error('No refresh token available');
              }

              const response = await axios.post(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth/refresh`,
                { refreshToken }
              );

              if (response.data?.access_token) {
                localStorage.setItem('accessToken', response.data.access_token);
                if (response.data.refresh_token) {
                  localStorage.setItem('refreshToken', response.data.refresh_token);
                }
                // Retry the request with the new token
                const config = error.config;
                if (config) {
                  config.headers = config.headers || {};
                  config.headers.Authorization = `Bearer ${response.data.access_token}`;
                  return this.client(config);
                }
              }
            } catch (refreshError) {
              logger.error('Error refreshing token', {
                error: refreshError instanceof Error ? refreshError.message : 'Unknown error',
              });
              // Only redirect to login if it's a genuine authentication error from the API
              // and not from a fallback implementation or auth pages
              const responseData = error.response.data as { code?: string; message?: string; fallback?: boolean };
              if (responseData.code === 'unauthorized' && 
                  responseData.message === 'User not authenticated' &&
                  !responseData.fallback &&
                  !window.location.pathname.match(/^\/(register|login)$/)) {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                window.location.href = '/login';
              }
            }
          }
          
          const responseData = error.response.data as { code?: string; message?: string; details?: unknown };
          const apiError: ApiError = {
            code: responseData.code || 'api_error',
            message: responseData.message || 'An error occurred',
            details: responseData.details,
          };
          
          return Promise.reject({
            error: apiError,
            status: error.response.status,
          });
        }
        
        // Handle network errors
        return Promise.reject({
          error: {
            code: 'network_error',
            message: error.message || 'A network error occurred',
          },
          status: 500,
        });
      }
    );
  }
  
  /**
   * Check if cached data is valid
   */
  private isCacheValid(cacheKey: string, config?: CacheConfig): boolean {
    const cached = this.cache.get(cacheKey);
    if (!cached) return false;
    
    const now = Date.now();
    return now - cached.timestamp < (config?.maxAge || 5 * 60 * 1000); // Default 5 minutes
  }
  
  /**
   * Make a GET request
   */
  async get<T>(path: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.get(path, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return error;
    }
  }
  
  /**
   * Make a POST request
   */
  async post<T>(path: string, data?: any, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.post(path, data, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return error;
    }
  }
  
  /**
   * Make a PUT request
   */
  async put<T>(path: string, data?: any, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.put(path, data, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return error;
    }
  }
  
  /**
   * Make a DELETE request
   */
  async delete<T>(path: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.delete(path, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return error;
    }
  }
}