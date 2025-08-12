import type { ProviderModelInfo, ChatApiRequest, AdapterResponsePayload, ILogger, AiModelExtendedConfig, MessageForTokenCounting } from '../types.ts';
import { countTokensForMessages } from '../utils/tokenizer_utils.ts';
import { ContextWindowError } from '../utils/errors.ts';
import type { Tables } from '../../types_db.ts';
import { isJson, isAiModelExtendedConfig } from '../utils/type_guards.ts';

/**
 * Implements AiProviderAdapter for dummy/testing models.
 * This adapter is for testing and development. It echoes the user's message back
 * and provides token counts calculated by the application's standard tokenizer.
 * It does not connect to any external service.
 */
export class DummyAdapter {
    private apiKey: string;
    private logger: ILogger;
    private modelConfig: AiModelExtendedConfig;
    private providerId: string;

    constructor(
        provider: Tables<'ai_providers'>,
        apiKey: string,
        logger: ILogger,
    ) {
        if(!isJson(provider.config)) {
            throw new Error('provider.config is not a valid JSON object');
        }
        if(!isAiModelExtendedConfig(provider.config)) {
            throw new Error('provider.config is not a valid AiModelExtendedConfig object');
        }
        this.apiKey = apiKey; // Stored for interface consistency, but not used.
        this.logger = logger;
        this.modelConfig = provider.config; // Stored for interface consistency.
        this.providerId = provider.id;
        this.logger.info(`[DummyAdapter] Initialized with config: ${JSON.stringify(this.modelConfig)}`);
    }

    async sendMessage(
        request: ChatApiRequest,
        modelIdentifier: string,
    ): Promise<AdapterResponsePayload> {
        const messageContent = request.message || '';

        // Check for continuation simulation
        if (messageContent.includes("Partial echo due to max_tokens")) {
            const completionContent = "This is the continued content.";
            
            // Calculate tokens for both prompt and completion
            const promptMessage: MessageForTokenCounting = { role: 'user', content: messageContent };
            const completionMessage: MessageForTokenCounting = { role: 'assistant', content: completionContent };
            
            const promptTokens = countTokensForMessages([promptMessage], this.modelConfig);
            const completionTokens = countTokensForMessages([completionMessage], this.modelConfig);

            return {
                role: 'assistant',
                content: completionContent,
                ai_provider_id: this.providerId,
                system_prompt_id: null,
                token_usage: {
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: promptTokens + completionTokens,
                },
                finish_reason: 'stop',
            };
        }

        this.logger.info(`[DummyAdapter] sendMessage called for model: ${modelIdentifier}`);

        if (messageContent.includes('SIMULATE_ERROR')) {
            this.logger.warn(`[DummyAdapter] SIMULATE_ERROR keyword found. Throwing test error.`);
            throw new Error('Simulated adapter error for testing retry logic.');
        }
        
        let content = `Echo from ${modelIdentifier}: ${messageContent.replace(/SIMULATE_MAX_TOKENS|SIMULATE_LARGE_OUTPUT_KB=\d+/g, '').trim()}`;
        let finishReason: 'stop' | 'max_tokens' = 'stop';

        if (messageContent.includes('SIMULATE_MAX_TOKENS')) {
            this.logger.warn(`[DummyAdapter] SIMULATE_MAX_TOKENS keyword found. Simulating partial response.`);
            finishReason = 'max_tokens';
            const cleanMessage = messageContent.replace(/SIMULATE_MAX_TOKENS|SIMULATE_LARGE_OUTPUT_KB=\d+/g, '').trim();
            content = `Partial echo due to max_tokens from ${modelIdentifier}: ${cleanMessage}`;
        } else if (messageContent.includes('SIMULATE_LARGE_OUTPUT_KB=')) {
            const match = messageContent.match(/SIMULATE_LARGE_OUTPUT_KB=(\d+)/);
            if (match && match[1]) {
                const targetKb = parseInt(match[1], 10);
                const targetBytes = targetKb * 1024;
                this.logger.warn(`[DummyAdapter] SIMULATE_LARGE_OUTPUT_KB=${targetKb} keyword found. Generating ~${targetKb}KB of text.`);
                
                let largeContent = `Large output simulation from ${modelIdentifier}:\n`;
                const baseMessage = messageContent.replace(/SIMULATE_LARGE_OUTPUT_KB=\d+\s*|SIMULATE_MAX_TOKENS/g, '').trim();

                while (new TextEncoder().encode(largeContent).length < targetBytes) {
                    largeContent += baseMessage + '\n';
                }
                content = largeContent;
                finishReason = 'stop';
            }
        }

        // 4. Simulate a context window error for oversized input
        const maxTokens = this.modelConfig.max_context_window_tokens || this.modelConfig.context_window_tokens;
        const initialTokenCount = countTokensForMessages(request.messages || [{ role: 'user', content: request.message }], this.modelConfig);

        if (maxTokens && initialTokenCount > maxTokens) {
             this.logger.warn(`[DummyAdapter] Input tokens (${initialTokenCount}) exceed model limit (${maxTokens}). Simulating a context window error.`);
             throw new ContextWindowError(`The model's context window is ${maxTokens} tokens. Your request has ${initialTokenCount} tokens.`);
        }
        
        // --- Default Behavior ---
        return this.createResponse(request, content, finishReason);
    }

    private createResponse(
        request: ChatApiRequest,
        content: string,
        finish_reason: 'stop' | 'max_tokens'
    ): AdapterResponsePayload {
        const promptMessages: MessageForTokenCounting[] = request.messages || [{ role: 'user', content: request.message }];
        const completionMessage: MessageForTokenCounting = { role: 'assistant', content };

        const promptTokens = countTokensForMessages(promptMessages, this.modelConfig);
        const completionTokens = countTokensForMessages([completionMessage], this.modelConfig);

        const tokenUsage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
        };
        
        const assistantResponse: AdapterResponsePayload = {
            role: 'assistant',
            content,
            ai_provider_id: this.providerId, 
            system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
            token_usage: tokenUsage,
            finish_reason,
        };

        this.logger.info(`[DummyAdapter] sendMessage successful with finish_reason: '${finish_reason}'`, { response: assistantResponse });
        return assistantResponse;
    }

    async listModels(): Promise<ProviderModelInfo[]> {
        const modelInfo: ProviderModelInfo = {
            api_identifier: 'dummy-model-v1',
            name: `Dummy Model (Echo)`,
            description: `A dummy AI model for testing purposes. It echoes back the user's message.`,
            config: this.modelConfig,
        };
        this.logger.info('[DummyAdapter] listModels called', { modelInfo });
        return [modelInfo];
    }
}
