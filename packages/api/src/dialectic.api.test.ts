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
    UpdateProjectDomainTagPayload,
    DeleteProjectPayload,
    DialecticServiceActionPayload,
    GetContributionContentSignedUrlPayload
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
  selected_domain_overlay_id: null,
  selected_domain_tag: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  repo_url: null,
  status: 'active',
};

const mockDialecticSession: DialecticSession = {
  id: 'sess-456',
  project_id: 'proj-123',
  session_description: "Test Session",
  current_stage_seed_prompt: "Initial seed prompt for session",
  iteration_count: 1,
  active_thesis_prompt_template_id: null,
  active_antithesis_prompt_template_id: null,
  active_synthesis_prompt_template_id: null, 
  active_parenthesis_prompt_template_id: null,
  active_paralysis_prompt_template_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: "pending_thesis",
  associated_chat_id: null,
  max_iterations: 3,
  current_iteration: 1,
  convergence_status: null,
  formal_debate_structure_id: null,
  preferred_model_for_stage: null,
};

// Remove any mock project data that incorrectly includes a 'sessions' array directly
// For example, if baseMockProject previously had a sessions property, remove it:
const baseMockProject: Omit<DialecticProject, 'user_id' | 'created_at' | 'updated_at' | 'id'> & Partial<Pick<DialecticProject, 'id' | 'user_id' | 'created_at' | 'updated_at'>> = {
    project_name: "Test Project Base",
    initial_user_prompt: "Base prompt.",
    selected_domain_overlay_id: null,
    selected_domain_tag: "software_development",
    repo_url: null,
    status: 'active',
};

