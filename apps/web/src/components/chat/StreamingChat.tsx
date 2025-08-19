import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AIModelSelectorList } from "@/components/dialectic/AIModelSelectorList";
import { DomainMultiSelector } from "./DomainMultiSelector";
import {
	useDialecticStore,
	useAiStore,
	useWalletStore,
	selectActiveChatWalletInfo,
} from "@paynless/store";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import {
	ChevronRight,
	ChevronLeft,
	MessageCircle,
	Settings,
	Target,
	Send,
} from "lucide-react";
import { useChatWalletDecision } from "@/hooks/useChatWalletDecision";

type WalkthroughStep = "domain" | "model" | "message";

export default function StreamingChat() {
	const { fetchDomains } = useDialecticStore((state) => ({
		fetchDomains: state.fetchDomains,
	}));

	const {
		sendMessageStreaming,
		selectedProviderId,
		selectedPromptId,
		isLoadingAiResponse,
		aiError,
		setNewChatContext,
		loadAiConfig,
		setSelectedProvider,
		setSelectedPrompt,
		availableProviders,
	} = useAiStore();

	const { loadPersonalWallet } = useWalletStore((state) => ({
		loadPersonalWallet: state.loadPersonalWallet,
	}));

	const activeWalletInfo = useWalletStore(selectActiveChatWalletInfo);

	// This hook will trigger the wallet decision logic
	useChatWalletDecision();

	const [selectedDomainId, setSelectedDomainId] = useState<string>("");
	const [currentStep, setCurrentStep] = useState<WalkthroughStep>("domain");
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [hasSelectedModel, setHasSelectedModel] = useState(false);
	const [message, setMessage] = useState("");
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [chatHistory, setChatHistory] = useState<
		Array<{ role: "user" | "assistant"; content: string }>
	>([]);

	const streamingContentRef = useRef("");

	// Initialize wallet and AI config on component mount
	useEffect(() => {
		// Load AI configuration first
		loadAiConfig();
		// Set chat context to personal to trigger wallet decision logic
		setNewChatContext("personal");
		// Load personal wallet if needed
		loadPersonalWallet();
	}, [setNewChatContext, loadPersonalWallet, loadAiConfig]);

	// Auto-select first available provider and prompt if none selected
	useEffect(() => {
		// Only auto-select if we have providers but no provider selected
		if (availableProviders.length > 0 && !selectedProviderId) {
			// Find first active provider
			const firstActiveProvider = availableProviders.find((p) => p.is_active);
			if (firstActiveProvider) {
				console.log("Auto-selecting provider:", firstActiveProvider.name);
				setSelectedProvider(firstActiveProvider.id);

				// Auto-select a basic prompt (or leave null for default)
				setSelectedPrompt(null);
			}
		}
	}, [
		availableProviders,
		selectedProviderId,
		setSelectedProvider,
		setSelectedPrompt,
	]);

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
	const isWalletReady = activeWalletInfo.status === "ok";

	const handleSendMessage = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!message.trim() || !selectedProviderId) return;

		// Check wallet status before attempting to send
		if (!isWalletReady) {
			console.error("Wallet not ready:", activeWalletInfo.message);
			return;
		}

		// Add user message to chat history
		const userMessage = { role: "user" as const, content: message.trim() };
		setChatHistory((prev) => [...prev, userMessage]);

		setIsStreaming(true);
		setStreamingContent("");
		streamingContentRef.current = "";

		try {
			await sendMessageStreaming({
				message: message.trim(),
				providerId: selectedProviderId,
				promptId: selectedPromptId,
				onChunk: (chunk: string) => {
					streamingContentRef.current += chunk;
					setStreamingContent(streamingContentRef.current);
				},
				onComplete: () => {
					setIsStreaming(false);
					// Add assistant message to chat history
					const assistantMessage = {
						role: "assistant" as const,
						content: streamingContentRef.current,
					};
					setChatHistory((prev) => [...prev, assistantMessage]);
					setStreamingContent("");
					streamingContentRef.current = "";
					console.log("Streaming complete!");
				},
				onError: (error: string) => {
					setIsStreaming(false);
					console.error("Streaming error:", error);
				},
			});
		} catch (error) {
			setIsStreaming(false);
			console.error("Error sending streaming message:", error);
		}

		setMessage("");
	};

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

	const tokensBalance = Number(activeWalletInfo.balance || 0).toLocaleString(
		"en-US",
	);

	return (
		<div className="flex flex-col items-center justify-between min-h-screen px-4 py-20">
			{/* Step indicator - only show if not in message step */}
			{currentStep !== "message" && (
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
										(
											["domain", "model", "message"] as WalkthroughStep[]
										).indexOf(currentStep)
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
			)}

			<div
				className={`
				transition-all duration-300 ease-in-out transform w-full max-w-3xl px-20
				${isTransitioning ? "opacity-0 scale-95 translate-y-4" : "opacity-100 scale-100 translate-y-0"}
			`}
			>
				{currentStep !== "message" && (
					<div className="text-center mb-8">
						<h1 className="text-lg font-bold mb-2">
							{getStepTitle(currentStep)}
						</h1>
					</div>
				)}

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
									setHasSelectedModel(modelsChecked.length > 0);
								}}
							/>
						</div>
					)}

					{currentStep === "message" && (
						<div className="space-y-6 animate-in fade-in-50 duration-500 flex-grow w-full">
							{/* Chat History Display */}
							{chatHistory.length > 0 && (
								<div className="max-h-96 overflow-y-auto space-y-4 mb-6 p-4 bg-background/50 rounded-lg border">
									{chatHistory.map((msg, index) => (
										<div
											key={`${msg.role}-${index}-${msg.content.slice(0, 20)}`}
											className={`p-3 rounded-lg ${
												msg.role === "user"
													? "bg-primary/10 ml-auto max-w-[80%]"
													: "bg-muted mr-auto max-w-[80%]"
											}`}
										>
											<div className="text-xs font-medium mb-1 text-muted-foreground">
												{msg.role === "user" ? "You" : "Assistant"}
											</div>
											<div className="whitespace-pre-wrap text-sm">
												{msg.content}
											</div>
										</div>
									))}
								</div>
							)}

							{/* Streaming Response Display */}
							{(isStreaming || streamingContent) && (
								<div className="mb-6 p-4 bg-muted/50 rounded-lg border">
									<div className="text-xs font-medium mb-2 text-muted-foreground">
										Assistant
									</div>
									<div className="whitespace-pre-wrap text-sm">
										{streamingContent}
										{isStreaming && (
											<span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1"></span>
										)}
									</div>
								</div>
							)}

							{/* Message Input Form */}
							<form onSubmit={handleSendMessage} className="space-y-4">
								<Textarea
									value={message}
									onChange={(e) => setMessage(e.target.value)}
									className="min-h-32 bg-background w-full dark:bg-[#212121] border-0 focus:border-ring resize-none"
									placeholder="Type your message to start the conversation..."
									disabled={
										isStreaming ||
										isLoadingAiResponse ||
										!selectedProviderId ||
										!isWalletReady
									}
									autoFocus={true}
								/>
								<div className="flex justify-between items-center">
									<div className="text-xs text-muted-foreground">
										{tokensBalance} token balance
									</div>
									<Button
										type="submit"
										disabled={
											isStreaming ||
											isLoadingAiResponse ||
											!selectedProviderId ||
											!isWalletReady ||
											!message.trim()
										}
										className="flex items-center gap-2"
									>
										{isStreaming ? (
											<>
												<div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
												Streaming...
											</>
										) : (
											<>
												<Send className="w-4 h-4" />
												Send Message
											</>
										)}
									</Button>
								</div>
							</form>

							{/* Error Display */}
							{aiError && (
								<div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
									Error: {aiError}
								</div>
							)}

							{/* Wallet Status Warning */}
							{!isWalletReady && (
								<div className="p-4 bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg text-sm">
									⚠️ Chat disabled until wallet is ready:{" "}
									{activeWalletInfo.message}
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Navigation Buttons - only show if not in message step */}
			{currentStep !== "message" && (
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
				</div>
			)}

			{/* Back button for message step */}
			{currentStep === "message" && (
				<div className="w-full max-w-3xl mt-8">
					<Button
						variant="outline"
						onClick={() => handleStepTransition("model")}
						className="flex items-center gap-2 transition-all duration-200 hover:scale-105"
					>
						<ChevronLeft className="w-4 h-4" /> Back to Models
					</Button>
				</div>
			)}
		</div>
	);
}
