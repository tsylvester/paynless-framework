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

export function EditEmail() {
	const { user, updateEmail } = useAuthStore((state) => ({
		user: state.user,
		updateEmail: state.updateEmail,
	}));

	const [email, setEmail] = useState(user?.email || "");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const originalEmailFromAuth = user?.email || "";

	const isLoading = isSubmitting;

	useEffect(() => {
		if (user?.email) {
			setEmail(user.email);
		}
	}, [user?.email]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isLoading || !user) return;

		if (email === originalEmailFromAuth) {
			return;
		}

		setIsSubmitting(true);
		const result = await updateEmail(email);

		if (result) {
			toast.success(
				"Email update request sent! Check your inbox for verification.",
			);
		} else {
			toast.error("Failed to update email. An unexpected error occurred.");
		}
		setIsSubmitting(false);
	};

	if (!user) {
		return (
			<Card className="w-full">
				<CardHeader>
					<CardTitle className="text-xl font-bold text-textPrimary">
						Email
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p>Loading email settings...</p>
				</CardContent>
			</Card>
		);
	}

	const hasChanged = email !== originalEmailFromAuth;

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-xl font-bold text-textPrimary">
					Email
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<Label
							htmlFor="email"
							className="block text-sm font-medium text-textSecondary mb-1"
						>
							Email Address
						</Label>
						<Input
							type="email"
							id="email"
							name="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="block w-full"
							placeholder="your.email@example.com"
							disabled={isLoading}
						/>
						<p className="mt-2 text-sm text-muted-foreground">
							Changing your email requires re-verification.
						</p>
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
