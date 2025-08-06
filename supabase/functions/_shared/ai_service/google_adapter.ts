// supabase/functions/_shared/ai_service/google_adapter.ts
import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
    type Content,
    type ModelParams,
    type GenerateContentResult,
} from "npm:@google/generative-ai";
import type {
    ProviderModelInfo,
    ChatApiRequest,
    AdapterResponsePayload,
    ILogger,
    AiModelExtendedConfig,
} from '../types.ts';
import type { Json } from '../../../functions/types_db.ts';

/**
 * Implements AiProviderAdapter for Google Gemini models using the official SDK.
 */
export class GoogleAdapter {
    private client: GoogleGenerativeAI;
    private logger: ILogger;
    private modelConfig: AiModelExtendedConfig;

    constructor(
        apiKey: string,
        logger: ILogger,
        modelConfig: AiModelExtendedConfig
    ) {
        this.client = new GoogleGenerativeAI(apiKey);
        this.logger = logger;
        this.modelConfig = modelConfig;
        this.logger.info(`[GoogleAdapter] Initialized with config: ${JSON.stringify(this.modelConfig)}`);
    }

    async sendMessage(
        request: ChatApiRequest,
        modelIdentifier: string, // e.g., "google-gemini-1.5-pro-latest"
    ): Promise<AdapterResponsePayload> {
        const modelApiName = modelIdentifier.replace(/^google-/i, '');
        this.logger.debug('[GoogleAdapter] sendMessage called', { modelApiName });

        const modelParams: ModelParams = {
            model: modelApiName,
            // Safety settings can be configured here if needed
            // safetySettings: [
            //     { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            // ],
        };

        const model = this.client.getGenerativeModel(modelParams);

        // --- Map messages to Google Gemini format ---
        let systemPrompt = '';
        const history: Content[] = [];

        const combinedMessages = [...(request.messages ?? [])];
        if (request.message) {
            combinedMessages.push({ role: 'user', content: request.message });
        }

        for (const message of combinedMessages) {
            if (message.role === 'system' && message.content) {
                systemPrompt = message.content;
            } else if (message.role === 'user' && message.content) {
                history.push({ role: 'user', parts: [{ text: message.content }] });
            } else if (message.role === 'assistant' && message.content) {
                history.push({ role: 'model', parts: [{ text: message.content }] });
            }
        }

        const lastMessage = history.pop();
        if (!lastMessage || lastMessage.role !== 'user') {
            this.logger.error('Google Gemini request format error: History must end with a user message.', { history });
            throw new Error('Cannot send request to Google Gemini: message history format invalid.');
        }

        const chat = model.startChat({
            history: history,
            // generationConfig can be set here if needed
            // generationConfig: { maxOutputTokens: request.max_tokens_to_generate },
        });

        const result: GenerateContentResult = await chat.sendMessage(lastMessage.parts);
        const response = result.response;
        const candidate = response.candidates?.[0];

        const assistantMessageContent = response.text().trim();

        const tokenUsage: Json | null = response.usageMetadata
            ? {
                prompt_tokens: response.usageMetadata.promptTokenCount || 0,
                completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
                total_tokens: response.usageMetadata.totalTokenCount || 0,
            }
            : null;

        let finish_reason: AdapterResponsePayload['finish_reason'] = 'unknown';
        if (candidate?.finishReason) {
            switch (candidate.finishReason) {
                case 'STOP':
                    finish_reason = 'stop';
                    break;
                case 'MAX_TOKENS':
                    finish_reason = 'length';
                    break;
                case 'SAFETY':
                case 'RECITATION':
                    finish_reason = 'content_filter';
                    break;
                default:
                    finish_reason = 'unknown';
                    break;
            }
        }

        const adapterResponse: AdapterResponsePayload = {
            role: 'assistant',
            content: assistantMessageContent,
            ai_provider_id: request.providerId,
            system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
            token_usage: tokenUsage,
            finish_reason: finish_reason,
        };
        
        this.logger.debug('[GoogleAdapter] sendMessage successful', { modelApiName });
        return adapterResponse;
    }

    async listModels(): Promise<ProviderModelInfo[]> {
        // The Google AI SDK does not currently have a public method for listing models
        // that is compatible with API key authentication in a server-side environment.
        // The `listModels` function in the SDK is designed for client-side (e.g., Google AI Studio) use.
        // Therefore, we will leave this method as a placeholder and note that model
        // syncing for Google must be done manually or via a different mechanism.
        this.logger.warn('[GoogleAdapter] listModels is not implemented due to SDK limitations for API key authentication.');
        return Promise.resolve([]);
    }
}
