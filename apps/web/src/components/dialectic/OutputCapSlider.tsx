import { useCallback, useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAuthStore, useDialecticStore } from "@paynless/store";
import { logger } from "@paynless/utils";
import { cn } from "@/lib/utils";
import { Sparkles, Lock, AlertCircle } from "lucide-react";

interface TierDefinition {
	level: number;
	name: string;
	output_cap_tokens: number | null;
	max_models_per_project: number;
}

// Default tier definitions as fallback
const DEFAULT_TIERS: TierDefinition[] = [
	{
		level: 0,
		name: "free",
		output_cap_tokens: 8192,
		max_models_per_project: 1,
	},
	{
		level: 10,
		name: "basic",
		output_cap_tokens: 32768,
		max_models_per_project: 2,
	},
	{
		level: 20,
		name: "premium",
		output_cap_tokens: 131072,
		max_models_per_project: 3,
	},
	{
		level: 30,
		name: "ultra",
		output_cap_tokens: null,
		max_models_per_project: null,
	},
];

interface OutputCapSliderProps {
	className?: string;
	onUpgradeClick?: (tierName: string, tierLevel: number) => void;
	testTierLevel?: number; // Optional prop for testing different tiers
}

export function OutputCapSlider({
	className,
	onUpgradeClick,
	testTierLevel,
}: OutputCapSliderProps) {
	const profile = useAuthStore((state) => state.profile);
	const { maxOutputTokens, setMaxOutputTokens } = useDialecticStore(
		(state) => ({
			maxOutputTokens: state.maxOutputTokens || 8192,
			setMaxOutputTokens: state.setMaxOutputTokens,
		}),
	);

	const [tierDefinitions, setTierDefinitions] =
		useState<TierDefinition[]>(DEFAULT_TIERS);
	const [userTier, setUserTier] = useState<TierDefinition>(DEFAULT_TIERS[0]);
	const [sliderValue, setSliderValue] = useState(maxOutputTokens);
	const [showUpgradeCTA, setShowUpgradeCTA] = useState(false);
	const [upgradeTarget, setUpgradeTarget] = useState<TierDefinition | null>(
		null,
	);

	// TODO: Fetch tier definitions from backend when API endpoint is available
	// For now, using default tier definitions that match the database
	useEffect(() => {
		// In the future, this will fetch from an API endpoint like:
		// api.subscription().getTierDefinitions()
		logger.info('Using default tier definitions');
	}, []);

	// Determine user's tier
	useEffect(() => {
		// If testTierLevel prop is provided, use it for testing
		if (testTierLevel !== undefined) {
			const testTier = tierDefinitions.find((t) => t.level === testTierLevel);
			if (testTier) {
				setUserTier(testTier);
				logger.info('Using test tier level:', { testTierLevel, tierName: testTier.name });
			return;
			}
		}

		// TODO: Fetch actual user tier from backend when API endpoint is available
		// For now, defaulting to free tier for all users
		// In the future, this will call something like:
		// api.subscription().getUserTier(profile.id)
		const defaultTier = tierDefinitions[0]; // Free tier
		setUserTier(defaultTier);
		logger.info('Using default tier for user:', { tierName: defaultTier.name });
	}, [profile?.id, tierDefinitions, testTierLevel]);

	// Get the maximum allowed value for the slider
	const getMaxSliderValue = useCallback(() => {
		if (userTier.output_cap_tokens === null) {
			// Ultra tier - use the highest defined token value or a sensible maximum
			const highestDefinedTier = tierDefinitions
				.filter((t) => t.output_cap_tokens !== null)
				.reduce(
					(max, tier) =>
						tier.output_cap_tokens! > max.output_cap_tokens! ? tier : max,
					tierDefinitions[0],
				);
			return highestDefinedTier.output_cap_tokens || 131072;
		}
		return userTier.output_cap_tokens;
	}, [userTier, tierDefinitions]);

	// Get the minimum value (Free tier)

	// Handle slider value change
	const handleSliderChange = useCallback(
		(value: number[]) => {
			const newValue = value[0];
			const maxAllowed = getMaxSliderValue();

			if (newValue <= maxAllowed) {
				setSliderValue(newValue);
				setShowUpgradeCTA(false);
				setUpgradeTarget(null);
			} else {
				// Snap back to max allowed
				setSliderValue(maxAllowed);

				// Find the tier needed for this value
				const requiredTier = tierDefinitions.find(
					(t) =>
						t.output_cap_tokens === null || t.output_cap_tokens >= newValue,
				);

				if (requiredTier && requiredTier.level > userTier.level) {
					setUpgradeTarget(requiredTier);
					setShowUpgradeCTA(true);
					setTimeout(() => setShowUpgradeCTA(false), 3000); // Hide after 3 seconds
				}
			}
		},
		[getMaxSliderValue, userTier, tierDefinitions],
	);

	// Handle committing the value to the store
	const handleSliderCommit = useCallback(() => {
		setMaxOutputTokens(sliderValue);
		logger.info("Output cap set to:", { maxOutputTokens: sliderValue });
	}, [sliderValue, setMaxOutputTokens]);

	// Handle tier marker click
	const handleTierMarkerClick = useCallback(
		(tier: TierDefinition) => {
			const tierValue = tier.output_cap_tokens;

			if (tierValue === null) {
				// Ultra tier - set to max displayable value
				const maxDisplay = getMaxSliderValue();
				if (userTier.level >= tier.level) {
					setSliderValue(maxDisplay);
					handleSliderCommit();
				} else {
					// Trigger upgrade CTA for ultra
					setUpgradeTarget(tier);
					setShowUpgradeCTA(true);
					if (onUpgradeClick) {
						onUpgradeClick(tier.name, tier.level);
					}
				}
				return;
			}

			if (tierValue <= getMaxSliderValue()) {
				setSliderValue(tierValue);
				handleSliderCommit();
			} else {
				// Need upgrade
				setUpgradeTarget(tier);
				setShowUpgradeCTA(true);
				if (onUpgradeClick) {
					onUpgradeClick(tier.name, tier.level);
				}
			}
		},
		[userTier, getMaxSliderValue, handleSliderCommit, onUpgradeClick],
	);

	// Format token count for display
	const formatTokenCount = (tokens: number) => {
		if (tokens >= 1000000) {
			return `${(tokens / 1000000).toFixed(1)}M`;
		} else if (tokens >= 1000) {
			const k = tokens / 1000;
			return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
		}
		return tokens.toLocaleString();
	};

	// Get tier name for current value
	const getTierForValue = (value: number) => {
		// Find the highest tier that the value fits within
		for (let i = tierDefinitions.length - 1; i >= 0; i--) {
			const tier = tierDefinitions[i];
			if (tier.output_cap_tokens === null || value <= tier.output_cap_tokens) {
				// Check if we have access to this tier
				if (tier.level <= userTier.level) {
					return tier;
				}
			}
		}
		return tierDefinitions[0]; // Default to free
	};

	const currentValueTier = getTierForValue(sliderValue);
	const minValue = 1024;
	const maxValue = getMaxSliderValue();

	// Calculate the highest tier's max value for the slider range display
	const sliderRangeMax = tierDefinitions
		.filter((t) => t.output_cap_tokens !== null)
		.reduce((max, tier) => Math.max(max, tier.output_cap_tokens!), maxValue);

	return (
		<TooltipProvider>
			<div className={cn("space-y-3", className)}>
				{/* Header with current value */}
				<div className="flex items-center justify-between">
					<div className="flex w-full items-center justify-between">
						<h4 className="text-sm font-medium mb-1">Max Output Tokens</h4>
						<div className="flex items-center gap-2">
							<span className="text-lg font-semibold">
								{formatTokenCount(sliderValue)}
							</span>
						</div>
					</div>
				</div>

				{/* Slider with tier markers */}
				<div className="space-y-3">
					{/* Tier markers as buttons */}
					<div className="flex justify-between gap-1">
						{tierDefinitions.map((tier) => {
							const isAccessible = tier.level <= userTier.level;
							const isCurrent = tier.level === userTier.level;
							const isSelected =
								sliderValue >= (tier.output_cap_tokens || 0) &&
								(tier === tierDefinitions[tierDefinitions.length - 1] ||
									sliderValue <
										(tierDefinitions[
											tierDefinitions.findIndex((t) => t === tier) + 1
										]?.output_cap_tokens || Infinity));

							return (
								<Tooltip key={tier.level}>
									<TooltipTrigger asChild>
										<button
											className={cn(
												"flex-1 flex flex-col items-center gap-0.5 px-1 py-1 rounded-md transition-all text-xs",
												isAccessible
													? "hover:bg-accent cursor-pointer"
													: "cursor-not-allowed opacity-40",
												isCurrent && "ring-1 ring-primary/20",
												isSelected && isAccessible && "bg-accent",
											)}
											onClick={() => handleTierMarkerClick(tier)}
											disabled={!isAccessible}
										>
											<div className="flex items-center gap-0.5">
												{tier.output_cap_tokens === null && (
													<Sparkles className="h-2.5 w-2.5" />
												)}
												{!isAccessible && <Lock className="h-2.5 w-2.5" />}
												<span
													className={cn(
														"font-medium capitalize text-[11px]",
														isCurrent && "text-primary",
													)}
												>
													{tier.name}
												</span>
											</div>
											<span className="text-[9px] text-muted-foreground">
												{tier.output_cap_tokens === null
													? "∞"
													: formatTokenCount(tier.output_cap_tokens)}
											</span>
										</button>
									</TooltipTrigger>
									<TooltipContent>
										<div className="space-y-1">
											<p className="font-medium capitalize flex items-center gap-1">
												{tier.output_cap_tokens === null && (
													<Sparkles className="h-3 w-3" />
												)}
												{tier.name} Tier
											</p>
											<p className="text-xs">
												{tier.output_cap_tokens === null
													? "Unlimited output capacity"
													: `Up to ${formatTokenCount(tier.output_cap_tokens)} tokens`}
											</p>
											{!isAccessible && (
												<p className="text-xs flex items-center gap-1">
													<Lock className="h-3 w-3" />
													Upgrade required
												</p>
											)}
										</div>
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>

					{/* Slider container */}
					<div className="relative">
						{/* Visual stops at tier boundaries */}
						<div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none flex justify-between px-[2px]">
							{tierDefinitions.slice(0, -1).map((tier) => {
								if (tier.output_cap_tokens === null) return null;
								const position =
									((tier.output_cap_tokens - minValue) /
										(sliderRangeMax - minValue)) *
									100;
								return (
									<div
										key={tier.level}
										className="absolute w-[2px] h-2 bg-border/50 rounded-full"
										style={{
											left: `${position}%`,
											transform: "translateX(-50%)",
										}}
									/>
								);
							})}
						</div>

						<Slider
							value={[sliderValue]}
							min={minValue}
							max={sliderRangeMax}
							step={1024}
							onValueChange={handleSliderChange}
							onValueCommit={handleSliderCommit}
							className="relative bg-gray-500/90"
							disabled={false}
						/>

						{/* Disabled range overlay for tiers beyond user's access */}
						{userTier.output_cap_tokens &&
							userTier.output_cap_tokens < sliderRangeMax && (
								<div
									className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-muted opacity-60 pointer-events-none rounded-r-full bg-background"
									style={{
										left: `${((userTier.output_cap_tokens - minValue) / (sliderRangeMax - minValue)) * 100}%`,
										right: 0,
									}}
								/>
							)}
					</div>
				</div>

				{/* Helper text */}
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					{userTier.output_cap_tokens === null ? (
						<>
							<Sparkles className="h-3 w-3" />
							<span>Unlimited output capacity with Ultra tier</span>
						</>
					) : (
						<span>
							Your{" "}
							<span className="font-medium capitalize">{userTier.name}</span>{" "}
							tier allows up to{" "}
							<span className="font-medium">
								{formatTokenCount(userTier.output_cap_tokens)}
							</span>{" "}
							tokens
						</span>
					)}
				</div>

				{/* Upgrade CTA */}
				{showUpgradeCTA && upgradeTarget && (
					<div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
						<AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
						<span className="text-amber-900 dark:text-amber-200">
							Upgrade to{" "}
							<span className="font-medium capitalize">
								{upgradeTarget.name}
							</span>
						</span>
						{onUpgradeClick && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() =>
									onUpgradeClick(upgradeTarget.name, upgradeTarget.level)
								}
								className="h-6 px-2 ml-auto text-amber-900 hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
							>
								Upgrade
							</Button>
						)}
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}
