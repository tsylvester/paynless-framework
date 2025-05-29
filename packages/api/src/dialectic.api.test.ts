import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import type { ApiClient } from './apiClient';
import type { ApiResponse, ApiError } from '@paynless/types';

// Mock the base ApiClient
const mockApiClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
} as unknown as ApiClient; // Use type assertion for the mocked object

// Create an instance of the class we are testing
const dialecticApiClient = new DialecticApiClient(mockApiClient);

describe('DialecticApiClient', () => {
    beforeEach(() => {
        vi.resetAllMocks(); // Reset mocks before each test
    });

    describe('listAvailableDomainTags', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listAvailableDomainTags' };
        const requestOptions = { isPublic: true };

        it('should call apiClient.post with the correct endpoint, body, and options', async () => {
            // Arrange: Mock a successful response
            const mockResponse: ApiResponse<string[]> = {
                data: [],
                status: 200,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await dialecticApiClient.listAvailableDomainTags();

            // Assert
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, requestBody, requestOptions);
        });

        it('should return the domain tags array on successful response', async () => {
            // Arrange
            const mockTags: string[] = ['software_development', 'technical_writing'];
            const mockResponse: ApiResponse<string[]> = {
                data: mockTags,
                status: 200,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await dialecticApiClient.listAvailableDomainTags();

            // Assert
            expect(result.data).toEqual(mockTags);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            // Arrange
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch tags' };
            const mockErrorResponse: ApiResponse<string[]> = {
                error: mockApiError,
                status: 500,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act
            const result = await dialecticApiClient.listAvailableDomainTags();

            // Assert
            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });
    });

    describe('createProject', () => {
        const endpoint = 'dialectic-service';
        const validPayload = {
            projectName: 'Test Project',
            initialUserPrompt: 'Test prompt',
            selectedDomainTag: 'software_development',
        };
        const requestBody = { action: 'createProject', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and body for createProject', async () => {
            // Arrange
            const mockProjectResponse: any = { id: 'project-123', ...validPayload }; 
            const mockResponse: ApiResponse<any> = { // Using any for DialecticProject for simplicity in test
                data: mockProjectResponse,
                status: 201,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await dialecticApiClient.createProject(validPayload);

            // Assert
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            // expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, requestBody, undefined); // No special options
            // Updated assertion to be less strict about the optional third argument if it's undefined
            const calls = (mockApiClient.post as vi.Mock).mock.calls;
            expect(calls[0][0]).toEqual(endpoint);
            expect(calls[0][1]).toEqual(requestBody);
            expect(calls[0][2]).toBeUndefined(); // Explicitly check that the third arg was undefined
        });

        it('should return the created project data on successful response', async () => {
            // Arrange
            const mockProjectData: any = { 
                id: 'project-123', 
                user_id: 'user-abc',
                project_name: validPayload.projectName,
                initial_user_prompt: validPayload.initialUserPrompt,
                selected_domain_tag: validPayload.selectedDomainTag,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const mockResponse: ApiResponse<any> = {
                data: mockProjectData,
                status: 201,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await dialecticApiClient.createProject(validPayload);

            // Assert
            expect(result.data).toEqual(mockProjectData);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed project creation', async () => {
            // Arrange
            const mockApiError: ApiError = { code: 'VALIDATION_ERROR', message: 'Project name is required' };
            const mockErrorResponse: ApiResponse<any> = {
                error: mockApiError,
                status: 400,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act
            const result = await dialecticApiClient.createProject(validPayload); // Payload doesn't matter for this test path

            // Assert
            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
        });
    });
}); 