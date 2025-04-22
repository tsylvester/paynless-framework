import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@paynless/store';
import { useNotificationStore } from '@paynless/store';
import { api } from '@paynless/api-client';
import type { Notification } from '@paynless/types';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { logger } from '@paynless/utils';
import { formatDistanceToNowStrict } from 'date-fns'; // For relative time

export const Notifications: React.FC = () => {
    const user = useAuthStore((state) => state.user);
    const {
        notifications,
        unreadCount,
        fetchNotifications,
        addNotification,
        markNotificationRead,
        markAllNotificationsAsRead,
    } = useNotificationStore();

    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);

    // Fetch initial notifications on mount/user change
    useEffect(() => {
        if (user) {
            logger.debug('[Notifications] User found, fetching notifications.');
            fetchNotifications();
        }
    }, [user, fetchNotifications]);

    // Setup Realtime subscription
    useEffect(() => {
        if (!user) return; // Only subscribe if user is logged in

        logger.debug('[Notifications] Setting up Realtime subscription for user:', { userId: user.id });

        const channelName = `notifications-user-${user.id}`; // Unique channel per user
        const channel = api.getSupabaseClient().channel(channelName, {
            config: {
                broadcast: { self: false }, // Don't receive broadcasts sent by self
                presence: { key: user.id }, // Track presence if needed later
            },
        });

        channel
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`, // Server-side filter for this user
                },
                (payload) => {
                     logger.info('[Notifications] Realtime INSERT received', { payload });
                    // Ensure payload.new is a valid Notification
                    // Add basic validation if necessary
                     if (payload.new && payload.new.id) {
                         addNotification(payload.new as Notification);
                    } else {
                        logger.warn('[Notifications] Received invalid INSERT payload', { payload });
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    logger.info(`[Notifications] Realtime channel "${channelName}" subscribed successfully.`);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                     logger.error(`[Notifications] Realtime channel subscription error/timeout`, { status, err });
                 } else if (status === 'CLOSED') {
                     logger.warn(`[Notifications] Realtime channel "${channelName}" closed.`);
                 }
            });

        // Cleanup function
        return () => {
            logger.debug(`[Notifications] Cleaning up Realtime channel "${channelName}"`);
            api.getSupabaseClient().removeChannel(channel).catch(error => {
                 logger.error('[Notifications] Error removing Realtime channel', { error });
             });
        };
    }, [user, addNotification]); // Re-run if user or addNotification function changes

    const handleNotificationClick = (notification: Notification) => {
         logger.debug('[Notifications] Notification clicked', { id: notification.id });
        // Mark as read even if not navigating
        if (!notification.read) {
            markNotificationRead(notification.id);
        }
        // Navigate if target_path exists
        if (notification.data?.target_path) {
            navigate(notification.data.target_path);
        }
        setIsOpen(false); // Close dropdown after interaction
    };

    const handleMarkReadClick = (e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation(); // Prevent triggering handleNotificationClick
        logger.debug('[Notifications] Mark as read clicked', { id: notificationId });
        markNotificationRead(notificationId);
    };

    const handleMarkAllReadClick = () => {
        logger.debug('[Notifications] Mark all as read clicked');
        markAllNotificationsAsRead();
    };

    if (!user) {
        return null; // Don't render anything if not logged in
    }

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0 text-xs"
                            // Add aria-label for accessibility
                            aria-label={`${unreadCount} unread notifications`}
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                     <span className="sr-only">Notifications</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-[60vh] overflow-y-auto">
                <DropdownMenuLabel className="flex justify-between items-center">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto px-2 py-1 text-xs"
                             onClick={handleMarkAllReadClick}
                             aria-label="Mark all notifications as read"
                        >
                             <CheckCheck className="mr-1 h-3 w-3" /> Mark all as read
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                    <DropdownMenuItem disabled className="text-center text-muted-foreground py-4">
                        No new notifications
                    </DropdownMenuItem>
                ) : (
                    notifications.map((notification) => {
                        const timeAgo = notification.created_at
                            ? formatDistanceToNowStrict(new Date(notification.created_at), { addSuffix: true })
                            : '';
                        return (
                            <DropdownMenuItem
                                key={notification.id}
                                className={cn(
                                    'flex cursor-pointer items-start gap-2 p-3',
                                    !notification.read && 'bg-muted/50'
                                )}
                                onClick={() => handleNotificationClick(notification)}
                                // Add aria-label describing the notification and its read status
                                aria-label={`Notification: ${notification.data?.message || 'System Notification'}. ${!notification.read ? 'Unread.' : 'Read.'} Received ${timeAgo}`}
                            >
                                {!notification.read && (
                                    <span className="mt-1 block h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" aria-hidden="true" />
                                )}
                                <div className={cn("flex-grow", notification.read && "pl-4")}>
                                    <p className="text-sm font-medium leading-none mb-1">
                                         {notification.data?.message || 'System Notification'}
                                    </p>
                                     <p className="text-xs text-muted-foreground">
                                         {timeAgo}
                                    </p>
                                 </div>
                                 {/* Optional: Explicit mark as read button per item */}
                                 {!notification.read && (
                                     <Button
                                         variant="ghost"
                                         size="sm"
                                         className="ml-auto h-auto p-1 flex-shrink-0"
                                         onClick={(e) => handleMarkReadClick(e, notification.id)}
                                         aria-label={`Mark notification ${notification.id} as read`}
                                     >
                                         <CheckCheck className="h-4 w-4" />
                                     </Button>
                                 )}
                            </DropdownMenuItem>
                        );
                    })
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}; 