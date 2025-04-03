// src/api/apiClient.ts
import { useAuthStore } from '../store/authStore'; // To get the token
import { logger } from '../utils/logger';

// Define expected API response structure
interface ApiResult<T = unknown> {
  data?: T;
  error?: { message: string; code?: string };
}

// Define common options
interface FetchOptions extends RequestInit {
  isPublic?: boolean; // Add flag for public endpoints
}

// Base URL for Supabase Edge Functions
const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// Custom Error class
class ApiError extends Error {
  code?: string | number;
}

async function apiClient<T = unknown>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> { // Return the data directly or throw an error

  const url = `${BASE_URL}/${endpoint}`;
  logger.debug(`[apiClient ${endpoint}] Starting request.`); // Log 1

  // Get token from Zustand store
  const token = useAuthStore.getState().session?.access_token;

  // Use Record<string, string> for more flexible header typing
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '', // Add anon key
    ...(options.headers as Record<string, string> || {}), // Merge incoming headers safely
  };

  // Add Authorization header ONLY if it exists AND the endpoint is NOT public
  if (token && !options.isPublic) {
    headers['Authorization'] = `Bearer ${token}`; // Now allowed by Record<string, string>
  } else if (!token && !options.isPublic) {
    // Only warn about missing token for non-public endpoints
    logger.warn(`[apiClient ${endpoint}] No access token found for protected call.`);
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
      const errorMessage = responseBody?.error?.message || `HTTP error ${response.status}`;
      const errorCode = responseBody?.error?.code;
      logger.error(`[apiClient ${endpoint}] Response not OK`, { status: response.status, errorMessage, errorCode });
      const error = new ApiError(errorMessage);
      error.code = errorCode || response.status;
      throw error;
    }

    // If response is OK, but maybe there's an app-level error in the body
    if (responseBody.error) {
       logger.warn(`[apiClient ${endpoint}] Response OK but contains error body`, { error: responseBody.error });
       const error = new ApiError(responseBody.error.message);
       error.code = responseBody.error.code || 'API_RESPONSE_ERROR';
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
    // Check if it's already our custom ApiError or re-throw
    if (error instanceof ApiError) {
       logger.error(`API Fetch Error: ${error.message}`, { url, code: error.code });
       throw error;
    } else if (error instanceof Error) {
       logger.error(`API Fetch Error (Unknown): ${error.message}`, { url });
       throw error; // Re-throw generic errors
    } else {
       // Handle non-Error throws if necessary, though less common
       logger.error(`[apiClient ${endpoint}] Caught error in outer try/catch`, { error });
       throw new Error('An unknown fetch error occurred');
    }
  }
}

// Export methods for convenience (GET, POST, etc.)
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