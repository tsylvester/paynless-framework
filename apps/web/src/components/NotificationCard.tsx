import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
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
    const targetPath = dataObject?.['target_path'] as string | undefined;

    return (
        <Card key={notification.id} data-notification-id={notification.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold">{subject}</CardTitle> {/* Smaller title */} 
                <div className="flex items-center space-x-2">
                    {/* Use custom styles based on theme CSS variables */} 
                    {notification.read ? (
                        <Badge 
                            className="text-xs border-transparent bg-[var(--success-background)] text-[var(--success-foreground)] hover:bg-[var(--success-background)]/80"
                        >
                            Read
                        </Badge>
                    ) : (
                        <Badge 
                            className="text-xs border-transparent bg-[var(--attention-background)] text-[var(--attention-foreground)] hover:bg-[var(--attention-background)]/80"
                        >
                            Unread
                        </Badge>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo}</span>
                </div>
            </CardHeader>
            <CardContent className="pt-2 text-sm"> {/* Added padding top */} 
                {message && <p className="text-muted-foreground mb-3">{message}</p>}

                {/* Display target path if available */}
                {targetPath && (
                     <Button asChild variant="link" size="sm" className="p-0 h-auto text-xs mb-2"> 
                         <Link to={targetPath} className="flex items-center gap-1">
                             View Details <ExternalLink className="h-3 w-3" />
                         </Link>
                    </Button>
                )}

                {/* Display type */}
                {notification.type && (
                    <p className="text-xs text-muted-foreground">
                        Type: <code className='bg-muted/50 p-1 rounded'>{notification.type}</code>
                    </p>
                )}
                
                {/* Optionally keep raw data for debugging? Or remove */}
                {/* 
                <details className="text-xs mt-2">
                    <summary className="cursor-pointer">Raw Data</summary>
                    <pre className="mt-1 p-2 bg-muted/50 rounded overflow-x-auto">
                        {JSON.stringify(notification.data, null, 2)}
                    </pre>
                </details>
                */}
            </CardContent>
        </Card>
    );
}; 