export type NodeChatRole = 'user' | 'assistant' | 'system';

export interface NodeChatMessage {
  role: NodeChatRole;
  content: string;
}

export interface NodeOutboundDocument {
  id: string;
  content: string;
  document_key?: string;
  stage_slug?: string;
}

export interface NodeChatApiRequest {
  message: string;
  messages?: NodeChatMessage[];
  resourceDocuments?: NodeOutboundDocument[];
  max_tokens_to_generate?: number;
  providerId: string;
  promptId: string;
}

export interface NodeModelConfig {
  api_identifier: string;
  provider_max_input_tokens?: number;
  context_window_tokens?: number | null;
  hard_cap_output_tokens?: number;
  provider_max_output_tokens?: number;
  input_token_cost_rate: number | null;
  output_token_cost_rate: number | null;
}

export interface NodeTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface NodeAdapterStreamChunkTextDelta {
  type: 'text_delta';
  text: string;
}

export interface NodeAdapterStreamChunkUsage {
  type: 'usage';
  tokenUsage: NodeTokenUsage;
}

export interface NodeAdapterStreamChunkDone {
  type: 'done';
  finish_reason: string;
}

export type NodeAdapterStreamChunk =
  | NodeAdapterStreamChunkTextDelta
  | NodeAdapterStreamChunkUsage
  | NodeAdapterStreamChunkDone;

export interface NodeAdapterConstructorParams {
  modelConfig: NodeModelConfig;
  apiKey: string;
}

export interface AiAdapter {
  sendMessageStream(
    request: NodeChatApiRequest,
    apiIdentifier: string,
  ): AsyncGenerator<NodeAdapterStreamChunk>;
}

export type NodeAdapterFactory = (
  params: NodeAdapterConstructorParams,
) => AiAdapter;

export type NodeProviderMap = Record<string, NodeAdapterFactory>;
