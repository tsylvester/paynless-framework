import { describe, it, expect } from 'vitest';
import type { ProcessStream, CreateSseConnection } from './sse.stream.interface';
import type { ISseConnection } from '@paynless/types';

describe('sse.stream.interface contract', () => {
    it('structural object with addEventListener, removeEventListener, dispatchEvent, and close is assignable to ISseConnection', () => {
        const connection: ISseConnection = {
            close: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        };
        expect(typeof connection.close).toBe('function');
        expect(typeof connection.addEventListener).toBe('function');
        expect(typeof connection.removeEventListener).toBe('function');
        expect(typeof connection.dispatchEvent).toBe('function');
    });

    it('createSseConnection return type is assignable to ISseConnection', () => {
        const create: CreateSseConnection = () => {
            const out: ISseConnection = {
                close: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => true,
            };
            return out;
        };
        const response: Response = new Response();
        const result: ISseConnection = create(response);
        expect(result).toBeDefined();
    });

    it('ProcessStream function type accepts ReadableStreamDefaultReader, TextDecoder, SseConnection and returns Promise<void>', async () => {
        const process: ProcessStream = async (reader, decoder, connection) => {
            void reader;
            void decoder;
            void connection;
        };
        const reader: ReadableStreamDefaultReader<Uint8Array> = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.close();
            },
        }).getReader();
        const decoder: TextDecoder = new TextDecoder();
        const connection: ISseConnection = {
            close: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        };
        await expect(process(reader, decoder, connection)).resolves.toBeUndefined();
    });

    it('CreateSseConnection function type accepts Response and returns ISseConnection', () => {
        const create: CreateSseConnection = (response: Response) => {
            void response;
            const out: ISseConnection = {
                close: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => true,
            };
            return out;
        };
        const response: Response = new Response();
        const out: ISseConnection = create(response);
        expect(out).toBeDefined();
    });
});
