import { create } from 'zustand';
import { api } from '@paynless/api';
import type { Notification, ApiError, DialecticLifecycleEvent } from '@paynless/types';
import { logger, isDialecticLifecycleEventType, isDialecticContribution, isApiError } from '@paynless/utils';
import { useDialecticStore } from './dialecticStore';
import { useWalletStore } from './walletStore';

// Define state structure
export interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    error: ApiError | null;
    // --- NEW: State for Realtime Subscription ---
    subscribedUserId: string | null;
    // -------------------------------------------
    fetchNotifications: () => Promise<void>;
    addNotification: (notification: Notification) => void; // For incoming Realtime updates
    markNotificationRead: (notificationId: string) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
    // --- NEW: Actions for Realtime Subscription ---
    subscribeToUserNotifications: (userId: string) => void;
    unsubscribeFromUserNotifications: () => void;
    // --------------------------------------------
    // Exposed for testing, but considered internal
    handleIncomingNotification: (notification: Notification) => void;
}

// Helper function to calculate unread count
const calculateUnreadCount = (notifications: Notification[]): number => {
    return notifications.filter(n => !n.read).length;
};

// Helper function to sort notifications (newest first)
const sortNotifications = (notifications: Notification[]): Notification[] => {
    return [...notifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const useNotificationStore = create<NotificationState>((set, get) => {

    // --- NEW: Internal Realtime Callback Handler ---
    const handleIncomingNotification = (notification: Notification | null | undefined) => {
        logger.info('[NotificationStore] Raw incoming notification from Supabase Realtime:', { notification });
        if (!notification || !notification.id || !notification.user_id || !notification.type) {
            logger.warn('[NotificationStore] Received invalid notification data from subscription.', { payload: notification ?? 'undefined/null' });
            return;
        }
        logger.debug('[NotificationStore] Received notification via Realtime', { id: notification.id, type: notification.type });

        // --- NEW: Simplified Routing Logic ---
        if (notification.is_internal_event) {
            logger.info(`[NotificationStore] Routing internal event: ${notification.type}`, { data: notification.data });
            // Map other_generation_failed -> contribution_generation_failed for store routing
            if (notification.type === 'other_generation_failed') {
                const data = notification.data;
                if (data && typeof (data)['sessionId'] === 'string' && isApiError((data)['error'])) {
                    const eventPayload: DialecticLifecycleEvent = {
                        type: 'contribution_generation_failed',
                        sessionId: (data)['sessionId'],
                        error: (data)['error'],
                        job_id: typeof (data)['job_id'] === 'string' ? (data)['job_id'] : undefined,
                    };
                    useDialecticStore.getState()._handleDialecticLifecycleEvent?.(eventPayload);
                } else {
                    logger.warn(`[NotificationStore] Internal event 'other_generation_failed' received, but its data payload did not match the expected format.`, { data });
                }
                return;
            }

            if (isDialecticLifecycleEventType(notification.type)) {
                if (notification.data) {
                    let eventPayload: DialecticLifecycleEvent | null = null;
                    const { type, data } = notification;

                    // This switch is for type-safe payload construction.
                    switch (type) {
                        case 'contribution_generation_started':
                            if (typeof data['sessionId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['iterationNumber'] === 'number' && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], modelId: data['modelId'], iterationNumber: data['iterationNumber'], job_id: data['job_id'] };
                            }
                            break;
                        case 'dialectic_contribution_started':
                             if (typeof data['sessionId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['iterationNumber'] === 'number' && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], modelId: data['modelId'], iterationNumber: data['iterationNumber'], job_id: data['job_id'] };
                            }
                            break;
                        case 'contribution_generation_retrying':
                             if (typeof data['sessionId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['iterationNumber'] === 'number' && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], modelId: data['modelId'], iterationNumber: data['iterationNumber'], job_id: data['job_id'], error: typeof data['error'] === 'string' ? data['error'] : undefined };
                            }
                            break;
                        case 'dialectic_contribution_received':
                             if (typeof data['sessionId'] === 'string' && typeof data['job_id'] === 'string' && isDialecticContribution(data['contribution'])) {
                                eventPayload = { 
                                    type, 
                                    sessionId: data['sessionId'], 
                                    contribution: data['contribution'],
                                    job_id: data['job_id'],
                                    is_continuing: typeof data['is_continuing'] === 'boolean' ? data['is_continuing'] : false,
                                };
                            }
                            break;
                        case 'contribution_generation_failed':
                             if (typeof data['sessionId'] === 'string' && isApiError(data['error'])) {
                                eventPayload = { type, sessionId: data['sessionId'], error: data['error'], job_id: typeof data['job_id'] === 'string' ? data['job_id'] : undefined, modelId: typeof data['modelId'] === 'string' ? data['modelId'] : undefined };
                            }
                            break;
                        case 'contribution_generation_complete':
                            if (typeof data['sessionId'] === 'string' && typeof data['projectId'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], projectId: data['projectId'] };
                            }
                            break;
                        case 'dialectic_progress_update':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['current_step'] === 'number' &&
                                typeof data['total_steps'] === 'number' &&
                                typeof data['message'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    current_step: data['current_step'],
                                    total_steps: data['total_steps'],
                                    message: data['message'],
                                };
                            }
                            break;
                        case 'planner_started':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                };
                            }
                            break;
                        case 'document_started':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                };
                            }
                            break;
                        case 'document_chunk_completed':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    isFinalChunk: typeof data['isFinalChunk'] === 'boolean' ? data['isFinalChunk'] : undefined,
                                    continuationNumber: typeof data['continuationNumber'] === 'number' ? data['continuationNumber'] : undefined,
                                };
                            }
                            break;
                        case 'render_completed':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string' &&
                                typeof data['latestRenderedResourceId'] === 'string'
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    latestRenderedResourceId: data['latestRenderedResourceId'],
                                };
                            }
                            break;
                        case 'job_failed':
                            if (
                                typeof data['sessionId'] === 'string' &&
                                typeof data['stageSlug'] === 'string' &&
                                typeof data['iterationNumber'] === 'number' &&
                                typeof data['job_id'] === 'string' &&
                                typeof data['document_key'] === 'string' &&
                                typeof data['modelId'] === 'string' &&
                                isApiError(data['error'])
                            ) {
                                eventPayload = {
                                    type,
                                    sessionId: data['sessionId'],
                                    stageSlug: data['stageSlug'],
                                    iterationNumber: data['iterationNumber'],
                                    job_id: data['job_id'],
                                    document_key: data['document_key'],
                                    modelId: data['modelId'],
                                    step_key: typeof data['step_key'] === 'string' ? data['step_key'] : undefined,
                                    error: data['error'],
                                };
                            }
                            break;
                        case 'contribution_generation_continued':
                             if (typeof data['sessionId'] === 'string' && typeof data['projectId'] === 'string' && typeof data['modelId'] === 'string' && typeof data['continuationNumber'] === 'number' && isDialecticContribution(data['contribution']) && typeof data['job_id'] === 'string') {
                                eventPayload = { type, sessionId: data['sessionId'], projectId: data['projectId'], modelId: data['modelId'], continuationNumber: data['continuationNumber'], contribution: data['contribution'], job_id: data['job_id'] };
                            }
                            break;
                    }

                    if (eventPayload) {
                        useDialecticStore.getState()._handleDialecticLifecycleEvent?.(eventPayload);
                    } else {
                        logger.warn(`[NotificationStore] Internal event '${type}' received, but its data payload did not match the expected format.`, { data });
                    }
                } else {
                    logger.warn(`[NotificationStore] Received internal event '${notification.type}' with no data.`);
                }
            } else {
                logger.warn(`[NotificationStore] Received internal event with an unknown or unhandled type: '${notification.type}'`);
            }
            return;
        }

        if (notification.type === 'WALLET_TRANSACTION') {
            const { data } = notification;
            if (data && typeof data === 'object' && 'walletId' in data && typeof data['walletId'] === 'string' && 'newBalance' in data && typeof data['newBalance'] === 'string') {
                logger.info('[NotificationStore] Handling wallet transaction event.', { data });
                useWalletStore.getState()._handleWalletUpdateNotification({
                    walletId: data['walletId'],
                    newBalance: data['newBalance'],
                });
            } else {
                logger.warn('[NotificationStore] Received WALLET_TRANSACTION event with invalid data.', { data });
            }
        }
        
        get().addNotification(notification);
    };
    // -------------------------------------------

    return {
        // Initial state
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
        // --- NEW: Realtime State ---
        subscribedUserId: null,
        // --------------------------
        handleIncomingNotification, // Exposed for testing

        // Actions
        fetchNotifications: async () => {
            if (!get().isLoading) {
                set({ isLoading: true, error: null });
            }
            try {
                const notificationApi = api.notifications();
                const response = await notificationApi.fetchNotifications();
                if (response.error) {
                    logger.error('[notificationStore] Failed to fetch notifications', { error: response.error });
                    set({ error: response.error, isLoading: false, notifications: [], unreadCount: 0 });
                } else {
                    const fetchedNotifications = response.data ?? [];
                    // Filter out internal events that should not be displayed in the UI.
                    const userFacingNotifications = fetchedNotifications.filter(n => !n.is_internal_event);
                    const sortedNotifications = sortNotifications(userFacingNotifications);
                    const unreadCount = calculateUnreadCount(sortedNotifications);
                    logger.info(`[notificationStore] Fetched ${fetchedNotifications.length} total notifications, showing ${userFacingNotifications.length} user-facing notifications. ${unreadCount} are unread.`);
                    set({
                        notifications: sortedNotifications,
                        unreadCount: unreadCount,
                        isLoading: false,
                        error: null,
                    });
                }
            } catch (error: unknown) {
                logger.error('[notificationStore] Error during initial load:', { 
                    error: error instanceof Error ? error.message : String(error) 
                });
                // Create ApiError object
                const apiError: ApiError = {
                    code: 'FETCH_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to load notifications'
                };
                set({ isLoading: false, error: apiError });
            }
        },

        addNotification: (notification) => {
            set(state => {
                if (state.notifications.some(n => n.id === notification.id)) {
                    logger.warn('[notificationStore] Attempted to add duplicate notification', { id: notification.id });
                    return {};
                }
                logger.debug('[notificationStore] Added notification', { notificationId: notification.id });
                const newNotifications = sortNotifications([notification, ...state.notifications]);
                const newUnreadCount = calculateUnreadCount(newNotifications);
                return { notifications: newNotifications, unreadCount: newUnreadCount };
            });
        },

        markNotificationRead: async (notificationId) => {
            const currentNotifications = get().notifications;
            const notification = currentNotifications.find(n => n.id === notificationId);

            if (!notification) {
                logger.warn('[notificationStore] markNotificationRead: Notification not found', { notificationId });
                return;
            }
            if (notification.read) {
                logger.debug('[notificationStore] Notification already read', { notificationId });
                return;
            }

            set({ error: null });
            try {
                const notificationApi = api.notifications();
                const response = await notificationApi.markNotificationRead(notificationId);

                if (response.error) {
                    logger.error('[notificationStore] Failed to mark notification as read', { notificationId, error: response.error });
                    set({ error: response.error });
                } else {
                    logger.info('[notificationStore] Marked notification as read', { notificationId });
                    set(state => {
                        const updatedNotifications = state.notifications.map(n =>
                            n.id === notificationId ? { ...n, read: true } : n
                        );
                        const newUnreadCount = calculateUnreadCount(updatedNotifications);
                        return {
                            notifications: updatedNotifications,
                            unreadCount: newUnreadCount,
                            error: null
                        };
                    });
                }
            } catch (error: unknown) {
                logger.error(`Error marking notification ${notificationId} as read:`, { 
                    error: error instanceof Error ? error.message : String(error) 
                });
                // Create ApiError object
                const apiError: ApiError = {
                    code: 'MARK_READ_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to mark notification as read'
                };
                set({ error: apiError });
            }
        },

        markAllNotificationsAsRead: async () => {
            if (get().unreadCount === 0) {
                logger.debug('No unread notifications to mark as read.');
                return;
            }

            set({ error: null });
            try {
                const notificationApi = api.notifications();
                const response = await notificationApi.markAllNotificationsAsRead();

                if (response.error) {
                    logger.error('[notificationStore] Failed to mark all notifications as read', { error: response.error });
                    set({ error: response.error });
                } else {
                    logger.info('[notificationStore] Marked all notifications as read');
                    set(state => ({
                        notifications: state.notifications.map(n => ({ ...n, read: true })),
                        unreadCount: 0,
                        error: null
                    }));
                }
            } catch (error: unknown) {
                logger.error('Error marking all notifications as read:', { 
                     error: error instanceof Error ? error.message : String(error) 
                });
                 // Create ApiError object
                 const apiError: ApiError = {
                    code: 'MARK_ALL_READ_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to mark all notifications as read'
                 };
                 set({ error: apiError });
            }
        },

        // --- NEW: Realtime Actions Implementation ---
        subscribeToUserNotifications: (userId: string) => {
            if (!userId) {
                logger.error('User ID is required to subscribe to notifications.');
                return;
            }

            const currentSubscribedId = get().subscribedUserId;

            if (currentSubscribedId === userId) {
                logger.warn('[NotificationStore] Already subscribed to notifications for user:', { userId });
                return;
            }

            if (currentSubscribedId) {
                logger.info(`[NotificationStore] Switching subscription from user ${currentSubscribedId} to ${userId}`);
                get().unsubscribeFromUserNotifications();
            }

            logger.info('[NotificationStore] Subscribing to notifications for user:', { userId });
            try {
                const notificationApi = api.notifications();
                const channel = notificationApi.subscribeToNotifications(userId, get().handleIncomingNotification);

                if (channel) {
                    set({ subscribedUserId: userId, error: null });
                    logger.info('[NotificationStore] Successfully subscribed to notification channel for user:', { userId });
                } else {
                    logger.error('[NotificationStore] Failed to subscribe to notifications, API returned null channel for user:', { userId });
                    set({ subscribedUserId: null });
                }
            } catch (error: unknown) {
                logger.error('[NotificationStore] Error calling subscribeToNotifications:', { 
                    userId, 
                    error: error instanceof Error ? error.message : String(error) 
                });
                set({ subscribedUserId: null, error: { code: 'SUBSCRIBE_ERROR', message: error instanceof Error ? error.message : String(error) } });
            }
        },

        unsubscribeFromUserNotifications: () => {
            const currentSubscribedId = get().subscribedUserId;
            if (!currentSubscribedId) {
                logger.debug('Not currently subscribed to notifications, skipping unsubscribe.');
                return;
            }

            logger.info('Unsubscribing from notifications.');
            try {
                const notificationApi = api.notifications();
                notificationApi.unsubscribeFromNotifications();
                set({ subscribedUserId: null });
                logger.info('Successfully unsubscribed from notifications for user:', { userId: currentSubscribedId });
            } catch (error: unknown) {
                logger.error('[NotificationStore] Error calling unsubscribeFromNotifications:', { 
                    userId: currentSubscribedId, 
                    error: error instanceof Error ? error.message : String(error) 
                });
                set({ subscribedUserId: null, error: { code: 'UNSUBSCRIBE_ERROR', message: error instanceof Error ? error.message : String(error) } });
            }
        },
        // -----------------------------------------
    }
}); 