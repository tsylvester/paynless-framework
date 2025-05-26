import type { AiProviderAdapter, ILogger } from '../types.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
// Import necessary types for the dummy adapter
import type { ChatApiRequest as AdapterChatRequest, AdapterResponsePayload, ProviderModelInfo } from '../types.ts';
import type { Database } from '../../../functions/types_db.ts'; // For TokenUsageJson

// Define a simple dummy adapter
const dummyAdapter: AiProviderAdapter = {
    sendMessage: async (request: AdapterChatRequest, modelIdentifier: string, _apiKey: string): Promise<AdapterResponsePayload> => {
        console.log("[Dummy Adapter] sendMessage called with request:", request);
        const lastUserMessage = request.messages && request.messages.length > 0 ? request.messages[request.messages.length - 1] : null;
        // If there are no past messages, use the main `request.message` which is the current one being sent.
        const currentMessageContent = request.message;
        const contentToEcho = currentMessageContent || lastUserMessage?.content || 'This is a dummy echo response.';
        const finalContent = `Echo from Dummy: ${contentToEcho}`;
        
        // Construct token usage as per Database['public']['Tables']['chat_messages']['Row']['token_usage']
        // which is expected to be `Json | null`. Let's assume it's an object or null.
        const tokenUsage: Database['public']['Tables']['chat_messages']['Row']['token_usage'] = {
            prompt_tokens: 0,
            completion_tokens: 10, // Dummy value for echoed content
            total_tokens: 10
        };

        return {
            // success: true, // AdapterResponsePayload doesn't have a 'success' field
            // data: { // AdapterResponsePayload is the data itself
                // id: `dummy-msg-${Date.now()}`, // Not part of AdapterResponsePayload
                role: 'assistant',
                content: finalContent,
                // model: modelIdentifier, // Not part of AdapterResponsePayload, model info is implicit or part of request
                ai_provider_id: request.providerId, // Pass through from the original request
                system_prompt_id: request.promptId !== '__none__' ? request.promptId : null, // Pass through
                token_usage: tokenUsage,
                // stop_reason: 'dummy_stop', // Not part of AdapterResponsePayload
            // }
        };
    },
    listModels: async (_apiKey: string): Promise<ProviderModelInfo[]> => {
        return Promise.resolve([
            {
                id: 'dummy-model-id-1', // Actual ID of the model record in ai_models table if it exists, or a mock
                api_identifier: 'dummy-echo-v1', // The identifier used by the API/adapter
                name: 'Dummy Echo v1',
                description: 'A dummy model that echoes input.',
                // provider: 'dummy', // This is usually handled by the context where listModels is called
                // Add other fields from ProviderModelInfo if necessary (e.g., context_window, is_active)
            },
        ]);
    }
};

/**
 * Factory function to get the appropriate AI provider adapter based on the provider identifier.
 *
 * @param provider - The provider identifier string (e.g., 'openai', 'anthropic', 'google').
 * @param apiKey - The API key for the specified provider.
 * @param logger - Optional logger instance.
 * @returns The corresponding AiProviderAdapter instance, or null if the provider is unknown or unsupported.
 */
export function getAiProviderAdapter(provider: string, apiKey: string, logger?: ILogger): AiProviderAdapter | null {
  // Ensure a default logger is available if none is provided, for consistent internal logging.
  const effectiveLogger = logger || {
    debug: (message: string, metadata?: object) => console.debug(`[FactoryDefaultLogger/DEBUG] ${message}`, metadata || ''),
    info:  (message: string, metadata?: object) => console.info(`[FactoryDefaultLogger/INFO] ${message}`, metadata || ''),
    warn:  (message: string, metadata?: object) => console.warn(`[FactoryDefaultLogger/WARN] ${message}`, metadata || ''),
    error: (message: string | Error, metadata?: object) => console.error(`[FactoryDefaultLogger/ERROR] ${message}`, metadata || ''),
  } as ILogger;

  switch (provider.toLowerCase()) {
    case 'openai':
      effectiveLogger.info('Creating OpenAI Adapter instance');
      return new OpenAiAdapter(apiKey, effectiveLogger);
    case 'anthropic':
      effectiveLogger.info('Creating Anthropic Adapter instance');
      return new AnthropicAdapter(apiKey, effectiveLogger);
    case 'google':
      effectiveLogger.info('Creating Google Adapter instance');
      return new GoogleAdapter(apiKey, effectiveLogger);
    case 'dummy': // Added case for dummy provider
      effectiveLogger.info('Using shared Dummy Adapter instance');
      // Dummy adapter doesn't need apiKey or logger in its current form, so we return the singleton.
      // If it were to use them, it would need to be instantiated too.
      return dummyAdapter;
    // Add cases for other providers here as they are implemented
    // case 'perplexity':
    //   return perplexityAdapter;
    default:
      effectiveLogger.warn(`Unknown or unsupported AI provider requested: ${provider}`);
      return null;
  }
} 