import { SupabaseClient, createClient } from '@supabase/supabase-js';
// Import types from @paynless/types
import type {
  // UserProfile, UserProfileUpdate, // Removed unused imports
  ApiResponse, ApiError as ApiErrorType,
  FetchOptions // Import FetchOptions from types
} from '@paynless/types';
// ---> Import AuthRequiredError from types <--- 
import { AuthRequiredError } from '@paynless/types'; 
import { StripeApiClient } from './stripe.api'; 
import { AiApiClient } from './ai.api';
import { NotificationApiClient } from './notifications.api'; // Import new client
import { logger } from '@paynless/utils';

// Define ApiError class locally for throwing (can extend the type)
export class ApiError extends Error {
    public code?: string | number;
    constructor(message: string, code?: string | number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    }
}

// Config interface for the constructor
interface ApiClientConstructorOptions {
    supabase: SupabaseClient<any>;
    supabaseUrl: string; // Pass the URL explicitly
    supabaseAnonKey: string; // <<< Add anon key here
}

export class ApiClient {
    private supabase: SupabaseClient<any>;
    private functionsUrl: string;
    private supabaseAnonKey: string; // <<< Add storage for anon key

    public billing: StripeApiClient;
    public ai: AiApiClient;
    public notifications: NotificationApiClient; // Add new client property

    // Update constructor signature
    constructor(options: ApiClientConstructorOptions) {
        this.supabase = options.supabase;
        // Use the passed supabaseUrl to construct functionsUrl
        // Ensure it doesn't have a trailing slash before appending /functions/v1
        const baseUrl = options.supabaseUrl.replace(/\/$/, ''); 
        this.functionsUrl = `${baseUrl}/functions/v1`; 
        this.supabaseAnonKey = options.supabaseAnonKey; // <<< Store anon key
        logger.info('API Client constructed with Functions URL:', { url: this.functionsUrl });

        this.billing = new StripeApiClient(this);
        this.ai = new AiApiClient(this);
        this.notifications = new NotificationApiClient(this); // Initialize new client
    }

    private async getToken(): Promise<string | undefined> {
        const { data, error } = await this.supabase.auth.getSession();
        if (error) {
            logger.error('Error fetching session for token:', { error });
            return undefined;
        }
        return data.session?.access_token;
    }

