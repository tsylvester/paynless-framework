import { logger } from "../logger.ts";
import { type UserData, type EmailMarketingService } from "../types.ts";
import type { KitServiceConfig } from "./kit.interface.ts";

export class KitService implements EmailMarketingService {
    private config: KitServiceConfig;

    // Constructor accepts configuration object
    constructor(config: KitServiceConfig) {
        // Validate required config
        if (!config.apiKey || !config.baseUrl) {
            throw new Error("Missing required configuration for KitService (apiKey, baseUrl)");
        }
        this.config = config;

        logger.info(`KitService initialized. Base URL: ${this.config.baseUrl}, UserID Field: ${this.config.customUserIdField || 'Not Set'}, CreatedAt Field: ${this.config.customCreatedAtField || 'Not Set'}`);
        if (!this.config.customUserIdField || !this.config.customCreatedAtField) {
            logger.warn("KitService initialized without custom field names. addUserToList and updateUserAttributes require these.");
        }
    }

    private async makeApiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = new URL(`${this.config.baseUrl}${endpoint}`);

        const defaultHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Kit-Api-Key': this.config.apiKey,
        };

        const finalOptions: RequestInit = {
            ...options,
            headers: { ...defaultHeaders, ...(options.headers as Record<string, string>) },
        };

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
             const parsedBody = errorBody as Record<string, unknown>;
             const nestedError = parsedBody.error as Record<string, unknown> | undefined;
             const errorMessage = (nestedError?.message as string) || (parsedBody.message as string) || response.statusText || 'Unknown API error';
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
        if (!this.config.customUserIdField || !this.config.customCreatedAtField) {
            logger.error("Cannot add user to Kit: Custom field keys are not configured.");
            throw new Error("KitService is not configured with custom field keys.");
        }

        const endpoint = `/subscribers`;
        const payload: Record<string, unknown> = {
            email_address: userData.email,
            first_name: userData.firstName,
            fields: {
                [this.config.customUserIdField.replace('fields[','').replace(']','')]: userData.id,
                [this.config.customCreatedAtField.replace('fields[','').replace(']','')]: userData.createdAt,
            }
        };

        await this.makeApiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        logger.info(`Successfully sent addUserToList request for ${userData.email} to Kit.`);
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

        const endpoint = `/subscribers/${subscriberId}`;
        const fields: Record<string, unknown> = {};
        if (attributes.id) fields[this.config.customUserIdField.replace('fields[','').replace(']','')] = attributes.id;
        if (attributes.createdAt) fields[this.config.customCreatedAtField.replace('fields[','').replace(']','')] = attributes.createdAt;

        const payload: Record<string, unknown> = {
             first_name: attributes.firstName,
             last_name: attributes.lastName,
             fields,
        };

        await this.makeApiRequest(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
        logger.info(`Successfully sent updateUserAttributes request for ${email} (ID: ${subscriberId}) to Kit.`);
    }

    private async findSubscriberIdByEmail(email: string): Promise<number | null> {
        const endpoint = `/subscribers?email_address=${encodeURIComponent(email)}`;
        try {
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

        const endpoint = `/subscribers/${subscriberId}`;
        logger.info(`Attempting to remove Kit subscriber ${subscriberId} (${email})`);
        // makeApiRequest handles non-OK status by throwing, which is desired here
        await this.makeApiRequest(endpoint, { method: 'DELETE' }); 
        logger.info(`Successfully sent removeUser request for ${email} (ID: ${subscriberId}) to Kit.`);
    }

    async addTagToSubscriber(email: string, tagId: string): Promise<void> {
        const endpoint = `/tags/${tagId}/subscribers`;
        const payload: Record<string, unknown> = {
            email_address: email,
        };

        await this.makeApiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        logger.info(`Successfully tagged subscriber ${email} with tag ${tagId}.`);
    }

    async removeTagFromSubscriber(email: string, tagId: string): Promise<void> {
        const endpoint = `/tags/${tagId}/subscribers`;
        const payload: Record<string, unknown> = {
            email_address: email,
        };

        await this.makeApiRequest(endpoint, {
            method: 'DELETE',
            body: JSON.stringify(payload),
        });
        logger.info(`Successfully removed tag ${tagId} from subscriber ${email}.`);
    }
} 