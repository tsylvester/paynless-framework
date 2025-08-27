import type { ProviderModelInfo, ChatApiRequest, AdapterResponsePayload, ILogger, AiModelExtendedConfig, Messages, EmbeddingResponse } from '../types.ts';
import { countTokens } from '../utils/tokenizer_utils.ts';
import type { CountTokensDeps, CountableChatPayload } from '../types/tokenizer.types.ts';
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
            
            // Calculate tokens for both prompt and completion using full-payload triple-arg API
            const tokenizerDeps: CountTokensDeps = {
                getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
                countTokensAnthropic: (text: string) => (text ?? '').length,
                logger: this.logger,
            };

            const promptPayload: CountableChatPayload = { message: messageContent, messages: [] };
            const completionPayload: CountableChatPayload = { messages: [{ role: 'assistant', content: completionContent }] };

            const promptTokens = countTokens(tokenizerDeps, promptPayload, this.modelConfig);
            const completionTokens = countTokens(tokenizerDeps, completionPayload, this.modelConfig);

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
        const maxTokens = this.modelConfig.context_window_tokens || this.modelConfig.context_window_tokens;
        const tokenizerDeps: CountTokensDeps = {
            getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
            countTokensAnthropic: (text: string) => (text ?? '').length,
            logger: this.logger,
        };
        const narrowedMessages: Messages[] = (request.messages || [])
            .filter((m) => (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
        const initialPayload: CountableChatPayload = narrowedMessages.length > 0
            ? { messages: narrowedMessages }
            : { message: request.message, messages: [] };
        const initialTokenCount = countTokens(tokenizerDeps, initialPayload, this.modelConfig);

        if (maxTokens && initialTokenCount > maxTokens) {
             this.logger.warn(`[DummyAdapter] Input tokens (${initialTokenCount}) exceed model limit (${maxTokens}). Simulating a context window error.`);
             throw new ContextWindowError(`The model's context window is ${maxTokens} tokens. Your request has ${initialTokenCount} tokens.`);
        }
        
        // Apply output caps from request or model config
        const completionTokenizerDeps: CountTokensDeps = {
            getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
            countTokensAnthropic: (text: string) => (text ?? '').length,
            logger: this.logger,
        };

        const clientCap = (typeof request.max_tokens_to_generate === 'number' && request.max_tokens_to_generate > 0)
            ? request.max_tokens_to_generate
            : undefined;
        const modelHardCap = (typeof this.modelConfig.hard_cap_output_tokens === 'number' && this.modelConfig.hard_cap_output_tokens > 0)
            ? this.modelConfig.hard_cap_output_tokens
            : undefined;
        const capTokens = clientCap ?? modelHardCap;

        if (typeof capTokens === 'number' && capTokens >= 0) {
            // Truncate completion content by measured token count using binary search
            const completionPayloadFor = (text: string): CountableChatPayload => ({ messages: [{ role: 'assistant', content: text }] });
            const initialTokens = countTokens(completionTokenizerDeps, completionPayloadFor(content), this.modelConfig);
            if (initialTokens > capTokens) {
                let left = 0;
                let right = content.length;
                let best = 0;
                while (left <= right) {
                    const mid = Math.floor((left + right) / 2);
                    const candidate = content.slice(0, mid);
                    const t = countTokens(completionTokenizerDeps, completionPayloadFor(candidate), this.modelConfig);
                    if (t <= capTokens) {
                        best = mid;
                        left = mid + 1;
                    } else {
                        right = mid - 1;
                    }
                }
                content = content.slice(0, best);
                finishReason = 'max_tokens';
            }
        }

        // --- Default Behavior ---
        return this.createResponse(request, content, finishReason);
    }

    private createResponse(
        request: ChatApiRequest,
        content: string,
        finish_reason: 'stop' | 'max_tokens'
    ): AdapterResponsePayload {
        const tokenizerDeps: CountTokensDeps = {
            getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
            countTokensAnthropic: (text: string) => (text ?? '').length,
            logger: this.logger,
        };
        const promptPayload: CountableChatPayload = { message: request.message, messages: [] };
        const completionPayload: CountableChatPayload = { messages: [{ role: 'assistant', content }] };

        const promptTokens = countTokens(tokenizerDeps, promptPayload, this.modelConfig);
        const completionTokens = countTokens(tokenizerDeps, completionPayload, this.modelConfig);

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

    async getEmbedding(text: string): Promise<EmbeddingResponse> {
        this.logger.info('[DummyAdapter] getEmbedding called');

        // Compute usage via tokenizer to remain consistent with the rest of the stack
        const tokenizerDeps: CountTokensDeps = {
            getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
            countTokensAnthropic: (t: string) => (t ?? '').length,
            logger: this.logger,
        };
        const payload = { message: text, messages: [] } satisfies CountableChatPayload;
        const promptTokens = countTokens(tokenizerDeps, payload, this.modelConfig);

        // Deterministic, offline embedding (no network). Small, fixed dimension.
        const DIMENSION = 32;
        const vector: number[] = Array.from({ length: DIMENSION }, () => 0);

        // Simple character-accumulation hash for determinism
        for (let i = 0; i < text.length; i++) {
            const codePoint = text.codePointAt(i);
            if (codePoint === undefined) continue;
            const idx = codePoint % DIMENSION;
            // Mix in a few bits to avoid trivial collisions for repeated chars
            const mixed = ((codePoint << 5) - codePoint) ^ (i * 1315423911);
            vector[idx] += (mixed % 1000) / 1000; // keep values small and stable
            // If surrogate pair, skip the next unit to avoid double-counting
            if (codePoint > 0xffff) i++;
        }

        // Optional L2 normalization for bounded magnitude
        let norm = 0;
        for (let i = 0; i < DIMENSION; i++) norm += vector[i] * vector[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < DIMENSION; i++) vector[i] = vector[i] / norm;

        return {
            embedding: vector,
            usage: {
                prompt_tokens: promptTokens,
                total_tokens: promptTokens,
            },
        };
    }
}
