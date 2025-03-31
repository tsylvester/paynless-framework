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
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  
  constructor(path: string) {
    // Fix: Use the correct base URL for Supabase Edge Functions
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
        // Fix: Always include the access token in the Authorization header
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Response interceptor for handling common errors and rate limits
    this.client.interceptors.response.use(
      (response) => {
        // Handle rate limits if present
        const rateLimit = {
          limit: parseInt(response.headers['x-ratelimit-limit'] || '0'),
          remaining: parseInt(response.headers['x-ratelimit-remaining'] || '0'),
          reset: parseInt(response.headers['x-ratelimit-reset'] || '0'),
        };
        
        response.data = {
          ...response.data,
          rateLimit,
        };
        
        return response;
      },
      async (error: AxiosError) => {
        // Handle token refresh or other global error handling
        if (error.response?.status === 401) {
          // Clear invalid token
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          
          // Redirect to login
          window.location.href = '/login';
        }
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          logger.warn('Rate limit exceeded', {
            reset: error.response.headers['x-ratelimit-reset'],
          });
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Convert Axios error to standardized API error
   */
  private handleError(error: unknown): ApiError {
    if (error instanceof AxiosError) {
      return {
        code: error.code || 'unknown_error',
        message: error.message || 'An unknown error occurred',
        details: error.response?.data,
      };
    }
    
    return {
      code: 'unknown_error',
      message: error instanceof Error ? error.message : 'An unknown error occurred',
    };
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
  async get<T>(url: string, config?: ApiRequestConfig & { cache?: CacheConfig }): Promise<ApiResponse<T>> {
    try {
      // Check cache if enabled
      if (config?.cache) {
        const cacheKey = `${url}${JSON.stringify(config.params || {})}`;
        
        if (this.isCacheValid(cacheKey, config.cache)) {
          const cached = this.cache.get(cacheKey)!;
          return cached.data;
        }
        
        // If stale-while-revalidate is enabled, return stale data while fetching
        if (config.cache.staleWhileRevalidate && this.cache.has(cacheKey)) {
          const cached = this.cache.get(cacheKey)!;
          this.get(url, { ...config, cache: undefined }).then(newData => {
            this.cache.set(cacheKey, { data: newData, timestamp: Date.now() });
          });
          return cached.data;
        }
      }
      
      const response = await this.client.get<T>(url, config as AxiosRequestConfig);
      
      const apiResponse = {
        data: response.data,
        status: response.status,
        rateLimit: response.data.rateLimit,
      };
      
      // Cache the response if enabled
      if (config?.cache) {
        const cacheKey = `${url}${JSON.stringify(config.params || {})}`;
        this.cache.set(cacheKey, { data: apiResponse, timestamp: Date.now() });
      }
      
      return apiResponse;
    } catch (error) {
      return {
        error: this.handleError(error),
        status: axios.isAxiosError(error) ? error.response?.status || 500 : 500,
      };
    }
  }
  
  /**
   * Make a POST request
   */
  async post<T>(url: string, data: unknown, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.post<T>(url, data, config as AxiosRequestConfig);
      return {
        data: response.data,
        status: response.status,
        rateLimit: response.data.rateLimit,
      };
    } catch (error) {
      return {
        error: this.handleError(error),
        status: axios.isAxiosError(error) ? error.response?.status || 500 : 500,
      };
    }
  }
  
  /**
   * Make a PUT request
   */
  async put<T>(url: string, data: unknown, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.put<T>(url, data, config as AxiosRequestConfig);
      return {
        data: response.data,
        status: response.status,
        rateLimit: response.data.rateLimit,
      };
    } catch (error) {
      return {
        error: this.handleError(error),
        status: axios.isAxiosError(error) ? error.response?.status || 500 : 500,
      };
    }
  }
  
  /**
   * Make a PATCH request
   */
  async patch<T>(url: string, data: unknown, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.patch<T>(url, data, config as AxiosRequestConfig);
      return {
        data: response.data,
        status: response.status,
        rateLimit: response.data.rateLimit,
      };
    } catch (error) {
      return {
        error: this.handleError(error),
        status: axios.isAxiosError(error) ? error.response?.status || 500 : 500,
      };
    }
  }
  
  /**
   * Make a DELETE request
   */
  async delete<T>(url: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.delete<T>(url, config as AxiosRequestConfig);
      return {
        data: response.data,
        status: response.status,
        rateLimit: response.data.rateLimit,
      };
    } catch (error) {
      return {
        error: this.handleError(error),
        status: axios.isAxiosError(error) ? error.response?.status || 500 : 500,
      };
    }
  }
}