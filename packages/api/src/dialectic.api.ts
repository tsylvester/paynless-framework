import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    DialecticProject,
    CreateProjectPayload,
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

    /**
     * Creates a new dialectic project.
     * Requires authentication.
     */
    async createProject(payload: CreateProjectPayload): Promise<ApiResponse<DialecticProject>> {
        logger.info('Creating a new dialectic project', { projectName: payload.projectName });

        const response = await this.apiClient.post<DialecticProject, { action: string; payload: CreateProjectPayload }>(
            'dialectic-service',
            { action: 'createProject', payload },
            // Default options will ensure authentication is handled by apiClient
        );

        if (response.error) {
            logger.error('Error creating dialectic project:', { error: response.error, projectName: payload.projectName });
        } else {
            logger.info('Successfully created dialectic project', { projectId: response.data?.id });
        }
        return response;
    }

    /**
     * Fetches the list of dialectic projects for the authenticated user.
     * Requires authentication.
     */
    async listProjects(): Promise<ApiResponse<DialecticProject[]>> {
        logger.info('Fetching list of dialectic projects for user');

        const response = await this.apiClient.post<DialecticProject[], { action: string }>(
            'dialectic-service',
            { action: 'listProjects' }
            // Default options will ensure authentication is handled by apiClient
        );

        if (response.error) {
            logger.error('Error fetching dialectic projects:', { error: response.error });
        } else {
            logger.info(`Fetched ${response.data?.length ?? 0} dialectic projects`);
        }
        return response;
    }
} 