describe('DialecticApiClient', () => {
    beforeEach(() => {
        vi.resetAllMocks(); // Reset mocks before each test
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
            selectedDomainTag: 'software_development',
        };
        const requestBody = { action: 'createProject', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and body for createProject', async () => {
            const mockProjectResponse: DialecticProject = {
                id: 'project-123',
                user_id: 'user-xyz',
                project_name: validPayload.projectName,
                initial_user_prompt: validPayload.initialUserPrompt,
                selected_domain_overlay_id: null,
                selected_domain_tag: validPayload.selectedDomainTag || null,
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

            await dialecticApiClient.createProject(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toEqual(requestBody);
            expect(calls[0][2]).toBeUndefined();
        });

        it('should return the created project data on successful response', async () => {
            const mockProjectData: DialecticProject = { 
                id: 'project-123', 
                user_id: 'user-abc',
                project_name: validPayload.projectName,
                initial_user_prompt: validPayload.initialUserPrompt,
                selected_domain_overlay_id: null,
                selected_domain_tag: validPayload.selectedDomainTag || null,
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

            const result = await dialecticApiClient.createProject(validPayload);

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

            const result = await dialecticApiClient.createProject(validPayload); 

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.createProject(validPayload); 

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
            const mockResponse: ApiResponse<DialecticProject[]> = { data: [], status: 200 }; 
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listProjects();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toEqual(requestBody);
            expect(calls[0][2]).toBeUndefined(); 
        });

        it('should return an array of projects on successful response', async () => {
            const mockProjectsData: DialecticProject[] = [
                {
                    id: 'project-123',
                    user_id: 'user-abc',
                    project_name: 'Test Project 1',
                    initial_user_prompt: 'Prompt 1',
                    selected_domain_overlay_id: null,
                    selected_domain_tag: 'tech',
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            ];
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
            const mockApiError: ApiErrorType = { code: 'FETCH_ERROR', message: 'Failed to fetch projects' };
            const mockErrorResponse: ApiResponse<DialecticProject[]> = { error: mockApiError, status: 500 };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listProjects();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
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
            projectId: 'project-123',
            selectedModelCatalogIds: ['model-abc', 'model-def'],
            sessionDescription: 'Test session',
        };
        const requestBody = { action: 'startSession', payload: validPayload };

        const baseMockSession: DialecticSession = {
            id: 'session-xyz',
            project_id: validPayload.projectId,
            session_description: validPayload.sessionDescription || null,
            current_stage_seed_prompt: 'Initial prompt for session',
            iteration_count: 1,
            active_thesis_prompt_template_id: 'tpl-thesis-001',
            active_antithesis_prompt_template_id: 'tpl-antithesis-001',
            active_synthesis_prompt_template_id: null,
            active_parenthesis_prompt_template_id: null,
            active_paralysis_prompt_template_id: null,
            formal_debate_structure_id: null,
            max_iterations: 3,
            current_iteration: 1,
            preferred_model_for_stage: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'pending_thesis',
            associated_chat_id: 'chat-123',
            dialectic_session_models: [],
            dialectic_contributions: [],
            convergence_status: null,
        };

        it('should call apiClient.post with correct parameters for startSession', async () => {
            mockApiClientPost.mockResolvedValue({ data: mockDialecticSession });

            // This is the actual data passed to the dialecticApi.startSession method
            const startSessionMethodPayload: StartSessionPayload = {
                projectId: 'test-project-id',
                selectedModelCatalogIds: ['model1', 'model2'],
                sessionDescription: 'Test session description',
                // ensure other fields from StartSessionPayload are here if needed by your types
            };

            await dialecticApiClient.startSession(startSessionMethodPayload);

            // This is what apiClient.post should be called with (the wrapped payload)
            const expectedServicePayload: DialecticServiceActionPayload = {
                action: 'startSession',
                payload: startSessionMethodPayload,
            };

            expect(mockApiClientPost).toHaveBeenCalledWith(
                'dialectic-service',
                expectedServicePayload
            );
        });

        it('should return the created session data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = { data: { ...baseMockSession }, status: 201 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.data).toEqual(baseMockSession);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed session creation', async () => {
            const mockApiError: ApiErrorType = { code: 'PROJECT_NOT_FOUND', message: 'Project not found' };
            const mockErrorResponse: ApiResponse<DialecticSession> = { error: mockApiError, status: 404 };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for startSession';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.error).toEqual({ code: 'NETWORK_ERROR', message: networkErrorMessage });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('getProjectDetails', () => {
        const endpoint = 'dialectic-service';
        const projectId = 'project-123';
        const requestBody = { action: 'getProjectDetails', payload: { projectId } };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockProjectDetails: DialecticProject = {
                id: projectId,
                user_id: 'user-abc',
                project_name: 'Detailed Project',
                initial_user_prompt: 'Detailed prompt',
                selected_domain_overlay_id: null,
                selected_domain_tag: 'software_development',
                repo_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'active',
            };
            const mockResponse: ApiResponse<DialecticProject> = { data: mockProjectDetails, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getProjectDetails(projectId);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toEqual(requestBody);
            expect(calls[0][2]).toBeUndefined();
        });

        it('should return project details on successful response', async () => {
            const mockData: DialecticProject = {
                id: projectId,
                user_id: 'user-abc',
                project_name: 'Detailed Project',
                initial_user_prompt: 'Detailed prompt',
                selected_domain_overlay_id: null,
                selected_domain_tag: 'design',
                repo_url: 'https://github.com/test/project',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'active',
            };
            const mockResponse: ApiResponse<DialecticProject> = { data: mockData, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getProjectDetails(projectId);

            expect(result.data).toEqual(mockData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return error on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Project not found' };
            const mockErrorResponse: ApiResponse<DialecticProject> = { error: mockApiError, status: 404 };
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

            expect(result.error).toEqual({ code: 'NETWORK_ERROR', message: networkErrorMessage });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('listModelCatalog', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listModelCatalog' };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockCatalog: AIModelCatalogEntry[] = [
                {
                    id: 'model-1',
                    provider_name: 'openai',
                    model_name: 'GPT-4',
                    api_identifier: 'gpt-4',
                    description: 'Powerful model',
                    strengths: ['reasoning'],
                    weaknesses: ['cost'],
                    context_window_tokens: 8000,
                    input_token_cost_usd_millionths: 10000, // e.g., $0.01 per 1k input tokens
                    output_token_cost_usd_millionths: 30000, // e.g., $0.03 per 1k output tokens
                    max_output_tokens: 4096,
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            ];
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = { data: mockCatalog, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listModelCatalog();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toEqual(requestBody);
            expect(calls[0][2]).toBeUndefined();
        });

        it('should return model catalog on successful response', async () => {
            const mockData: AIModelCatalogEntry[] = [
                {
                    id: 'model-1',
                    provider_name: 'openai',
                    model_name: 'GPT-4',
                    api_identifier: 'gpt-4',
                    description: 'Powerful model',
                    strengths: ['reasoning'],
                    weaknesses: ['cost'],
                    context_window_tokens: 8000,
                    input_token_cost_usd_millionths: 10000,
                    output_token_cost_usd_millionths: 30000,
                    max_output_tokens: 4096,
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                {
                    id: 'model-2',
                    provider_name: 'anthropic',
                    model_name: 'Claude 3 Opus',
                    api_identifier: 'claude-3-opus-20240229',
                    description: 'Highest-performing model by Anthropic',
                    strengths: ['analysis', 'long context'],
                    weaknesses: null,
                    context_window_tokens: 200000,
                    input_token_cost_usd_millionths: 15000, 
                    output_token_cost_usd_millionths: 75000,
                    max_output_tokens: 4096,
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            ];
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = { data: mockData, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.data).toEqual(mockData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return error on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'INTERNAL_ERROR', message: 'Could not fetch model catalog' };
            const mockErrorResponse: ApiResponse<AIModelCatalogEntry[]> = { error: mockApiError, status: 500 };
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

            expect(result.error).toEqual({ code: 'NETWORK_ERROR', message: networkErrorMessage });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('getContributionContentSignedUrl', () => {
        const endpoint = 'dialectic-service';
        const testContributionId = 'contrib-xyz-789';
        const requestBody = { action: 'getContributionContentSignedUrl', payload: { contributionId: testContributionId } };

        it('should call apiClient.post with correct endpoint, body, and no special options', async () => {
            const mockSignedUrlResponseData: ContributionContentSignedUrlResponse = {
                signedUrl: 'https://example.com/signed-url',
                mimeType: 'text/markdown',
                sizeBytes: 1024,
            };
            const mockResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                data: mockSignedUrlResponseData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getContributionContentSignedUrl(testContributionId);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toEqual(requestBody);
            expect(calls[0][2]).toBeUndefined(); 
        });

        it('should return signed URL data on successful response', async () => {
            const mockSignedUrlResponseData: ContributionContentSignedUrlResponse = {
                signedUrl: 'https://example.com/signed-url-success',
                mimeType: 'application/json',
                sizeBytes: 2048,
            };
            const mockResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                data: mockSignedUrlResponseData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getContributionContentSignedUrl(testContributionId);

            expect(result.data).toEqual(mockSignedUrlResponseData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return null data if service action returns null', async () => {
            const mockResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                data: null, 
                status: 200, 
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getContributionContentSignedUrl(testContributionId);

            expect(result.data).toBeNull();
            expect(result.status).toBe(200); 
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response from service', async () => {
            const mockApiError: ApiErrorType = { code: 'STORAGE_ERROR', message: 'Failed to generate signed URL' };
            const mockErrorResponse: ApiResponse<ContributionContentSignedUrlResponse | null> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getContributionContentSignedUrl(testContributionId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined(); 
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.getContributionContentSignedUrl(testContributionId);

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
        const mockFile = new File(['dummy content'], 'test-file.md', { type: 'text/markdown' });
        const validPayload: UploadProjectResourceFilePayload = {
            projectId: 'project-789',
            file: mockFile,
            fileName: mockFile.name,
            fileSizeBytes: mockFile.size,
            fileType: mockFile.type,
            resourceDescription: 'Test resource description',
        };

        it('should call apiClient.post with FormData containing correct fields', async () => {
            const mockResourceResponse: DialecticProjectResource = {
                id: 'resource-123',
                project_id: validPayload.projectId,
                file_name: validPayload.fileName,
                storage_path: 'projects/project-789/resources/test-file.md',
                mime_type: validPayload.fileType,
                size_bytes: validPayload.fileSizeBytes,
                resource_description: validPayload.resourceDescription!,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const mockResponse: ApiResponse<DialecticProjectResource> = {
                data: mockResourceResponse,
                status: 201,
            };
            (mockApiClient.post as Mock).mockResolvedValue(mockResponse);

            await dialecticApiClient.uploadProjectResourceFile(validPayload);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            const [invokedEndpoint, formData] = (mockApiClient.post as Mock).mock.calls[0];
            
            expect(invokedEndpoint).toBe(endpoint);
            expect(formData).toBeInstanceOf(FormData);
            expect(formData.get('action')).toBe('uploadProjectResourceFile');
            expect(formData.get('projectId')).toBe(validPayload.projectId);
            expect(formData.get('fileName')).toBe(validPayload.fileName);
            expect(formData.get('fileSizeBytes')).toBe(validPayload.fileSizeBytes.toString());
            expect(formData.get('fileType')).toBe(validPayload.fileType);
            expect(formData.get('resourceDescription')).toBe(validPayload.resourceDescription);
            
            const appendedFile = formData.get('file') as File;
            expect(appendedFile).toBeInstanceOf(File);
            expect(appendedFile.name).toBe(validPayload.fileName);
            expect(appendedFile.size).toBe(validPayload.fileSizeBytes);
            expect(appendedFile.type).toBe(validPayload.fileType);
        });

        it('should handle payload without resourceDescription', async () => {
            const payloadWithoutDescription: UploadProjectResourceFilePayload = {
                ...validPayload,
            };
            delete payloadWithoutDescription.resourceDescription;

            const mockResourceResponse: DialecticProjectResource = {
                id: 'resource-124',
                project_id: payloadWithoutDescription.projectId,
                file_name: payloadWithoutDescription.fileName,
                storage_path: 'projects/project-789/resources/test-file.md',
                mime_type: payloadWithoutDescription.fileType,
                size_bytes: payloadWithoutDescription.fileSizeBytes,
                resource_description: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
             const mockResponse: ApiResponse<DialecticProjectResource> = {
                data: mockResourceResponse,
                status: 201,
            };
            (mockApiClient.post as Mock).mockResolvedValue(mockResponse);

            await dialecticApiClient.uploadProjectResourceFile(payloadWithoutDescription);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            const [, formData] = (mockApiClient.post as Mock).mock.calls[0];
            expect(formData.get('resourceDescription')).toBeNull();
        });


        it('should return the DialecticProjectResource on successful upload', async () => {
            const mockResourceResponse: DialecticProjectResource = {
                id: 'resource-123',
                project_id: validPayload.projectId,
                file_name: validPayload.fileName,
                storage_path: 'projects/project-789/resources/test-file.md',
                mime_type: validPayload.fileType,
                size_bytes: validPayload.fileSizeBytes,
                resource_description: validPayload.resourceDescription!,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const mockResponse: ApiResponse<DialecticProjectResource> = {
                data: mockResourceResponse,
                status: 201,
            };
            (mockApiClient.post as Mock).mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.uploadProjectResourceFile(validPayload);

            expect(result.data).toEqual(mockResourceResponse);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed API call', async () => {
            const mockApiError: ApiErrorType = { code: 'UPLOAD_FAILED', message: 'File upload failed on server' };
            const mockErrorResponse: ApiResponse<DialecticProjectResource> = {
                error: mockApiError,
                status: 500,
            };
            (mockApiClient.post as Mock).mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.uploadProjectResourceFile(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure during upload';
            (mockApiClient.post as Mock).mockRejectedValueOnce(new Error(networkErrorMessage));

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
        const validPayload = { stageAssociation: 'thesis' };
        const requestBody = { action: 'listAvailableDomainOverlays', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = {
                data: [],
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listAvailableDomainOverlays(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the domain overlay descriptors array on successful response', async () => {
            const mockOverlays: DomainOverlayDescriptor[] = [
                { id: 'overlay-1', domainTag: 'Tech Overlay 1', description: 'Description 1', stageAssociation: 'thesis' },
                { id: 'overlay-2', domainTag: 'Tech Overlay 2', description: null, stageAssociation: 'thesis' },
            ];
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = {
                data: mockOverlays,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listAvailableDomainOverlays(validPayload);

            expect(result.data).toEqual(mockOverlays);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch overlays' };
            const mockErrorResponse: ApiResponse<DomainOverlayDescriptor[]> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listAvailableDomainOverlays(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for overlays';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listAvailableDomainOverlays(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('updateProjectDomainTag', () => {
        const endpoint = 'dialectic-service';
        const validPayload: UpdateProjectDomainTagPayload = {
            projectId: 'project-123',
            selectedDomainTag: 'new_domain_tag',
        };
        const requestBody = { action: 'updateProjectDomainTag', payload: validPayload };
        const mockUpdatedProject: DialecticProject = {
            id: 'project-123',
            user_id: 'user-xyz',
            project_name: 'Test Project',
            initial_user_prompt: 'Initial prompt',
            selected_domain_overlay_id: null,
            selected_domain_tag: 'new_domain_tag',
            repo_url: null,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.updateProjectDomainTag(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the updated project data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.updateProjectDomainTag(validPayload);

            expect(result.data).toEqual(mockUpdatedProject);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed API call (e.g., project not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Project not found' };
            const mockErrorResponse: ApiResponse<DialecticProject> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.updateProjectDomainTag(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for updateProjectDomainTag';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.updateProjectDomainTag(validPayload);

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
        const projectIdToDelete = 'proj-to-delete-123';
        const validPayload: DeleteProjectPayload = { projectId: projectIdToDelete };
        const requestBody = { action: 'deleteProject', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and body for deleteProject', async () => {
            const mockResponse: ApiResponse<void> = { status: 204 }; // No data on successful delete
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.deleteProject(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            // The payload is an object, so we check its properties
            expect(calls[0][1]).toEqual(expect.objectContaining({
                action: 'deleteProject',
                payload: expect.objectContaining({ projectId: projectIdToDelete })
            }));
            expect(calls[0][2]).toBeUndefined(); // No special options expected
        });

        it('should return an ApiResponse with no data on successful deletion', async () => {
            const mockResponse: ApiResponse<void> = { status: 204 }; 
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.deleteProject(validPayload);

            expect(result.data).toBeUndefined();
            expect(result.status).toBe(204);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed project deletion', async () => {
            const mockApiError: ApiErrorType = { code: 'FORBIDDEN', message: 'User not authorized to delete this project' };
            const mockErrorResponse: ApiResponse<void> = {
                error: mockApiError,
                status: 403,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.deleteProject(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(403);
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

    // New tests for cloneProject
    describe('cloneProject', () => {
        const endpoint = 'dialectic-service';
        const projectIdToClone = 'proj-original-456';
        const clonePayload = { projectId: projectIdToClone };
        const requestBody = { action: 'cloneProject', payload: clonePayload };
        const clonedProjectData: DialecticProject = {
            ...mockDialecticProject, // Use the existing mock as a base
            id: 'proj-cloned-789', // Different ID for the clone
            project_name: `Clone of ${mockDialecticProject.project_name}`,
        };

        it('should call apiClient.post with the correct endpoint and body for cloneProject', async () => {
            const mockResponse: ApiResponse<DialecticProject> = { data: clonedProjectData, status: 201 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.cloneProject(clonePayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the cloned project data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = { data: clonedProjectData, status: 201 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.cloneProject(clonePayload);

            expect(result.data).toEqual(clonedProjectData);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed project cloning', async () => {
            const mockApiError: ApiErrorType = { code: 'CLONE_FAILED', message: 'Cloning process failed' };
            const mockErrorResponse: ApiResponse<DialecticProject> = { error: mockApiError, status: 500 };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.cloneProject(clonePayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for cloneProject';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.cloneProject(clonePayload);

            expect(result.error).toEqual({ code: 'NETWORK_ERROR', message: networkErrorMessage });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    // New tests for exportProject
    describe('exportProject', () => {
        const endpoint = 'dialectic-service';
        const projectIdToExport = 'proj-export-abc';
        const exportPayload = { projectId: projectIdToExport };
        const requestBody = { action: 'exportProject', payload: exportPayload };
        const exportData = { export_url: 'https://example.com/exports/project-export-abc.zip' };

        it('should call apiClient.post with the correct endpoint and body for exportProject', async () => {
            const mockResponse: ApiResponse<{ export_url: string }> = { data: exportData, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.exportProject(exportPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the export URL data on successful response', async () => {
            const mockResponse: ApiResponse<{ export_url: string }> = { data: exportData, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.exportProject(exportPayload);

            expect(result.data).toEqual(exportData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed project export', async () => {
            const mockApiError: ApiErrorType = { code: 'EXPORT_FAILED', message: 'Export process failed' };
            const mockErrorResponse: ApiResponse<{ export_url: string }> = { error: mockApiError, status: 500 };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.exportProject(exportPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for exportProject';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.exportProject(exportPayload);

            expect(result.error).toEqual({ code: 'NETWORK_ERROR', message: networkErrorMessage });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });
}); 