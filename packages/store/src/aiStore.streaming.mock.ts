import { isSseChatEvent } from "@paynless/utils";
import type {
	ApiError,
	ChatApiRequest,
	ChatMessage,
	FetchOptions,
	IAiApiClient,
	ISseConnection,
	SseChatCompleteEvent,
	SseChatEvent,
	SseChatStartEvent,
	SseContentChunkEvent,
} from "@paynless/types";
import type {
	ContentChunkSequenceContract,
	HappyPathChatCompleteContract,
	OptimisticVersusStreamedChatIdContract,
	SendStreamingMessageDeps,
	SendStreamingMessageError,
	SendStreamingMessageFn,
	SendStreamingMessageParams,
	SendStreamingMessagePayload,
	SendStreamingMessageStreamCallbacks,
	SendStreamingMessageSuccess,
	SendStreamingMessageUserRequest,
} from "./aiStore.streaming.interface";

export const contractStreamingTimestamp: string = "2024-01-01T12:00:00.000Z";

export const contractStreamingChatId: string = "00000000-0000-4000-8000-0000000000a1";

export const contractStreamingAssistantMessageId: string =
	"00000000-0000-4000-8000-0000000000b2";

export const contractOptimisticChatId: string =
	"00000000-0000-4000-8000-0000000000c3";

export const contractStreamedNewChatId: string =
	"00000000-0000-4000-8000-0000000000d4";

function contractBaseAssistantMessage(
	chatId: string,
	content: string,
): ChatMessage {
	const message: ChatMessage = {
		id: contractStreamingAssistantMessageId,
		chat_id: chatId,
		role: "assistant",
		content,
		user_id: "contract-streaming-user-id",
		ai_provider_id: "contract-provider-id",
		system_prompt_id: "contract-prompt-id",
		token_usage: null,
		created_at: contractStreamingTimestamp,
		updated_at: contractStreamingTimestamp,
		is_active_in_thread: true,
		error_type: null,
		response_to_message_id: null,
	};
	return message;
}

/** Minimal `ISseConnection` for unit tests — no timing; tests call `emitSseMessages` after listeners attach. */
export function createSseConnectionStub(): ISseConnection {
	class SseConnectionStub extends EventTarget implements ISseConnection {
		close(): void {}
	}
	return new SseConnectionStub();
}

/** Synchronously deliver SSE payloads as `message` events (caller controls when this runs). */
export function emitSseMessages(
	connection: ISseConnection,
	events: readonly SseChatEvent[],
): void {
	for (const payload of events) {
		const messageEvent: MessageEvent = new MessageEvent("message", {
			data: payload,
		});
		connection.dispatchEvent(messageEvent);
	}
}

const defaultSendStreamingChatMessage: IAiApiClient["sendStreamingChatMessage"] =
	async (
		_data: ChatApiRequest,
		_options?: FetchOptions,
	): Promise<ISseConnection | { error: ApiError }> => {
		return createSseConnectionStub();
	};

export function mockSendStreamingMessageDeps(
	overrides?: Partial<{
		chatApi: Partial<SendStreamingMessageDeps["chatApi"]>;
		sseInbound: Partial<SendStreamingMessageDeps["sseInbound"]>;
	}>,
): SendStreamingMessageDeps {
	const defaults: SendStreamingMessageDeps = {
		chatApi: {
			sendStreamingChatMessage: defaultSendStreamingChatMessage,
		},
		sseInbound: {
			isValidSseChatEvent: isSseChatEvent,
		},
	};
	if (overrides === undefined) {
		return defaults;
	}
	const chatApi: SendStreamingMessageDeps["chatApi"] = {
		sendStreamingChatMessage:
			overrides.chatApi?.sendStreamingChatMessage !== undefined
				? overrides.chatApi.sendStreamingChatMessage
				: defaults.chatApi.sendStreamingChatMessage,
	};
	const sseInbound: SendStreamingMessageDeps["sseInbound"] = {
		isValidSseChatEvent:
			overrides.sseInbound?.isValidSseChatEvent !== undefined
				? overrides.sseInbound.isValidSseChatEvent
				: defaults.sseInbound.isValidSseChatEvent,
	};
	return { chatApi, sseInbound };
}

export function mockSendStreamingMessageParams(
	overrides?: Partial<SendStreamingMessageParams>,
): SendStreamingMessageParams {
	const defaults: SendStreamingMessageParams = {
		authAccessToken: "mock-access-token",
		currentUserId: "mock-user-id",
	};
	if (overrides === undefined) {
		return defaults;
	}
	return {
		authAccessToken:
			overrides.authAccessToken !== undefined
				? overrides.authAccessToken
				: defaults.authAccessToken,
		currentUserId:
			overrides.currentUserId !== undefined
				? overrides.currentUserId
				: defaults.currentUserId,
	};
}

