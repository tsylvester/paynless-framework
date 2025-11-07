import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import { ApiClient, ApiError as LocalApiError } from './apiClient';
import { 
    ApiResponse, 
    ApiError as ApiErrorType,
    CreateProjectPayload, 
    DialecticProject, 
    StartSessionPayload, 
    DialecticSession, 
    AIModelCatalogEntry, 
    ContributionContentSignedUrlResponse, 
    DialecticProjectResource, 
    DomainOverlayDescriptor, 
    UpdateProjectDomainPayload,
    DeleteProjectPayload,
    DialecticServiceActionPayload,
    GetContributionContentSignedUrlPayload,
    GetProjectResourceContentPayload,
    DialecticContribution,
    GenerateContributionsPayload,
    GenerateContributionsResponse,
    UpdateProjectInitialPromptPayload,
    SubmitStageResponsesPayload,
    SubmitStageResponsesResponse,
    SaveContributionEditPayload,
    GetIterationInitialPromptPayload,
    IterationInitialPromptData,
    GetProjectResourceContentResponse,
    DialecticDomain,
    DialecticProcessTemplate,
    DialecticStage,
    UpdateSessionModelsPayload,
    DomainDescriptor,
    GetContributionContentDataResponse,
} from '@paynless/types';

// Mock the base ApiClient
const mockApiClientPost = vi.fn();
const mockApiClient = {
    get: vi.fn(),
    post: mockApiClientPost,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
} as unknown as ApiClient; 

// Create an instance of the class we are testing
const dialecticApiClient = new DialecticApiClient(mockApiClient);

// Mock data (ensure these align with current type definitions)
const mockDialecticProject: DialecticProject = {
  id: 'proj-123',
  user_id: 'user-abc',
  project_name: 'Test Project',
  initial_user_prompt: 'Test prompt',
  selected_domain_id: 'dom-1',
  dialectic_domains: { name: 'Software Development' },
  selected_domain_overlay_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  repo_url: null,
  status: 'active',
  dialectic_process_templates: null,
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
};

const mockDialecticSession: DialecticSession = {
  id: 'sess-456',
  project_id: 'proj-123',
  session_description: "Test Session",
  iteration_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: "pending_hypothesis",
  associated_chat_id: null,
  current_stage_id: 'stage-123',
  selected_model_ids: ['model-1'],
  user_input_reference_url: null,
};

// Remove any mock project data that incorrectly includes a 'sessions' array directly
// For example, if baseMockProject previously had a sessions property, remove it:
const baseMockProject: Omit<DialecticProject, 'user_id' | 'created_at' | 'updated_at' | 'id' | 'dialectic_domains' | 'dialectic_process_templates'> & Partial<Pick<DialecticProject, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { dialectic_domains?: { name: string } | null, dialectic_process_templates?: DialecticProcessTemplate | null } = {
    project_name: "Test Project Base",
    initial_user_prompt: "Base prompt.",
    selected_domain_id: "dom-1",
    dialectic_domains: { name: 'Software Development' },
    selected_domain_overlay_id: null,
    repo_url: null,
    status: 'active',
    dialectic_process_templates: null,
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
};

