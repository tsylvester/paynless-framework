import type { AiProviderAdapter, FactoryDependencies } from '../types.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
import { DummyAdapter } from './dummy_adapter.ts';

export const defaultProviderMap: Record<string, AiProviderAdapter> = {
    'openai-': OpenAiAdapter,
    'anthropic-': AnthropicAdapter,
    'google-': GoogleAdapter,
    'dummy-': DummyAdapter,
};

export const testProviderMap: Record<string, AiProviderAdapter> = {
    'dummy': DummyAdapter,
    'openai-': DummyAdapter,
    'anthropic-': DummyAdapter,
    'google-': DummyAdapter,
};

// Helper type for the adapter instance. An instance is the object returned by calling `new` on a constructable type.
type AiProviderAdapterInstance = InstanceType<AiProviderAdapter>;
/**
 * Factory function to get the appropriate AI provider adapter instance.
 *
 * @param providerApiIdentifier - The API identifier of the provider (e.g., 'openai-gpt-4o', 'dummy-echo-v1').
 * @param providerDbConfig - The 'config' JSON object from the ai_providers table.
 * @param apiKey - The API key for the specified provider.
 * @param logger - Logger instance.
 * @param providerMap - A map of provider prefixes to their corresponding adapter classes.
 * @returns The corresponding adapter instance, or null if the provider is unknown or configuration is invalid.
 */
export function getAiProviderAdapter(
    dependencies: FactoryDependencies
): AiProviderAdapterInstance | null {

    const { 
        provider, 
        apiKey, 
        logger, 
        providerMap,
    } = dependencies;

    const identifierLower = provider.api_identifier.toLowerCase();
    
    if (!providerMap) {
        logger.error(`[Factory] providerMap is not configured. This should not happen.`);
        return null;
    }
    const providerPrefix = Object.keys(providerMap).find(prefix => identifierLower.startsWith(prefix));

    if (!providerPrefix) {
        logger.warn(`[Factory] Unknown or unsupported AI provider api_identifier: ${provider.api_identifier}.`);
        return null;
    }

    const AdapterClass = providerMap[providerPrefix];
    let providerToUse = provider;

    // A real provider MUST have its configuration from the database.
    if (!provider.config && providerPrefix !== 'dummy-') {
        logger.error(`[Factory] AiModelExtendedConfig is required for real provider ${provider.api_identifier} but was not provided.`);
        return null;
    }

    // If the dummy adapter is called without a config, create a default one to satisfy the contract.
    if (!provider.config && providerPrefix === 'dummy-') {
        logger.debug(`[Factory] Creating default config for DummyAdapter.`);
        const defaultConfig = {
            api_identifier: provider.api_identifier,
            input_token_cost_rate: 0,
            output_token_cost_rate: 0,
            tokenization_strategy: { type: 'none' as const },
        };
        providerToUse = {
            ...provider,
            config: defaultConfig
        };
    }

    logger.info(`Creating adapter for ${provider.api_identifier}`);

    try {
        const adapterInstance = new AdapterClass(providerToUse, apiKey, logger);
        return adapterInstance;
    } catch (error) {
        logger.error(`[Factory] Failed to instantiate adapter for ${provider.api_identifier}`, { error: error instanceof Error ? error.message : String(error) });
        return null;
    }
}
