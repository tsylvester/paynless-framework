import { vi } from 'vitest';
import type { NotificationApiClient } from '../notifications.api';
import { Notification, ApiResponse, ApiError } from '@paynless/types';

/**
 * Creates a reusable mock object for the NotificationApiClient, suitable for Vitest unit tests.
 * Provides vi.fn() implementations for all NotificationApiClient methods.
 *
 * @returns A mocked NotificationApiClient instance.
 */
export const createMockNotificationApiClient = (): NotificationApiClient => ({
    fetchNotifications: vi.fn<[], Promise<ApiResponse<Notification[]>>>(),
    markNotificationRead: vi.fn<[string], Promise<ApiResponse<void>>>(),
    markAllNotificationsAsRead: vi.fn<[], Promise<ApiResponse<void>>>(),
    // Ensure all methods from the actual NotificationApiClient are mocked
});

/**
 * Resets all mock functions within a given mock NotificationApiClient instance.
 * Useful for cleaning up mocks between tests (e.g., in `beforeEach`).
 *
 * @param mockClient - The mock NotificationApiClient instance to reset.
 */
export const resetMockNotificationApiClient = (mockClient: NotificationApiClient) => {
    mockClient.fetchNotifications.mockReset();
    mockClient.markNotificationRead.mockReset();
    mockClient.markAllNotificationsAsRead.mockReset();
};

// Optional: Export a default instance if needed, though creating fresh ones might be safer
// export const mockNotificationApiClient = createMockNotificationApiClient(); 