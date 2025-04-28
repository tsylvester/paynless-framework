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

// --- Updated API Mock ---
const mockFetchNotifications = vi.fn();
const mockMarkNotificationAsRead = vi.fn();
const mockMarkAllNotificationsAsRead = vi.fn();
const mockSubscribeToNotifications = vi.fn();
const mockUnsubscribeFromNotifications = vi.fn();

const mockRealtimeChannel = {
    unsubscribe: vi.fn(),
} as unknown as RealtimeChannel;

let capturedNotificationCallback: ((notification: Notification) => void) | null = null;

// --- Restore Original Mock Structure & Fix Key Name ---
vi.mock('@paynless/api', () => ({
    api: {
        notifications: () => ({
            fetchNotifications: mockFetchNotifications,
            markNotificationRead: mockMarkNotificationAsRead, // Correct key name
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
            subscribeToNotifications: mockSubscribeToNotifications,
            unsubscribeFromNotifications: mockUnsubscribeFromNotifications,
        }),
    },
}));

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
    // Remove capturedCallbacks for SSE
    // let capturedCallbacks: StreamCallbacks<Notification> | undefined;

    // Reset store state and mocks before each test
    beforeEach(() => {
        act(() => {
            useNotificationStore.setState(initialState, true); // Replace state
        });
        vi.clearAllMocks();
        // Reset standard mocks
        mockFetchNotifications.mockClear();
        mockMarkNotificationAsRead.mockClear();
        mockMarkAllNotificationsAsRead.mockClear();
        // --- NEW: Reset Realtime Mocks ---
        mockSubscribeToNotifications.mockClear();
        mockUnsubscribeFromNotifications.mockClear();
        (logger.info as vi.Mock).mockClear(); // Also clear logger mocks if checking calls
        (logger.warn as vi.Mock).mockClear();
        (logger.error as vi.Mock).mockClear();
        (logger.debug as vi.Mock).mockClear();

        capturedNotificationCallback = null; // Clear captured callback

        // Default mock for subscribe - capture callback and return channel/null
        mockSubscribeToNotifications.mockImplementation(
            (userId: string, callback: (notification: Notification) => void) => {
                 // console.log(`Mock subscribeToNotifications called with userId: ${userId}`); // Debug log
                 if (!userId) {
                    logger.error('Mock API: userId is required for subscription.');
                    return null; // Or throw error
                 }
                 capturedNotificationCallback = callback;
                 // Return a mock channel or null, depending on what the store action expects
                 // Let's assume it returns the channel for potential later use (e.g., manual unsubscribe)
                 // If the API client handles the channel entirely internally and returns void/boolean, adjust this.
                 logger.debug(`Mock API: Subscribing user ${userId}`);
                 return mockRealtimeChannel;
             }
        );
        // Default mock for unsubscribe (simple mock)
        mockUnsubscribeFromNotifications.mockImplementation(() => {
             logger.debug('Mock API: Unsubscribe called.');
             // Reset captured callback on unsubscribe simulation
             capturedNotificationCallback = null;
             return Promise.resolve(undefined); // Or whatever it returns
        });
        // ----------------------------------
    });

    it('should have correct initial state', () => {
        expect(useNotificationStore.getState().notifications).toEqual([]);
        expect(useNotificationStore.getState().unreadCount).toBe(0);
        expect(useNotificationStore.getState().isLoading).toBe(false);
        expect(useNotificationStore.getState().error).toBeNull();
        // --- REMOVE check for isStreamConnected ---
        // expect(useNotificationStore.getState().isStreamConnected).toBe(false);
    });

    describe('Actions', () => {
        describe('fetchNotifications', () => {
            it('should set notifications and unread count on successful fetch', async () => {
                const mockNotifications = [mockNotification1, mockNotification2, mockNotification3];
                mockFetchNotifications.mockResolvedValue({ data: mockNotifications, status: 200 });
                await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                // Ensure sorting puts newest first
                expect(state.notifications).toEqual([mockNotification2, mockNotification1, mockNotification3]);
                expect(state.unreadCount).toBe(2);
                expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
            });
             it('should handle null data on successful fetch', async () => {
                mockFetchNotifications.mockResolvedValue({ data: null as any, status: 200 });
                await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                expect(state.notifications).toEqual([]);
                expect(state.unreadCount).toBe(0);
                expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
            });
            it('should set loading state during fetch', async () => {
                const mockNotifications = [mockNotification1];
                // Slightly adjust delay if needed, but focus is on act/await
                const fetchPromise = new Promise((resolve) => setTimeout(() => resolve({ data: mockNotifications, status: 200 }), 20)); // Increased delay slightly
                mockFetchNotifications.mockReturnValue(fetchPromise);

                // Use act to wrap the dispatch AND the await
                await act(async () => {
                    const storePromise = useNotificationStore.getState().fetchNotifications();
                    // Check loading state *immediately* after dispatch inside act
                    expect(useNotificationStore.getState().isLoading).toBe(true);
                    await storePromise; // Await the action's completion
                    // Check loading state *after* completion inside the same act
                    expect(useNotificationStore.getState().isLoading).toBe(false);
                });
                // Final check outside act (should also be false)
                expect(useNotificationStore.getState().isLoading).toBe(false);
            });
            it('should set error state on failed fetch', async () => {
                 const mockError: ApiError = { code: 'FETCH_ERROR', message: 'Failed to fetch' };
                 mockFetchNotifications.mockResolvedValue({ error: mockError, status: 500 });
                 await act(async () => { await useNotificationStore.getState().fetchNotifications(); });
                 const state = useNotificationStore.getState();
                 expect(state.isLoading).toBe(false);
                 expect(state.error).toEqual(mockError);
                 expect(state.notifications).toEqual([]);
                 expect(state.unreadCount).toBe(0);
                 expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
                 // Check if error was logged
                 expect(logger.error).toHaveBeenCalledWith('[notificationStore] Failed to fetch notifications', { error: mockError });
            });
        });

        // --- Update description ---
        describe('addNotification (Internal - called by Realtime subscription callback)', () => {
            it('should prepend a new notification and increment unread count', () => {
                 // Arrange: Set initial state with one notification (mock2)
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); }); // Start with older mock1
                 // Act: Add a newer notification (mock2)
                 act(() => { useNotificationStore.getState().addNotification(mockNotification2);
                 });
                 const state = useNotificationStore.getState();
                 // Assert: Newer notification (mock2) should be first due to sorting
                 expect(state.notifications).toEqual([mockNotification2, mockNotification1]); // Correct order
                 expect(state.unreadCount).toBe(2);
                 expect(logger.debug).toHaveBeenCalledWith('[notificationStore] Added notification', { notificationId: mockNotification2.id });
            });
            it('should prepend a new notification but not increment count if already read', () => {
                 // Arrange: Set initial state with one unread notification (mock1)
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); });
                 // Act: Add an older, already read notification (mock3)
                 act(() => { useNotificationStore.getState().addNotification(mockNotification3); }); // mockNotification3 is read: true
                 const state = useNotificationStore.getState();
                 // Assert: Order based on sorting (mock1 newer than mock3)
                 expect(state.notifications).toEqual([mockNotification1, mockNotification3]);
                 expect(state.unreadCount).toBe(1); // Count remains 1
                 // --- Updated Assertion: Expect metadata object ---
                 expect(logger.debug).toHaveBeenCalledWith('[notificationStore] Added notification', { notificationId: mockNotification3.id });
            });
             it('should not add a duplicate notification based on ID', () => {
                 // Arrange: Set initial state with one notification (mock1)
                 act(() => { useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 }); });
                 // Act: Attempt to add the same notification again
                 act(() => { useNotificationStore.getState().addNotification(mockNotification1); });
                 const state = useNotificationStore.getState();
                 // Assert: State remains unchanged
                 expect(state.notifications).toEqual([mockNotification1]);
                 expect(state.unreadCount).toBe(1);
                 // --- Corrected Assertion: Expect metadata object key is 'id' based on store log ---
                 expect(logger.warn).toHaveBeenCalledWith('[notificationStore] Attempted to add duplicate notification', { id: mockNotification1.id });
             });
        });

        describe('markNotificationRead', () => {
             beforeEach(() => {
                // Set initial state with unread notifications
                act(() => {
                    useNotificationStore.setState({
                         notifications: [mockNotification2, mockNotification1, mockNotification3], // mock1, mock2 are unread
                         unreadCount: 2,
                         error: null, // Clear previous errors
                    });
                 });
             });
             it('should mark a notification as read, decrement count, and call API', async () => {
                 mockMarkNotificationAsRead.mockResolvedValue({ status: 204, data: null });
                 // Ensure await act wraps the entire async operation and state update
                 await act(async () => {
                    await useNotificationStore.getState().markNotificationRead('uuid-1');
                 });

                 const state = useNotificationStore.getState();
                 const updatedNotification = state.notifications.find(n => n.id === 'uuid-1');

                 expect(updatedNotification?.read).toBe(true); // Check local state update AFTER act completes
                 expect(state.unreadCount).toBe(1);
                 expect(state.error).toBeNull();
                 expect(mockMarkNotificationAsRead).toHaveBeenCalledTimes(1);
                 expect(mockMarkNotificationAsRead).toHaveBeenCalledWith('uuid-1');
             });

             it('should not change state or call API if notification is already read', async () => {
                 await act(async () => { await useNotificationStore.getState().markNotificationRead('uuid-3'); }); // mock3 is already read

                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2); // Count remains unchanged
                 expect(state.error).toBeNull();
                 // Check that logger.debug was called instead of API
                 // --- Updated Assertion: Expect metadata object ---
                 expect(logger.debug).toHaveBeenCalledWith('[notificationStore] Notification already read', { notificationId: 'uuid-3' });
                 expect(mockMarkNotificationAsRead).not.toHaveBeenCalled();
             });

              it('should not change state or call API if notification is not found', async () => {
                 await act(async () => { await useNotificationStore.getState().markNotificationRead('uuid-unknown'); });

                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2); // Count remains unchanged
                 expect(state.error).toBeNull();
                 // Check that logger.warn was called
                 // --- Updated Assertion: Expect metadata object ---
                 expect(logger.warn).toHaveBeenCalledWith('[notificationStore] markNotificationRead: Notification not found', { notificationId: 'uuid-unknown' });
                 expect(mockMarkNotificationAsRead).not.toHaveBeenCalled();
              });

               it('should set error state and log if API call fails', async () => {
                  const mockApiError: ApiError = { code: 'API_ERR', message: 'Failed to mark as read' };
                  // Simulate failure
                  mockMarkNotificationAsRead.mockResolvedValue({ status: 500, error: mockApiError, data: null });

                  await act(async () => {
                      await useNotificationStore.getState().markNotificationRead('uuid-1');
                  });

                  const state = useNotificationStore.getState();
                  const notificationInState = state.notifications.find(n => n.id === 'uuid-1');

                  expect(notificationInState?.read).toBe(false);
                  expect(state.unreadCount).toBe(2);
                  // Assert the error received from the store
                  expect(state.error).toEqual(mockApiError);
                  expect(mockMarkNotificationAsRead).toHaveBeenCalledTimes(1);
                  // Check log
                  expect(logger.error).toHaveBeenCalledWith('[notificationStore] Failed to mark notification as read', { notificationId: 'uuid-1', error: mockApiError });
               });
        });

        describe('markAllNotificationsAsRead', () => {
             beforeEach(() => {
                 // Set initial state with unread notifications
                act(() => {
                    useNotificationStore.setState({
                        notifications: [mockNotification1, mockNotification2, mockNotification3], // mock1, mock2 are unread
                        unreadCount: 2,
                        error: null, // Clear previous errors
                    });
                });
            });

            it('should mark all unread as read, set count to 0, and call API', async () => {
                 mockMarkAllNotificationsAsRead.mockResolvedValue({ status: 204, data: null }); // Simulate successful API call

                 await act(async () => { await useNotificationStore.getState().markAllNotificationsAsRead(); });

                 const state = useNotificationStore.getState();
                 // Check all notifications are marked read
                 expect(state.notifications.every(n => n.read)).toBe(true);
                 expect(state.unreadCount).toBe(0); // Count is zero
                 expect(state.error).toBeNull(); // No error expected
                 expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledTimes(1); // API called
            });

            it('should not call API if there are no unread notifications', async () => {
                 // Set state with no unread notifications
                 act(() => {
                    useNotificationStore.setState({
                         notifications: [mockNotification3], // Only the read one
                         unreadCount: 0,
                    });
                 });

                 await act(async () => { await useNotificationStore.getState().markAllNotificationsAsRead(); });

                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(0); // Count remains zero
                 expect(state.error).toBeNull();
                 // Check logger.debug was called
                 expect(logger.debug).toHaveBeenCalledWith('No unread notifications to mark as read.');
                 expect(mockMarkAllNotificationsAsRead).not.toHaveBeenCalled(); // API NOT called
            });

            it('should set error state and log if API call fails', async () => {
                 const mockApiError: ApiError = { code: 'API_ERR', message: 'Failed to mark all as read' };
                 mockMarkAllNotificationsAsRead.mockResolvedValue({ status: 500, error: mockApiError }); // Simulate API failure

                 await act(async () => { await useNotificationStore.getState().markAllNotificationsAsRead(); });

                 const state = useNotificationStore.getState();
                 // State should not change optimistically on failure unless designed to
                 expect(state.notifications.find(n => n.id === 'uuid-1')?.read).toBe(false);
                 expect(state.notifications.find(n => n.id === 'uuid-2')?.read).toBe(false);
                 expect(state.unreadCount).toBe(2); // Count remains unchanged
                 expect(state.error).toEqual(mockApiError); // Error is set
                 expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledTimes(1);
                 // Check logger.error
                 expect(logger.error).toHaveBeenCalledWith('[notificationStore] Failed to mark all notifications as read', { error: mockApiError });
            });
        });

        // --- REMOVE SSE Action Tests ---
        /*
        describe('initNotificationStream', () => { ... });
        describe('disconnectNotificationStream', () => { ... });
        */

        // --- NEW: Test Suite for Supabase Realtime Subscription ---
        describe('subscribeToUserNotifications', () => {
            const testUserId = 'user-123';

            it('should call api.notifications().subscribeToNotifications with user ID and callback', () => {
                act(() => {
                    useNotificationStore.getState().subscribeToUserNotifications(testUserId);
                });
                expect(mockSubscribeToNotifications).toHaveBeenCalledTimes(1);
                // Ensure the callback passed is indeed a function
                expect(mockSubscribeToNotifications).toHaveBeenCalledWith(testUserId, expect.any(Function));
                // Check if the callback was captured by our mock setup
                expect(capturedNotificationCallback).toBeInstanceOf(Function);
                 // Check if store logs success/debug info
                 // --- Updated Assertion: Expect metadata object (Check both info logs) ---
                 expect(logger.info).toHaveBeenCalledWith('[NotificationStore] Subscribing to notifications for user:', { userId: testUserId });
                 // Check the success log which happens *after* the API call returns the channel
                 expect(logger.info).toHaveBeenCalledWith('[NotificationStore] Successfully subscribed to notification channel for user:', { userId: testUserId });
            });

            it('should handle potential errors during subscription (e.g., API returns null)', () => {
                 // Simulate API returning null instead of a channel
                 mockSubscribeToNotifications.mockImplementation(
                     (userId: string, callback: (notification: Notification) => void) => {
                          // Simulate the API client logging its own error/debug message
                          // logger.error('Mock API: Subscription failed, returning null');
                          return null; // Simulate failure
                      }
                 );

                 act(() => {
                     useNotificationStore.getState().subscribeToUserNotifications(testUserId);
                 });

                 expect(mockSubscribeToNotifications).toHaveBeenCalledTimes(1);
                 // Assert store logged the error
                 // --- Updated Assertion: Expect metadata object ---
                 expect(logger.error).toHaveBeenCalledWith('[NotificationStore] Failed to subscribe to notifications, API returned null channel for user:', { userId: testUserId });
                 // Assert error state is not set unless intended (subscription failure might not set global error)
                 expect(useNotificationStore.getState().error).toBeNull();
            });

            it('should prevent multiple subscriptions by unsubscribing first', () => {
                 // --- Updated logger expectation ---
                 // First call
                 act(() => {
                     useNotificationStore.getState().subscribeToUserNotifications(testUserId);
                 });
                 expect(mockSubscribeToNotifications).toHaveBeenCalledTimes(1);
                 expect(mockUnsubscribeFromNotifications).not.toHaveBeenCalled();
                 // Check initial subscription logs
                 expect(logger.info).toHaveBeenCalledWith('[NotificationStore] Subscribing to notifications for user:', { userId: testUserId });
                 expect(logger.info).toHaveBeenCalledWith('[NotificationStore] Successfully subscribed to notification channel for user:', { userId: testUserId });

                 // Second call for the same user
                  act(() => {
                      useNotificationStore.getState().subscribeToUserNotifications(testUserId);
                  });
                  // --- Corrected Assertion: Match the actual log message from the store ---
                  expect(logger.warn).toHaveBeenCalledWith('[NotificationStore] Already subscribed to notifications for user:', { userId: testUserId });
                  // Ensure unsubscribe was NOT called because the store returns early
                  expect(mockUnsubscribeFromNotifications).not.toHaveBeenCalled();
                  // Subscribe should NOT be called again
                  expect(mockSubscribeToNotifications).toHaveBeenCalledTimes(1);
             });

             it('should unsubscribe previous subscription if subscribing for a different user', () => {
                const firstUserId = 'user-abc';
                const secondUserId = 'user-xyz';

                // Subscribe first user
                act(() => { useNotificationStore.getState().subscribeToUserNotifications(firstUserId); });
                expect(mockSubscribeToNotifications).toHaveBeenCalledTimes(1);
                expect(mockSubscribeToNotifications).toHaveBeenCalledWith(firstUserId, expect.any(Function));
                expect(mockUnsubscribeFromNotifications).not.toHaveBeenCalled();

                 // Subscribe second user
                 act(() => { useNotificationStore.getState().subscribeToUserNotifications(secondUserId); });
                 // --- Updated Assertion: Check the specific log message and metadata ---
                 expect(logger.info).toHaveBeenCalledWith('[NotificationStore] Switching subscription from user user-abc to user-xyz');
                 // Should unsubscribe the first user
                 expect(mockUnsubscribeFromNotifications).toHaveBeenCalledTimes(1);
                 // Should subscribe the second user
                 expect(mockSubscribeToNotifications).toHaveBeenCalledTimes(2);
                 expect(mockSubscribeToNotifications).toHaveBeenCalledWith(secondUserId, expect.any(Function));
            });

            it('should log an error and not call API if userId is missing', () => {
                 act(() => {
                     useNotificationStore.getState().subscribeToUserNotifications(''); // Pass empty userId
                 });
                 expect(mockSubscribeToNotifications).not.toHaveBeenCalled();
                 // Assert logger.error was called
                 expect(logger.error).toHaveBeenCalledWith('User ID is required to subscribe to notifications.');
            });
        });

        describe('unsubscribeFromUserNotifications', () => {
             it('should call api.notifications().unsubscribeFromNotifications if subscribed', () => {
                 // Simulate being subscribed first
                 act(() => {
                     useNotificationStore.getState().subscribeToUserNotifications('user-123');
                 });
                 expect(mockSubscribeToNotifications).toHaveBeenCalledTimes(1); // Ensure setup worked

                 // Now unsubscribe
                 act(() => {
                     useNotificationStore.getState().unsubscribeFromUserNotifications();
                 });
                 expect(mockUnsubscribeFromNotifications).toHaveBeenCalledTimes(1);
                 expect(logger.info).toHaveBeenCalledWith('Unsubscribing from notifications.');
             });

             it('should not call API and log debug if not currently subscribed', () => {
                 // Call unsubscribe without subscribing first
                 act(() => {
                     useNotificationStore.getState().unsubscribeFromUserNotifications();
                 });
                 expect(mockUnsubscribeFromNotifications).not.toHaveBeenCalled();
                 // Assert logger.debug call
                 expect(logger.debug).toHaveBeenCalledWith('Not currently subscribed to notifications, skipping unsubscribe.');
             });
        });

        // --- NEW: Test Suite for the Callback Handling ---
        describe('handleIncomingNotification (Realtime Callback)', () => {
             const testUserId = 'user-456';

             beforeEach(() => {
                 // Ensure subscription is set up and callback is captured
                 act(() => {
                     useNotificationStore.getState().subscribeToUserNotifications(testUserId);
                 });
                 // Verify setup
                 if (typeof capturedNotificationCallback !== 'function') {
                     throw new Error("Test setup failed: Notification callback not captured.");
                 }
                 // Reset state for clean test
                 act(() => {
                    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
                 });
                 // Clear spy mocks for addNotification if used in other tests
                 vi.restoreAllMocks();
             });

             it('should call addNotification when the captured callback is invoked with a valid notification', () => {
                 // Spy on the store's actual addNotification method
                 const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                 // Simulate the API layer invoking the captured callback
                 act(() => {
                     capturedNotificationCallback!(mockNotification1); // Pass a valid notification
                 });

                 expect(addNotificationSpy).toHaveBeenCalledTimes(1);
                 expect(addNotificationSpy).toHaveBeenCalledWith(mockNotification1);

                 // Check the state updated by addNotification
                 const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification1]); // Prepended
                 expect(state.unreadCount).toBe(1); // Incremented

                 addNotificationSpy.mockRestore(); // Clean up spy
             });

              it('should handle multiple notifications arriving via callback', () => {
                 const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                 // Simulate multiple arrivals
                 act(() => { capturedNotificationCallback!(mockNotification1); });
                 act(() => { capturedNotificationCallback!(mockNotification2); }); // mock2 is newer

                 expect(addNotificationSpy).toHaveBeenCalledTimes(2);
                 expect(addNotificationSpy).toHaveBeenCalledWith(mockNotification1);
                 expect(addNotificationSpy).toHaveBeenCalledWith(mockNotification2);

                 // Check the state updated by addNotification (should be reversed order due to prepend)
                 const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification2, mockNotification1]); // mock2 prepended after mock1
                 expect(state.unreadCount).toBe(2); // Both were unread

                 addNotificationSpy.mockRestore(); // Clean up spy
             });

             it('should log a warning if the callback payload is invalid or missing data', () => {
                  const addNotificationSpy = vi.spyOn(useNotificationStore.getState(), 'addNotification');

                  act(() => { capturedNotificationCallback!(null as any); });
                  act(() => { capturedNotificationCallback!({} as Notification); });
                  act(() => { capturedNotificationCallback!({ id: 'only-id' } as Notification); });
                  // Add a case missing user_id
                  act(() => { capturedNotificationCallback!({ id: 'valid-id', type: 'test', created_at: new Date().toISOString() } as Notification); });

                  expect(addNotificationSpy).not.toHaveBeenCalled(); // Should still not be called
                  // Check warnings (now using 'payload')
                  // --- Corrected Assertion: Expect 'undefined/null' string for the null case ---
                  expect(logger.warn).toHaveBeenCalledWith('[NotificationStore] Received invalid notification data from subscription.', { payload: 'undefined/null' });
                  expect(logger.warn).toHaveBeenCalledWith('[NotificationStore] Received invalid notification data from subscription.', { payload: {} });
                  expect(logger.warn).toHaveBeenCalledWith('[NotificationStore] Received invalid notification data from subscription.', { payload: { id: 'only-id' } });
                  expect(logger.warn).toHaveBeenCalledWith('[NotificationStore] Received invalid notification data from subscription.', { payload: { id: 'valid-id', type: 'test', created_at: expect.any(String) } });

                  const state = useNotificationStore.getState();
                  expect(state.notifications).toEqual([]);
                  expect(state.unreadCount).toBe(0);

                  addNotificationSpy.mockRestore();
             });
        });
    }); // End Actions describe
}); // End notificationStore describe 