import { vi } from 'vitest';
import type { ChatMessage, ISseConnection, SseChatCompleteEvent } from '@paynless/types';

/**
 * Controllable mock connection: each method is a Vitest mock (call counts and args).
 * Structurally satisfies `ISseConnection` / `isSseConnection`.
 */
export function createMockSseConnection(): ISseConnection {
    const close: () => void = vi.fn();
    const addEventListener: typeof EventTarget.prototype.addEventListener = vi.fn();
    const removeEventListener: typeof EventTarget.prototype.removeEventListener = vi.fn();
    const dispatchEvent: (event: Event) => boolean = vi.fn((_event: Event) => {
        return true;
    });
    const connection: ISseConnection = {
        close,
        addEventListener,
        removeEventListener,
        dispatchEvent,
    };
    return connection;
}

export function sseWireFromDataLines(payloads: readonly object[]): string {
    return payloads
        .map((payload) => `data: ${JSON.stringify(payload)}\n`)
        .join('');
}

export const streamingContractFullAssistantMessage: ChatMessage = {
    id: 'asst-stream-1',
    chat_id: 'chat-stream-1',
    role: 'assistant',
    content: 'Hello',
    user_id: null,
    ai_provider_id: 'provider-1',
    system_prompt_id: 'prompt-1',
    token_usage: null,
    created_at: '2024-01-01T12:00:00.000Z',
    updated_at: '2024-01-01T12:00:00.000Z',
    is_active_in_thread: true,
    error_type: null,
    response_to_message_id: null,
};

export const streamingContractSseWire: string = sseWireFromDataLines([
    {
        type: 'chat_start',
        chatId: 'chat-stream-1',
        timestamp: '2024-01-01T12:00:00.000Z',
    },
    {
        type: 'content_chunk',
        content: 'Hel',
        assistantMessageId: streamingContractFullAssistantMessage.id,
        timestamp: '2024-01-01T12:00:00.000Z',
    },
    {
        type: 'chat_complete',
        assistantMessage: streamingContractFullAssistantMessage,
        finish_reason: null,
        timestamp: '2024-01-01T12:00:01.000Z',
    },
]);

export function createMockFetchForSseWire(sseWireBody: string): typeof fetch {
    const mockFetch: typeof fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode(sseWireBody));
                        controller.close();
                    },
                }),
                { status: 200, statusText: 'OK' },
            ),
        );
    });
    return mockFetch;
}

/**
 * Compile-time contract hook: a value is only accepted if it satisfies SseChatCompleteEvent (including full ChatMessage).
 */
export function contractAcceptsSseChatCompleteEvent(payload: SseChatCompleteEvent): void {
    void payload;
}
