import { create } from 'zustand';
import { api } from '@paynless/api-client';
import type { Notification, ApiError } from '@paynless/types';
import { logger } from '@paynless/utils'; // Import logger

// Define state structure
export interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    error: ApiError | null;
    fetchNotifications: () => Promise<void>;
    addNotification: (notification: Notification) => void; // For Realtime updates
    markNotificationRead: (notificationId: string) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
    // Optional: clearError action could be added if needed by UI
}

// Helper function to calculate unread count
const calculateUnreadCount = (notifications: Notification[]): number => {
    return notifications.filter(n => !n.read).length;
};

// Helper function to sort notifications (newest first)
const sortNotifications = (notifications: Notification[]): Notification[] => {
    return [...notifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
    // Initial state
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,

    // Actions
    fetchNotifications: async () => {
        set({ isLoading: true, error: null });
        try {
            // --- Debug Check --- 
            const notificationApi = api.notifications();
            if (!notificationApi) {
                logger.error('[notificationStore] api.notifications() returned undefined!');
                throw new Error('Internal Test Error: api.notifications() is undefined');
            }
            // --- End Debug Check ---
            const response = await notificationApi.fetchNotifications();
            // --- Add check for response itself --- 
            if (response === undefined) {
                 logger.error('[notificationStore] fetchNotifications response is undefined!');
                 throw new Error('Internal Test Error: fetchNotifications resolved to undefined');
            }
            // --- End check ---
            if (response.error) {
                logger.error('[notificationStore] Failed to fetch notifications', { error: response.error });
                set({ error: response.error, isLoading: false, notifications: [], unreadCount: 0 });
            } else {
                const fetchedNotifications = response.data ?? [];
                const sortedNotifications = sortNotifications(fetchedNotifications);
                const unreadCount = calculateUnreadCount(sortedNotifications);
                logger.info(`[notificationStore] Fetched ${sortedNotifications.length} notifications, ${unreadCount} unread.`);
                set({
                    notifications: sortedNotifications,
                    unreadCount: unreadCount,
                    isLoading: false,
                    error: null,
                });
            }
        } catch (err: any) {
            logger.error('[notificationStore] Unexpected error fetching notifications', { error: err });
            const error: ApiError = { code: 'UNEXPECTED_ERROR', message: err.message || 'An unexpected error occurred' };
            set({ error, isLoading: false, notifications: [], unreadCount: 0 });
        }
    },

    addNotification: (notification) => {
        set(state => {
            // Prevent duplicates
            if (state.notifications.some(n => n.id === notification.id)) {
                logger.warn('[notificationStore] Attempted to add duplicate notification', { id: notification.id });
                return state;
            }

            const newNotifications = sortNotifications([notification, ...state.notifications]);
            const newUnreadCount = calculateUnreadCount(newNotifications);
            logger.info('[notificationStore] Added new notification via Realtime', { id: notification.id });
            return { notifications: newNotifications, unreadCount: newUnreadCount };
        });
    },

    markNotificationRead: async (notificationId) => {
        const currentNotifications = get().notifications;
        const notification = currentNotifications.find(n => n.id === notificationId);

        if (!notification || notification.read) {
            if (!notification) logger.warn('[notificationStore] markNotificationRead: Notification not found', { notificationId });
            // if (notification?.read) logger.info('[notificationStore] markNotificationRead: Notification already read', { notificationId });
            return; // Don't call API if not found or already read
        }

        // No optimistic update based on test requirements - update state after API call
        set({ error: null }); // Clear previous errors
        try {
            // --- Debug Check --- 
            const notificationApi = api.notifications();
            if (!notificationApi) {
                logger.error('[notificationStore] api.notifications() returned undefined!');
                throw new Error('Internal Test Error: api.notifications() is undefined');
            }
            // --- End Debug Check ---
            const response = await notificationApi.markNotificationAsRead(notificationId);
             // --- Add check for response itself --- 
            if (response === undefined) {
                 logger.error('[notificationStore] markNotificationRead response is undefined!');
                 throw new Error('Internal Test Error: markNotificationRead resolved to undefined');
            }
            // --- End check ---
            if (response.error) {
                 logger.error('[notificationStore] Failed to mark notification as read', { notificationId, error: response.error });
                 set({ error: response.error });
            } else {
                // API call succeeded, now update state
                 logger.info('[notificationStore] Marked notification as read', { notificationId });
                set(state => {
                    const updatedNotifications = state.notifications.map(n =>
                        n.id === notificationId ? { ...n, read: true } : n
                    );
                    const newUnreadCount = calculateUnreadCount(updatedNotifications);
                    return {
                        notifications: updatedNotifications,
                        unreadCount: newUnreadCount,
                        error: null // Ensure error is cleared on success
                    };
                });
            }
        } catch (err: any) {
             logger.error('[notificationStore] Unexpected error marking notification as read', { notificationId, error: err });
            const error: ApiError = { code: 'UNEXPECTED_ERROR', message: err.message || 'An unexpected error occurred' };
            set({ error });
        }
    },

    markAllNotificationsAsRead: async () => {
        if (get().unreadCount === 0) {
            // logger.info('[notificationStore] markAllNotificationsRead: No unread notifications.');
            return; // Don't call API if nothing is unread
        }

        set({ error: null }); // Clear previous errors
        try {
            // --- Debug Check --- 
            const notificationApi = api.notifications();
            if (!notificationApi) {
                logger.error('[notificationStore] api.notifications() returned undefined!');
                throw new Error('Internal Test Error: api.notifications() is undefined');
            }
            // --- End Debug Check ---
            const response = await notificationApi.markAllNotificationsAsRead();
             // --- Add check for response itself --- 
            if (response === undefined) {
                 logger.error('[notificationStore] markAllNotificationsRead response is undefined!');
                 throw new Error('Internal Test Error: markAllNotificationsRead resolved to undefined');
            }
            // --- End check ---
             if (response.error) {
                 logger.error('[notificationStore] Failed to mark all notifications as read', { error: response.error });
                 set({ error: response.error });
            } else {
                // API call succeeded, now update state
                 logger.info('[notificationStore] Marked all notifications as read');
                set(state => ({
                    notifications: state.notifications.map(n => ({ ...n, read: true })),
                    unreadCount: 0,
                    error: null // Ensure error is cleared on success
                }));
            }
        } catch (err: any) {
             logger.error('[notificationStore] Unexpected error marking all notifications as read', { error: err });
            const error: ApiError = { code: 'UNEXPECTED_ERROR', message: err.message || 'An unexpected error occurred' };
            set({ error });
        }
    },
})); 