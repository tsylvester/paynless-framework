// src/api/apiClient.ts
/// <reference types="@paynless/types" />

// No longer need to define import.meta.env here - using central definition from @paynless/types

// REMOVED: Explicit import 
import { logger } from '@paynless/utils'; // Corrected import

// Define common options - Moved definition here
interface FetchOptions extends RequestInit {
  isPublic?: boolean; // Add flag for public endpoints
  token?: string; 
}

// --- Configuration --- 
interface ApiClientConfig {
  baseUrl: string;
  supabaseAnonKey: string;
}

let config: ApiClientConfig | null = null;

export function initializeApiClient(newConfig: ApiClientConfig) {
  if (config) {
    // logger.warn('API Client already initialized. Re-initializing...');
    // Instead of warning, throw an error to enforce singleton initialization
    throw new Error('API client already initialized');
  }
  // Validate config?
  if (!newConfig.baseUrl || !newConfig.supabaseAnonKey) {
    throw new Error('Invalid API Client config: baseUrl and supabaseAnonKey are required.');
  }
  // Ensure baseUrl does NOT have a trailing slash
  newConfig.baseUrl = newConfig.baseUrl.replace(/\/$/, '');
  config = newConfig;
  logger.info('API Client Initialized.', { baseUrl: config.baseUrl });
}

// Exported ONLY for testing purposes to reset the singleton state
export function _resetApiClient() {
  config = null;
  logger.info('API Client reset for testing.');
}

// --- API Client --- 

// Define expected API response structure
interface ApiResult<T = unknown> {
  data?: T;
  error?: { message: string; code?: string };
}

// Error class for API issues
export class ApiError extends Error {
  code?: string | number;
  status?: number; // Add status property

  constructor(message: string, code?: string | number, status?: number) { // Add status to constructor
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status; // Assign status
  }
}

async function apiClient<T = unknown>(
  endpoint: string,
  options: FetchOptions = {} // Use locally defined FetchOptions
): Promise<T> { // Return the data directly or throw an error
  if (!config) {
    throw new Error('API Client not initialized. Call initializeApiClient first.');
  }

  // *** REMOVE LOGGING HERE ***
  // logger.debug(`[apiClient ${endpoint}] Received options:`, { options });

  // Revert AGAIN to manual URL concatenation. 
  // The URL constructor treats base URLs with paths but no trailing slash 
  // differently than expected, replacing the last path segment.
  // Manual concat works reliably IF the convention is followed:
  // - baseUrl has NO trailing slash
  // - endpoint has NO leading slash
  const url = `${config.baseUrl}/${endpoint}`;

  // CHANGED: Get token from options instead of Zustand store
  const token = options.token;

  // Use Record<string, string> for more flexible header typing
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': config.supabaseAnonKey, // Use configured key
    ...(options.headers as Record<string, string> || {}), // Merge incoming headers safely
  };

  // Add Authorization header ONLY if it exists AND the endpoint is NOT public
  if (token && !options.isPublic) {
    headers['Authorization'] = `Bearer ${token}`; // Now allowed by Record<string, string>
  } else if (!token && !options.isPublic) {
    // Only warn about missing token for non-public endpoints
    // REMOVED: logger.warn(`[apiClient ${endpoint}] No access token found for protected call.`);
    // Depending on stricter error handling, you might throw an error here:
    // throw new Error(`Authentication required for endpoint: ${endpoint}`);
  }
  // If options.isPublic is true, we don't add Authorization and don't warn

  // Ensure method is set, default to GET
  const method = options.method || (options.body ? 'POST' : 'GET');
  logger.debug(`[apiClient ${endpoint}] Configured`, { method, url, hasToken: !!token, isPublic: !!options.isPublic }); // Log 2

  logger.debug(`API Call: ${method} ${url}`, { hasToken: !!token });

  try {
    logger.debug(`[apiClient ${endpoint}] Attempting fetch...`); // Log 3
    const response = await fetch(url, {
      ...options,
      method: method,
      headers: headers,
    });
    logger.debug(`[apiClient ${endpoint}] Fetch completed. Status: ${response.status}`); // Log 4

    // Attempt to parse JSON regardless of status for potential error messages
    let responseBody: ApiResult<T>;
    try {
       logger.debug(`[apiClient ${endpoint}] Attempting response.json()...`); // Log 5
       responseBody = await response.json();
       logger.debug(`[apiClient ${endpoint}] response.json() successful.`); // Log 6
    } catch (parseError) {
        // If JSON parsing fails, create a generic error response
        logger.error(`[apiClient ${endpoint}] response.json() FAILED`, { status: response.status, statusText: response.statusText, parseError });
        responseBody = { error: { message: `HTTP ${response.status}: ${response.statusText || 'Server error'}` } };
    }

    logger.debug(`[apiClient ${endpoint}] Checking response.ok (${response.ok})...`); // Log 7
    if (!response.ok) {
      // const errorMessage = responseBody?.message || responseBody?.error?.message || `HTTP error ${response.status}`;
      // const errorCode = responseBody?.code || responseBody?.error?.code;
      // FIX: Access error properties correctly via responseBody.error
      const errorMessage = responseBody?.error?.message || `HTTP error ${response.status}`;
      const errorCode = responseBody?.error?.code;
      logger.error(`[apiClient ${endpoint}] Response not OK`, { status: response.status, errorMessage, errorCode });
      const error = new ApiError(errorMessage, errorCode, response.status); 
      throw error;
    }

    // If response is OK, but maybe there's an app-level error in the body
    if (responseBody.error) {
       logger.warn(`[apiClient ${endpoint}] Response OK but contains error body`, { error: responseBody.error });
       const error = new ApiError(responseBody.error.message, responseBody.error.code, response.status); 
       throw error;
    }

    // Assuming successful response has data in `data` field
    // Adjust if your Edge Functions return data directly at the root
    if (responseBody.data !== undefined) {
        logger.debug(`[apiClient ${endpoint}] Returning responseBody.data`); // Log 8a
        return responseBody.data as T;
    } else {
         // Handle cases where response is OK (2xx) but no data field (e.g., 204 No Content)
         // Or if your functions return data at the root
         logger.debug(`[apiClient ${endpoint}] Returning full responseBody`); // Log 8b
         return responseBody as T; // Return the whole body if no 'data' field
    }

  } catch (error) {
    if (error instanceof ApiError) {
       logger.error(`API Fetch Error: ${error.message}`, { url, code: error.code, status: error.status });
       throw error;
    } else if (error instanceof Error) {
       logger.error(`API Fetch Error (Unknown): ${error.message}`, { url });
       throw new ApiError(`Network error: ${error.message}`, 'NETWORK_ERROR', 0); 
    } else {
       logger.error(`[apiClient ${endpoint}] Caught error in outer try/catch`, { error });
       throw new ApiError('An unknown fetch error occurred', 'UNKNOWN_FETCH_ERROR', 0);
    }
  }
}

// Export methods for convenience (GET, POST, etc.)
// These now expect the token to be passed within the options object if needed.
export const api = {
  get: <T = unknown>(endpoint: string, options: FetchOptions = {}) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = unknown>(endpoint: string, body: unknown, options: FetchOptions = {}) =>
    apiClient<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(endpoint: string, body: unknown, options: FetchOptions = {}) =>
    apiClient<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = unknown>(endpoint: string, options: FetchOptions = {}) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),
  // Add PATCH etc. if needed
};

// Export FetchOptions interface for use in calling code (e.g., store)
export type { FetchOptions }; 