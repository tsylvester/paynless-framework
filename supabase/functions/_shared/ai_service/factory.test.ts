import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getAiProviderAdapter, defaultProviderMap } from './factory.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
import { DummyAdapter } from './dummy_adapter.ts';
import { MockLogger } from "../logger.mock.ts";
import type { AiModelExtendedConfig, ILogger, AdapterResponsePayload, ChatApiRequest, ProviderModelInfo, FactoryDependencies } from "../types.ts";
import { isJson } from "../utils/type_guards.ts";
import type { Tables } from "../../types_db.ts";


const mockLogger = new MockLogger();
const testApiKey = 'test-api-key';

Deno.test("AI Adapter Factory - getAiProviderAdapter", () => {
  // Test cases for each known provider, including case-insensitivity
  const providers = [
    { name: 'openai-test-model', adapterClass: OpenAiAdapter },
    { name: 'OpenAI-Test-Model', adapterClass: OpenAiAdapter },
    { name: 'anthropic-test-model', adapterClass: AnthropicAdapter },
    { name: 'AnThRoPiC-Test-Model', adapterClass: AnthropicAdapter },
    { name: 'google-test-model', adapterClass: GoogleAdapter },
    { name: 'GOOGLE-Test-Model', adapterClass: GoogleAdapter },
    { name: 'dummy-test-model', adapterClass: DummyAdapter },
    { name: 'DUMMY-Test-Model', adapterClass: DummyAdapter },
  ];

  const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'test-model',
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { type: 'none' },
  };

  for (const provider of providers) {
    // The factory expects a config for all real providers.
    // It only creates a default for the dummy adapter.
    const config = provider.name.startsWith('dummy-') ? null : MOCK_MODEL_CONFIG;
    if(!isJson(config)) {
        throw new Error('config is not a valid JSON object');
    }
    const adapter = getAiProviderAdapter({
        provider: {
            name: provider.name,
            api_identifier: provider.name,
            config: config,
            created_at: new Date().toISOString(),
            description: 'Test provider',
            id: crypto.randomUUID(),
            is_active: true,
            is_default_embedding: false,
            is_enabled: true,
            provider: 'test-provider',
            updated_at: new Date().toISOString(),
        },
        apiKey: testApiKey,
        logger: mockLogger,
        providerMap: defaultProviderMap,
    });
    assertExists(adapter, `Adapter should be created for ${provider.name}`);
    assertInstanceOf(adapter, provider.adapterClass, `Adapter for ${provider.name} should be instance of ${provider.adapterClass.name}`);
  }

  // Test unknown provider
  const adapterUnknown = getAiProviderAdapter({
    provider: {
        name: 'some-other-provider',
        api_identifier: 'some-other-provider',
        config: null,
        created_at: new Date().toISOString(),
        description: 'Test provider',
        id: crypto.randomUUID(),
        is_active: true,
        is_default_embedding: false,
        is_enabled: true,
        provider: 'test-provider',
        updated_at: new Date().toISOString(),
    },
    apiKey: testApiKey,
    logger: mockLogger,
    providerMap: defaultProviderMap,
  });
  assertEquals(adapterUnknown, null, "Adapter should be null for unknown provider");

  // Test empty string
  const adapterEmpty = getAiProviderAdapter({
    provider: {
        name: '',
        api_identifier: '',
        config: null,
        created_at: new Date().toISOString(),
        description: 'Test provider',
        id: crypto.randomUUID(),
        is_active: true,
        is_default_embedding: false,
        is_enabled: true,
        provider: 'test-provider',
        updated_at: new Date().toISOString(),
    },
    apiKey: testApiKey,
    logger: mockLogger,
    providerMap: defaultProviderMap,
  });
  assertEquals(adapterEmpty, null, "Adapter should be null for empty provider string");
});

