import { logger } from "../logger.ts";
import { type UserData, type EmailMarketingService } from "../types.ts";

// Export the interface
export interface KitServiceConfig {
    apiKey: string;
    baseUrl: string;
    tagId?: string;
    customUserIdField?: string;
    customCreatedAtField?: string;
}

export class KitService implements EmailMarketingService {
    private config: KitServiceConfig;

    // Constructor accepts configuration object
    constructor(config: KitServiceConfig) {
        // Validate required config
        if (!config.apiKey || !config.baseUrl) {
            throw new Error("Missing required configuration for KitService (apiKey, baseUrl)");
        }
        this.config = config;

        logger.info(`KitService initialized. Base URL: ${this.config.baseUrl}, Tag ID: ${this.config.tagId || 'Not Set'}, UserID Field: ${this.config.customUserIdField || 'Not Set'}, CreatedAt Field: ${this.config.customCreatedAtField || 'Not Set'}`);
        if (!this.config.tagId) {
            logger.warn("KitService initialized without a Tag ID. addUserToList requires a configured Tag ID.");
        }
        if (!this.config.customUserIdField || !this.config.customCreatedAtField) {
            logger.warn("KitService initialized without custom field names. addUserToList and updateUserAttributes require these.");
        }
    }

    private async makeApiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = new URL(`${this.config.baseUrl}${endpoint}`);
        // Add api_key for GET requests if needed, or handle auth via headers
        if (options.method === 'GET' || !options.method) { 
            url.searchParams.set('api_key', this.config.apiKey);
        }

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Add Authorization header if Kit uses it instead of api_key param for POST/PUT/DELETE
        };

        const finalOptions: RequestInit = {
            ...options,
            headers: { ...defaultHeaders, ...options.headers },
        };
        
        // Add api_key to body for non-GET if required by Kit
        if (options.method && options.method !== 'GET' && finalOptions.body && typeof finalOptions.body === 'string') {
            try {
                const bodyJson = JSON.parse(finalOptions.body);
                bodyJson.api_key = this.config.apiKey; 
                finalOptions.body = JSON.stringify(bodyJson);
            } catch (e) {
                logger.warn("Failed to inject api_key into non-JSON body");
            }
        }

        logger.debug('Making Kit API request:', { url: url.toString(), method: finalOptions.method || 'GET' });

        const response = await fetch(url.toString(), finalOptions);

        if (!response.ok) {
             let errorBody = {};
             try { 
                 errorBody = await response.json(); 
             } catch { 
                 // If JSON parsing fails, still ensure the body is consumed/closed
                 await response.body?.cancel(); 
                 /* ignore parsing error */ 
             }
             const errorMessage = (errorBody as Error)?.message || response.statusText || 'Unknown API error';
             logger.error('Kit API Error', { 
                status: response.status, 
                endpoint, 
                errorMessage,
                errorBody 
             });
             throw new Error(`Kit API Error (${response.status}): ${errorMessage}`);
        }

        // Handle cases with no content (e.g., DELETE success)
        if (response.status === 204 || response.headers.get('Content-Length') === '0') {
             // Explicitly cancel the body before returning
             await response.body?.cancel(); 
             return {} as T; // Or return void/null if appropriate for the method
        }

        // Otherwise, assume JSON and parse it
        return await response.json() as T;
    }

    async addUserToList(userData: UserData): Promise<void> {
        if (!this.config.tagId) {
            logger.error("Cannot add user to Kit tag: Tag ID is not configured.");
            throw new Error("KitService is not configured with a Tag ID.");
        }
        if (!this.config.customUserIdField || !this.config.customCreatedAtField) {
            logger.error("Cannot add user to Kit tag: Custom field keys are not configured.");
            throw new Error("KitService is not configured with custom field keys.");
        }

        const endpoint = `/v1/tags/${this.config.tagId}/subscribe`;
        const payload = {
            // api_key: this.config.apiKey, // Injected by makeApiRequest for non-GET
            email: userData.email,
            first_name: userData.firstName,
            last_name: userData.lastName,
            fields: {
                [this.config.customUserIdField.replace('fields[','').replace(']','')]: userData.id,
                [this.config.customCreatedAtField.replace('fields[','').replace(']','')]: userData.createdAt,
            }
            // Add any other standard fields Kit supports
        };

        await this.makeApiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        logger.info(`Successfully sent addUserToList request for ${userData.email} to Kit tag ${this.config.tagId}.`);
    }

    async updateUserAttributes(email: string, attributes: Partial<UserData>): Promise<void> {
         if (!this.config.customUserIdField || !this.config.customCreatedAtField) {
            logger.error("Cannot update user attributes: Custom field keys are not configured.");
            throw new Error("KitService is not configured with custom field keys.");
        }
        
        const subscriberId = await this.findSubscriberIdByEmail(email);
        if (!subscriberId) {
            logger.warn(`Kit subscriber not found for update: ${email}. Skipping.`);
            return; // Don't throw, just skip if not found
        }

        const endpoint = `/v1/subscribers/${subscriberId}`;
        // Prepare payload, excluding email and ensuring custom fields are nested
        const payload: Record<string, any> = {
             // api_key: this.config.apiKey, // Injected by makeApiRequest
             first_name: attributes.firstName,
             last_name: attributes.lastName,
             fields: {}
        };
        // Populate fields, mapping UserData keys to Kit field keys
        if (attributes.id) payload.fields[this.config.customUserIdField.replace('fields[','').replace(']','')] = attributes.id;
        if (attributes.createdAt) payload.fields[this.config.customCreatedAtField.replace('fields[','').replace(']','')] = attributes.createdAt;
        // Add other custom fields if necessary

        await this.makeApiRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        logger.info(`Successfully sent updateUserAttributes request for ${email} (ID: ${subscriberId}) to Kit.`);
    }

    private async findSubscriberIdByEmail(email: string): Promise<number | null> {
        // Construct endpoint with query parameters for email filtering
        const endpoint = `/v1/subscribers?email_address=${encodeURIComponent(email)}`;
        try {
             // Specify expected response structure for makeApiRequest
             // The GET request will include api_key automatically via makeApiRequest
            const data = await this.makeApiRequest<{ subscribers: Array<{id: number}> }>(endpoint, { method: 'GET' });
            // Removed TODO as email is now passed in endpoint query string
            
            if (data.subscribers && data.subscribers.length > 0) {
                // Assuming the first result is the correct one if multiple match (unlikely for email)
                return data.subscribers[0].id; 
            }
            logger.debug(`Kit subscriber not found for email: ${email}`);
            return null;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Log specific find error, but return null instead of throwing
            logger.warn('Failed to find Kit subscriber by email (API Error or Network)', { email, error: errorMessage }); 
            return null; 
        }
    }
    
    async removeUser(email: string): Promise<void> {
        const subscriberId = await this.findSubscriberIdByEmail(email);
        if (!subscriberId) {
            logger.warn(`Kit subscriber not found for removal: ${email}. Skipping.`);
            return;
        }

        const endpoint = `/v1/subscribers/${subscriberId}`; // DELETE request
        logger.info(`Attempting to remove Kit subscriber ${subscriberId} (${email})`);
        // makeApiRequest handles non-OK status by throwing, which is desired here
        await this.makeApiRequest(endpoint, { method: 'DELETE' }); 
        logger.info(`Successfully sent removeUser request for ${email} (ID: ${subscriberId}) to Kit.`);
    }
} 