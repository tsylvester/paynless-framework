import type { AiProviderAdapter, ChatMessage, ProviderModelInfo, ChatApiRequest, Json } from '../types.ts';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * Implements AiProviderAdapter for OpenAI models.
 */
export class OpenAiAdapter implements AiProviderAdapter {

  async sendMessage(
    request: ChatApiRequest, // Contains previous messages if chatId was provided
    modelIdentifier: string, // e.g., "openai-gpt-4o" -> "gpt-4o"
    apiKey: string
  ): Promise<ChatMessage> {
    const openaiUrl = `${OPENAI_API_BASE}/chat/completions`;
    // The model identifier in the DB includes the provider prefix, remove it for the API call
    const modelApiName = modelIdentifier.replace(/^openai-/i, '');

    // Construct messages payload from request
    // Assuming request.messages already contains system prompt (if any) and history
    const messagesPayload = [
      // Example: Add system prompt or history manipulation if needed based on request
      // { role: 'system', content: 'You are helpful.' },
      ...request.messages, // Assuming ChatApiRequest will be updated to include messages
      { role: 'user', content: request.message },
    ].filter(msg => msg.content); // Ensure no empty messages


    const openaiPayload = {
      model: modelApiName,
      messages: messagesPayload,
      // Add other parameters like temperature, max_tokens as needed
      // temperature: 0.7,
    };

    console.log(`Sending request to OpenAI model: ${modelApiName}`);
    // console.debug('OpenAI Payload:', JSON.stringify(openaiPayload)); // Careful with logging PII

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
      console.error(`OpenAI API error (${response.status}): ${errorBody}`);
      throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();
    // console.debug('OpenAI Response:', JSON.stringify(jsonResponse));

    const assistantMessageContent = jsonResponse.choices?.[0]?.message?.content?.trim() || '';
    if (!assistantMessageContent) {
        console.error("OpenAI response missing message content:", jsonResponse);
        throw new Error("Received empty response from OpenAI.");
    }

    // Extract token usage if available
    const tokenUsage: Json | null = jsonResponse.usage ? {
        prompt_tokens: jsonResponse.usage.prompt_tokens,
        completion_tokens: jsonResponse.usage.completion_tokens,
        total_tokens: jsonResponse.usage.total_tokens,
    } : null;

    // Construct the standardized ChatMessage response
    // The actual saving to DB happens in the main /chat function
    const assistantResponse: ChatMessage = {
      // id will be generated when saving to DB
      // chat_id will be set when saving to DB
      role: 'assistant',
      content: assistantMessageContent,
      ai_provider_id: request.providerId, // Keep original provider ID from request
      system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
      token_usage: tokenUsage,
      created_at: new Date().toISOString(), // Use current time for response timestamp
      user_id: null, // Explicitly set user_id to null for assistant messages
    };

    return assistantResponse;
  }

  async listModels(apiKey: string): Promise<ProviderModelInfo[]> {
    const modelsUrl = `${OPENAI_API_BASE}/models`;
    console.log("Fetching models from OpenAI...");

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`OpenAI API error fetching models (${response.status}): ${errorBody}`);
      throw new Error(`OpenAI API request failed fetching models: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();
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