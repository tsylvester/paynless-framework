import React from "react";
import { useAiStore } from "@paynless/store";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { logger } from "@paynless/utils";

export const ContinueUntilCompleteToggle: React.FC = () => {
	const continueUntilComplete = useAiStore(
		(state) => state.continueUntilComplete,
	);
	const setContinueUntilComplete = useAiStore(
		(state) => state.setContinueUntilComplete,
	);

	const handleToggle = (checked: boolean) => {
		setContinueUntilComplete(checked);
		logger.info(
			`[ContinueUntilCompleteToggle] Setting continueUntilComplete to: ${checked}`,
		);
	};

	return (
		<div className="flex items-center space-x-2">
			<Switch
				id="continue-until-complete"
				checked={continueUntilComplete}
				onCheckedChange={handleToggle}
				aria-label="Continue until complete"
				className="data-[state=unchecked]:bg-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			/>
			<Label htmlFor="continue-until-complete" className="flex-grow pr-2">
				Continue until complete
			</Label>
		</div>
	);
};
