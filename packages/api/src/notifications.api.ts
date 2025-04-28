import { ApiClient } from './apiClient'; // Import base client
// Remove StreamCallbacks and StreamDisconnectFunction from import
import { Notification, ApiResponse } from '@paynless/types';
import { logger } from '@paynless/utils';
// Import Supabase client types
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// Define the expected callback types locally if not imported (Now imported, so commented out)
// type OnMessageCallback = (notification: Notification) => void;
// type OnErrorCallback = (error: Event | Error) => void;
// type DisconnectFunction = () => void; // Now StreamDisconnectFunction

// Define StreamCallbacks locally if not imported from @paynless/types (Now imported)
// interface StreamCallbacks<T> {
//   onMessage: (data: T) => void;
//   onError: (error: Event | Error) => void;
//   onOpen?: () => void;
// }

// Type for the callback function provided by the store
type NotificationSubscriptionCallback = (notification: Notification) => void;

export class NotificationApiClient {
  private apiClient: ApiClient; // Store base client instance
  private supabase: SupabaseClient<any>; // Store Supabase client instance
  private notificationChannel: RealtimeChannel | null = null; // Store the active channel
  // Remove internal eventSource management
  // private eventSource: EventSource | null = null;
  // Use imported type StreamDisconnectFunction
  // private disconnectStream: StreamDisconnectFunction | null = null;

  constructor(apiClientInstance: ApiClient) {
    this.apiClient = apiClientInstance;
    this.supabase = this.apiClient.getSupabaseClient(); // Get client from ApiClient
    logger.debug('[NotificationApiClient] Initialized.');
  }

  /**
   * Fetches notifications for the authenticated user.
   */
  async fetchNotifications(): Promise<ApiResponse<Notification[]>> {
    logger.debug('[NotificationApiClient] Fetching notifications...');
    const response = await this.apiClient.get<Notification[]>('notifications');
    if (!response.error && response.data) {
      logger.info(`[NotificationApiClient] Fetched ${response.data.length} notifications.`);
    } else {
      logger.error('[NotificationApiClient] Error fetching notifications:', { error: response.error });
    }
    return response;
  }

  /**
   * Marks a specific notification as read for the authenticated user.
   */
  async markNotificationRead(notificationId: string): Promise<ApiResponse<null>> {
    logger.debug(`[NotificationApiClient] Marking notification ${notificationId} as read...`);
    // Endpoint expects /notifications/:id for PUT
    const response = await this.apiClient.put<null, {}>(`notifications/${notificationId}`, {});
    if (!response.error) {
      logger.info(`[NotificationApiClient] Marked notification ${notificationId} as read successfully.`);
    } else {
      logger.error('[NotificationApiClient] Error marking notification', { error: response.error });
    }
    return response;
  }

  /**
   * Marks all unread notifications as read for the authenticated user.
   */
  async markAllNotificationsAsRead(): Promise<ApiResponse<null>> {
    logger.debug('[NotificationApiClient] Marking all notifications as read...');
    // Endpoint expects /notifications/mark-all-read for POST
    const response = await this.apiClient.post<null, {}>(`notifications/mark-all-read`, {});
    if (!response.error) {
      logger.info('[NotificationApiClient] Marked all notifications as read successfully.');
    } else {
      logger.error('[NotificationApiClient] Error marking all notifications as read:', { error: response.error });
    }
    return response;
  }

  // --- NEW: Subscribe using Supabase Realtime --- 
  subscribeToNotifications(
    userId: string,
    onNotificationCallback: NotificationSubscriptionCallback
  ): RealtimeChannel | null {
    if (!userId) {
      logger.error('[NotificationApiClient] Cannot subscribe without userId.');
      return null;
    }

    if (this.notificationChannel) {
      logger.warn('[NotificationApiClient] Already subscribed. Unsubscribing previous channel first.');
      this.unsubscribeFromNotifications();
    }

    const channelName = `notifications-user-${userId}`;
    logger.info(`[NotificationApiClient] Subscribing to Realtime channel: ${channelName}`);

    try {
      this.notificationChannel = this.supabase.channel(channelName);

      this.notificationChannel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            logger.debug('[NotificationApiClient] Received Realtime payload:', payload);
            if (payload.new) {
              // Pass the new notification object to the callback
              onNotificationCallback(payload.new as Notification);
            } else {
              logger.warn('[NotificationApiClient] Received INSERT payload without new data.', payload);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            logger.info(`[NotificationApiClient] Successfully subscribed to channel ${channelName}.`);
          } else if (status === 'CHANNEL_ERROR' || err) {
            const errorMessage = err ? err.message : `Channel status: ${status}`;
            logger.error(`[NotificationApiClient] Error subscribing to channel ${channelName}:`, { error: errorMessage });
            // Attempt to unsubscribe on error to clean up
            this.unsubscribeFromNotifications();
          } else {
            logger.debug(`[NotificationApiClient] Channel ${channelName} status: ${status}`);
          }
        });

      return this.notificationChannel;
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('[NotificationApiClient] Exception during subscription setup:', { error: errorMessage });
      this.notificationChannel = null;
      return null;
    }
  }

  // --- NEW: Unsubscribe using Supabase Realtime --- 
  unsubscribeFromNotifications(): void {
    if (this.notificationChannel) {
      const channelName = this.notificationChannel.topic;
      logger.info(`[NotificationApiClient] Unsubscribing from Realtime channel: ${channelName}`);
      this.supabase.removeChannel(this.notificationChannel)
        .then((status) => {
          logger.info(`[NotificationApiClient] Channel ${channelName} removal status: ${status}`);
        })
        .catch((err: any) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.error(`[NotificationApiClient] Error removing channel ${channelName}:`, { error: errorMessage });
        });
      this.notificationChannel = null;
    } else {
      logger.debug('[NotificationApiClient] No active notification channel to unsubscribe from.');
    }
  }
} // End of NotificationApiClient class 