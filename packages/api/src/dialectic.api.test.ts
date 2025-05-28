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
}); 