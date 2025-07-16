import { useAiStore } from "@paynless/store";
import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

interface AIModelSelectorProps {
	disabled?: boolean;
}

export const AIModelSelectorList: React.FC<AIModelSelectorProps> = ({
	disabled,
}) => {
	const [modelsChecked, setModelsChecked] = useState<string[]>([]);

	const { availableProviders, isConfigLoading, loadAiConfig, aiError } =
		useAiStore((state) => ({
			availableProviders: state.availableProviders,
			isConfigLoading: state.isConfigLoading,
			loadAiConfig: state.loadAiConfig,
			aiError: state.aiError,
		}));

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
		<div className="border-gray-200 border-1">
			<ScrollArea className="max-h-[300px] overflow-y-auto">
				{availableProviders
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((provider) => (
						<div
							key={provider.id}
							className="flex items-center p-2 rounded-md gap-1"
						>
							<div className="flex-shrink-0">
								<Checkbox
									onClick={() => {
										const newModelsChecked = modelsChecked.includes(provider.id)
											? modelsChecked.filter((id) => id !== provider.id)
											: [...modelsChecked, provider.id];
										setModelsChecked(newModelsChecked);
									}}
								/>
							</div>
							<span
								className="flex-1 min-w-0 ml-2 truncate text-xs font-mono"
								title={provider.name}
							>
								{provider.name.toLowerCase()}
							</span>
						</div>
					))}
			</ScrollArea>
		</div>
	);
};