Deno.test("should pass the full provider DB config to the adapter, including the provider ID", () => {
    // Arrange
    let capturedProvider: Tables<'ai_providers'> | undefined;

    class CapturingDummyAdapter {
        constructor(
            provider: Tables<'ai_providers'>,
            _apiKey: string,
            _logger: ILogger,
        ) {
            capturedProvider = provider;
        }
        sendMessage(_request: ChatApiRequest, _modelIdentifier: string): Promise<AdapterResponsePayload> {
            throw new Error("Method not implemented.");
        }
        listModels(): Promise<ProviderModelInfo[]> {
            throw new Error("Method not implemented.");
        }
    }
    const MOCK_PROVIDER_ID = crypto.randomUUID();
    const mockProviderConfig: AiModelExtendedConfig = {
        api_identifier: 'dummy-test-model',
        input_token_cost_rate: 0,
        output_token_cost_rate: 0,
        tokenization_strategy: { type: 'none' },
    };
    if(!isJson(mockProviderConfig)) {
        throw new Error('mockProviderConfig is not a valid JSON object');
    }
    const testDependencies: FactoryDependencies = {
        provider: {
            name: 'dummy-test-model',
            api_identifier: 'dummy-test-model',
            config: mockProviderConfig,
            created_at: new Date().toISOString(),
            description: 'Test provider',
            id: MOCK_PROVIDER_ID,
            is_active: true,
            is_default_embedding: false,
            is_enabled: true,
            provider: 'test-provider',
            updated_at: new Date().toISOString(),
        },
        apiKey: 'test-api-key',
        logger: new MockLogger(),
        providerMap: {
            'dummy-': CapturingDummyAdapter,
        }
    };

    // Act
    getAiProviderAdapter(
        testDependencies
    );

    // Assert
    assertExists(capturedProvider, "CapturingDummyAdapter constructor should have been called.");
    assertEquals(capturedProvider.id, MOCK_PROVIDER_ID, "The 'id' property should be passed through correctly to the adapter.");
});

Deno.test("DI Proof: should return DummyAdapter for a real provider when injected with a test map", () => {
    // Arrange: This simulates an integration test setup where we want to avoid real API calls.
    const integrationTestProviderMap = {
        'openai-': DummyAdapter,
        'dummy-': DummyAdapter,
    };

    const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
        id: crypto.randomUUID(),
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0,
        output_token_cost_rate: 0,
        tokenization_strategy: { type: 'none' },
    };
    if(!isJson(MOCK_MODEL_CONFIG)) {
        throw new Error('MOCK_MODEL_CONFIG is not a valid JSON object');
    }
    const testDependencies: FactoryDependencies = {
        provider: {
            name: 'openai-gpt-4o',
            api_identifier: 'openai-gpt-4o',
            config: MOCK_MODEL_CONFIG,
            created_at: new Date().toISOString(),
            description: 'Test provider',
            id: crypto.randomUUID(),
            is_active: true,
            is_default_embedding: false,
            is_enabled: true,
            provider: 'test-provider',
            updated_at: new Date().toISOString(),
        },
        apiKey: 'test-api-key',
        logger: new MockLogger(),
        providerMap: integrationTestProviderMap
    };

    // Act
    const adapter = getAiProviderAdapter(testDependencies);

    // Assert
    assertExists(adapter, "Adapter should be created.");
    assertInstanceOf(adapter, DummyAdapter, "Adapter should be a DummyAdapter because of the injected map.");
});

Deno.test("DI Proof: should return real adapter when using the default map", () => {
    // Arrange: This simulates the production path.
    const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
        id: crypto.randomUUID(),
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0,
        output_token_cost_rate: 0,
        tokenization_strategy: { type: 'none' },
    };
    if(!isJson(MOCK_MODEL_CONFIG)) {
        throw new Error('MOCK_MODEL_CONFIG is not a valid JSON object');
    }
    const testDependencies: FactoryDependencies = {
        provider: {
            name: 'openai-gpt-4o',
            api_identifier: 'openai-gpt-4o',
            config: MOCK_MODEL_CONFIG,
            created_at: new Date().toISOString(),
            description: 'Test provider',
            id: crypto.randomUUID(),
            is_active: true,
            is_default_embedding: false,
            is_enabled: true,
            provider: 'test-provider',
            updated_at: new Date().toISOString(),
        },
        apiKey: 'test-api-key',
        logger: new MockLogger(),
        providerMap: defaultProviderMap // Using the real map imported from the factory.
    };

    // Act
    const adapter = getAiProviderAdapter(testDependencies);

    // Assert
    assertExists(adapter, "Adapter should be created.");
    assertInstanceOf(adapter, OpenAiAdapter, "Adapter should be a real OpenAiAdapter.");
});

 