export function mockSendStreamingMessagePayload(
	overrides?: Partial<{
		userRequest: Partial<SendStreamingMessageUserRequest>;
		callbacks: Partial<SendStreamingMessageStreamCallbacks>;
	}>,
): SendStreamingMessagePayload {
	const defaultUserRequest: SendStreamingMessageUserRequest = {
		message: "mock message",
		providerId: "mock-provider-id",
		promptId: "mock-prompt-id",
		chatId: contractStreamingChatId,
		contextMessages: undefined,
	};
	const defaultCallbacks: SendStreamingMessageStreamCallbacks = {
		onMessage: undefined,
		onComplete: undefined,
		onError: undefined,
	};
	if (overrides === undefined) {
		return {
			userRequest: defaultUserRequest,
			callbacks: defaultCallbacks,
		};
	}
	const userPatch: Partial<SendStreamingMessageUserRequest> | undefined =
		overrides.userRequest;
	const callPatch: Partial<SendStreamingMessageStreamCallbacks> | undefined =
		overrides.callbacks;
	const userRequest: SendStreamingMessageUserRequest = {
		message:
			userPatch?.message !== undefined
				? userPatch.message
				: defaultUserRequest.message,
		providerId:
			userPatch?.providerId !== undefined
				? userPatch.providerId
				: defaultUserRequest.providerId,
		promptId:
			userPatch?.promptId !== undefined
				? userPatch.promptId
				: defaultUserRequest.promptId,
		chatId:
			userPatch?.chatId !== undefined ? userPatch.chatId : defaultUserRequest.chatId,
		contextMessages:
			userPatch?.contextMessages !== undefined
				? userPatch.contextMessages
				: defaultUserRequest.contextMessages,
	};
	const callbacks: SendStreamingMessageStreamCallbacks = {
		onMessage:
			callPatch?.onMessage !== undefined
				? callPatch.onMessage
				: defaultCallbacks.onMessage,
		onComplete:
			callPatch?.onComplete !== undefined
				? callPatch.onComplete
				: defaultCallbacks.onComplete,
		onError:
			callPatch?.onError !== undefined
				? callPatch.onError
				: defaultCallbacks.onError,
	};
	return { userRequest, callbacks };
}

export function mockSendStreamingMessageSuccess(
	overrides?: Partial<SendStreamingMessageSuccess>,
): SendStreamingMessageSuccess {
	const defaultConnection: ISseConnection = createSseConnectionStub();
	if (overrides === undefined) {
		return {
			discriminator: "send_streaming_message_success",
			sseConnection: defaultConnection,
		};
	}
	return {
		discriminator: "send_streaming_message_success",
		sseConnection:
			overrides.sseConnection !== undefined
				? overrides.sseConnection
				: defaultConnection,
	};
}

export function mockSendStreamingMessageError(
	overrides?: Partial<SendStreamingMessageError>,
): SendStreamingMessageError {
	const defaultDetail: SendStreamingMessageError["detail"] = {
		channel: "client_precheck",
		message: "mock sendStreamingMessage error",
	};
	if (overrides === undefined) {
		return {
			discriminator: "send_streaming_message_error",
			detail: defaultDetail,
		};
	}
	return {
		discriminator: "send_streaming_message_error",
		detail: overrides.detail !== undefined ? overrides.detail : defaultDetail,
	};
}

export const mockSendStreamingMessage: SendStreamingMessageFn = async (
	_deps,
	_params,
	_payload,
) => {
	return mockSendStreamingMessageSuccess();
};

/**
 * Invalid wire payload: `chat_complete` whose `assistantMessage` omits `is_active_in_thread`.
 * Used to assert `isSseChatEvent` rejects payloads that are not assignable to `SseChatCompleteEvent`.
 */
export function buildWireChatCompleteAssistantMissingIsActive(): unknown {
	const full: SseChatCompleteEvent = buildHappyPathChatCompleteEvent();
	const am: ChatMessage = full.assistantMessage;
	const stripped: Record<string, unknown> = {
		id: am.id,
		chat_id: am.chat_id,
		role: am.role,
		content: am.content,
		user_id: am.user_id,
		ai_provider_id: am.ai_provider_id,
		system_prompt_id: am.system_prompt_id,
		token_usage: am.token_usage,
		created_at: am.created_at,
		updated_at: am.updated_at,
		error_type: am.error_type,
		response_to_message_id: am.response_to_message_id,
	};
	return {
		type: "chat_complete",
		assistantMessage: stripped,
		finish_reason: full.finish_reason,
		timestamp: full.timestamp,
	};
}

export function buildHappyPathChatCompleteEvent(
	overrides?: Partial<SseChatCompleteEvent>,
): HappyPathChatCompleteContract {
	const assistantMessage: ChatMessage = contractBaseAssistantMessage(
		contractStreamingChatId,
		"contract complete body",
	);
	const base: SseChatCompleteEvent = {
		type: "chat_complete",
		assistantMessage,
		finish_reason: null,
		timestamp: contractStreamingTimestamp,
	};
	if (overrides === undefined) {
		return base;
	}
	return {
		...base,
		...overrides,
		assistantMessage:
			overrides.assistantMessage !== undefined
				? overrides.assistantMessage
				: base.assistantMessage,
	};
}

