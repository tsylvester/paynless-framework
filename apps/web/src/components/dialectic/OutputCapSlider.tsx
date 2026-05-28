import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
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
import { logger } from "@paynless/utils";
import { cn } from "@/lib/utils";
import { Sparkles, Lock, AlertCircle } from "lucide-react";

const MIN_OUTPUT_TOKENS = 1024;

interface OutputCapSliderProps {
	className?: string;
}

export function OutputCapSlider({ className }: OutputCapSliderProps) {
	const navigate = useNavigate();
	const userTier = useAuthStore((state) => state.userTier);
	const availableTiers = useAuthStore((state) => state.availableTiers);
	const maxOutputTokens = useDialecticStore((state) => state.maxOutputTokens);
	const setMaxOutputTokens = useDialecticStore(
		(state) => state.setMaxOutputTokens,
	);
	const modelCatalog = useDialecticStore((state) => state.modelCatalog);
	const selectedModels = useDialecticStore((state) => state.selectedModels);

	const displayTiers: UserTier[] = useMemo(() => {
		const filteredTiers: UserTier[] = [];
		for (const tier of availableTiers) {
			if (tier.name !== "unreachable") {
				filteredTiers.push(tier);
			}
		}
		filteredTiers.sort((left, right) => left.level - right.level);
		return filteredTiers;
	}, [availableTiers]);

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
				if (catalogEntry.max_output_tokens === null) {
					continue;
				}
				if (highest === null) {
					highest = catalogEntry.max_output_tokens;
					continue;
				}
				if (catalogEntry.max_output_tokens > highest) {
					highest = catalogEntry.max_output_tokens;
				}
			}
		}
		return highest;
	}, [selectedModels, modelCatalog]);

	const [sliderRealValue, setSliderRealValue] = useState(MIN_OUTPUT_TOKENS);
	const [showUpgradeCTA, setShowUpgradeCTA] = useState(false);
	const [upgradeTargetName, setUpgradeTargetName] = useState("");
	const sliderRegionRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (userTier === null) {
			return;
		}
		if (sliderRangeMax === null) {
			return;
		}

		let nextValue: number;
		if (maxOutputTokens !== null) {
			nextValue = maxOutputTokens;
		} else if (userTier.output_cap_tokens !== null) {
			nextValue = userTier.output_cap_tokens;
		} else {
			nextValue = sliderRangeMax;
		}
		setSliderRealValue(nextValue);
	}, [maxOutputTokens, userTier, sliderRangeMax]);

	useEffect(() => {
		if (sliderRangeMax === null) {
			return;
		}
		if (userTier === null) {
			return;
		}

		let thumbMaxForLog: number;
		if (userTier.output_cap_tokens !== null) {
			thumbMaxForLog = userTier.output_cap_tokens;
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
		(requestedReal: number, persistToStore: boolean) => {
			if (userTier === null) {
				return;
			}
			if (sliderRangeMax === null) {
				return;
			}

			let thumbMax: number;
			if (userTier.output_cap_tokens !== null) {
				thumbMax = userTier.output_cap_tokens;
			} else {
				thumbMax = sliderRangeMax;
			}

			if (requestedReal <= thumbMax) {
				setSliderRealValue(requestedReal);
				setShowUpgradeCTA(false);
				if (persistToStore) {
					setMaxOutputTokens(requestedReal);
					logger.info("Output cap set to:", {
						maxOutputTokens: requestedReal,
					});
				}
				return;
			}

			setSliderRealValue(thumbMax);

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
			if (!requiredTierFound) {
				return;
			}
			setUpgradeTargetName(requiredTierName);
			setShowUpgradeCTA(true);
			setTimeout(() => setShowUpgradeCTA(false), 3000);
		},
		[userTier, sliderRangeMax, displayTiers, setMaxOutputTokens],
	);

	const handleUpgradeClick = useCallback(() => {
		navigate("/subscription");
	}, [navigate]);

	if (availableTiers.length === 0) {
		return null;
	}
	if (userTier === null) {
		return null;
	}
	if (sliderRangeMax === null) {
		return null;
	}

	const activeUserTier: UserTier = userTier;
	const activeSliderRangeMax: number = sliderRangeMax;

	let activeThumbMax: number;
	if (activeUserTier.output_cap_tokens !== null) {
		activeThumbMax = activeUserTier.output_cap_tokens;
	} else {
		activeThumbMax = activeSliderRangeMax;
	}

	let currentDisplayValue: number;
	if (maxOutputTokens !== null) {
		currentDisplayValue = maxOutputTokens;
	} else if (activeUserTier.output_cap_tokens !== null) {
		currentDisplayValue = activeUserTier.output_cap_tokens;
	} else {
		currentDisplayValue = activeSliderRangeMax;
	}

	let clampedSliderValue: number;
	if (sliderRealValue > activeThumbMax) {
		clampedSliderValue = activeThumbMax;
	} else if (sliderRealValue < MIN_OUTPUT_TOKENS) {
		clampedSliderValue = MIN_OUTPUT_TOKENS;
	} else {
		clampedSliderValue = sliderRealValue;
	}

	const logMin = Math.log(MIN_OUTPUT_TOKENS);
	const logMax = Math.log(activeSliderRangeMax);
	const internalSliderValue = Math.log(
		Math.max(clampedSliderValue, MIN_OUTPUT_TOKENS),
	);
	const logStep = (logMax - logMin) / 200;

	let thumbMaxPercent: number;
	if (activeThumbMax <= MIN_OUTPUT_TOKENS) {
		thumbMaxPercent = 0;
	} else {
		thumbMaxPercent =
			((Math.log(activeThumbMax) - Math.log(MIN_OUTPUT_TOKENS)) /
				(Math.log(activeSliderRangeMax) - Math.log(MIN_OUTPUT_TOKENS))) *
			100;
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
					<div className="relative h-14">
						{displayTiers.map((tier) => {
							const isAccessible = tier.level <= activeUserTier.level;
							const isCurrent = tier.level === activeUserTier.level;

							let markerPercent: number;
							if (tier.output_cap_tokens === null) {
								markerPercent = 100;
							} else {
								markerPercent =
									((Math.log(tier.output_cap_tokens) -
										Math.log(MIN_OUTPUT_TOKENS)) /
										(Math.log(activeSliderRangeMax) -
											Math.log(MIN_OUTPUT_TOKENS))) *
									100;
							}

							let markerTokenValue: number;
							if (tier.output_cap_tokens === null) {
								markerTokenValue = activeSliderRangeMax;
							} else {
								markerTokenValue = tier.output_cap_tokens;
							}

							return (
								<div
									key={tier.level}
									className="absolute top-0 flex flex-col items-center -translate-x-1/2"
									style={{ left: `${markerPercent}%` }}
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={cn(
													"flex flex-col items-center gap-0.5 px-1 py-1 rounded-md transition-all text-xs",
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
													applyOutputCapValue(requestedReal, true);
												}}
											>
												<div className="flex items-center gap-0.5">
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
												</div>
												<span className="text-[9px] text-muted-foreground">
													{formatTokenCount(markerTokenValue)}
												</span>
												<span className="text-[9px] text-muted-foreground">
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

					<div className="relative" ref={sliderRegionRef}>
						<Slider
							value={[internalSliderValue]}
							min={logMin}
							max={logMax}
							step={logStep}
							onValueChange={(internalValues) => {
								const requestedReal = Math.round(
									Math.exp(internalValues[0]),
								);
								applyOutputCapValue(requestedReal, false);
							}}
							onValueCommit={(internalValues) => {
								const requestedReal = Math.round(
									Math.exp(internalValues[0]),
								);
								applyOutputCapValue(requestedReal, true);
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
						</span>
						<Button
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
