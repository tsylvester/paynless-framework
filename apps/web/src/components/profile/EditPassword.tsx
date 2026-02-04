import { useAuthStore } from "@paynless/store";
import { AlertCircle, Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
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

const MIN_PASSWORD_LENGTH = 8;

export function EditPassword() {
	const { updatePassword } = useAuthStore((state) => ({
		updatePassword: state.updatePassword,
	}));

	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [validationError, setValidationError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setValidationError(null);

		if (isSubmitting) return;

		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			setValidationError(
				`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
			);
			return;
		}

		if (newPassword !== confirmPassword) {
			setValidationError("Passwords do not match.");
			return;
		}

		setIsSubmitting(true);

		const success = await updatePassword(newPassword);

		if (success) {
			toast.success("Password updated successfully!");
			setNewPassword("");
			setConfirmPassword("");
		} else {
			toast.error("Failed to update password. Please try again.");
		}
		setIsSubmitting(false);
	};

	const hasInput = newPassword.length > 0 || confirmPassword.length > 0;

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-xl font-bold text-textPrimary">
					Password
				</CardTitle>
			</CardHeader>
			<CardContent>
				{validationError && (
					<div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive flex items-center gap-2">
						<AlertCircle size={18} />
						<span>{validationError}</span>
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<Label
							htmlFor="newPassword"
							className="block text-sm font-medium text-textSecondary mb-1"
						>
							New Password
						</Label>
						<Input
							id="newPassword"
							type="password"
							value={newPassword}
							onChange={(e) => {
								setNewPassword(e.target.value);
								setValidationError(null);
							}}
							className="block w-full"
							placeholder="Enter new password"
							disabled={isSubmitting}
							autoComplete="new-password"
						/>
					</div>

					<div>
						<Label
							htmlFor="confirmPassword"
							className="block text-sm font-medium text-textSecondary mb-1"
						>
							Confirm Password
						</Label>
						<Input
							id="confirmPassword"
							type="password"
							value={confirmPassword}
							onChange={(e) => {
								setConfirmPassword(e.target.value);
								setValidationError(null);
							}}
							className="block w-full"
							placeholder="Confirm new password"
							disabled={isSubmitting}
							autoComplete="new-password"
						/>
					</div>
					<CardFooter className="px-0 py-0 pt-2">
						<Button type="submit" disabled={isSubmitting || !hasInput}>
							{isSubmitting && (
								<Loader2 className="h-4 w-4 animate-spin mr-2" />
							)}
							{isSubmitting ? "Updating..." : "Update Password"}
						</Button>
					</CardFooter>
				</form>
			</CardContent>
		</Card>
	);
}
