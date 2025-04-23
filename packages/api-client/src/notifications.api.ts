import { ApiClient } from './apiClient'; // Import base client
import { Notification, ApiResponse } from '@paynless/types';
import { logger } from '@paynless/utils';

export class NotificationApiClient {
  private apiClient: ApiClient; // Store base client instance

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
} 