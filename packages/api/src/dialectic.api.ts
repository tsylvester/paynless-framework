import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    DialecticProject,
    CreateProjectPayload,
    ContributionContentSignedUrlResponse,
    StartSessionPayload,
    DialecticSession,
    AIModelCatalogEntry,
    UploadProjectResourceFilePayload,
    DialecticProjectResource,
    DomainTagDescriptor,
    DomainOverlayDescriptor
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
    async listAvailableDomainTags(): Promise<ApiResponse<{ data: DomainTagDescriptor[] }>> {
        logger.info('Fetching available domain tags for dialectic projects');
        
        try {
            const response = await this.apiClient.post<{ data: DomainTagDescriptor[] }, { action: string }>(
                'dialectic-service', // Endpoint name
                { action: 'listAvailableDomainTags' } // Body of the request
            );

            if (response.error) {
                logger.error('Error fetching available domain tags:', { error: response.error });
            } else {
                logger.info(`Fetched ${response.data?.data?.length ?? 0} available domain tags`);
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listAvailableDomainTags:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches the list of available domain overlay details for a given stage association.
     * Requires authentication.
     */
    async listAvailableDomainOverlays(payload: { stageAssociation: string }): Promise<ApiResponse<DomainOverlayDescriptor[]>> {
        logger.info('Fetching available domain overlay details', { stageAssociation: payload.stageAssociation });

        try {
            const response = await this.apiClient.post<DomainOverlayDescriptor[], { action: string; payload: { stageAssociation: string } }>(
                'dialectic-service',
                { action: 'listAvailableDomainOverlays', payload }
            );

            if (response.error) {
                logger.error('Error fetching domain overlay details:', { error: response.error, stageAssociation: payload.stageAssociation });
            } else {
                logger.info(`Successfully fetched ${response.data?.length ?? 0} domain overlay details`, { stageAssociation: payload.stageAssociation });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listAvailableDomainOverlays:', { errorMessage: message, stageAssociation: payload.stageAssociation, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches the list of dialectic projects for the authenticated user.
     * Requires authentication.
     */
    async listProjects(): Promise<ApiResponse<DialecticProject[]>> {
        logger.info('Fetching list of dialectic projects for user');

        try {
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
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listProjects:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Starts a new dialectic session for a given project.
     * Requires authentication.
     */
    async startSession(payload: StartSessionPayload): Promise<ApiResponse<DialecticSession>> {
        logger.info('Starting a new dialectic session', { projectId: payload.projectId });

        try {
            const response = await this.apiClient.post<DialecticSession, { action: string; payload: StartSessionPayload }>(
                'dialectic-service',
                { action: 'startSession', payload },
            );

            if (response.error) {
                logger.error('Error starting dialectic session:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('Successfully started dialectic session', { sessionId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in startSession:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches the details of a specific dialectic project, including its sessions and contributions.
     * Requires authentication.
     */
    async getProjectDetails(projectId: string): Promise<ApiResponse<DialecticProject>> {
        logger.info('Fetching details for dialectic project', { projectId });

        try {
            const response = await this.apiClient.post<DialecticProject, { action: string; payload: { projectId: string } }>(
                'dialectic-service',
                { action: 'getProjectDetails', payload: { projectId } }
            );

            if (response.error) {
                logger.error('Error fetching dialectic project details:', { error: response.error, projectId });
            } else {
                logger.info('Successfully fetched dialectic project details', { projectId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in getProjectDetails:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches the list of available AI models from the catalog.
     * Requires authentication.
     */
    async listModelCatalog(): Promise<ApiResponse<AIModelCatalogEntry[]>> {
        logger.info('Fetching AI model catalog');

        try {
            const response = await this.apiClient.post<AIModelCatalogEntry[], { action: string }>(
                'dialectic-service',
                { action: 'listModelCatalog' }
            );

            if (response.error) {
                logger.error('Error fetching AI model catalog:', { error: response.error });
            } else {
                logger.info(`Fetched ${response.data?.length ?? 0} AI models from catalog`);
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listModelCatalog:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches a signed URL for a specific dialectic contribution's content.
     * Requires authentication.
     */
    async getContributionContentSignedUrl(contributionId: string): Promise<ApiResponse<ContributionContentSignedUrlResponse | null>> {
        logger.info('Fetching signed URL for contribution content', { contributionId });

        try {
            const response = await this.apiClient.post<ContributionContentSignedUrlResponse | null, { action: string; payload: { contributionId: string } }>(
                'dialectic-service',
                { action: 'getContributionContentSignedUrl', payload: { contributionId } }
            );

            if (response.error) {
                logger.error('Error fetching signed URL for contribution content:', { error: response.error, contributionId });
            } else if (response.data) {
                logger.info('Successfully fetched signed URL for contribution content', { contributionId, signedUrl: response.data.signedUrl });
            } else {
                logger.warn('No signed URL data returned for contribution content', { contributionId });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in getContributionContentSignedUrl:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Uploads a project resource file.
     * Requires authentication.
     */
    async uploadProjectResourceFile(payload: UploadProjectResourceFilePayload): Promise<ApiResponse<DialecticProjectResource>> {
        logger.info(`[DialecticApi] Uploading resource for project ${payload.projectId}: ${payload.fileName}`);
        try {
            const formData = new FormData();
            formData.append('action', 'uploadProjectResourceFile');
            formData.append('projectId', payload.projectId);
            formData.append('fileName', payload.fileName);
            formData.append('fileSizeBytes', payload.fileSizeBytes.toString());
            formData.append('fileType', payload.fileType);
            if (payload.resourceDescription) {
                formData.append('resourceDescription', payload.resourceDescription);
            }
            formData.append('file', payload.file, payload.fileName);

            const response = await this.apiClient.post<DialecticProjectResource, FormData>(
                'dialectic-service',
                formData
            );

            if (response.error) {
                logger.error('[DialecticApi] Error uploading project resource file:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('[DialecticApi] Successfully uploaded project resource file:', { resource: response.data, projectId: payload.projectId });
            }
            return response;
        } catch (error: unknown) {
            const err = error as Error;
            logger.error('[DialecticApi] Network error uploading project resource file:', { error: err.message, projectId: payload.projectId });
            return {
                error: { message: err.message, code: 'NETWORK_ERROR' },
                status: 0
            } as ApiResponse<DialecticProjectResource>;
        }
    }

    /**
     * Creates a new dialectic project for the authenticated user.
     * Requires authentication.
     */
    async createProject(payload: CreateProjectPayload): Promise<ApiResponse<DialecticProject>> {
        logger.info('Creating a new dialectic project', { projectName: payload.projectName });

        try {
            const response = await this.apiClient.post<DialecticProject, { action: string; payload: CreateProjectPayload }>(
                'dialectic-service',
                { action: 'createProject', payload }
            );

            if (response.error) {
                logger.error('Error creating dialectic project:', { error: response.error, projectName: payload.projectName });
            } else {
                logger.info('Successfully created dialectic project', { projectId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in createProject:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }
} 