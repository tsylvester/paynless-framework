import { useAuthStore } from "@paynless/store";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { CardSkeleton } from "../components/common/CardSkeleton";
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
	const isLoading = useAuthStore((state) => state.isLoading);
	const error = useAuthStore((state) => state.error);
	const userTier = useAuthStore((state) => state.userTier);

	if (isLoading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div
					data-testid="profile-grid-skeleton-container"
					className="max-w-2xl mx-auto space-y-6"
				>
					<CardSkeleton numberOfFields={2} />
					<CardSkeleton numberOfFields={2} />
					<CardSkeleton numberOfFields={2} />
					<CardSkeleton numberOfFields={2} />
				</div>
			</div>
		);
	}

	if (!currentProfile && error) {
		return (
			<div className="container mx-auto px-4 py-8 text-center">
				<Card className="w-full max-w-md mx-auto border-destructive bg-destructive/10">
					<CardHeader>
						<CardTitle className="flex items-center text-destructive text-lg">
							<AlertTriangle size={20} className="mr-2 shrink-0" />
							Could not load Profile Page
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-destructive/90 text-sm">
							Profile data could not be loaded. {error.message}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

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

	const tierName = userTier ? userTier.name.charAt(0).toUpperCase() + userTier.name.slice(1) : null;
	const outputCap = userTier?.output_cap_tokens != null ? userTier.output_cap_tokens.toLocaleString() : 'Unlimited';
	const maxModels = userTier?.max_models_per_project != null ? String(userTier.max_models_per_project) : 'Unlimited';

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

				{userTier && (
					<ErrorBoundary
						fallback={
							<Card className="w-full border-destructive bg-destructive/10">
								<CardHeader>
									<CardTitle className="flex items-center text-destructive text-lg">
										<AlertTriangle size={20} className="mr-2 shrink-0" />
										Error in Plan & Tier
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
						<Card>
							<CardHeader>
								<CardTitle>Plan & Tier</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Current Tier</span>
									<span className="font-medium">{tierName}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Output Cap</span>
									<span className="font-medium">{outputCap} tokens</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Max Models per Project</span>
									<span className="font-medium">{maxModels}</span>
								</div>
								<Link
									to="/subscription"
									className="inline-block mt-2 text-sm text-primary hover:underline"
								>
									Manage subscription
								</Link>
							</CardContent>
						</Card>
					</ErrorBoundary>
				)}

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
