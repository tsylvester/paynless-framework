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
    UploadProjectResourceFilePayload, 
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
  domain_name: 'Software Development',
  selected_domain_overlay_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  repo_url: null,
  status: 'active',
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
const baseMockProject: Omit<DialecticProject, 'user_id' | 'created_at' | 'updated_at' | 'id'> & Partial<Pick<DialecticProject, 'id' | 'user_id' | 'created_at' | 'updated_at'>> = {
    project_name: "Test Project Base",
    initial_user_prompt: "Base prompt.",
    selected_domain_id: "dom-1",
    domain_name: 'Software Development',
    selected_domain_overlay_id: null,
    repo_url: null,
    status: 'active',
};

describe('DialecticApiClient', () => {
    beforeEach(() => {
        vi.resetAllMocks(); // Reset mocks before each test
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

    describe('fetchProcessTemplate', () => {
        const endpoint = 'dialectic-service';
        const templateId = 'template-123';
        const requestBody = { action: 'fetchProcessTemplate', payload: { templateId } };
        const mockTemplate: DialecticProcessTemplate = {
            id: templateId,
            name: 'Standard Dialectic',
            description: 'A standard process',
            created_at: new Date().toISOString(),
            domain_id: 'domain-1',
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

    describe('listAvailableDomainTags', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listAvailableDomainTags' };

        it('should call apiClient.post with the correct endpoint, body', async () => {
            const mockResponse: ApiResponse<string[]> = {
                data: [],
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listAvailableDomainTags();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the domain tags array on successful response', async () => {
            const mockTags: string[] = ['software_development', 'technical_writing'];
            const mockResponse: ApiResponse<string[]> = {
                data: mockTags,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listAvailableDomainTags();

            expect(result.data).toEqual(mockTags);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch tags' };
            const mockErrorResponse: ApiResponse<string[]> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listAvailableDomainTags();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listAvailableDomainTags();

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
                domain_name: 'Software Development',
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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
                domain_name: 'Software Development',
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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

    describe('startSession', () => {
        const endpoint = 'dialectic-service';
        const validPayload: StartSessionPayload = {
            projectId: 'proj-123',
            sessionDescription: 'Kicking off a new session',
            selectedModelCatalogIds: ['model-abc', 'model-def'],
        };
        const requestBody = { action: 'startSession', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockDialecticSession, // Assuming mockDialecticSession is suitable
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.startSession(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the created session data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockDialecticSession,
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.data).toEqual(mockDialecticSession);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed session creation', async () => {
            const mockApiError: ApiErrorType = { code: 'VALIDATION_ERROR', message: 'Invalid project ID' };
            const mockErrorResponse: ApiResponse<DialecticSession> = {
                error: mockApiError,
                status: 400,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
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

    describe('listModelCatalog', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listModelCatalog' };

        const mockModelCatalogEntry: AIModelCatalogEntry = {
            id: 'model-cat-123',
            provider_name: 'OpenAI',
            model_name: 'GPT-4',
            api_identifier: 'gpt-4',
            description: 'Powerful model by OpenAI',
            strengths: ['coding', 'writing'],
            weaknesses: ['cost'],
            context_window_tokens: 8192,
            input_token_cost_usd_millionths: 30,
            output_token_cost_usd_millionths: 60,
            max_output_tokens: 4096,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = {
                data: [mockModelCatalogEntry],
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listModelCatalog();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the model catalog array on successful response', async () => {
            const mockCatalogData: AIModelCatalogEntry[] = [mockModelCatalogEntry];
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = {
                data: mockCatalogData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.data).toEqual(mockCatalogData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch model catalog' };
            const mockErrorResponse: ApiResponse<AIModelCatalogEntry[]> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for listModelCatalog';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('getContributionContentSignedUrl', () => {
        const endpoint = 'dialectic-service';
        const contributionId = 'contrib-xyz-789';
        const requestBody = { action: 'getContributionContentSignedUrl', payload: { contributionId } };

        const mockSignedUrlResponse: ContributionContentSignedUrlResponse = {
            signedUrl: 'https://example.com/signed-url-for-content',
            mimeType: 'text/markdown',
            sizeBytes: 1024,
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                data: mockSignedUrlResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getContributionContentSignedUrl(contributionId);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the signed URL response on successful fetch', async () => {
            const mockResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                data: mockSignedUrlResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getContributionContentSignedUrl(contributionId);

            expect(result.data).toEqual(mockSignedUrlResponse);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return null data if the contribution content is not found (e.g., 404 from backend)', async () => {
            const mockResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                data: null, // Backend might return null if not found, or an error
                status: 404, 
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getContributionContentSignedUrl(contributionId);

            expect(result.data).toBeNull();
            expect(result.status).toBe(404);
            expect(result.error).toBeUndefined(); // Assuming a 404 with null data isn't an "error" in the ApiResponse structure itself
        });

        it('should return the error object on other API failures', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch signed URL' };
            const mockErrorResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getContributionContentSignedUrl(contributionId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getContributionContentSignedUrl';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.getContributionContentSignedUrl(contributionId);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('uploadProjectResourceFile', () => {
        const endpoint = 'dialectic-service';
        const mockFile = new File(['dummy content'], 'prompt.md', { type: 'text/markdown' });
        const validPayload: UploadProjectResourceFilePayload = {
            projectId: 'proj-123',
            file: mockFile,
            fileName: 'prompt.md',
            fileSizeBytes: mockFile.size,
            fileType: mockFile.type,
            resourceDescription: 'Initial prompt file',
        };

        const mockProjectResource: DialecticProjectResource = {
            id: 'resource-abc-123',
            project_id: validPayload.projectId,
            file_name: validPayload.fileName,
            storage_path: `projects/${validPayload.projectId}/resources/prompt.md`,
            mime_type: validPayload.fileType,
            size_bytes: validPayload.fileSizeBytes,
            resource_description: validPayload.resourceDescription || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        // Helper to create FormData from UploadProjectResourceFilePayload for tests
        const createUploadFormDataFromPayload = (payload: UploadProjectResourceFilePayload): FormData => {
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
            return formData;
        };


        it('should call apiClient.post with FormData for uploadProjectResourceFile', async () => {
            const mockResponse: ApiResponse<DialecticProjectResource> = {
                data: mockProjectResource,
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const formData = createUploadFormDataFromPayload(validPayload);
            await dialecticApiClient.uploadProjectResourceFile(validPayload); // The method itself takes the structured payload

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toBeInstanceOf(FormData); // Key check: payload is FormData
            
            const sentFormData = calls[0][1] as FormData;
            expect(sentFormData.get('action')).toEqual('uploadProjectResourceFile');
            expect(sentFormData.get('projectId')).toEqual(validPayload.projectId);
            expect(sentFormData.get('fileName')).toEqual(validPayload.fileName);
            expect(sentFormData.get('fileType')).toEqual(validPayload.fileType);
            expect(sentFormData.get('fileSizeBytes')).toEqual(validPayload.fileSizeBytes.toString());
            expect(sentFormData.get('resourceDescription')).toEqual(validPayload.resourceDescription);
            const sentFile = sentFormData.get('file') as File;
            expect(sentFile).toBeInstanceOf(File);
            expect(sentFile.name).toEqual(validPayload.fileName);
            expect(sentFile.size).toEqual(validPayload.fileSizeBytes);
            expect(sentFile.type).toEqual(validPayload.fileType);
        });

        it('should return the created project resource data on successful upload', async () => {
            const mockResponse: ApiResponse<DialecticProjectResource> = {
                data: mockProjectResource,
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.uploadProjectResourceFile(validPayload);

            expect(result.data).toEqual(mockProjectResource);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed upload', async () => {
            const mockApiError: ApiErrorType = { code: 'STORAGE_ERROR', message: 'Failed to upload file to storage' };
            const mockErrorResponse: ApiResponse<DialecticProjectResource> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.uploadProjectResourceFile(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for uploadProjectResourceFile';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.uploadProjectResourceFile(validPayload);

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

    describe('updateProjectDomain', () => {
        const endpoint = 'dialectic-service';
        const projectId = 'proj-123';
        const domainId = 'dom-2';
        const payload: UpdateProjectDomainPayload = { projectId, selectedDomainId: domainId };
        const requestBody = { action: 'updateProjectDomain', payload };
        const mockUpdatedProject: DialecticProject = {
            ...mockDialecticProject,
            selected_domain_id: domainId,
            domain_name: 'Finance', // Assuming this would be the name for dom-2
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
            // Sessions and resources would typically be part of a deep clone, 
            // but for this test, we focus on the project entity itself.
            dialectic_sessions: [], 
            resources: [],
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
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('generateContributions', () => {
        const endpoint = 'dialectic-service';
        const mockStageObject: DialecticStage = { id: 'stage-1', slug: 'thesis', display_name: 'Thesis', created_at: new Date().toISOString(), description: null, default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null };
        const validPayload: GenerateContributionsPayload = {
            sessionId: 'sess-456',
            projectId: 'proj-123',
            stageSlug: mockStageObject,
            iterationNumber: 1,
        };
        const requestBody = { action: 'generateContributions', payload: validPayload };

        const mockContribution: DialecticContribution = {
            id: 'contrib-xyz',
            session_id: 'sess-123',
            model_id: 'model-abc',
            model_name: 'GPT-4 Thesis Generator',
            user_id: 'user-abc',
            stage: mockStageObject,
            iteration_number: 1,
            prompt_template_id_used: 'pt-thesis-default',
            seed_prompt_url: `projects/${validPayload.projectId}/sessions/${validPayload.sessionId}/iteration_1/thesis/seed_prompt.md`,
            content_storage_bucket: 'dialectic-contributions',
            content_storage_path: `projects/${validPayload.projectId}/sessions/${validPayload.sessionId}/iteration_1/thesis/contrib-xyz.md`,
            content_mime_type: 'text/markdown',
            content_size_bytes: 1500,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: `projects/${validPayload.projectId}/sessions/${validPayload.sessionId}/iteration_1/thesis/contrib-xyz_raw.json`,
            target_contribution_id: null,
            tokens_used_input: 100,
            tokens_used_output: 300,
            processing_time_ms: 5000,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const mockSuccessResponse: GenerateContributionsResponse = {
            message: 'Contributions generated successfully for thesis stage.',
            contributions: [mockContribution],
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const apiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(apiResponse);

            await dialecticApiClient.generateContributions(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the generation response on successful execution', async () => {
            const apiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(apiResponse);

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.data).toEqual(mockSuccessResponse);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed generation (e.g., session not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Session not found or generation failed' };
            const mockErrorResponse: ApiResponse<GenerateContributionsResponse> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for generateContributions';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.generateContributions(validPayload);

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

    describe('submitStageResponses', () => {
        const endpoint = 'dialectic-service';
        const mockStageObject: DialecticStage = { id: 'stage-1', slug: 'thesis', display_name: 'Thesis', created_at: new Date().toISOString(), description: null, default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null };
        const validPayload: SubmitStageResponsesPayload = {
            sessionId: 'sess-123',
            projectId: 'proj-123',
            stageSlug: mockStageObject,
            currentIterationNumber: 1,
            responses: [{ originalModelContributionId: 'contrib-abc', responseText: 'This is a great point.' }]
        };
        const requestBody = { action: 'submitStageResponses', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and body for submitStageResponses', async () => {
            const expectedBody: DialecticServiceActionPayload = {
                action: 'submitStageResponses',
                payload: validPayload
            };
            mockApiClientPost.mockResolvedValue({ data: mockDialecticSession, status: 200 });

            await dialecticApiClient.submitStageResponses(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, expectedBody);
        });

        it('should return the success response on successful submission', async () => {
            mockApiClientPost.mockResolvedValue({ data: mockDialecticSession, status: 200 });

            const result = await dialecticApiClient.submitStageResponses(validPayload);

            expect(result.data).toEqual(mockDialecticSession);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return an error object on failed submission', async () => {
            const mockError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to submit' };
            mockApiClientPost.mockResolvedValue({ error: mockError, status: 500 });

            const result = await dialecticApiClient.submitStageResponses(validPayload);

            expect(result.error).toEqual(mockError);
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
        };
        const requestBody = { action: 'saveContributionEdit', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const expectedBody: DialecticServiceActionPayload = {
                action: 'saveContributionEdit',
                payload: validPayload
            };
            mockApiClientPost.mockResolvedValue({ data: mockDialecticSession, status: 200 });

            await dialecticApiClient.saveContributionEdit(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, expectedBody);
        });

        it('should return the updated contribution on successful save', async () => {
            mockApiClientPost.mockResolvedValue({ data: mockDialecticSession, status: 200 });

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.data).toEqual(mockDialecticSession);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return an error object on failed save', async () => {
            const mockError: ApiErrorType = { code: 'FORBIDDEN', message: 'Not authorized' };
            mockApiClientPost.mockResolvedValue({ error: mockError, status: 403 });

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.error).toEqual(mockError);
            expect(result.data).toBeUndefined();
        });
    });

    describe('getIterationInitialPromptContent', () => {
        const endpoint = 'dialectic-service';
        const validPayload: GetIterationInitialPromptPayload = {
            sessionId: 'sess-456',
            iterationNumber: 1,
        };
        const requestBody = { action: 'getIterationInitialPromptContent', payload: validPayload };

        const mockPromptData: IterationInitialPromptData = {
            content: 'This is the initial prompt content for iteration 1.',
            mimeType: 'text/markdown',
            storagePath: `projects/proj-123/sessions/${validPayload.sessionId}/iteration_${validPayload.iterationNumber}/0_seed_inputs/user_prompt.md`,
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<IterationInitialPromptData> = {
                data: mockPromptData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the iteration initial prompt data on successful response', async () => {
            const mockResponse: ApiResponse<IterationInitialPromptData> = {
                data: mockPromptData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(result.data).toEqual(mockPromptData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed fetch (e.g., prompt not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Initial prompt for iteration not found' };
            const mockErrorResponse: ApiResponse<IterationInitialPromptData> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getIterationInitialPromptContent';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

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
}); 