    // Update request method to use ApiResponse and ApiErrorType from @paynless/types
    private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<ApiResponse<T>> {
        const url = `${this.functionsUrl}/${endpoint.startsWith('/') ? endpoint.substring(1) : endpoint}`;
        const headers = new Headers(options.headers || {});
        headers.append('Content-Type', 'application/json');
        headers.append('apikey', this.supabaseAnonKey); // <<< Always add apikey header

        const token = options.token || (await this.getToken());

        if (!options.isPublic && token) {
            headers.append('Authorization', `Bearer ${token}`);
        }
        
        // ---> Log headers right before fetch (Revised) <--- 
        const headersObject: Record<string, string> = {};
        headers.forEach((value, key) => { headersObject[key] = value; });
        logger.info(`[apiClient] Requesting ${options.method || 'GET'} ${url}`, { headers: headersObject });

        try {
            const response = await fetch(url, { ...options, headers });
            
            // ---> Log right after fetch, before parsing body <--- 
            logger.info('[apiClient] Fetch completed', { status: response.status, ok: response.ok, url: response.url });
            
            // ---> Log content-type and wrap parsing in try/catch <--- 
            const contentType = response.headers.get('Content-Type');
            logger.info('[apiClient] Response Content-Type:', { contentType });
            
            let responseData: any;
            try {
                responseData = contentType?.includes('application/json') 
                                    ? await response.json() 
                                    : await response.text(); 
            } catch (parseError: any) {
                logger.error('[apiClient] Failed to parse response body:', { error: parseError.message });
                throw new ApiError(parseError.message || 'Failed to parse response body', response.status);
            }

            // ---> Handle 401 AUTH_REQUIRED immediately after successful parse <--- 
            if (response.status === 401 && typeof responseData === 'object' && responseData?.code === 'AUTH_REQUIRED') {
                 logger.warn('AuthRequiredError detected. Throwing error for caller to handle...');
                 throw new AuthRequiredError(responseData.message || 'Authentication required');
            }

            // ---> Original check for any non-OK response <--- 
            if (!response.ok) {
                // Log the response data for debugging NON-AUTH_REQUIRED errors
                if (response.status === 401) { // Log if it's 401 but NOT the specific AUTH_REQUIRED case
                     logger.warn('[apiClient] Received 401 response body (but not AUTH_REQUIRED code): ', { responseData });
                } else {
                     logger.warn(`[apiClient] Received non-OK (${response.status}) response body:`, { responseData });
                }
                
                // --- Original error handling for other non-OK responses ---
                let errorPayload: ApiErrorType;
                if (typeof responseData === 'object' && responseData !== null) { // Check if it's an object
                    if (responseData.code && responseData.message) {
                         // Handle { code: ..., message: ... }
                         errorPayload = responseData as ApiErrorType;
                    } else if (responseData.error && typeof responseData.error === 'string') {
                         // Handle { error: "..." }
                         errorPayload = { code: String(response.status), message: responseData.error };
                    } else {
                        // Fallback if object structure is unexpected
                        const errorMessage = response.statusText || 'Unknown API Error';
                        errorPayload = { code: String(response.status), message: errorMessage };
                    }
                } else {
                    // Handle non-object responses (e.g., plain text)
                    const errorMessage = typeof responseData === 'string' && responseData.trim() !== ''
                                        ? responseData 
                                        : response.statusText || 'Unknown API Error';
                    errorPayload = { code: String(response.status), message: errorMessage };
                }
                logger.error(`API Error ${response.status} on ${endpoint}: ${errorPayload.message}`, { code: errorPayload.code, details: errorPayload.details });
                return { status: response.status, error: errorPayload };
            }
            
            // Success case
            return { status: response.status, data: responseData as T };

        } catch (error: any) {
             // ---> Check if it's the AuthRequiredError we threw <--- 
            if (error instanceof AuthRequiredError || error?.name === 'AuthRequiredError') { // Check name too for safety
                logger.info("AuthRequiredError caught in apiClient, re-throwing...");
                throw error; // Re-throw it so the caller (aiStore) can catch it
            }
            
            // ---> Otherwise, handle as a network/unexpected error <--- 
            logger.error(`Network or fetch error on ${endpoint}:`, { error: error?.message });
            return { 
                status: 0, 
                error: { code: 'NETWORK_ERROR', message: error.message || 'Network error' } 
            };
        }
    }

    // Update public methods to reflect the new ApiResponse structure
    public async get<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    public async post<T, U>(endpoint: string, body: U, options?: FetchOptions): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
    }

    public async put<T, U>(endpoint: string, body: U, options?: FetchOptions): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
    }

    public async delete<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }
}

// --- Singleton Instance Logic --- 
let apiClientInstance: ApiClient | null = null;

// Config interface for the initializer
interface ApiInitializerConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
}

// Update initializeApiClient signature and implementation
export function initializeApiClient(config: ApiInitializerConfig) {

    //console.log('initializeApiClientinitializeApiClientinitializeApiClientinitializeApiClientinitializeApiClientinitializeApiClientinitializeApiClient')
  if (apiClientInstance) {
    throw new Error('ApiClient already initialized');
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
     throw new Error('Supabase URL and Anon Key are required to initialize ApiClient');
  }
  // Create Supabase client inside the initializer
  const supabase = createClient<any>(config.supabaseUrl, config.supabaseAnonKey);
  
  // Pass both client and URL to constructor
  apiClientInstance = new ApiClient({ 
      supabase: supabase, 
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey // <<< Pass anon key here
  });
  logger.info('ApiClient Singleton Initialized.');
}

export function _resetApiClient() {
  apiClientInstance = null;
  logger.info('ApiClient Singleton reset for testing.');
}

function getApiClient(): ApiClient {
    if (!apiClientInstance) {
        throw new Error('ApiClient not initialized. Call initializeApiClient first.');
    }
    return apiClientInstance;
}

// Export the api object, update methods to match new ApiResponse
export const api = {
    get: <T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> => 
        getApiClient().get<T>(endpoint, options),
    post: <T, U>(endpoint: string, body: U, options?: FetchOptions): Promise<ApiResponse<T>> => 
        getApiClient().post<T, U>(endpoint, body, options),
    put: <T, U>(endpoint: string, body: U, options?: FetchOptions): Promise<ApiResponse<T>> => 
        getApiClient().put<T, U>(endpoint, body, options),
    delete: <T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> => 
        getApiClient().delete<T>(endpoint, options),
    ai: () => getApiClient().ai, 
    billing: () => getApiClient().billing,
    notifications: () => getApiClient().notifications, // Add getter for notifications
}; 