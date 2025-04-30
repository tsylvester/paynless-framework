// packages/store/src/notificationStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
// --- Update import: NotificationState might not be exported, adjust if needed ---
import { useNotificationStore /* NotificationState */ } from './notificationStore';
import { api } from '@paynless/api';
// --- Remove StreamCallbacks, StreamDisconnectFunction if no longer used ---
import type { Notification, ApiError /* StreamCallbacks, StreamDisconnectFunction */ } from '@paynless/types';
import { logger } from '@paynless/utils';
// --- Add Supabase types if needed for mocks ---
import type { RealtimeChannel } from '@supabase/supabase-js';
// Import the actual NotificationApiClient class (needed for constructor type)
import { NotificationApiClient } from '@paynless/api'; 
// Import the shared mock factory and reset function
import { createMockNotificationApiClient, resetMockNotificationApiClient } from '@paynless/api/mocks/notifications.api.mock';

// Mock Logger (Keep as is)
vi.mock('@paynless/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/utils')>();
    return {
        ...actual, // Keep original exports
        logger: { // Mock only logger
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            fatal: vi.fn(),
        },
    };
});

// --- Create an instance of the shared mock ---
const mockNotificationApi = createMockNotificationApiClient();

// --- Mock the Realtime Channel used by subscribe ---
const mockRealtimeChannel = {
    unsubscribe: vi.fn(),
} as unknown as RealtimeChannel;

// --- Variable to capture the callback passed to subscribe ---
let capturedNotificationCallback: ((notification: Notification) => void) | null = null;

// --- Mock the @paynless/api module to provide the mock API client instance ---
vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    return {
        // Keep other exports from the actual module if needed
        ...actualApiModule,
        // Override the NotificationApiClient class with a factory returning our mock instance
        NotificationApiClient: vi.fn(() => mockNotificationApi), 
        // Also mock the 'api' object if the store uses it directly (e.g., api.notifications())
        api: { 
            // Replace with a function that returns the mock instance
            notifications: () => mockNotificationApi, 
            // Add mocks for other api parts (organizations, ai, etc.) if needed by other tests 
            // or if this test file inadvertently calls them
            organizations: vi.fn(), // Placeholder
            ai: vi.fn(),           // Placeholder
            // ... other potential api parts
        }
    };
});

const initialState = useNotificationStore.getState();

// Mock Notification Data (Keep as is)
const mockNotification1: Notification = {
    id: 'uuid-1',
    user_id: 'user-abc',
    type: 'test',
    data: { message: 'Test 1' },
    read: false,
    created_at: new Date(Date.now() - 10000).toISOString(),
};
const mockNotification2: Notification = {
    id: 'uuid-2',
    user_id: 'user-abc',
    type: 'test',
    data: { message: 'Test 2', target_path: 'some/path' },
    read: false,
    created_at: new Date(Date.now() - 5000).toISOString(),
};
const mockNotification3: Notification = {
    id: 'uuid-3',
    user_id: 'user-abc',
    type: 'another',
    data: null,
    read: true, // Already read
    created_at: new Date(Date.now() - 20000).toISOString(),
};

