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
  selected_model_catalog_ids: ['model-1'],
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
    describe('fetchProcessTemplate', () => {
        const endpoint = 'dialectic-service';
        const templateId = 'template-123';
        const requestBody = { action: 'fetchProcessTemplate', payload: { templateId } };
        const mockTemplate: DialecticProcessTemplate = {
            id: templateId,
            name: 'Standard Dialectic',
            description: 'A standard process',
            created_at: new Date().toISOString(),
            starting_stage_id: 'stage-1',
            stages: [],
            transitions: [],
        };

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const mockResponse: ApiResponse<DialecticProcessTemplate> = { data: mockTemplate, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);
            await dialecticApiClient.fetchProcessTemplate({ templateId });
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the template data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProcessTemplate> = { data: mockTemplate, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);
            const result = await dialecticApiClient.fetchProcessTemplate({ templateId });
            expect(result.data).toEqual(mockTemplate);
        });

        it('should return an error on a failed response', async () => {
            const mockError: ApiErrorType = { code: 'NOT_FOUND', message: 'Template not found' };
            const mockErrorResponse: ApiResponse<DialecticProcessTemplate> = { error: mockError, status: 404 };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);
            const result = await dialecticApiClient.fetchProcessTemplate({ templateId });
            expect(result.error).toEqual(mockError);
        });

        it('should return a network error if the call rejects', async () => {
            const errorMessage = 'Network Failure';
            mockApiClientPost.mockRejectedValue(new Error(errorMessage));
            const result = await dialecticApiClient.fetchProcessTemplate({ templateId });
            expect(result.error).toEqual({ code: 'NETWORK_ERROR', message: errorMessage });
        });
    });    
  
    describe('listAvailableDomains', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listAvailableDomains' };
        const requestBodyWithParams = (stageAssociation: string) => ({ 
            action: 'listAvailableDomains', 
            payload: { stageAssociation } 
        });

        const mockDomainDescriptors: DomainDescriptor[] = [
            { id: 'dd-1', domain_name: 'Software Development', description: 'Domains related to software engineering', stage_association: null },
            { id: 'dd-2', domain_name: 'Technical Writing', description: 'Domains related to technical documentation', stage_association: 'planning' },
        ];

        it('should call apiClient.post with the correct endpoint and body when no params are provided', async () => {
            const mockResponse: ApiResponse<DomainDescriptor[]> = {
                data: mockDomainDescriptors,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listAvailableDomains();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should call apiClient.post with the correct endpoint and body when stageAssociation param is provided', async () => {
            const mockResponse: ApiResponse<DomainDescriptor[]> = {
                data: [mockDomainDescriptors[1]], // Assuming filtering happens backend
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);
            const params = { stageAssociation: 'planning' };

            await dialecticApiClient.listAvailableDomains(params);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBodyWithParams(params.stageAssociation));
        });

        it('should return the DomainDescriptor array on successful response', async () => {
            const mockResponse: ApiResponse<DomainDescriptor[]> = {
                data: mockDomainDescriptors,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listAvailableDomains();

            expect(result.data).toEqual(mockDomainDescriptors);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch available domains' };
            const mockErrorResponse: ApiResponse<DomainDescriptor[]> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listAvailableDomains();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listAvailableDomains();

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0); 
            expect(result.data).toBeUndefined();
        });
    });    
    
    describe('listAvailableDomainOverlays', () => {
        const endpoint = 'dialectic-service';
        const stageAssociation = 'synthesis';
        const requestBody = { action: 'listAvailableDomainOverlays', payload: { stageAssociation } };

        it('should call apiClient.post with correct endpoint and payload', async () => {
            const mockOverlays: DomainOverlayDescriptor[] = [
                { id: 'overlay-1', domainId: 'dom-1', domainName: 'Software', description: 'Overlay for SWE', stageAssociation, overlay_values: {} },
            ];
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = { data: mockOverlays, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listAvailableDomainOverlays({ stageAssociation });

            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });
    });    
    
    describe('listDomains', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listDomains' };
        const mockDomains: DialecticDomain[] = [
            { id: '1', name: 'Software Development', description: 'All about code', parent_domain_id: null },
            { id: '2', name: 'Finance', description: 'All about money', parent_domain_id: null },
        ];

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                data: mockDomains,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listDomains();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the domains array on successful response', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                data: mockDomains,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listDomains();

            expect(result.data).toEqual(mockDomains);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch domains' };
            const mockErrorResponse: ApiResponse<DialecticDomain[]> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listDomains();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listDomains();

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
}); 