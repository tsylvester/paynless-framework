import React, { useState } from "react";
import { ChatMessage, TokenUsage } from "@paynless/types";
import { Card } from "@/components/ui/card";
import { AttributionDisplay } from "../common/AttributionDisplay";
import { useAiStore } from "@paynless/store";
import { MarkdownRenderer } from "../common/MarkdownRenderer";
import { Pencil, Zap, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageSelectionCheckbox } from "./MessageSelectionCheckbox";
import { TokenUsageDisplay } from "./TokenUsageDisplay";

export interface ChatMessageBubbleProps {
	message: ChatMessage;
	onEditClick?: (messageId: string, messageContent: string) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
	message,
	onEditClick,
}) => {
	const { currentChatId } = useAiStore((state) => ({
		currentChatId: state.currentChatId,
	}));
	const [showDetails, setShowDetails] = useState(false);
	const isUserMessage = message.role === "user";
	const isStreaming = message.status === "streaming";

	const bubbleColorClass = "";

	return (
		<div className="flex justify-center w-full mb-4 group">
			<div className="flex flex-col w-[70%]">
				{/* Message bubble */}
				<Card
					className={`p-4 w-full break-words bg-transparent border-0 shadow-none ${bubbleColorClass}`}
					data-testid="chat-message-bubble-card"
					data-message-id={message.id}
				>
					<div>
						<MarkdownRenderer content={message.content} />
						{isStreaming && (
							<div className="flex items-center mt-2 text-xs text-muted-foreground">
								<Zap className="w-3 h-3 mr-1" />
								<span>Streaming...</span>
							</div>
						)}
					</div>
				</Card>

				{/* Toggle button and conditionally shown details at bottom */}
				<div className="flex items-center mt-1 px-1">
					{message.role === "assistant" && message.token_usage && (
						<Button
							variant="ghost"
							size="icon"
							className="h-5 w-5 opacity-50 hover:opacity-100 transition-opacity mr-2"
							onClick={() => setShowDetails(!showDetails)}
							aria-label="Toggle message details"
						>
							<Info className="h-4 w-4" />
						</Button>
					)}

					{/* Conditionally shown details to the right of the button */}
					{showDetails && (
						<div className="flex items-center space-x-2 text-xs text-muted-foreground opacity-70">
							<MessageSelectionCheckbox
								messageId={message.id}
								chatId={currentChatId}
							/>
							<AttributionDisplay
								userId={message.user_id}
								role={message.role as "user" | "assistant"}
								timestamp={message.created_at}
								organizationId={
									"organization_id" in message
										? (
												message as ChatMessage & {
													organization_id?: string | null;
												}
											).organization_id
										: undefined
								}
								modelId={message.ai_provider_id}
							/>
							{/* Token usage display for assistant messages */}
							{message.role === "assistant" && message.token_usage && (
								<div className="text-xs text-muted-foreground/70">
									<TokenUsageDisplay
										tokenUsage={message.token_usage as TokenUsage}
									/>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
