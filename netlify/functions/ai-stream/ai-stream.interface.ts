import type {
  NodeChatApiRequest,
  NodeModelConfig,
  NodeProviderMap,
  NodeTokenUsage,
} from './adapters/ai-adapter.interface.ts';

export interface AiStreamEvent {
  job_id: string;
  api_identifier: string;
  model_config: NodeModelConfig;
  chat_api_request: NodeChatApiRequest;
  user_jwt: string;
}

export interface AiStreamPayload {
  job_id: string;
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
  finish_reason: string | null;
}

export type GetApiKeyFn = (apiIdentifier: string) => string;

export interface AiStreamDeps {
  providerMap: NodeProviderMap;
  saveResponseUrl: string;
  getApiKey: GetApiKeyFn;
}
