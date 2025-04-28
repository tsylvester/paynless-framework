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
import { Notification } from '@paynless/types'; // Need Notification type

// --- New Types for Streaming ---
interface StreamCallbacks<T> {
  onMessage: (data: T) => void;
  onError: (error: Event | Error) => void;
  onOpen?: () => void; // Optional: callback for when the connection opens
}
type StreamDisconnectFunction = () => void;
// ------------------------------

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

// Interface for the notification callback function (can be defined here or imported)
type NotificationCallback = (notification: Notification) => void;

export class ApiClient {
    private supabase: SupabaseClient<any>;
    private functionsUrl: string;
    private supabaseAnonKey: string; // <<< Add storage for anon key
    // Store active EventSource streams
    private eventSources: Map<string, EventSource> = new Map();

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

    // --- SERVER-SENT EVENTS (SSE) STREAMING METHOD ---
    /**
     * Establishes a Server-Sent Events (SSE) connection to a given endpoint.
     *
     * @template T The expected type of data received in messages.
     * @param {string} endpoint The relative endpoint path for the SSE stream (e.g., 'notifications-stream').
     * @param {StreamCallbacks<T>} callbacks An object containing onMessage, onError, and optional onOpen handlers.
     * @returns {StreamDisconnectFunction | null} A function to close the connection, or null if initialization fails immediately.
     */
    public stream<T>(endpoint: string, callbacks: StreamCallbacks<T>): StreamDisconnectFunction | null {
        const streamKey = endpoint; // Use endpoint as the key for managing streams
        logger.debug(`[ApiClient.stream] Attempting to connect SSE stream for endpoint: ${endpoint}`);

        // Prevent multiple streams to the same endpoint concurrently
        if (this.eventSources.has(streamKey)) {
            logger.warn(`[ApiClient.stream] SSE stream already exists for endpoint: ${endpoint}. Disconnecting existing one.`);
            this.closeStream(streamKey); // Close the old one before creating a new one
        }

        // Use an IIAFE to handle async token retrieval and prevent blocking the return
        (async () => {
            let es: EventSource | null = null;
            try {
                const token = await this.getToken();
                if (!token) {
                    throw new Error('Authentication token not available for SSE connection.');
                }

                // Construct the full URL within ApiClient
                const baseUrl = this.getFunctionsUrl(); // Use the public getter
                const sseUrl = `${baseUrl}/${endpoint}?token=${token}`; // Construct SSE URL
                logger.debug(`[ApiClient.stream] Connecting to SSE URL: ${sseUrl}`);

                es = new EventSource(sseUrl); // Create the EventSource
                this.eventSources.set(streamKey, es); // Store it

                es.onopen = () => {
                    logger.info(`[ApiClient.stream] SSE stream opened for endpoint: ${endpoint}`);
                    callbacks.onOpen?.(); // Call onOpen callback if provided
                };

                es.onmessage = (event: MessageEvent) => {
                    logger.debug(`[ApiClient.stream] SSE message received for ${endpoint}:`, event.data);
                    try {
                        const parsedData: T = JSON.parse(event.data);
                        callbacks.onMessage(parsedData);
                    } catch (parseError) {
                        logger.error(`[ApiClient.stream] Failed to parse SSE message data for ${endpoint}:`, { data: event.data, error: parseError });
                        callbacks.onError(parseError instanceof Error ? parseError : new Error('SSE data parsing failed'));
                    }
                };

                es.onerror = (errorEvent: Event) => {
                    // Wrap errorEvent in an object for the logger
                    logger.error(`[ApiClient.stream] SSE stream error for endpoint: ${endpoint}`, { error: errorEvent });
                    callbacks.onError(errorEvent);

                    // If the error causes the connection to close permanently, remove it
                    if (es?.readyState === EventSource.CLOSED) {
                        logger.warn(`[ApiClient.stream] SSE stream for ${endpoint} closed permanently due to error. Cleaning up.`);
                        this.closeStream(streamKey);
                    }
                    // Note: Browser might attempt reconnect automatically for recoverable errors.
                };

            } catch (error) {
                // Construct metadata object for the logger
                const errorMetadata = error instanceof Error
                    ? { error: { message: error.message, name: error.name, stack: error.stack } } 
                    : { error: error }; 
                logger.error(`[ApiClient.stream] Failed to initialize SSE stream for ${endpoint}:`, errorMetadata);
                callbacks.onError(error instanceof Error ? error : new Error('SSE initialization failed'));
                // Clean up if initialization failed
                if (es) {
                    es.close(); // Ensure it's closed if partially created
                }
                this.eventSources.delete(streamKey); // Remove from map
            }
        })();

        // Return a function that specifically closes THIS stream
        return () => this.closeStream(streamKey);
    }

    /**
     * Closes a specific SSE stream managed by the ApiClient.
     * @param {string} streamKey The key (usually the endpoint) of the stream to close.
     */
    private closeStream(streamKey: string): void {
        const es = this.eventSources.get(streamKey);
        if (es) {
            logger.debug(`[ApiClient.closeStream] Closing SSE stream for key: ${streamKey}`);
            es.close();
            this.eventSources.delete(streamKey);
            logger.info(`[ApiClient.closeStream] SSE stream closed and removed for key: ${streamKey}`);
        }
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
    // Add the new stream method to the exported api object
    stream: <T>(endpoint: string, callbacks: StreamCallbacks<T>): StreamDisconnectFunction | null =>
        getApiClient().stream<T>(endpoint, callbacks),
    ai: () => getApiClient().ai, 
    billing: () => getApiClient().billing,
    notifications: () => getApiClient().notifications, // Getter for NotificationApiClient
    // ---> Add the new getter to the exported api object <--- 
    getSupabaseClient: (): SupabaseClient<any> => 
        getApiClient().getSupabaseClient(),
}; 