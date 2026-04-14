export interface NodeChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface NodeChatApiRequest {
  messages: NodeChatMessage[];
  model: string;
  max_tokens: number;
  system?: string;
}

export interface NodeModelConfig {
  model_identifier: string;
  max_tokens: number;
}

export interface NodeTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AiAdapterParams {
  chatApiRequest: NodeChatApiRequest;
  modelConfig: NodeModelConfig;
  apiKey: string;
}

export interface AiAdapterResult {
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
}

export interface AiAdapter {
  stream(params: AiAdapterParams): Promise<AiAdapterResult>;
}

export type NodeAdapterFactory = (apiKey: string) => AiAdapter;

export type NodeProviderMap = Record<string, NodeAdapterFactory>;
