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
  if (!isAiModelExtendedConfig(payload.providerRow.config)) {
    deps.logger.error('enqueueModelCall: invalid providerRow.config', { config: payload.providerRow.config });
    return {
      failure: 'provider_config_invalid',
      error: new Error('Invalid providerRow.config: does not satisfy AiModelExtendedConfig'),
      retriable: false,
    };
  }
  const extendedConfig: AiModelExtendedConfig = payload.providerRow.config;

  const apiKey: string | null = deps.apiKeyForProvider(payload.providerRow.api_identifier);
  if (!apiKey) {
    deps.logger.error('enqueueModelCall: missing API key for provider', { api_identifier: payload.providerRow.api_identifier });
    return {
      failure: 'api_key_missing',
      error: new Error(`No API key found for provider: ${payload.providerRow.api_identifier}`),
      retriable: false,
    };
  }

  if (!payload.job.user_id || typeof payload.job.user_id !== 'string') {
    deps.logger.error('enqueueModelCall: job.user_id is missing or not a string', { user_id: payload.job.user_id });
    return {
      failure: 'job_user_id_missing',
      error: new Error('job.user_id is required to compute the job signature'),
      retriable: false,
    };
  }

  let sig: string;
  try {
    sig = await deps.computeJobSig(payload.job.id, payload.job.user_id, payload.job.created_at);
  } catch (err: unknown) {
    deps.logger.error('enqueueModelCall: computeJobSig threw', { error: err });
    let sigError: Error;
    if (err instanceof Error) {
      sigError = err;
    } else {
      sigError = new Error('enqueueModelCall: computeJobSig threw a non-Error value');
    }
    return {
      failure: 'job_signature_failed',
      error: sigError,
      retriable: false,
    };
  }

  let provenPayload: DialecticBaseJobPayload;
  try {
    if (!isDialecticBaseJobPayload(payload.job.payload)) {
      deps.logger.error('enqueueModelCall: job payload failed isDialecticBaseJobPayload', { error: new Error('isDialecticBaseJobPayload returned false') });
      return {
        failure: 'job_payload_invalid',
        error: new Error('isDialecticBaseJobPayload returned false'),
        retriable: false,
      };
    }
    provenPayload = payload.job.payload;
  } catch (e: unknown) {
    let payloadError: Error;
    if (e instanceof Error) {
      payloadError = e;
    } else {
      payloadError = new Error('enqueueModelCall: isDialecticBaseJobPayload threw a non-Error value');
    }
    deps.logger.error('enqueueModelCall: job payload failed isDialecticBaseJobPayload', { error: payloadError });
    return {
      failure: 'job_payload_invalid',
      error: payloadError,
      retriable: false,
    };
  }
  const typedPayload: DialecticBaseJobPayload = {
    ...provenPayload,
    preflight_input_tokens: payload.preflightInputTokens,
  };
  if (!isJson(typedPayload)) {
    deps.logger.error('enqueueModelCall: composed payload is not valid Json');
    return {
      failure: 'composed_payload_not_json',
      error: new Error('Composed payload is not valid Json.'),
      retriable: false,
    };
  }
  const composedPayload: Json = typedPayload;

  const { error: dbError } = await params.dbClient
    .from('dialectic_generation_jobs')
    .update({ status: 'queued', payload: composedPayload })
    .eq('id', payload.job.id);

  if (dbError) {
    deps.logger.error('enqueueModelCall: DB update failed', { error: dbError });
    return {
      failure: 'job_row_update_failed',
      error: new Error(dbError.message),
      retriable: true,
    };
  }

  const eventData: AiStreamEventData = {
    job_id: payload.job.id,
    api_identifier: payload.providerRow.api_identifier,
    model_config: extendedConfig,
    chat_api_request: payload.chatApiRequest,
    sig,
    user_config: payload.userConfig,
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
      failure: 'event_body_too_large',
      error: new Error('Event body exceeds 500 KB size limit'),
      retriable: false,
      eventBodyBytes: bodyString.length,
      limitBytes: NETLIFY_MAX_EVENT_BYTES,
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
        failure: 'queue_rejected',
        error: new Error('Netlify queue returned a non-2xx response'),
        retriable: true,
        queueStatus: response.status,
      };
    }

    return {
      queued: true,
      jobId: payload.job.id,
      sig,
      preflightInputTokens: payload.preflightInputTokens,
      eventBodyBytes: bodyString.length,
      queueStatus: response.status,
    };
  } catch (err: unknown) {
    deps.logger.error('enqueueModelCall: fetch threw network error', { error: err });
    let fetchError: Error;
    if (err instanceof Error) {
      fetchError = err;
    } else {
      fetchError = new Error('enqueueModelCall: fetch threw a non-Error value');
    }
    return {
      failure: 'queue_unreachable',
      error: fetchError,
      retriable: true,
    };
  }
};
