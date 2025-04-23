import React, { useEffect, useState, useRef } from 'react';
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
    // --- Temporarily use `as any` for token until store/types are updated --- 
    const { user, token } = useAuthStore((state: any) => ({ user: state.user, token: state.token }));
    const {
        notifications,
        unreadCount,
        // fetchNotifications, // Use api.notifications().fetchNotifications directly
        addNotification, // Keep for potential future store-based Realtime handling
        // markNotificationRead, // Use api.notifications().mark... directly
        // markAllNotificationsAsRead, // Use api.notifications().mark... directly
        // --- Destructure actions from the hook --- 
        markNotificationRead, 
        markAllNotificationsAsRead, 
    } = useNotificationStore(); // Primarily use for state

    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    // Use ref to hold EventSource instance
    const eventSourceRef = useRef<EventSource | null>(null);

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

    // --- NEW: useEffect for SSE Connection --- 
    useEffect(() => {
        // Ensure user and token are present
        if (user && token) {
            logger.info('[Notifications] User and token found, establishing SSE connection.');
            const sseUrl = `/api/notifications-stream?token=${token}`;
            
            // Close existing connection if any (e.g., token changed)
            if (eventSourceRef.current) {
                logger.debug('[Notifications] Closing existing EventSource connection.');
                eventSourceRef.current.close();
            }

            // Create new EventSource
            const newEventSource = new EventSource(sseUrl);
            eventSourceRef.current = newEventSource; // Store ref

            newEventSource.onopen = () => {
                logger.info('[Notifications] SSE connection opened.');
            };

            newEventSource.onmessage = (event) => {
                try {
                    logger.debug('[Notifications] SSE message received:', event.data);
                    const newNotificationData: Notification = JSON.parse(event.data);
                    // Call store action to add the notification
                    addNotification(newNotificationData);
                } catch (error) {
                    logger.error('[Notifications] Failed to parse SSE message data:', { data: event.data, error });
                }
            };

            newEventSource.onerror = (errorEvent) => { // Rename variable for clarity
                // --- Wrap error event in object for logger --- 
                logger.error('[Notifications] SSE connection error:', { error: errorEvent });
                // Potentially close and nullify ref? Depends on desired retry logic.
                // For now, just log the error.
                // eventSourceRef.current?.close(); 
                // eventSourceRef.current = null;
            };

            // Cleanup function for when component unmounts or user/token changes
            return () => {
                logger.debug('[Notifications] Cleaning up SSE connection.');
                if (eventSourceRef.current) {
                    eventSourceRef.current.close();
                    eventSourceRef.current = null;
                }
            };

        } else {
            // User or token is missing, ensure any existing connection is closed
            if (eventSourceRef.current) {
                 logger.debug('[Notifications] User or token missing, closing existing SSE connection.');
                 eventSourceRef.current.close();
                 eventSourceRef.current = null;
             }
        }
    // Dependencies: user and token - reconnect if they change
    }, [user, token, addNotification]); // Include addNotification from store

    const handleNotificationClick = (notification: Notification) => {
         logger.debug('[Notifications] Notification clicked', { id: notification.id });
        if (!notification.read) {
             api.notifications().markNotificationAsRead(notification.id).catch(err => {
                 logger.error(`Failed to mark notification ${notification.id} as read`, { err });
             });
            // --- Use destructured action --- 
            markNotificationRead(notification.id); 
        }
        const targetPath = notification.data?.['target_path']; 
        if (targetPath && typeof targetPath === 'string') { 
            navigate(targetPath);
        }
        setIsOpen(false); 
    };

    const handleMarkReadClick = (e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation(); 
        logger.debug('[Notifications] Mark as read clicked', { id: notificationId });
        api.notifications().markNotificationAsRead(notificationId).catch(err => {
             logger.error(`Failed to mark notification ${notificationId} as read from button`, { err });
         });
        // --- Use destructured action --- 
        markNotificationRead(notificationId); 
    };

    const handleMarkAllReadClick = () => {
        logger.debug('[Notifications] Mark all as read clicked');
        api.notifications().markAllNotificationsAsRead().catch(err => {
             logger.error(`Failed to mark all notifications as read`, { err });
         });
        // --- Use destructured action --- 
        markAllNotificationsAsRead(); 
    };

    // --- Fix: Ensure component returns null if no user --- 
    if (!user) {
        // Explicitly close connection if user becomes null while mounted
        // Though the useEffect cleanup should handle this too.
         if (eventSourceRef.current) {
            logger.warn('[Notifications] User became null, ensuring SSE is closed.');
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        return null; 
    }

    console.log('[Notifications] Rendering, isOpen:', isOpen);

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
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
            <DropdownMenuContent 
                align="end" 
                className="w-80 max-h-[60vh] overflow-y-auto z-[51]"
            >
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
                        const subject = notification.data?.['subject'] || 'Untitled';
                        const message = notification.data?.['message'] || 'System Notification';
                        const isActionable = !!notification.data?.['target_path'];
                        const label = `Notification: ${subject}. ${notification.read ? 'Read' : 'Unread'}. Received ${timeAgo}`;
                        return (
                            <DropdownMenuItem
                                key={notification.id}
                                data-notification-id={notification.id}
                                aria-label={label}
                                className={cn(
                                    'flex cursor-pointer items-start gap-2 p-3',
                                    !notification.read && 'bg-muted/50'
                                )}
                                onClick={() => handleNotificationClick(notification)}
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