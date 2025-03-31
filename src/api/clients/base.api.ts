import axios, { AxiosError, AxiosInstance } from 'axios';
import { ApiError, ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';

/**
 * Base API client that handles HTTP requests and error handling
 */
export class BaseApiClient {
  private client: AxiosInstance;
  private basePath: string;
  
  constructor(path: string) {
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
      },
    });
    
    // Add debugging
    console.log('Base client headers:', this.client.defaults.headers);
    console.log('Anon key available:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
    console.log('Anon key value:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'present' : 'missing');
    
    this.setupInterceptors();
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
        const token = localStorage.getItem('access_token');
        if (token && !config.url?.includes('/auth/register')) {
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
  async get<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.get<T>(`/${this.basePath}${path}`);
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
      const response = await this.client.post<T>(`/${this.basePath}${path}`, data);
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