// src/api/clients/base.api.ts
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { ApiError, ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';

/**
 * Base API client that handles HTTP requests and error handling
 */
export class BaseApiClient {
  private client: AxiosInstance | null = null;
  private static instance: BaseApiClient | null = null;
  
  private constructor() {
    // Private constructor to enforce singleton
  }

  /**
   * Initialize the client if it hasn't been initialized yet
   */
  private initializeClient(): void {
    if (this.client) return;

    // Use Supabase Edge Functions URL
    const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    
    // Log environment variables
    logger.info('Initializing BaseApiClient', {
      baseUrl,
      hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
    });
    
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-client-info': 'api-driven-app',
      },
    });
    
    this.setupInterceptors();
  }

  /**
   * Get the singleton instance of BaseApiClient
   */
  public static getInstance(): BaseApiClient {
    if (!BaseApiClient.instance) {
      logger.info('Creating new BaseApiClient instance');
      BaseApiClient.instance = new BaseApiClient();
    } else {
      logger.debug('Reusing existing BaseApiClient instance');
    }
    
    return BaseApiClient.instance;
  }
  
  /**
   * Set up request and response interceptors
   */
  private setupInterceptors(): void {
    if (!this.client) return;

    // Request interceptor for adding auth token
    this.client.interceptors.request.use(
      (config) => {
        // Debug logging
        logger.debug("Making request to:", { url: config.url, method: config.method });

        // Initialize headers if they don't exist
        config.headers = config.headers || {};

        // Get the anon key
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!anonKey) {
          logger.error("VITE_SUPABASE_ANON_KEY is missing");
          return Promise.reject(new Error("VITE_SUPABASE_ANON_KEY is missing"));
        }
        
        // Always add the apikey header
        config.headers['apikey'] = anonKey;
        
        // Public auth endpoints only need the anon key
        const isPublicAuthEndpoint = 
          (config.url?.includes('/login') || config.url?.includes('/register'));
        
        if (isPublicAuthEndpoint) {
          // For public auth endpoints, use empty Bearer token
          logger.debug("Public auth endpoint - using empty Bearer token");
          config.headers['Authorization'] = 'Bearer ';
        } else {
          // For ALL other endpoints, add the JWT if available
          const accessToken = localStorage.getItem('accessToken');
          if (accessToken) {
            logger.debug("Adding Authorization header with JWT token");
            config.headers['Authorization'] = `Bearer ${accessToken}`;
          } else {
            logger.warn("No access token found for authenticated request");
            // Return a rejection if we don't have a token for a protected endpoint
            return Promise.reject({ 
              error: { 
                code: 'unauthorized', 
                message: 'No authentication token found' 
              },
              status: 401 
            });
          }
        }
        
        return config;
      },
      (error) => {
        logger.error("Request interceptor error:", error);
        return Promise.reject(error);
      }
    );    
    
    // Response interceptor for handling errors and auto refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Log detailed error information
        logger.error("Response error:", { 
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
        
        // Handle 401 Unauthorized errors - token expired or invalid
        if (error.response?.status === 401) {
          logger.info("401 Unauthorized response received");
          
          // Don't try to refresh token for login/register endpoints
          const isAuthEndpoint = error.config?.url?.includes('/login') || 
                                error.config?.url?.includes('/register');
                                
          if (isAuthEndpoint) {
            logger.debug("Auth endpoint 401 - normal authentication failure");
            return Promise.reject(error);
          }
          
          // Try to refresh the session and retry the request
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
              throw new Error("No refresh token available");
            }
            
            logger.info("Attempting to refresh the session");
            
            // Create a new axios instance specifically for the refresh request
            // to avoid interceptor loop
            const refreshResponse = await axios.post(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh`,
              { refresh_token: refreshToken },
              { 
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
                }
              }
            );
            
            // If refresh successful, update tokens
            if (refreshResponse.data?.session) {
              logger.info("Session refreshed successfully");
              localStorage.setItem('accessToken', refreshResponse.data.session.accessToken);
              localStorage.setItem('refreshToken', refreshResponse.data.session.refreshToken);
              
              // Clone the original request config
              const originalRequest = { ...error.config };
              
              // Make sure headers exist
              originalRequest.headers = originalRequest.headers || {};
              
              // Update authorization header with new token
              originalRequest.headers['Authorization'] = 
                `Bearer ${refreshResponse.data.session.accessToken}`;
              
              // Retry the original request with the new token
              return this.client!.request(originalRequest);
            }
            
            throw new Error("Session refresh did not return new tokens");
          } catch (refreshError) {
            logger.error("Session refresh failed:", refreshError);
            
            // Clear tokens and redirect to login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            
            // Redirect to login on next tick to avoid state updates during render
            setTimeout(() => {
              window.location.href = '/login';
            }, 0);
            
            return Promise.reject({
              error: {
                code: 'session_expired',
                message: 'Your session has expired. Please log in again.',
              },
              status: 401,
            });
          }
        }
        
        // Handle API errors
        if (error.response) {
          // Try to extract error information from the response
          const responseData = error.response.data as any;
          
          // Determine the error message - handle different error formats
          let errorMessage = 'An error occurred';
          if (typeof responseData === 'string') {
            errorMessage = responseData;
          } else if (responseData.message) {
            errorMessage = responseData.message;
          } else if (responseData.error?.message) {
            errorMessage = responseData.error.message;
          } else if (responseData.error) {
            errorMessage = typeof responseData.error === 'string' 
              ? responseData.error 
              : JSON.stringify(responseData.error);
          }
          
          // Determine the error code
          let errorCode = 'api_error';
          if (responseData.code) {
            errorCode = responseData.code;
          } else if (responseData.error?.code) {
            errorCode = responseData.error.code;
          }
          
          const apiError: ApiError = {
            code: errorCode,
            message: errorMessage,
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
   * Make a GET request
   */
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      this.initializeClient();
      logger.debug(`Making GET request to: ${path}`);
      const response = await this.client!.get<T>(path, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      return error as ApiResponse<T>;
    }
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      this.initializeClient();
      logger.debug(`Making POST request to: ${path}`);
      const response = await this.client!.post<T>(path, data, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      return error as ApiResponse<T>;
    }
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      this.initializeClient();
      const response = await this.client!.put<T>(path, data, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      return error as ApiResponse<T>;
    }
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      this.initializeClient();
      const response = await this.client!.delete<T>(path, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      return error as ApiResponse<T>;
    }
  }
}