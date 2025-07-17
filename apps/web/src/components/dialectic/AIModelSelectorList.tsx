import { useAiStore } from "@paynless/store";
import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

interface AIModelSelectorProps {
	disabled?: boolean;
	onChange: (modelsChecked: string[]) => void;
}

export const AIModelSelectorList: React.FC<AIModelSelectorProps> = ({
	onChange,
}: {
	onChange: (modelsChecked: string[]) => void;
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
		<div className="border-gray-200 border-1 flex flex-col h-full flex-grow">
			<ScrollArea className="h-full overflow-y-auto flex-grow w-[330px] mx-auto">
				{availableProviders
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((provider) => (
						<button
							type="button"
							key={provider.id}
							className="flex w-full items-center p-2 rounded-md gap-1 text-left focus:outline-none border border-gray-500/10 hover:cursor-pointer my-2 hover:border-gray-500/50 "
							onClick={() => {
								const newModelsChecked = modelsChecked.includes(provider.id)
									? modelsChecked.filter((id) => id !== provider.id)
									: [...modelsChecked, provider.id];
								setModelsChecked(newModelsChecked);
								onChange(newModelsChecked);
							}}
							onKeyDown={(e) => {
								if (e.key === " " || e.key === "Enter") {
									e.preventDefault();
									const newModelsChecked = modelsChecked.includes(provider.id)
										? modelsChecked.filter((id) => id !== provider.id)
										: [...modelsChecked, provider.id];
									setModelsChecked(newModelsChecked);
									onChange(newModelsChecked);
								}
							}}
						>
							<div className="flex-shrink-0">
								<Checkbox checked={modelsChecked.includes(provider.id)} />
							</div>
							<span
								className="flex-1 min-w-0 ml-2 truncate text-xs font-mono"
								title={provider.name}
							>
								{provider.name.toLowerCase()}
							</span>
						</button>
					))}
			</ScrollArea>
		</div>
	);
};
