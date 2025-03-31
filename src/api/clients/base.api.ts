// src/api/clients/base.api.ts - CORS headers fix
import axios, { AxiosError, AxiosInstance } from 'axios';
import { ApiError, ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';

/**
 * Base API client that handles HTTP requests and error handling
 */
export class BaseApiClient {
  private client: AxiosInstance;
  private basePath: string;
  private static instances: Map<string, BaseApiClient> = new Map();
  
  private constructor(path: string) {
    // Use Supabase Edge Functions URL
    const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    this.basePath = path;
    
    // Log environment variables
    logger.info('Initializing BaseApiClient', {
      baseUrl,
      basePath: this.basePath,
      hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'present' : 'missing',
    });
    
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        // Add additional headers used in Supabase function calls
        'x-client-info': 'api-driven-app',
      },
    });
    
    // Debug logging
    console.log('Base client initialized with URL:', baseUrl);
    
    this.setupInterceptors();
  }

  /**
   * Get or create a BaseApiClient instance for the given path
   */
  public static getInstance(path: string): BaseApiClient {
    if (!BaseApiClient.instances.has(path)) {
      BaseApiClient.instances.set(path, new BaseApiClient(path));
    }
    return BaseApiClient.instances.get(path)!;
  }
  
  /**
   * Set up request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor for adding auth token
    this.client.interceptors.request.use(
      (config) => {
        // Log request details
        console.log("Making request to:", config.url);
        console.log("Request method:", config.method);
        console.log("Request headers before:", config.headers);

        // Initialize headers if they don't exist
        config.headers = config.headers || {};

        // Ensure apikey header is set
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!anonKey) {
          console.error("VITE_SUPABASE_ANON_KEY is missing");
          return Promise.reject(new Error("VITE_SUPABASE_ANON_KEY is missing"));
        }
        
        // Set the apikey header
        config.headers['apikey'] = anonKey;
        console.log("Setting apikey header:", anonKey ? 'present' : 'missing');

        // Add Authorization header if token exists and it's not a registration request
        const token = localStorage.getItem('accessToken');
        if (token && !config.url?.includes('/register')) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        console.log("Request headers after:", config.headers);
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
        console.error("Response error:", error);
        
        if (error.response) {
          console.error("Response data:", error.response.data);
          console.error("Response status:", error.response.status);
          console.error("Response headers:", error.response.headers);
        } else if (error.request) {
          console.error("Request error (no response received):", error.request);
        } else {
          console.error("Error setting up request:", error.message);
        }
        
        // Handle API errors
        if (error.response) {
          const responseData = error.response.data as { code?: string; message?: string };
          const apiError: ApiError = {
            code: responseData.code || 'api_error',
            message: responseData.message || 'An error occurred',
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
  async get<T>(path: string, config?: any): Promise<ApiResponse<T>> {
    try {
      const url = this.basePath ? `/${this.basePath}${path}` : path;
      console.log(`Making GET request to: ${url}`);
      const response = await this.client.get<T>(url, config);
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
  async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const url = this.basePath ? `/${this.basePath}${path}` : path;
      console.log(`Making POST request to: ${url}`);
      console.log('POST data:', data);
      const response = await this.client.post<T>(url, data);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      console.error('POST request failed:', error);
      if (error instanceof Error) {
        return {
          error: {
            code: 'request_error',
            message: error.message,
          },
          status: 500,
        };
      }
      return {
        error: {
          code: 'request_error',
          message: 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const url = this.basePath ? `/${this.basePath}${path}` : path;
      const response = await this.client.put<T>(url, data);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          error: {
            code: 'request_error',
            message: error.message,
          },
          status: 500,
        };
      }
      return {
        error: {
          code: 'request_error',
          message: 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const url = this.basePath ? `/${this.basePath}${path}` : path;
      const response = await this.client.delete<T>(url);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          error: {
            code: 'request_error',
            message: error.message,
          },
          status: 500,
        };
      }
      return {
        error: {
          code: 'request_error',
          message: 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
}