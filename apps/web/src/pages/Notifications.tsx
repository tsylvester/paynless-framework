import React, { useEffect } from 'react';
import { useNotificationStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { Layout } from '@/components/layout/Layout';
import { NotificationCard } from '@/components/NotificationCard';

export const Notifications: React.FC = () => {
    const { notifications, fetchNotifications } = useNotificationStore(state => ({
        notifications: state.notifications,
        fetchNotifications: state.fetchNotifications,
    }));

    useEffect(() => {
        if (notifications.length === 0) {
            logger.debug('[NotificationsPage] No notifications in store, fetching...');
            fetchNotifications();
        }
    }, [notifications.length, fetchNotifications]);

    return (
        <Layout>
            <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
                <h1 className="text-3xl font-bold mb-6">Notification History</h1>
                {notifications.length === 0 ? (
                    <p className="text-muted-foreground">You have no notifications.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {notifications.map((notification) => (
                            <NotificationCard key={notification.id} notification={notification} />
                        ))}
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default Notifications;
