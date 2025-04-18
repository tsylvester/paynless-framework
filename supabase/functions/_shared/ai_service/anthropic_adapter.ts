// Removed direct package import
// import { Json } from "../../../../packages/types/src/index.ts";

// Import types from the shared location
import type { AiProviderAdapter, ChatMessage, ProviderModelInfo, ChatApiRequest, Json } from '../types.ts';

// --- Removed Type Definitions (Copied from packages/types for Edge Function compatibility) ---
// export type Json = ... (definitions removed)
// export interface ChatMessage { ... } (definitions removed)
// export interface ChatApiRequest { ... } (definitions removed)
// export interface ProviderModelInfo { ... } (definitions removed)
// export interface AiProviderAdapter { ... } (definitions removed)
// --- End Removed Type Definitions ---

// Anthropic API constants
const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
// It is strongly recommended to use the latest version, check Anthropic docs
const ANTHROPIC_VERSION = '2023-06-01'; 

/**
 * Implements AiProviderAdapter for Anthropic models (Claude).
 */
export class AnthropicAdapter implements AiProviderAdapter {

  async sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string, // e.g., "anthropic-claude-3-opus-20240229"
    apiKey: string
  ): Promise<ChatMessage> {
    const messagesUrl = `${ANTHROPIC_API_BASE}/messages`;
    // Remove the provider prefix for the API call
    const modelApiName = modelIdentifier.replace(/^anthropic-/i, '');

    // --- Map messages to Anthropic format ---
    // Anthropic requires alternating user/assistant roles.
    // It uses a separate 'system' parameter for the system prompt.
    let systemPrompt = '';
    const anthropicMessages: { role: 'user' | 'assistant'; content: string }[] = [];

    // Assuming request.messages contains history + system prompt if applicable
    // We need to filter and structure correctly.
    // A more robust implementation might fetch history separately.
    let combinedMessages = [...request.messages];
    if (request.message) {
        combinedMessages.push({ role: 'user', content: request.message });
    }

    let lastRole: 'user' | 'assistant' | 'system' | null = null;
    for (const message of combinedMessages) {
        if (message.role === 'system' && message.content) {
            // Anthropic uses a top-level system parameter
            systemPrompt = message.content;
            lastRole = 'system';
        } else if (message.role === 'user') {
            // Ensure alternating roles - skip consecutive user messages if needed
            if (lastRole !== 'user') {
                anthropicMessages.push({ role: 'user', content: message.content });
                lastRole = 'user';
            }
            // else { console.warn('Skipping consecutive user message for Anthropic format.'); }
        } else if (message.role === 'assistant') {
             // Ensure alternating roles - skip consecutive assistant messages if needed
            if (lastRole !== 'assistant') {
                anthropicMessages.push({ role: 'assistant', content: message.content });
                lastRole = 'assistant';
            }
             // else { console.warn('Skipping consecutive assistant message for Anthropic format.'); }
        }
    }

    // Anthropic API requires the last message to be from the user.
    // If the last message in history wasn't 'user', this might need adjustment
    // or the filtering logic above should guarantee it.
    if (lastRole !== 'user') {
        console.error('Anthropic request format error: Last message must be from user.', anthropicMessages);
        throw new Error('Cannot send request to Anthropic: message history format invalid.');
    }

    const anthropicPayload = {
      model: modelApiName,
      system: systemPrompt || undefined, // Omit if empty
      messages: anthropicMessages,
      max_tokens: 1024, // Example: set a max_tokens limit
      // Add other parameters like temperature as needed
    };

    console.log(`Sending request to Anthropic model: ${modelApiName}`);
    // console.debug('Anthropic Payload:', JSON.stringify(anthropicPayload));

    const response = await fetch(messagesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(anthropicPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Anthropic API error (${response.status}): ${errorBody}`);
      throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();
    // console.debug('Anthropic Response:', JSON.stringify(jsonResponse));

    // Anthropic response structure is different from OpenAI
    const assistantMessageContent =
        jsonResponse.content?.[0]?.type === 'text'
        ? jsonResponse.content[0].text.trim()
        : '';

    if (!assistantMessageContent) {
        console.error("Anthropic response missing message content:", jsonResponse);
        throw new Error("Received empty response from Anthropic.");
    }

    // Extract token usage (structure differs from OpenAI)
    const tokenUsage: Json | null = jsonResponse.usage ? {
        prompt_tokens: jsonResponse.usage.input_tokens,  // input_tokens
        completion_tokens: jsonResponse.usage.output_tokens, // output_tokens
        // Anthropic doesn't provide total_tokens directly in usage block
        total_tokens: (jsonResponse.usage.input_tokens || 0) + (jsonResponse.usage.output_tokens || 0),
    } : null;

    const assistantResponse: ChatMessage = {
      role: 'assistant',
      content: assistantMessageContent,
      ai_provider_id: request.providerId,
      system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
      token_usage: tokenUsage,
      created_at: new Date().toISOString(),
      // id, chat_id, user_id are set by the calling function (/chat)
    };

    return assistantResponse;
  }

  async listModels(apiKey: string): Promise<ProviderModelInfo[]> {
    // NOTE: As of late 2023/early 2024, Anthropic doesn't have a public /v1/models endpoint.
    // Model availability might need to be hardcoded or managed differently until they provide one.
    // For now, returning a hardcoded list based on known models.
    // This should be updated if/when Anthropic provides a model listing API.
    console.warn('Anthropic adapter using hardcoded model list - update if API becomes available.');

    // Example hardcoded list (update with actual current models)
    const hardcodedModels: ProviderModelInfo[] = [
      {
        api_identifier: 'anthropic-claude-3-opus-20240229',
        name: 'Anthropic Claude 3 Opus',
        description: 'Most powerful model for highly complex tasks.',
      },
      {
        api_identifier: 'anthropic-claude-3-sonnet-20240229',
        name: 'Anthropic Claude 3 Sonnet',
        description: 'Ideal balance of intelligence and speed for enterprise workloads.'
      },
      {
        api_identifier: 'anthropic-claude-3-haiku-20240307',
        name: 'Anthropic Claude 3 Haiku',
        description: 'Fastest and most compact model for near-instant responsiveness.'
      },
      // Add older models if needed, e.g.:
      // { api_identifier: 'anthropic-claude-2.1', name: 'Anthropic Claude 2.1' },
      // { api_identifier: 'anthropic-claude-2.0', name: 'Anthropic Claude 2.0' },
      // { api_identifier: 'anthropic-claude-instant-1.2', name: 'Anthropic Claude Instant 1.2' }
    ];

    // Simulate API call success
    return Promise.resolve(hardcodedModels);

    /* --- Placeholder for actual API call if endpoint becomes available --- 
    const modelsUrl = `${ANTHROPIC_API_BASE}/models`; // Hypothetical endpoint
    console.log("Fetching models from Anthropic...");

    try {
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION, 
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Anthropic API error fetching models (${response.status}): ${errorBody}`);
        throw new Error(`Anthropic API request failed fetching models: ${response.status} ${response.statusText}`);
      }

      const jsonResponse = await response.json();
      const models: ProviderModelInfo[] = [];
      // ... Parse jsonResponse.data (assuming similar structure to OpenAI) ...
      // Remember to prepend 'anthropic-' to api_identifier

      console.log(`Found ${models.length} models from Anthropic.`);
      return models;
    } catch (error) {
        console.error("Failed to fetch models from Anthropic (or endpoint doesn't exist):", error);
        return []; // Return empty list on failure
    }
    */
  }
}

// Export an instance or the class itself
export const anthropicAdapter = new AnthropicAdapter(); 