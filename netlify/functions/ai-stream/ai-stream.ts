import {
  asyncWorkloadFn,
  ErrorDoNotRetry,
  type AsyncWorkloadConfig,
  type AsyncWorkloadEvent,
} from '@netlify/async-workloads';
import type { AiAdapter, NodeAdapterStreamChunk } from './adapters/ai-adapter.interface.ts';
import { createAnthropicNodeAdapter } from './adapters/anthropic/anthropic.ts';
import { createGoogleNodeAdapter } from './adapters/google/google.ts';
import { getNodeAiAdapter } from './adapters/getNodeAiAdapter.ts';
import { createOpenAINodeAdapter } from './adapters/openai/openai.ts';
import { isAiStreamEvent } from './ai-stream.guard.ts';
import type {
  AiStreamDeps,
  AiStreamEvent,
  AiStreamPayload,
} from './ai-stream.interface.ts';

const SOFT_TIMEOUT_MS: number = 14 * 60 * 1000;

export function createAiStreamDeps(): AiStreamDeps {
  const providerMap = {
    'openai-': createOpenAINodeAdapter,
    'anthropic-': createAnthropicNodeAdapter,
    'google-': createGoogleNodeAdapter,
  };
  const saveResponseUrlRaw: string | undefined =
    process.env['DIALECTIC_SAVERESPONSE_URL'];
  if (saveResponseUrlRaw === undefined || saveResponseUrlRaw.length === 0) {
    throw new ErrorDoNotRetry(
      'DIALECTIC_SAVERESPONSE_URL must be set so the ai-stream workload can POST results to the saveResponse endpoint.',
    );
  }
  const saveResponseUrl: string = saveResponseUrlRaw;
  const getApiKey: AiStreamDeps['getApiKey'] = (
    apiIdentifier: string,
  ): string => {
    const lower: string = apiIdentifier.toLowerCase();
    if (lower.startsWith('openai-')) {
      const key: string | undefined = process.env['OPENAI_API_KEY'];
      if (key === undefined || key.length === 0) {
        throw new ErrorDoNotRetry(
          'OPENAI_API_KEY must be set in the Netlify environment to stream OpenAI models.',
        );
      }
      return key;
    }
    if (lower.startsWith('anthropic-')) {
      const key: string | undefined = process.env['ANTHROPIC_API_KEY'];
      if (key === undefined || key.length === 0) {
        throw new ErrorDoNotRetry(
          'ANTHROPIC_API_KEY must be set in the Netlify environment to stream Anthropic models.',
        );
      }
      return key;
    }
    if (lower.startsWith('google-')) {
      const key: string | undefined = process.env['GOOGLE_API_KEY'];
      if (key === undefined || key.length === 0) {
        throw new ErrorDoNotRetry(
          'GOOGLE_API_KEY must be set in the Netlify environment to stream Google Gemini models.',
        );
      }
      return key;
    }
    throw new ErrorDoNotRetry(
      'api_identifier must start with one of: openai-, anthropic-, google- (no matching provider for this workload).',
    );
  };
  return {
    providerMap,
    saveResponseUrl,
    getApiKey,
  };
}

async function collectAiStreamPayload(
  deps: AiStreamDeps,
  event: AiStreamEvent,
): Promise<AiStreamPayload> {
  const apiKey: string = deps.getApiKey(event.api_identifier);
  if (apiKey.length === 0) {
    throw new ErrorDoNotRetry(
      'getApiKey returned an empty string; fix AiStreamDeps.getApiKey or set the provider API key in the environment.',
    );
  }
  const adapter: AiAdapter | null = getNodeAiAdapter(
    { providerMap: deps.providerMap },
    {
      apiIdentifier: event.api_identifier,
      apiKey,
      modelConfig: event.model_config,
    },
  );
  if (adapter === null) {
    throw new ErrorDoNotRetry(
      'No adapter factory matched api_identifier after prefix lookup (check deps.providerMap keys).',
    );
  }
  const startTime: number = Date.now();
  let assembledContent: string = '';
  let tokenUsage: AiStreamPayload['token_usage'] = null;
  let finishReason: AiStreamPayload['finish_reason'] = null;
  const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
    event.chat_api_request,
    event.api_identifier,
  );
  for await (const chunk of stream) {
    if (chunk.type === 'text_delta') {
      if (Date.now() - startTime > SOFT_TIMEOUT_MS) {
        finishReason = 'length';
        break;
      }
      assembledContent += chunk.text;
    } else if (chunk.type === 'usage') {
      tokenUsage = chunk.tokenUsage;
    } else if (chunk.type === 'done') {
      finishReason = chunk.finish_reason;
    }
  }
  return {
    job_id: event.job_id,
    assembled_content: assembledContent,
    token_usage: tokenUsage,
    finish_reason: finishReason,
  };
}

async function postAiStreamPayload(
  saveResponseUrl: string,
  userJwt: string,
  payload: AiStreamPayload,
): Promise<void> {
  const response: Response = await fetch(saveResponseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      `saveResponse failed with status ${String(response.status)}`,
    );
  }
}

export async function runAiStreamWorkloadForTests(
  deps: AiStreamDeps,
  event: unknown,
): Promise<void> {
  if (!isAiStreamEvent(event)) {
    throw new ErrorDoNotRetry('invalid AiStreamEvent payload');
  }
  const validated: AiStreamEvent = event;
  const payload: AiStreamPayload = await collectAiStreamPayload(deps, validated);
  await postAiStreamPayload(
    deps.saveResponseUrl,
    validated.user_jwt,
    payload,
  );
}

export const asyncWorkloadConfig: AsyncWorkloadConfig = {
  events: ['ai-stream'],
  maxRetries: 4,
};

export default asyncWorkloadFn(
  async (event: AsyncWorkloadEvent): Promise<void> => {
    const deps: AiStreamDeps = createAiStreamDeps();
    const raw: unknown = event.eventData;
    if (!isAiStreamEvent(raw)) {
      throw new ErrorDoNotRetry('invalid AiStreamEvent payload');
    }
    const validated: AiStreamEvent = raw;
    const payload: AiStreamPayload = await event.step.run(
      'stream-ai',
      async (): Promise<AiStreamPayload> => {
        return collectAiStreamPayload(deps, validated);
      },
    );
    await event.step.run(
      'post-result',
      async (): Promise<void> => {
        await postAiStreamPayload(
          deps.saveResponseUrl,
          validated.user_jwt,
          payload,
        );
      },
    );
  },
);
