import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@paynless/store';
import { useNotificationStore } from '@paynless/store';
// Remove direct API client import if no longer needed for mark read/all read
// import { api } from '@paynless/api'; 
import type { Notification } from '@paynless/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { logger } from '@paynless/utils';
import { formatDistanceToNowStrict } from 'date-fns'; // For relative time

import { SimpleDropdown } from '@/components/ui/SimpleDropdown'; // Import the new component

// Define callback type
// type NotificationHandler = (notification: Notification) => void; // Removed

export const Notifications: React.FC = () => {
    // Only need user from auth store now
    const user = useAuthStore(state => state.user);
    const {
        notifications,
        unreadCount,
        markNotificationRead,
        markAllNotificationsAsRead,
        fetchNotifications,
        // Remove unused stream actions
        // initNotificationStream,
        // disconnectNotificationStream
    } = useNotificationStore();

    const navigate = useNavigate();
    const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(new Set());

    // Fetch initial notifications using the store action
    useEffect(() => {
        if (user?.id) { // Check for user ID specifically
            logger.debug('[Notifications] User ID found, triggering fetchNotifications store action.');
            fetchNotifications();
        }
        // Add fetchNotifications as dependency
    }, [user?.id, fetchNotifications]);

    // Remove the entire useEffect block that handled stream connection/disconnection
    /*
    // --- NEW: useEffect to connect/disconnect stream via store actions --- 
    useEffect(() => {
        if (user) {
            logger.info('[Notifications] User detected, initializing notification stream via store.');
            initNotificationStream(); 
        } else {
             logger.info('[Notifications] No user detected, ensuring notification stream is disconnected.');
            disconnectNotificationStream();
        }

        // Cleanup on component unmount OR when user changes (logs out)
        return () => {
             logger.debug('[Notifications] Component unmounting or user changed, disconnecting stream.');
             disconnectNotificationStream(); 
        };
    // Dependencies: user, initNotificationStream, disconnectNotificationStream
    }, [user, initNotificationStream, disconnectNotificationStream]);
    // --------------------------------------------------------------
    */

    // Callback for when dropdown opens/closes
    const handleOpenChange = useCallback((open: boolean) => {
        if (open) {
            // Clear locally read IDs when dropdown opens
            setLocallyReadIds(new Set());
        }
    }, []); // Empty dependency array, function doesn't depend on external state

    const handleNotificationClick = useCallback((notification: Notification) => {
        logger.debug('[Notifications] Notification clicked', { id: notification.id });
        
        const targetPath = notification.data?.target_path; 

        if (!notification.read) {
             markNotificationRead(notification.id);
             setLocallyReadIds(prev => new Set(prev).add(notification.id));
        }
        
        if (targetPath) { 
            navigate(targetPath);
        }
    }, [markNotificationRead, navigate, setLocallyReadIds]);

    const handleMarkReadClick = useCallback((e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation(); 
        logger.debug('[Notifications] Mark as read clicked', { id: notificationId });
        markNotificationRead(notificationId);
        setLocallyReadIds(prev => new Set(prev).add(notificationId));
    }, [markNotificationRead]); 

    const handleMarkAllReadClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); 
        logger.debug('[Notifications] Mark all as read clicked');
        const idsToMarkLocally = notifications.filter(n => !n.read).map(n => n.id);
        setLocallyReadIds(prev => new Set([...prev, ...idsToMarkLocally]));
        markAllNotificationsAsRead(); 
    }, [markAllNotificationsAsRead, notifications]); 

    // Filter notifications to display
    const displayedNotifications = notifications.filter(n => 
        !n.read || locallyReadIds.has(n.id)
    );

    if (!user) {
        return null; 
    }

    return (
        <SimpleDropdown
            align="end"
            contentClassName="w-80 max-h-[60vh] overflow-y-auto" // Pass specific styles
            onOpenChange={handleOpenChange} // Pass the callback
            trigger={
                // The trigger button itself
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="relative rounded-full" 
                    aria-label="Toggle Notifications"
                >
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
            }
        >
            {/* Children: The content previously inside the absolute div */}
            <div className="px-2 py-1.5 text-sm font-medium flex justify-between items-center">
                <Link to="/notifications" className="hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">
                    Notifications
                </Link>
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
            </div>
            <div className="bg-border -mx-1 my-1 h-px" /> 

            {/* Map over the filtered list */}
            {displayedNotifications.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No unread notifications
                </div>
            ) : (
                displayedNotifications.map((notification) => {
                    const isActuallyUnread = !notification.read;
                    const timeAgo = notification.created_at
                        ? formatDistanceToNowStrict(new Date(notification.created_at), { addSuffix: true })
                        : '';

                    const subject = notification.data?.subject || 'Untitled';
                    const message = notification.data?.message || 'System Notification';

                    const label = `Notification: ${subject}. ${isActuallyUnread ? 'Unread' : 'Read'}. Received ${timeAgo}`;
                    
                    return (
                        <div
                            key={notification.id}
                            data-notification-id={notification.id}
                            aria-label={label}
                            role="menuitem"
                            className={cn(
                                'relative flex cursor-pointer items-start gap-2 rounded-sm px-2 py-3 text-sm outline-none select-none',
                                'hover:bg-primary/10 hover:text-primary',
                                // Slightly different background only if *actually* unread
                                isActuallyUnread && 'bg-muted/50' 
                            )}
                            onClick={() => handleNotificationClick(notification)}
                            tabIndex={-1}
                        >
                            {/* Blue dot indicator only if *actually* unread */}
                            {isActuallyUnread && (
                                <span className="mt-1 block h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" aria-hidden="true" />
                            )}
                            {/* Adjust padding based on dot presence */}
                            <div className={cn("flex-grow", !isActuallyUnread && "pl-4")}> 
                                <p className="text-sm font-medium leading-none mb-1">
                                     {message || subject} 
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {timeAgo}
                                </p>
                            </div>
                            {/* Add Mark as Read button */}
                            {isActuallyUnread && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute top-1 right-1 h-auto px-1 py-0.5 text-muted-foreground hover:text-foreground"
                                    onClick={(e) => handleMarkReadClick(e, notification.id)}
                                    aria-label={`Mark notification "${subject}" as read`}
                                >
                                    <CheckCheck className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    );
                })
            )}
        </SimpleDropdown>
    );
}; 