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
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { Notification } from '@paynless/types'; // Need Notification type

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
    // Store notification channels here, managed by the main client
    private notificationChannels: Map<string, RealtimeChannel> = new Map();

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

    // --- NEW REALTIME METHODS --- 

    /**
     * Subscribes to new notifications for a specific user.
     * @param userId The ID of the user to subscribe for.
     * @param callback The function to call when a new notification arrives.
     */
    public subscribeToNotifications(userId: string, callback: NotificationCallback): void {
        if (!userId) {
            logger.warn('[ApiClient] Cannot subscribe to notifications: userId is missing.');
            return;
        }
        if (this.notificationChannels.has(userId)) {
            logger.warn(`[ApiClient] Already subscribed to notifications for user ${userId}.`);
            return;
        }

        logger.debug(`[ApiClient] Subscribing to notifications for user ${userId}...`);
        const channelName = `notifications-user-${userId}`;
        // Use internal this.supabase
        const channel = this.supabase.channel(channelName, {
            config: {
                broadcast: { self: false },
                presence: { key: userId }, 
            },
        });

        channel
            .on<Notification>(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload: RealtimePostgresChangesPayload<Notification>) => {
                    logger.info('[ApiClient] Realtime Notification INSERT received', { payload });
                    if (payload.new) {
                        const newNotification = payload.new as Notification;
                        if (newNotification.id) {
                            callback(newNotification);
                        } else {
                            logger.warn('[ApiClient] Received notification payload missing ID', { payload });
                        }
                    } else {
                        logger.warn('[ApiClient] Received notification payload missing `new` object', { payload });
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    logger.info(`[ApiClient] Realtime channel "${channelName}" subscribed successfully.`);
                    this.notificationChannels.set(userId, channel); // Store the channel
                } else {
                    logger.error(`[ApiClient] Realtime channel "${channelName}" subscription error/status: ${status}`, { err });
                    this.notificationChannels.delete(userId); // Clean up map on failure/close
                }
            });
    }

    /**
     * Unsubscribes from new notifications for a specific user.
     * @param userId The ID of the user to unsubscribe for.
     */
    public unsubscribeFromNotifications(userId: string): void {
        if (!userId) {
            logger.warn('[ApiClient] Cannot unsubscribe from notifications: userId is missing.');
            return;
        }
        const channel = this.notificationChannels.get(userId);
        if (channel) {
            logger.debug(`[ApiClient] Unsubscribing from notifications for user ${userId}...`);
            channel.unsubscribe()
                .catch(error => {
                    logger.error(`[ApiClient] Error unsubscribing notification channel for user ${userId}:`, { error });
                })
                .finally(() => {
                    this.notificationChannels.delete(userId);
                    // Attempt to remove the channel instance from Supabase client
                    this.supabase.removeChannel(channel).catch(removeError => {
                         logger.error(`[ApiClient] Error calling removeChannel for user ${userId}:`, { removeError });
                    });
                });
        } else {
            logger.warn(`[ApiClient] No active notification subscription found to unsubscribe for user ${userId}.`);
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

// --- Singleton Pattern Implementation ---
let apiClientInstance: ApiClient | null = null;
let isInitializing = false; // Flag to prevent race conditions

// --- HMR State Restoration (Vite) ---
// Check if we have state preserved from a previous HMR update
if (import.meta.hot && import.meta.hot.data.apiClientInstance) {
  logger.warn('[ApiClient HMR] Restoring apiClientInstance from import.meta.hot.data');
  apiClientInstance = import.meta.hot.data.apiClientInstance;
  // Potentially reset isInitializing if restoration implies it finished?
  // isInitializing = false; // Let's assume dispose handler runs after finally block
}

interface ApiInitializerConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
}

/**
 * Initializes the singleton ApiClient instance.
 * Now relies on import.meta.hot for HMR persistence.
 */
export function initializeApiClient(config: ApiInitializerConfig) {
    const isDev = import.meta.env.DEV; // Still useful for logging

    logger.info('[initializeApiClient] Attempting initialization...', { 
        isDev,
        isInitializing, 
        hasModuleInstance: !!apiClientInstance, 
        // Remove window check logging
    });

    // Standard checks for initialization in progress or existing module instance
    if (isInitializing) {
        logger.warn('[initializeApiClient] Initialization already in progress. Skipping.');
        return; 
    }
    if (apiClientInstance) {
        logger.warn('[initializeApiClient] ApiClient Singleton already initialized (module scope). Skipping.');
        return apiClientInstance;
    }

    isInitializing = true;
    logger.info('[initializeApiClient] Starting initialization process...');

    try {
        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            throw new Error('Supabase URL or Anon Key is missing in configuration.');
        }

        const newInstance = new ApiClient({
            supabase: createClient(config.supabaseUrl, config.supabaseAnonKey, { /* ... auth config ... */ }),
            supabaseUrl: config.supabaseUrl, // Pass URL to constructor
            supabaseAnonKey: config.supabaseAnonKey, // Pass key to constructor
        });

        apiClientInstance = newInstance; // Set in module scope

        logger.info('[initializeApiClient] ApiClient Singleton Initialized Successfully.', { instanceExistsNow: !!apiClientInstance });
        return apiClientInstance;

    } catch (error: any) {
        logger.error('[initializeApiClient] FATAL ERROR during initialization:', { /* ... error details ... */ });
        apiClientInstance = null; 
        throw error; 
    } finally {
        isInitializing = false;
        logger.info('[initializeApiClient] Initialization process finished.', { isInitializing });
    }
}

