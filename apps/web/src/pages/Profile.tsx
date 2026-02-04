import { useAuthStore } from "@paynless/store";
import { AlertTriangle } from "lucide-react";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { EditEmail } from "../components/profile/EditEmail";
import { EditName } from "../components/profile/EditName";
import { EditPassword } from "../components/profile/EditPassword";
import { NotificationSettingsCard } from "../components/profile/NotificationSettingsCard";
import { ProfilePrivacySettingsCard } from "../components/profile/ProfilePrivacySettingsCard";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { WalletBalanceDisplay } from "../components/wallet/WalletBalanceDisplay";

export function ProfilePage() {
	const currentProfile = useAuthStore((state) => state.profile);

	if (!currentProfile) {
		return (
			<div className="container mx-auto px-4 py-8 text-center">
				<Card className="w-full max-w-md mx-auto border-destructive bg-destructive/10">
					<CardHeader>
						<CardTitle className="flex items-center text-destructive text-lg">
							<AlertTriangle size={20} className="mr-2 shrink-0" />
							Profile Unavailable
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-destructive/90 text-sm">
							Profile data is unavailable. Please ensure you are logged in and
							try refreshing the page.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<div
				data-testid="profile-grid-container"
				className="max-w-2xl mx-auto space-y-6"
			>
				<ErrorBoundary
					fallback={
						<Card className="w-full border-destructive bg-destructive/10">
							<CardHeader>
								<CardTitle className="flex items-center text-destructive text-lg">
									<AlertTriangle size={20} className="mr-2 shrink-0" />
									Error in Wallet Balance
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-destructive/90 text-sm">
									This section could not be loaded. Please try refreshing.
								</p>
							</CardContent>
						</Card>
					}
				>
					<WalletBalanceDisplay />
				</ErrorBoundary>

				<ErrorBoundary
					fallback={
						<Card className="w-full border-destructive bg-destructive/10">
							<CardHeader>
								<CardTitle className="flex items-center text-destructive text-lg">
									<AlertTriangle size={20} className="mr-2 shrink-0" />
									Error in User Name
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-destructive/90 text-sm">
									This section could not be loaded. Please try refreshing.
								</p>
							</CardContent>
						</Card>
					}
				>
					<EditName />
				</ErrorBoundary>

				<ErrorBoundary
					fallback={
						<Card className="w-full border-destructive bg-destructive/10">
							<CardHeader>
								<CardTitle className="flex items-center text-destructive text-lg">
									<AlertTriangle size={20} className="mr-2 shrink-0" />
									Error in User Email
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-destructive/90 text-sm">
									This section could not be loaded. Please try refreshing.
								</p>
							</CardContent>
						</Card>
					}
				>
					<EditEmail />
				</ErrorBoundary>

				<ErrorBoundary
					fallback={
						<Card className="w-full border-destructive bg-destructive/10">
							<CardHeader>
								<CardTitle className="flex items-center text-destructive text-lg">
									<AlertTriangle size={20} className="mr-2 shrink-0" />
									Error in Update Password
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-destructive/90 text-sm">
									This section could not be loaded. Please try refreshing.
								</p>
							</CardContent>
						</Card>
					}
				>
					<EditPassword />
				</ErrorBoundary>

				<ErrorBoundary
					fallback={
						<Card className="w-full border-destructive bg-destructive/10">
							<CardHeader>
								<CardTitle className="flex items-center text-destructive text-lg">
									<AlertTriangle size={20} className="mr-2 shrink-0" />
									Error in Privacy Settings
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-destructive/90 text-sm">
									This section could not be loaded. Please try refreshing.
								</p>
							</CardContent>
						</Card>
					}
				>
					<ProfilePrivacySettingsCard />
				</ErrorBoundary>

				<ErrorBoundary
					fallback={
						<Card className="w-full border-destructive bg-destructive/10">
							<CardHeader>
								<CardTitle className="flex items-center text-destructive text-lg">
									<AlertTriangle size={20} className="mr-2 shrink-0" />
									Error in Notification Settings
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-destructive/90 text-sm">
									This section could not be loaded. Please try refreshing.
								</p>
							</CardContent>
						</Card>
					}
				>
					<NotificationSettingsCard />
				</ErrorBoundary>
			</div>
		</div>
	);
}
