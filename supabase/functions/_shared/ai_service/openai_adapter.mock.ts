// supabase/functions/_shared/ai_service/openai_adapter.mock.ts
import { spy, Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { OpenAiAdapter } from "./openai_adapter.ts";
import { ILogger } from "../types.ts";
import { CreateEmbeddingResponse } from "npm:openai/resources/embeddings";
import { AdapterResponsePayload, EmbeddingResponse, ProviderModelInfo } from "../types.ts";
import { ChatApiRequest } from "../types.ts";
import { MOCK_PROVIDER } from "./dummy_adapter.test.ts";

class MockLogger implements ILogger {
  info = () => {};
  warn = () => {};
  error = () => {};
  debug = () => {};
}

/**
 * A mock of the OpenAiAdapter that spies on its methods and returns canned data.
 * The original methods are overridden with spies that can be asserted in tests.
 */
class MockOpenAiAdapter extends OpenAiAdapter {
    constructor() {
        super(MOCK_PROVIDER, "sk-mock-key", new MockLogger());
    }

    // We override the original methods to provide predictable, mock implementations.
    override async getEmbedding(_text: string, _model?: string): Promise<EmbeddingResponse> {
        return Promise.resolve({
            embedding: Array(3072).fill(0.1),
            usage: { prompt_tokens: 5, total_tokens: 5 }
        });
    }

    override async sendMessage(_request: ChatApiRequest, _modelIdentifier: string): Promise<AdapterResponsePayload> {
        return Promise.resolve({
            ai_provider_id: 'openai',
            system_prompt_id: 'default',
            token_usage: { prompt_tokens: 1, total_tokens: 1, completion_tokens: 0 },
            role: 'assistant',
            content: 'mock response',
            finish_reason: 'stop'
        });
    }

    // Overload for sync script to get raw data
    override async listModels(getRaw: true): Promise<{ models: ProviderModelInfo[], raw: unknown }>;
    // Overload for standard adapter contract
    override async listModels(getRaw?: false): Promise<ProviderModelInfo[]>;
    // Implementation
    override async listModels(getRaw?: boolean): Promise<ProviderModelInfo[] | { models: ProviderModelInfo[], raw: unknown }> {
        if (getRaw) {
            return Promise.resolve({ models: [], raw: {} });
        }
        return Promise.resolve([]);
    }
}

// Create an instance of the mock adapter
const mockAdapterInstance = new MockOpenAiAdapter();

// Create spies on the instance's methods
export const mockGetEmbeddingSpy = spy(mockAdapterInstance, "getEmbedding");
export const mockSendMessageSpy = spy(mockAdapterInstance, "sendMessage");
export const mockListModelsSpy = spy(mockAdapterInstance, "listModels");

// Export the instance itself for injection
export const mockOpenAiAdapter = mockAdapterInstance;
