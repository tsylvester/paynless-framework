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
  job: DialecticJobRow;
  providerRow: Tables<'ai_providers'>;
  userAuthToken: string;
  output_type: string;
  userConfig: UserConfig;
}

export type EnqueueModelCallOperation = 'stream' | 'embedding';

export interface EnqueueModelCallEmbeddingApiRequest {
  input: string;
}

export interface EnqueueModelCallPayloadBase {
  operation: EnqueueModelCallOperation;
  preflightInputTokens: number;
}

export interface EnqueueModelCallStreamPayload extends EnqueueModelCallPayloadBase {
  operation: 'stream';
  chatApiRequest: ChatApiRequest;
}

export interface EnqueueModelCallEmbeddingPayload extends EnqueueModelCallPayloadBase {
  operation: 'embedding';
  embeddingApiRequest: EnqueueModelCallEmbeddingApiRequest;
}

export type EnqueueModelCallPayload =
  | EnqueueModelCallStreamPayload
  | EnqueueModelCallEmbeddingPayload;

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

export interface AiWorkloadEventBase {
  job_id: string;
  api_identifier: string;
  model_config: AiModelExtendedConfig;
  sig: string;
  user_config: UserConfig;
}

export interface AiWorkloadStreamEvent extends AiWorkloadEventBase {
  operation: 'stream';
  chat_api_request: ChatApiRequest;
}

export interface AiWorkloadEmbeddingEvent extends AiWorkloadEventBase {
  operation: 'embedding';
  embedding_api_request: EnqueueModelCallEmbeddingApiRequest;
}

export type AiWorkloadEvent = AiWorkloadStreamEvent | AiWorkloadEmbeddingEvent;

export interface AiStreamEventBody {
  eventName: 'ai-stream-background';
  data: AiWorkloadEvent;
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
