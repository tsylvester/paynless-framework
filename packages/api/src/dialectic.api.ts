import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    DialecticProject,
    DialecticStageRecipe,
    StartSessionPayload,
    DialecticSession,
    AIModelCatalogEntry,
    DomainDescriptor,
    DomainOverlayDescriptor,
    UpdateProjectDomainPayload,
    DeleteProjectPayload,
    DialecticServiceActionPayload,
    UpdateProjectInitialPromptPayload,
    GetProjectResourceContentPayload,
    GetProjectResourceContentResponse,
    SubmitStageResponsesPayload,
    SubmitStageResponsesResponse,
    GetIterationInitialPromptPayload,
    IterationInitialPromptData,
    SaveContributionEditPayload,
    SaveContributionEditSuccessResponse,
    DialecticDomain,
    DialecticProcessTemplate,
    UpdateSessionModelsPayload,
    GetContributionContentDataResponse,
    GetSessionDetailsResponse,
    GenerateContributionsPayload,
    GenerateContributionsResponse,
    DialecticProjectRow,
    ExportProjectResponse,
    GetStageDocumentFeedbackPayload,
    StageDocumentFeedback,
    SubmitStageDocumentFeedbackPayload,
    ListStageDocumentsPayload,
    ListStageDocumentsResponse,
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
     * Fetch the active stage recipe for a stageSlug.
     * Public endpoint (no auth required).
     */
    async fetchStageRecipe(stageSlug: string): Promise<ApiResponse<DialecticStageRecipe>> {
        logger.info('Fetching stage recipe', { stageSlug });
        try {
            const response = await this.apiClient.post<DialecticStageRecipe, { action: string; payload: { stageSlug: string } }>(
                'dialectic-service',
                { action: 'getStageRecipe', payload: { stageSlug } }
            );

            if (response.error) {
                logger.error('Error fetching stage recipe', { error: response.error, stageSlug });
                return response;
            }

            // Return steps sorted by execution_order, then step_key for stability
            const steps = Array.isArray(response.data?.steps) ? [...response.data!.steps] : [];
            steps.sort((a, b) => {
                if (a.execution_order !== b.execution_order) return a.execution_order - b.execution_order;
                return a.step_key.localeCompare(b.step_key);
            });

            const normalized: ApiResponse<DialecticStageRecipe> = {
                status: response.status,
                data: response.data ? { ...response.data, steps } : undefined,
                error: undefined,
            };

            logger.info('Successfully fetched stage recipe', { stageSlug });
            return normalized;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in fetchStageRecipe', { errorMessage: message, errorObject: error, stageSlug });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches the list of available domain tags for dialectic projects.
     * Can be filtered by stageAssociation.
     * This endpoint is public and does not require authentication.
     */
    async listAvailableDomains(params?: { stageAssociation?: string }): Promise<ApiResponse<DomainDescriptor[]>> {
        logger.info('Fetching available domains for dialectic projects', { params });
        
        try {
            // The Edge Function expects the parameters in the body for a POST request.
            // We will send the action and an optional payload containing stageAssociation.
            const requestBody: { action: string; payload?: { stageAssociation?: string } } = {
                action: 'listAvailableDomains',
            };
            if (params?.stageAssociation) {
                requestBody.payload = { stageAssociation: params.stageAssociation };
            }

            const response = await this.apiClient.post<DomainDescriptor[], typeof requestBody>(
                'dialectic-service', 
                requestBody 
            );

            if (response.error) {
                logger.error('Error fetching available domains:', { error: response.error, params });
            } else {
                logger.info(`Fetched ${response.data?.length ?? 0} available domains`, { params });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listAvailableDomains:', { errorMessage: message, errorObject: error, params });
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
     * Fetches the actual content of a specific dialectic contribution directly.
     * Requires authentication.
     */
    async getContributionContentData(contributionId: string): Promise<ApiResponse<GetContributionContentDataResponse | null>> {
        logger.info('Fetching contribution content data directly', { contributionId });

        try {
            logger.debug(`[DialecticApiClient.getContributionContentData] About to call this.apiClient.post for ${contributionId}`);
            const response = await this.apiClient.post<GetContributionContentDataResponse | null, DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'getContributionContentData',
                    payload: { contributionId },
                }
            );

            if (response.error) {
                logger.error('Error fetching contribution content data directly:', { error: response.error, contributionId });
            } else if (response.data) {
                logger.info('Successfully fetched contribution content data directly', { contributionId, hasContent: !!response.data.content, fileName: response.data.fileName });
            } else {
                logger.warn('No data returned when fetching contribution content data directly', { contributionId });
            }
            return response;
        } catch (error: unknown) {
            logger.warn('[DialecticApiClient.getContributionContentData] Caught something in catch block:', { errorVal: error, contributionId });
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in getContributionContentData:', { errorMessage: message, errorObject: error, contributionId });
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
     * 'selectedDomain', and 'selectedDomainOverlayId'.
     * Requires authentication.
     */
    async createProject(payload: FormData): Promise<ApiResponse<DialecticProjectRow>> {
        logger.info('Creating new dialectic project using FormData', { 
            projectName: payload.get('projectName'), 
            hasPromptFile: !!payload.get('promptFile') 
        });

        try {
            // The payload is already FormData and includes the 'action' field.
            // The apiClient.post method should handle FormData correctly.
            const response = await this.apiClient.post<DialecticProjectRow, FormData>(
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
     * Updates the domain for a specific project.
     * Requires authentication.
     */
    async updateProjectDomain(payload: UpdateProjectDomainPayload): Promise<ApiResponse<DialecticProject>> {
        logger.info(`Updating domain for project ${payload.projectId}`);

        try {
            const response = await this.apiClient.post<DialecticProject, { action: string; payload: UpdateProjectDomainPayload }>(
                'dialectic-service',
                { action: 'updateProjectDomain', payload }
            );

            if (response.error) {
                logger.error('Error updating project domain:', { error: response.error, projectId: payload.projectId });
            } else {
                logger.info('Successfully updated project domain', { projectId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in updateProjectDomain:', { errorMessage: message, errorObject: error });
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
                }
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
            };
        }
    }

    async cloneProject(payload: { projectId: string }): Promise<ApiResponse<DialecticProject>> {
        logger.info('Cloning dialectic project', { projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<DialecticProject, DialecticServiceActionPayload>(
                'dialectic-service',
                { action: 'cloneProject', payload }
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

    async exportProject(payload: { projectId: string }): Promise<ApiResponse<ExportProjectResponse>> {
        logger.info('Exporting dialectic project', { projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<ExportProjectResponse, DialecticServiceActionPayload>(
                'dialectic-service',
                { action: 'exportProject', payload }
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
                status: 503,
            };
        }
    }

    async updateDialecticProjectInitialPrompt(payload: UpdateProjectInitialPromptPayload): Promise<ApiResponse<DialecticProjectRow>> {
        logger.info('Updating initial project prompt', { projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<DialecticProjectRow, { action: string; payload: UpdateProjectInitialPromptPayload }>(
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

    async submitStageResponses(payload: Omit<SubmitStageResponsesPayload, 'responses'>): Promise<ApiResponse<SubmitStageResponsesResponse>> {
        logger.info('Advancing stage and preparing next seed', { sessionId: payload.sessionId, projectId: payload.projectId });
        try {
            const response = await this.apiClient.post<SubmitStageResponsesResponse, { action: string; payload: Omit<SubmitStageResponsesPayload, 'responses'> }>(
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
    ): Promise<ApiResponse<SaveContributionEditSuccessResponse>> {
        logger.info('Saving user edit for contribution', {
            contributionId: payload.originalContributionIdToEdit,
        });

        try {
            const response = await this.apiClient.post<
                SaveContributionEditSuccessResponse,
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
                    resourceId: response.data?.resource?.id,
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
          }
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
        };
      }
    }

    async listStageDocuments(payload: ListStageDocumentsPayload): Promise<ApiResponse<ListStageDocumentsResponse>> {
        logger.info('Listing stage documents', { ...payload });
        try {
            const response = await this.apiClient.post<ListStageDocumentsResponse, DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'listStageDocuments',
                    payload,
                }
            );
    
            if (response.error) {
                logger.error('Error listing stage documents:', { error: response.error, ...payload });
            } else {
                logger.info('Successfully listed stage documents', { ...payload });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in listStageDocuments:', { errorMessage: message, errorObject: error, ...payload });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Updates the selected models for a given session.
     * Requires authentication.
     */
    async updateSessionModels(payload: UpdateSessionModelsPayload): Promise<ApiResponse<DialecticSession>> {
        logger.info('Updating selected models for session', { sessionId: payload.sessionId, models: payload.selectedModelIds });

        try {
            const response = await this.apiClient.post<DialecticSession, DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'updateSessionModels',
                    payload,
                }
            );

            if (response.error) {
                logger.error('Error updating session models:', { error: response.error, sessionId: payload.sessionId });
            } else {
                logger.info('Successfully updated session models', { sessionId: payload.sessionId, updatedSession: response.data });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in updateSessionModels:', { errorMessage: message, errorObject: error, sessionId: payload.sessionId });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Triggers the generation of contributions for a given session.
     * Requires authentication.
     */
    async generateContributions(payload: GenerateContributionsPayload): Promise<ApiResponse<GenerateContributionsResponse>> {
        logger.info('Generating contributions for session', { sessionId: payload.sessionId });

        try {
            const response = await this.apiClient.post<GenerateContributionsResponse, { action: string; payload: GenerateContributionsPayload }>(
                'dialectic-service',
                {
                    action: 'generateContributions',
                    payload, // payload now contains the full object
                }
            );

            if (response.error) {
                logger.error('Error generating contributions:', { error: response.error, sessionId: payload.sessionId });
            } else {
                logger.info('Successfully started contribution generation process', { sessionId: payload.sessionId });
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
                { action: 'listDomains' },
                { isPublic: true }
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

    async fetchProcessTemplate(payload: { templateId: string }): Promise<ApiResponse<DialecticProcessTemplate>> {
        logger.info('Fetching process template', { templateId: payload.templateId });
        try {
            const response = await this.apiClient.post<DialecticProcessTemplate, DialecticServiceActionPayload>(
                'dialectic-service',
                { action: 'fetchProcessTemplate', payload }
            );
            if (response.error) {
                logger.error('Error fetching process template:', { error: response.error, templateId: payload.templateId });
            } else {
                logger.info('Successfully fetched process template', { templateId: response.data?.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in fetchProcessTemplate:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    /**
     * Fetches the details of a specific dialectic session, including its current stage details.
     * Requires authentication.
     * @param sessionId - The ID of the dialectic session to fetch details for
     * @param skipSeedPrompt - Optional flag to skip fetching the seed prompt (e.g., when already in store)
     */
    async getSessionDetails(sessionId: string, skipSeedPrompt?: boolean): Promise<ApiResponse<GetSessionDetailsResponse>> {
        logger.info('Fetching details for dialectic session', { sessionId, skipSeedPrompt });

        try {
            const payload: { sessionId: string; skipSeedPrompt?: boolean } = { sessionId };
            if (skipSeedPrompt !== undefined) {
                payload.skipSeedPrompt = skipSeedPrompt;
            }

            const response = await this.apiClient.post<GetSessionDetailsResponse, { action: string; payload: { sessionId: string; skipSeedPrompt?: boolean } }>(
                'dialectic-service',
                { action: 'getSessionDetails', payload }
            );

            if (response.error) {
                logger.error('Error fetching dialectic session details:', { error: response.error, sessionId });
            } else {
                logger.info('Successfully fetched dialectic session details', { sessionId: response.data?.session.id });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in getSessionDetails:', { errorMessage: message, errorObject: error });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async getStageDocumentFeedback(payload: GetStageDocumentFeedbackPayload): Promise<ApiResponse<StageDocumentFeedback[]>> {
        logger.info('Fetching stage document feedback', { ...payload });
        try {
            const response = await this.apiClient.post<StageDocumentFeedback[], DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'getStageDocumentFeedback',
                    payload,
                }
            );
    
            if (response.error) {
                logger.error('Error fetching stage document feedback:', { error: response.error, ...payload });
            } else {
                logger.info('Successfully fetched stage document feedback', { ...payload });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in getStageDocumentFeedback:', { errorMessage: message, errorObject: error, ...payload });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }

    async submitStageDocumentFeedback(payload: SubmitStageDocumentFeedbackPayload): Promise<ApiResponse<{ success: boolean }>> {
        logger.info('Submitting stage document feedback', { ...payload });
        try {
            const response = await this.apiClient.post<{ success: boolean }, DialecticServiceActionPayload>(
                'dialectic-service',
                {
                    action: 'submitStageDocumentFeedback',
                    payload,
                }
            );
    
            if (response.error) {
                logger.error('Error submitting stage document feedback:', { error: response.error, ...payload });
            } else {
                logger.info('Successfully submitted stage document feedback', { ...payload });
            }
            return response;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'A network error occurred';
            logger.error('Network error in submitStageDocumentFeedback:', { errorMessage: message, errorObject: error, ...payload });
            return {
                data: undefined,
                error: { code: 'NETWORK_ERROR', message },
                status: 0,
            };
        }
    }
} 