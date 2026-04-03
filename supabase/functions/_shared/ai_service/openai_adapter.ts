import OpenAI from 'npm:openai';
import type { ChatCompletionChunk, ChatCompletionMessageParam } from 'npm:openai/resources/chat/completions';
import type { ProviderModelInfo, ChatApiRequest, AdapterResponsePayload, AdapterStreamChunk, FinishReason, ILogger, AiModelExtendedConfig, EmbeddingResponse } from '../types.ts';
import type { Tables } from '../../types_db.ts';
import { isJson, isAiModelExtendedConfig } from '../utils/type_guards.ts';
import { isResourceDocument } from '../utils/type-guards/type_guards.chat.ts';


/**
 * Implements AiProviderAdapter for OpenAI models.
 */
export class OpenAiAdapter {
  private client: OpenAI;
  private logger: ILogger;
  private modelConfig: AiModelExtendedConfig;

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
    this.client = new OpenAI({ apiKey });
    this.logger = logger;
    this.modelConfig = provider.config;
    this.logger.info(`[OpenAiAdapter] Initialized with config: ${JSON.stringify(this.modelConfig)}`);
  }

  /**
   * Shared payload for `sendMessage` and `sendMessageStream` (validation + streaming chat.completions params).
   */
  private _prepareOpenAiStreamingRequest(
    request: ChatApiRequest,
    modelIdentifier: string,
  ): {
    modelApiName: string;
    payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
  } {
    const modelApiName = modelIdentifier.replace(/^openai-/i, '');

    const configApiName = this.modelConfig.api_identifier.replace(/^openai-/i, '');
    if (modelApiName !== configApiName) {
      throw new Error(`[OpenAiAdapter] Model mismatch: requested '${modelApiName}' but adapter is configured for '${configApiName}'.`);
    }

    const maxInputTokens = this.modelConfig.provider_max_input_tokens || this.modelConfig.context_window_tokens;
    if (maxInputTokens) {
      // const tokenCount = countTokens(request.messages, this.modelConfig); // PSEUDO-CODE
    }

    const openaiMessages: ChatCompletionMessageParam[] = (request.messages ?? []).map((msg): ChatCompletionMessageParam => ({
      role: msg.role,
      content: msg.content,
    })).filter(msg => msg.content);

    if (request.resourceDocuments && request.resourceDocuments.length > 0) {
      const docParts: string[] = request.resourceDocuments.map((doc) => {
        if (isResourceDocument(doc)) {
          if (doc.document_key.length === 0) {
            throw new Error('[OpenAiAdapter] ResourceDocument has empty document_key');
          }
          if (doc.stage_slug.length === 0) {
            throw new Error('[OpenAiAdapter] ResourceDocument has empty stage_slug');
          }
          return `[Document: ${doc.document_key} from ${doc.stage_slug}]\n${doc.content}`;
        }
        return `[Document: ${doc.id}]\n${doc.content}`;
      });
      openaiMessages.push({ role: 'user', content: docParts.join('\n\n') });
    }

    if (request.message) {
      openaiMessages.push({ role: 'user', content: request.message });
    }

    const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: modelApiName,
      messages: openaiMessages,
      stream: true,
      stream_options: { include_usage: true },
    };

    const usesLegacyMaxTokens = modelApiName.startsWith('gpt-3.5-turbo') || modelApiName.startsWith('gpt-4-turbo') || modelApiName === 'gpt-4';
    const applyCap = (cap: number) => {
      if (!(cap > 0)) return;
      if (usesLegacyMaxTokens) {
        payload.max_tokens = cap;
      } else {
        payload.max_completion_tokens = cap;
      }
    };

    if (typeof request.max_tokens_to_generate === 'number') {
      applyCap(request.max_tokens_to_generate);
    } else {
      const hardCap = this.modelConfig.hard_cap_output_tokens;
      const providerCap = this.modelConfig.provider_max_output_tokens;
      const candidates: number[] = [];
      if (typeof hardCap === 'number' && hardCap > 0) candidates.push(hardCap);
      if (typeof providerCap === 'number' && providerCap > 0) candidates.push(providerCap);
      if (candidates.length > 0) {
        const fallbackCap = Math.min(...candidates);
        applyCap(fallbackCap);
      }
    }

    return { modelApiName, payload };
  }

  private _mapOpenAiFinishReason(
    finishReason: ChatCompletionChunk.Choice['finish_reason'] | undefined,
    modelApiName: string,
  ): FinishReason {
    switch (finishReason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      case 'function_call':
        return 'function_call';
      default:
        if (finishReason) {
          this.logger.warn(`OpenAI returned an unknown finish reason: ${finishReason}`, { modelApiName, finishReason });
        }
        return 'unknown';
    }
  }

  async sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string,
  ): Promise<AdapterResponsePayload> {
    this.logger.debug('[OpenAiAdapter] sendMessage called', { modelIdentifier });
    const { modelApiName, payload } = this._prepareOpenAiStreamingRequest(request, modelIdentifier);

    this.logger.info(`Sending request to OpenAI model: ${modelApiName}`);

    try {
      const stream = await this.client.chat.completions.create(payload);

      let assembled: string = '';
      let finishReasonFromStream: ChatCompletionChunk.Choice['finish_reason'] | undefined = undefined;
      let tokenUsageFromStream: ChatCompletionChunk['usage'] = undefined;

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (choice !== undefined) {
          const deltaContent: string | null | undefined = choice.delta?.content;
          if (typeof deltaContent === 'string') {
            assembled += deltaContent;
          }
          if (choice.finish_reason != null) {
            finishReasonFromStream = choice.finish_reason;
          }
        }
        if (chunk.usage != null) {
          tokenUsageFromStream = chunk.usage;
        }
      }

      const aiContent: string | null = assembled.trim() || null;

      if (!aiContent) {
        this.logger.error('OpenAI streamed response has no message content.', { modelApiName });
        throw new Error('OpenAI response content is empty or missing.');
      }

      const finish_reason: FinishReason = this._mapOpenAiFinishReason(
        finishReasonFromStream,
        modelApiName,
      );

      const tokenUsage = tokenUsageFromStream;

      if (!tokenUsage) {
        this.logger.error('[OpenAiAdapter] OpenAI response did not include usage data.', { modelApiName });
        throw new Error('OpenAI response did not include usage data.');
      }
      if (!isJson(tokenUsage)) {
        this.logger.error('[OpenAiAdapter] OpenAI usage data is not a valid JSON object.', { modelApiName, tokenUsage });
        throw new Error('OpenAI usage data is not a valid JSON object.');
      }
      const assistantResponse: AdapterResponsePayload = {
        role: 'assistant',
        content: aiContent,
        ai_provider_id: request.providerId,
        system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
        token_usage: tokenUsage,
        finish_reason: finish_reason,
      };

      this.logger.debug('[OpenAiAdapter] sendMessage successful', { modelApiName });
      return assistantResponse;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(`OpenAI API error (${error.status}): ${error.message}`, { modelApiName, status: error.status });
        throw new Error(`OpenAI API request failed: ${error.status} ${error.name}`);
      }
      if (error instanceof Error) {
        this.logger.error(`Error sending message to OpenAI: ${error.message}`, { modelApiName, error });
      } else {
        this.logger.error(`Error sending message to OpenAI: ${error}`, { modelApiName, error });
      }
      throw error;
    }
  }

  async *sendMessageStream(
    request: ChatApiRequest,
    modelIdentifier: string,
  ): AsyncGenerator<AdapterStreamChunk> {
    this.logger.debug('[OpenAiAdapter] sendMessageStream called', { modelIdentifier });
    const { modelApiName, payload } = this._prepareOpenAiStreamingRequest(request, modelIdentifier);

    this.logger.info(`Sending streaming request to OpenAI model: ${modelApiName}`);

    try {
      const stream = await this.client.chat.completions.create(payload);

      let assembled: string = '';
      let finishReasonFromStream: ChatCompletionChunk.Choice['finish_reason'] | undefined = undefined;
      let tokenUsageFromStream: ChatCompletionChunk['usage'] = undefined;

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (choice !== undefined) {
          const deltaContent: string | null | undefined = choice.delta?.content;
          if (typeof deltaContent === 'string') {
            assembled += deltaContent;
            yield { type: 'text_delta', text: deltaContent };
          }
          if (choice.finish_reason != null) {
            finishReasonFromStream = choice.finish_reason;
          }
        }
        if (chunk.usage != null) {
          tokenUsageFromStream = chunk.usage;
        }
      }

      const aiContent: string | null = assembled.trim() || null;

      if (!aiContent) {
        this.logger.error('OpenAI streamed response has no message content.', { modelApiName });
        throw new Error('OpenAI response content is empty or missing.');
      }

      const tokenUsage = tokenUsageFromStream;

      if (!tokenUsage) {
        this.logger.error('[OpenAiAdapter] OpenAI response did not include usage data.', { modelApiName });
        throw new Error('OpenAI response did not include usage data.');
      }
      if (!isJson(tokenUsage)) {
        this.logger.error('[OpenAiAdapter] OpenAI usage data is not a valid JSON object.', { modelApiName, tokenUsage });
        throw new Error('OpenAI usage data is not a valid JSON object.');
      }

      const promptTokens: number = tokenUsage.prompt_tokens;
      const completionTokens: number = tokenUsage.completion_tokens;
      const totalTokens: number = tokenUsage.total_tokens;

      yield {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
      };

      const mappedFinish: FinishReason = this._mapOpenAiFinishReason(
        finishReasonFromStream,
        modelApiName,
      );

      yield { type: 'done', finish_reason: mappedFinish };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(`OpenAI API error (${error.status}): ${error.message}`, { modelApiName, status: error.status });
        throw new Error(`OpenAI API request failed: ${error.status} ${error.name}`);
      }
      if (error instanceof Error) {
        this.logger.error(`Error sending message to OpenAI: ${error.message}`, { modelApiName, error });
      } else {
        this.logger.error(`Error sending message to OpenAI: ${error}`, { modelApiName, error });
      }
      throw error;
    }
  }

  // Overload for sync script to get raw data
  async listModels(getRaw: true): Promise<{ models: ProviderModelInfo[], raw: unknown }>;
  // Overload for standard adapter contract
  async listModels(getRaw?: false): Promise<ProviderModelInfo[]>;
  // Implementation
  async listModels(getRaw?: boolean): Promise<ProviderModelInfo[] | { models: ProviderModelInfo[], raw: unknown }> {
    this.logger.info("[OpenAiAdapter] Fetching models from OpenAI...");

    try {
      const modelsPage = await this.client.models.list();
      const models: ProviderModelInfo[] = [];

      for (const model of modelsPage.data) {
        if (model.id && (model.id.includes('gpt') || model.id.includes('instruct') || model.id.includes('text-embedding'))) {
          models.push({
            api_identifier: `openai-${model.id}`,
            name: `OpenAI ${model.id}`,
          });
        }
      }
      
      this.logger.info(`[OpenAiAdapter] Found ${models.length} potentially usable models from OpenAI.`);
      
      if (getRaw) {
        return { models, raw: modelsPage.data };
      }
      return models;

    } catch(error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(`[OpenAiAdapter] OpenAI API error fetching models (${error.status}): ${error.message}`, { status: error.status });
      } else {
        if (error instanceof Error) {
          this.logger.error(`[OpenAiAdapter] Error fetching models: ${error.message}`, { error });
        } else {
          this.logger.error(`[OpenAiAdapter] Error fetching models: ${error}`, { error });
        }
      }
      throw new Error(`Failed to fetch models from OpenAI.`);
    }
  }
  
  async getEmbedding(text: string): Promise<EmbeddingResponse> {
    const modelApiName = this.modelConfig.api_identifier.replace(/^openai-/i, '');
    this.logger.info(`[OpenAiAdapter] Getting embedding for text with model ${modelApiName}`);
    try {
      const embeddingResponse = await this.client.embeddings.create({
        model: modelApiName,
        input: text,
        encoding_format: 'float',
      });
      
      if (!embeddingResponse.usage) {
        this.logger.warn('[OpenAiAdapter] OpenAI embedding response did not include usage data.');
        // Handle cases where usage is unexpectedly missing, perhaps return a default or throw
        // For now, we'll construct the response with zeroed usage to prevent crashes downstream.
        return {
            embedding: embeddingResponse.data[0].embedding,
            usage: { prompt_tokens: 0, total_tokens: 0 },
        };
      }

      this.logger.debug('[OpenAiAdapter] getEmbedding successful');
      return {
        embedding: embeddingResponse.data[0].embedding,
        usage: {
            prompt_tokens: embeddingResponse.usage.prompt_tokens,
            total_tokens: embeddingResponse.usage.total_tokens,
        },
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(`[OpenAiAdapter] OpenAI API error getting embedding (${error.status}): ${error.message}`, { status: error.status });
        throw new Error(`OpenAI API request failed: ${error.status} ${error.name}`);
      }
      if (error instanceof Error) {
        this.logger.error(`[OpenAiAdapter] Error getting embedding: ${error.message}`, { error });
      } else {
        this.logger.error(`[OpenAiAdapter] Error getting embedding: ${error}`, { error });
      }
      throw error;
    }
  }
}
