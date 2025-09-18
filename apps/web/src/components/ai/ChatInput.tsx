"use client";

import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
	useAiStore,
	selectCurrentChatMessages,
	selectIsLoadingAiResponse,
	selectAiError,
	selectRewindTargetMessageId,
	selectIsRewinding,
} from "@paynless/store";
import { ChatMessage } from "@paynless/types";
import { logger } from "@paynless/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSelectionControls } from "./MessageSelectionControls";
import { toast } from "sonner";
import { useAIChatAffordabilityStatus } from "@/hooks/useAIChatAffordabilityStatus";
import { AlertCircle, Info, Zap } from "lucide-react";
import { ContinueUntilCompleteToggle } from "../common/ContinueUntilCompleteToggle";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface ChatInputProps {
	// No props for now, revised from previous attempt
}

const ChatInput: React.FC<ChatInputProps> = (
	/* Removed currentChatSession prop */
) => {
	const navigate = useNavigate();
	const location = useLocation();
	const [inputMessage, setInputMessage] = useState(""); // Reverted to local state
	const [isStreamingEnabled, setIsStreamingEnabled] = useState(true); // Streaming enabled by default

	// Actions from store
	const {
		sendMessage,
		sendStreamingMessage,
		clearAiError,
		cancelRewindPreparation,
		currentChatId, // Get currentChatId directly
		messagesByChatId, // Get messagesByChatId for rewind logic
	} = useAiStore.getState();

	// Selectors from store
	const isLoadingAiResponse = useAiStore(selectIsLoadingAiResponse);
	const aiError = useAiStore(selectAiError);
	const rewindTargetMessageId = useAiStore(selectRewindTargetMessageId);
	const isRewinding = useAiStore(selectIsRewinding);
	const selectedMessages = useAiStore(selectCurrentChatMessages); // Moved to top level

	// Simplified affordability check without token estimation
	const { canAffordNext, lowBalanceWarning, currentBalance } =
		useAIChatAffordabilityStatus(0);

	React.useEffect(() => {
		if (rewindTargetMessageId && currentChatId) {
			// Use currentChatId from store
			const messagesInCurrentChat = messagesByChatId[currentChatId];
			const messageToEdit = messagesInCurrentChat?.find(
				(msg) => msg.id === rewindTargetMessageId,
			);
			if (messageToEdit) {
				setInputMessage(messageToEdit.content); // Use local setInputMessage
			}
		} else {
			// If not rewinding, ensure input is clear if messageToEdit was not found or IDs are null.
			// Avoids clearing if user is typing and rewindTargetMessageId becomes null for other reasons.
			if (!rewindTargetMessageId) {
				// setInputMessage(''); // Decided against auto-clearing to preserve user input during other state changes
			}
		}
		// Ensure messagesByChatId is in dependency array if it can change and affect this logic
	}, [rewindTargetMessageId, currentChatId, messagesByChatId, setInputMessage]);

	const handleSend = async () => {
		if (
			!inputMessage.trim() ||
			isLoadingAiResponse ||
			!canAffordNext
		)
			return;
		clearAiError();

		const { selectedProviderId, selectedPromptId } = useAiStore.getState();
		// selectedMessages is now accessed from the top-level const

		const contextMessages = selectedMessages.map((msg: ChatMessage) => ({
			role: msg.role as "user" | "assistant" | "system", // Added type assertion
			content: msg.content,
		}));

		logger.info(
			`[ChatInput] handleSend called. Provider: ${selectedProviderId}, Prompt: ${selectedPromptId}, Rewinding: ${isRewinding}, Can Afford: ${canAffordNext}, Streaming: ${isStreamingEnabled}`,
		);

		if (!selectedProviderId) {
			logger.error("[ChatInput] Cannot send message: No provider selected");
			toast.error("Cannot send message: No provider selected");
			return;
		}

		const messageData = {
			message: inputMessage,
			chatId: currentChatId ?? undefined,
			providerId: selectedProviderId,
			promptId: selectedPromptId,
			contextMessages: contextMessages,
		};

		try {
			if (isStreamingEnabled && !isRewinding) {
				// Use streaming for new messages (not rewind)
				const eventSource = await sendStreamingMessage(
					messageData,
					(event) => {
						// Handle streaming message events (optional)
						logger.info("[ChatInput] Streaming chunk received");
					},
					(assistantMessage) => {
						// Handle completion - navigate to chat URL after streaming is done
						logger.info("[ChatInput] Streaming completed:", {
							assistantMessageId: assistantMessage.id,
						});
						toast.success("Message sent via streaming");
						
						// Navigate to chat URL after streaming completes
						const { currentChatId } = useAiStore.getState();
						if (currentChatId && !location.pathname.includes(currentChatId)) {
							navigate(`/chat/${currentChatId}`, { replace: true });
						}
					},
					(error) => {
						// Handle streaming errors
						logger.error("[ChatInput] Streaming error:", { error });
						toast.error(`Streaming failed: ${error}`);
					},
				);

				if (eventSource) {
					setInputMessage("");
					toast.info("Starting streaming response...");
				}
			} else {
				// Use regular send for rewind or when streaming is disabled
				await sendMessage(messageData);
				setInputMessage("");

				// Navigate to chat URL if we're not already there and this is a new chat
				const { currentChatId } = useAiStore.getState();
				if (currentChatId && !location.pathname.includes(currentChatId)) {
					navigate(`/chat/${currentChatId}`, { replace: true });
				}

				if (isRewinding) {
					cancelRewindPreparation();
					toast.success("Message rewound and resubmitted successfully");
				} else {
					toast.success("Message sent");
				}
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error("[ChatInput] Unexpected error calling sendMessage:", {
				error: errorMessage,
			});
			toast.error(
				isRewinding
					? "Failed to rewind and resubmit message"
					: "Failed to send message",
			);
			// Do not clear inputMessage on error
		}
	};

	const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInputMessage(event.target.value); // Use local setInputMessage
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	};

	const handleCancelRewind = () => {
		cancelRewindPreparation();
		setInputMessage(""); // Clear local inputMessage when cancelling rewind
	};

	const sendButtonDisabled =
		isLoadingAiResponse ||
		!inputMessage.trim() ||
		!canAffordNext;

	return (
		<div className="flex flex-col space-y-2">
			{aiError /* Display AI Error if present */ && (
				<div
					className="flex items-center p-2 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
					data-testid="ai-error-alert"
				>
					<AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
					{aiError}
				</div>
			)}

			{/* Main input container with ChatGPT-like styling */}
			<div className="relative border border-border rounded-xl p-3 shadow-sm max-w-2xl w-full mx-auto bg-[#fafafa] dark:bg-[#111]">
				<Textarea
					placeholder={
						rewindTargetMessageId
							? "Edit your message..."
							: "Type your message here..."
					}
					value={inputMessage}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					rows={1}
					className="w-full resize-none max-w-[600px] min-h-[90px] max-h-[150px] border-0 bg-transparent p-0 focus:ring-0 focus:border-0 outline-none shadow-none"
					disabled={isLoadingAiResponse}
					data-testid="chat-input-textarea"
				/>

				{/* Send button positioned inside the textarea like ChatGPT */}
				<div className="absolute right-2 bottom-2 flex items-center space-x-2">
					{rewindTargetMessageId ? (
						<div className="flex space-x-1">
							<Button
								onClick={handleCancelRewind}
								variant="outline"
								size="sm"
								disabled={isLoadingAiResponse}
								data-testid="cancel-rewind-button"
							>
								Cancel
							</Button>
							<Button
								onClick={handleSend}
								disabled={sendButtonDisabled}
								size="sm"
								data-testid="resubmit-message-button"
							>
								Resubmit
							</Button>
						</div>
					) : (
						<Button
							onClick={handleSend}
							disabled={sendButtonDisabled}
							size="sm"
							className="rounded-lg"
							data-testid="send-message-button"
						>
							Send
						</Button>
					)}
				</div>
				{/* Controls moved to bottom */}
				<div className="flex items-center justify-between text-sm">
					<div className="flex items-center space-x-4">
						<MessageSelectionControls />
						<ContinueUntilCompleteToggle />
					</div>
				</div>
			</div>

			{!canAffordNext && (
				<div
					className="flex items-center p-2 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
					data-testid="insufficient-balance-alert"
				>
					<AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
					Insufficient token balance to send this message. Current balance:{" "}
					{currentBalance} tokens.
				</div>
			)}
			{canAffordNext && lowBalanceWarning && (
				<div
					className="flex items-center p-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-300 rounded-md dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700"
					data-testid="low-balance-alert"
				>
					<Info className="w-4 h-4 mr-2 flex-shrink-0" />
					Low token balance. Current balance: {currentBalance} tokens.
				</div>
			)}
		</div>
	);
};

export default React.memo(ChatInput);
