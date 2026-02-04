import { useAuthStore } from "@paynless/store";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const NotificationSettingsCard: React.FC = () => {
	const profile = useAuthStore((state) => state.profile);
	const toggleNewsletterSubscription = useAuthStore(
		(state) => state.toggleNewsletterSubscription,
	);
	const [isSubmitting, setIsSubmitting] = useState(false);

	if (!profile) {
		return null;
	}

	const handleSubscriptionToggle = async (checked: boolean) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			await toggleNewsletterSubscription(checked);
			toast.success("Notification preferences updated!");
		} catch {
			toast.error(
				"Failed to update notification preferences. Please try again.",
			);
		}
		setIsSubmitting(false);
	};

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-xl font-bold text-textPrimary">
					Email Notifications
				</CardTitle>
				<CardDescription>
					Manage your email notification preferences.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label
						htmlFor="newsletter-subscription"
						className="font-semibold text-textSecondary"
					>
						System Notices
					</Label>
					<div className="flex items-center space-x-3 p-4 border rounded-md">
						<Switch
							id="newsletter-subscription"
							checked={!!profile.is_subscribed_to_newsletter}
							onCheckedChange={handleSubscriptionToggle}
							disabled={isSubmitting}
							aria-label="Subscribe to system notices and updates"
						/>
						<Label
							htmlFor="newsletter-subscription"
							className={`flex-grow ${isSubmitting ? "text-muted-foreground" : ""}`}
						>
							System notices and updates
						</Label>
						{isSubmitting && (
							<Loader2 className="h-4 w-4 animate-spin text-primary" />
						)}
					</div>
					<p className="text-sm text-muted-foreground">
						Receive important updates, announcements, and system-related
						notifications.
					</p>
				</div>
			</CardContent>
		</Card>
	);
};
