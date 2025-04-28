import { ApiClient } from './apiClient'; // Import base client
// Import StreamCallbacks from types
import { Notification, ApiResponse, StreamCallbacks, StreamDisconnectFunction } from '@paynless/types';
import { logger } from '@paynless/utils';

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

export class NotificationApiClient {
  private apiClient: ApiClient; // Store base client instance
  // Remove internal eventSource management
  // private eventSource: EventSource | null = null;
  // Use imported type StreamDisconnectFunction
  private disconnectStream: StreamDisconnectFunction | null = null;

  constructor(apiClientInstance: ApiClient) {
    this.apiClient = apiClientInstance;
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
    // Use PUT as PATCH might not be available on base client
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
   * Connects to the server-sent events stream for real-time notifications
   * by delegating to the main ApiClient's stream method.
   *
   * @param onMessageCallback - Function to call when a new notification message is received.
   * @param onErrorCallback - Function to call when an error occurs with the stream.
   * @returns A function to disconnect the stream, or null if connection failed immediately.
   */
  connectToNotificationStream(
    onMessageCallback: (notification: Notification) => void,
    onErrorCallback: (error: Event | Error) => void
    // Removed explicit onOpen callback type here, relying on StreamCallbacks<Notification>
  ): StreamDisconnectFunction | null { // Use imported type
    logger.debug('[NotificationApiClient] Requesting notification stream connection from ApiClient...');

    // Ensure any previously stored disconnect function is called before starting a new one
    this.disconnectFromNotificationStream();

    // Define callbacks conforming to StreamCallbacks<Notification>
    const callbacks: StreamCallbacks<Notification> = {
      onMessage: onMessageCallback,
      onError: onErrorCallback,
      onOpen: () => {
        logger.info('[NotificationApiClient] Notification stream connected (via ApiClient).');
        // Add any specific logic needed when the notification stream opens
      },
    };

    // Delegate connection management to the main ApiClient
    const disconnectFn = this.apiClient.stream<Notification>('notifications-stream', callbacks);

    // Store the returned disconnect function
    this.disconnectStream = disconnectFn;

    if (!disconnectFn) {
      logger.error('[NotificationApiClient] ApiClient.stream returned null, connection likely failed immediately.');
    }

    return disconnectFn;
  }

  /**
   * Disconnects the active notification stream by calling the stored disconnect function.
   */
  disconnectFromNotificationStream(): void {
    if (this.disconnectStream) {
      logger.debug('[NotificationApiClient] Calling stored disconnect function to close notification stream...');
      this.disconnectStream();
      this.disconnectStream = null; // Clear the stored function
    } else {
        logger.debug('[NotificationApiClient] No active disconnect function stored, stream likely not connected or already disconnected.');
    }
  }

  // Removed the old implementation that directly used EventSource
  /*
  connectToNotificationStream(
    onMessageCallback: OnMessageCallback,
    onErrorCallback: OnErrorCallback
  ): DisconnectFunction | null {
    // ... old implementation ...
  }

  disconnectFromNotificationStream(): void {
    // ... old implementation ...
  }
  */

} // End of NotificationApiClient class 