// --- Test Suite ---
describe('notificationStore', () => {
    // Reset store state and mocks before each test
    beforeEach(() => {
        act(() => {
            useNotificationStore.setState(initialState, true); // Replace state
        });
        vi.clearAllMocks();
        // Use the shared reset function for the mock API client
        resetMockNotificationApiClient(mockNotificationApi);
        
        // Reset Realtime specific mocks
        mockRealtimeChannel.unsubscribe.mockReset();
        capturedNotificationCallback = null; // Clear captured callback

        // --- Mocks for the API methods are now part of mockNotificationApi ---
        // Default success mock for fetch
        mockNotificationApi.fetchNotifications.mockResolvedValue({ data: [], status: 200 });
        // Default success mock for mark read
        mockNotificationApi.markNotificationRead.mockResolvedValue({ data: undefined, status: 204 });
        // Default success mock for mark all read
        mockNotificationApi.markAllNotificationsAsRead.mockResolvedValue({ data: undefined, status: 204 });
        
        // Default mock for subscribe - capture callback and return channel/null
        // Assuming NotificationApiClient has subscribe/unsubscribe methods now
        // If subscribe/unsubscribe are NOT part of NotificationApiClient, adjust mock setup
        // mockNotificationApi.subscribeToNotifications.mockImplementation(...);
        // mockNotificationApi.unsubscribeFromNotifications.mockImplementation(...);
        
        // Reset logger mocks
        (logger.info as vi.Mock).mockClear();
        (logger.warn as vi.Mock).mockClear();
        (logger.error as vi.Mock).mockClear();
        (logger.debug as vi.Mock).mockClear();
    });

    it('should have correct initial state', () => {
        expect(useNotificationStore.getState().notifications).toEqual([]);
        expect(useNotificationStore.getState().unreadCount).toBe(0);
        expect(useNotificationStore.getState().isLoading).toBe(false);
        expect(useNotificationStore.getState().error).toBeNull();
    });

    describe('Actions', () => {
        describe('fetchNotifications', () => {
            it('should set notifications and unread count on successful fetch', async () => {
                const mockNotifications = [mockNotification1, mockNotification2, mockNotification3];
                // Use the mock API instance
                mockNotificationApi.fetchNotifications.mockResolvedValue({ data: mockNotifications, status: 200 });
                await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                expect(state.notifications).toEqual([mockNotification2, mockNotification1, mockNotification3]);
                expect(state.unreadCount).toBe(2);
                expect(mockNotificationApi.fetchNotifications).toHaveBeenCalledTimes(1);
            });
            
            it('should handle null data on successful fetch', async () => {
                 // Use the mock API instance
                mockNotificationApi.fetchNotifications.mockResolvedValue({ data: null as any, status: 200 });
                await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                expect(state.notifications).toEqual([]);
                expect(state.unreadCount).toBe(0);
                expect(mockNotificationApi.fetchNotifications).toHaveBeenCalledTimes(1);
            });

            it('should set loading state during fetch', async () => {
                const mockNotifications = [mockNotification1];
                const fetchPromise = new Promise((resolve) => setTimeout(() => resolve({ data: mockNotifications, status: 200 }), 20));
                // Use the mock API instance
                mockNotificationApi.fetchNotifications.mockReturnValue(fetchPromise as any);

                await act(async () => {
                    const storePromise = useNotificationStore.getState().fetchNotifications();
                    expect(useNotificationStore.getState().isLoading).toBe(true);
                    await storePromise; 
                    expect(useNotificationStore.getState().isLoading).toBe(false);
                });
                expect(useNotificationStore.getState().isLoading).toBe(false);
            });

            it('should set error state on failed fetch', async () => {
                 const mockError: ApiError = { code: 'FETCH_ERROR', message: 'Failed to fetch' };
                 // Use the mock API instance
                 mockNotificationApi.fetchNotifications.mockResolvedValue({ error: mockError, status: 500 });
                 await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                 const state = useNotificationStore.getState();
                 expect(state.isLoading).toBe(false);
                 expect(state.error).toEqual(mockError);
                 expect(state.notifications).toEqual([]);
                 expect(state.unreadCount).toBe(0);
                 expect(mockNotificationApi.fetchNotifications).toHaveBeenCalledTimes(1);
                 expect(logger.error).toHaveBeenCalledWith('[notificationStore] Failed to fetch notifications', { error: mockError });
            });
        });

        // Assuming addNotification is still internal / triggered by subscribe
        describe('addNotification (Internal - called by Realtime subscription callback)', () => {
            // These tests remain largely the same, as they test the store's internal logic
            it('should prepend a new notification and increment unread count', () => {
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); }); 
                 act(() => { useNotificationStore.getState().addNotification(mockNotification2);
                 });
                 const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification2, mockNotification1]);
                 expect(state.unreadCount).toBe(2);
                 expect(logger.debug).toHaveBeenCalledWith('[notificationStore] Added notification', { notificationId: mockNotification2.id });
            });
            
            it('should prepend a new notification but not increment count if already read', () => {
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); });
                 act(() => { useNotificationStore.getState().addNotification(mockNotification3); }); 
                 const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification1, mockNotification3]);
                 expect(state.unreadCount).toBe(1); 
                 expect(logger.debug).toHaveBeenCalledWith('[notificationStore] Added notification', { notificationId: mockNotification3.id });
            });
             
            it('should not add a duplicate notification based on ID', () => {
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); });
                 act(() => { useNotificationStore.getState().addNotification(mockNotification1); });
                 const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification1]);
                 expect(state.unreadCount).toBe(1);
                 expect(logger.warn).toHaveBeenCalledWith('[notificationStore] Attempted to add duplicate notification', { id: mockNotification1.id });
             });
        });

        describe('markNotificationRead', () => {
             beforeEach(() => {
                act(() => {
                    useNotificationStore.setState({
                         notifications: [mockNotification2, mockNotification1, mockNotification3], 
                         unreadCount: 2,
                         error: null,
                    });
                 });
             });

             it('should mark a notification as read, decrement count, and call API', async () => {
                 // Use the mock API instance
                 mockNotificationApi.markNotificationRead.mockResolvedValue({ status: 204 }); // Success

                 await act(async () => { 
                     await useNotificationStore.getState().markNotificationRead(mockNotification1.id);
                 });

                 const state = useNotificationStore.getState();
                 expect(state.error).toBeNull();
                 expect(state.unreadCount).toBe(1);
                 const updatedNotification = state.notifications.find(n => n.id === mockNotification1.id);
                 expect(updatedNotification?.read).toBe(true);
                 // Use the mock API instance for assertion
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledTimes(1);
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledWith(mockNotification1.id);
                 expect(logger.info).toHaveBeenCalledWith('[notificationStore] Marked notification as read', { notificationId: mockNotification1.id });
             });

             it('should NOT change state if notification is already read', async () => {
                await act(async () => { 
                    await useNotificationStore.getState().markNotificationRead(mockNotification3.id); // mock3 is already read
                 });
                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2); // Unchanged
                 expect(mockNotificationApi.markNotificationRead).not.toHaveBeenCalled(); // API should not be called
             });

             it('should NOT change state if notification is not found', async () => {
                await act(async () => { 
                    await useNotificationStore.getState().markNotificationRead('non-existent-id');
                 });
                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2); // Unchanged
                 expect(mockNotificationApi.markNotificationRead).not.toHaveBeenCalled(); // API should not be called
             });

             it('should revert state and set error on API failure', async () => {
                 const mockError: ApiError = { code: 'UPDATE_FAILED', message: 'Could not update' };
                 // Use the mock API instance
                 mockNotificationApi.markNotificationRead.mockResolvedValue({ error: mockError, status: 500 });

                 await act(async () => { 
                     await useNotificationStore.getState().markNotificationRead(mockNotification1.id);
                 });

                 const state = useNotificationStore.getState();
                 expect(state.error).toEqual(mockError);
                 expect(state.unreadCount).toBe(2); // Should revert
                 const revertedNotification = state.notifications.find(n => n.id === mockNotification1.id);
                 expect(revertedNotification?.read).toBe(false); // Should revert
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledTimes(1);
                 expect(mockNotificationApi.markNotificationRead).toHaveBeenCalledWith(mockNotification1.id);
                 expect(logger.error).toHaveBeenCalledWith(
                   '[notificationStore] Failed to mark notification as read',
                   expect.objectContaining({
                     notificationId: 'uuid-1',
                     error: mockError
                   })
                 );
             });
        });

        describe('markAllNotificationsAsRead', () => {
            beforeEach(() => {
                act(() => {
                    useNotificationStore.setState({
                        notifications: [mockNotification2, mockNotification1, mockNotification3],
                        unreadCount: 2, 
                        error: null,
                    });
                });
            });

            it('should mark all as read, set count to 0, and call API', async () => {
                // Use the mock API instance
                mockNotificationApi.markAllNotificationsAsRead.mockResolvedValue({ status: 204 });

                await act(async () => { 
                    await useNotificationStore.getState().markAllNotificationsAsRead();
                 });

                const state = useNotificationStore.getState();
                expect(state.error).toBeNull();
                expect(state.unreadCount).toBe(0);
                expect(state.notifications.every(n => n.read)).toBe(true);
                // Use the mock API instance for assertion
                expect(mockNotificationApi.markAllNotificationsAsRead).toHaveBeenCalledTimes(1);
                expect(logger.info).toHaveBeenCalledWith('[notificationStore] Marked all notifications as read');
            });

            it('should NOT call API if unread count is already 0', async () => {
                act(() => { useNotificationStore.setState({ unreadCount: 0 }); }); // Set count to 0
                await act(async () => { 
                    await useNotificationStore.getState().markAllNotificationsAsRead();
                 });
                 expect(mockNotificationApi.markAllNotificationsAsRead).not.toHaveBeenCalled();
            });

            it('should revert state and set error on API failure', async () => {
                const originalNotifications = [...useNotificationStore.getState().notifications]; // Store original state
                const mockError: ApiError = { code: 'UPDATE_ALL_FAILED', message: 'Mass update failed' };
                // Use the mock API instance
                mockNotificationApi.markAllNotificationsAsRead.mockResolvedValue({ error: mockError, status: 500 });

                await act(async () => { 
                     await useNotificationStore.getState().markAllNotificationsAsRead();
                 });

                 const state = useNotificationStore.getState();
                 expect(state.error).toEqual(mockError);
                 expect(state.unreadCount).toBe(2); // Reverted
                 // Check if notifications reverted (simple check)
                 expect(state.notifications[0].read).toBe(false); // mock2
                 expect(state.notifications[1].read).toBe(false); // mock1
                 expect(state.notifications[2].read).toBe(true); // mock3 was already read
                 expect(mockNotificationApi.markAllNotificationsAsRead).toHaveBeenCalledTimes(1);
                 expect(logger.error).toHaveBeenCalledWith(
                   '[notificationStore] Failed to mark all notifications as read',
                   expect.objectContaining({
                     error: mockError
                   })
                 );
            });
        });
        
        // --- Tests for Realtime Subscription ---
        // describe('subscribeToNotifications', () => {
        //     it('should call the API subscribe method and set channel', () => {
        //         const userId = 'user-for-sub';
        //         act(() => { useNotificationStore.getState().subscribeToNotifications(userId); });

        //         expect(mockNotificationApi.subscribeToNotifications).toHaveBeenCalledTimes(1);
        //         expect(mockNotificationApi.subscribeToNotifications).toHaveBeenCalledWith(userId, expect.any(Function));
        //         // Assuming the store holds the channel reference
        //         expect(useNotificationStore.getState().realtimeChannel).toBe(mockRealtimeChannel);
        //         expect(logger.info).toHaveBeenCalledWith('[notificationStore] Subscribed to notifications', { userId });
        //     });

        //     it('should handle API returning null (e.g., no userId)', () => {
        //         mockNotificationApi.subscribeToNotifications.mockReturnValue(null as any);
        //         act(() => { useNotificationStore.getState().subscribeToNotifications(''); }); // Pass empty userId

        //         expect(mockNotificationApi.subscribeToNotifications).toHaveBeenCalledTimes(1);
        //         expect(useNotificationStore.getState().realtimeChannel).toBeNull();
        //         expect(logger.warn).toHaveBeenCalledWith('[notificationStore] Failed to subscribe, channel not established.');
        //     });

        //     it('should add notification when callback is triggered', () => {
        //         const userId = 'user-for-sub';
        //         act(() => { useNotificationStore.getState().subscribeToNotifications(userId); });
        //         expect(capturedNotificationCallback).toBeDefined();

        //         // Simulate receiving a notification via the captured callback
        //         act(() => {
        //             capturedNotificationCallback!(mockNotification1); 
        //         });

        //         const state = useNotificationStore.getState();
        //         expect(state.notifications).toEqual([mockNotification1]);
        //         expect(state.unreadCount).toBe(1);
        //     });
        // });

        // describe('unsubscribeFromNotifications', () => {
        //     it('should call API unsubscribe, clear channel, and reset callback', async () => {
        //         // Arrange: Simulate a subscribed state
        //         act(() => { 
        //             useNotificationStore.setState({ realtimeChannel: mockRealtimeChannel }); 
        //             // Ensure a callback is captured for testing reset
        //             capturedNotificationCallback = (n: Notification) => { logger.info('Callback called', n); }; 
        //         }); 

        //         await act(async () => { 
        //             await useNotificationStore.getState().unsubscribeFromNotifications();
        //         });

        //         // Assert API call
        //         expect(mockNotificationApi.unsubscribeFromNotifications).toHaveBeenCalledTimes(1);
        //         // Assert channel is cleared in store
        //         expect(useNotificationStore.getState().realtimeChannel).toBeNull();
        //         // Assert captured callback is reset (if unsubscribe logic does this)
        //         // expect(capturedNotificationCallback).toBeNull(); // Depends on mockUnsubscribe impl
        //         expect(logger.info).toHaveBeenCalledWith('[notificationStore] Unsubscribed from notifications');
        //     });
            
        //      it('should not call API if channel is already null', async () => {
        //          act(() => { useNotificationStore.setState({ realtimeChannel: null }); }); // Ensure null channel
        //          await act(async () => { 
        //             await useNotificationStore.getState().unsubscribeFromNotifications();
        //         });
        //         expect(mockNotificationApi.unsubscribeFromNotifications).not.toHaveBeenCalled();
        //      });
        // });

        // describe('clearNotifications', () => {
        //     it('should reset notifications and unread count', () => {
        //         // Arrange: Set some initial state
        //         act(() => {
        //             useNotificationStore.setState({ 
        //                 notifications: [mockNotification1, mockNotification2], 
        //                 unreadCount: 2 
        //             });
        //         });
        //         // Act
        //         act(() => { useNotificationStore.getState().clearNotifications(); });
        //         // Assert
        //         const state = useNotificationStore.getState();
        //         expect(state.notifications).toEqual([]);
        //         expect(state.unreadCount).toBe(0);
        //         expect(logger.info).toHaveBeenCalledWith('[notificationStore] Cleared notifications');
        //     });
        // });
    });
}); 