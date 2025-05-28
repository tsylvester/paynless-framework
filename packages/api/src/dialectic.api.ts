import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    // Potentially add specific Dialectic-related types from @paynless/types here later
} from '@paynless/types';
import { logger } from '@paynless/utils';

/**
 * API Client for interacting with Dialectic-related Edge Functions.
 */
export class DialecticApiClient {
    private apiClient: ApiClient;

    constructor(apiClient: ApiClient) {
        this.apiClient = apiClient;
    }

    /**
     * Fetches the list of available domain tags for dialectic projects.
     * This endpoint is public and does not require authentication.
     */
    async listAvailableDomainTags(): Promise<ApiResponse<string[]>> {
        logger.info('Fetching available domain tags for dialectic projects');
        
        const response = await this.apiClient.post<string[], { action: string }>(
            'dialectic-service', // Endpoint name
            { action: 'listAvailableDomainTags' }, // Body of the request
            { isPublic: true } // Options: this endpoint is public
        );

        if (response.error) {
            logger.error('Error fetching available domain tags:', { error: response.error });
        } else {
            logger.info(`Fetched ${response.data?.length ?? 0} available domain tags`);
        }
        return response;
    }
} 