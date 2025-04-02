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
  private refreshDisabled: boolean = false;
  
  private constructor() {
    // Private constructor to enforce singleton
  }

  /**
   * Set whether refresh attempts are disabled
   */
  public setRefreshDisabled(disabled: boolean): void {
    this.refreshDisabled = disabled;
    logger.info("Refresh attempts disabled:", { disabled });
  }

  /**
   * Get whether refresh attempts are disabled
   */
  public isRefreshDisabled(): boolean {
    return this.refreshDisabled;
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
        
        // Check localStorage for access token
        const access_token = localStorage.getItem('access_token');
        logger.debug("Access token status:", { 
          exists: !!access_token,
          length: access_token?.length
        });

        // Public auth endpoints only need the anon key
        const isPublicAuthEndpoint = 
          (config.url?.includes('/login') || config.url?.includes('/register'));
        
        if (isPublicAuthEndpoint) {
          // For public auth endpoints, use empty Bearer token
          logger.debug("Public auth endpoint - using empty Bearer token");
          config.headers['Authorization'] = 'Bearer ';
        } else {
          // For ALL other endpoints, add the JWT if available
          if (access_token) {
            logger.debug("Adding Authorization header with JWT token");
            config.headers['Authorization'] = `Bearer ${access_token}`;
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

          // Check if refresh is disabled
          if (this.refreshDisabled) {
            logger.info("Refresh attempts are disabled, not attempting refresh");
            return Promise.reject(error);
          }
          
          // Attempt to notify global store for session refresh
          if (typeof window !== 'undefined' && window.__AUTH_STORE_REFRESH_SESSION) {
            try {
              logger.info("Attempting to refresh session via global store");
              const refreshSuccessful = await window.__AUTH_STORE_REFRESH_SESSION();
              
              if (refreshSuccessful) {
                logger.info("Session refresh via store successful, retrying request");
                
                // Only proceed if we have the original request config
                if (error.config) {
                  // Clone the original request config
                  const originalRequest: AxiosRequestConfig = { 
                    ...error.config,
                    headers: { ...(error.config.headers as Record<string, string>) }
                  };
                  
                  // Update authorization header with new token
                  const newToken = localStorage.getItem('access_token');
                  originalRequest.headers = {
                    ...(originalRequest.headers as Record<string, string>),
                    'Authorization': `Bearer ${newToken || ''}`
                  };
                  
                  // Use direct axios call instead of client to avoid interceptor loop
                  return axios(originalRequest);
                }
              }
              
              throw new Error("Store-based session refresh failed");
            } catch (storeRefreshError) {
              logger.error("Store-based session refresh failed:", {
                error: storeRefreshError instanceof Error ? storeRefreshError.message : 'Unknown error'
              });
              // Fall back to direct refresh
            }
          }
          
          // Direct refresh fallback
          try {
            const refresh_token = localStorage.getItem('refresh_token');
            if (!refresh_token) {
              logger.error("No refresh token available for token refresh");
              throw new Error("No refresh token available");
            }
            
            // Check if this is a refresh attempt for the /refresh endpoint itself
            // to prevent an infinite loop
            if (error.config?.url?.includes('/refresh')) {
              logger.error("Refresh endpoint itself returned 401 - stopping refresh cycle");
              throw new Error("Refresh endpoint authentication failed");
            }
            
            logger.info("Attempting to refresh the session directly");
            
            // Use our edge function for refresh
            const refreshResponse = await axios.post(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh`,
              { refresh_token: refresh_token },
              { 
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                  // For refresh endpoint, we need to send the refresh token as the JWT
                  'Authorization': `Bearer ${refresh_token}`,
                }
              }
            );
            
            // If refresh successful, update tokens
            if (refreshResponse.data?.session) {
              logger.info("Session refreshed successfully");
              localStorage.setItem('access_token', refreshResponse.data.session.access_token);
              localStorage.setItem('refresh_token', refreshResponse.data.session.refresh_token);
              
              // Only proceed if we have the original request config
              if (error.config) {
                // Clone the original request config
                const originalRequest: AxiosRequestConfig = { 
                  ...error.config,
                  headers: { ...(error.config.headers as Record<string, string>) }
                };
                
                // Update authorization header with new token
                originalRequest.headers = {
                  ...(originalRequest.headers as Record<string, string>),
                  'Authorization': `Bearer ${refreshResponse.data.session.access_token}`,
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
                };
                
                // Use direct axios call instead of client to avoid interceptor loop
                return axios(originalRequest);
              }
            }
            
            throw new Error("Session refresh did not return new tokens");
          } catch (refreshError) {
            logger.error("Session refresh failed:", {
              error: refreshError instanceof Error ? refreshError.message : 'Unknown error'
            });
            
            // Clear tokens and redirect to login
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            
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
          const responseData = error.response.data as { 
            message?: string; 
            error?: string | { message?: string; code?: string }; 
            code?: string;
          };
          
          // Determine the error message - handle different error formats
          let errorMessage = 'An error occurred';
          if (typeof responseData === 'string') {
            errorMessage = responseData;
          } else if (responseData.message) {
            errorMessage = responseData.message;
          } else if (responseData.error && typeof responseData.error === 'object' && 'message' in responseData.error) {
            errorMessage = responseData.error.message || 'Unknown error';
          } else if (responseData.error) {
            errorMessage = typeof responseData.error === 'string' 
              ? responseData.error 
              : JSON.stringify(responseData.error);
          }
          
          // Determine the error code
          let errorCode = 'api_error';
          if (responseData.code) {
            errorCode = responseData.code;
          } else if (responseData.error && typeof responseData.error !== 'string' && responseData.error.code) {
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