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

// Define callback type
// type NotificationHandler = (notification: Notification) => void; // Removed

export const Notifications: React.FC = () => {
    const user = useAuthStore((state) => state.user);
    const {
        notifications,
        unreadCount,
        // fetchNotifications, // Use api.notifications().fetchNotifications directly
        addNotification, // Keep for potential future store-based Realtime handling
        // markNotificationRead, // Use api.notifications().mark... directly
        // markAllNotificationsAsRead, // Use api.notifications().mark... directly
    } = useNotificationStore(); // Primarily use for state

    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);

    // Fetch initial notifications using the API client
    useEffect(() => {
        if (user) {
            logger.debug('[Notifications] User found, fetching initial notifications via API client.');
            // TODO: Ideally, this fetch should be triggered by the store itself
            // For now, keep it here for component mount logic
            api.notifications().fetchNotifications().then(response => {
                if (response.error) {
                     logger.error("[Notifications] Failed to fetch initial notifications", { error: response.error });
                } else {
                    // Let the store handle setting the state after fetch if needed
                    // useNotificationStore.getState().setNotifications(response.data ?? []);
                }
            }).catch(err => {
                 logger.error("[Notifications] Exception during initial fetch", { err });
            });
        }
    }, [user]); // Dependency on user only

    // Removed Realtime subscription useEffect hook
    // // Setup Realtime subscription using the API client
    // useEffect(() => {
    //     if (!user || !user.id) {
    //         return;
    //     }
    // 
    //     logger.debug('[Notifications] Setting up Realtime subscription via API client for user:', { userId: user.id });
    // 
    //     // Define the handler function to pass to the API client
    //     const handleNewNotification: NotificationHandler = (newNotification) => {
    //         logger.info('[Notifications] Received new notification from API subscription', { newNotification });
    //         addNotification(newNotification); // Call store action to update UI state
    //     };
    // 
    //     // Subscribe using the main api object
    //     api.subscribeToNotifications(user.id, handleNewNotification);
    // 
    //     // Cleanup function: Unsubscribe using the main api object
    //     return () => {
    //         logger.debug(`[Notifications] Cleaning up Realtime subscription via API client for user ${user.id}`);
    //         api.unsubscribeFromNotifications(user.id);
    //     };
    // // Dependency on user.id ensures re-subscription on user change.
    // // Dependency on addNotification ensures the latest store action is used.
    // }, [user?.id, addNotification]);

    const handleNotificationClick = (notification: Notification) => {
         logger.debug('[Notifications] Notification clicked', { id: notification.id });
        // Mark as read via API client
        if (!notification.read) {
             api.notifications().markNotificationAsRead(notification.id).catch(err => {
                 logger.error(`Failed to mark notification ${notification.id} as read`, { err });
             });
            // Optimistic update in store might be needed here
            useNotificationStore.getState().markNotificationRead(notification.id); // Optimistic UI update
        }
        // Navigate if target_path exists - use bracket notation
        const targetPath = notification.data?.['target_path']; // Use optional chaining correctly
        if (targetPath && typeof targetPath === 'string') { // Check if path exists and is a string
            navigate(targetPath);
        }
        setIsOpen(false); // Close dropdown after interaction
    };

    const handleMarkReadClick = (e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation(); // Prevent triggering handleNotificationClick
        logger.debug('[Notifications] Mark as read clicked', { id: notificationId });
        // Mark as read via API client
        api.notifications().markNotificationAsRead(notificationId).catch(err => {
             logger.error(`Failed to mark notification ${notificationId} as read from button`, { err });
         });
         // Optimistic update in store might be needed here
        useNotificationStore.getState().markNotificationRead(notificationId); // Optimistic UI update
    };

    const handleMarkAllReadClick = () => {
        logger.debug('[Notifications] Mark all as read clicked');
        // Mark all as read via API client
        api.notifications().markAllNotificationsAsRead().catch(err => {
             logger.error(`Failed to mark all notifications as read`, { err });
         });
        // Optimistic update in store might be needed here
        useNotificationStore.getState().markAllNotificationsAsRead(); // Optimistic UI update
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
                        // Use bracket notation for data access
                        const message = notification.data?.['message'] || 'System Notification';
                        return (
                            <DropdownMenuItem
                                key={notification.id}
                                className={cn(
                                    'flex cursor-pointer items-start gap-2 p-3',
                                    !notification.read && 'bg-muted/50'
                                )}
                                onClick={() => handleNotificationClick(notification)}
                                aria-label={`Notification: ${message}. ${!notification.read ? 'Unread' : 'Read'}. Received ${timeAgo}`}
                            >
                                {!notification.read && (
                                    <span className="mt-1 block h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" aria-hidden="true" />
                                )}
                                <div className={cn("flex-grow", notification.read && "pl-4")}>
                                    <p className="text-sm font-medium leading-none mb-1">
                                         {message}
                                    </p>
                                     <p className="text-xs text-muted-foreground">
                                         {timeAgo}
                                    </p>
                                 </div>
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