describe('DialecticApiClient', () => {
    beforeEach(() => {
        vi.resetAllMocks(); // Reset mocks before each test
    });

    describe('cloneProject', () => {
        const endpoint = 'dialectic-service';
        const originalProjectId = 'proj-to-clone-456';
        const validPayload = { projectId: originalProjectId }; // Payload for the API client method
        const requestBody = { action: 'cloneProject', payload: validPayload }; // Actual body for apiClient.post

        const mockClonedProject: DialecticProject = {
            ...mockDialecticProject, // Use the base mock project and override necessary fields
            id: 'cloned-proj-789', // New ID for the cloned project
            project_name: `${mockDialecticProject.project_name} (Clone)`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_sessions: [], 
            resources: [],
            dialectic_process_templates: null,
            isLoadingProcessTemplate: false,
            processTemplateError: null,
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
        };

        it('should call apiClient.post with the correct endpoint and body for cloneProject', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockClonedProject,
                status: 201, // 201 for a new resource created
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.cloneProject(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the cloned project data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockClonedProject,
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.cloneProject(validPayload);

            expect(result.data).toEqual(mockClonedProject);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed clone (e.g., original project not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Original project to clone not found' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.cloneProject(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for cloneProject';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.cloneProject(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });    
    
    describe('createProject', () => {
        const endpoint = 'dialectic-service';
        const validPayload: CreateProjectPayload = {
            projectName: 'Test Project',
            initialUserPrompt: 'Test prompt',
            selectedDomainId: 'dom-1',
        };

        // Helper to create FormData from CreateProjectPayload for tests
        const createFormDataFromPayload = (payload: CreateProjectPayload): FormData => {
            const formData = new FormData();
            formData.append('action', 'createProject');
            formData.append('projectName', payload.projectName);
            if (payload.initialUserPrompt) {
                formData.append('initialUserPromptText', payload.initialUserPrompt);
            }
            if (payload.selectedDomainId) {
                formData.append('selectedDomainId', payload.selectedDomainId);
            }
            if (payload.selectedDomainOverlayId) {
                formData.append('selectedDomainOverlayId', payload.selectedDomainOverlayId);
            }
            // Assuming promptFile would be handled here if tests included it
            return formData;
        };

        it('should call apiClient.post with the correct endpoint and body for createProject', async () => {
            const mockProjectResponse: DialecticProject = {
                id: 'project-123',
                user_id: 'user-xyz',
                project_name: validPayload.projectName,
                initial_user_prompt: validPayload.initialUserPrompt,
                selected_domain_id: validPayload.selectedDomainId,
                dialectic_domains: { name: 'Software Development' },
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                dialectic_process_templates: null,
                isLoadingProcessTemplate: false,
                processTemplateError: null,
                contributionGenerationStatus: 'idle',
                generateContributionsError: null,
                isSubmittingStageResponses: false,
                submitStageResponsesError: null,
                isSavingContributionEdit: false,
                saveContributionEditError: null,
            }; 
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockProjectResponse,
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const formData = createFormDataFromPayload(validPayload);
            await dialecticApiClient.createProject(formData);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            // Check FormData content more robustly if possible, or ensure it's a FormData instance
            expect(calls[0][1]).toBeInstanceOf(FormData);
            const sentFormData = calls[0][1] as FormData;
            expect(sentFormData.get('action')).toEqual('createProject');
            expect(sentFormData.get('projectName')).toEqual(validPayload.projectName);
            expect(sentFormData.get('initialUserPromptText')).toEqual(validPayload.initialUserPrompt);
            expect(sentFormData.get('selectedDomainId')).toEqual(validPayload.selectedDomainId);
            expect(calls[0][2]).toBeUndefined(); // No options expected
        });

        it('should return the created project data on successful response', async () => {
            const mockProjectData: DialecticProject = { 
                id: 'project-123', 
                user_id: 'user-abc',
                project_name: validPayload.projectName,
                initial_user_prompt: validPayload.initialUserPrompt,
                selected_domain_id: validPayload.selectedDomainId,
                dialectic_domains: { name: 'Software Development' },
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                dialectic_process_templates: null,
                isLoadingProcessTemplate: false,
                processTemplateError: null,
                contributionGenerationStatus: 'idle',
                generateContributionsError: null,
                isSubmittingStageResponses: false,
                submitStageResponsesError: null,
                isSavingContributionEdit: false,
                saveContributionEditError: null,
            };
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockProjectData,
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const formData = createFormDataFromPayload(validPayload);
            const result = await dialecticApiClient.createProject(formData);

            expect(result.data).toEqual(mockProjectData);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed project creation', async () => {
            const mockApiError: ApiErrorType = { code: 'VALIDATION_ERROR', message: 'Project name is required' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 400,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);
            
            const formData = createFormDataFromPayload(validPayload);
            const result = await dialecticApiClient.createProject(formData); 

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const formData = createFormDataFromPayload(validPayload);
            const result = await dialecticApiClient.createProject(formData); 

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });    
    
    describe('deleteProject', () => {
        const endpoint = 'dialectic-service';
        const validPayload: DeleteProjectPayload = { projectId: 'proj-123' };
        const requestBody = { action: 'deleteProject', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and body for deleteProject', async () => {
            const mockResponse: ApiResponse<void> = {
                data: undefined, // Or null, depending on expected void response structure
                status: 204, // No Content is typical for successful deletion
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.deleteProject(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return successfully (e.g., 204 status) on successful deletion', async () => {
            const mockResponse: ApiResponse<void> = {
                data: undefined,
                status: 204,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.deleteProject(validPayload);

            expect(result.data).toBeUndefined();
            expect(result.status).toBe(204);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed deletion (e.g., project not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Project to delete not found' };
            const mockErrorResponse: ApiResponse<void> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.deleteProject(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for deleteProject';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.deleteProject(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('exportProject', () => {
        const endpoint = 'dialectic-service';
        const projectIdToExport = 'proj-to-export-111';
        const validPayload = { projectId: projectIdToExport }; // Payload for the API client method
        const requestBody = { action: 'exportProject', payload: validPayload }; // Actual body for apiClient.post

        const mockExportResponseData = {
            export_url: 'https://example.com/exports/proj-to-export-111.zip',
        };

        it('should call apiClient.post with the correct endpoint and body for exportProject', async () => {
            const mockResponse: ApiResponse<{ export_url: string }> = {
                data: mockExportResponseData,
                status: 200, 
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.exportProject(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the export URL on successful response', async () => {
            const mockResponse: ApiResponse<{ export_url: string }> = {
                data: mockExportResponseData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.exportProject(validPayload);

            expect(result.data).toEqual(mockExportResponseData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed export (e.g., project not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Project to export not found' };
            const mockErrorResponse: ApiResponse<{ export_url: string }> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.exportProject(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for exportProject';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.exportProject(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(503);
            expect(result.data).toBeUndefined();
        });
    });
  
    describe('getProjectDetails', () => {
        const endpoint = 'dialectic-service';
        const projectId = 'proj-123';
        const requestBody = { action: 'getProjectDetails', payload: { projectId } };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockDialecticProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getProjectDetails(projectId);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the project details on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockDialecticProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getProjectDetails(projectId);

            expect(result.data).toEqual(mockDialecticProject);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response (e.g., project not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Project not found' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getProjectDetails(projectId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getProjectDetails';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.getProjectDetails(projectId);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });    

    describe('getProjectResourceContent', () => {
        const endpoint = 'dialectic-service';
        const validPayload: GetProjectResourceContentPayload = {
            resourceId: 'resource-abc-123',
        };
        const requestBody = { action: 'getProjectResourceContent', payload: validPayload };

        const mockResourceContentResponse: GetProjectResourceContentResponse = {
            fileName: 'prompt.md',
            mimeType: 'text/markdown',
            content: '## Initial Project Prompt\n\nThis is the detailed content of the project resource file.',
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<GetProjectResourceContentResponse> = {
                data: mockResourceContentResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getProjectResourceContent(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the project resource content on successful response', async () => {
            const mockResponse: ApiResponse<GetProjectResourceContentResponse> = {
                data: mockResourceContentResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getProjectResourceContent(validPayload);

            expect(result.data).toEqual(mockResourceContentResponse);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed fetch (e.g., resource not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Project resource content not found' };
            const mockErrorResponse: ApiResponse<GetProjectResourceContentResponse> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getProjectResourceContent(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getProjectResourceContent';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.getProjectResourceContent(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });     
    
    describe('listProjects', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listProjects' };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticProject[]> = {
                data: [],
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listProjects();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the projects array on successful response', async () => {
            const mockProjectsData: DialecticProject[] = [mockDialecticProject];
            const mockResponse: ApiResponse<DialecticProject[]> = {
                data: mockProjectsData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listProjects();

            expect(result.data).toEqual(mockProjectsData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch projects' };
            const mockErrorResponse: ApiResponse<DialecticProject[]> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listProjects();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for listProjects';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listProjects();

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('updateDialecticProjectInitialPrompt', () => {
        const endpoint = 'dialectic-service';
        const validPayload: UpdateProjectInitialPromptPayload = {
            projectId: 'proj-123',
            newInitialPrompt: 'This is the updated initial prompt.',
        };
        // The action name in DialecticServiceActionPayload for this is not explicitly defined in the provided types,
        // but based on convention it would likely be 'updateDialecticProjectInitialPrompt'.
        // Let's assume this is the action string the backend expects.
        const requestBody = { action: 'updateProjectInitialPrompt', payload: validPayload };

        const mockUpdatedProject: DialecticProject = {
            ...mockDialecticProject, // Spread existing mock project
            id: validPayload.projectId,
            initial_user_prompt: validPayload.newInitialPrompt,
            updated_at: new Date().toISOString(),
            dialectic_process_templates: null,
            isLoadingProcessTemplate: false,
            processTemplateError: null,
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            // This requestBody needs to align with how DialecticServiceActionPayload is structured for this action
            // Assuming the action string is 'updateDialecticProjectInitialPrompt' as per convention.
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the updated project data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload);

            expect(result.data).toEqual(mockUpdatedProject);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed update (e.g., project not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Project not found for prompt update' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for updateDialecticProjectInitialPrompt';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('updateProjectDomain', () => {
        const endpoint = 'dialectic-service';
        const projectId = 'proj-123';
        const domainId = 'dom-2';
        const payload: UpdateProjectDomainPayload = { projectId, selectedDomainId: domainId };
        const requestBody = { action: 'updateProjectDomain', payload };
        const mockUpdatedProject: DialecticProject = {
            ...mockDialecticProject,
            selected_domain_id: domainId,
            dialectic_domains: { name: 'Finance' },
            dialectic_process_templates: null,
            isLoadingProcessTemplate: false,
            processTemplateError: null,
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.updateProjectDomain(payload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the updated project on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.updateProjectDomain(payload);

            expect(result.data).toEqual(mockUpdatedProject);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to update domain' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.updateProjectDomain(payload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.updateProjectDomain(payload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });      

    describe('fetchStageRecipe', () => {
        const endpoint = 'dialectic-service';
        const stageSlug = 'synthesis';
        const requestBody = { action: 'getStageRecipe', payload: { stageSlug } };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            type StageRecipeResponse = {
                stageSlug: string;
                instanceId: string;
                steps: Array<{
                    id: string;
                    step_key: string;
                    step_slug: string;
                    step_name: string;
                    execution_order: number;
                    parallel_group?: number | null;
                    branch_key?: string | null;
                    job_type: string;
                    prompt_type: string;
                    prompt_template_id?: string | null;
                    output_type: string;
                    granularity_strategy: string;
                    inputs_required: Array<{ type: string; document_key: string; required: boolean; stage_slug?: string }>;
                    inputs_relevance?: Array<{ document_key: string; relevance: number; type?: string; stage_slug?: string }>;
                    outputs_required?: Array<{ type: string; document_key: string }>;
                }>;
            };

            const backendResponse: ApiResponse<StageRecipeResponse> = {
                status: 200,
                data: {
                    stageSlug,
                    instanceId: 'instance-123',
                    // Two steps intentionally out of order to assert ordering in returned payload
                    steps: [
                        {
                            id: 'step-b', step_key: 'b_key', step_slug: 'b-slug', step_name: 'B',
                            execution_order: 2, parallel_group: 2, branch_key: 'branch_b',
                            job_type: 'EXECUTE', prompt_type: 'Turn', prompt_template_id: 'pt-b',
                            output_type: 'AssembledDocumentJson', granularity_strategy: 'per_source_document',
                            inputs_required: [{ type: 'document', document_key: 'feature_spec', required: true, stage_slug: 'thesis' }],
                            inputs_relevance: [{ document_key: 'feature_spec', relevance: 1, type: 'document', stage_slug: 'thesis' }],
                            outputs_required: [{ type: 'header_context', document_key: 'header_ctx_b' }],
                        },
                        {
                            id: 'step-a', step_key: 'a_key', step_slug: 'a-slug', step_name: 'A',
                            execution_order: 1, parallel_group: 1, branch_key: 'branch_a',
                            job_type: 'PLAN', prompt_type: 'Planner', prompt_template_id: 'pt-a',
                            output_type: 'HeaderContext', granularity_strategy: 'all_to_one',
                            inputs_required: [{ type: 'seed_prompt', document_key: 'seed_prompt', required: true }],
                            inputs_relevance: [],
                            outputs_required: [{ type: 'header_context', document_key: 'header_ctx_a' }],
                        },
                    ],
                },
            };
            mockApiClientPost.mockResolvedValueOnce(backendResponse);

            await dialecticApiClient.fetchStageRecipe(stageSlug);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return normalized DialecticStageRecipe with steps sorted and fields preserved', async () => {
            const backendResponse: ApiResponse<any> = {
                status: 200,
                data: {
                    stageSlug,
                    instanceId: 'instance-123',
                    steps: [
                        {
                            id: 'step-b', step_key: 'b_key', step_slug: 'b-slug', step_name: 'B',
                            execution_order: 2, parallel_group: 2, branch_key: 'branch_b',
                            job_type: 'EXECUTE', prompt_type: 'Turn', prompt_template_id: 'pt-b',
                            output_type: 'AssembledDocumentJson', granularity_strategy: 'per_source_document',
                            inputs_required: [{ type: 'document', document_key: 'feature_spec', required: true, stage_slug: 'thesis' }],
                            inputs_relevance: [{ document_key: 'feature_spec', relevance: 1, type: 'document', stage_slug: 'thesis' }],
                            outputs_required: [{ type: 'header_context', document_key: 'header_ctx_b' }],
                        },
                        {
                            id: 'step-a', step_key: 'a_key', step_slug: 'a-slug', step_name: 'A',
                            execution_order: 1, parallel_group: 1, branch_key: 'branch_a',
                            job_type: 'PLAN', prompt_type: 'Planner', prompt_template_id: 'pt-a',
                            output_type: 'HeaderContext', granularity_strategy: 'all_to_one',
                            inputs_required: [{ type: 'seed_prompt', document_key: 'seed_prompt', required: true }],
                            inputs_relevance: [],
                            outputs_required: [{ type: 'header_context', document_key: 'header_ctx_a' }],
                        },
                    ],
                },
            };
            mockApiClientPost.mockResolvedValueOnce(backendResponse);

            const result = await dialecticApiClient.fetchStageRecipe(stageSlug);

            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.stageSlug).toBe(stageSlug);
            expect(result.data?.instanceId).toBe('instance-123');
            // Assert sorted order: step-a (1) then step-b (2)
            expect(result.data?.steps[0].step_key).toBe('a_key');
            expect(result.data?.steps[0].parallel_group).toBe(1);
            expect(result.data?.steps[0].branch_key).toBe('branch_a');
            expect(result.data?.steps[1].step_key).toBe('b_key');
            expect(result.data?.steps[1].parallel_group).toBe(2);
            expect(result.data?.steps[1].branch_key).toBe('branch_b');
            // Inputs/outputs preserved
            expect(result.data?.steps[1].inputs_required?.[0].document_key).toBe('feature_spec');
            expect(result.data?.steps[1].outputs_required?.[0].document_key).toBe('header_ctx_b');
        });

        it('should propagate backend error status and message', async () => {
            const backendError: ApiResponse<any> = {
                status: 404,
                error: { code: 'NOT_FOUND', message: 'Stage not found' },
            };
            mockApiClientPost.mockResolvedValueOnce(backendError);

            const result = await dialecticApiClient.fetchStageRecipe('missing-stage');

            expect(result.status).toBe(404);
            expect(result.error?.message).toBe('Stage not found');
            expect(result.data).toBeUndefined();
        });
    });
}); 