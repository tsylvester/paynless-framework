import type { AiProviderAdapter, ChatMessage, ProviderModelInfo, ChatApiRequest, AdapterResponsePayload, ILogger, TokenUsage, AiModelExtendedConfig } from '../types.ts';
import type { Json } from '../../../functions/types_db.ts';

export interface DummyAdapterConfig {
    modelId: string;
    mode: 'echo' | 'fixed_response';
    fixedResponse?: {
        content: string;
        promptTokens?: number;
        completionTokens?: number;
    };
    // For echo mode, we might want to simulate token calculation
    tokensPerChar?: number; 
    basePromptTokens?: number;
    tokenization_strategy: AiModelExtendedConfig['tokenization_strategy'];
}

/**
 * Implements AiProviderAdapter for dummy/testing models.
 */
export class DummyAdapter implements AiProviderAdapter {
    private config: DummyAdapterConfig;

    constructor(
        // The apiKey for dummy adapters could be a stringified JSON config 
        // or a simple identifier that maps to a predefined config.
        // For simplicity, we'll use a direct config object here, 
        // but in the factory, this might be parsed from a string.
        config: DummyAdapterConfig,
        private logger: ILogger
    ) {
        this.config = config;
        this.logger.debug(`[DummyAdapter] Initialized for model: ${config.modelId}, mode: ${config.mode}`);
    }

    async sendMessage(
        request: ChatApiRequest,
        modelIdentifier: string, // e.g., "dummy-echo-v1"
    ): Promise<AdapterResponsePayload> {
        this.logger.debug(`[DummyAdapter] sendMessage called for model: ${modelIdentifier}`, { request });

        let responseContent = '';
        let prompt_tokens = 0;
        let completion_tokens = 0;
        const requestMessagesString = (request.messages ?? []).map(m => m.content).join('\n') + (request.message ? '\n' + request.message : '');

        if (this.config.mode === 'echo') {
            responseContent = `Echo: ${request.message || 'No message provided'}`;
            // Simulate token usage for echo
            prompt_tokens = (this.config.basePromptTokens ?? 10) + Math.ceil(requestMessagesString.length * (this.config.tokensPerChar ?? 0.25));
            completion_tokens = Math.ceil(responseContent.length * (this.config.tokensPerChar ?? 0.25));

        } else if (this.config.mode === 'fixed_response') {
            responseContent = this.config.fixedResponse?.content ?? 'This is a fixed response.';
            prompt_tokens = this.config.fixedResponse?.promptTokens ?? 
                (this.config.basePromptTokens ?? 10) + Math.ceil(requestMessagesString.length * (this.config.tokensPerChar ?? 0.25));
            completion_tokens = this.config.fixedResponse?.completionTokens ?? Math.ceil(responseContent.length * (this.config.tokensPerChar ?? 0.25));
        } else {
            this.logger.error(`[DummyAdapter] Unknown mode: ${this.config.mode}`);
            throw new Error(`DummyAdapter: Unknown mode '${this.config.mode}'`);
        }

        const tokenUsage: TokenUsage = {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        };
        
        const assistantResponse: AdapterResponsePayload = {
            role: 'assistant',
            content: responseContent,
            ai_provider_id: request.providerId, 
            system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
            token_usage: tokenUsage as unknown as Json,
            // model_identifier: modelIdentifier // Or pass through from request if needed.
        };

        this.logger.debug('[DummyAdapter] sendMessage successful', { response: assistantResponse });
        return assistantResponse;
    }

    async listModels(): Promise<ProviderModelInfo[]> {
        // Return a list containing the model this adapter is configured for
        // In a real scenario, a "dummy" provider might list several dummy models
        // and the factory would choose which one to instantiate.
        // For now, this adapter is configured for one specific model.
        const modelInfo: ProviderModelInfo = {
            api_identifier: this.config.modelId, // e.g., "dummy-echo-v1"
            name: `Dummy Model (${this.config.mode}) - ${this.config.modelId}`,
            description: `A dummy AI model for testing purposes. Mode: ${this.config.mode}.`,
            // context_length: 2048, // Example
            // type: 'chat', // Example
        };
        this.logger.debug('[DummyAdapter] listModels called', { modelInfo });
        return [modelInfo];
    }
} 