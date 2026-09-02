import type { AiModelExtendedConfig } from '../../_shared/types.ts';
import { isAiModelExtendedConfig } from '../../_shared/utils/type-guards/type_guards.chat.ts';
import type {
  AiStreamEventData,
  AiStreamEventBody,
  EnqueueModelCallDeps,
  EnqueueModelCallFn,
  EnqueueModelCallParams,
  EnqueueModelCallPayload,
  EnqueueModelCallReturn,
} from './enqueueModelCall.interface.ts';
import type { DialecticBaseJobPayload } from '../../dialectic-service/dialectic.interface.ts';
import { isDialecticBaseJobPayload } from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isJson } from '../../_shared/utils/type-guards/type_guards.common.ts';
import type { Json } from '../../types_db.ts';

const NETLIFY_MAX_EVENT_BYTES = 500 * 1024;

export const enqueueModelCall: EnqueueModelCallFn = async (
  deps: EnqueueModelCallDeps,
  params: EnqueueModelCallParams,
  payload: EnqueueModelCallPayload,
): Promise<EnqueueModelCallReturn> => {
  if (!isAiModelExtendedConfig(params.providerRow.config)) {
    deps.logger.error('enqueueModelCall: invalid providerRow.config', { config: params.providerRow.config });
    return {
      error: new Error('Invalid providerRow.config: does not satisfy AiModelExtendedConfig'),
      retriable: false,
    };
  }
  const extendedConfig: AiModelExtendedConfig = params.providerRow.config;

  const apiKey: string | null = deps.apiKeyForProvider(params.providerRow.api_identifier);
  if (!apiKey) {
    deps.logger.error('enqueueModelCall: missing API key for provider', { api_identifier: params.providerRow.api_identifier });
    return {
      error: new Error(`No API key found for provider: ${params.providerRow.api_identifier}`),
      retriable: false,
    };
  }

  if (!params.job.user_id || typeof params.job.user_id !== 'string') {
    deps.logger.error('enqueueModelCall: job.user_id is missing or not a string', { user_id: params.job.user_id });
    return {
      error: new Error('job.user_id is required to compute the job signature'),
      retriable: false,
    };
  }

  let sig: string;
  try {
    sig = await deps.computeJobSig(params.job.id, params.job.user_id, params.job.created_at);
  } catch (err: unknown) {
    deps.logger.error('enqueueModelCall: computeJobSig threw', { error: err });
    return {
      error: err instanceof Error ? err : new Error(String(err)),
      retriable: false,
    };
  }

  let composedPayload: Json;
  try {
    if (!isDialecticBaseJobPayload(params.job.payload)) {
      throw new Error('isDialecticBaseJobPayload returned false');
    }
    const provenPayload: DialecticBaseJobPayload = params.job.payload;
    const typedPayload: DialecticBaseJobPayload = {
      ...provenPayload,
      preflight_input_tokens: payload.preflightInputTokens,
    };
    if (!isJson(typedPayload)) {
      deps.logger.error('enqueueModelCall: composed payload is not valid Json');
      return {
        error: new Error('Composed payload is not valid Json.'),
        retriable: false,
      };
    }
    composedPayload = typedPayload;
  } catch (e) {
    if (e instanceof Error) {
      deps.logger.error('enqueueModelCall: job payload failed isDialecticBaseJobPayload', { error: e });
      return { error: e, retriable: false };
    }
    throw e;
  }

  const { error: dbError } = await params.dbClient
    .from('dialectic_generation_jobs')
    .update({ status: 'queued', payload: composedPayload })
    .eq('id', params.job.id);

  if (dbError) {
    deps.logger.error('enqueueModelCall: DB update failed', { error: dbError });
    return {
      error: new Error(dbError.message),
      retriable: true,
    };
  }

  const eventData: AiStreamEventData = {
    job_id: params.job.id,
    api_identifier: params.providerRow.api_identifier,
    model_config: extendedConfig,
    chat_api_request: payload.chatApiRequest,
    sig,
    user_config: params.userConfig,
  };

  const eventBody: AiStreamEventBody = {
    eventName: 'ai-stream-background',
    data: eventData,
  };

  const bodyString: string = JSON.stringify(eventBody);
  if (bodyString.length > NETLIFY_MAX_EVENT_BYTES) {
    deps.logger.error('enqueueModelCall: event body exceeds 500 KB size limit', {
      size: bodyString.length,
      limit: NETLIFY_MAX_EVENT_BYTES,
    });
    return {
      error: new Error(`Event body exceeds 500 KB size limit: ${bodyString.length} bytes`),
      retriable: false,
    };
  }

  try {
    const response: Response = await fetch(deps.netlifyQueueUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deps.netlifyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: bodyString,
    });

    if (!response.ok) {
      deps.logger.error('enqueueModelCall: Netlify queue returned non-2xx', { status: response.status });
      return {
        error: new Error(`Netlify queue returned status ${response.status}`),
        retriable: true,
      };
    }

    return { queued: true };
  } catch (err: unknown) {
    deps.logger.error('enqueueModelCall: fetch threw network error', { error: err });
    return {
      error: err instanceof Error ? err : new Error(String(err)),
      retriable: true,
    };
  }
};
