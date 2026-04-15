import type {
  AiAdapter,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeTokenUsage,
} from './adapters/ai-adapter.interface.ts';

export interface AiStreamEvent {
  job_id: string;
  api_identifier: string;
  extended_model_config: NodeModelConfig;
  chat_api_request: NodeChatApiRequest;
  user_jwt: string;
}

export interface AiStreamPayload {
  job_id: string;
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
}

export interface AiStreamDeps {
  openaiAdapter: AiAdapter;
  anthropicAdapter: AiAdapter;
  googleAdapter: AiAdapter;
  Url: string;
  getApiKey(apiIdentifier: string): string;
}

export interface AiStreamParams {
  event: AiStreamEvent;
}

/**
 * Netlify workload entry beyond {@link AiStreamParams}; reserved for forward-compatible extensions.
 */
export interface AiStreamInvocationPayload {
  workloadVersion: 'v1';
}

export type AiStreamSuccessReturn = {
  outcome: 'success';
  requestBody: AiStreamPayload;
};

export type AiStreamErrorReturn = {
  outcome: 'error';
  error: Error;
  retriable: boolean;
};

export type AiStreamReturn = AiStreamSuccessReturn | AiStreamErrorReturn;

export type AiStreamFn = (
  deps: AiStreamDeps,
  params: AiStreamParams,
  payload: AiStreamInvocationPayload,
) => Promise<AiStreamReturn>;
