import type { ISseConnection, SseChatEvent } from '@paynless/types';
import { isSseChatEvent } from './type_guards';
import { logger } from './logger';
import type { ErrorEventConstructor } from './sse.stream.interface';

function getErrorEventConstructor(): ErrorEventConstructor {
    const g: typeof globalThis & { ErrorEvent?: ErrorEventConstructor } = globalThis;
    if (typeof g.ErrorEvent === 'function') {
        return g.ErrorEvent;
    }
    class DomErrorEventShim extends Event implements ErrorEvent {
        readonly error: unknown;
        readonly message: string;
        readonly filename: string;
        readonly lineno: number;
        readonly colno: number;
        constructor(type: string, eventInitDict: ErrorEventInit = {}) {
            super(type);
            this.error = eventInitDict.error;
            this.message = eventInitDict.message ?? '';
            this.filename = eventInitDict.filename ?? '';
            this.lineno = eventInitDict.lineno ?? 0;
            this.colno = eventInitDict.colno ?? 0;
        }
    }
    g.ErrorEvent = DomErrorEventShim;
    return g.ErrorEvent;
}

const ErrorEventConstructor: ErrorEventConstructor = getErrorEventConstructor();

export class SseConnection extends EventTarget implements ISseConnection {
    private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    constructor(reader?: ReadableStreamDefaultReader<Uint8Array>) {
        super();
        this.reader = reader;
    }

    close(): void {
        this.reader?.cancel();
    }
}

function dispatchDataLine(line: string, connection: ISseConnection): void {
    if (!line.startsWith('data: ')) {
        return;
    }
    try {
        const data: string = line.substring(6);
        if (data.trim()) {
            const rawJson: unknown = JSON.parse(data);
            if (isSseChatEvent(rawJson)) {
                const ssePayload: SseChatEvent = rawJson;
                const event: MessageEvent<SseChatEvent> = new MessageEvent('message', { data: ssePayload });
                connection.dispatchEvent(event);
            } else {
                logger.error('SSE data failed isSseChatEvent validation', { line });
            }
        }
    } catch (parseError) {
        logger.error('Failed to parse SSE data:', { error: parseError, line });
    }
}

export async function processStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    connection: ISseConnection,
): Promise<void> {
    try {
        let buffer: string = '';
        let readResult: ReadableStreamReadResult<Uint8Array> = await reader.read();

        while (!readResult.done) {
            const chunk: Uint8Array = readResult.value;
            buffer += decoder.decode(chunk, { stream: true });

            const lines: string[] = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                dispatchDataLine(line, connection);
            }

            readResult = await reader.read();
        }

        buffer += decoder.decode(new Uint8Array(0), { stream: false });

        const tailLines: string[] = buffer.split('\n');
        for (const line of tailLines) {
            dispatchDataLine(line, connection);
        }

        const closeEvent: Event = new Event('close');
        connection.dispatchEvent(closeEvent);
    } catch (error) {
        const errorEvent: ErrorEvent = new ErrorEventConstructor('error', { error });
        connection.dispatchEvent(errorEvent);
    }
}

export function createSseConnection(response: Response): ISseConnection {
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    const decoder: TextDecoder = new TextDecoder();
    const connection: SseConnection = new SseConnection(reader);
    if (reader) {
        void processStream(reader, decoder, connection);
    }
    return connection;
}
