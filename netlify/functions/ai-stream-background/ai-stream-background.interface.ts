import type {
  NodeChatApiRequest,
  NodeEmbeddingRequest,
  NodeEmbeddingVector,
  NodeModelConfig,
  NodeProviderMap,
  NodeTokenUsage,
  NodeUserConfig,
} from './adapters/ai-adapter.interface.ts';

export type AiWorkloadOperation = 'stream' | 'embedding';

export interface AiWorkloadEventBase {
  job_id: string;
  api_identifier: string;
  model_config: NodeModelConfig;
  sig: string;
  user_config: NodeUserConfig;
}

export interface AiWorkloadStreamEvent extends AiWorkloadEventBase {
  operation: 'stream';
  chat_api_request: NodeChatApiRequest;
}

export interface AiWorkloadEmbeddingEvent extends AiWorkloadEventBase {
  operation: 'embedding';
  embedding_api_request: NodeEmbeddingRequest;
}

export type AiWorkloadEvent = AiWorkloadStreamEvent | AiWorkloadEmbeddingEvent;

export interface AiWorkloadPayloadBase {
  job_id: string;
  sig: string;
}

export interface AiWorkloadStreamPayload extends AiWorkloadPayloadBase {
  operation: 'stream';
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
  finish_reason: string | null;
}

export interface AiWorkloadEmbeddingPayload extends AiWorkloadPayloadBase {
  operation: 'embedding';
  embedding: NodeEmbeddingVector;
  token_usage: NodeTokenUsage;
}

export type AiWorkloadPayload =
  | AiWorkloadStreamPayload
  | AiWorkloadEmbeddingPayload;

export type GetApiKeyFn = (apiIdentifier: string) => string;

export interface AiStreamDeps {
  providerMap: NodeProviderMap;
  saveResponseUrl: string;
  getApiKey: GetApiKeyFn;
}
