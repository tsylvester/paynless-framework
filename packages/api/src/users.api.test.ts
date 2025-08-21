import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserApiClient } from './users.api';
import type { ApiClient } from './apiClient';
import type { ApiResponse, UserProfile, ApiError, UserProfileUpdate } from '@paynless/types';

// Mock the logger
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

const mockUserProfile: UserProfile = {
    id: 'user-123',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    avatar_url: null,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    last_selected_org_id: null,
    chat_context: null,
    profile_privacy_setting: 'public',
    role: 'user',
    has_seen_welcome_modal: false,
    is_subscribed_to_newsletter: false,
};

describe('UserApiClient', () => {
    let mockApiClient: ApiClient;
    let userApiClient: UserApiClient;

    beforeEach(() => {
        // Create a mock ApiClient with a spy for the 'get' method
        mockApiClient = {
            get: vi.fn(),
            post: vi.fn(),
        } as any; // Cast to any to simplify mocking only the 'get' method
        userApiClient = new UserApiClient(mockApiClient);
        vi.clearAllMocks(); // Clear mocks before each test
    });

    describe('getProfile', () => {
        it('should call apiClient.get with the correct endpoint and return user profile data on success', async () => {
            const userId = 'user-123';
            const successResponse: ApiResponse<UserProfile> = {
                status: 200,
                data: mockUserProfile,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(successResponse);

            const result = await userApiClient.getProfile(userId);

            expect(mockApiClient.get).toHaveBeenCalledWith(`profile/${userId}`);
            expect(result).toEqual(successResponse);
        });

        it('should return an error response if userId is empty', async () => {
            const result = await userApiClient.getProfile('');
            const expectedError: ApiResponse<UserProfile> = {
                status: 400,
                error: { code: 'BAD_REQUEST', message: 'User ID cannot be empty.' },
            };

            expect(mockApiClient.get).not.toHaveBeenCalled();
            expect(result).toEqual(expectedError);
        });

        it('should return an error response if userId consists only of whitespace', async () => {
            const result = await userApiClient.getProfile('   ');
            const expectedError: ApiResponse<UserProfile> = {
                status: 400,
                error: { code: 'BAD_REQUEST', message: 'User ID cannot be empty.' },
            };

            expect(mockApiClient.get).not.toHaveBeenCalled();
            expect(result).toEqual(expectedError);
        });

        it('should return error response from apiClient.get if API returns an error', async () => {
            const userId = 'user-404';
            const errorResponse: ApiResponse<UserProfile> = {
                status: 404,
                error: { code: 'NOT_FOUND', message: 'Profile not found' },
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(errorResponse);

            const result = await userApiClient.getProfile(userId);

            expect(mockApiClient.get).toHaveBeenCalledWith(`profile/${userId}`);
            expect(result).toEqual(errorResponse);
        });

        it('should return a 500 error response if apiClient.get throws an unexpected error', async () => {
            const userId = 'user-error';
            const unexpectedError = new Error('Network connection failed');
            (mockApiClient.get as vi.Mock).mockRejectedValue(unexpectedError);

            const result = await userApiClient.getProfile(userId);

            const expectedResponse: ApiResponse<UserProfile> = {
                status: 500,
                error: { code: 'UNEXPECTED_ERROR', message: 'Network connection failed' },
            };

            expect(mockApiClient.get).toHaveBeenCalledWith(`profile/${userId}`);
            expect(result).toEqual(expectedResponse);
        });

        it('should return a 500 error response if apiClient.get throws a non-Error object', async () => {
            const userId = 'user-non-error-throw';
            const unexpectedError = { some: 'object' }; // Not an instance of Error
            (mockApiClient.get as vi.Mock).mockRejectedValue(unexpectedError);

            const result = await userApiClient.getProfile(userId);

            const expectedResponse: ApiResponse<UserProfile> = {
                status: 500,
                error: { code: 'UNEXPECTED_ERROR', message: 'An unexpected error occurred' },
            };

            expect(mockApiClient.get).toHaveBeenCalledWith(`profile/${userId}`);
            expect(result).toEqual(expectedResponse);
        });
    });

    describe('updateOwnProfile', () => {
        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const profileUpdate: UserProfileUpdate = {
                first_name: 'Jane',
                is_subscribed_to_newsletter: true,
            };
            const successResponse: ApiResponse<UserProfile> = {
                status: 200,
                data: { ...mockUserProfile, ...profileUpdate },
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(successResponse);

            const result = await userApiClient.updateOwnProfile(profileUpdate);

            expect(mockApiClient.post).toHaveBeenCalledWith('me', profileUpdate);
            expect(result).toEqual(successResponse);
        });

        it('should return an error response if the API call fails', async () => {
            const profileUpdate: UserProfileUpdate = { last_name: 'Doe' };
            const errorResponse: ApiResponse<UserProfile> = {
                status: 400,
                error: { code: 'BAD_REQUEST', message: 'Invalid update data' },
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(errorResponse);

            const result = await userApiClient.updateOwnProfile(profileUpdate);

            expect(mockApiClient.post).toHaveBeenCalledWith('me', profileUpdate);
            expect(result).toEqual(errorResponse);
        });

        it('should handle unexpected errors during the API call', async () => {
            const profileUpdate: UserProfileUpdate = { first_name: 'Error' };
            const networkError = new Error('Network Error');
            (mockApiClient.post as vi.Mock).mockRejectedValue(networkError);

            const result = await userApiClient.updateOwnProfile(profileUpdate);

            expect(result.status).toBe(500);
            expect(result.error?.code).toBe('UNEXPECTED_ERROR');
            expect(result.error?.message).toBe('Network Error');
        });

        it('should call the API with an empty payload', async () => {
            const profileUpdate: UserProfileUpdate = {};
            const successResponse: ApiResponse<UserProfile> = {
                status: 200,
                data: mockUserProfile, // Assuming no change
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(successResponse);
            await userApiClient.updateOwnProfile(profileUpdate);
            expect(mockApiClient.post).toHaveBeenCalledWith('me', {});
        });

        it('should handle updating only boolean flags', async () => {
            const profileUpdate: UserProfileUpdate = {
                is_subscribed_to_newsletter: true,
                has_seen_welcome_modal: true,
            };
            const successResponse: ApiResponse<UserProfile> = {
                status: 200,
                data: { ...mockUserProfile, ...profileUpdate },
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(successResponse);
            const result = await userApiClient.updateOwnProfile(profileUpdate);
            expect(mockApiClient.post).toHaveBeenCalledWith('me', profileUpdate);
            expect(result.data?.is_subscribed_to_newsletter).toBe(true);
            expect(result.data?.has_seen_welcome_modal).toBe(true);
        });
    });
}); 