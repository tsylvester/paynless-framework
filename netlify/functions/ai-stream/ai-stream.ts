import {
  asyncWorkloadFn,
  ErrorDoNotRetry,
  type AsyncWorkloadConfig,
  type AsyncWorkloadEvent,
} from '@netlify/async-workloads';
import type {
  AiAdapterParams,
  AiAdapterResult,
} from './adapters/ai-adapter.interface.ts';
import { createAnthropicNodeAdapter } from './adapters/anthropic/anthropic.ts';
import { createGoogleNodeAdapter } from './adapters/google/google.ts';
import { createOpenAINodeAdapter } from './adapters/openai/openai.ts';
import { isAiStreamEvent } from './ai-stream.guard.ts';
import type {
  AiStreamDeps,
  AiStreamEvent,
  AiStreamPayload,
} from './ai-stream.interface.ts';

let productionDepsCache: AiStreamDeps | undefined;

function getProductionAiStreamDeps(): AiStreamDeps {
  if (productionDepsCache === undefined) {
    productionDepsCache = createAiStreamDeps();
  }
  return productionDepsCache;
}

export function createAiStreamDeps(): AiStreamDeps {
  const openaiAdapter = createOpenAINodeAdapter();
  const anthropicAdapter = createAnthropicNodeAdapter();
  const googleAdapter = createGoogleNodeAdapter();
  const urlValue: string | undefined = process.env['DIALECTIC_SAVERESPONSE_URL'];
  if (urlValue === undefined || urlValue.length === 0) {
    throw new Error('DIALECTIC_SAVERESPONSE_URL must be set');
  }
  const Url: string = urlValue;
  const getApiKey = (apiIdentifier: string): string => {
    const lower: string = apiIdentifier.toLowerCase();
    if (lower.startsWith('openai-')) {
      const key: string | undefined = process.env['OPENAI_API_KEY'];
      if (key === undefined || key.length === 0) {
        throw new Error('OPENAI_API_KEY must be set for openai-* identifiers');
      }
      return key;
    }
    if (lower.startsWith('anthropic-')) {
      const key: string | undefined = process.env['ANTHROPIC_API_KEY'];
      if (key === undefined || key.length === 0) {
        throw new Error(
          'ANTHROPIC_API_KEY must be set for anthropic-* identifiers',
        );
      }
      return key;
    }
    if (lower.startsWith('google-')) {
      const key: string | undefined = process.env['GOOGLE_API_KEY'];
      if (key === undefined || key.length === 0) {
        throw new Error('GOOGLE_API_KEY must be set for google-* identifiers');
      }
      return key;
    }
    throw new Error('unsupported api_identifier for API key resolution');
  };
  return {
    openaiAdapter,
    anthropicAdapter,
    googleAdapter,
    Url,
    getApiKey,
  };
}

function selectAdapterForApiIdentifier(
  deps: AiStreamDeps,
  apiIdentifier: string,
): AiStreamDeps['openaiAdapter'] {
  const lower: string = apiIdentifier.toLowerCase();
  if (lower.startsWith('openai-')) {
    return deps.openaiAdapter;
  }
  if (lower.startsWith('anthropic-')) {
    return deps.anthropicAdapter;
  }
  if (lower.startsWith('google-')) {
    return deps.googleAdapter;
  }
  throw new ErrorDoNotRetry('unsupported api_identifier prefix');
}

async function executeStreamPhase(
  deps: AiStreamDeps,
  workloadEvent: AiStreamEvent,
): Promise<AiAdapterResult> {
  const adapter = selectAdapterForApiIdentifier(deps, workloadEvent.api_identifier);
  const params: AiAdapterParams = {
    chatApiRequest: workloadEvent.chat_api_request,
    modelConfig: workloadEvent.extended_model_config,
    apiKey: deps.getApiKey(workloadEvent.api_identifier),
  };
  const result: AiAdapterResult = await adapter.stream(params);
  return result;
}

async function executePostPhase(
  deps: AiStreamDeps,
  workloadEvent: AiStreamEvent,
  adapterResult: AiAdapterResult,
): Promise<void> {
  const payload: AiStreamPayload = {
    job_id: workloadEvent.job_id,
    assembled_content: adapterResult.assembled_content,
    token_usage: adapterResult.token_usage,
  };
  const response: Response = await fetch(deps.Url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${workloadEvent.user_jwt}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const statusText: string = String(response.status);
    throw new Error(`back-half POST returned status ${statusText}`);
  }
}

export async function runAiStreamWorkload(
  deps: AiStreamDeps,
  event: unknown,
): Promise<void> {
  if (!isAiStreamEvent(event)) {
    throw new ErrorDoNotRetry('invalid or malformed AiStreamEvent');
  }
  const workloadEvent: AiStreamEvent = event;
  const adapterResult: AiAdapterResult = await executeStreamPhase(
    deps,
    workloadEvent,
  );
  await executePostPhase(deps, workloadEvent, adapterResult);
}

export default asyncWorkloadFn(
  async (event: AsyncWorkloadEvent): Promise<void> => {
    const deps: AiStreamDeps = getProductionAiStreamDeps();
    const eventDataUnknown: unknown = event.eventData;
    if (!isAiStreamEvent(eventDataUnknown)) {
      throw new ErrorDoNotRetry('invalid or malformed AiStreamEvent');
    }
    const workloadEvent: AiStreamEvent = eventDataUnknown;
    const adapterResult: AiAdapterResult = await event.step.run(
      'stream-ai',
      async (): Promise<AiAdapterResult> => {
        return executeStreamPhase(deps, workloadEvent);
      },
    );
    await event.step.run('post-', async (): Promise<void> => {
      await executePostPhase(deps, workloadEvent, adapterResult);
    });
  },
);

export const asyncWorkloadConfig: AsyncWorkloadConfig = {
  events: ['ai-stream'],
  maxRetries: 4,
};
