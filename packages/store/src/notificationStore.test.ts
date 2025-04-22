// packages/store/src/notificationStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNotificationStore, NotificationState } from './notificationStore'; // Will fail initially
import { api } from '@paynless/api-client'; // Mock this
import { Notification } from '@paynless/types';

// Mock the API client
vi.mock('@paynless/api-client', () => ({
  api: {
    notifications: {
      fetchNotifications: vi.fn(),
      markNotificationAsRead: vi.fn(),
      markAllNotificationsAsRead: vi.fn(),
    },
  },
}));

// Helper to reset store state before each test
const resetStore = () => useNotificationStore.setState(useNotificationStore.getInitialState());

describe('notificationStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockNotification1: Notification = { id: 'n1', type: 'test', read: false, user_id: 'u1', created_at: new Date(Date.now() - 1000).toISOString(), data: {} };
  const mockNotification2: Notification = { id: 'n2', type: 'test', read: true, user_id: 'u1', created_at: new Date(Date.now() - 2000).toISOString(), data: {} };
  const mockNotification3: Notification = { id: 'n3', type: 'test', read: false, user_id: 'u1', created_at: new Date(Date.now() - 500).toISOString(), data: {} };

  it('should have correct initial state', () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  // --- Actions ---

  describe('fetchNotifications', () => {
    it('should fetch and set notifications, updating unread count', async () => {
      const notifications = [mockNotification1, mockNotification2]; // 1 unread
      vi.mocked(api.notifications.fetchNotifications).mockResolvedValue({ status: 200, data: notifications });

      await useNotificationStore.getState().fetchNotifications();

      const state = useNotificationStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.notifications).toEqual(notifications);
      expect(state.unreadCount).toBe(1);
      expect(state.error).toBeNull();
      expect(api.notifications.fetchNotifications).toHaveBeenCalledTimes(1);
    });

     it('should handle empty fetch result', async () => {
       vi.mocked(api.notifications.fetchNotifications).mockResolvedValue({ status: 200, data: [] });

       await useNotificationStore.getState().fetchNotifications();

       const state = useNotificationStore.getState();
       expect(state.isLoading).toBe(false);
       expect(state.notifications).toEqual([]);
       expect(state.unreadCount).toBe(0);
       expect(state.error).toBeNull();
     });

    it('should set loading state during fetch', async () => {
      vi.mocked(api.notifications.fetchNotifications).mockResolvedValue({ status: 200, data: [] });
      const promise = useNotificationStore.getState().fetchNotifications();
      expect(useNotificationStore.getState().isLoading).toBe(true);
      await promise;
      expect(useNotificationStore.getState().isLoading).toBe(false);
    });

    it('should set error state on fetch failure', async () => {
      const error = { message: 'Failed to fetch' };
      vi.mocked(api.notifications.fetchNotifications).mockResolvedValue({ status: 500, error });

      await useNotificationStore.getState().fetchNotifications();

      const state = useNotificationStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.error).toEqual(error.message); // Store likely stores just the message
      expect(api.notifications.fetchNotifications).toHaveBeenCalledTimes(1);
    });
  });

   describe('addNotification', () => {
     it('should prepend a new notification and increment unread count if unread', () => {
       useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 });
       const newNotification = mockNotification3; // Unread

       useNotificationStore.getState().addNotification(newNotification);

       const state = useNotificationStore.getState();
       expect(state.notifications).toEqual([newNotification, mockNotification1]);
       expect(state.unreadCount).toBe(2);
     });

     it('should prepend a new notification and not increment unread count if read', () => {
        useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 });
       const newNotification = { ...mockNotification3, read: true }; // Read

       useNotificationStore.getState().addNotification(newNotification);

       const state = useNotificationStore.getState();
       expect(state.notifications).toEqual([newNotification, mockNotification1]);
       expect(state.unreadCount).toBe(1); // Stays the same
     });

      it('should not add a duplicate notification', () => {
        useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 });

        useNotificationStore.getState().addNotification(mockNotification1); // Add existing one

        const state = useNotificationStore.getState();
        // State should remain unchanged
        expect(state.notifications).toEqual([mockNotification1]);
        expect(state.unreadCount).toBe(1);
      });
   });

   describe('markAsRead', () => {
    it('should mark a specific notification as read and decrement unread count', async () => {
       useNotificationStore.setState({ notifications: [mockNotification1, mockNotification3], unreadCount: 2 }); // Both unread
       vi.mocked(api.notifications.markNotificationAsRead).mockResolvedValue({ status: 200 });

       await useNotificationStore.getState().markAsRead(mockNotification1.id);

       const state = useNotificationStore.getState();
       expect(state.notifications.find(n => n.id === mockNotification1.id)?.read).toBe(true);
       expect(state.unreadCount).toBe(1);
       expect(state.error).toBeNull();
       expect(api.notifications.markNotificationAsRead).toHaveBeenCalledWith(mockNotification1.id);
    });

    it('should not change count if marking an already read notification', async () => {
       useNotificationStore.setState({ notifications: [mockNotification2], unreadCount: 0 }); // Already read
        vi.mocked(api.notifications.markNotificationAsRead).mockResolvedValue({ status: 200 });

       await useNotificationStore.getState().markAsRead(mockNotification2.id);

       const state = useNotificationStore.getState();
       expect(state.notifications.find(n => n.id === mockNotification2.id)?.read).toBe(true);
       expect(state.unreadCount).toBe(0);
       expect(api.notifications.markNotificationAsRead).toHaveBeenCalledWith(mockNotification2.id);
    });

     it('should handle API error when marking as read', async () => {
       useNotificationStore.setState({ notifications: [mockNotification1], unreadCount: 1 });
       const error = { message: 'API Error' };
       vi.mocked(api.notifications.markNotificationAsRead).mockResolvedValue({ status: 500, error });

       await useNotificationStore.getState().markAsRead(mockNotification1.id);

       const state = useNotificationStore.getState();
       expect(state.notifications.find(n => n.id === mockNotification1.id)?.read).toBe(false); // State not changed
       expect(state.unreadCount).toBe(1);
       expect(state.error).toBe(error.message);
     });
   });

    describe('markAllAsRead', () => {
     it('should mark all notifications as read and set unread count to 0', async () => {
       useNotificationStore.setState({ notifications: [mockNotification1, mockNotification2, mockNotification3], unreadCount: 2 }); // 2 unread
       vi.mocked(api.notifications.markAllNotificationsAsRead).mockResolvedValue({ status: 200 });

       await useNotificationStore.getState().markAllAsRead();

       const state = useNotificationStore.getState();
       expect(state.notifications.every(n => n.read)).toBe(true);
       expect(state.unreadCount).toBe(0);
       expect(state.error).toBeNull();
       expect(api.notifications.markAllNotificationsAsRead).toHaveBeenCalledTimes(1);
     });

      it('should handle API error when marking all as read', async () => {
       useNotificationStore.setState({ notifications: [mockNotification1, mockNotification3], unreadCount: 2 });
       const error = { message: 'API Error' };
       vi.mocked(api.notifications.markAllNotificationsAsRead).mockResolvedValue({ status: 500, error });

       await useNotificationStore.getState().markAllAsRead();

       const state = useNotificationStore.getState();
       expect(state.notifications.some(n => !n.read)).toBe(true); // State not changed
       expect(state.unreadCount).toBe(2);
       expect(state.error).toBe(error.message);
     });
    });

     describe('clearError', () => {
        it('should clear the error state', () => {
            useNotificationStore.setState({ error: 'Some error' });
            expect(useNotificationStore.getState().error).toBe('Some error');

            useNotificationStore.getState().clearError();
            expect(useNotificationStore.getState().error).toBeNull();
        });
    });

}); 