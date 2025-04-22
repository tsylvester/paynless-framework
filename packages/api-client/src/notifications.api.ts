import { ApiClient } from './apiClient'; // Import base client
import { Notification, ApiResponse } from '@paynless/types';
import { logger } from '@paynless/utils';
import type { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'; // Added Supabase types

// Interface for the callback function
type NotificationCallback = (notification: Notification) => void;

export class NotificationApiClient {
  private apiClient: ApiClient; // Store base client instance
  // Store channels keyed by userId to manage subscriptions
  private notificationChannels: Map<string, RealtimeChannel> = new Map();

  constructor(apiClientInstance: ApiClient) {
    this.apiClient = apiClientInstance;
  }

  // Helper to get Supabase client instance - keep internal
  private getSupabaseClient(): SupabaseClient {
    // Assuming the base ApiClient has a method to get the initialized Supabase client
    // This needs to exist on ApiClient instance passed in constructor.
    // If ApiClient doesn't expose it, this architecture needs adjustment.
    // For now, assume it exists based on previous component usage attempt.
    // Using a plausible public accessor name now, assuming it might exist
    if (!this.apiClient.supabase) { 
        logger.error("Supabase client instance not found on ApiClient instance.");
        throw new Error("Supabase client is not accessible via ApiClient.");
    }
    return this.apiClient.supabase;
  }

  /**
   * Fetches notifications for the authenticated user.
   */
  async fetchNotifications(): Promise<ApiResponse<Notification[]>> {
    logger.debug('[NotificationApiClient] Fetching notifications...');
    const response = await this.apiClient.get<Notification[]>('notifications');
    if (response.error) {
      logger.error('Error fetching notifications:', { error: response.error });
      return response;
    }
    response.data = response.data ?? [];
    logger.debug('[NotificationApiClient] Fetched notifications successfully', { count: response.data.length });
    return response;
  }

  /**
   * Marks a specific notification as read for the authenticated user.
   */
  async markNotificationAsRead(notificationId: string): Promise<ApiResponse<void>> {
    logger.debug(`[NotificationApiClient] Marking notification ${notificationId} as read...`);
    // Reverted to PUT as PATCH is not available on base client
    const response = await this.apiClient.put<void, { read: boolean }>(`notifications/${notificationId}`, { read: true });
    if (response.error) {
        logger.error(`Error marking notification ${notificationId} as read:`, { error: response.error });
        return response;
    }
    logger.debug(`[NotificationApiClient] Marked notification ${notificationId} as read successfully`);
    return response;
  }

  /**
   * Marks all unread notifications as read for the authenticated user.
   */
  async markAllNotificationsAsRead(): Promise<ApiResponse<void>> {
    logger.debug('[NotificationApiClient] Marking all notifications as read...');
    const response = await this.apiClient.post<void, null>('notifications/mark-all-read', null);
    if (response.error) {
        logger.error('Error marking all notifications as read:', { error: response.error });
        return response;
    }
     logger.debug('[NotificationApiClient] Marked all notifications as read successfully');
    return response;
  }

  /**
   * Subscribes to new notifications for a specific user.
   * @param userId The ID of the user to subscribe for.
   * @param callback The function to call when a new notification arrives.
   */
  subscribeToNewNotifications(userId: string, callback: NotificationCallback): void {
    if (!userId) {
        logger.warn('[NotificationApiClient] Cannot subscribe: userId is missing.');
        return;
    }
    if (this.notificationChannels.has(userId)) {
        logger.warn(`[NotificationApiClient] Already subscribed for user ${userId}.`);
        return;
    }

    logger.debug(`[NotificationApiClient] Subscribing to notifications for user ${userId}...`);
    const supabase = this.getSupabaseClient();
    const channelName = `notifications-user-${userId}`;
    const channel = supabase.channel(channelName, {
        config: {
            broadcast: { self: false },
            presence: { key: userId },
        },
    });

    channel
        .on<Notification>( // Specify the payload type expected for 'INSERT'
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`,
            },
            // Explicitly type the payload
            (payload: RealtimePostgresChangesPayload<Notification>) => {
                logger.info('[NotificationApiClient] Realtime INSERT received', { payload });
                // Add explicit check for payload.new before asserting/using
                if (payload.new) {
                    // Assert type after check
                    const newNotification = payload.new as Notification;
                    // Check for ID on the asserted type
                    if (newNotification.id) { 
                        callback(newNotification);
                    } else {
                        logger.warn('[NotificationApiClient] Received INSERT payload missing ID', { payload });
                    }
                } else {
                    logger.warn('[NotificationApiClient] Received INSERT payload missing `new` object', { payload });
                }
            }
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                logger.info(`[NotificationApiClient] Realtime channel "${channelName}" subscribed successfully.`);
                this.notificationChannels.set(userId, channel); // Store the channel on successful subscribe
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                 logger.error(`[NotificationApiClient] Realtime channel subscription error/timeout`, { status, err });
                 // Consider cleanup / removing from map if subscribe fails permanently
                 this.notificationChannels.delete(userId); // Remove if subscription failed
            } else if (status === 'CLOSED') {
                 logger.warn(`[NotificationApiClient] Realtime channel "${channelName}" closed unexpectedly.`);
                 this.notificationChannels.delete(userId); // Remove if closed
            }
        });
    }

    /**
     * Unsubscribes from new notifications for a specific user.
     * @param userId The ID of the user to unsubscribe for.
     */
    unsubscribeFromNewNotifications(userId: string): void {
        if (!userId) {
            logger.warn('[NotificationApiClient] Cannot unsubscribe: userId is missing.');
            return;
        }
        const channel = this.notificationChannels.get(userId);
        if (channel) {
            logger.debug(`[NotificationApiClient] Unsubscribing from notifications for user ${userId}...`);
            channel.unsubscribe()
                .then(status => {
                    logger.info(`[NotificationApiClient] Unsubscribed successfully for user ${userId}. Status: ${status}`);
                })
                .catch(error => {
                    logger.error(`[NotificationApiClient] Error unsubscribing for user ${userId}:`, { error });
                })
                .finally(() => {
                    // Remove the channel reference regardless of success/error
                    this.notificationChannels.delete(userId);
                    // Also explicitly remove from Supabase client if needed (might not be necessary if unsubscribe works)
                     try {
                         this.getSupabaseClient().removeChannel(channel);
                     } catch (removeError) {
                         logger.error(`[NotificationApiClient] Error calling removeChannel for user ${userId}:`, { removeError });
                     }
                });
        } else {
            logger.warn(`[NotificationApiClient] No active subscription found to unsubscribe for user ${userId}.`);
        }
    }
} 