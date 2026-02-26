"use client";

import { useAuthStore } from "@paynless/store";
import type { ProfilePrivacySetting } from "@paynless/types";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const ProfilePrivacySettingsCard: React.FC = () => {
	const profile = useAuthStore((state) => state.profile);
	const isLoading = useAuthStore((state) => state.isLoading);
	const error = useAuthStore((state) => state.error);
	const updateProfile = useAuthStore((state) => state.updateProfile);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const currentSetting = profile?.profile_privacy_setting;

	const handleSettingChange = async (newSetting: ProfilePrivacySetting) => {
		if (newSetting && newSetting !== currentSetting) {
			setIsSubmitting(true);
			const result = await updateProfile({
				profile_privacy_setting: newSetting,
			});
			if (result) {
				toast.success("Privacy setting updated successfully!");
			} else {
				toast.error("Failed to update privacy setting. Please try again.");
			}
			setIsSubmitting(false);
		}
	};

	if (!profile) {
		return (
			<Card className="w-full">
				<CardHeader>
					<CardTitle className="text-xl font-bold text-textPrimary">
						Profile Privacy
					</CardTitle>
					<CardDescription>
						Adjust who can see your profile information.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">Loading profile settings...</p>
				</CardContent>
			</Card>
		);
	}

	const privacyOptions: {
		value: ProfilePrivacySetting;
		label: string;
		description: string;
	}[] = [
		{
			value: "private",
			label: "Private",
			description:
				"Only you and members of organizations you share can see your profile details.",
		},
		{
			value: "public",
			label: "Public",
			description: "Anyone can see your basic profile details (name, avatar).",
		},
	];

	const selectedOptionDetails = privacyOptions.find(
		(opt) => opt.value === (currentSetting || "private"),
	);

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-xl font-bold text-textPrimary">
					Profile Privacy
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<div data-testid="error-message" className="text-sm text-destructive">
						Error updating settings: {error.message}
					</div>
				)}
				{(isSubmitting || isLoading) && (
					<div
						data-testid="loading-indicator"
						className="flex items-center gap-2 text-sm text-muted-foreground"
					>
						<Loader2 className="h-4 w-4 animate-spin" />
						Saving settings...
					</div>
				)}
				<div className="space-y-2">
					<Label
						htmlFor="profile-privacy-select"
						className="font-semibold text-textSecondary"
					>
						Privacy Setting
					</Label>
					<Select
						value={currentSetting || "private"}
						onValueChange={(value) =>
							handleSettingChange(value as ProfilePrivacySetting)
						}
						disabled={isSubmitting || isLoading || !profile}
						name="profile-privacy-select"
					>
						<SelectTrigger
							className="w-full text-left"
							data-testid="privacy-select-trigger"
							id="profile-privacy-select"
						>
							{(isSubmitting || isLoading) && (
								<Loader2 className="h-4 w-4 animate-spin mr-2" />
							)}
							{selectedOptionDetails ? (
								<span className="font-medium">
									{selectedOptionDetails.label}
								</span>
							) : (
								<SelectValue placeholder="Select your profile privacy" />
							)}
						</SelectTrigger>
						<SelectContent
							className="bg-popover/80 backdrop-blur-md max-h-96"
							data-testid="select-content-wrapper"
						>
							{privacyOptions.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
									className="cursor-pointer"
									data-testid={`privacy-option-${option.value}`}
								>
									<div className="flex flex-col">
										<span className="font-medium">{option.label}</span>
										<span className="text-xs text-muted-foreground">
											{option.description}
										</span>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{selectedOptionDetails && (
						<p
							className="text-sm text-muted-foreground"
							data-testid="selected-privacy-description"
						>
							{selectedOptionDetails.description}
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
