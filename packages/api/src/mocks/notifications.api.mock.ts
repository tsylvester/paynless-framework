import { vi, type Mock } from 'vitest';
import type { NotificationApiClient } from '../notifications.api';
import type { Notification, ApiResponse } from '@paynless/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Creates a reusable mock object for the NotificationApiClient, suitable for Vitest unit tests.
 * Provides vi.fn() implementations for all NotificationApiClient methods.
 *
 * @returns A mocked NotificationApiClient instance.
 */
export const createMockNotificationApiClient = (): NotificationApiClient => ({
    fetchNotifications: vi.fn() as Mock<[], Promise<ApiResponse<Notification[]>>>,
    markNotificationRead: vi.fn() as Mock<[string], Promise<ApiResponse<null>>>,
    markAllNotificationsAsRead: vi.fn() as Mock<[], Promise<ApiResponse<null>>>,
    subscribeToNotifications: vi.fn() as Mock<[string, (payload: Notification) => void], RealtimeChannel | null>,
    unsubscribeFromNotifications: vi.fn() as Mock<[], void>,
    // Ensure all methods from the actual NotificationApiClient are mocked
    // Cast the entire object to NotificationApiClient to satisfy the type, 
    // acknowledging that private members are not part of this mock object structure
    // because the class constructor itself is typically mocked in tests.
}) as unknown as NotificationApiClient;

/**
 * Resets all mock functions within a given mock NotificationApiClient instance.
 * Useful for cleaning up mocks between tests (e.g., in `beforeEach`).
 *
 * @param mockClient - The mock NotificationApiClient instance to reset.
 */
export const resetMockNotificationApiClient = (mockClient: NotificationApiClient) => {
    (mockClient.fetchNotifications as Mock).mockReset();
    (mockClient.markNotificationRead as Mock).mockReset();
    (mockClient.markAllNotificationsAsRead as Mock).mockReset();
    if (mockClient.subscribeToNotifications) {
        (mockClient.subscribeToNotifications as Mock).mockReset();
    }
    if (mockClient.unsubscribeFromNotifications) {
        (mockClient.unsubscribeFromNotifications as Mock).mockReset();
    }
};

// Optional: Export a default instance if needed, though creating fresh ones might be safer
// export const mockNotificationApiClient = createMockNotificationApiClient(); 