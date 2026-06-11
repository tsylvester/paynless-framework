import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent,
	type ReactElement,
} from "react";
import { useNavigate } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAuthStore, useDialecticStore } from "@paynless/store";
import { UserTier } from "@paynless/types";
import { isAiModelExtendedConfig, logger } from "@paynless/utils";
import { cn } from "@/lib/utils";
import { Sparkles, Lock, AlertCircle } from "lucide-react";

const MIN_OUTPUT_TOKENS = 1024;
const SLIDER_STEPS_PER_SEGMENT = 50;
const UPGRADE_CTA_THRESHOLD_RATIO = 0.85;
const LOADING_SUBSCRIPTION_TIER_MESSAGE = "Loading subscription tier…";
const SUBSCRIPTION_TIER_UNAVAILABLE_MESSAGE =
	"Subscription tier is not available.";
const NO_TIERS_LOADED_MESSAGE = "Subscription tiers are not loaded.";
const NO_MODELS_SELECTED_MESSAGE = "No models selected.";
const OUTPUT_CAP_NOT_INITIALIZED_MESSAGE =
	"Output cap is not initialized in dialectic store.";

interface OutputCapSliderProps {
	className?: string;
}

export function OutputCapSlider({ className }: OutputCapSliderProps) {
	const navigate = useNavigate();
	const isLoading = useAuthStore((state) => state.isLoading);
	const authError = useAuthStore((state) => state.error);
	const userTier = useAuthStore((state) => state.userTier);
	const availableTiers = useAuthStore((state) => state.availableTiers);
	const maxOutputTokens = useDialecticStore((state) => state.maxOutputTokens);
	const setMaxOutputTokens = useDialecticStore(
		(state) => state.setMaxOutputTokens,
	);
	const modelCatalog = useDialecticStore((state) => state.modelCatalog);
	const selectedModels = useDialecticStore((state) => state.selectedModels);

	const sliderRangeMax = useMemo(() => {
		if (selectedModels === null) {
			return null;
		}
		if (selectedModels === undefined) {
			return null;
		}
		if (selectedModels.length === 0) {
			return null;
		}

		let highest: number | null = null;
		for (const selectedModel of selectedModels) {
			for (const catalogEntry of modelCatalog) {
				if (catalogEntry.id !== selectedModel.id) {
					continue;
				}

				const config = catalogEntry.config;
				if (!isAiModelExtendedConfig(config)) {
					continue;
				}

				let applicationCap: number = Infinity;
				if (config.hard_cap_output_tokens !== undefined) {
					applicationCap = config.hard_cap_output_tokens;
				}

				let providerCap: number = Infinity;
				if (config.provider_max_output_tokens !== undefined) {
					providerCap = config.provider_max_output_tokens;
				}

				const modelMaxOutputTokens: number = Math.min(
					applicationCap,
					providerCap,
				);
				if (!Number.isFinite(modelMaxOutputTokens)) {
					continue;
				}

				if (highest === null) {
					highest = modelMaxOutputTokens;
					continue;
				}
				if (modelMaxOutputTokens > highest) {
					highest = modelMaxOutputTokens;
				}
			}
		}
		return highest;
	}, [selectedModels, modelCatalog]);

	const invalidCatalogConfigModelId: string | null = useMemo(() => {
		if (selectedModels === null) {
			return null;
		}
		if (selectedModels === undefined) {
			return null;
		}
		if (selectedModels.length === 0) {
			return null;
		}

		for (const selectedModel of selectedModels) {
			for (const catalogEntry of modelCatalog) {
				if (catalogEntry.id !== selectedModel.id) {
					continue;
				}
				if (!isAiModelExtendedConfig(catalogEntry.config)) {
					return selectedModel.id;
				}
				break;
			}
		}
		return null;
	}, [selectedModels, modelCatalog]);

	const displayTiers: UserTier[] = useMemo(() => {
		const filteredTiers: UserTier[] = [];
		for (const tier of availableTiers) {
			if (tier.name !== "unreachable") {
				filteredTiers.push(tier);
			}
		}
		filteredTiers.sort((left, right) => left.level - right.level);

		if (sliderRangeMax === null) {
			return filteredTiers;
		}

		const modelLimitedTiers: UserTier[] = [];
		let previousValue: number = MIN_OUTPUT_TOKENS;
		for (const tier of filteredTiers) {
			if (tier.output_cap_tokens === null) {
				if (sliderRangeMax > previousValue) {
					const modelLimitedTier: UserTier = {
						level: tier.level,
						name: tier.name,
						output_cap_tokens: sliderRangeMax,
						max_models_per_project: tier.max_models_per_project,
					};
					modelLimitedTiers.push(modelLimitedTier);
				}
				break;
			}

			if (tier.output_cap_tokens > sliderRangeMax) {
				if (sliderRangeMax > previousValue) {
					const modelLimitedTier: UserTier = {
						level: tier.level,
						name: tier.name,
						output_cap_tokens: sliderRangeMax,
						max_models_per_project: tier.max_models_per_project,
					};
					modelLimitedTiers.push(modelLimitedTier);
				}
				break;
			}

			modelLimitedTiers.push(tier);
			previousValue = tier.output_cap_tokens;
		}
		return modelLimitedTiers;
	}, [availableTiers, sliderRangeMax]);

	const [sliderRealValue, setSliderRealValue] = useState(MIN_OUTPUT_TOKENS);
	const [showUpgradeCTA, setShowUpgradeCTA] = useState(false);
	const [upgradeTargetName, setUpgradeTargetName] = useState("");
	const sliderRegionRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (maxOutputTokens === null) {
			return;
		}
		if (!Number.isFinite(maxOutputTokens)) {
			return;
		}
		setSliderRealValue(maxOutputTokens);
	}, [maxOutputTokens]);

	useEffect(() => {
		if (sliderRangeMax === null) {
			return;
		}
		if (userTier === null) {
			return;
		}

		let thumbMaxForLog: number;
		if (userTier.output_cap_tokens !== null) {
			thumbMaxForLog = Math.min(userTier.output_cap_tokens, sliderRangeMax);
		} else {
			thumbMaxForLog = sliderRangeMax;
		}

		let selectedModelCount = 0;
		if (selectedModels !== null) {
			if (selectedModels !== undefined) {
				selectedModelCount = selectedModels.length;
			}
		}

		logger.info("[OutputCapSlider] Effective output cap bounds", {
			tierCap: userTier.output_cap_tokens,
			sliderRangeMax,
			thumbMax: thumbMaxForLog,
			selectedModelCount,
		});
	}, [sliderRangeMax, userTier, selectedModels]);

	useEffect(() => {
		if (sliderRangeMax === null) {
			return;
		}
		const thumb = sliderRegionRef.current?.querySelector(
			'[data-slot="slider-thumb"]',
		);
		if (thumb === null) {
			return;
		}
		if (thumb === undefined) {
			return;
		}
		thumb.setAttribute("aria-valuenow", String(sliderRealValue));
		thumb.setAttribute("aria-valuemin", String(MIN_OUTPUT_TOKENS));
		thumb.setAttribute("aria-valuemax", String(sliderRangeMax));
	}, [sliderRealValue, sliderRangeMax]);

	const formatTokenCount = useCallback((tokens: number): string => {
		if (tokens >= 1000000) {
			return `${(tokens / 1000000).toFixed(1)}M`;
		}
		if (tokens >= 1000) {
			const k = tokens / 1000;
			if (k % 1 === 0) {
				return `${k}k`;
			}
			return `${k.toFixed(1)}k`;
		}
		return tokens.toLocaleString();
	}, []);

	const formatPageGuidance = useCallback((tokens: number): string => {
		const words = Math.round(tokens * 0.75);
		const pages = Math.round(words / 250);
		if (pages < 1) {
			return `at most ~${words} words`;
		}
		return `at most ~${pages} pages`;
	}, []);

	const applyOutputCapValue = useCallback(
		(
			requestedReal: number,
			persistToStore: boolean,
		) => {
			if (userTier === null) {
				return;
			}
			if (sliderRangeMax === null) {
				return;
			}

			let thumbMax: number;
			if (userTier.output_cap_tokens !== null) {
				thumbMax = Math.min(userTier.output_cap_tokens, sliderRangeMax);
			} else {
				thumbMax = sliderRangeMax;
			}

			let requiredTierFound = false;
			let requiredTierName = "";
			for (const tier of displayTiers) {
				if (tier.level <= userTier.level) {
					continue;
				}
				if (tier.output_cap_tokens === null) {
					requiredTierFound = true;
					requiredTierName = tier.name;
					break;
				}
				if (requestedReal <= tier.output_cap_tokens) {
					requiredTierFound = true;
					requiredTierName = tier.name;
					break;
				}
			}

			const upgradeThreshold: number = thumbMax * UPGRADE_CTA_THRESHOLD_RATIO;
			const shouldShowUpgradeCTA: boolean =
				requiredTierFound && requestedReal >= upgradeThreshold;

			if (requestedReal <= thumbMax) {
				setSliderRealValue(requestedReal);
				if (shouldShowUpgradeCTA) {
					setUpgradeTargetName(requiredTierName);
					setShowUpgradeCTA(true);
				} else {
					setShowUpgradeCTA(false);
				}
				if (persistToStore) {
					setMaxOutputTokens(requestedReal);
					logger.info("Output cap set to:", {
						maxOutputTokens: requestedReal,
					});
				}
				return;
			}

			setSliderRealValue(thumbMax);

			if (!requiredTierFound) {
				return;
			}
			setUpgradeTargetName(requiredTierName);
			setShowUpgradeCTA(true);
		},
		[userTier, sliderRangeMax, displayTiers, setMaxOutputTokens],
	);

	const handleUpgradeClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		navigate("/subscription");
	}, [navigate]);

	if (isLoading) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-loading-notice"
					className="text-xs text-muted-foreground"
				>
					{LOADING_SUBSCRIPTION_TIER_MESSAGE}
				</p>
			</div>
		);
	}

	if (authError !== null) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-blocked-notice"
					className="text-xs text-muted-foreground"
				>
					{authError.message}
				</p>
			</div>
		);
	}

	if (userTier === null) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-blocked-notice"
					className="text-xs text-muted-foreground"
				>
					{SUBSCRIPTION_TIER_UNAVAILABLE_MESSAGE}
				</p>
			</div>
		);
	}

	if (availableTiers.length === 0) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-blocked-notice"
					className="text-xs text-muted-foreground"
				>
					{NO_TIERS_LOADED_MESSAGE}
				</p>
			</div>
		);
	}

	if (
		selectedModels === null ||
		selectedModels === undefined ||
		selectedModels.length === 0
	) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-blocked-notice"
					className="text-xs text-muted-foreground"
				>
					{NO_MODELS_SELECTED_MESSAGE}
				</p>
			</div>
		);
	}

	if (invalidCatalogConfigModelId !== null) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-blocked-notice"
					className="text-xs text-muted-foreground"
				>
					{`Model catalog config invalid for model id ${invalidCatalogConfigModelId}.`}
				</p>
			</div>
		);
	}

	if (maxOutputTokens === null || !Number.isFinite(maxOutputTokens)) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-blocked-notice"
					className="text-xs text-muted-foreground"
				>
					{OUTPUT_CAP_NOT_INITIALIZED_MESSAGE}
				</p>
			</div>
		);
	}

	if (sliderRangeMax === null) {
		return (
			<div className={cn("space-y-3", className)}>
				<p
					data-testid="output-cap-slider-blocked-notice"
					className="text-xs text-muted-foreground"
				>
					{OUTPUT_CAP_NOT_INITIALIZED_MESSAGE}
				</p>
			</div>
		);
	}

	const activeUserTier: UserTier = userTier;
	const activeMaxOutputTokens: number = maxOutputTokens;
	const activeSliderRangeMax: number = sliderRangeMax;

	let activeThumbMax: number;
	if (activeUserTier.output_cap_tokens !== null) {
		activeThumbMax = Math.min(
			activeUserTier.output_cap_tokens,
			activeSliderRangeMax,
		);
	} else {
		activeThumbMax = activeSliderRangeMax;
	}

	const currentDisplayValue: number = Math.min(
		activeMaxOutputTokens,
		activeThumbMax,
	);

	let clampedSliderValue: number;
	if (sliderRealValue > activeThumbMax) {
		clampedSliderValue = activeThumbMax;
	} else if (sliderRealValue < MIN_OUTPUT_TOKENS) {
		clampedSliderValue = MIN_OUTPUT_TOKENS;
	} else {
		clampedSliderValue = sliderRealValue;
	}

	const sliderSegmentCount: number = Math.max(displayTiers.length, 1);
	const sliderMin: number = 0;
	const sliderMax: number = sliderSegmentCount;
	const sliderStep: number = 1 / SLIDER_STEPS_PER_SEGMENT;

	let internalSliderValue: number = sliderMin;
	let sliderSegmentMin: number = MIN_OUTPUT_TOKENS;
	for (let tierIndex = 0; tierIndex < displayTiers.length; tierIndex += 1) {
		const tier: UserTier = displayTiers[tierIndex];
		let sliderSegmentMax: number;
		if (tier.output_cap_tokens === null) {
			sliderSegmentMax = activeSliderRangeMax;
		} else {
			sliderSegmentMax = tier.output_cap_tokens;
		}
		const sliderSegmentStart: number = tierIndex;
		const sliderSegmentEnd: number = tierIndex + 1;
		const isLastSegment: boolean = tierIndex === displayTiers.length - 1;
		if (clampedSliderValue <= sliderSegmentMax || isLastSegment) {
			if (sliderSegmentMax <= sliderSegmentMin) {
				internalSliderValue = sliderSegmentEnd;
			} else {
				const sliderSegmentProgress: number =
					(clampedSliderValue - sliderSegmentMin) /
					(sliderSegmentMax - sliderSegmentMin);
				internalSliderValue =
					sliderSegmentStart + sliderSegmentProgress;
			}
			break;
		}
		sliderSegmentMin = sliderSegmentMax;
	}

	let thumbMaxPercent: number;
	if (activeThumbMax <= MIN_OUTPUT_TOKENS) {
		thumbMaxPercent = 0;
	} else {
		let thumbMaxPosition: number = sliderMin;
		let thumbSegmentMin: number = MIN_OUTPUT_TOKENS;
		for (let tierIndex = 0; tierIndex < displayTiers.length; tierIndex += 1) {
			const tier: UserTier = displayTiers[tierIndex];
			let thumbSegmentMax: number;
			if (tier.output_cap_tokens === null) {
				thumbSegmentMax = activeSliderRangeMax;
			} else {
				thumbSegmentMax = tier.output_cap_tokens;
			}
			const thumbSegmentStart: number = tierIndex;
			const thumbSegmentEnd: number = tierIndex + 1;
			const isLastSegment: boolean = tierIndex === displayTiers.length - 1;
			if (activeThumbMax <= thumbSegmentMax || isLastSegment) {
				if (thumbSegmentMax <= thumbSegmentMin) {
					thumbMaxPosition = thumbSegmentEnd;
				} else {
					const thumbSegmentProgress: number =
						(activeThumbMax - thumbSegmentMin) /
						(thumbSegmentMax - thumbSegmentMin);
					thumbMaxPosition = thumbSegmentStart + thumbSegmentProgress;
				}
				break;
			}
			thumbSegmentMin = thumbSegmentMax;
		}
		thumbMaxPercent = (thumbMaxPosition / sliderMax) * 100;
	}

	let helperTextContent: ReactElement;
	if (activeUserTier.output_cap_tokens === null) {
		helperTextContent = (
			<>
				<Sparkles className="h-3 w-3" />
				<span>Unlimited output capacity with Ultra tier</span>
			</>
		);
	} else {
		helperTextContent = (
			<span>
				Your{" "}
				<span className="font-medium capitalize">{activeUserTier.name}</span>{" "}
				tier allows up to{" "}
				<span className="font-medium">
					{formatTokenCount(activeUserTier.output_cap_tokens)}
				</span>{" "}
				tokens
			</span>
		);
	}

	return (
		<TooltipProvider>
			<div className={cn("space-y-3", className)}>
				<div className="flex items-center justify-between">
					<div className="flex w-full items-center justify-between">
						<h4 className="text-sm font-medium mb-1">Max Output Tokens</h4>
						<div className="flex flex-col items-end gap-0.5">
							<span className="text-lg font-semibold">
								{formatTokenCount(currentDisplayValue)}
							</span>
							<span className="text-[10px] text-muted-foreground">
								{formatPageGuidance(currentDisplayValue)}
							</span>
						</div>
					</div>
				</div>

				<div className="space-y-3">
					<div className="relative mx-2 h-14 sm:mx-4">
						{displayTiers.map((tier, tierIndex) => {
							const isAccessible = tier.level <= activeUserTier.level;
							const isCurrent = tier.level === activeUserTier.level;

							let markerTokenValue: number;
							if (tier.output_cap_tokens === null) {
								markerTokenValue = activeSliderRangeMax;
							} else {
								markerTokenValue = tier.output_cap_tokens;
							}

							const markerPercent: number =
								((tierIndex + 1) / sliderSegmentCount) * 100;

							return (
								<div
									key={tier.level}
									className="absolute top-0 flex -translate-x-full flex-col items-end"
									style={{ left: `${markerPercent}%` }}
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={cn(
													"flex min-w-24 flex-col items-end gap-0.5 rounded-md px-1 py-1 text-xs transition-all",
													isAccessible
														? "hover:bg-accent cursor-pointer"
														: "cursor-pointer opacity-40",
													isCurrent && "ring-1 ring-primary/20",
												)}
												onClick={() => {
													const isAccessible =
														tier.level <= activeUserTier.level;
													if (!isAccessible) {
														setUpgradeTargetName(tier.name);
														setShowUpgradeCTA(true);
														logger.info(
															"[OutputCapSlider] Upgrade required for tier marker",
															{
																targetTier: tier.name,
																userTier: activeUserTier.name,
															},
														);
														return;
													}
													let requestedReal: number;
													if (tier.output_cap_tokens === null) {
														requestedReal = activeThumbMax;
													} else {
														requestedReal = tier.output_cap_tokens;
													}
													applyOutputCapValue(
														requestedReal,
														true,
													);
												}}
											>
												<div className="flex items-center gap-0.5 whitespace-nowrap">
													{tier.output_cap_tokens === null && (
														<Sparkles className="h-2.5 w-2.5" />
													)}
													{!isAccessible && (
														<Lock className="h-2.5 w-2.5" />
													)}
													<span
														className={cn(
															"font-medium capitalize text-[11px]",
															isCurrent && "text-primary",
														)}
													>
														{tier.name}
													</span>
													<span className="text-[11px] text-muted-foreground">
														,
													</span>
													<span className="text-[11px] text-muted-foreground">
														{formatTokenCount(markerTokenValue)}
													</span>
												</div>
												<span className="whitespace-nowrap text-[9px] text-muted-foreground">
													{formatPageGuidance(markerTokenValue)}
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
													Up to{" "}
													{formatTokenCount(markerTokenValue)} tokens
												</p>
												<p className="text-xs">
													{formatPageGuidance(markerTokenValue)}
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
									<div className="mt-1 w-[2px] h-2 bg-border/50 rounded-full" />
								</div>
							);
						})}
					</div>

					<div className="relative mx-2 sm:mx-4" ref={sliderRegionRef}>
						<Slider
							value={[internalSliderValue]}
							min={sliderMin}
							max={sliderMax}
							step={sliderStep}
							onValueChange={(internalValues) => {
								const requestedInternal = internalValues[0];
								let requestedReal: number = activeSliderRangeMax;
								let sliderSegmentMin: number = MIN_OUTPUT_TOKENS;
								for (
									let tierIndex = 0;
									tierIndex < displayTiers.length;
									tierIndex += 1
								) {
									const tier: UserTier = displayTiers[tierIndex];
									let sliderSegmentMax: number;
									if (tier.output_cap_tokens === null) {
										sliderSegmentMax = activeSliderRangeMax;
									} else {
										sliderSegmentMax = tier.output_cap_tokens;
									}
									const sliderSegmentStart: number = tierIndex;
									const sliderSegmentEnd: number = tierIndex + 1;
									const isLastSegment: boolean =
										tierIndex === displayTiers.length - 1;
									if (requestedInternal <= sliderSegmentEnd || isLastSegment) {
										let sliderSegmentProgress: number;
										if (requestedInternal <= sliderSegmentStart) {
											sliderSegmentProgress = 0;
										} else if (requestedInternal >= sliderSegmentEnd) {
											sliderSegmentProgress = 1;
										} else {
											sliderSegmentProgress =
												requestedInternal - sliderSegmentStart;
										}
										requestedReal = Math.round(
											sliderSegmentMin +
												(sliderSegmentMax - sliderSegmentMin) *
													sliderSegmentProgress,
										);
										break;
									}
									sliderSegmentMin = sliderSegmentMax;
								}
								applyOutputCapValue(
									requestedReal,
									false,
								);
							}}
							onValueCommit={(internalValues) => {
								const requestedInternal = internalValues[0];
								let requestedReal: number = activeSliderRangeMax;
								let sliderSegmentMin: number = MIN_OUTPUT_TOKENS;
								for (
									let tierIndex = 0;
									tierIndex < displayTiers.length;
									tierIndex += 1
								) {
									const tier: UserTier = displayTiers[tierIndex];
									let sliderSegmentMax: number;
									if (tier.output_cap_tokens === null) {
										sliderSegmentMax = activeSliderRangeMax;
									} else {
										sliderSegmentMax = tier.output_cap_tokens;
									}
									const sliderSegmentStart: number = tierIndex;
									const sliderSegmentEnd: number = tierIndex + 1;
									const isLastSegment: boolean =
										tierIndex === displayTiers.length - 1;
									if (requestedInternal <= sliderSegmentEnd || isLastSegment) {
										let sliderSegmentProgress: number;
										if (requestedInternal <= sliderSegmentStart) {
											sliderSegmentProgress = 0;
										} else if (requestedInternal >= sliderSegmentEnd) {
											sliderSegmentProgress = 1;
										} else {
											sliderSegmentProgress =
												requestedInternal - sliderSegmentStart;
										}
										requestedReal = Math.round(
											sliderSegmentMin +
												(sliderSegmentMax - sliderSegmentMin) *
													sliderSegmentProgress,
										);
										break;
									}
									sliderSegmentMin = sliderSegmentMax;
								}
								applyOutputCapValue(
									requestedReal,
									true,
								);
							}}
							className="relative bg-gray-500/90"
						/>

						{activeThumbMax < activeSliderRangeMax && (
							<div
								className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-muted opacity-60 pointer-events-none rounded-r-full bg-background"
								style={{
									left: `${thumbMaxPercent}%`,
									right: 0,
								}}
							/>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					{helperTextContent}
				</div>

				{showUpgradeCTA && (
					<div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
						<AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
						<span className="text-amber-900 dark:text-amber-200">
							Upgrade to{" "}
							<span className="font-medium capitalize">
								{upgradeTargetName}
							</span>
							{" "}for larger output limits 
						</span>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={handleUpgradeClick}
							className="h-6 px-2 ml-auto text-amber-900 hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
						>
							Upgrade
						</Button>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}