export function buildContentChunkAccumulationSequence(
	overrides?: {
		first?: Partial<SseContentChunkEvent>;
		second?: Partial<SseContentChunkEvent>;
	},
): ContentChunkSequenceContract {
	const firstDefaults: SseContentChunkEvent = {
		type: "content_chunk",
		content: "first",
		assistantMessageId: contractStreamingAssistantMessageId,
		timestamp: contractStreamingTimestamp,
	};
	const secondDefaults: SseContentChunkEvent = {
		type: "content_chunk",
		content: "second",
		assistantMessageId: contractStreamingAssistantMessageId,
		timestamp: contractStreamingTimestamp,
	};
	const first: SseContentChunkEvent = {
		...firstDefaults,
		...overrides?.first,
	};
	const second: SseContentChunkEvent = {
		...secondDefaults,
		...overrides?.second,
	};
	return [first, second];
}

export function buildOptimisticVersusStreamedChatIdFixture(
	overrides?: Partial<OptimisticVersusStreamedChatIdContract>,
): OptimisticVersusStreamedChatIdContract {
	const streamedChatId: string = contractStreamedNewChatId;
	const chatStart: SseChatStartEvent = {
		type: "chat_start",
		chatId: streamedChatId,
		timestamp: contractStreamingTimestamp,
	};
	const assistantMessage: ChatMessage = contractBaseAssistantMessage(
		streamedChatId,
		"contract mismatch complete",
	);
	const chatComplete: SseChatCompleteEvent = {
		type: "chat_complete",
		assistantMessage,
		finish_reason: null,
		timestamp: contractStreamingTimestamp,
	};
	const base: OptimisticVersusStreamedChatIdContract = {
		optimisticMessageChatId: contractOptimisticChatId,
		streamedChatId,
		chatStart,
		chatComplete,
	};
	if (overrides === undefined) {
		return base;
	}
	return {
		optimisticMessageChatId:
			overrides.optimisticMessageChatId !== undefined
				? overrides.optimisticMessageChatId
				: base.optimisticMessageChatId,
		streamedChatId:
			overrides.streamedChatId !== undefined
				? overrides.streamedChatId
				: base.streamedChatId,
		chatStart:
			overrides.chatStart !== undefined ? overrides.chatStart : base.chatStart,
		chatComplete:
			overrides.chatComplete !== undefined
				? overrides.chatComplete
				: base.chatComplete,
	};
}

/** `chat_start` → at least one `content_chunk` (sets `assistantMessageId` in the store) → `chat_complete`. */
export function buildChatCompleteOnlySequence(): readonly SseChatEvent[] {
	const start: SseChatStartEvent = {
		type: "chat_start",
		chatId: contractStreamingChatId,
		timestamp: contractStreamingTimestamp,
	};
	const chunk: SseContentChunkEvent = {
		type: "content_chunk",
		content: "",
		assistantMessageId: contractStreamingAssistantMessageId,
		timestamp: contractStreamingTimestamp,
	};
	const assistantMessage: ChatMessage = contractBaseAssistantMessage(
		contractStreamingChatId,
		"contract complete body",
	);
	const complete: SseChatCompleteEvent = {
		type: "chat_complete",
		assistantMessage,
		finish_reason: null,
		timestamp: contractStreamingTimestamp,
	};
	const sequence: readonly SseChatEvent[] = [start, chunk, complete];
	return sequence;
}

export function buildChunkThenCompleteSequence(): readonly SseChatEvent[] {
	const start: SseChatStartEvent = {
		type: "chat_start",
		chatId: contractStreamingChatId,
		timestamp: contractStreamingTimestamp,
	};
	const chunkA: SseContentChunkEvent = {
		type: "content_chunk",
		content: "first",
		assistantMessageId: contractStreamingAssistantMessageId,
		timestamp: contractStreamingTimestamp,
	};
	const chunkB: SseContentChunkEvent = {
		type: "content_chunk",
		content: "second",
		assistantMessageId: contractStreamingAssistantMessageId,
		timestamp: contractStreamingTimestamp,
	};
	const assistantMessage: ChatMessage = contractBaseAssistantMessage(
		contractStreamingChatId,
		"firstsecond",
	);
	const complete: SseChatCompleteEvent = {
		type: "chat_complete",
		assistantMessage,
		finish_reason: null,
		timestamp: contractStreamingTimestamp,
	};
	const sequence: readonly SseChatEvent[] = [start, chunkA, chunkB, complete];
	return sequence;
}

export function buildOptimisticVersusStreamedSequence(): readonly SseChatEvent[] {
	const start: SseChatStartEvent = {
		type: "chat_start",
		chatId: contractStreamedNewChatId,
		timestamp: contractStreamingTimestamp,
	};
	const chunk: SseContentChunkEvent = {
		type: "content_chunk",
		content: "",
		assistantMessageId: contractStreamingAssistantMessageId,
		timestamp: contractStreamingTimestamp,
	};
	const assistantMessage: ChatMessage = contractBaseAssistantMessage(
		contractStreamedNewChatId,
		"contract mismatch complete",
	);
	const complete: SseChatCompleteEvent = {
		type: "chat_complete",
		assistantMessage,
		finish_reason: null,
		timestamp: contractStreamingTimestamp,
	};
	const sequence: readonly SseChatEvent[] = [start, chunk, complete];
	return sequence;
}
