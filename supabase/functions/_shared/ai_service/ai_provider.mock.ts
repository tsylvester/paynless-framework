import type {
    AdapterResponsePayload,
    AiModelExtendedConfig,
    AiProviderAdapterInstance,
    ChatApiRequest,
    ILogger,
    ProviderModelInfo,
  } from '../types.ts';
  
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
    modelConfig: AiModelExtendedConfig,
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