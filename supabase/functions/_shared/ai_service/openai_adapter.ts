import type { AiProviderAdapter, ChatMessage, ProviderModelInfo, ChatApiRequest, AdapterResponsePayload } from '../types.ts';
import type { Json } from '../../../functions/types_db.ts';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * Implements AiProviderAdapter for OpenAI models.
 */
export class OpenAiAdapter implements AiProviderAdapter {

  async sendMessage(
    request: ChatApiRequest, // Contains previous messages if chatId was provided
    modelIdentifier: string, // e.g., "openai-gpt-4o" -> "gpt-4o"
    apiKey: string
  ): Promise<AdapterResponsePayload> {
    // Use fetch directly
    const openaiUrl = `${OPENAI_API_BASE}/chat/completions`;
    // Remove provider prefix if present (ensure this matches your DB data convention)
    const modelApiName = modelIdentifier.replace(/^openai-/i, '');

    // Map app messages to OpenAI format
    const openaiMessages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    })).filter(msg => msg.content); // Ensure no empty messages

    // Add the current user message if it exists
    if (request.message) {
      openaiMessages.push({ role: 'user', content: request.message });
    }

    const openaiPayload = {
      model: modelApiName,
      messages: openaiMessages,
      // Add other parameters as needed
      // temperature: 0.7,
    };

    console.log(`Sending fetch request to OpenAI model: ${modelApiName}`);

    const response = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`OpenAI API fetch error (${response.status}): ${errorBody}`);
      throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();

    const aiContent = jsonResponse.choices?.[0]?.message?.content?.trim();
    if (!aiContent) {
      console.error("OpenAI fetch response missing message content:", jsonResponse);
      throw new Error('OpenAI response content is empty or missing.');
    }

    const tokenUsage = jsonResponse.usage ? {
      prompt_tokens: jsonResponse.usage.prompt_tokens,
      completion_tokens: jsonResponse.usage.completion_tokens,
      total_tokens: jsonResponse.usage.total_tokens,
    } : null;

    // Construct the response conforming to AdapterResponsePayload
    const assistantResponse: AdapterResponsePayload = {
      role: 'assistant',
      content: aiContent,
      ai_provider_id: request.providerId, // Pass through the provider DB ID
      system_prompt_id: request.promptId !== '__none__' ? request.promptId : null, // Pass through prompt DB ID
      token_usage: tokenUsage,
      // REMOVED fields not provided by adapter: id, chat_id, created_at, user_id
    };

    return assistantResponse;
  }

  async listModels(apiKey: string): Promise<ProviderModelInfo[]> {
    const modelsUrl = `${OPENAI_API_BASE}/models`;
    console.log("[openai_adapter] Fetching models from OpenAI...");

    console.log("[openai_adapter] Before fetch call");
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    console.log(`[openai_adapter] After fetch call (Status: ${response.status})`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[openai_adapter] OpenAI API error fetching models (${response.status}): ${errorBody}`);
      throw new Error(`OpenAI API request failed fetching models: ${response.status} ${response.statusText}`);
    }

    console.log("[openai_adapter] Before response.json() call");
    const jsonResponse = await response.json();
    console.log("[openai_adapter] After response.json() call");
    const models: ProviderModelInfo[] = [];

    if (jsonResponse.data && Array.isArray(jsonResponse.data)) {
      jsonResponse.data.forEach((model: any) => {
        // We are interested in chat completion models, often contain 'gpt'
        // This filtering might need refinement based on OpenAI's model ID conventions
        if (model.id && (model.id.includes('gpt') || model.id.includes('instruct'))) { // Simple filter
            models.push({
                api_identifier: `openai-${model.id}`, // Prepend 'openai-' for our internal identifier
                name: `OpenAI ${model.id}`, // Simple naming convention
                description: `Owned by: ${model.owned_by}`, // Example detail
                // Add other relevant fields if needed and available
            });
        }
      });
    }

    console.log(`Found ${models.length} potentially usable models from OpenAI.`);
    return models;
  }
}

// Export an instance or the class itself depending on factory preference
export const openAiAdapter = new OpenAiAdapter(); 