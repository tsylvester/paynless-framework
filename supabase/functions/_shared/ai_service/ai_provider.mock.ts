import type {
  AiProviderAdapter,
  ChatApiRequest,
  AdapterResponsePayload,
  ProviderModelInfo,
  TokenUsage,
} from '../types.ts';
import type { Json } from '../../types_db.ts';

interface RecordedCall {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  modelIdentifier: string;
  apiKey: string; // Though in tests, this might be a dummy value
  max_tokens_to_generate?: number;
}

export class MockAiProviderAdapter implements AiProviderAdapter {
  private mockResponses: Map<string, () => Promise<AdapterResponsePayload>> = new Map();
  private recordedCalls: RecordedCall[] = [];
  private defaultTokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };

  public setMockResponse(
    apiIdentifier: string,
    responseGenerator: () => Promise<AdapterResponsePayload>
  ): void {
    this.mockResponses.set(apiIdentifier, responseGenerator);
  }

  // Helper to set a simple, static mock response
  public setSimpleMockResponse(
    apiIdentifier: string,
    content: string,
    ai_provider_id: string | null,
    system_prompt_id: string | null,
    token_usage?: TokenUsage
  ): void {
    this.setMockResponse(apiIdentifier, async () => ({
      role: 'assistant',
      content,
      ai_provider_id,
      system_prompt_id,
      token_usage: (token_usage || { ...this.defaultTokenUsage }) as unknown as Json,
    }));
  }
  
  public setMockError(apiIdentifier: string, errorMessage: string, statusCode = 500): void {
    this.setMockResponse(apiIdentifier, async () => {
      // Simulate an error structure or throw an actual error
      // For now, let's throw an error that the calling code might catch
      throw Object.assign(new Error(errorMessage), { statusCode });
    });
  }

  // --- Methods for Integration Testing ---
  private failures: Map<string, { count: number; message: any }> = new Map();
  private continuations: Map<string, { count: number; subsequentContent: string }> = new Map();

  /**
   * Configures the mock adapter to fail a specific number of times for a given model before succeeding.
   * @param modelId The database UUID of the ai_providers model.
   * @param count The number of times the call should fail.
   * @param error The error object to be thrown.
   */
  public setFailureForModel(modelId: string, count: number, error: any) {
    this.failures.set(modelId, { count, message: error });
  }

  /**
   * Configures the mock adapter to return a 'length' finish_reason for a specific number of times,
   * before returning a final piece of content with a 'stop' finish_reason.
   * @param modelId The database UUID of the ai_providers model.
   * @param count The number of times to return a 'length' finish_reason.
   * @param subsequentContent The final content to be returned on the last call.
   */
  public setContinuationForModel(modelId: string, count: number, subsequentContent: string) {
    this.continuations.set(modelId, { count, subsequentContent });
  }

  async sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string, // This is the api_identifier from the DB
    apiKey: string
  ): Promise<AdapterResponsePayload> {
    this.recordedCalls.push({
      messages: request.messages || [],
      modelIdentifier,
      apiKey,
      max_tokens_to_generate: request.max_tokens_to_generate,
    });

    // Check for failure configuration first
    const failureConfig = this.failures.get(request.providerId);
    if (failureConfig && failureConfig.count > 0) {
      failureConfig.count--;
      this.failures.set(request.providerId, failureConfig);
      throw failureConfig.message;
    }

    // Check for continuation configuration
    const continuationConfig = this.continuations.get(request.providerId);
    if (continuationConfig && continuationConfig.count > 0) {
      continuationConfig.count--;
      this.continuations.set(request.providerId, continuationConfig);
      return {
        role: 'assistant',
        content: `This is a partial response for ${modelIdentifier}.`,
        ai_provider_id: request.providerId,
        system_prompt_id: request.promptId,
        finish_reason: 'length', // Signal that the response is truncated
        token_usage: { ...this.defaultTokenUsage } as unknown as Json,
      };
    } else if (continuationConfig) {
      // Last call in a continuation chain
      this.continuations.delete(request.providerId); // Clean up
      return {
        role: 'assistant',
        content: continuationConfig.subsequentContent,
        ai_provider_id: request.providerId,
        system_prompt_id: request.promptId,
        finish_reason: 'stop',
        token_usage: { ...this.defaultTokenUsage } as unknown as Json,
      };
    }

    const responseGenerator = this.mockResponses.get(modelIdentifier);
    if (responseGenerator) {
      return responseGenerator();
    }

    // Default success response if no other configuration matches
    return {
        role: 'assistant',
        content: `Default mock response for ${modelIdentifier}`,
        ai_provider_id: request.providerId,
        system_prompt_id: request.promptId,
        finish_reason: 'stop',
        token_usage: { ...this.defaultTokenUsage } as unknown as Json,
    };
  }

  async listModels(_apiKey: string): Promise<ProviderModelInfo[]> {
    // Return a default empty list or a predefined list if needed for tests
    console.warn("MockAiProviderAdapter: listModels called, returning empty array. Set mock if specific models are needed.");
    return []; 
  }

  public getRecordedCalls(): RecordedCall[] {
    return this.recordedCalls;
  }

  public getLastRecordedCall(): RecordedCall | undefined {
    return this.recordedCalls[this.recordedCalls.length - 1];
  }
  
  public getReceivedMaxTokens(modelIdentifier: string): number | undefined {
    const call = this.recordedCalls.find(c => c.modelIdentifier === modelIdentifier);
    return call?.max_tokens_to_generate;
  }

  public clearRecordedCalls(): void {
    this.recordedCalls = [];
  }

  public clearMockResponses(): void {
    this.mockResponses.clear();
  }

  public reset(): void {
    this.clearRecordedCalls();
    this.clearMockResponses();
    this.failures.clear();
    this.continuations.clear();
  }
}

// Optional: A global instance or a factory function for convenience in tests
// export const mockAiAdapter = new MockAiProviderAdapter();

// export function getMockAiProviderAdapter(): MockAiProviderAdapter {
//   return mockAiAdapter; // Or a new instance each time if preferred
// } 