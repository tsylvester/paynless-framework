"use client";

import React, { useEffect, memo, useState, useCallback, useRef } from "react";
import { useAiStore, selectCurrentChatMessages } from "@paynless/store";
import type { ChatMessage, AiState } from "@paynless/types";
//import { logger } from '@paynless/utils'
import { Terminal, Loader2 } from "lucide-react";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatTokenUsageDisplay } from "./ChatTokenUsageDisplay";
import ChatInput from "./ChatInput";
export interface AiChatboxProps {
	// Props can be defined if AiChatbox needs to pass anything down to ChatInput
	// or if it has its own specific props not related to input.
}

const AiChatboxComponent: React.FC<AiChatboxProps> = () => {
	const lastScrollTime = useRef<number>(0);
	const SCROLL_THROTTLE = 1500; // Only scroll every 500ms during streaming

	const currentChatMessages = useAiStore(selectCurrentChatMessages);
	const { currentChatId, isLoadingAiResponse, aiError } = useAiStore(
		(state: AiState) => ({
			currentChatId: state.currentChatId,
			isLoadingAiResponse: state.isLoadingAiResponse,
			aiError: state.aiError,
		}),
	);

	const rewindTargetMessageId = useAiStore(
		(state) => state.rewindTargetMessageId,
	);
	const prepareRewind = useAiStore((state) => state.prepareRewind);

	const [textInput, setTextInput] = useState("");
	const [isRewindMode, setIsRewindMode] = useState(false);
	const [originalContentForRewind, setOriginalContentForRewind] = useState("");

	// Throttled scroll function
	const throttledScroll = useCallback(() => {
		const now = Date.now();
		if (now - lastScrollTime.current >= SCROLL_THROTTLE) {
			lastScrollTime.current = now;
			window.scrollTo({
				top: document.documentElement.scrollHeight,
				behavior: "auto",
			});
		}
	}, [SCROLL_THROTTLE]);

	// Auto-scroll effect - scroll on changes but throttled during streaming
	useEffect(() => {
		const latestMessage = currentChatMessages[currentChatMessages.length - 1];
		const isStreaming = latestMessage?.status === "streaming";

		if (isStreaming) {
			// During streaming - use throttled scroll
			throttledScroll();
		} else if (currentChatMessages.length > 0) {
			// New complete message - always scroll smoothly
			setTimeout(() => {
				window.scrollTo({
					top: document.documentElement.scrollHeight,
					behavior: "smooth",
				});
			}, 100);
		}
	}, [currentChatMessages, throttledScroll]);

	useEffect(() => {
		//logger.info("AiChatbox MOUNTED");
		return () => {
			//logger.info("AiChatbox UNMOUNTING");
		};
	}, []);

	const handleEditClick = (messageId: string, currentContent: string) => {
		if (currentChatId) {
			setOriginalContentForRewind(currentContent);
			setTextInput(currentContent);
			setIsRewindMode(true);
			prepareRewind(messageId, currentChatId);
		}
	};

	useEffect(() => {
		if (!rewindTargetMessageId && isRewindMode) {
			setIsRewindMode(false);
			setTextInput("");
			setOriginalContentForRewind("");
		}
	}, [rewindTargetMessageId, isRewindMode]);

	return (
		<div
			className="flex flex-col h-full rounded-md p-4 space-y-4"
			data-testid="ai-chatbox-container"
		>
			<div
				className="flex-grow pr-4 overflow-y-scroll min-h-[200px] scrollbar-none"
				data-testid="ai-chatbox-scroll-area"
			>
				<div className="flex flex-col space-y-2">
					{currentChatMessages.map((msg: ChatMessage, index: number) => {
						const isLastMessage = index === currentChatMessages.length - 1;
						const isAssistant = msg.role === "assistant";
						return (
							<div key={msg.id} className="flex flex-row items-start w-full">
								<ChatMessageBubble
									message={msg}
									onEditClick={
										msg.role === "user" ? handleEditClick : undefined
									}
								/>
							</div>
						);
					})}
					{isLoadingAiResponse &&
						(() => {
							// Check if the latest message is streaming - if so, don't show thinking indicator
							const latestMessage =
								currentChatMessages[currentChatMessages.length - 1];
							const isStreaming = latestMessage?.status === "streaming";

							if (!isStreaming) {
								return (
									<div className="flex justify-center w-full mb-4">
										<div className="flex items-center space-x-2 w-[70%] px-5">
											<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
											<span className="text-sm text-muted-foreground">
												Assistant is thinking...
											</span>
										</div>
									</div>
								);
							}
							return null;
						})()}
				</div>
			</div>

			{aiError && (
				<div className="p-4 rounded-md bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
					<div className="flex items-center space-x-2">
						<Terminal className="h-4 w-4" />
						<h3 className="font-semibold">Error</h3>
					</div>
					<p className="text-sm mt-1">{aiError}</p>
				</div>
			)}

			<ChatInput />
		</div>
	);
};

export const AiChatbox = memo(AiChatboxComponent);
AiChatbox.displayName = "AiChatbox";
