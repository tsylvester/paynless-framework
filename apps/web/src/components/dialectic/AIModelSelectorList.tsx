import React, { Fragment, useEffect, useMemo, useState } from "react";
import { useAiStore, useAuthStore } from "@paynless/store";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AiProvider, UserTier } from "@paynless/types";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface AIModelSelectorListProps {
	disabled?: boolean;
	onChange: (modelsChecked: string[]) => void;
}

function tierDisplayName(level: number, availableTiers: UserTier[]): string {
	for (const tier of availableTiers) {
		if (tier.level === level) {
			const name: string = tier.name;
			return name.charAt(0).toUpperCase() + name.slice(1);
		}
	}
	throw new Error(
		`AIModelSelectorList: no tier definition for level ${level} in availableTiers`,
	);
}

function resolveNextTierName(
	availableTiers: UserTier[],
	effectiveUserTier: UserTier,
	modelLimit: number | null,
): string {
	const sortedTiers: UserTier[] = [...availableTiers].sort(
		(a, b) => a.level - b.level,
	);
	for (const tier of sortedTiers) {
		if (tier.level <= effectiveUserTier.level) {
			continue;
		}
		if (tier.max_models_per_project === null) {
			return tierDisplayName(tier.level, availableTiers);
		}
		if (modelLimit !== null && tier.max_models_per_project > modelLimit) {
			return tierDisplayName(tier.level, availableTiers);
		}
	}
	throw new Error(
		"AIModelSelectorList: no upgrade tier with higher model limit in availableTiers",
	);
}

