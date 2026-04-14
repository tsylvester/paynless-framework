import type { ApiError } from "@paynless/types";
import type {
	AiProvider,
	Chat,
	ChatMessage,
	ISseConnection,
	IAiApiClient,
	Messages,
	SseChatCompleteEvent,
	SseChatEvent,
	SseChatStartEvent,
	SseContentChunkEvent,
	SystemPrompt,
} from "@paynless/types";

// --- Wire / fixture contracts (composed from production SSE types) ---

/** `chat_complete` event whose `assistantMessage` is a full `ChatMessage` row (including `is_active_in_thread`). */
export type HappyPathChatCompleteContract = SseChatCompleteEvent;

/** Ordered pair of `content_chunk` events for accumulation tests. */
export type ContentChunkSequenceContract = readonly [
	SseContentChunkEvent,
	SseContentChunkEvent,
];

/** Fixture: optimistic chat key differs from `chat_start.chatId` / final persisted chat. */
export interface OptimisticVersusStreamedChatIdContract {
	optimisticMessageChatId: Chat["id"];
	streamedChatId: Chat["id"];
	chatStart: SseChatStartEvent;
	chatComplete: SseChatCompleteEvent;
}

// --- sendStreamingMessage operation (deps / params / payload / return) ---

export type SseChatEventTypeGuard = (raw: unknown) => raw is SseChatEvent;

export interface SendStreamingMessageChatApiSlice {
	sendStreamingChatMessage: IAiApiClient["sendStreamingChatMessage"];
}

export interface SendStreamingMessageSseInboundSlice {
	isValidSseChatEvent: SseChatEventTypeGuard;
}

export interface SendStreamingMessageDeps {
	chatApi: SendStreamingMessageChatApiSlice;
	sseInbound: SendStreamingMessageSseInboundSlice;
}

export interface SendStreamingMessageParams {
	/** Bearer token for the streaming request. */
	authAccessToken: string;
	/** Authenticated user id when present; streaming may still validate session-only paths. */
	currentUserId: string | null;
}

export interface SendStreamingMessageUserRequest {
	message: string;
	providerId: AiProvider["id"];
	promptId: SystemPrompt["id"] | null;
	chatId?: Chat["id"] | null;
	contextMessages?: Messages[];
}

export type SendStreamingMessageOnMessageCallback = (
	event: MessageEvent,
) => void;

export type SendStreamingMessageOnCompleteCallback = (
	assistantMessage: ChatMessage,
) => void;

export type SendStreamingMessageOnErrorCallback = (error: string) => void;

export interface SendStreamingMessageStreamCallbacks {
	onMessage: SendStreamingMessageOnMessageCallback | undefined;
	onComplete: SendStreamingMessageOnCompleteCallback | undefined;
	onError: SendStreamingMessageOnErrorCallback | undefined;
}

export interface SendStreamingMessagePayload {
	userRequest: SendStreamingMessageUserRequest;
	callbacks: SendStreamingMessageStreamCallbacks;
}

export interface SendStreamingMessageSuccess {
	discriminator: "send_streaming_message_success";
	sseConnection: ISseConnection;
}

export type SendStreamingMessageErrorDetail =
    |   {
        channel: "api_transport";
        apiError: ApiError;
    }
    |   {
        channel: "client_precheck";
        message: string;
    };

export interface SendStreamingMessageError {
	discriminator: "send_streaming_message_error";
	detail: SendStreamingMessageErrorDetail;
}

export type SendStreamingMessageReturn =
	| SendStreamingMessageSuccess
	| SendStreamingMessageError;

export type SendStreamingMessageFn = (
	deps: SendStreamingMessageDeps,
	params: SendStreamingMessageParams,
	payload: SendStreamingMessagePayload,
) => Promise<SendStreamingMessageReturn>;
