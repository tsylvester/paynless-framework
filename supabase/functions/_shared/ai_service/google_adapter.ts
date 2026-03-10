// supabase/functions/_shared/ai_service/google_adapter.ts
import {
    GoogleGenerativeAI,
    type Content,
    type ModelParams,
    type GenerateContentResult,
    type Part,
} from "npm:@google/generative-ai";
import type {
    ProviderModelInfo,
    ChatApiRequest,
    AdapterResponsePayload,
    ILogger,
    AiModelExtendedConfig,
} from '../types.ts';
import type { Json, Tables } from '../../../functions/types_db.ts';
import { isJson, isAiModelExtendedConfig } from '../utils/type_guards.ts';

/**
 * Implements AiProviderAdapter for Google Gemini models using the official SDK.
 */
export class GoogleAdapter {
    private client: GoogleGenerativeAI;
    private logger: ILogger;
    private modelConfig: AiModelExtendedConfig;
    private apiKey: string;

    constructor(
        provider: Tables<'ai_providers'>,
        apiKey: string,
        logger: ILogger
    ) {
        if(!isJson(provider.config)) {
            throw new Error('provider.config is not a valid JSON object');
        }
        if(!isAiModelExtendedConfig(provider.config)) {
            throw new Error('provider.config is not a valid AiModelExtendedConfig object');
        }
        this.client = new GoogleGenerativeAI(apiKey);
        this.logger = logger;
        this.modelConfig = provider.config;
        this.apiKey = apiKey;
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
        const history: Content[] = [];

        const combinedMessages = [...(request.messages ?? [])];
        if (request.message) {
            combinedMessages.push({ role: 'user', content: request.message });
        }

        for (const message of combinedMessages) {
            if (message.role === 'system' && message.content) {
                // System prompt is handled by the model's `startChat` method if needed,
                // but this implementation does not currently use it.
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
            generationConfig: (() => {
                const clientCap = typeof request.max_tokens_to_generate === 'number' ? request.max_tokens_to_generate : undefined;
                const modelHardCap = typeof this.modelConfig.hard_cap_output_tokens === 'number'
                    ? (this.modelConfig).hard_cap_output_tokens
                    : undefined;
                const cap = typeof clientCap === 'number' ? clientCap : modelHardCap;
                return typeof cap === 'number' ? { maxOutputTokens: cap } : undefined;
            })(),
        });

        let finalParts: Part[] = [...lastMessage.parts];
        if (request.resourceDocuments && request.resourceDocuments.length > 0) {
            const documentParts: Part[] = [];
            for (const doc of request.resourceDocuments) {
                const label = `[Document: ${doc.document_key} from ${doc.stage_slug}]`;
                documentParts.push({ text: label });
                documentParts.push({ text: doc.content });
            }
            finalParts = [...documentParts, ...lastMessage.parts];
        }

        const result: GenerateContentResult = await chat.sendMessage(finalParts);
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

    // Overload for sync script to get raw data
    async listModels(getRaw: true): Promise<{ models: ProviderModelInfo[], raw: unknown }>;
    // Overload for standard adapter contract
    async listModels(getRaw?: false): Promise<ProviderModelInfo[]>;
    // Implementation
    async listModels(getRaw?: boolean): Promise<ProviderModelInfo[] | { models: ProviderModelInfo[], raw: unknown }> {
        this.logger.info('[GoogleAdapter] Fetching models from Google AI...');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorBody = await response.text();
                this.logger.error(`[GoogleAdapter] Error fetching models from Google AI: ${response.status} ${response.statusText}`, { errorBody });
                throw new Error(`Failed to fetch models from Google AI: ${response.statusText}`);
            }
            
            const data = await response.json();
            const models: ProviderModelInfo[] = [];

            if (data && Array.isArray(data.models)) {
                for (const model of data.models) {
                    const modelId = `google-${model.name.replace('models/', '')}`;
                    
                    if (model.supportedGenerationMethods?.includes('generateContent')) {
                        // The adapter should only pass on information it gets directly from the API.
                        // The sync function's ConfigAssembler will handle merging this with other data sources.
                        const config: Partial<AiModelExtendedConfig> = {
                            provider_max_input_tokens: model.inputTokenLimit,
                            provider_max_output_tokens: model.outputTokenLimit,
                        };
                        
                        models.push({
                            api_identifier: modelId,
                            name: model.displayName,
                            description: model.description,
                            config: config,
                        });
                    }
                }
            }
            
            this.logger.info(`[GoogleAdapter] Found ${models.length} usable models from Google AI.`);
            
            if (getRaw) {
                return { models, raw: data.models };
            }
            return models;

        } catch (error) {
            if (error instanceof Error) {
                this.logger.error(`[GoogleAdapter] An unexpected error occurred while fetching Google models: ${error.message}`, { error });
            } else {
                this.logger.error('[GoogleAdapter] An unexpected and unknown error occurred while fetching Google models.', { error });
            }
            // Return empty array on failure to prevent sync from completely failing,
            // though this will result in deactivation if there are existing models.
            // A more robust implementation might throw to halt the sync process.
            if (getRaw) {
                return { models: [], raw: { error: 'Failed to fetch' } };
            }
            return [];
        }
    }
}
