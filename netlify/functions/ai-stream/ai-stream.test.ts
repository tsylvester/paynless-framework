import { ErrorDoNotRetry } from '@netlify/async-workloads';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { isAiStreamPayload } from './ai-stream.guard.ts';
import type { AiStreamPayload } from './ai-stream.interface.ts';
import { runAiStreamWorkload } from './ai-stream.ts';
import {
  createNullUsageAdapterResult,
  createStreamTallies,
  createThrowingStreamAdapter,
  createValidAiStreamEvent,
  mockAiStreamDeps,
  mockAiStreamDepsWithPerAdapterResults,
} from './ai-stream.mock.ts';

describe('runAiStreamWorkload', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws ErrorDoNotRetry for an invalid event and does not call any adapter stream', async () => {
    const tallies = createStreamTallies();
    const deps = mockAiStreamDepsWithPerAdapterResults(
      tallies,
      {
        openai: createNullUsageAdapterResult('openai'),
        anthropic: createNullUsageAdapterResult('anthropic'),
        google: createNullUsageAdapterResult('google'),
      },
    );
    const invalidEvent: unknown = {};
    await expect(runAiStreamWorkload(deps, invalidEvent)).rejects.toBeInstanceOf(
      ErrorDoNotRetry,
    );
    expect(tallies.openai).toBe(0);
    expect(tallies.anthropic).toBe(0);
    expect(tallies.google).toBe(0);
  });

  it('throws ErrorDoNotRetry for an unknown api_identifier prefix', async () => {
    const tallies = createStreamTallies();
    const deps = mockAiStreamDepsWithPerAdapterResults(
      tallies,
      {
        openai: createNullUsageAdapterResult('openai'),
        anthropic: createNullUsageAdapterResult('anthropic'),
        google: createNullUsageAdapterResult('google'),
      },
    );
    await expect(
      runAiStreamWorkload(
        deps,
        createValidAiStreamEvent({ api_identifier: 'mistral-unknown' }),
      ),
    ).rejects.toBeInstanceOf(ErrorDoNotRetry);
    expect(tallies.openai).toBe(0);
    expect(tallies.anthropic).toBe(0);
    expect(tallies.google).toBe(0);
  });

  it('calls only the OpenAI adapter for openai-* and posts the adapter result', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('', { status: 200 })),
    );
    const tallies = createStreamTallies();
    const openaiBody = 'openai-streamed-body';
    const deps = mockAiStreamDepsWithPerAdapterResults(
      tallies,
      {
        openai: createNullUsageAdapterResult(openaiBody),
        anthropic: createNullUsageAdapterResult('anthropic-unused'),
        google: createNullUsageAdapterResult('google-unused'),
      },
    );
    await runAiStreamWorkload(
      deps,
      createValidAiStreamEvent({ api_identifier: 'openai-gpt-4' }),
    );
    expect(tallies.openai).toBe(1);
    expect(tallies.anthropic).toBe(0);
    expect(tallies.google).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('calls only the Anthropic adapter for anthropic-*', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('', { status: 200 })),
    );
    const tallies = createStreamTallies();
    const deps = mockAiStreamDepsWithPerAdapterResults(
      tallies,
      {
        openai: createNullUsageAdapterResult('openai-unused'),
        anthropic: createNullUsageAdapterResult('anthropic-body'),
        google: createNullUsageAdapterResult('google-unused'),
      },
    );
    await runAiStreamWorkload(
      deps,
      createValidAiStreamEvent({ api_identifier: 'anthropic-claude-3' }),
    );
    expect(tallies.openai).toBe(0);
    expect(tallies.anthropic).toBe(1);
    expect(tallies.google).toBe(0);
  });

  it('calls only the Google adapter for google-*', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('', { status: 200 })),
    );
    const tallies = createStreamTallies();
    const deps = mockAiStreamDepsWithPerAdapterResults(
      tallies,
      {
        openai: createNullUsageAdapterResult('openai-unused'),
        anthropic: createNullUsageAdapterResult('anthropic-unused'),
        google: createNullUsageAdapterResult('google-body'),
      },
    );
    await runAiStreamWorkload(
      deps,
      createValidAiStreamEvent({ api_identifier: 'google-gemini-pro' }),
    );
    expect(tallies.openai).toBe(0);
    expect(tallies.anthropic).toBe(0);
    expect(tallies.google).toBe(1);
  });

  it('propagates an adapter stream error from the selected provider', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('', { status: 200 })),
    );
    const deps = mockAiStreamDeps({
      openaiAdapter: createThrowingStreamAdapter('adapter-stream-boom'),
    });
    await expect(
      runAiStreamWorkload(
        deps,
        createValidAiStreamEvent({ api_identifier: 'openai-gpt-4' }),
      ),
    ).rejects.toThrow('adapter-stream-boom');
  });

  it('throws when the back-half POST returns a 4xx after a successful stream', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('', { status: 400 })),
    );
    const deps = mockAiStreamDeps();
    await expect(
      runAiStreamWorkload(
        deps,
        createValidAiStreamEvent({ api_identifier: 'openai-gpt-4' }),
      ),
    ).rejects.toThrow();
  });

  it('POSTs AiStreamPayload JSON with Authorization Bearer user_jwt on the happy path', async () => {
    const fetchMock = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> => new Response('', { status: 200 }),
    );
    globalThis.fetch = fetchMock;
    const tallies = createStreamTallies();
    const assembled = 'happy-path-assembled';
    const event = createValidAiStreamEvent({
      api_identifier: 'openai-gpt-4',
      user_jwt: 'unit-test-jwt-token',
      job_id: 'job-post-1',
    });
    const deps = mockAiStreamDepsWithPerAdapterResults(
      tallies,
      {
        openai: createNullUsageAdapterResult(assembled),
        anthropic: createNullUsageAdapterResult('anthropic-unused'),
        google: createNullUsageAdapterResult('google-unused'),
      },
    );
    await runAiStreamWorkload(deps, event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls;
    const firstCall = calls[0];
    if (firstCall === undefined) {
      expect(firstCall).toBeDefined();
      return;
    }
    const urlCandidate: string | URL | Request = firstCall[0];
    if (typeof urlCandidate !== 'string') {
      expect(typeof urlCandidate).toBe('string');
      return;
    }
    const requestUrl: string = urlCandidate;
    expect(requestUrl).toBe(deps.Url);
    const initCandidate: RequestInit | undefined = firstCall[1];
    if (initCandidate === undefined) {
      expect(initCandidate).toBeDefined();
      return;
    }
    const initValue: RequestInit = initCandidate;
    const headers: Headers = new Headers(initValue.headers);
    expect(headers.get('Authorization')).toBe('Bearer unit-test-jwt-token');
    const bodyCandidate = initValue.body;
    if (typeof bodyCandidate !== 'string') {
      expect(typeof bodyCandidate).toBe('string');
      return;
    }
    const bodyText: string = bodyCandidate;
    const decoded: unknown = JSON.parse(bodyText);
    if (!isAiStreamPayload(decoded)) {
      expect.fail('POST body must satisfy AiStreamPayload');
      return;
    }
    const postBody: AiStreamPayload = decoded;
    expect(postBody.job_id).toBe('job-post-1');
    expect(postBody.assembled_content).toBe(assembled);
    expect(postBody.token_usage).toBe(null);
  });
});
