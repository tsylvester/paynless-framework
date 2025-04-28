import React, { useEffect, useRef, useState, useCallback } from 'react';
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
    // Infer type from selector directly
    const { user, token } = useAuthStore(state => ({ user: state.user, token: state.token }));
    const {
        notifications,
        unreadCount,
        addNotification, 
        markNotificationRead, 
        markAllNotificationsAsRead, 
        fetchNotifications, // Get fetch action from store
        // isLoading, // Optional: Could use loading state from store
        // error, // Optional: Could use error state from store
    } = useNotificationStore(); // Use default hook return type

    const navigate = useNavigate();
    // const [isOpen, setIsOpen] = useState(false); // Remove state, handled by SimpleDropdown
    // Use ref to hold EventSource instance
    const eventSourceRef = useRef<EventSource | null>(null);
    // State to track items marked read during this dropdown session
    const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(new Set());

    // Fetch initial notifications using the API client
    useEffect(() => {
        if (user) {
            logger.debug('[Notifications] User found, triggering fetchNotifications store action.');
            fetchNotifications(); // Call the action from the store
            // Store action handles success/error/loading internally
        }
    }, [user, fetchNotifications]); // Add fetchNotifications to dependency array

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

    // Callback for when dropdown opens/closes
    const handleOpenChange = useCallback((open: boolean) => {
        if (open) {
            // Clear locally read IDs when dropdown opens
            setLocallyReadIds(new Set());
        }
    }, []); // Empty dependency array, function doesn't depend on external state

    const handleNotificationClick = useCallback((notification: Notification) => {
         logger.debug('[Notifications] Notification clicked', { id: notification.id });
        if (!notification.read) {
             markNotificationRead(notification.id);
             // Add to locally read set *after* initiating the mark as read action
             setLocallyReadIds(prev => new Set(prev).add(notification.id));
        }
        const targetPath = notification.data?.['target_path']; 
        if (targetPath && typeof targetPath === 'string') { 
            navigate(targetPath);
            // Maybe close dropdown here?
        }
    }, [markNotificationRead, navigate]); // Add dependencies

    const handleMarkReadClick = useCallback((e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation(); 
        logger.debug('[Notifications] Mark as read clicked', { id: notificationId });
        markNotificationRead(notificationId);
        // Add to locally read set *after* initiating the mark as read action
        setLocallyReadIds(prev => new Set(prev).add(notificationId));
    }, [markNotificationRead]); // Add dependency

    const handleMarkAllReadClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); 
        logger.debug('[Notifications] Mark all as read clicked');
        // Mark all items currently *unread* in the store as locally read
        const idsToMarkLocally = notifications.filter(n => !n.read).map(n => n.id);
        setLocallyReadIds(prev => new Set([...prev, ...idsToMarkLocally]));
        // Call store action
        markAllNotificationsAsRead(); 
    }, [markAllNotificationsAsRead, notifications]); // Add dependencies

    // Filter notifications to display
    const displayedNotifications = notifications.filter(n => 
        !n.read || // Show if it's actually unread in the store
        locallyReadIds.has(n.id) // OR if it was marked read locally this session
    );

    // Filter notifications to only show unread
    const unreadNotifications = notifications.filter(n => !n.read);

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

    // console.log('[Notifications] Rendering'); // No longer need isOpen here

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
                    // No onClick needed here, SimpleDropdown wraps it
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
                    const isActuallyUnread = !notification.read; // Check the actual store state
                    const timeAgo = notification.created_at
                        ? formatDistanceToNowStrict(new Date(notification.created_at), { addSuffix: true })
                        : '';
                    const subject = notification.data?.['subject'] || 'Untitled';
                    const message = notification.data?.['message'] || 'System Notification';
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
                                     {message}
                                </p>
                                 <p className="text-xs text-muted-foreground">
                                     {timeAgo}
                                </p>
                             </div>
                             {/* Show mark read button only if *actually* unread */}
                             {isActuallyUnread && (
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
                        </div>
                    );
                })
            )}
        </SimpleDropdown>
    );
}; 