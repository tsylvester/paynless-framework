import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AIModelSelectorList } from "@/components/dialectic/AIModelSelectorList";
import { DomainMultiSelector } from "./DomainMultiSelector";
import { useDialecticStore } from "@paynless/store";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	ChevronRight,
	ChevronLeft,
	MessageCircle,
	Settings,
	Target,
} from "lucide-react";

import { useWalletStore } from "@paynless/store";

type WalkthroughStep = "domain" | "model" | "message";

export default function Chat() {
	const { fetchDomains } = useDialecticStore((state) => ({
		fetchDomains: state.fetchDomains,
	}));

	const { personalWallet, personalWalletBalance } = useWalletStore((state) => ({
		personalWallet: state.personalWallet,
		personalWalletBalance: state.personalWallet?.balance ?? null,
	}));

	const [selectedDomainId, setSelectedDomainId] = useState<string>("");
	const [currentStep, setCurrentStep] = useState<WalkthroughStep>("domain");
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [hasSelectedModel, setHasSelectedModel] = useState(false);

	useQuery({
		queryKey: ["domains"],
		queryFn: () => fetchDomains(),
	});

	const handleStepTransition = (nextStep: WalkthroughStep) => {
		setIsTransitioning(true);
		setTimeout(() => {
			setCurrentStep(nextStep);
			setTimeout(() => {
				setIsTransitioning(false);
			}, 50); // Small delay to ensure DOM update
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
							<AIModelSelectorList
								onChange={(modelsChecked: string[]) => {
									// console.log("Selected models:", modelsChecked);
									setHasSelectedModel(modelsChecked.length > 0);
								}}
							/>
						</div>
					)}

					{currentStep === "message" && (
						<div className="space-y-6 animate-in fade-in-50 duration-500 flex-grow w-full">
							<Textarea
								className="min-h-32 bg-background w-full dark:bg-[#212121] border-0 focus:border-ring resize-none"
								placeholder="Type your message to start the conversation..."
								autoFocus={true}
							/>
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
