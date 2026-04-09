import type { ISseConnection } from '@paynless/types';

export type ProcessStream = (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    connection: ISseConnection,
) => Promise<void>;

export type CreateSseConnection = (response: Response) => ISseConnection;

export type ErrorEventConstructor = new (type: string, eventInitDict?: ErrorEventInit) => ErrorEvent;
