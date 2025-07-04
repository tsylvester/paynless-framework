import type { 
    AiProviderAdapter, 
    // REMOVED: ChatMessage, // Not returned directly
    ProviderModelInfo, 
    ChatApiRequest, 
    AdapterResponsePayload,
    ILogger, // Added ILogger
    AiModelExtendedConfig,
} from '../types.ts';
import type { Json } from '../../../functions/types_db.ts';
// REMOVED: import type { VertexAI } from 'npm:@google-cloud/vertexai'; // Remove unused import

// Google Gemini API constants
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Helper type for Google Gemini API content structure
interface GoogleContentPart {
    text: string;
}
interface GoogleContent {
    role: 'user' | 'model'; // Gemini uses 'model' for assistant
    parts: GoogleContentPart[];
}

// Minimal interface for Google Model items
interface GoogleModelItem {
  name: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  // Add other fields if needed
  [key: string]: unknown;
}

/**
 * Implements AiProviderAdapter for Google Gemini models.
 */
export class GoogleAdapter implements AiProviderAdapter {

  constructor(private apiKey: string, private logger: ILogger) {}

  private async _countTokens(
    modelApiName: string,
    contents: GoogleContent[],
    fetchFn: typeof fetch = fetch // Allow fetch to be injectable for testing
  ): Promise<number | null> {
    const countTokensUrl = `${GOOGLE_API_BASE}/${modelApiName}:countTokens?key=${this.apiKey}`;
    this.logger.debug(`Counting tokens for model: ${modelApiName} with ${contents.length} content blocks.`, { url: countTokensUrl });
    try {
      const response = await fetchFn(countTokensUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents }), // API expects { "contents": [...] }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Google Gemini API error during countTokens (${response.status}): ${errorBody}`, { modelApiName, status: response.status });
        // Do not throw here, allow main sendMessage to proceed with null tokens
        return null;
      }
      const jsonResponse = await response.json();
      return jsonResponse.totalTokens as number;
    } catch (error) {
      this.logger.error('Failed to count tokens:', { error: error instanceof Error ? error.message : String(error), modelApiName });
      return null;
    }
  }

  async sendMessage(
    request: ChatApiRequest,
    modelIdentifier: string, // e.g., "google-gemini-1.5-pro-latest"
  ): Promise<AdapterResponsePayload> {
    this.logger.debug('[GoogleAdapter] sendMessage called', { modelIdentifier });
    // Map our internal identifier to Google's format (e.g., "models/gemini-1.5-pro-latest")
    const modelApiName = `models/${modelIdentifier.replace(/^google-/i, '')}`;
    const generateContentUrl = `${GOOGLE_API_BASE}/${modelApiName}:generateContent?key=${this.apiKey}`;

    // --- Map messages to Google Gemini format ---
    // Gemini uses alternating 'user' and 'model' roles.
    // System prompts are typically included in the first user message content.
    let systemPrompt = '';
    const googleContents: GoogleContent[] = [];

    // Combine history and new message
    const combinedMessages = [...(request.messages ?? [])];
    if (request.message) {
        combinedMessages.push({ role: 'user', content: request.message });
    }

    let lastRole: 'user' | 'assistant' | 'system' | null = null;
    let currentContent: GoogleContent | null = null;

    for (const message of combinedMessages) {
        if (message.role === 'system' && message.content) {
            // Prepend system prompt to the *next* user message
            systemPrompt = message.content;
            lastRole = 'system'; // Mark system prompt presence
        } else if (message.role === 'user') {
            if (lastRole !== 'user') { // Start new user content block
                currentContent = { role: 'user', parts: [{ text: (systemPrompt ? systemPrompt + '\n\n' : '') + message.content }] };
                googleContents.push(currentContent);
                systemPrompt = ''; // Reset system prompt after using it
                lastRole = 'user';
            } else if (currentContent && currentContent.role === 'user') {
                 // Append to existing user content (shouldn't happen with alternating logic?)
                 // console.warn('Appending to existing user content block in Google adapter.');
                 currentContent.parts[0].text += '\n' + message.content; 
            }
        } else if (message.role === 'assistant') {
            // Use 'assistant' for internal tracking, but 'model' for Google payload
            if (lastRole !== 'assistant') { // Check against internal 'assistant' role
                currentContent = { role: 'model', parts: [{ text: message.content }] }; // Use 'model' for Google
                googleContents.push(currentContent);
                lastRole = 'assistant'; // Set internal lastRole to 'assistant'
            } else if (currentContent && currentContent.role === 'model'){
                // Append to existing assistant content (shouldn't happen with alternating logic?)
                // console.warn('Appending to existing model content block in Google adapter.');
                 currentContent.parts[0].text += '\n' + message.content;
            }
        }
    }
    
    // Basic safety check
    if (googleContents.length === 0 || googleContents[googleContents.length - 1].role !== 'user') {
      this.logger.error('Google Gemini request format error: History must end with a user message.', { googleContents, modelApiName });
      throw new Error('Cannot send request to Google Gemini: message history format invalid.');
    }

    const googlePayload: {
      contents: GoogleContent[];
      generationConfig?: { // Define generationConfig as optional
        temperature?: number;
        maxOutputTokens?: number;
        // Add other Google generation config params as needed
      };
    } = {
      contents: googleContents,
    };

    // Add generationConfig if max_tokens_to_generate is provided
    if (request.max_tokens_to_generate && request.max_tokens_to_generate > 0) {
      googlePayload.generationConfig = {
        ...(googlePayload.generationConfig || {}), // Preserve other potential generationConfig settings
        maxOutputTokens: request.max_tokens_to_generate,
      };
    }

    this.logger.info(`Sending request to Google Gemini model: ${modelApiName}`, { url: generateContentUrl });
    // console.debug('Google Gemini Payload:', JSON.stringify(googlePayload));

    const response = await fetch(generateContentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(googlePayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Google Gemini API error (${response.status}): ${errorBody}`, { modelApiName, status: response.status });
      
      // Construct base message
      const baseErrorMessage = `Google Gemini API request failed: ${response.status}`;
      
      // Append parsed message if available
      let detailedMessage = '';
       try {
           const errorJson = JSON.parse(errorBody);
           if (errorJson.error?.message) {
               detailedMessage = errorJson.error.message;
           }
       } catch (e) { /* Ignore parsing error */ }

      // Combine messages cleanly, adding the detail part only if it exists
      const finalErrorMessage = detailedMessage 
          ? `${baseErrorMessage} - ${detailedMessage}` 
          : baseErrorMessage;

      throw new Error(finalErrorMessage);
    }

    const jsonResponse = await response.json();
    // console.debug('Google Gemini Response:', JSON.stringify(jsonResponse));

    // Extract content - needs careful checking for blocked prompts / safety ratings
    const candidate = jsonResponse.candidates?.[0];
    let assistantMessageContent = '';
    if (candidate?.finishReason === 'STOP' && candidate.content?.parts?.[0]?.text) {
        assistantMessageContent = candidate.content.parts[0].text.trim();
    } else if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        // Handle other finish reasons (MAX_TOKENS, SAFETY, RECITATION, OTHER)
        this.logger.warn(`Google Gemini response finished with reason: ${candidate.finishReason}`, { modelApiName, finishReason: candidate.finishReason });
        // Potentially return a specific message or throw error based on reason
        assistantMessageContent = `[Response stopped due to: ${candidate.finishReason}]`; 
    } else {
        this.logger.error("Google Gemini response missing valid content or finish reason:", { response: jsonResponse, modelApiName });
        // Consider checking promptFeedback for block reasons
        const blockReason = jsonResponse.promptFeedback?.blockReason;
        if (blockReason) {
             throw new Error(`Request blocked by Google Gemini due to: ${blockReason}`);
        }
        throw new Error("Received invalid or empty response from Google Gemini.");
    }

    // --- Token Usage ---
    // Google Gemini API (generateContent) typically doesn't return token count directly in the main response.
    // You often need to make a separate call to countTokens.
    // For simplicity here, we'll omit token usage, but it could be added with another API call.
    // const tokenUsage: Json | null = null;
    // console.warn("Google Gemini adapter currently does not fetch token usage.");

    let promptTokens: number | null = null;
    let completionTokens: number | null = null;

    try {
      promptTokens = await this._countTokens(modelApiName, googlePayload.contents);
      if (assistantMessageContent) {
        const completionContents: GoogleContent[] = [{ role: 'model', parts: [{ text: assistantMessageContent }] }];
        completionTokens = await this._countTokens(modelApiName, completionContents);
      }
    } catch (tokenError) {
      // Log error but don't let token counting failure break the main response
      this.logger.error("Error during token counting calls:", { error: tokenError instanceof Error ? tokenError.message : String(tokenError), modelApiName });
    }
    
    const tokenUsage: Json | null = (promptTokens !== null || completionTokens !== null) 
      ? {
          prompt_tokens: promptTokens || 0,
          completion_tokens: completionTokens || 0,
          total_tokens: (promptTokens || 0) + (completionTokens || 0),
        }
      : null;

    // Construct the response conforming to AdapterResponsePayload
    const assistantResponse: AdapterResponsePayload = {
      role: 'assistant',
      content: assistantMessageContent,
      ai_provider_id: request.providerId,
      system_prompt_id: request.promptId !== '__none__' ? request.promptId : null,
      token_usage: tokenUsage, 
      // REMOVED fields not provided by adapter: id, chat_id, created_at, user_id
    };
    this.logger.debug('[GoogleAdapter] sendMessage successful', { modelApiName });
    return assistantResponse;
  }

  /**
   * Fetches the list of available Google models from the API and enriches them with details.
   */
  async listModels(): Promise<ProviderModelInfo[]> {
    const listModelsUrl = `${GOOGLE_API_BASE}/models?key=${this.apiKey}`;
    this.logger.info(`Fetching model list from Google: ${listModelsUrl}`);
    
    try {
      const response = await fetch(listModelsUrl);
      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Failed to fetch Google model list (${response.status}): ${errorBody}`);
        throw new Error(`Google API error when fetching model list: ${response.status}`);
      }
      const jsonResponse = await response.json();
      const models = (jsonResponse.models || []) as GoogleModelItem[];

      this.logger.info(`Found ${models.length} models. Supported methods must include 'generateContent'.`);

      // Filter out models that don't support 'generateContent'
      const supportedModels = models.filter(
        (model) => model.supportedGenerationMethods?.includes('generateContent')
      );
      this.logger.debug(`Found ${supportedModels.length} models supporting 'generateContent'.`, {
        supportedModels: supportedModels.map(m => m.name),
      });

      // Fetch detailed info for each supported model
      const detailedModelsPromises = supportedModels.map(async (model) => {
        // The model name is expected in the format "models/gemini-1.0-pro"
        const details = await this.getModelDetails(model.name);
        if (!details) {
          this.logger.warn(`Could not retrieve details for model: ${model.name}. It will be excluded.`);
          return null; // Exclude this model if details could not be fetched
        }

        // Map details to ProviderModelInfo
        const config: AiModelExtendedConfig = {
          api_identifier: `google-${model.name.replace(/^models\//, '')}`, // Create our internal identifier
          provider_max_input_tokens: details.inputTokenLimit,
          provider_max_output_tokens: details.outputTokenLimit,
          // The following are placeholders and should be managed in the database sync logic
          input_token_cost_rate: 0,
          output_token_cost_rate: 0,
          context_window_tokens: details.inputTokenLimit || 0,
          hard_cap_output_tokens: details.outputTokenLimit,
          tokenization_strategy: { type: 'google_gemini_tokenizer' },
        };
        
        const providerModelInfo: ProviderModelInfo = {
          api_identifier: `google-${model.name.replace(/^models\//, '')}`,
          name: details.displayName || model.name,
          description: details.description || undefined, // Ensure it's undefined, not null
          config: config as unknown as Json,
        };
        return providerModelInfo;
      });

      const settledResults = await Promise.all(detailedModelsPromises);
      // Filter out null results (where getModelDetails failed)
      const finalModels = settledResults.filter((model): model is ProviderModelInfo => model !== null);

      this.logger.info(`Successfully listed ${finalModels.length} detailed Google models.`);
      return finalModels;

    } catch (error) {
      this.logger.error('Error in listModels:', { error: error instanceof Error ? error.message : String(error) });
      return []; // Return empty on error
    }
  }

  /**
   * Fetches detailed information for a single model.
   * @param modelName The full name of the model (e.g., 'models/gemini-1.5-pro-latest').
   * @returns A GoogleModelItem with detailed info, or null on error.
   */
  async getModelDetails(modelName: string): Promise<GoogleModelItem | null> {
    const getModelUrl = `${GOOGLE_API_BASE}/${modelName}?key=${this.apiKey}`;
    this.logger.debug(`Fetching details for model: ${modelName}`, { url: getModelUrl });
    try {
      const response = await fetch(getModelUrl);
      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.warn(`Could not fetch details for model ${modelName} (${response.status}): ${errorBody}`);
        return null;
      }
      return await response.json() as GoogleModelItem;
    } catch (error) {
      this.logger.error(`Error fetching model details for ${modelName}:`, { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
}

// Removed: export const googleAdapter = new GoogleAdapter(); 