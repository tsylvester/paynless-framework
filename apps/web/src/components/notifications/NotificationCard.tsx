import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Bell, AlertCircle, CheckCircle, Info, Mail } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Notification } from '@paynless/types';
import { cn } from '@/lib/utils';

interface NotificationCardProps {
    notification: Notification;
}

export const NotificationCard: React.FC<NotificationCardProps> = ({ notification }) => {
    const timeAgo = notification.created_at
        ? formatDistanceToNowStrict(new Date(notification.created_at), { addSuffix: true })
        : 'Unknown time';

    // Safely access data properties with type checking
    const dataObject = (typeof notification.data === 'object' && notification.data !== null && !Array.isArray(notification.data))
        ? notification.data
        : null;

    const subject = dataObject?.['subject'] as string || 'System Notification';
    const message = dataObject?.['message'] as string || '';
    
    // Check for explicit target_path, then attempt to construct one for Dialectic notifications
    let targetPath = dataObject?.['target_path'] as string | undefined;
    const projectId = dataObject?.['projectId'] as string | undefined;
    const sessionId = dataObject?.['sessionId'] as string | undefined;

    if (!targetPath && projectId && sessionId) {
        targetPath = `/dialectic/${projectId}/session/${sessionId}`;
    }

    // Get notification type icon
    const getNotificationIcon = (type: string | undefined) => {
        switch (type?.toLowerCase()) {
            case 'dialectic_invite':
            case 'organization_invite':
                return <Mail className="h-5 w-5 text-blue-500" />;
            case 'error':
            case 'warning':
                return <AlertCircle className="h-5 w-5 text-orange-500" />;
            case 'success':
                return <CheckCircle className="h-5 w-5 text-green-500" />;
            case 'info':
                return <Info className="h-5 w-5 text-blue-500" />;
            default:
                return <Bell className="h-5 w-5 text-gray-500" />;
        }
    };

    // Get notification type styling
    const getNotificationStyling = (type: string | undefined) => {
        switch (type?.toLowerCase()) {
            case 'dialectic_invite':
            case 'organization_invite':
                return 'border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20';
            case 'error':
            case 'warning':
                return 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20';
            case 'success':
                return 'border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20';
            case 'info':
                return 'border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20';
            default:
                return 'border-l-4 border-l-gray-300 bg-surface';
        }
    };

    return (
        <Card 
            key={notification.id} 
            data-notification-id={notification.id}
            className={cn(
                "transition-all duration-200 hover:shadow-lg hover:-translate-y-1",
                getNotificationStyling(notification.type),
                !notification.read && "ring-2 ring-primary/20"
            )}
        >
            <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                        {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
                                {subject}
                            </CardTitle>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                {notification.read ? (
                                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                                        Read
                                    </Badge>
                                ) : (
                                    <Badge className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                                        New
                                    </Badge>
                                )}
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {timeAgo}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                {message && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                        {message}
                    </p>
                )}

                <div className="flex items-center justify-between">
                    {notification.type && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Type:</span>
                            <Badge variant="outline" className="text-xs capitalize">
                                {notification.type.replace('_', ' ')}
                            </Badge>
                        </div>
                    )}
                    
                    {targetPath && (
                        <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs">
                            <Link to={targetPath} className="flex items-center gap-1.5">
                                View Details
                                <ExternalLink className="h-3 w-3" />
                            </Link>
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};