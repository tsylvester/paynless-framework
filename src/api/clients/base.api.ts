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
        console.log("Making request to:", config.url);
        console.log("Request method:", config.method);

        // Initialize headers if they don't exist
        config.headers = config.headers || {};

        // Get the anon key
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!anonKey) {
          console.error("VITE_SUPABASE_ANON_KEY is missing");
          return Promise.reject(new Error("VITE_SUPABASE_ANON_KEY is missing"));
        }
        
        // Always add the apikey header
        config.headers['apikey'] = anonKey;
        
        // IMPORTANT: Supabase Edge Functions REQUIRE a JWT in the Authorization header to invoke the function
        // This is separate from any tokens sent in the request body
        // Only login/register endpoints can use an empty Bearer token
        const isPublicAuthEndpoint = config.url?.includes('/login') || 
                                   config.url?.includes('/register');
        
        if (isPublicAuthEndpoint) {
          // For public auth endpoints, add empty Authorization header
          console.log("Public auth endpoint detected - using empty Bearer token");
          config.headers['Authorization'] = 'Bearer ';
        } else {
          // For ALL other endpoints (including session), add the JWT if available
          const accessToken = localStorage.getItem('accessToken');
          if (accessToken) {
            console.log("Adding Authorization header with JWT token");
            config.headers['Authorization'] = `Bearer ${accessToken}`;
          } else {
            console.log("No access token found in localStorage");
          }
        }
        
        // Log the final headers for debugging
        console.log("Final request headers:", JSON.stringify(config.headers, null, 2));
        return config;
      },
      (error) => {
        console.error("Request interceptor error:", error);
        return Promise.reject(error);
      }
    );    
    
    // Response interceptor for handling errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Log detailed error information
        console.error("Response error:", error.message);
        
        if (error.response) {
          console.error("Response data:", error.response.data);
          console.error("Response status:", error.response.status);
          console.error("Response headers:", error.response.headers);

          // Handle 401 errors
          if (error.response.status === 401) {
            // Only clear tokens and redirect if it's a session endpoint error
            if (error.config?.url?.includes('/session')) {
              console.log("Session endpoint returned 401 - clearing tokens and redirecting to login");
              // Clear tokens
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              
              // Redirect to login
              window.location.href = '/login';
            } else {
              console.log("Non-session endpoint returned 401 - not clearing tokens");
            }
          }
        } else if (error.request) {
          console.error("Request error (no response received):", error.request);
        } else {
          console.error("Error setting up request:", error.message);
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
      console.log(`Making GET request to: ${path}`);
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
      console.log(`Making POST request to: ${path}`);
      console.log('POST data:', data);
      const response = await this.client!.post<T>(path, data, config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      console.error('POST request failed:', error);
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