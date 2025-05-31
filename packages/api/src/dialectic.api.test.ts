import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import type { ApiClient } from './apiClient';
import type { ApiResponse, ApiError, CreateProjectPayload, DialecticProject, StartSessionPayload, DialecticSession, AIModelCatalogEntry, ContributionContentSignedUrlResponse } from '@paynless/types';

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
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch tags' };
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
            const mockApiError: ApiError = { code: 'VALIDATION_ERROR', message: 'Project name is required' };
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
            const mockApiError: ApiError = { code: 'FETCH_ERROR', message: 'Failed to fetch projects' };
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'pending_thesis',
            associated_chat_id: 'chat-123',
            dialectic_session_models: [],
            dialectic_contributions: [],
            convergence_status: null,
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticSession> = { data: { ...baseMockSession }, status: 201 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.startSession(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            const calls = mockApiClientPost.mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toEqual(requestBody);
            expect(calls[0][2]).toBeUndefined();
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
            const mockApiError: ApiError = { code: 'PROJECT_NOT_FOUND', message: 'Project not found' };
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
                selected_domain_tag: 'software_development',
                repo_url: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'active',
                sessions: [], 
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
                selected_domain_tag: 'design',
                repo_url: 'https://github.com/test/project',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'active',
                sessions: [],
            };
            const mockResponse: ApiResponse<DialecticProject> = { data: mockData, status: 200 };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getProjectDetails(projectId);

            expect(result.data).toEqual(mockData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return error on failed response', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Project not found' };
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
            const mockApiError: ApiError = { code: 'INTERNAL_ERROR', message: 'Could not fetch model catalog' };
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
            const mockApiError: ApiError = { code: 'STORAGE_ERROR', message: 'Failed to generate signed URL' };
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
}); 