import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AIModelSelectorList } from "@/components/dialectic/AIModelSelectorList";
import { DomainMultiSelector } from "./DomainMultiSelector";
import {
	useAiStore,
	useAuthStore,
	useDialecticStore,
	useWalletStore,
	selectDomains,
	selectPreProjectCostCeiling,
	selectSelectedModels,
	selectSortedStages,
} from "@paynless/store";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	ChevronRight,
	ChevronLeft,
	MessageCircle,
	Settings,
	Target,
} from "lucide-react";
import type {
	AiProvider,
	InitializeMaxOutputTokensResult,
	SelectedModels,
} from "@paynless/types";
import {
	ComputeCostCeilingReturn,
	formatTokenCount,
	FormatTokenCountDeps,
	FormatTokenCountParams,
} from "@paynless/utils";

type WalkthroughStep = "domain" | "model" | "message";

const subscriptionTierUnavailableMessage =
	"Subscription tier is not available.";

const formatTokenCountDeps: FormatTokenCountDeps = {};
const formatTokenCountParams: FormatTokenCountParams = {};

export default function Chat() {
	const fetchDomains = useDialecticStore((state) => state.fetchDomains);
	const fetchAIModelCatalog = useDialecticStore(
		(state) => state.fetchAIModelCatalog,
	);
	const fetchProcessAssociation = useDialecticStore(
		(state) => state.fetchProcessAssociation,
	);
	const fetchProcessTemplate = useDialecticStore(
		(state) => state.fetchProcessTemplate,
	);
	const fetchStageExpectedCounts = useDialecticStore(
		(state) => state.fetchStageExpectedCounts,
	);
	const setSelectedDomain = useDialecticStore(
		(state) => state.setSelectedDomain,
	);
	const setSelectedModels = useDialecticStore(
		(state) => state.setSelectedModels,
	);
	const initializeMaxOutputTokens = useDialecticStore(
		(state) => state.initializeMaxOutputTokens,
	);
	const selectedDomainProcessAssociation = useDialecticStore(
		(state) => state.selectedDomainProcessAssociation,
	);
	const isLoadingDomainProcessAssociation = useDialecticStore(
		(state) => state.isLoadingDomainProcessAssociation,
	);
	const isLoadingStageExpectedCounts = useDialecticStore(
		(state) => state.isLoadingStageExpectedCounts,
	);
	const isLoadingModelCatalog = useDialecticStore(
		(state) => state.isLoadingModelCatalog,
	);
	const isLoadingProcessTemplate = useDialecticStore(
		(state) => state.isLoadingProcessTemplate,
	);
	const modelCatalog = useDialecticStore((state) => state.modelCatalog);

	const authIsLoading = useAuthStore((state) => state.isLoading);
	const userTier = useAuthStore((state) => state.userTier);
	const authError = useAuthStore((state) => state.error);

	const availableProviders = useAiStore((state) => state.availableProviders);

	const domains = useDialecticStore(selectDomains);
	const selectedModels = useDialecticStore(selectSelectedModels);
	const sortedStages = useDialecticStore(selectSortedStages);
	const preProjectCostCeilingResult: ComputeCostCeilingReturn =
		useDialecticStore(selectPreProjectCostCeiling);

	const { personalWalletBalance } = useWalletStore((state) => ({
		personalWalletBalance: state.personalWallet?.balance ?? null,
	}));

	const [selectedDomainId, setSelectedDomainId] = useState<string>("");
	const [currentStep, setCurrentStep] = useState<WalkthroughStep>("domain");
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [hasSelectedModel, setHasSelectedModel] = useState(false);
	const [capInitResult, setCapInitResult] =
		useState<InitializeMaxOutputTokensResult | null>(null);

	useQuery({
		queryKey: ["domains"],
		queryFn: () => fetchDomains(),
	});

	const uniqueModelCount = new Set(selectedModels.map((model) => model.id))
		.size;

	useEffect(() => {
		if (selectedDomainId === "") {
			return;
		}
		const matchedDomain = domains.find(
			(domain) => domain.id === selectedDomainId,
		);
		if (matchedDomain === undefined) {
			return;
		}
		setSelectedDomain(matchedDomain);
		fetchAIModelCatalog();
	}, [
		selectedDomainId,
		domains,
		setSelectedDomain,
		fetchAIModelCatalog,
	]);

	useEffect(() => {
		if (selectedDomainId === "") {
			return;
		}
		fetchProcessAssociation({ domainId: selectedDomainId });
	}, [selectedDomainId, fetchProcessAssociation]);

	useEffect(() => {
		const processTemplateId: string | undefined =
			selectedDomainProcessAssociation?.process_template_id;
		if (processTemplateId !== undefined && processTemplateId.length > 0) {
			fetchProcessTemplate(processTemplateId);
			if (uniqueModelCount >= 1) {
				fetchStageExpectedCounts({
					processTemplateId,
					modelCount: uniqueModelCount,
				});
			}
		}
	}, [
		selectedDomainProcessAssociation?.process_template_id,
		uniqueModelCount,
		fetchProcessTemplate,
		fetchStageExpectedCounts,
	]);

	const isCapInitReady: boolean =
		!authIsLoading &&
		userTier !== null &&
		!isLoadingModelCatalog &&
		modelCatalog.length > 0;

	useEffect(() => {
		if (
			!isCapInitReady ||
			selectedDomainId === "" ||
			selectedModels.length === 0
		) {
			setCapInitResult(null);
			return;
		}
		const initResult: InitializeMaxOutputTokensResult =
			initializeMaxOutputTokens();
		if (initResult.ok === true) {
			setCapInitResult(null);
			return;
		}
		setCapInitResult(initResult);
	}, [
		authIsLoading,
		userTier,
		isLoadingModelCatalog,
		modelCatalog.length,
		selectedDomainId,
		selectedModels.length,
		initializeMaxOutputTokens,
	]);

	const isCostEstimateLoading: boolean =
		authIsLoading ||
		isLoadingModelCatalog ||
		isLoadingDomainProcessAssociation ||
		isLoadingProcessTemplate ||
		isLoadingStageExpectedCounts;

	let costEstimateLoadingNotice: string | null = null;
	if (authIsLoading) {
		costEstimateLoadingNotice = "Loading subscription tier…";
	} else if (isLoadingModelCatalog) {
		costEstimateLoadingNotice = "Loading model catalog…";
	} else if (isLoadingDomainProcessAssociation) {
		costEstimateLoadingNotice = "Loading domain process association…";
	} else if (isLoadingProcessTemplate) {
		costEstimateLoadingNotice = "Loading process template…";
	} else if (isLoadingStageExpectedCounts) {
		costEstimateLoadingNotice = "Loading stage expected counts…";
	}

	let costEstimateErrorMessage: string | null = null;
	if (!isCostEstimateLoading) {
		if (authError !== null) {
			costEstimateErrorMessage = authError.message;
		} else if (userTier === null) {
			costEstimateErrorMessage = subscriptionTierUnavailableMessage;
		} else if (capInitResult !== null && capInitResult.ok === false) {
			costEstimateErrorMessage = capInitResult.error.message;
		} else if ("error" in preProjectCostCeilingResult) {
			costEstimateErrorMessage = preProjectCostCeilingResult.error.message;
		}
	}

	const hasCostEstimateSuccess: boolean =
		!isCostEstimateLoading &&
		costEstimateErrorMessage === null &&
		!("error" in preProjectCostCeilingResult);

	const firstStageSlug: string | null = sortedStages[0]?.slug ?? null;

	let firstStageCeiling: number | null = null;
	if (
		hasCostEstimateSuccess &&
		firstStageSlug !== null &&
		!("error" in preProjectCostCeilingResult)
	) {
		const rawFirstStageCeiling: number =
			preProjectCostCeilingResult.stageCeilings[firstStageSlug];
		if (
			Number.isFinite(rawFirstStageCeiling) &&
			rawFirstStageCeiling >= 0
		) {
			firstStageCeiling = rawFirstStageCeiling;
		}
	}

	let projectCeiling: number | null = null;
	if (hasCostEstimateSuccess && !("error" in preProjectCostCeilingResult)) {
		const rawProjectCeiling: number =
			preProjectCostCeilingResult.projectCeiling;
		if (Number.isFinite(rawProjectCeiling) && rawProjectCeiling >= 0) {
			projectCeiling = rawProjectCeiling;
		}
	}

	let firstStageCeilingDisplay: string | null = null;
	if (firstStageCeiling !== null) {
		const firstStageCeilingFormatResult = formatTokenCount(
			formatTokenCountDeps,
			formatTokenCountParams,
			{ tokenCount: firstStageCeiling },
		);
		if (!("error" in firstStageCeilingFormatResult)) {
			firstStageCeilingDisplay = firstStageCeilingFormatResult.formatted;
		}
	}

	let projectCeilingDisplay: string | null = null;
	if (projectCeiling !== null) {
		const projectCeilingFormatResult = formatTokenCount(
			formatTokenCountDeps,
			formatTokenCountParams,
			{ tokenCount: projectCeiling },
		);
		if (!("error" in projectCeilingFormatResult)) {
			projectCeilingDisplay = projectCeilingFormatResult.formatted;
		}
	}

	const showCostEstimateUi: boolean =
		selectedDomainId !== "" &&
		(currentStep === "model" || currentStep === "message");

	const handleModelsCheckedChange = (modelsChecked: string[]): void => {
		const selectedModelsMapped: SelectedModels[] = modelsChecked.map(
			(providerId: string) => {
				const providerFromStore = availableProviders.find(
					(provider) => provider.id === providerId,
				);
				if (providerFromStore === undefined) {
					throw new Error(
						`Chat onboarding: no provider found for id ${providerId}`,
					);
				}
				const provider: AiProvider = providerFromStore;
				return { id: provider.id, displayName: provider.name };
			},
		);
		setSelectedModels(selectedModelsMapped);
		setHasSelectedModel(selectedModelsMapped.length > 0);
	};

	const handleStepTransition = (nextStep: WalkthroughStep) => {
		setIsTransitioning(true);
		setTimeout(() => {
			setCurrentStep(nextStep);
			setTimeout(() => {
				setIsTransitioning(false);
			}, 50);
		}, 300);
	};

	const canProceedFromDomain = selectedDomainId !== "";
	const canProceedFromModel = hasSelectedModel;

	const getStepIcon = (step: WalkthroughStep) => {
		switch (step) {
			case "domain":
				return <Target className="w-5 h-5" />;
			case "model":
				return <Settings className="w-5 h-5" />;
			case "message":
				return <MessageCircle className="w-5 h-5" />;
		}
	};

	const getStepTitle = (step: WalkthroughStep) => {
		switch (step) {
			case "domain":
				return "System";
			case "model":
				return "Models";
			case "message":
				return "";
		}
	};

	const tokensBalance = Number(personalWalletBalance).toLocaleString("en-US");

	const costEstimateUi = showCostEstimateUi ? (
		<div className="text-xs text-muted-foreground space-y-1">
			{isCostEstimateLoading && costEstimateLoadingNotice !== null && (
				<p data-testid="chat-onboarding-estimate-loading-notice">
					{costEstimateLoadingNotice}
				</p>
			)}
			{!isCostEstimateLoading && costEstimateErrorMessage !== null && (
				<p data-testid="chat-onboarding-estimate-error-notice">
					{costEstimateErrorMessage}
				</p>
			)}
			{hasCostEstimateSuccess &&
				firstStageCeilingDisplay !== null &&
				projectCeilingDisplay !== null && (
					<p data-testid="chat-onboarding-cost-preview">
						Estimated token cost: ~
						{projectCeilingDisplay} for the full project, ~
						{firstStageCeilingDisplay} for the first stage.
					</p>
				)}
		</div>
	) : null;

	return (
		<div className="flex flex-col items-center justify-between min-h-screen px-4 py-20">
			<div className="mb-8 flex items-center space-x-2">
				{(["domain", "model", "message"] as WalkthroughStep[]).map(
					(step, index) => (
						<div key={step} className="flex items-center">
							<div
								className={`
							flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-500 ease-in-out 
							${
								currentStep === step
									? "bg-primary text-primary-foreground border-primary shadow-lg scale-110 text-black"
									: index <
											(
												["domain", "model", "message"] as WalkthroughStep[]
											).indexOf(currentStep)
										? "bg-primary/20 border-primary text-primary"
										: "bg-background border-border text-muted-foreground"
							}
						`}
							>
								{getStepIcon(step)}
							</div>
							{index < 2 && (
								<div
									className={`
								w-20 h-1 mx-2 rounded-full transition-all duration-500 ease-in-out
								${
									index <
									(["domain", "model", "message"] as WalkthroughStep[]).indexOf(
										currentStep,
									)
										? "bg-primary"
										: "bg-border"
								}
							`}
								/>
							)}
						</div>
					),
				)}
			</div>

			<div
				className={`
				transition-all duration-300 ease-in-out transform w-full max-w-3xl px-20
				${isTransitioning ? "opacity-0 scale-95 translate-y-4" : "opacity-100 scale-100 translate-y-0"}
			`}
			>
				<div className="text-center mb-8">
					<h1 className="text-lg font-bold mb-2">
						{getStepTitle(currentStep)}
					</h1>
				</div>

				<div className="bg-card h-full flex flex-col w-full justify-between flex-grow">
					{currentStep === "domain" && (
						<div className="animate-in fade-in-50 duration-500">
							<DomainMultiSelector
								selectedDomainId={selectedDomainId}
								onSelectionChange={setSelectedDomainId}
							/>
						</div>
					)}

					{currentStep === "model" && (
						<div className="space-y-6 animate-in fade-in-50 duration-500 flex-grow h-full">
							<AIModelSelectorList onChange={handleModelsCheckedChange} />
							{costEstimateUi}
						</div>
					)}

					{currentStep === "message" && (
						<div className="space-y-6 animate-in fade-in-50 duration-500 flex-grow w-full">
							<Textarea
								className="min-h-32 bg-background w-full dark:bg-[#212121] border-0 focus:border-ring resize-none"
								placeholder="Type your message to start the conversation..."
								autoFocus={true}
							/>
							{costEstimateUi}
							<div className="text-xs text-right">
								{tokensBalance} token balance
							</div>
						</div>
					)}
				</div>
			</div>

			<div className="flex justify-between w-full max-w-2xl mt-8">
				{currentStep === "domain" && (
					<div className="w-full animate-in fade-in-50 duration-500">
						<div className="flex justify-end">
							<Button
								onClick={() => handleStepTransition("model")}
								disabled={!canProceedFromDomain}
								className="flex items-center gap-2 transition-all duration-200 hover:scale-105"
							>
								Next <ChevronRight className="w-4 h-4" />
							</Button>
						</div>
					</div>
				)}

				{currentStep === "model" && (
					<div className="w-full animate-in fade-in-50 duration-500">
						<div className="flex justify-between">
							<Button
								variant="outline"
								onClick={() => handleStepTransition("domain")}
								className="flex items-center gap-2 transition-all duration-200 hover:scale-105"
							>
								<ChevronLeft className="w-4 h-4" /> Back
							</Button>
							<Button
								onClick={() => handleStepTransition("message")}
								disabled={!canProceedFromModel}
								className="flex items-center gap-2 transition-all duration-200 hover:scale-105"
							>
								Next <ChevronRight className="w-4 h-4" />
							</Button>
						</div>
					</div>
				)}

				{currentStep === "message" && (
					<div className="w-full animate-in fade-in-50 duration-500">
						<div className="flex justify-between">
							<Button
								variant="outline"
								onClick={() => handleStepTransition("model")}
								className="flex items-center gap-2 transition-all duration-200 hover:scale-105"
							>
								<ChevronLeft className="w-4 h-4" /> Back
							</Button>
							<Button className="flex items-center gap-2 transition-all duration-200 hover:scale-105">
								Send Message <MessageCircle className="w-4 h-4" />
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
