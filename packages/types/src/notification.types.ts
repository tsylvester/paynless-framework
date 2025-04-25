import type { Database } from '@paynless/db-types';

/**
 * Represents an in-app notification for a user.
 * Derived from the `notifications` table in the database.
 */
export type Notification = Database['public']['Tables']['notifications']['Row'];

// Add other notification-related types here in the future,
// ensuring they don't duplicate DB schema types.
// export type NotificationType = 'join_request' | 'invite_sent' | 'role_changed' | 'mention' | 'system_message';
// export interface JoinRequestData { ... } 