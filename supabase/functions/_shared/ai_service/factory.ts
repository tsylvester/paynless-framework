import type { AiProviderAdapter, ILogger, AiModelExtendedConfig } from '../types.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
import { DummyAdapter } from './dummy_adapter.ts';
import { getMockAiProviderAdapter } from './ai_provider.mock.ts';

// Helper type for the adapter instance. An instance is the object returned by calling `new` on a constructable type.
type AiProviderAdapterInstance = InstanceType<AiProviderAdapter>;

// Map of provider prefixes to their corresponding adapter classes.
// The value type is the AiProviderAdapter constructable interface, which includes the `new` signature.
const providerMap: Record<string, AiProviderAdapter> = {
    'openai-': OpenAiAdapter,
    'anthropic-': AnthropicAdapter,
    'google-': GoogleAdapter,
    'dummy-': DummyAdapter,
};

/**
 * Factory function to get the appropriate AI provider adapter instance.
 *
 * @param providerApiIdentifier - The API identifier of the provider (e.g., 'openai-gpt-4o', 'dummy-echo-v1').
 * @param providerDbConfig - The 'config' JSON object from the ai_providers table.
 * @param apiKey - The API key for the specified provider.
 * @param logger - Logger instance.
 * @returns The corresponding adapter instance, or null if the provider is unknown or configuration is invalid.
 */
export function getAiProviderAdapter(
    providerApiIdentifier: string,
    providerDbConfig: AiModelExtendedConfig | null,
    apiKey: string,
    logger: ILogger,
    forceReal = false // Add a bypass flag for testing the factory's own logic.
): AiProviderAdapterInstance | null {

    // Test-only override to inject the mock adapter.
    // The `forceReal` flag allows the factory's own unit test to bypass this.
    if (!forceReal && (Deno.env.get("SUPA_ENV") === "local" || Deno.env.get("NODE_ENV") === "development")) {
        logger.warn(`[Factory] TEST ENVIRONMENT DETECTED. Returning Mock AI Provider Adapter for ${providerApiIdentifier}.`);
        
        // In a test environment, we don't have a real API key, so we pass a dummy one.
        // The mock config needs to be created here to satisfy the contract.
        const mockConfig: AiModelExtendedConfig = providerDbConfig || {
            api_identifier: providerApiIdentifier,
            input_token_cost_rate: 0,
            output_token_cost_rate: 0,
            tokenization_strategy: { type: 'none' },
        };
        
        const { instance } = getMockAiProviderAdapter(logger, mockConfig);
        return instance;
    }

    const identifierLower = providerApiIdentifier.toLowerCase();
    
    const providerPrefix = Object.keys(providerMap).find(prefix => identifierLower.startsWith(prefix));

    if (!providerPrefix) {
        logger.warn(`[Factory] Unknown or unsupported AI provider api_identifier: ${providerApiIdentifier}.`);
        return null;
    }

    const AdapterClass = providerMap[providerPrefix];
    let configToUse = providerDbConfig;

    // A real provider MUST have its configuration from the database.
    if (!configToUse && providerPrefix !== 'dummy-') {
        logger.error(`[Factory] AiModelExtendedConfig is required for real provider ${providerApiIdentifier} but was not provided.`);
        return null;
    }

    // If the dummy adapter is called without a config, create a default one to satisfy the contract.
    if (!configToUse && providerPrefix === 'dummy-') {
        logger.debug(`[Factory] Creating default config for DummyAdapter.`);
        configToUse = {
            api_identifier: providerApiIdentifier,
            input_token_cost_rate: 0,
            output_token_cost_rate: 0,
            tokenization_strategy: { type: 'none' },
        };
    }

    // The non-null assertion `configToUse!` is safe here because the checks above ensure `configToUse` is assigned.
    logger.info(`Creating adapter for ${providerApiIdentifier}`);

    try {
        const adapterInstance = new AdapterClass(apiKey, logger, configToUse!);
        return adapterInstance;
    } catch (error) {
        logger.error(`[Factory] Failed to instantiate adapter for ${providerApiIdentifier}`, { error: error instanceof Error ? error.message : String(error) });
        return null;
    }
}
