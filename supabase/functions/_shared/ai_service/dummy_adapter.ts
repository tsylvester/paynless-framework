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
    provider_max_input_tokens?: number;
    provider_max_output_tokens?: number;
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

        const requestMessagesString = (request.messages ?? []).map(m => m.content).join('\n') + (request.message ? '\n' + request.message : '');
        let fullResponseContent = '';

        // 1. Determine the full potential response content
        if (this.config.mode === 'echo') {
            // In echo mode, the full response is always based on the *initial* user message, not the growing history.
            fullResponseContent = `Echo: ${request.message || 'No message provided'}`;
        } else if (this.config.mode === 'fixed_response') {
            fullResponseContent = this.config.fixedResponse?.content ?? 'This is a fixed response.';
        } else {
            this.logger.error(`[DummyAdapter] Unknown mode: ${this.config.mode}`);
            throw new Error(`DummyAdapter: Unknown mode '${this.config.mode}'`);
        }

        // 2. Calculate and validate INPUT tokens based on the current request history
        let prompt_tokens = (this.config.basePromptTokens ?? 10) + Math.ceil(requestMessagesString.length * (this.config.tokensPerChar ?? 0.25));
        if (this.config.mode === 'fixed_response' && this.config.fixedResponse?.promptTokens !== undefined) {
            prompt_tokens = this.config.fixedResponse.promptTokens;
        }

        if (this.config.provider_max_input_tokens && prompt_tokens > this.config.provider_max_input_tokens) {
            this.logger.error(`[DummyAdapter] Input tokens exceeded limit.`, { prompt_tokens, limit: this.config.provider_max_input_tokens });
            throw new Error(`Input prompt exceeds the model's maximum context size of ${this.config.provider_max_input_tokens} tokens.`);
        }

        // 3. Determine how much content has already been sent in previous continuation calls
        const alreadySentContent = (request.messages ?? [])
            .filter(m => m.role === 'assistant')
            .map(m => m.content)
            .join('');
        
        const remainingContent = fullResponseContent.substring(alreadySentContent.length);

        // 4. Determine the chunk to send in this response
        let responseChunk = remainingContent;
        let finish_reason: 'stop' | 'length' = 'stop';
        const maxOutputTokens = this.config.provider_max_output_tokens;
        
        if (maxOutputTokens) {
            const maxChars = Math.floor(maxOutputTokens / (this.config.tokensPerChar ?? 0.25));
            if (remainingContent.length > maxChars) {
                responseChunk = remainingContent.substring(0, maxChars);
                finish_reason = 'length';
            }
        }
        
        // 5. Calculate completion tokens for the CURRENT chunk
        let completion_tokens = Math.ceil(responseChunk.length * (this.config.tokensPerChar ?? 0.25));
        if (this.config.mode === 'fixed_response' && this.config.fixedResponse?.completionTokens !== undefined) {
            // In fixed mode, the completion tokens are for the WHOLE response, not the chunk.
            // This is a simplification for testing. If we need more nuanced token accounting for 
            // fixed-response continuation, this would need to be more complex.
            // For now, we prioritize the fixed value if present.
            completion_tokens = this.config.fixedResponse.completionTokens;
        }
        
        // 6. Construct final payload
        const tokenUsage: TokenUsage = {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
            finish_reason,
        };
        
        const assistantResponse: AdapterResponsePayload = {
            role: 'assistant',
            content: responseChunk,
            ai_provider_id: request.providerId, 
            system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
            token_usage: tokenUsage as unknown as Json,
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