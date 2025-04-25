// Removed direct package import
// import { Json } from "../../../../packages/types/src/index.ts";

// Import types from the shared location
import type { AiProviderAdapter, ChatMessage, ProviderModelInfo, ChatApiRequest } from '@paynless/types/ai';
import type { Json } from '@paynless/db-types';

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
    let combinedMessages = [...request.messages];
    if (request.message) {
        combinedMessages.push({ role: 'user', content: request.message });
    }

    // 1. First pass: Extract system prompt and gather user/assistant messages
    const preliminaryMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const message of combinedMessages) {
        if (message.role === 'system' && message.content) {
            systemPrompt = message.content; // Capture the last system message if multiple exist
        } else if (message.role === 'user' || message.role === 'assistant') {
            preliminaryMessages.push({ role: message.role, content: message.content });
        }
    }

    // 2. Second pass: Ensure strict alternation starting with 'user'
    let expectedRole: 'user' | 'assistant' = 'user';
    for (const message of preliminaryMessages) {
        if (message.role === expectedRole) {
            anthropicMessages.push(message);
            expectedRole = (expectedRole === 'user') ? 'assistant' : 'user';
        } else {
            // If the current message's role doesn't match the expected role,
            // skip it and potentially subsequent messages until the expected role is found.
            // This enforces the strict alternation.
            // Example: [user, user, assistant] -> process first user, skip second user, process assistant.
            // Example: [assistant, user] -> skip assistant, process user.
             console.warn(`Skipping message with role '${message.role}' because '${expectedRole}' was expected.`);
        }
    }

    // 3. Validation: Check if the filtered list is empty or ends with 'assistant'
     if (anthropicMessages.length === 0) {
        console.error('Anthropic request format error: No valid user/assistant messages found after filtering.', preliminaryMessages);
        throw new Error('Cannot send request to Anthropic: No valid messages to send.');
     }

    if (anthropicMessages[anthropicMessages.length - 1].role !== 'user') {
        console.error('Anthropic request format error: Last message must be from user after filtering.', anthropicMessages);
        // Depending on the desired behavior, we could potentially remove the last assistant message.
        // For now, throwing an error is safer as it indicates a potential issue upstream.
        throw new Error('Cannot send request to Anthropic: message history format invalid after filtering.');
    }

    const anthropicPayload = {
      model: modelApiName,
      system: systemPrompt || undefined, // Omit if empty
      messages: anthropicMessages,
      max_tokens: 1024, // Example: set a max_tokens limit
      // Add other parameters like temperature as needed
    };

    console.log(`Sending request to Anthropic model: ${modelApiName}`);
    // Uncomment for detailed debugging:
    console.debug('Anthropic Payload:', JSON.stringify(anthropicPayload, null, 2));

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
      user_id: null, // Explicitly set user_id to null for assistant messages
      // id, chat_id are set by the calling function (/chat)
    };

    return assistantResponse;
  }

  async listModels(apiKey: string): Promise<ProviderModelInfo[]> {
    const modelsUrl = `${ANTHROPIC_API_BASE}/models`; // Correct endpoint
    console.log("Fetching models dynamically from Anthropic...");

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
      
      // Assuming response structure has a 'data' array based on docs
      if (!jsonResponse?.data || !Array.isArray(jsonResponse.data)) {
          console.error("Anthropic listModels response missing or invalid 'data' array:", jsonResponse);
          throw new Error("Invalid response format received from Anthropic models API.");
      }

      const models: ProviderModelInfo[] = jsonResponse.data.map((item: any) => ({
          // Prepend 'anthropic-' for consistency with other adapters/DB entries
          api_identifier: `anthropic-${item.id}`, 
          name: item.display_name || item.id, // Use display_name, fallback to id
          description: null // API does not provide description
      }));

      console.log(`Found ${models.length} models from Anthropic.`);
      return models;
    } catch (error) {
        console.error("Failed to fetch or parse models from Anthropic:", error);
        // Decide on behavior: throw error or return empty list?
        // Throwing might be better to signal a sync failure clearly.
        throw error; // Re-throw the caught error 
    }
  }
}

// Export an instance or the class itself
export const anthropicAdapter = new AnthropicAdapter(); 