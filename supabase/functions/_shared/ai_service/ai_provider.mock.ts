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

  async sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string,
    apiKey: string
  ): Promise<AdapterResponsePayload> {
    this.recordedCalls.push({
      messages: request.messages || [],
      modelIdentifier,
      apiKey,
      max_tokens_to_generate: request.max_tokens_to_generate,
    });

    const responseGenerator = this.mockResponses.get(modelIdentifier);
    if (responseGenerator) {
      return responseGenerator();
    }

    // Fallback or error if no mock response is set for the identifier
    throw new Error(
      `MockAiProviderAdapter: No mock response set for modelIdentifier "${modelIdentifier}"`
    );
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
  }
}

// Optional: A global instance or a factory function for convenience in tests
// export const mockAiAdapter = new MockAiProviderAdapter();

// export function getMockAiProviderAdapter(): MockAiProviderAdapter {
//   return mockAiAdapter; // Or a new instance each time if preferred
// } 