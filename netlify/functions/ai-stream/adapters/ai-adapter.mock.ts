import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
  NodeTokenUsage,
} from './ai-adapter.interface.ts';

export function createValidNodeChatMessage(): NodeChatMessage {
  const message: NodeChatMessage = {
    role: 'user',
    content: 'contract content',
  };
  return message;
}

export function createValidNodeChatApiRequest(): NodeChatApiRequest {
  const userMessage: NodeChatMessage = createValidNodeChatMessage();
  const request: NodeChatApiRequest = {
    messages: [userMessage],
    model: 'contract-model',
    max_tokens: 100,
  };
  return request;
}

export function createValidNodeModelConfig(): NodeModelConfig {
  const config: NodeModelConfig = {
    model_identifier: 'contract-model-id',
    max_tokens: 100,
  };
  return config;
}

export function createValidNodeTokenUsage(): NodeTokenUsage {
  const usage: NodeTokenUsage = {
    prompt_tokens: 1,
    completion_tokens: 2,
    total_tokens: 3,
  };
  return usage;
}

export function createValidAiAdapterResultWithUsage(): AiAdapterResult {
  const tokenUsage: NodeTokenUsage = createValidNodeTokenUsage();
  const result: AiAdapterResult = {
    assembled_content: 'assembled',
    token_usage: tokenUsage,
  };
  return result;
}

export function createValidAiAdapterResultNullUsage(): AiAdapterResult {
  const result: AiAdapterResult = {
    assembled_content: '',
    token_usage: null,
  };
  return result;
}

export function createValidAiAdapterParams(): AiAdapterParams {
  const chatApiRequest: NodeChatApiRequest = createValidNodeChatApiRequest();
  const modelConfig: NodeModelConfig = createValidNodeModelConfig();
  const params: AiAdapterParams = {
    chatApiRequest,
    modelConfig,
    apiKey: 'contract-api-key',
  };
  return params;
}

export function createValidAiAdapter(): AiAdapter {
  const adapter: AiAdapter = {
    stream: async (
      params: AiAdapterParams,
    ): Promise<AiAdapterResult> => {
      void params;
      return createValidAiAdapterResultNullUsage();
    },
  };
  return adapter;
}
