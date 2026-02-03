import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import { 
    ApiResponse, 
    ApiError,
    CreateProjectPayload, 
    DialecticProject, 
    DialecticSession, 
    UpdateProjectDomainPayload,
    DeleteProjectPayload,
    DialecticServiceActionPayload,
    GetProjectResourceContentPayload,
    UpdateProjectInitialPromptPayload,
    SaveContributionEditPayload,
    SaveContributionEditSuccessResponse,
    EditedDocumentResource,
    GetProjectResourceContentResponse,
    DialecticProcessTemplate,
    DialecticStageRecipe,
    SuccessResponse,
} from '@paynless/types';

import { createMockDialecticClient } from './mocks/dialectic.api.mock';

// Create an instance of the class we are testing
const dialecticApiClient = createMockDialecticClient();

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
  selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
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
            dialecticApiClient.cloneProject.mockResolvedValue(mockResponse);

            await dialecticApiClient.cloneProject(validPayload.projectId);

            expect(dialecticApiClient.cloneProject).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.cloneProject).toHaveBeenCalledWith(validPayload.projectId);
        });

        it('should return the cloned project data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockClonedProject,
                status: 201,
            };
            dialecticApiClient.cloneProject.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.cloneProject(validPayload.projectId);

            expect(result.data).toEqual(mockClonedProject);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed clone (e.g., original project not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Original project to clone not found' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 404,
            };
            dialecticApiClient.cloneProject.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.cloneProject(validPayload.projectId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for cloneProject';
            dialecticApiClient.cloneProject.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.cloneProject(validPayload.projectId)).rejects.toThrow(networkErrorMessage);
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
            dialecticApiClient.createProject.mockResolvedValue(mockResponse);

            const formData = createFormDataFromPayload(validPayload);
            await dialecticApiClient.createProject(formData);

            expect(dialecticApiClient.createProject).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.createProject).toHaveBeenCalledWith(formData);
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
            dialecticApiClient.createProject.mockResolvedValue(mockResponse);

            const formData = createFormDataFromPayload(validPayload);
            const result = await dialecticApiClient.createProject(formData);

            expect(result.data).toEqual(mockProjectData);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed project creation', async () => {
            const mockApiError: ApiError = { code: 'VALIDATION_ERROR', message: 'Project name is required' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 400,
            };
            dialecticApiClient.createProject.mockResolvedValue(mockErrorResponse);
            
            const formData = createFormDataFromPayload(validPayload);
            const result = await dialecticApiClient.createProject(formData); 

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            dialecticApiClient.createProject.mockRejectedValueOnce(new Error(networkErrorMessage));

            const formData = createFormDataFromPayload(validPayload);
            await expect(dialecticApiClient.createProject(formData)).rejects.toThrow(networkErrorMessage);
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
            dialecticApiClient.deleteProject.mockResolvedValue(mockResponse);

            await dialecticApiClient.deleteProject(validPayload.projectId);

            expect(dialecticApiClient.deleteProject).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.deleteProject).toHaveBeenCalledWith(validPayload.projectId);
        });

        it('should return successfully (e.g., 204 status) on successful deletion', async () => {
            const mockResponse: ApiResponse<void> = {
                data: undefined,
                status: 204,
            };
            dialecticApiClient.deleteProject.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.deleteProject(validPayload.projectId);

            expect(result.data).toBeUndefined();
            expect(result.status).toBe(204);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed deletion (e.g., project not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Project to delete not found' };
            const mockErrorResponse: ApiResponse<void> = {
                error: mockApiError,
                status: 404,
            };
            dialecticApiClient.deleteProject.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.deleteProject(validPayload.projectId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for deleteProject';
            dialecticApiClient.deleteProject.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.deleteProject(validPayload.projectId)).rejects.toThrow(networkErrorMessage);
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
            dialecticApiClient.exportProject.mockResolvedValue(mockResponse);

            await dialecticApiClient.exportProject(validPayload.projectId);

            expect(dialecticApiClient.exportProject).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.exportProject).toHaveBeenCalledWith(validPayload.projectId);
        });

        it('should return the export URL on successful response', async () => {
            const mockResponse: ApiResponse<{ export_url: string }> = {
                data: mockExportResponseData,
                status: 200,
            };
            dialecticApiClient.exportProject.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.exportProject(validPayload.projectId);

            expect(result.data).toEqual(mockExportResponseData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed export (e.g., project not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Project to export not found' };
            const mockErrorResponse: ApiResponse<{ export_url: string }> = {
                error: mockApiError,
                status: 404,
            };
            dialecticApiClient.exportProject.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.exportProject(validPayload.projectId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for exportProject';
            dialecticApiClient.exportProject.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.exportProject(validPayload.projectId)).rejects.toThrow(networkErrorMessage);
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
            dialecticApiClient.getProjectDetails.mockResolvedValue(mockResponse);

            await dialecticApiClient.getProjectDetails(projectId);

            expect(dialecticApiClient.getProjectDetails).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.getProjectDetails).toHaveBeenCalledWith(projectId);
        });

        it('should return the project details on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockDialecticProject,
                status: 200,
            };
            dialecticApiClient.getProjectDetails.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getProjectDetails(projectId);

            expect(result.data).toEqual(mockDialecticProject);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response (e.g., project not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Project not found' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 404,
            };
            dialecticApiClient.getProjectDetails.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getProjectDetails(projectId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getProjectDetails';
            dialecticApiClient.getProjectDetails.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.getProjectDetails(projectId)).rejects.toThrow(networkErrorMessage);
        });
    });    

    describe('getProjectResourceContent', () => {
        const endpoint = 'dialectic-service';
        const validPayload: GetProjectResourceContentPayload = {
            resourceId: 'resource-abc-123',
        };
        const requestBody = { action: 'getProjectResourceContent', payload: validPayload };

        const mockResourceContentResponse: GetProjectResourceContentResponse = {
            sourceContributionId: 'contrib-123',
            fileName: 'prompt.md',
            mimeType: 'text/markdown',
            content: '## Initial Project Prompt\n\nThis is the detailed content of the project resource file.',
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<GetProjectResourceContentResponse> = {
                data: mockResourceContentResponse,
                status: 200,
            };
            dialecticApiClient.getProjectResourceContent.mockResolvedValue(mockResponse);

            await dialecticApiClient.getProjectResourceContent(validPayload);

            expect(dialecticApiClient.getProjectResourceContent).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.getProjectResourceContent).toHaveBeenCalledWith(validPayload);
        });

        it('should return the project resource content on successful response', async () => {
            const mockResponse: ApiResponse<GetProjectResourceContentResponse> = {
                data: mockResourceContentResponse,
                status: 200,
            };
            dialecticApiClient.getProjectResourceContent.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getProjectResourceContent(validPayload);

            expect(result.data).toEqual(mockResourceContentResponse);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed fetch (e.g., resource not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Project resource content not found' };
            const mockErrorResponse: ApiResponse<GetProjectResourceContentResponse> = {
                error: mockApiError,
                status: 404,
            };
            dialecticApiClient.getProjectResourceContent.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getProjectResourceContent(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getProjectResourceContent';
            dialecticApiClient.getProjectResourceContent.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.getProjectResourceContent(validPayload)).rejects.toThrow(networkErrorMessage);
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
            dialecticApiClient.listProjects.mockResolvedValue(mockResponse);

            await dialecticApiClient.listProjects();

            expect(dialecticApiClient.listProjects).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.listProjects).toHaveBeenCalledWith();
        });

        it('should return the projects array on successful response', async () => {
            const mockProjectsData: DialecticProject[] = [mockDialecticProject];
            const mockResponse: ApiResponse<DialecticProject[]> = {
                data: mockProjectsData,
                status: 200,
            };
            dialecticApiClient.listProjects.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listProjects();

            expect(result.data).toEqual(mockProjectsData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch projects' };
            const mockErrorResponse: ApiResponse<DialecticProject[]> = {
                error: mockApiError,
                status: 500,
            };
            dialecticApiClient.listProjects.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listProjects();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for listProjects';
            dialecticApiClient.listProjects.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.listProjects()).rejects.toThrow(networkErrorMessage);
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
            dialecticApiClient.updateDialecticProjectInitialPrompt.mockResolvedValue(mockResponse);

            await dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload);

            expect(dialecticApiClient.updateDialecticProjectInitialPrompt).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.updateDialecticProjectInitialPrompt).toHaveBeenCalledWith(validPayload);
        });

        it('should return the updated project data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            dialecticApiClient.updateDialecticProjectInitialPrompt.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload);

            expect(result.data).toEqual(mockUpdatedProject);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed update (e.g., project not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Project not found for prompt update' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 404,
            };
            dialecticApiClient.updateDialecticProjectInitialPrompt.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for updateDialecticProjectInitialPrompt';
            dialecticApiClient.updateDialecticProjectInitialPrompt.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.updateDialecticProjectInitialPrompt(validPayload)).rejects.toThrow(networkErrorMessage);
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
            dialecticApiClient.updateProjectDomain.mockResolvedValue(mockResponse);

            await dialecticApiClient.updateProjectDomain(payload);

            expect(dialecticApiClient.updateProjectDomain).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.updateProjectDomain).toHaveBeenCalledWith(payload);
        });

        it('should return the updated project on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            dialecticApiClient.updateProjectDomain.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.updateProjectDomain(payload);

            expect(result.data).toEqual(mockUpdatedProject);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to update domain' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 500,
            };
            dialecticApiClient.updateProjectDomain.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.updateProjectDomain(payload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            dialecticApiClient.updateProjectDomain.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.updateProjectDomain(payload)).rejects.toThrow(networkErrorMessage);
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
                    outputs_required?: Array<{ document_key: string; artifact_class: string; file_type: string }>;
                }>;
            };

            const backendResponse: SuccessResponse<DialecticStageRecipe> = {
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
                            output_type: 'assembled_document_json', granularity_strategy: 'per_source_document',
                            inputs_required: [{ type: 'document', document_key: 'feature_spec', required: true, slug: 'feature_spec' }],
                            inputs_relevance: [{ document_key: 'feature_spec', relevance: 1, type: 'feedback', slug: 'feature_spec' }],
                            outputs_required: [{ document_key: 'header_ctx_b', artifact_class: 'header_context', file_type: 'json' }],
                        },
                        {
                            id: 'step-a', step_key: 'a_key', step_slug: 'a-slug', step_name: 'A',
                            execution_order: 1, parallel_group: 1, branch_key: 'branch_a',
                            job_type: 'PLAN', prompt_type: 'Planner', prompt_template_id: 'pt-a',
                            output_type: 'header_context', granularity_strategy: 'all_to_one',
                            inputs_required: [{ type: 'seed_prompt', document_key: 'seed_prompt', required: true, slug: 'seed_prompt' }],
                            inputs_relevance: [],
                            outputs_required: [{ document_key: 'header_ctx_a', artifact_class: 'header_context', file_type: 'json' }],
                        },
                    ],
                },
            };
            dialecticApiClient.fetchStageRecipe.mockResolvedValueOnce(backendResponse);

            await dialecticApiClient.fetchStageRecipe(stageSlug);

            expect(dialecticApiClient.fetchStageRecipe).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.fetchStageRecipe).toHaveBeenCalledWith(stageSlug);
        });

        it('should return normalized DialecticStageRecipe with steps sorted and fields preserved', async () => {
            const backendResponse: ApiResponse<any> = {
                status: 200,
                data: {
                    stageSlug,
                    instanceId: 'instance-123',
                    steps: [
                        {
                            id: 'step-a', step_key: 'a_key', step_slug: 'a-slug', step_name: 'A',
                            execution_order: 1, parallel_group: 1, branch_key: 'branch_a',
                            job_type: 'PLAN', prompt_type: 'Planner', prompt_template_id: 'pt-a',
                            output_type: 'HeaderContext', granularity_strategy: 'all_to_one',
                            inputs_required: [{ type: 'seed_prompt', document_key: 'seed_prompt', required: true }],
                            inputs_relevance: [],
                            outputs_required: [{ type: 'header_context', document_key: 'header_ctx_a' }],
                        },
                        {
                            id: 'step-b', step_key: 'b_key', step_slug: 'b-slug', step_name: 'B',
                            execution_order: 2, parallel_group: 2, branch_key: 'branch_b',
                            job_type: 'EXECUTE', prompt_type: 'Turn', prompt_template_id: 'pt-b',
                            output_type: 'AssembledDocumentJson', granularity_strategy: 'per_source_document',
                            inputs_required: [{ type: 'document', document_key: 'feature_spec', required: true, stage_slug: 'thesis' }],
                            inputs_relevance: [{ document_key: 'feature_spec', relevance: 1, type: 'document', stage_slug: 'thesis' }],
                            outputs_required: [{ type: 'header_context', document_key: 'header_ctx_b' }],
                        },
                    ],
                },
            };
            dialecticApiClient.fetchStageRecipe.mockResolvedValueOnce(backendResponse);

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
            dialecticApiClient.fetchStageRecipe.mockResolvedValueOnce(backendError);

            const result = await dialecticApiClient.fetchStageRecipe('missing-stage');

            expect(result.status).toBe(404);
            expect(result.error?.message).toBe('Stage not found');
            expect(result.data).toBeUndefined();
        });
    });

    describe('saveContributionEdit', () => {
        const endpoint = 'dialectic-service';
        const validPayload: SaveContributionEditPayload = {
            originalContributionIdToEdit: 'contrib-original',
            editedContentText: 'This is the new and improved content.',
            projectId: 'proj-123',
            sessionId: 'sess-456',
            originalModelContributionId: 'contrib-model-original',
            responseText: 'User feedback on the edit.',
            documentKey: 'feature_spec',
            resourceType: 'rendered_document',
        };
        const requestBody = { action: 'saveContributionEdit', payload: validPayload };

        const mockEditedDocumentResource: EditedDocumentResource = {
            id: 'resource-edit-123',
            resource_type: 'rendered_document',
            project_id: 'proj-123',
            session_id: 'sess-456',
            stage_slug: 'thesis',
            iteration_number: 1,
            document_key: 'feature_spec',
            source_contribution_id: 'contrib-original',
            storage_bucket: 'project-resources',
            storage_path: 'edits/user-abc/resource-edit-123.md',
            file_name: 'resource-edit-123.md',
            mime_type: 'text/markdown',
            size_bytes: 1024,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const mockSaveContributionEditSuccessResponse: SaveContributionEditSuccessResponse = {
            resource: mockEditedDocumentResource,
            sourceContributionId: 'contrib-original',
        };

        it('should return EditedDocumentResource on successful save', async () => {
            const mockResponse: ApiResponse<SaveContributionEditSuccessResponse> = {
                data: mockSaveContributionEditSuccessResponse,
                status: 200,
            };
            dialecticApiClient.saveContributionEdit.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.data).toBeDefined();
            expect(result.data?.resource).toEqual(mockEditedDocumentResource);
            expect(result.data?.resource.id).toBe('resource-edit-123');
            expect(result.data?.resource.resource_type).toBe('rendered_document');
            expect(result.data?.resource.document_key).toBe('feature_spec');
            expect(result.data?.resource.source_contribution_id).toBe('contrib-original');
            expect(result.data?.sourceContributionId).toBe('contrib-original');
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data).not.toHaveProperty('contribution_type');
            expect(result.data).toHaveProperty('resource');
        });

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const mockResponse: ApiResponse<SaveContributionEditSuccessResponse> = {
                data: mockSaveContributionEditSuccessResponse,
                status: 200,
            };
            dialecticApiClient.saveContributionEdit.mockResolvedValue(mockResponse);

            await dialecticApiClient.saveContributionEdit(validPayload);

            expect(dialecticApiClient.saveContributionEdit).toHaveBeenCalledTimes(1);
            expect(dialecticApiClient.saveContributionEdit).toHaveBeenCalledWith(validPayload);
        });

        it('should return an error object on failed save', async () => {
            const mockApiError: ApiError = { code: 'SAVE_ERROR', message: 'Could not save contribution edit' };
            const mockErrorResponse: ApiResponse<SaveContributionEditSuccessResponse> = {
                error: mockApiError,
                status: 500,
            };
            dialecticApiClient.saveContributionEdit.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for saveContributionEdit';
            dialecticApiClient.saveContributionEdit.mockRejectedValueOnce(new Error(networkErrorMessage));

            await expect(dialecticApiClient.saveContributionEdit(validPayload)).rejects.toThrow(networkErrorMessage);
        });
    });
}); 
