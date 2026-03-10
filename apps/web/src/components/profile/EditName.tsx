import { useAuthStore } from "@paynless/store";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EditName() {
	const { profile, updateProfile } = useAuthStore((state) => ({
		profile: state.profile,
		updateProfile: state.updateProfile,
	}));

	const [firstName, setFirstName] = useState(profile?.first_name || "");
	const [lastName, setLastName] = useState(profile?.last_name || "");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isLoading = isSubmitting;

	useEffect(() => {
		if (profile) {
			setFirstName(profile.first_name || "");
			setLastName(profile.last_name || "");
		}
	}, [profile]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isLoading || !profile) return;

		const originalFirstName = profile.first_name || "";
		const originalLastName = profile.last_name || "";

		if (firstName === originalFirstName && lastName === originalLastName) {
			return;
		}

		setIsSubmitting(true);

		const result = await updateProfile({
			first_name: firstName,
			last_name: lastName,
		});

		if (result) {
			toast.success("Name updated successfully!");
		} else {
			toast.error("Failed to update name. An unexpected error occurred.");
		}
		setIsSubmitting(false);
	};

	if (!profile) {
		return (
			<Card className="w-full">
				<CardHeader>
					<CardTitle className="text-xl font-bold text-textPrimary">
						Name
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p>Loading profile data...</p>
				</CardContent>
			</Card>
		);
	}

	const hasChanged =
		(profile.first_name || "") !== firstName ||
		(profile.last_name || "") !== lastName;

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-xl font-bold text-textPrimary">
					Name
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<Label
							htmlFor="firstName"
							className="block text-sm font-medium text-textSecondary mb-1"
						>
							First Name
						</Label>
						<Input
							id="firstName"
							type="text"
							value={firstName}
							onChange={(e) => setFirstName(e.target.value)}
							className="block w-full"
							placeholder="Enter first name"
							disabled={isLoading}
						/>
					</div>

					<div>
						<Label
							htmlFor="lastName"
							className="block text-sm font-medium text-textSecondary mb-1"
						>
							Last Name
						</Label>
						<Input
							id="lastName"
							type="text"
							value={lastName}
							onChange={(e) => setLastName(e.target.value)}
							className="block w-full"
							placeholder="Enter last name"
							disabled={isLoading}
						/>
					</div>
					<CardFooter className="px-0 py-0 pt-2">
						<Button type="submit" disabled={isLoading || !hasChanged}>
							{isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
							{isLoading ? "Saving..." : "Save"}
						</Button>
					</CardFooter>
				</form>
			</CardContent>
		</Card>
	);
}
