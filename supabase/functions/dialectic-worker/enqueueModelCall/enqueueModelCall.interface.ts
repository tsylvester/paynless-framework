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
export interface EnqueueModelCallDeps {
  logger: ILogger;
  netlifyQueueUrl: string;
  netlifyApiKey: string;
  apiKeyForProvider: ApiKeyForProviderFn;
  computeJobSig: ComputeJobSig;
}

export interface EnqueueModelCallParams {
  dbClient: SupabaseClient<Database>;
  job: DialecticJobRow;
  providerRow: Tables<'ai_providers'>;
  userAuthToken: string;
  output_type: string;
}

export interface EnqueueModelCallPayload {
  chatApiRequest: ChatApiRequest;
  preflightInputTokens: number;
}

export type EnqueueModelCallSuccessReturn = {
  queued: true;
};

export type EnqueueModelCallErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type EnqueueModelCallReturn =
  | EnqueueModelCallSuccessReturn
  | EnqueueModelCallErrorReturn;

export interface AiStreamEventData {
  job_id: string;
  api_identifier: string;
  model_config: AiModelExtendedConfig;
  chat_api_request: ChatApiRequest;
  sig: string;
}

export interface AiStreamEventBody {
  eventName: 'ai-stream';
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
