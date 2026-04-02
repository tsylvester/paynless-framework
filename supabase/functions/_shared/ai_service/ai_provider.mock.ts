import type {
    AdapterResponsePayload,
    AiModelExtendedConfig,
    AiProviderAdapterInstance,
    ChatApiRequest,
    ILogger,
    ProviderModelInfo,
    AdapterStreamChunk,
  } from '../types.ts';
import { isTokenUsage } from '../utils/type_guards.ts';
import { Tables } from '../../types_db.ts';
import { isJson } from '../utils/type_guards.ts';

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
  api_identifier: "dummy-model-v1",
  input_token_cost_rate: 0,
  output_token_cost_rate: 0,
  tokenization_strategy: { 
      type: 'tiktoken', 
      tiktoken_encoding_name: 'cl100k_base' 
  },
};

if(!isJson(MOCK_MODEL_CONFIG)) {
  throw new Error('MOCK_MODEL_CONFIG is not a valid JSON object');
}

export const MOCK_PROVIDER: Tables<'ai_providers'> = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  provider: "dummy",
  api_identifier: "dummy-model-v1",
  name: "Dummy Model",
  description: "A dummy AI model for testing purposes.",
  is_active: true,
  is_default_embedding: false,
  is_default_generation: false,
  is_enabled: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  config: MOCK_MODEL_CONFIG,
};

  /**
   * Defines the test-only control methods for the mock adapter.
   */
  export type MockAiProviderAdapterControls = {
    setMockResponse(response: Partial<AdapterResponsePayload>): void;
    setMockError(error: Error): void;
    reset(): void;
  };
  
  /**
   * Creates a mock AI Provider Adapter that adheres to the AiProviderAdapterInstance interface,
   * and returns it along with a separate 'controls' object for test manipulation.
   */
  export const getMockAiProviderAdapter = (
    logger: ILogger,
    modelConfig: AiModelExtendedConfig = buildExtendedModelConfig(),
  ): { instance: AiProviderAdapterInstance; controls: MockAiProviderAdapterControls } => {
    logger.info(`Creating Mock AI Provider Adapter for ${modelConfig.api_identifier}`);
  
    let mockResponse: AdapterResponsePayload = {
      role: 'assistant',
      content: 'Default mock response',
      ai_provider_id: 'mock-provider-id',
      system_prompt_id: 'mock-system-prompt-id',
      finish_reason: 'stop',
      token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };
  
    let mockError: Error | null = null;
  
    const instance: AiProviderAdapterInstance = {
      sendMessage: async (
        _request: ChatApiRequest,
        _modelIdentifier: string,
      ): Promise<AdapterResponsePayload> => {
        if (mockError) {
          throw mockError;
        }
        return Promise.resolve(mockResponse);
      },
      async *sendMessageStream(
        _request: ChatApiRequest,
        _modelIdentifier: string,
      ): AsyncGenerator<AdapterStreamChunk> {
        if (mockError) {
          throw mockError;
        }
        yield { type: 'text_delta', text: mockResponse.content };
        if (isTokenUsage(mockResponse.token_usage)) {
          yield { type: 'usage', tokenUsage: mockResponse.token_usage };
        }
        yield { type: 'done', finish_reason: mockResponse.finish_reason ?? 'stop' };
      },
      listModels: async (): Promise<ProviderModelInfo[]> => {
        return Promise.resolve([]);
      },
    };
  
    const controls: MockAiProviderAdapterControls = {
        setMockResponse(response: Partial<AdapterResponsePayload>) {
        mockResponse = { ...mockResponse, ...response };
      },
      setMockError(error: Error) {
        mockError = error;
      },
      reset() {
        mockError = null;
        mockResponse = {
            role: 'assistant',
            content: 'Default mock response',
            ai_provider_id: 'mock-provider-id',
            system_prompt_id: 'mock-system-prompt-id',
            finish_reason: 'stop',
            token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          };
      }
    };
  
    return { instance, controls };
  };

  export type BuildExtendedModelConfigOverrides = {
    [K in keyof AiModelExtendedConfig]?: AiModelExtendedConfig[K];
  };
  
  export function buildExtendedModelConfig(
    overrides?: BuildExtendedModelConfigOverrides,
  ): AiModelExtendedConfig {
    const base: AiModelExtendedConfig = {
      api_identifier: "contract-api-v1",
      input_token_cost_rate: 0.01,
      output_token_cost_rate: 0.01,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: "cl100k_base",
      },
      hard_cap_output_tokens: 500,
      provider_max_output_tokens: 500,
      context_window_tokens: 128000,
      provider_max_input_tokens: 128000,
    };
  
    return {
      ...base,
      ...overrides,
    };
  }

  export async function* mockSendMessageStream(
    _request: ChatApiRequest,
    _modelIdentifier: string,
): AsyncGenerator<AdapterStreamChunk> {
    yield { type: 'text_delta', text: 'mock' };
    yield {
        type: 'usage',
        tokenUsage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
    yield { type: 'done', finish_reason: 'stop' };
}