/**
 * Resets the singleton ApiClient instance. FOR TESTING PURPOSES ONLY.
 */
export function _resetApiClient() {
    // const isDev = import.meta.env.DEV;
    logger.warn('Resetting ApiClient Singleton for testing...'); 
    apiClientInstance = null;
    isInitializing = false; 
}

/**
 * Retrieves the singleton ApiClient instance.
 * Relies on HMR restoration happening at module load time.
 * Throws an error if the client has not been initialized.
 */
function _internal_getApiClient_DONOTUSEDIRECTLY(): ApiClient {
    // const isDev = import.meta.env.DEV;
    
    // Direct check after HMR should have restored the instance if needed
    if (!apiClientInstance) {
        // Updated error message slightly
        logger.error('[_internal_getApiClient] CRITICAL: ApiClient instance is NULL. Check initialization and HMR handling.');
        throw new Error('ApiClient has not been initialized. Call initializeApiClient first.');
    }
    
    return apiClientInstance;
}

// Export the api object (no changes needed here, still uses the internal getter)
export const api = {
    get: <T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> => 
        _internal_getApiClient_DONOTUSEDIRECTLY().get<T>(endpoint, options),
    post: <T, U>(endpoint: string, body: U, options?: FetchOptions): Promise<ApiResponse<T>> => 
        _internal_getApiClient_DONOTUSEDIRECTLY().post<T, U>(endpoint, body, options),
    put: <T, U>(endpoint: string, body: U, options?: FetchOptions): Promise<ApiResponse<T>> => 
        _internal_getApiClient_DONOTUSEDIRECTLY().put<T, U>(endpoint, body, options),
    delete: <T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> => 
        _internal_getApiClient_DONOTUSEDIRECTLY().delete<T>(endpoint, options),
    
    // Access nested clients via the getter
    ai: () => _internal_getApiClient_DONOTUSEDIRECTLY().ai, 
    billing: () => _internal_getApiClient_DONOTUSEDIRECTLY().billing,
    notifications: () => _internal_getApiClient_DONOTUSEDIRECTLY().notifications, 
    organizations: () => _internal_getApiClient_DONOTUSEDIRECTLY().organizations, // <<< Add Org client getter

    // Realtime methods call the getter first
    subscribeToNotifications: (userId: string, callback: NotificationCallback): void =>
        _internal_getApiClient_DONOTUSEDIRECTLY().subscribeToNotifications(userId, callback),
    unsubscribeFromNotifications: (userId: string): void =>
        _internal_getApiClient_DONOTUSEDIRECTLY().unsubscribeFromNotifications(userId),
    
    // Supabase client getter calls the internal getter
    getSupabaseClient: (): SupabaseClient<any> => 
        _internal_getApiClient_DONOTUSEDIRECTLY().getSupabaseClient(),
}; 

// --- HMR Dispose Handler (Vite) ---
if (import.meta.hot) {
  import.meta.hot.dispose((data: any) => {
    logger.warn('[ApiClient HMR] Dispose triggered. Saving apiClientInstance to import.meta.hot.data');
    // Persist the current instance state
    data.apiClientInstance = apiClientInstance;
    // Optionally, persist other state like isInitializing if needed?
    // data.isInitializing = isInitializing; 
  });

  // Accept the update for this module
  import.meta.hot.accept(() => {
    logger.warn('[ApiClient HMR] Module accepted update.');
    // The module code will re-run, and the restoration logic at the top should execute.
  });
} 