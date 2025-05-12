import type { ApiClient } from './apiClient';
import type { ApiResponse, UserProfile } from '@paynless/types';
import { logger } from '@paynless/utils';

export class UserApiClient {
    private apiClient: ApiClient;

    constructor(apiClient: ApiClient) {
        this.apiClient = apiClient;
    }

    /**
     * Fetches a user profile by their ID.
     * @param userId The ID of the user whose profile is to be fetched.
     * @returns A Promise resolving to an ApiResponse containing the UserProfile or an error.
     */
    public async getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
        logger.info(`[UserApiClient] Fetching profile for userId: ${userId}`);
        if (!userId || userId.trim() === '') {
            logger.warn('[UserApiClient] getProfile called with empty or invalid userId.');
            return {
                status: 400, // Bad Request
                error: { code: 'BAD_REQUEST', message: 'User ID cannot be empty.' },
            };
        }
        try {
            const response = await this.apiClient.get<UserProfile>(`profile/${userId}`);
            if (response.error) {
                logger.warn(`[UserApiClient] Error fetching profile for userId ${userId}:`, { status: response.status, error: response.error });
            }
            return response;
        } catch (error) {
            logger.error(`[UserApiClient] Unexpected error in getProfile for userId ${userId}:`, { error });
            // Ensure a consistent ApiResponse structure for unexpected errors
            const message = error instanceof Error ? error.message : 'An unexpected error occurred';
            return {
                status: 500, // Internal Server Error for unexpected issues
                error: { code: 'UNEXPECTED_ERROR', message },
            };
        }
    }

    // Future user-specific methods can be added here, for example:
    // public async updateOwnProfile(profileData: UserProfileUpdate): Promise<ApiResponse<UserProfile>> {
    //     logger.info('[UserApiClient] Updating own user profile');
    //     return this.apiClient.put<UserProfile, UserProfileUpdate>('profile', profileData); // Assuming a PUT /profile endpoint for current user
    // }
} 