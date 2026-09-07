import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Tables } from '../../types_db.ts';
import type {
  AiModelExtendedConfig,
  ApiKeyForProviderFn,
  ChatApiRequest,
  ILogger,
} from '../../_shared/types.ts';
import type { DialecticJobRow } from '../../dialectic-service/dialectic.interface.ts';
import type { ComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.interface.ts";
import type { UserConfig } from '../calculateAffordability/calculateAffordability.interface.ts';
export interface EnqueueModelCallDeps {
  logger: ILogger;
  netlifyQueueUrl: string;
  netlifyApiKey: string;
  apiKeyForProvider: ApiKeyForProviderFn;
  computeJobSig: ComputeJobSig;
}

export interface EnqueueModelCallParams {
  dbClient: SupabaseClient<Database>;
}

export interface EnqueueModelCallPayload {
  job: DialecticJobRow;
  providerRow: Tables<'ai_providers'>;
  userConfig: UserConfig;
  chatApiRequest: ChatApiRequest;
  preflightInputTokens: number;
}

export type EnqueueModelCallSuccessReturn = {
  queued: true;
  jobId: string;
  sig: string;
  preflightInputTokens: number;
  eventBodyBytes: number;
  queueStatus: number;
};

export type EnqueueModelCallPreparationFailure =
  | 'provider_config_invalid'
  | 'api_key_missing'
  | 'job_user_id_missing'
  | 'job_signature_failed'
  | 'job_payload_invalid'
  | 'composed_payload_not_json';

export type EnqueueModelCallQueueFailure =
  | 'queue_rejected'
  | 'queue_unreachable';

export type EnqueueModelCallPreparationErrorReturn = {
  failure: EnqueueModelCallPreparationFailure;
  error: Error;
  retriable: false;
};

export type EnqueueModelCallJobRowErrorReturn = {
  failure: 'job_row_update_failed';
  error: Error;
  retriable: true;
};

export type EnqueueModelCallEventSizeErrorReturn = {
  failure: 'event_body_too_large';
  error: Error;
  retriable: false;
  eventBodyBytes: number;
  limitBytes: number;
};

export type EnqueueModelCallQueueRejectedErrorReturn = {
  failure: 'queue_rejected';
  error: Error;
  retriable: true;
  queueStatus: number;
};

export type EnqueueModelCallQueueUnreachableErrorReturn = {
  failure: 'queue_unreachable';
  error: Error;
  retriable: true;
};

export type EnqueueModelCallErrorReturn =
  | EnqueueModelCallPreparationErrorReturn
  | EnqueueModelCallJobRowErrorReturn
  | EnqueueModelCallEventSizeErrorReturn
  | EnqueueModelCallQueueRejectedErrorReturn
  | EnqueueModelCallQueueUnreachableErrorReturn;

export type EnqueueModelCallReturn =
  | EnqueueModelCallSuccessReturn
  | EnqueueModelCallErrorReturn;

export interface AiStreamEventData {
  job_id: string;
  api_identifier: string;
  model_config: AiModelExtendedConfig;
  chat_api_request: ChatApiRequest;
  sig: string;
  user_config: UserConfig;
}

export interface AiStreamEventBody {
  eventName: 'ai-stream-background';
  data: AiStreamEventData;
}

export type EnqueueModelCallFn = (
  deps: EnqueueModelCallDeps,
  params: EnqueueModelCallParams,
  payload: EnqueueModelCallPayload,
) => Promise<EnqueueModelCallReturn>;

export type BoundEnqueueModelCallFn = (
  params: EnqueueModelCallParams,
  payload: EnqueueModelCallPayload,
) => Promise<EnqueueModelCallReturn>;
