import type { ProviderModelInfo, ChatApiRequest, AdapterResponsePayload, ILogger, AiModelExtendedConfig, MessageForTokenCounting } from '../types.ts';
import { countTokensForMessages } from '../utils/tokenizer_utils.ts';

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

    constructor(
        apiKey: string,
        logger: ILogger,
        modelConfig: AiModelExtendedConfig
    ) {
        this.apiKey = apiKey; // Stored for interface consistency, but not used.
        this.logger = logger;
        this.modelConfig = modelConfig; // Stored for interface consistency.
        this.logger.info(`[DummyAdapter] Initialized with config: ${JSON.stringify(this.modelConfig)}`);
    }

    async sendMessage(
        request: ChatApiRequest,
        modelIdentifier: string,
    ): Promise<AdapterResponsePayload> {
        this.logger.info(`[DummyAdapter] sendMessage called for model: ${modelIdentifier}`);

        const responseContent = `Echo from ${modelIdentifier}: ${request.message || 'No message provided'}`;

        // Use the application's standard tokenizer to calculate token usage.
        const promptMessages: MessageForTokenCounting[] = request.messages || [{ role: 'user', content: request.message }];
        const completionMessage: MessageForTokenCounting = { role: 'assistant', content: responseContent };

        const promptTokens = countTokensForMessages(promptMessages, this.modelConfig);
        const completionTokens = countTokensForMessages([completionMessage], this.modelConfig);

        const tokenUsage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
        };
        
        const assistantResponse: AdapterResponsePayload = {
            role: 'assistant',
            content: responseContent,
            ai_provider_id: request.providerId, 
            system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
            token_usage: tokenUsage,
            finish_reason: 'stop',
        };

        this.logger.info('[DummyAdapter] sendMessage successful', { response: assistantResponse });
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
