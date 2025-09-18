import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAiStore, useOrganizationStore } from "@paynless/store";
import { logger } from "@paynless/utils";
import { analytics } from "@paynless/analytics";
import { ModelSelector } from "../components/ai/ModelSelector";
import { PromptSelector } from "../components/ai/PromptSelector";
import { AiChatbox } from "../components/ai/AiChatbox";
import { ChatContextSelector } from "../components/ai/ChatContextSelector";
import { WalletSelector } from "../components/ai/WalletSelector";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import type { Chat } from "@paynless/types"; // Import Chat type
import ErrorBoundary from "../components/common/ErrorBoundary"; // Added ErrorBoundary

export default function AiChatPage() {
	const { chatId } = useParams<{ chatId?: string }>();
	const navigate = useNavigate();

	const {
		loadAiConfig,
		loadChatDetails,
		startNewChat,
		currentChatId,
		availablePrompts,
		chatsByContext,
		isDetailsLoading,
		selectedPromptId,
		setSelectedPrompt,
		newChatContext,
	} = useAiStore((state) => ({
		loadAiConfig: state.loadAiConfig,
		loadChatDetails: state.loadChatDetails,
		startNewChat: state.startNewChat,
		currentChatId: state.currentChatId,
		availableProviders: state.availableProviders,
		availablePrompts: state.availablePrompts,
		chatsByContext: state.chatsByContext,
		isDetailsLoading: state.isDetailsLoading,
		selectedProviderId: state.selectedProviderId,
		selectedPromptId: state.selectedPromptId,
		setSelectedPrompt: state.setSelectedPrompt,
		newChatContext: state.newChatContext,
	}));

	// Organization Store data
	const { currentOrganizationId: globalCurrentOrgId, userOrganizations } =
		useOrganizationStore((state) => ({
			currentOrganizationId: state.currentOrganizationId,
			userOrganizations: state.userOrganizations,
		}));

	console.log(
		"AiChatPage rendering/re-rendering. isDetailsLoading:",
		isDetailsLoading,
	);

	useEffect(() => {
		console.log("AiChatPage MOUNTED");
		return () => {
			console.log("AiChatPage UNMOUNTING");
		};
	}, []);

	// --- Selector for current chat details (conceptual) ---
	const currentChatDetails: Chat | null | undefined = useMemo(() => {
		if (!currentChatId || !chatsByContext) return null;
		// Check personal chats
		const personalChat = chatsByContext.personal?.find(
			(c) => c.id === currentChatId,
		);
		if (personalChat) return personalChat;
		// Check org chats
		if (chatsByContext.orgs) {
			for (const orgId in chatsByContext.orgs) {
				const orgChats = chatsByContext.orgs[orgId];
				const orgChat = orgChats?.find((c) => c.id === currentChatId);
				if (orgChat) return orgChat;
			}
		}
		return null;
	}, [currentChatId, chatsByContext]);

	// Load AI config (public)
	useEffect(() => {
		console.log(
			"[AiChatPage] Config effect running - attempting to call loadAiConfig",
		);
		if (loadAiConfig) loadAiConfig();
		else console.error("[AiChatPage] loadAiConfig is undefined!");
	}, [loadAiConfig]);

	// Effect to handle selectedPromptId based on loaded chat or initial default.
	// Default provider selection is handled by loadAiConfig and startNewChat in the store.
	useEffect(() => {
		if (currentChatDetails && currentChatDetails.system_prompt_id) {
			// If a chat is loaded and has a specific system_prompt_id, set it as the selectedPromptId
			// Only update if it's different from the current selectedPromptId to avoid unnecessary calls/renders
			if (selectedPromptId !== currentChatDetails.system_prompt_id) {
				setSelectedPrompt(currentChatDetails.system_prompt_id);
				logger.info(
					`[AiChatPage] Prompt set from loaded chat details: ${currentChatDetails.system_prompt_id}`,
				);
			}
		} else if (
			!currentChatId &&
			availablePrompts &&
			availablePrompts.length > 0
		) {
			// If no chat is currently active (e.g., initial page load before any chat selection or new chat)
			// and no prompt is selected yet, default to the first available prompt.
			if (!selectedPromptId) {
				setSelectedPrompt(availablePrompts[0].id);
				logger.info(
					`[AiChatPage] Default prompt set (no active chat): ${availablePrompts[0].id}`,
				);
			}
		}
		// Note: The store's startNewChat action now handles setting a default prompt for brand new chats.
		// This useEffect primarily syncs the prompt when an existing chat is loaded or sets an initial page default.
	}, [
		currentChatId,
		currentChatDetails,
		availablePrompts,
		selectedPromptId,
		setSelectedPrompt,
	]);

	// Handle chatId from URL parameter
	useEffect(() => {
		if (chatId && chatId !== currentChatId) {
			logger.info(`[AiChatPage] Loading chat from URL parameter: ${chatId}`);
			loadChatDetails(chatId);
		}
	}, [chatId, currentChatId, loadChatDetails]);

	// Load chat ID from localStorage on redirect
	useEffect(() => {
		const chatIdToLoad = localStorage.getItem("loadChatIdOnRedirect");
		if (chatIdToLoad) {
			localStorage.removeItem("loadChatIdOnRedirect");
			console.log(
				`[AiChatPage] Found chatId ${chatIdToLoad} in localStorage, loading details...`,
			);
			if (loadChatDetails) loadChatDetails(chatIdToLoad);
			else
				console.warn(
					"[AiChatPage] loadChatDetails is undefined during redirect load!",
				);
		}
	}, [loadChatDetails]);

	// const handlePromptChange = (promptId: string | null) => { // Removed as PromptSelector handles its own state via store
	//   setSelectedPrompt(promptId);
	//   analytics.track('Chat: Prompt Selected', { promptId });
	// };

	const handleNewChat = () => {
		const contextForNewChat =
			newChatContext === undefined ? globalCurrentOrgId : newChatContext;
		logger.info(
			`[AiChatPage] Starting new chat with context: ${contextForNewChat}`,
		);

		const contextIdForAnalytics =
			contextForNewChat === null ? "personal" : contextForNewChat || "unknown";

		analytics.track("Chat: Clicked New Chat", {
			contextId: contextIdForAnalytics,
		});

		startNewChat(contextForNewChat);
	};

	// const activeContextIdFromStores =
	// 	newChatContext === undefined ? globalCurrentOrgId : newChatContext;
	// Canonize 'personal' as the string identifier for the personal context.
	// const activeContextIdForHistory =
	// 	activeContextIdFromStores === null ? "personal" : activeContextIdFromStores;

	// const contextTitleForHistory = useMemo(() => {
	// 	if (typeof activeContextIdForHistory === "undefined")
	// 		return "Loading History...";
	// 	if (activeContextIdForHistory === "personal")
	// 		return "Personal Chat History";
	// 	const org = userOrganizations.find(
	// 		(o) => o.id === activeContextIdForHistory,
	// 	);
	// 	return org ? `${org.name} Chat History` : "Organization Chat History";
	// }, [activeContextIdForHistory, userOrganizations]);

	return (
		<ErrorBoundary>
			{/* Clean header bar */}
			<div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="flex items-center justify-between px-6 py-3">
					{/* Left side - Primary controls */}
					<div className="flex items-center space-x-3">
						<ChatContextSelector />
						<div className="h-4 w-px bg-border" />
						<ModelSelector />
						<PromptSelector />
					</div>

					{/* Right side - Secondary controls */}
					<div className="flex items-center space-x-3">
						<WalletSelector />
						<Button
							variant="default"
							size="sm"
							onClick={handleNewChat}
							data-testid="new-chat-button"
							className="shadow-sm"
						>
							<Plus className="mr-2 h-4 w-4" />
							New Chat
						</Button>
					</div>
				</div>
			</div>

			{/* Chat content area */}
			<div className="flex-grow overflow-y-auto">
				{isDetailsLoading ? (
					<>
						{/* Conditional console.log for debugging */}
						{console.log(
							"[AiChatPage] Details are loading, showing skeleton...",
						)}
						<div className="space-y-4">
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-16 w-3/4 ml-auto" />
						</div>
					</>
				) : (
					<AiChatbox />
				)}
			</div>
		</ErrorBoundary>
	);
}
