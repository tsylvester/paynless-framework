/**
 * Represents an in-app notification for a user.
 */
export interface Notification {
  id: string; // UUID
  user_id: string; // UUID referencing auth.users
  type: string; // Categorizes the notification (e.g., 'join_request', 'invite_sent', 'role_changed')

  /**
   * JSONB payload containing contextual data for the notification.
   * Structure depends on the notification type.
   * Examples:
   * - { target_path: string, org_id: string, requesting_user_id: string }
   * - { target_path: string, message: string }
   */
  data?: Record<string, any> | null;

  read: boolean; // Indicates if the user has marked the notification as read
  created_at: string; // ISO 8601 timestamp string
}

// Add other notification-related types here in the future
// export type NotificationType = 'join_request' | 'invite_sent' | 'role_changed' | 'mention' | 'system_message';
// export interface JoinRequestData { ... } 