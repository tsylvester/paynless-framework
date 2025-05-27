import type { AiProviderAdapter, ILogger } from '../types.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
import { DummyAdapter, type DummyAdapterConfig } from './dummy_adapter.ts';
import type { Json } from '../../../functions/types_db.ts';
/**
 * Factory function to get the appropriate AI provider adapter.
 *
 * @param providerApiIdentifier - The API identifier of the provider (e.g., 'openai-gpt-4o', 'dummy-echo-v1').
 * @param providerDbConfig - The 'config' JSON object from the ai_providers table in the database.
 * @param apiKey - The API key for the specified provider (used for real providers).
 * @param logger - Optional logger instance.
 * @returns The corresponding AiProviderAdapter instance, or null if the provider is unknown or configuration is invalid.
 */
export function getAiProviderAdapter(
    providerApiIdentifier: string,
    providerDbConfig: Json | null,
    apiKey: string,
    logger?: ILogger
): AiProviderAdapter | null {
  const effectiveLogger = logger || {
    debug: (message: string, metadata?: object) => console.debug(`[FactoryDefaultLogger/DEBUG] ${message}`, metadata || ''),
    info:  (message: string, metadata?: object) => console.info(`[FactoryDefaultLogger/INFO] ${message}`, metadata || ''),
    warn:  (message: string, metadata?: object) => console.warn(`[FactoryDefaultLogger/WARN] ${message}`, metadata || ''),
    error: (message: string | Error, metadata?: object) => console.error(`[FactoryDefaultLogger/ERROR] ${message}`, metadata || ''),
  } as ILogger;

  const identifierLower = providerApiIdentifier.toLowerCase();

  if (identifierLower.startsWith('dummy-')) {
    effectiveLogger.info(`[Factory] Attempting to create DummyAdapter for: ${providerApiIdentifier}`);

    if (!providerDbConfig || typeof providerDbConfig !== 'object') {
      effectiveLogger.error(`[Factory] CRITICAL: No database config (AiProvider.config) provided or not an object for dummy provider ${providerApiIdentifier}. DummyAdapter cannot be configured.`);
      return null;
    }

    // Directly cast and use the database config.
    // Perform runtime validation for key fields.
    const adapterConfig = providerDbConfig as unknown as DummyAdapterConfig;

    // Validate essential fields from the database config
    if (!adapterConfig.mode) {
      effectiveLogger.error(`[Factory] CRITICAL: 'mode' is missing in database config for dummy provider ${providerApiIdentifier}.`);
      return null;
    }
    if (!adapterConfig.tokenization_strategy) {
      effectiveLogger.error(`[Factory] CRITICAL: 'tokenization_strategy' is missing in database config for dummy provider ${providerApiIdentifier}.`);
      return null;
    }
    
    // Ensure modelId is set, defaulting to providerApiIdentifier if not in config
    // This is a reasonable default as the identifier itself can serve as the modelId for dummy adapters.
    if (!adapterConfig.modelId) {
      effectiveLogger.warn(`[Factory] 'modelId' missing in DB config for ${providerApiIdentifier}. Using api_identifier as fallback.`);
      adapterConfig.modelId = providerApiIdentifier;
    }

    // Apply defaults for optional numeric fields if not present
    adapterConfig.tokensPerChar = adapterConfig.tokensPerChar ?? 0.25;
    adapterConfig.basePromptTokens = adapterConfig.basePromptTokens ?? 10;

    // Validate fixedResponse if mode requires it
    if (adapterConfig.mode === 'fixed_response' && (!adapterConfig.fixedResponse || typeof adapterConfig.fixedResponse.content !== 'string')) {
         effectiveLogger.error(`[Factory] CRITICAL: mode is 'fixed_response' but 'fixedResponse.content' is missing or invalid in database config for ${providerApiIdentifier}.`);
         return null;
    }

    effectiveLogger.info(`[Factory] Successfully configured DummyAdapter for ${providerApiIdentifier} using database config.`);
    return new DummyAdapter(adapterConfig, effectiveLogger);
  }

  // Logic for real providers based on providerApiIdentifier prefix
  if (identifierLower.startsWith('openai-')) {
    effectiveLogger.info(`Creating OpenAI Adapter for ${providerApiIdentifier}`);
    // Future: OpenAIAdapter could also use providerDbConfig for model-specific settings (e.g., context window from DB)
    return new OpenAiAdapter(apiKey, effectiveLogger /*, providerDbConfig */);
  }
  if (identifierLower.startsWith('anthropic-')) {
    effectiveLogger.info(`Creating Anthropic Adapter for ${providerApiIdentifier}`);
    return new AnthropicAdapter(apiKey, effectiveLogger /*, providerDbConfig */);
  }
  if (identifierLower.startsWith('google-')) {
    effectiveLogger.info(`Creating Google Adapter for ${providerApiIdentifier}`);
    return new GoogleAdapter(apiKey, effectiveLogger /*, providerDbConfig */);
  }

  effectiveLogger.warn(`[Factory] Unknown or unsupported AI provider api_identifier: ${providerApiIdentifier}.`);
  return null;
} 