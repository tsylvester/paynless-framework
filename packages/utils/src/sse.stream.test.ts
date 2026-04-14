import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
    ChatMessage,
    ISseConnection,
    SseChatCompleteEvent,
    SseChatEvent,
    SseChatStartEvent,
} from '@paynless/types';
import { createSseConnection, processStream, SseConnection } from './sse.stream';
import { isSseConnection } from './sse.stream.guard';
import { isSseChatEvent } from './type_guards';
import { logger } from './logger';
import {
    createMockFetchForSseWire,
    sseWireFromDataLines,
    streamingContractFullAssistantMessage,
    streamingContractSseWire,
} from './sse.stream.mock';

describe('sse.stream', () => {
    describe('createSseConnection', () => {
        it('given fetch Response from createMockFetchForSseWire(streamingContractSseWire), return value passes isSseConnection', async () => {
            const fetchImpl: typeof fetch = createMockFetchForSseWire(streamingContractSseWire);
            const response: Response = await fetchImpl('http://mock-local/sse', {});
            const result = createSseConnection(response);
            expect(isSseConnection(result)).toBe(true);
        });

        it('given Response with readable body, return value passes isSseConnection', async () => {
            const response: Response = new Response(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('data: {}\n'));
                        controller.close();
                    },
                }),
                { status: 200 },
            );
            const result = createSseConnection(response);
            expect(isSseConnection(result)).toBe(true);
        });

        it('given Response with body null, return value passes isSseConnection and close does not throw', () => {
            const response: Response = new Response(null, { status: 200 });
            const result = createSseConnection(response);
            expect(isSseConnection(result)).toBe(true);
            expect(() => {
                result.close();
            }).not.toThrow();
        });
    });

    describe('processStream', () => {
        beforeEach(() => {
            vi.spyOn(logger, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('chat_start wire event dispatches MessageEvent; event.data passes isSseChatEvent; narrows to SseChatStartEvent', async () => {
            const wire: string = sseWireFromDataLines([
                {
                    type: 'chat_start',
                    chatId: 'chat-wire-1',
                    timestamp: '2024-01-01T12:00:00.000Z',
                },
            ]);
            const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(wire));
                    controller.close();
                },
            }).getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            const received: Promise<SseChatStartEvent> = new Promise((resolve, reject) => {
                connection.addEventListener('message', (ev: Event) => {
                    if (!(ev instanceof MessageEvent)) {
                        reject(new Error('expected MessageEvent'));
                        return;
                    }
                    const data: SseChatEvent = ev.data;
                    if (!isSseChatEvent(data)) {
                        reject(new Error('expected isSseChatEvent'));
                        return;
                    }
                    if (data.type === 'chat_start') {
                        resolve(data);
                    }
                });
                connection.addEventListener('error', () => reject(new Error('connection error')));
            });

            await processStream(reader, decoder, connection);
            const start: SseChatStartEvent = await received;
            expect(start.type).toBe('chat_start');
            expect(start.chatId).toBe('chat-wire-1');
        });

        it('content_chunk wire event dispatches MessageEvent with event.data.type content_chunk', async () => {
            const wire: string = sseWireFromDataLines([
                {
                    type: 'content_chunk',
                    content: 'x',
                    assistantMessageId: 'asst-1',
                    timestamp: '2024-01-01T12:00:00.000Z',
                },
            ]);
            const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(wire));
                    controller.close();
                },
            }).getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            const received: Promise<string> = new Promise((resolve, reject) => {
                connection.addEventListener('message', (ev: Event) => {
                    if (!(ev instanceof MessageEvent)) {
                        reject(new Error('expected MessageEvent'));
                        return;
                    }
                    const data: SseChatEvent = ev.data;
                    if (data.type === 'content_chunk') {
                        resolve(data.type);
                    }
                });
                connection.addEventListener('error', () => reject(new Error('connection error')));
            });

            await processStream(reader, decoder, connection);
            const chunkType: string = await received;
            expect(chunkType).toBe('content_chunk');
        });

        it('chat_complete wire event with full ChatMessage dispatches MessageEvent; narrows to SseChatCompleteEvent; assistantMessage is ChatMessage', async () => {
            const wire: string = sseWireFromDataLines([
                {
                    type: 'chat_complete',
                    assistantMessage: streamingContractFullAssistantMessage,
                    finish_reason: null,
                    timestamp: '2024-01-01T12:00:01.000Z',
                },
            ]);
            const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(wire));
                    controller.close();
                },
            }).getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            const received: Promise<ChatMessage> = new Promise((resolve, reject) => {
                connection.addEventListener('message', (ev: Event) => {
                    if (!(ev instanceof MessageEvent)) {
                        reject(new Error('expected MessageEvent'));
                        return;
                    }
                    const data: SseChatEvent = ev.data;
                    if (data.type === 'chat_complete') {
                        const complete: SseChatCompleteEvent = data;
                        resolve(complete.assistantMessage);
                    }
                });
                connection.addEventListener('error', () => reject(new Error('connection error')));
            });

            await processStream(reader, decoder, connection);
            const assistant: ChatMessage = await received;
            expect(assistant.is_active_in_thread).toBe(true);
            expect(assistant.id).toBe(streamingContractFullAssistantMessage.id);
        });

        it('error wire event dispatches MessageEvent with event.data.type error', async () => {
            const wire: string = sseWireFromDataLines([
                {
                    type: 'error',
                    message: 'wire error',
                    timestamp: '2024-01-01T12:00:00.000Z',
                },
            ]);
            const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(wire));
                    controller.close();
                },
            }).getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            const received: Promise<string> = new Promise((resolve, reject) => {
                connection.addEventListener('message', (ev: Event) => {
                    if (!(ev instanceof MessageEvent)) {
                        reject(new Error('expected MessageEvent'));
                        return;
                    }
                    const data: SseChatEvent = ev.data;
                    if (data.type === 'error') {
                        resolve(data.type);
                    }
                });
                connection.addEventListener('error', () => reject(new Error('connection error')));
            });

            await processStream(reader, decoder, connection);
            const errType: string = await received;
            expect(errType).toBe('error');
        });

        it('malformed JSON on wire calls logger.error; no MessageEvent on connection; processStream does not throw', async () => {
            const wire: string = 'data: not-valid-json{{{';
            const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(wire));
                    controller.close();
                },
            }).getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            let messageCount = 0;
            connection.addEventListener('message', () => {
                messageCount += 1;
            });

            await expect(processStream(reader, decoder, connection)).resolves.toBeUndefined();
            expect(logger.error).toHaveBeenCalled();
            expect(messageCount).toBe(0);
        });

        it('payload present but fails isSseChatEvent calls logger.error; no MessageEvent dispatched', async () => {
            const wire: string = sseWireFromDataLines([{ type: 'unknown_sse_type', n: 1 }]);
            const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(wire));
                    controller.close();
                },
            }).getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            let messageCount = 0;
            connection.addEventListener('message', () => {
                messageCount += 1;
            });

            await processStream(reader, decoder, connection);
            expect(logger.error).toHaveBeenCalled();
            expect(messageCount).toBe(0);
        });

        it('stream end dispatches Event with type close', async () => {
            const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.close();
                },
            }).getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            const closed: Promise<string> = new Promise((resolve) => {
                connection.addEventListener('close', (ev: Event) => {
                    resolve(ev.type);
                });
            });

            await processStream(reader, decoder, connection);
            const closeType: string = await closed;
            expect(closeType).toBe('close');
        });

        it('reader.read throws dispatches ErrorEvent type error; exception does not propagate past processStream', async () => {
            const stream: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
                pull() {
                    throw new Error('read failed');
                },
            });
            const reader: ReadableStreamDefaultReader<Uint8Array> = stream.getReader();
            const decoder: TextDecoder = new TextDecoder();
            const connection: SseConnection = new SseConnection();

            const errored: Promise<string> = new Promise((resolve) => {
                connection.addEventListener('error', (ev: Event) => {
                    if (ev instanceof ErrorEvent) {
                        resolve(ev.type);
                    }
                });
            });

            await expect(processStream(reader, decoder, connection)).resolves.toBeUndefined();
            const errorType: string = await errored;
            expect(errorType).toBe('error');
        });
    });

    describe('edge validation', () => {
        it('chat_start then content_chunk then chat_complete dispatch typed MessageEvents in order on ISseConnection then close after stream end', async () => {
            const response: Response = new Response(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode(streamingContractSseWire));
                        controller.close();
                    },
                }),
                { status: 200 },
            );
            const connection: ISseConnection = createSseConnection(response);
            expect(isSseConnection(connection)).toBe(true);

            const payloads: SseChatEvent[] = [];
            const threeMessages: Promise<void> = new Promise((resolve, reject) => {
                connection.addEventListener('message', (ev: Event) => {
                    if (!(ev instanceof MessageEvent)) {
                        return;
                    }
                    if (!isSseChatEvent(ev.data)) {
                        reject(new Error('expected SseChatEvent'));
                        return;
                    }
                    payloads.push(ev.data);
                    if (payloads.length === 3) {
                        resolve();
                    }
                });
                connection.addEventListener('error', () => reject(new Error('connection error')));
            });

            const streamClosed: Promise<void> = new Promise((resolve) => {
                connection.addEventListener('close', () => {
                    resolve();
                });
            });

            await threeMessages;
            expect(payloads[0].type).toBe('chat_start');
            expect(payloads[1].type).toBe('content_chunk');
            expect(payloads[2].type).toBe('chat_complete');
            if (payloads[0].type === 'chat_start') {
                const start: SseChatStartEvent = payloads[0];
                expect(start.chatId).toBe('chat-stream-1');
            }
            if (payloads[2].type === 'chat_complete') {
                const complete: SseChatCompleteEvent = payloads[2];
                const assistant: ChatMessage = complete.assistantMessage;
                expect(assistant.is_active_in_thread).toBe(true);
                expect(assistant.id).toBe(streamingContractFullAssistantMessage.id);
            }

            await streamClosed;
        });
    });
});
