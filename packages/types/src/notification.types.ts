import type { Database, Json } from '@paynless/db-types';

/**
 * Defines the expected structure for the `data` JSONB field 
 * within a Notification row.
 */
export interface NotificationData {
    subject?: string;
    message?: string;
    target_path?: string;
    // Add other potential common fields here
    [key: string]: Json | undefined; // Allow other dynamic properties from DB JSON
}

/**
 * Represents an in-app notification for a user.
 * Based on the `notifications` table but refines the `data` field type.
 */
// Omit the original 'data' field and intersect with our refined version
export type Notification = 
    Omit<Database['public']['Tables']['notifications']['Row'], 'data'> 
    & { data: NotificationData | null };

// Add other notification-related types here in the future,
// ensuring they don't duplicate DB schema types.
// export type NotificationType = 'join_request' | 'invite_sent' | 'role_changed' | 'mention' | 'system_message';
// export interface JoinRequestData { ... } 