export const AIModelSelectorList: React.FC<AIModelSelectorListProps> = ({
	onChange,
	disabled: disabledProp,
}) => {
	const [modelsChecked, setModelsChecked] = useState<string[]>([]);

	const availableProviders = useAiStore((state) => state.availableProviders);
	const isConfigLoading = useAiStore((state) => state.isConfigLoading);
	const loadAiConfig = useAiStore((state) => state.loadAiConfig);
	const aiError = useAiStore((state) => state.aiError);

	const userTier = useAuthStore((s) => s.userTier);
	const availableTiers = useAuthStore((s) => s.availableTiers);

	const effectiveUserTier: UserTier = useMemo(() => {
		if (userTier !== null) {
			return userTier;
		}
		for (const tier of availableTiers) {
			if (tier.level === 0) {
				return tier;
			}
		}
		throw new Error(
			"AIModelSelectorList: userTier is null and no level-0 tier in availableTiers",
		);
	}, [userTier, availableTiers]);

	const modelLimit: number | null = effectiveUserTier.max_models_per_project;
	const checkedCount: number = modelsChecked.length;
	const atCap: boolean = modelLimit !== null && checkedCount >= modelLimit;

	const toggleModelChecked = (providerId: string): void => {
		if (disabledProp) {
			return;
		}

		const providerFromStore = availableProviders.find(
			(p) => p.id === providerId,
		);
		if (providerFromStore === undefined) {
			throw new Error(
				`AIModelSelectorList: no provider found for id ${providerId}`,
			);
		}
		const provider: AiProvider = providerFromStore;

		const tierLocked: boolean =
			provider.min_plan_tier_level > effectiveUserTier.level;
		const isChecked: boolean = modelsChecked.includes(provider.id);

		if (tierLocked) {
			return;
		}
		if (atCap && !isChecked) {
			return;
		}

		const newModelsChecked: string[] = isChecked
			? modelsChecked.filter((id) => id !== providerId)
			: [...modelsChecked, providerId];
		setModelsChecked(newModelsChecked);
		onChange(newModelsChecked);
	};

	useEffect(() => {
		if (
			!isConfigLoading &&
			(!availableProviders || availableProviders.length === 0) &&
			!aiError
		) {
			loadAiConfig();
		}
	}, [loadAiConfig, isConfigLoading, availableProviders, aiError]);

	return (
		<div className="border-gray-200 border-1 flex flex-col h-full flex-grow">
			<ScrollArea className="h-full overflow-y-auto flex-grow w-[330px] mx-auto">
				{availableProviders
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((provider) => {
						const tierLocked: boolean =
							provider.min_plan_tier_level > effectiveUserTier.level;
						const isChecked: boolean = modelsChecked.includes(provider.id);
						const blockedAdd: boolean = tierLocked || (atCap && !isChecked);
						const finalRowDisabled: boolean =
							disabledProp || tierLocked || (atCap && !isChecked);

						const rowTestId: string =
							!tierLocked && atCap && !isChecked
								? `model-cap-row-${provider.id}`
								: `model-list-item-${provider.id}`;

						const rowButton = (
							<div
								role="button"
								tabIndex={finalRowDisabled ? -1 : 0}
								aria-disabled={finalRowDisabled}
								data-testid={rowTestId}
								className={cn(
									"flex w-full items-center p-2 rounded-md gap-1 text-left focus:outline-none border border-gray-500/10 hover:cursor-pointer my-2 hover:border-gray-500/50",
									tierLocked && "opacity-50 cursor-not-allowed",
									blockedAdd && !tierLocked && "opacity-50 cursor-not-allowed",
								)}
								onClick={() => toggleModelChecked(provider.id)}
								onKeyDown={(e) => {
									if (e.key === " " || e.key === "Enter") {
										e.preventDefault();
										if (!blockedAdd) {
											toggleModelChecked(provider.id);
										}
									}
								}}
							>
								<div className="flex-shrink-0">
									<Checkbox
										checked={isChecked}
										disabled={finalRowDisabled}
									/>
								</div>
								{tierLocked ? (
									<span
										data-testid={`tier-lock-${provider.id}`}
										className="flex-1 min-w-0 ml-2 truncate text-xs font-mono flex items-center gap-1"
										title={provider.name}
									>
										<Lock className="h-4 w-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground">
											Requires{" "}
											{tierDisplayName(
												provider.min_plan_tier_level,
												availableTiers,
											)}
										</span>
									</span>
								) : (
									<span
										className="flex-1 min-w-0 ml-2 truncate text-xs font-mono"
										title={provider.name}
									>
										{provider.name.toLowerCase()}
									</span>
								)}
							</div>
						);

						if (tierLocked) {
							const requiredTierName: string = tierDisplayName(
								provider.min_plan_tier_level,
								availableTiers,
							);
							return (
								<Tooltip key={provider.id}>
									<TooltipTrigger asChild>{rowButton}</TooltipTrigger>
									<TooltipContent>
										<p>
											This model requires a {requiredTierName} plan.
										</p>
										<Link
											to="/subscription"
											data-testid={`upgrade-link-tier-${provider.id}`}
											onClick={(e) => e.stopPropagation()}
										>
											Upgrade to {requiredTierName}
										</Link>
									</TooltipContent>
								</Tooltip>
							);
						}

						if (atCap && !isChecked) {
							if (modelLimit === null) {
								throw new Error(
									"AIModelSelectorList: atCap with null modelLimit",
								);
							}
							const capNextTierName: string = resolveNextTierName(
								availableTiers,
								effectiveUserTier,
								modelLimit,
							);
							return (
								<Tooltip key={provider.id}>
									<TooltipTrigger asChild>{rowButton}</TooltipTrigger>
									<TooltipContent>
										<p>
											You&apos;ve reached the model limit for your plan (
											{checkedCount}/{modelLimit}). Upgrade to{" "}
											{capNextTierName} to add more models.
										</p>
										<Link
											to="/subscription"
											data-testid={`upgrade-link-cap-${provider.id}`}
											onClick={(e) => e.stopPropagation()}
										>
											Upgrade to {capNextTierName}
										</Link>
									</TooltipContent>
								</Tooltip>
							);
						}

						return <Fragment key={provider.id}>{rowButton}</Fragment>;
					})}
			</ScrollArea>
		</div>
	);
};
