import OpenAI from 'npm:openai';
import type { ChatCompletionMessageParam } from 'npm:openai/resources/chat/completions';
import type { AiProviderAdapter, ProviderModelInfo, ChatApiRequest, AdapterResponsePayload, ILogger, AiModelExtendedConfig } from '../types.ts';
import type { Json } from '../../../functions/types_db.ts';

/**
 * Implements AiProviderAdapter for OpenAI models.
 */
export class OpenAiAdapter implements AiProviderAdapter {
  private client: OpenAI;

  constructor(apiKey: string, private logger: ILogger) {
    this.client = new OpenAI({ apiKey });
  }

  async sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string,
  ): Promise<AdapterResponsePayload> {
    this.logger.debug('[OpenAiAdapter] sendMessage called', { modelIdentifier });
    const modelApiName = modelIdentifier.replace(/^openai-/i, '');

    const openaiMessages: ChatCompletionMessageParam[] = (request.messages ?? []).map(msg => ({
      role: msg.role,
      content: msg.content,
    })).filter(msg => msg.content) as ChatCompletionMessageParam[];

    if (request.message) {
      openaiMessages.push({ role: 'user', content: request.message });
    }

    const payload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: modelApiName,
      messages: openaiMessages,
    };

    if (request.max_tokens_to_generate && request.max_tokens_to_generate > 0) {
      payload.max_tokens = request.max_tokens_to_generate;
    }

    this.logger.info(`Sending request to OpenAI model: ${modelApiName}`);
    
    try {
      const completion = await this.client.chat.completions.create(payload);
      
      const choice = completion.choices?.[0];
      const aiContent = choice?.message?.content?.trim();
      
      if (!aiContent) {
        this.logger.error("OpenAI response missing message content:", { response: completion, modelApiName });
        throw new Error('OpenAI response content is empty or missing.');
      }

      const finishReason = choice?.finish_reason;
      let finish_reason: AdapterResponsePayload['finish_reason'];

      switch (finishReason) {
        case 'stop':
          finish_reason = 'stop';
          break;
        case 'length':
          finish_reason = 'length';
          break;
        case 'tool_calls':
          finish_reason = 'tool_calls';
          break;
        case 'content_filter':
          finish_reason = 'content_filter';
          break;
        case 'function_call':
          finish_reason = 'function_call';
          break;
        default:
          finish_reason = 'unknown';
          if (finishReason) {
              this.logger.warn(`OpenAI returned an unknown finish reason: ${finishReason}`, { modelApiName, finishReason });
          }
          break;
      }
      
      const tokenUsage = completion.usage ? {
        prompt_tokens: completion.usage.prompt_tokens,
        completion_tokens: completion.usage.completion_tokens,
        total_tokens: completion.usage.total_tokens,
      } : null;

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
      this.logger.error(`Error sending message to OpenAI: ${(error as Error).message}`, { modelApiName, error });
      throw error;
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    this.logger.info("[OpenAiAdapter] Fetching models from OpenAI...");

    try {
      const modelsPage = await this.client.models.list();
      const models: ProviderModelInfo[] = [];

      for (const model of modelsPage.data) {
        if (model.id && (model.id.includes('gpt') || model.id.includes('instruct'))) {
          const config: Partial<AiModelExtendedConfig> = {};

          // Note: The OpenAI SDK's model object does not expose context_window directly.
          // This information might need to be hardcoded or managed elsewhere if needed.

          models.push({
            api_identifier: `openai-${model.id}`,
            name: `OpenAI ${model.id}`,
            description: `Owned by: ${model.owned_by}`,
            config: Object.keys(config).length > 0 ? config as Json : undefined,
          });
        }
      }
      
      this.logger.info(`[OpenAiAdapter] Found ${models.length} potentially usable models from OpenAI.`);
      return models;
    } catch(error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(`[OpenAiAdapter] OpenAI API error fetching models (${error.status}): ${error.message}`, { status: error.status });
      } else {
        this.logger.error(`[OpenAiAdapter] Error fetching models: ${(error as Error).message}`, { error });
      }
      throw new Error(`Failed to fetch models from OpenAI.`);
    }
  }
} 