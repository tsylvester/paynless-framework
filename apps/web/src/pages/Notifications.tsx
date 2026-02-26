import React, { useEffect } from "react";
import { useNotificationStore } from "@paynless/store";
import { logger } from "@paynless/utils";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { Bell } from "lucide-react";
import type { Notification } from "@paynless/types";

export const Notifications: React.FC = () => {
	const { notifications, fetchNotifications } = useNotificationStore(
		(state) => ({
			notifications: state.notifications,
			fetchNotifications: state.fetchNotifications,
			unreadCount: state.unreadCount,
		}),
	);

	useEffect(() => {
		if (notifications.length === 0) {
			logger.debug(
				"[NotificationsPage] No notifications in store, fetching...",
			);
			fetchNotifications();
		}
	}, [notifications.length, fetchNotifications]);

	const filteredNotifications = notifications;
	// const readCount = notifications.filter((n) => n.read).length;

	return (
		<div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
			<div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
				{/* Header Section */}
				<div className="mb-8">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-primary/10">
							<Bell className="h-6 w-6 text-primary" />
						</div>
						<div>
							<h1 className="text-2xl sm:text-3xl font-bold text-textPrimary">
								Notifications
							</h1>
							<p className="text-sm text-muted-foreground">
								Stay updated with your latest activity
							</p>
						</div>
					</div>
				</div>

				{filteredNotifications.length === 0 ? (
					<div className="text-center py-12">
						<Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
						<p className="text-muted-foreground text-lg">
							No notifications yet
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							When you receive notifications, they'll appear here
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
						{filteredNotifications.map((notification) => (
							<NotificationCard
								key={notification.id}
								notification={notification}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default Notifications;
