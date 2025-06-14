import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    DialecticProject,
    ContributionContentSignedUrlResponse,
    StartSessionPayload,
    DialecticSession,
    AIModelCatalogEntry,
    DialecticProjectResource,
    DomainTagDescriptor,
    DomainOverlayDescriptor,
    UpdateProjectDomainTagPayload,
    DeleteProjectPayload,
    DialecticServiceActionPayload,
    UpdateProjectInitialPromptPayload,
    UploadProjectResourceFilePayload,
    FetchOptions,
    GetProjectResourceContentPayload,
    GetProjectResourceContentResponse,
    DialecticContribution,
    SubmitStageResponsesPayload,
    SubmitStageResponsesResponse,
    GetIterationInitialPromptPayload,
    IterationInitialPromptData,
    SaveContributionEditPayload,
    DialecticDomain,
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
     * Can be filtered by stageAssociation.
     * This endpoint is public and does not require authentication.
     */
    async listAvailableDomainTags(params?: { stageAssociation?: string }): Promise<ApiResponse<DomainTagDescriptor[]>> {
        logger.info('Fetching available domain tags for dialectic projects', { params });
        
        try {
            // The Edge Function expects the parameters in the body for a POST request.
            // We will send the action and an optional payload containing stageAssociation.
            const requestBody: { action: string; payload?: { stageAssociation?: string } } = {
                action: 'listAvailableDomainTags',
            };
            if (params?.stageAssociation) {
                requestBody.payload = { stageAssociation: params.stageAssociation };
            }

            const response = await this.apiClient.post<DomainTagDescriptor[], typeof requestBody>(
                'dialectic-service', 
                requestBody 
            );

            if (response.error) {
                logger.error('Error fetching available domain tags:', { error: response.error, params });
            } else {
                logger.info(`Fetched ${response.data?.length ?? 0} available domain tags`, { params });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listAvailableDomainTags:', { errorMessage: message, errorObject: error, params });
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
            const response = await this.apiClient.post<ContributionContentSignedUrlResponse | null, DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'getContributionContentSignedUrl',
                    payload: { contributionId },
                } as DialecticServiceActionPayload
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
    async uploadProjectResourceFile(
        payload: UploadProjectResourceFilePayload,
        methodOptions?: { onUploadProgress?: (progressEvent: ProgressEvent) => void } & FetchOptions
    ): Promise<ApiResponse<DialecticProjectResource>> {
        logger.info('Uploading project resource file', { projectId: payload.projectId, fileName: payload.fileName });

        const formData = new FormData();
        formData.append('action', 'uploadProjectResourceFile');
        formData.append('projectId', payload.projectId);
        formData.append('file', payload.file, payload.fileName);
        formData.append('fileName', payload.fileName);
        formData.append('fileSizeBytes', payload.fileSizeBytes.toString());
        formData.append('fileType', payload.fileType);
        if (payload.resourceDescription) {
            formData.append('resourceDescription', payload.resourceDescription);
        }

        try {
            const response = await this.apiClient.post<DialecticProjectResource, FormData>(
                'dialectic-service',
                formData,
                methodOptions
            );

            if (response.error) {
                logger.error('Error uploading project resource file:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('Successfully uploaded project resource file', { resourceId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in uploadProjectResourceFile:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Creates a new dialectic project.
     * The payload is FormData, which should include an 'action' field set to 'createProject',
     * 'projectName', and optionally 'initialUserPromptText' or 'promptFile',
     * 'selectedDomainTag', and 'selected_domain_overlay_id'.
     * Requires authentication.
     */
    async createProject(payload: FormData): Promise<ApiResponse<DialecticProject>> {
        logger.info('Creating new dialectic project using FormData', { 
            projectName: payload.get('projectName'), 
            hasPromptFile: !!payload.get('promptFile') 
        });

        try {
            // The payload is already FormData and includes the 'action' field.
            // The apiClient.post method should handle FormData correctly.
            const response = await this.apiClient.post<DialecticProject, FormData>(
                'dialectic-service',
                payload,
            );

            if (response.error) {
                logger.error('Error creating dialectic project:', { error: response.error });
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

    /**
     * Updates the domain tag for a specific project.
     * Requires authentication.
     */
    async updateProjectDomainTag(payload: UpdateProjectDomainTagPayload): Promise<ApiResponse<DialecticProject>> {
        logger.info('Updating domain tag for project', { projectId: payload.projectId, newTag: payload.selectedDomainTag });

        try {
            const response = await this.apiClient.post<DialecticProject, { action: string; payload: UpdateProjectDomainTagPayload }> (
                'dialectic-service',
                { action: 'updateProjectDomainTag', payload }
            );

            if (response.error) {
                logger.error('Error updating project domain tag:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('Successfully updated project domain tag', { projectId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in updateProjectDomainTag:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async deleteProject(payload: DeleteProjectPayload): Promise<ApiResponse<void>> {
        logger.info('[DialecticApi] Deleting project', { projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<void, DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'deleteProject',
                    payload,
                } as DialecticServiceActionPayload
            );

            if (response.error) {
                logger.error('[DialecticApi] Error deleting project:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('[DialecticApi] Successfully initiated project deletion', { projectId: payload.projectId });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred during project deletion';
            logger.error('[DialecticApi] Network error in deleteProject:', { errorMessage: message, projectId: payload.projectId, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            } as ApiResponse<void>;
        }
    }

    async cloneProject(payload: { projectId: string }): Promise<ApiResponse<DialecticProject>> {
        logger.info('Cloning dialectic project', { projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<DialecticProject, DialecticServiceActionPayload>(
                'dialectic-service',
                { action: 'cloneProject', payload } as DialecticServiceActionPayload
            );
            if (response.error) {
                logger.error('Error cloning project:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('Successfully cloned project', { newProjectId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred while cloning project';
            logger.error('Network error in cloneProject:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async exportProject(payload: { projectId: string }): Promise<ApiResponse<{ export_url: string }>> {
        logger.info('Exporting dialectic project', { projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<{ export_url: string }, DialecticServiceActionPayload>(
                'dialectic-service',
                { action: 'exportProject', payload } as DialecticServiceActionPayload
            );
            if (response.error) {
                logger.error('Error exporting project:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('Successfully initiated project export', { exportUrl: response.data?.export_url });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred while exporting project';
            logger.error('Network error in exportProject:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async updateDialecticProjectInitialPrompt(payload: UpdateProjectInitialPromptPayload): Promise<ApiResponse<DialecticProject>> {
        logger.info('Updating initial project prompt', { projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<DialecticProject, { action: string; payload: UpdateProjectInitialPromptPayload }>(
                'dialectic-service',
                { action: 'updateProjectInitialPrompt', payload },
            );
            if (response.error) {
                logger.error('Error updating project initial prompt:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('Successfully updated project initial prompt', { projectId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in updateDialecticProjectInitialPrompt:', { errorMessage: message, errorObject: error, projectId: payload.projectId });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async submitStageResponses(payload: SubmitStageResponsesPayload): Promise<ApiResponse<SubmitStageResponsesResponse>> {
        logger.info('Submitting stage responses and preparing next seed', { sessionId: payload.sessionId, projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<SubmitStageResponsesResponse, { action: string; payload: SubmitStageResponsesPayload }>(
                'dialectic-service',
                {
                    action: 'submitStageResponses',
                    payload,
                },
            );
            if (response.error) {
                logger.error('Error submitting stage responses:', { error: response.error, sessionId: payload.sessionId });
            } else {
                logger.info('Successfully submitted stage responses', { sessionId: payload.sessionId });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in submitStageResponses:', { errorMessage: message, errorObject: error, sessionId: payload.sessionId });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async saveContributionEdit(
        payload: SaveContributionEditPayload
    ): Promise<ApiResponse<DialecticContribution>> {
        logger.info('Saving user edit for contribution', {
            contributionId: payload.originalContributionIdToEdit,
        });

        try {
            const response = await this.apiClient.post<
                DialecticContribution,
                DialecticServiceActionPayload
            >('dialectic-service', {
                action: 'saveContributionEdit',
                payload,
            });

            if (response.error) {
                logger.error('Error saving contribution edit:', {
                    error: response.error,
                    contributionId: payload.originalContributionIdToEdit,
                });
            } else {
                logger.info('Successfully saved contribution edit', {
                    newContributionId: response.data?.id,
                });
            }
            return response;
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in saveContributionEdit:', {
                errorMessage: message,
                errorObject: error,
            });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async getIterationInitialPromptContent(payload: GetIterationInitialPromptPayload): Promise<ApiResponse<IterationInitialPromptData>> {
        logger.info('Fetching iteration initial prompt content', { sessionId: payload.sessionId, iterationNumber: payload.iterationNumber });
        try {
            const response = await this.apiClient.post<IterationInitialPromptData, { action: string; payload: GetIterationInitialPromptPayload }>(
                'dialectic-service',
                {
                    action: 'getIterationInitialPromptContent',
                    payload,
                },
            );
            if (response.error) {
                logger.error('Error fetching iteration initial prompt content:', { error: response.error, sessionId: payload.sessionId });
            } else {
                logger.info('Successfully fetched iteration initial prompt content', { sessionId: payload.sessionId });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in getIterationInitialPromptContent:', { errorMessage: message, errorObject: error, sessionId: payload.sessionId });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async getProjectResourceContent(
      payload: GetProjectResourceContentPayload
    ): Promise<ApiResponse<GetProjectResourceContentResponse>> {
      logger.info('[DialecticApi] Fetching project resource content', { resourceId: payload.resourceId });
      try {
        const response = await this.apiClient.post<GetProjectResourceContentResponse, DialecticServiceActionPayload>(
          'dialectic-service',
          {
            action: 'getProjectResourceContent',
            payload,
          } as DialecticServiceActionPayload
        );
    
        if (response.error) {
          logger.error('[DialecticApi] Error fetching project resource content:', { 
            error: response.error, 
            resourceId: payload.resourceId 
          });
        } else {
          logger.info('[DialecticApi] Successfully fetched project resource content', { 
            resourceId: payload.resourceId, 
            fileName: response.data?.fileName 
          });
        }
        return response;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'A network error occurred while fetching resource content';
        logger.error('[DialecticApi] Network error in getProjectResourceContent:', { 
          errorMessage: message, 
          resourceId: payload.resourceId, 
          errorObject: error 
        });
        return {
          data: undefined,
          error: { code: 'NETWORK_ERROR', message },
          status: 0,
        } as ApiResponse<GetProjectResourceContentResponse>;
      }
    }

    /**
     * Triggers the generation of contributions for a given session.
     * Requires authentication.
     */
    async generateContributions(payload: { sessionId: string }): Promise<ApiResponse<{ message: string; contributions?: DialecticContribution[] }>> {
        logger.info('Generating contributions for session', { sessionId: payload.sessionId });

        try {
            const response = await this.apiClient.post<{ message: string; contributions?: DialecticContribution[] }, DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'generateContributions',
                    payload,
                } as DialecticServiceActionPayload
            );

            if (response.error) {
                logger.error('Error generating contributions:', { error: response.error, sessionId: payload.sessionId });
            } else {
                logger.info('Successfully initiated contribution generation', { sessionId: payload.sessionId, responseData: response.data });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in generateContributions:', { errorMessage: message, errorObject: error, sessionId: payload.sessionId });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches the list of all available dialectic domains.
     * This endpoint is public and does not require authentication.
     */
    async listDomains(): Promise<ApiResponse<DialecticDomain[]>> {
        logger.info('Fetching all dialectic domains');

        try {
            const response = await this.apiClient.post<DialecticDomain[], { action: string }>(
                'dialectic-service',
                { action: 'listDomains' }
            );

            if (response.error) {
                logger.error('Error fetching dialectic domains:', { error: response.error });
            } else {
                logger.info(`Fetched ${response.data?.length ?? 0} dialectic domains`);
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listDomains:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }
} 