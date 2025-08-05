import { useState, useRef, useEffect } from "react";
import {
	useAiStore,
	useWalletStore,
	selectActiveChatWalletInfo,
} from "@paynless/store";
import { useChatWalletDecision } from "@/hooks/useChatWalletDecision";

export const StreamingChatDemo = () => {
	const [message, setMessage] = useState("");
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const {
		sendMessage,
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

	const isWalletReady = activeWalletInfo.status === "ok";

	const handleStreamingSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!message.trim() || !selectedProviderId) return;

		// Check wallet status before attempting to send
		if (!isWalletReady) {
			console.error("Wallet not ready:", activeWalletInfo.message);
			return;
		}

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

	const handleRegularSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!message.trim() || !selectedProviderId) return;

		// Check wallet status before attempting to send
		if (!isWalletReady) {
			console.error("Wallet not ready:", activeWalletInfo.message);
			return;
		}

		try {
			await sendMessage({
				message: message.trim(),
				providerId: selectedProviderId,
				promptId: selectedPromptId,
			});
		} catch (error) {
			console.error("Error sending regular message:", error);
		}

		setMessage("");
	};

	return (
		<div className="max-w-4xl mx-auto p-6 shadow-lg rounded-lg">
			<h2 className="text-2xl font-bold mb-6 text-gray-800">
				AI Chat Streaming Demo
			</h2>

			{aiError && (
				<div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
					Error: {aiError}
				</div>
			)}

			{/* Wallet Status Display */}
			<div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
				<h3 className="font-semibold mb-2 text-blue-800">Wallet Status:</h3>
				<div className="text-sm">
					<p>
						<span className="font-medium">Status:</span>{" "}
						{activeWalletInfo.status}
					</p>
					<p>
						<span className="font-medium">Type:</span>{" "}
						{activeWalletInfo.type || "None"}
					</p>
					<p>
						<span className="font-medium">Balance:</span>{" "}
						{activeWalletInfo.balance || "Unknown"}
					</p>
					{activeWalletInfo.message && (
						<p>
							<span className="font-medium">Message:</span>{" "}
							{activeWalletInfo.message}
						</p>
					)}
					{!isWalletReady && (
						<p className="text-orange-600 mt-2">
							⚠️ Chat disabled until wallet is ready
						</p>
					)}
				</div>
			</div>

			<form onSubmit={handleStreamingSubmit} className="mb-6">
				<div className="flex gap-4 mb-4">
					<input
						type="text"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						placeholder="Type your message here..."
						disabled={
							isStreaming ||
							isLoadingAiResponse ||
							!selectedProviderId ||
							!isWalletReady
						}
						className="flex-1 bg-transparent px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<button
						type="submit"
						disabled={
							isStreaming ||
							isLoadingAiResponse ||
							!selectedProviderId ||
							!isWalletReady
						}
						className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
					>
						{isStreaming ? "Streaming..." : "Send (Streaming)"}
					</button>
					<button
						type="button"
						onClick={handleRegularSubmit}
						disabled={
							isStreaming ||
							isLoadingAiResponse ||
							!selectedProviderId ||
							!isWalletReady
						}
						className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
					>
						{isLoadingAiResponse ? "Sending..." : "Send (Regular)"}
					</button>
				</div>
			</form>

			{/* Streaming Response Display */}
			{(isStreaming || streamingContent) && (
				<div className="mb-6">
					<h3 className="text-lg font-semibold mb-2 text-gray-700">
						Streaming Response:
					</h3>
					<div className="p-4 rounded-lg min-h-[100px]">
						<div className="whitespace-pre-wrap font-mono text-sm">
							{streamingContent}
							{isStreaming && (
								<span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1"></span>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Provider/Prompt Status */}
			<div className="mt-6 p-4  rounded-lg">
				<h3 className="font-semibold mb-2">Configuration:</h3>
				<p className="text-sm">
					<span className="font-medium">Provider:</span>{" "}
					{selectedProviderId || "None selected"}
				</p>
				<p className="text-sm">
					<span className="font-medium">Prompt:</span>{" "}
					{selectedPromptId || "None selected"}
				</p>
				{!selectedProviderId && (
					<p className="text-red-500 text-sm mt-2">
						Please select an AI provider to send messages.
					</p>
				)}
			</div>

			{/* Implementation Notes */}
			<div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
				<h3 className="font-semibold mb-2 text-blue-800">
					How Streaming Works:
				</h3>
				<ul className="text-sm text-blue-700 space-y-1">
					<li>
						• <strong>Streaming Button:</strong> Uses Server-Sent Events (SSE)
						to receive AI response chunks in real-time
					</li>
					<li>
						• <strong>Regular Button:</strong> Uses the standard API to get the
						complete response at once
					</li>
					<li>
						• <strong>Backend:</strong> The streaming endpoint is at{" "}
						<code>/functions/v1/chat-stream</code>
					</li>
					<li>
						• <strong>Current Status:</strong> Streaming infrastructure is
						ready, demonstrating with simulated chunks
					</li>
					<li>
						• <strong>Next Steps:</strong> Integrate with actual AI provider
						streaming APIs (OpenAI, Anthropic, etc.)
					</li>
				</ul>
			</div>
		</div>
	);
};
