import Anthropic from 'npm:@anthropic-ai/sdk';
import type { MessageParam } from 'npm:@anthropic-ai/sdk/resources/messages';
// Import types from the shared location
import type { AdapterResponsePayload, AiProviderAdapter, ChatApiRequest, ILogger, ProviderModelInfo } from '../types.ts';
import type { Database } from '../../types_db.ts';


// Anthropic API constants
const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
// It is strongly recommended to use the latest version, check Anthropic docs
const ANTHROPIC_VERSION = '2023-06-01'; 

// Minimal interface for Anthropic Model items
interface AnthropicModelItem {
  id: string;
  name?: string;
  // Add other potential fields if needed
  [key: string]: unknown; // Allow other fields but treat as unknown
}


/**
 * Implements AiProviderAdapter for Anthropic models (Claude).
 */
export class AnthropicAdapter implements AiProviderAdapter {
  private client: Anthropic;
  private apiKey: string;

  constructor(apiKey: string, private logger: ILogger) {
    this.client = new Anthropic({ apiKey });
    this.apiKey = apiKey;
  }

  async sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string
  ): Promise<AdapterResponsePayload> {
    this.logger.debug('[AnthropicAdapter] sendMessage called', { modelIdentifier });
    const modelApiName = modelIdentifier.replace(/^anthropic-/i, '');
    let systemPrompt = '';
    const anthropicMessages: MessageParam[] = [];
    const combinedMessages = [...(request.messages ?? [])];
    if (request.message) {
        combinedMessages.push({ role: 'user', content: request.message });
    }
    
    const preliminaryMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const message of combinedMessages) {
        if (message.role === 'system' && message.content) {
            systemPrompt = message.content;
        } else if ((message.role === 'user' || message.role === 'assistant') && message.content) {
            preliminaryMessages.push({ role: message.role, content: message.content as string});
        }
    }

    let expectedRole: 'user' | 'assistant' = 'user';
    for (const message of preliminaryMessages) {
        if (message.role === expectedRole) {
            anthropicMessages.push(message);
            expectedRole = (expectedRole === 'user') ? 'assistant' : 'user';
        } else {
             this.logger.warn(`Skipping message with role '${message.role}' because '${expectedRole}' was expected.`, { currentMessage: message, expectedRole });
        }
    }

    if (anthropicMessages.length === 0) {
        this.logger.error('Anthropic request format error: No valid user/assistant messages found after filtering.', { modelApiName });
        throw new Error('Cannot send request to Anthropic: No valid messages to send.');
    }

    if (anthropicMessages[anthropicMessages.length - 1].role !== 'user') {
        this.logger.error('Anthropic request format error: Last message must be from user after filtering.', { anthropicMessages, modelApiName });
        throw new Error('Cannot send request to Anthropic: message history format invalid.');
    }

    const maxTokensForPayload = 
        (request.max_tokens_to_generate && request.max_tokens_to_generate > 0) 
        ? request.max_tokens_to_generate 
        : 4096;

    try {
      const response = await this.client.messages.create({
        model: modelApiName,
        system: systemPrompt || undefined,
        messages: anthropicMessages,
        max_tokens: maxTokensForPayload,
      });

      const assistantMessageContent =
        response.content?.[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';

      if (!assistantMessageContent) {
          this.logger.error("Anthropic response missing message content:", { response: response, modelApiName });
          throw new Error("Received empty response from Anthropic.");
      }

      const tokenUsage: Database['public']['Tables']['chat_messages']['Row']['token_usage'] = response.usage ? {
          prompt_tokens: response.usage.input_tokens,  
          completion_tokens: response.usage.output_tokens, 
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
      } : null;

      let finish_reason: AdapterResponsePayload['finish_reason'] = 'unknown';
      if (response.stop_reason) {
        switch (response.stop_reason) {
          case 'end_turn':
          case 'stop_sequence':
            finish_reason = 'stop';
            break;
          case 'max_tokens':
            finish_reason = 'length';
            break;
          case 'tool_use':
            finish_reason = 'tool_calls';
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
      this.logger.debug('[AnthropicAdapter] sendMessage successful', { modelApiName });
      return adapterResponse;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic API error (${error.status}): ${error.message}`, { modelApiName, status: error.status });
        throw new Error(`Anthropic API request failed: ${error.status} ${error.name}`);
      }
      this.logger.error(`Error sending message to Anthropic: ${(error as Error).message}`, { modelApiName, error });
      throw error;
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    const modelsUrl = `${ANTHROPIC_API_BASE}/models`;
    this.logger.info("[AnthropicAdapter] Fetching models from Anthropic...", { url: modelsUrl });

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION, 
      },
    });
    this.logger.debug(`[AnthropicAdapter] After fetch call for models (Status: ${response.status})`);

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`[AnthropicAdapter] Anthropic API error fetching models (${response.status}): ${errorBody}`, { status: response.status });
      throw new Error(`Anthropic API request failed fetching models: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();
    this.logger.debug("[AnthropicAdapter] After response.json() call for models");
    
    if (!jsonResponse?.data || !Array.isArray(jsonResponse.data)) {
        this.logger.error("[AnthropicAdapter] listModels response missing or invalid 'data' array:", { response: jsonResponse });
        throw new Error("Invalid response format received from Anthropic models API.");
    }

    const models: ProviderModelInfo[] = jsonResponse.data.map((item: AnthropicModelItem) => ({
        api_identifier: `anthropic-${item.id}`,
        name: item.name || item.id,
        description: undefined
    }));

    this.logger.info(`[AnthropicAdapter] Found ${models.length} models from Anthropic dynamically.`);
    return models;
  }
}