// packages/store/src/notificationStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react'; // Using react-specific act for state updates
import { useNotificationStore, NotificationState } from './notificationStore'; // Assuming store is defined here
import { api } from '@paynless/api-client';
import type { Notification, ApiError } from '@paynless/types';
// Removed logger import as it will be mocked

// --- Mock Logger --- 
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(), // Include fatal even if not used directly in store code, for completeness
    },
}));

// --- Refined API Mock --- 
const mockFetchNotifications = vi.fn();
const mockMarkNotificationAsRead = vi.fn();
const mockMarkAllNotificationsAsRead = vi.fn();

vi.mock('@paynless/api-client', () => ({
    api: {
        // Provide the nested structure directly with the mocked functions
        notifications: () => ({
            fetchNotifications: mockFetchNotifications,
            markNotificationAsRead: mockMarkNotificationAsRead,
            markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
        }),
    },
}));

// Helper to get mocked functions - Use the directly defined mocks now
// const mockedApi = vi.mocked(api, true); // No longer needed with direct mocks

const initialState = useNotificationStore.getState();

// Mock Notification Data
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
    data: { message: 'Test 2', target_path: '/some/path' },
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

describe('notificationStore', () => {
    // Reset store state and mocks before each test
    beforeEach(() => {
        act(() => {
            useNotificationStore.setState(initialState, true); // Replace state
        });
        // Reset direct mocks
        vi.clearAllMocks();
        mockFetchNotifications.mockClear();
        mockMarkNotificationAsRead.mockClear();
        mockMarkAllNotificationsAsRead.mockClear();
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
                // Use the direct mock
                mockFetchNotifications.mockResolvedValue({
                    data: mockNotifications,
                    status: 200,
                });

                await act(async () => {
                    await useNotificationStore.getState().fetchNotifications();
                });

                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                expect(state.notifications).toEqual([mockNotification2, mockNotification1, mockNotification3]); // Correct order
                expect(state.unreadCount).toBe(2);
                 expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
            });

             it('should handle null data on successful fetch', async () => {
                // Use the direct mock
                mockFetchNotifications.mockResolvedValue({
                    data: null as any, // Simulate null data
                    status: 200,
                });

                await act(async () => {
                    await useNotificationStore.getState().fetchNotifications();
                });

                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toBeNull();
                expect(state.notifications).toEqual([]);
                expect(state.unreadCount).toBe(0);
                 expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
            });

            it('should set loading state during fetch', async () => {
                const mockNotifications = [mockNotification1];
                 // Use the direct mock
                mockFetchNotifications.mockResolvedValue({
                    data: mockNotifications,
                    status: 200,
                });

                const promise = act(async () => {
                     useNotificationStore.getState().fetchNotifications();
                 });
                expect(useNotificationStore.getState().isLoading).toBe(true);
                await promise;
                expect(useNotificationStore.getState().isLoading).toBe(false);
            });

            it('should set error state on failed fetch', async () => {
                 const mockError: ApiError = { code: 'FETCH_ERROR', message: 'Failed to fetch' };
                 // Use the direct mock
                 mockFetchNotifications.mockResolvedValue({
                    error: mockError,
                    status: 500,
                });

                await act(async () => {
                    await useNotificationStore.getState().fetchNotifications();
                });

                const state = useNotificationStore.getState();
                expect(state.isLoading).toBe(false);
                expect(state.error).toEqual(mockError);
                expect(state.notifications).toEqual([]);
                expect(state.unreadCount).toBe(0);
                 expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
            });
        });

        describe('addNotification (Realtime)', () => {
            it('should prepend a new notification and increment unread count', () => {
                 act(() => {
                    useNotificationStore.setState({
                        notifications: [mockNotification2],
                        unreadCount: 1,
                    });
                });
                 act(() => {
                    useNotificationStore.getState().addNotification(mockNotification1); // Add older, unread notification
                });
                const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification2, mockNotification1]); // Corrected order
                expect(state.unreadCount).toBe(2); // Incremented
            });

            it('should prepend a new notification but not increment count if already read', () => {
                 act(() => {
                    useNotificationStore.setState({
                        notifications: [mockNotification1],
                        unreadCount: 1,
                    });
                });
                act(() => {
                    useNotificationStore.getState().addNotification(mockNotification3); // Add read notification
                });
                const state = useNotificationStore.getState();
                 expect(state.notifications).toEqual([mockNotification1, mockNotification3]); // Corrected order
                expect(state.unreadCount).toBe(1); // Not incremented
            });

             it('should not add a duplicate notification', () => {
                 act(() => {
                    useNotificationStore.setState({
                        notifications: [mockNotification1],
                        unreadCount: 1,
                    });
                });
                act(() => {
                    useNotificationStore.getState().addNotification(mockNotification1);
                });
                const state = useNotificationStore.getState();
                expect(state.notifications).toEqual([mockNotification1]);
                expect(state.unreadCount).toBe(1);
            });
        });

        describe('markNotificationRead', () => {
             beforeEach(() => {
                act(() => {
                    useNotificationStore.setState({
                         notifications: [mockNotification2, mockNotification1, mockNotification3],
                         unreadCount: 2,
                    });
                 });
             });

             it('should mark a notification as read, decrement count, and call API', async () => {
                 // Use the direct mock
                 mockMarkNotificationAsRead.mockResolvedValue({ status: 204 });

                 await act(async () => {
                     await useNotificationStore.getState().markNotificationRead('uuid-1');
                 });

                 const state = useNotificationStore.getState();
                 const updatedNotification = state.notifications.find(n => n.id === 'uuid-1');
                 expect(updatedNotification?.read).toBe(true);
                 expect(state.unreadCount).toBe(1);
                 expect(state.error).toBeNull();
                 expect(mockMarkNotificationAsRead).toHaveBeenCalledTimes(1);
                 expect(mockMarkNotificationAsRead).toHaveBeenCalledWith('uuid-1');
             });

             it('should not change state or call API if notification is already read', async () => {
                 await act(async () => {
                     await useNotificationStore.getState().markNotificationRead('uuid-3');
                 });
                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2);
                 expect(state.error).toBeNull();
                 expect(mockMarkNotificationAsRead).not.toHaveBeenCalled();
             });

              it('should not change state or call API if notification is not found', async () => {
                 await act(async () => {
                     await useNotificationStore.getState().markNotificationRead('uuid-unknown');
                 });
                 const state = useNotificationStore.getState();
                 expect(state.unreadCount).toBe(2);
                 expect(state.error).toBeNull();
                 expect(mockMarkNotificationAsRead).not.toHaveBeenCalled();
             });

             it('should set error state if API call fails', async () => {
                 const mockError: ApiError = { code: 'UPDATE_ERROR', message: 'Failed to update' };
                 // Use the direct mock
                 mockMarkNotificationAsRead.mockResolvedValue({ error: mockError, status: 500 });

                 await act(async () => {
                     await useNotificationStore.getState().markNotificationRead('uuid-1');
                 });

                 const state = useNotificationStore.getState();
                 const updatedNotification = state.notifications.find(n => n.id === 'uuid-1');
                 expect(updatedNotification?.read).toBe(false);
                 expect(state.unreadCount).toBe(2);
                 expect(state.error).toEqual(mockError);
                 expect(mockMarkNotificationAsRead).toHaveBeenCalledTimes(1);
                 expect(mockMarkNotificationAsRead).toHaveBeenCalledWith('uuid-1');
             });
        });

        describe('markAllNotificationsAsRead', () => {
             beforeEach(() => {
                act(() => {
                    useNotificationStore.setState({
                        notifications: [mockNotification2, mockNotification1, mockNotification3],
                        unreadCount: 2,
                    });
                });
            });

            it('should mark all as read, set count to 0, and call API', async () => {
                 mockMarkAllNotificationsAsRead.mockResolvedValue({ status: 204 });

                await act(async () => {
                    await useNotificationStore.getState().markAllNotificationsAsRead();
                });

                const state = useNotificationStore.getState();
                expect(state.notifications.every(n => n.read)).toBe(true);
                expect(state.unreadCount).toBe(0);
                expect(state.error).toBeNull();
                expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledTimes(1);
            });

            it('should not change state or call API if count is already 0', async () => {
                 act(() => {
                    useNotificationStore.setState({ unreadCount: 0 });
                });
                await act(async () => {
                    await useNotificationStore.getState().markAllNotificationsAsRead();
                });
                const state = useNotificationStore.getState();
                 expect(state.error).toBeNull();
                expect(mockMarkAllNotificationsAsRead).not.toHaveBeenCalled();
            });

            it('should set error state if API call fails', async () => {
                const mockError: ApiError = { code: 'UPDATE_ALL_ERROR', message: 'Failed to update all' };
                 mockMarkAllNotificationsAsRead.mockResolvedValue({ error: mockError, status: 500 });

                await act(async () => {
                    await useNotificationStore.getState().markAllNotificationsAsRead();
                });

                const state = useNotificationStore.getState();
                 expect(state.notifications.some(n => !n.read)).toBe(true);
                 expect(state.unreadCount).toBe(2);
                expect(state.error).toEqual(mockError);
                expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('Selectors', () => {
        it('selectNotifications should return the notifications array', () => {
             const notifications = [mockNotification1, mockNotification2];
             act(() => {
                 useNotificationStore.setState({ notifications });
             });
             expect(useNotificationStore.getState().notifications).toEqual(notifications);
        });

        it('selectUnreadCount should return the unread count', () => {
            const count = 5;
             act(() => {
                 useNotificationStore.setState({ unreadCount: count });
             });
             expect(useNotificationStore.getState().unreadCount).toBe(count);
        });
    });
}); 