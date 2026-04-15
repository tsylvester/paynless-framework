import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type {
  IncomingHttpHeaders,
  Server,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AiStreamDeps, AiStreamPayload } from './ai-stream.interface.ts';
import { isAiStreamPayload } from './ai-stream.guard.ts';
import { runAiStreamWorkload } from './ai-stream.ts';
import {
  createNullUsageAdapterResult,
  createStreamTallies,
  createThrowingStreamAdapter,
  createValidAiStreamEvent,
  mockAiStreamDeps,
  mockAiStreamDepsWithPerAdapterResults,
} from './ai-stream.mock.ts';

interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

interface MockBackHalfServer {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

function startMockBackHalfServer(statusCode: number): Promise<MockBackHalfServer> {
  const requests: RecordedRequest[] = [];
  return new Promise<MockBackHalfServer>((resolve, reject) => {
    const server: Server = createServer(
      (req: IncomingMessage, res: ServerResponse): void => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer): void => {
          chunks.push(chunk);
        });
        req.on('end', (): void => {
          const body: string = Buffer.concat(chunks).toString('utf8');
          const method: string = req.method ?? '';
          const url: string = req.url ?? '';
          const headers: IncomingHttpHeaders = req.headers;
          const recorded: RecordedRequest = { method, url, headers, body };
          requests.push(recorded);
          res.writeHead(statusCode);
          res.end();
        });
      },
    );
    server.listen(0, '127.0.0.1', (): void => {
      const addr: string | AddressInfo | null = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('unexpected server address type'));
        return;
      }
      const serverUrl: string = `http://127.0.0.1:${addr.port}`;
      const instance: MockBackHalfServer = {
        url: serverUrl,
        requests,
        close(): Promise<void> {
          return new Promise<void>((closeResolve, closeReject): void => {
            server.close((err?: Error): void => {
              if (err !== undefined) {
                closeReject(err);
              } else {
                closeResolve();
              }
            });
          });
        },
      };
      resolve(instance);
    });
    server.on('error', (err: Error): void => {
      reject(err);
    });
  });
}

describe('ai-stream workload integration', () => {
  it('full chain: openai adapter streams result and POSTs AiStreamPayload with Authorization header to back-half server', async () => {
    const backHalf: MockBackHalfServer = await startMockBackHalfServer(200);
    try {
      const tallies = createStreamTallies();
      const assembled: string = 'integration-assembled-content';
      const deps: AiStreamDeps = mockAiStreamDepsWithPerAdapterResults(
        tallies,
        {
          openai: createNullUsageAdapterResult(assembled),
          anthropic: createNullUsageAdapterResult('unused-anthropic'),
          google: createNullUsageAdapterResult('unused-google'),
        },
        { Url: backHalf.url },
      );
      const event = createValidAiStreamEvent({
        api_identifier: 'openai-gpt-4',
        job_id: 'integration-job-1',
        user_jwt: 'integration-jwt-token',
      });
      await runAiStreamWorkload(deps, event);
      expect(tallies.openai).toBe(1);
      expect(tallies.anthropic).toBe(0);
      expect(tallies.google).toBe(0);
      expect(backHalf.requests).toHaveLength(1);
      const firstRequest: RecordedRequest | undefined = backHalf.requests[0];
      if (firstRequest === undefined) {
        expect.fail('expected exactly one recorded request');
        return;
      }
      expect(firstRequest.method).toBe('POST');
      const authHeaderRaw: string | string[] | undefined =
        firstRequest.headers['authorization'];
      if (typeof authHeaderRaw !== 'string') {
        expect.fail('authorization header must be a plain string');
        return;
      }
      expect(authHeaderRaw).toBe('Bearer integration-jwt-token');
      const decoded: unknown = JSON.parse(firstRequest.body);
      if (!isAiStreamPayload(decoded)) {
        expect.fail('POST body must satisfy AiStreamPayload');
        return;
      }
      const postBody: AiStreamPayload = decoded;
      expect(postBody.job_id).toBe('integration-job-1');
      expect(postBody.assembled_content).toBe(assembled);
      expect(postBody.token_usage).toBe(null);
    } finally {
      await backHalf.close();
    }
  });

  it('step-1 failure: adapter throws — back-half server receives no POST request', async () => {
    const backHalf: MockBackHalfServer = await startMockBackHalfServer(200);
    try {
      const deps: AiStreamDeps = mockAiStreamDeps({
        openaiAdapter: createThrowingStreamAdapter('step-1-adapter-boom'),
        Url: backHalf.url,
      });
      const event = createValidAiStreamEvent({ api_identifier: 'openai-gpt-4' });
      await expect(runAiStreamWorkload(deps, event)).rejects.toThrow(
        'step-1-adapter-boom',
      );
      expect(backHalf.requests).toHaveLength(0);
    } finally {
      await backHalf.close();
    }
  });

  it('step-2 failure: back-half returns 5xx — adapter was called exactly once and is not re-invoked', async () => {
    const backHalf: MockBackHalfServer = await startMockBackHalfServer(500);
    try {
      const tallies = createStreamTallies();
      const deps: AiStreamDeps = mockAiStreamDepsWithPerAdapterResults(
        tallies,
        {
          openai: createNullUsageAdapterResult('integration-assembled'),
          anthropic: createNullUsageAdapterResult('unused-anthropic'),
          google: createNullUsageAdapterResult('unused-google'),
        },
        { Url: backHalf.url },
      );
      const event = createValidAiStreamEvent({ api_identifier: 'openai-gpt-4' });
      await expect(runAiStreamWorkload(deps, event)).rejects.toThrow();
      expect(tallies.openai).toBe(1);
      expect(backHalf.requests).toHaveLength(1);
    } finally {
      await backHalf.close();
    }
  });
});
