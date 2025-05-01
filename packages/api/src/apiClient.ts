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
import { OrganizationApiClient } from './organizations.api'; // <<< Import Org client
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
    public organizations: OrganizationApiClient; // <<< Add Org client property

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
        this.organizations = new OrganizationApiClient(this); // <<< Initialize Org client
    }

    /**
     * Returns the base URL for Supabase Edge Functions used by this client.
     * @returns {string} The functions base URL.
     */
    public getFunctionsUrl(): string {
        return this.functionsUrl;
    }

    private async getToken(): Promise<string | undefined> {
        const { data, error } = await this.supabase.auth.getSession();
        if (error) {
            logger.error('Error fetching session for token:', { error });
            return undefined;
        }
        logger.debug('[ApiClient.getToken] Fetched session data:', { session: data.session }); 
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

            // ---> Add specific debug log for 401 response data (using WARN level) <--- 
            if (response.status === 401) {
                logger.warn('[apiClient] Raw responseData for 401 status:', { responseData });
            }

            // ---> NEW: Throw AuthRequiredError ONLY on specific 401 + code <---
            // The calling function (e.g., store) is responsible for handling the consequences (like saving pending action).
            if (response.status === 401 && !options.isPublic && responseData?.code === 'AUTH_REQUIRED') {
                logger.warn('[apiClient] Received 401 with AUTH_REQUIRED code. Throwing AuthRequiredError...');
                // Use a generic message or attempt to get one from the body if available
                const errorMessage = (typeof responseData === 'object' && responseData?.message)
                                    ? responseData.message
                                    : 'Authentication required';
                throw new AuthRequiredError(errorMessage);
            }

            // ---> Check for other non-OK responses (including other 401s) <---
            if (!response.ok) {
                // Log the response data for debugging OTHER errors
                 logger.warn(`[apiClient] Received non-OK (${response.status}) response body:`, { responseData });

                // --- Original error handling for other non-OK responses ---
                let errorPayload: ApiErrorType;
                if (typeof responseData === 'object' && responseData !== null) {
                    if (responseData.code && responseData.message) {
                         errorPayload = responseData as ApiErrorType;
                    } else if (responseData.error && typeof responseData.error === 'string') {
                         errorPayload = { code: String(response.status), message: responseData.error };
                    } else {
                        const messageFromBody = typeof responseData === 'object' && responseData?.message ? responseData.message : null;
                        const errorMessage = messageFromBody || response.statusText || 'Unknown API Error';
                        errorPayload = { code: String(response.status), message: errorMessage };
                    }
                } else {
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
             // ---> Check if it's the specific AuthRequiredError we threw <---
            if (error instanceof AuthRequiredError) {
                logger.warn("AuthRequiredError caught by API Client. Re-throwing for store handler...");
                // The logic to save pending actions has been moved to the relevant store (e.g., aiStore).
                // We simply re-throw the error here so the caller can handle it.
                throw error;
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

    /**
     * Retrieves the underlying Supabase client instance.
     * **Warning:** This should ONLY be used for setting up the onAuthStateChange listener
     * at the application root. Do NOT use this to bypass the ApiClient for other operations.
     * @returns The SupabaseClient instance.
     */
    public getSupabaseClient(): SupabaseClient<any> {
        return this.supabase;
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

    //console.log('initializeApiClientinitializeApiClientinitializeApiClientinitializeApiClientinitializeApiClientinitializeApiClient')
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

// ---> Export for testing purposes <--- 
export function getApiClient(): ApiClient {
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
    notifications: () => getApiClient().notifications,
    getSupabaseClient: (): SupabaseClient<any> => 
        getApiClient().getSupabaseClient(),
}; 