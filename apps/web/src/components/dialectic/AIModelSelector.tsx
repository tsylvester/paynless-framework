import React, { useMemo, useEffect } from "react";
import { InternalDropdownButton } from "./InternalDropdownButton";
import type { AiProvider, SelectedModels } from "@paynless/types";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, X, Cpu } from "lucide-react";
import { useDialecticStore, useAiStore } from "@paynless/store";
import { selectSelectedModels } from "@paynless/store";
import { MultiplicitySelector } from "./MultiplicitySelector";
import { cn } from "@/lib/utils";

interface AIModelSelectorProps {
	disabled?: boolean;
}

const SelectedModelsDisplayContent: React.FC<{
	availableProviders: AiProvider[] | null | undefined;
	selectedModels: SelectedModels[];
	currentSelectedModelIds: string[];
	modelMultiplicities: Record<string, number>;
	onRemoveModel: (modelId: string) => void;
	compact?: boolean;
}> = ({
	availableProviders,
	selectedModels,
	currentSelectedModelIds,
	modelMultiplicities,
	onRemoveModel,
	compact = false,
}) => {
	if (!availableProviders || availableProviders.length === 0) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<Cpu className="w-4 h-4" />
				<span>No models available</span>
			</div>
		);
	}

	if (currentSelectedModelIds.length === 0) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground py-2 px-3 border-2 border-dashed border-muted-foreground/30 rounded-lg">
				<Cpu className="w-4 h-4" />
				<span>Click to select AI models</span>
			</div>
		);
	}

	const uniqueModels = Array.from(new Set(currentSelectedModelIds));

	if (compact && uniqueModels.length > 2) {
		return (
			<div className="flex items-center gap-2">
				<Cpu className="w-4 h-4 text-primary" />
				<span className="text-sm font-medium">
					{uniqueModels.length} models selected
				</span>
				<Badge variant="secondary" className="text-xs">
					{currentSelectedModelIds.length} total
				</Badge>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			{uniqueModels.map((modelId) => {
				const model = selectedModels.find((m) => m.id === modelId);
				if (!model) return null;
				const provider = availableProviders.find((p) => p.id === modelId);
				if (provider === undefined) {
					throw new Error(`AIModelSelector: no provider in catalog for model id ${modelId}`);
				}
				const displayLabel: string = provider.name;
				const count = modelMultiplicities[modelId];

				return (
					<Badge
						key={modelId}
						variant="outline"
						className="flex items-center gap-1.5 px-2 py-1 text-xs bg-background border-border hover:bg-muted/50 transition-colors max-w-[180px]"
					>
						<span
							className="truncate font-medium text-foreground"
							title={displayLabel}
						>
							{displayLabel}
						</span>
						{count !== undefined && count > 1 && (
							<span className="bg-foreground text-background px-1.5 py-0.5 rounded-full text-xs font-bold leading-none">
								{count}
							</span>
						)}
						<span
							role="button"
							tabIndex={0}
							aria-label={`Remove ${displayLabel}`}
							className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full text-muted-foreground hover:text-destructive-foreground cursor-pointer flex items-center justify-center"
							onClick={(e) => {
								e.stopPropagation();
								onRemoveModel(modelId);
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.stopPropagation();
									onRemoveModel(modelId);
								}
							}}
						>
							<X className="h-3 w-3" />
						</span>
					</Badge>
				);
			})}
		</div>
	);
};

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({
	disabled,
}) => {
	const { availableProviders, isConfigLoading, loadAiConfig, aiError } =
		useAiStore((state) => ({
			availableProviders: state.availableProviders,
			isConfigLoading: state.isConfigLoading,
			loadAiConfig: state.loadAiConfig,
			aiError: state.aiError,
		}));

	const { selectedModels, setModelMultiplicity } = useDialecticStore(
		(state) => ({
			selectedModels: selectSelectedModels(state),
			setModelMultiplicity: state.setModelMultiplicity,
		}),
	);

	const currentSelectedModelIds = useMemo(
		() => selectedModels.map((m) => m.id),
		[selectedModels],
	);

	const modelMultiplicities = useMemo(() => {
		const counts: Record<string, number> = {};
		if (availableProviders) {
			for (const p of availableProviders) {
				counts[p.id] = 0;
			}
		}
		for (const m of selectedModels) {
			if (counts[m.id] === undefined) counts[m.id] = 0;
			counts[m.id] += 1;
		}
		return counts;
	}, [selectedModels, availableProviders]);

	useEffect(() => {
		if (
			!isConfigLoading &&
			(!availableProviders || availableProviders.length === 0) &&
			!aiError
		) {
			loadAiConfig();
		}
	}, [loadAiConfig, isConfigLoading, availableProviders, aiError]);

	const handleMultiplicityChange = (modelId: string, newCount: number) => {
		const provider = availableProviders?.find((p) => p.id === modelId);
		if (provider) {
			setModelMultiplicity({ id: provider.id, displayName: provider.name }, newCount);
		} else {
			const model = selectedModels.find((m) => m.id === modelId);
			if (model) setModelMultiplicity(model, newCount);
		}
	};

	const handleRemoveModel = (modelId: string) => {
		const model = selectedModels.find((m) => m.id === modelId);
		if (model) setModelMultiplicity(model, 0);
	};

	const hasContentProviders =
		availableProviders && availableProviders.length > 0;

	const finalIsDisabled =
		disabled || (!isConfigLoading && !aiError && !hasContentProviders);

	let dropdownContent: React.ReactNode = null;
	if (isConfigLoading) {
		dropdownContent = <DropdownMenuLabel>Loading models...</DropdownMenuLabel>;
	} else if (aiError) {
		dropdownContent = (
			<DropdownMenuLabel className="text-destructive">
				Error: {aiError}
			</DropdownMenuLabel>
		);
	} else if (hasContentProviders) {
		const uniqueSelectedCount = currentSelectedModelIds
			? new Set(currentSelectedModelIds).size
			: 0;

		dropdownContent = (
			<div className="flex flex-col h-full max-h-96">
				{/* Scrollable content */}
				<div className="flex-1 min-h-0">
					<ScrollArea className="h-64">
						<div className="p-2 space-y-1">
							{availableProviders.map((provider) => {
								const count = modelMultiplicities[provider.id];
								const isSelected = count !== undefined && count > 0;

								return (
									<div
										key={provider.id}
										className={cn(
											"flex items-center gap-3 p-3 rounded-lg transition-all duration-150",
											"hover:bg-muted/50 cursor-pointer",
											isSelected && "bg-primary/5 border border-primary/20",
										)}
										data-testid={`model-item-${provider.id}`}
									>
										{/* Model Icon/Avatar */}
										<div
											className={cn(
												"w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
												isSelected
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground",
											)}
										>
											{provider.name.charAt(0).toUpperCase()}
										</div>

										{/* Model Info */}
										<div className="flex-1 min-w-0">
											<div
												className="font-medium text-sm truncate"
												title={provider.name}
											>
												{provider.name}
											</div>
											{isSelected && count > 1 && (
												<div className="text-xs text-muted-foreground">
													Running {count} instances
												</div>
											)}
										</div>

										{/* Controls */}
										<div className="flex-shrink-0">
											<MultiplicitySelector
												value={count}
												onChange={(newCount) =>
													handleMultiplicityChange(provider.id, newCount)
												}
												minValue={0}
												disabled={finalIsDisabled}
											/>
										</div>
									</div>
								);
							})}
						</div>
					</ScrollArea>
				</div>

				{/* Footer - always at bottom */}
				{currentSelectedModelIds && currentSelectedModelIds.length > 0 && (
					<div className="flex-shrink-0 p-3 border-t bg-background/95 backdrop-blur-md border-border">
						<div className="flex items-center justify-between">
							<div className="text-xs text-muted-foreground">
								{uniqueSelectedCount} model
								{uniqueSelectedCount !== 1 ? "s" : ""} selected
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={() => {
									// Clear all selections
									if (availableProviders) {
										availableProviders.forEach((provider) => {
											handleMultiplicityChange(provider.id, 0);
										});
									}
								}}
							>
								Clear All
							</Button>
						</div>
					</div>
				)}
			</div>
		);
	} else {
		dropdownContent = (
			<DropdownMenuLabel>No models available to select.</DropdownMenuLabel>
		);
	}

	const hasSelectedModels =
		currentSelectedModelIds && currentSelectedModelIds.length > 0;
	const needsAttention =
		!hasSelectedModels && !finalIsDisabled && !isConfigLoading && !aiError;

	return (
		<div className="w-full">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<InternalDropdownButton
						variant="outline"
						className={cn(
							"justify-between items-center h-auto min-h-[40px] py-2 text-left w-full",
							needsAttention && "ring-2 ring-primary animate-pulse",
							hasSelectedModels && "border-muted-foreground/20 bg-muted/20",
						)}
						disabled={finalIsDisabled}
						aria-label="Select AI Models"
					>
						<div className="flex-grow mr-2 min-w-0">
							<SelectedModelsDisplayContent
								availableProviders={availableProviders}
								selectedModels={selectedModels}
								currentSelectedModelIds={currentSelectedModelIds}
								modelMultiplicities={modelMultiplicities}
								onRemoveModel={handleRemoveModel}
								compact={false}
							/>
						</div>
						<ChevronDown
							data-slot="icon"
							className="ml-1 size-4 shrink-0 opacity-50"
						/>
					</InternalDropdownButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[400px] bg-background/95 backdrop-blur-md border shadow-lg">
					{dropdownContent}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
