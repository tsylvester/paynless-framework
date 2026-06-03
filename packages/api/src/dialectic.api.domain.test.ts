import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import { 
    ApiResponse, 
    ApiError,
    DialecticProject, 
    DomainOverlayDescriptor, 
    UpdateProjectDomainPayload,
    DialecticProcessTemplate,
    DomainDescriptor,
    DialecticDomain,
} from '@paynless/types';
import { mockApiClient, resetMockApiClient } from './mocks/apiClient.mock';

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

describe('DialecticApiClient', () => {
    let dialecticApiClient: DialecticApiClient;

    beforeEach(() => {
        resetMockApiClient();
        dialecticApiClient = new DialecticApiClient(mockApiClient);
    });
    describe('fetchProcessTemplate', () => {
        const endpoint = 'dialectic-service';
        const templateId = 'template-123';
        const payload = { templateId };
        const requestBody = { action: 'fetchProcessTemplate', payload };
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
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockResponse);
            await dialecticApiClient.fetchProcessTemplate(payload);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the template data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProcessTemplate> = { data: mockTemplate, status: 200 };
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockResponse);
            const result = await dialecticApiClient.fetchProcessTemplate(payload);
            expect(result.data).toEqual(mockTemplate);
        });

        it('should return an error on a failed response', async () => {
            const mockError: ApiError = { code: 'NOT_FOUND', message: 'Template not found' };
            const mockErrorResponse: ApiResponse<DialecticProcessTemplate> = { error: mockError, status: 404 };
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockErrorResponse);
            const result = await dialecticApiClient.fetchProcessTemplate(payload);
            expect(result.error).toEqual(mockError);
        });

        it('should return a network error if the call rejects', async () => {
            const errorMessage = 'Network Failure';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(errorMessage));
            const result = await dialecticApiClient.fetchProcessTemplate(payload);
            expect(result.error).toEqual({ code: 'NETWORK_ERROR', message: errorMessage });
        });
    });    

    describe('listDomains', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listDomains' };
        const mockDomains: DialecticDomain[] = [
            { id: '1', name: 'Software Development', description: 'All about code', parent_domain_id: null, is_enabled: true },
            { id: '2', name: 'Finance', description: 'All about money', parent_domain_id: null, is_enabled: true },
        ];

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                data: mockDomains,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockResponse);

            await dialecticApiClient.listDomains();

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody, { isPublic: true });
        });

        it('should return the domains array on successful response', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                data: mockDomains,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockResponse);

            const result = await dialecticApiClient.listDomains();

            expect(result.data).toEqual(mockDomains);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch domains' };
            const mockErrorResponse: ApiResponse<DialecticDomain[]> = {
                error: mockApiError,
                status: 500,
            };
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockErrorResponse);

            const result = await dialecticApiClient.listDomains();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

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
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockResponse);

            await dialecticApiClient.updateProjectDomain(payload);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the updated project on successful response', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockUpdatedProject,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockResponse);

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
            vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockErrorResponse);

            const result = await dialecticApiClient.updateProjectDomain(payload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

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
