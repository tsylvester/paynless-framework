import type { ChatMessage } from '@paynless/types';

/**
 * Fixtures for isSseChatEvent contract tests (SSE wire payloads from the chat edge function).
 */
export const mockSseChatStartValid = {
    type: "chat_start",
    chatId: "chat-contract-1",
    timestamp: "2024-01-01T12:00:00.000Z",
};

export const mockSseContentChunkValid = {
    type: "content_chunk",
    content: "Hello",
    assistantMessageId: "asst-contract-1",
    timestamp: "2024-01-01T12:00:00.000Z",
};

export const mockFullAssistantMessage: ChatMessage = {
    id: "asst-contract-1",
    chat_id: "chat-contract-1",
    role: "assistant",
    content: "Hello",
    user_id: null,
    ai_provider_id: "provider-1",
    system_prompt_id: "prompt-1",
    token_usage: null,
    created_at: "2024-01-01T12:00:00.000Z",
    updated_at: "2024-01-01T12:00:00.000Z",
    is_active_in_thread: true,
    error_type: null,
    response_to_message_id: null,
};

export const mockSseChatCompleteValid = {
    type: "chat_complete",
    assistantMessage: mockFullAssistantMessage,
    finish_reason: null,
    timestamp: "2024-01-01T12:00:01.000Z",
};

export const mockSseErrorValid = {
    type: "error",
    message: "failure",
    timestamp: "2024-01-01T12:00:02.000Z",
};

/**
 * chat_complete shape with assistantMessage missing required Row column is_active_in_thread (must be rejected by the guard).
 */
export const mockSseChatCompleteInvalidAssistantMissingIsActive = {
    type: "chat_complete",
    timestamp: "2024-01-01T12:00:01.000Z",
    finish_reason: null,
    assistantMessage: {
        id: "bad",
        chat_id: "c",
        content: "x",
        created_at: "2024-01-01T12:00:00.000Z",
        updated_at: "2024-01-01T12:00:00.000Z",
        role: "assistant",
        user_id: null,
        ai_provider_id: null,
        system_prompt_id: null,
        token_usage: null,
        error_type: null,
        response_to_message_id: null,
    },
};

export const mockSseInvalidDiscriminator = {
    type: "not_an_sse_event",
    payload: 1,
};
