// supabase/functions/_shared/ai_service/adapter_test_contract.ts
/**
 * This file defines a generic test suite for any AI Provider Adapter.
 * It ensures that all adapters, regardless of the provider they connect to,
 * behave identically from the perspective of the application. This guarantees
 * true interchangeability.
 *
 * To use this, a provider-specific test file (e.g., openai_adapter.test.ts) will:
 * 1. Import this function.
 * 2. Create a parent `Deno.test` block.
 * 3. Within that block, create mock data, stubs, and a mock API handler.
 * 4. `await` this function, passing the test context `t`, the Adapter class, the mock API, and a valid config.
 */
import { assert, assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { AiProviderAdapter, ChatApiRequest, AdapterResponsePayload, ProviderModelInfo } from '../types.ts';
import { MockLogger } from '../logger.mock.ts';
import { Tables } from "../../types_db.ts";

/**
 * A generic interface for a mock provider API.
 * Each provider's test suite will create an object that conforms to this,
 * allowing the contract test to mock the underlying API calls.
 */
export interface MockApi {
  sendMessage: (request: ChatApiRequest, modelIdentifier: string) => Promise<AdapterResponsePayload>;
  listModels: () => Promise<ProviderModelInfo[]>;
}

// Reusable mock data
const MOCK_API_KEY = 'test-api-key';
const MOCK_CHAT_REQUEST: ChatApiRequest = {
    message: 'Hello, world!',
    providerId: 'provider-uuid-test',
    promptId: 'prompt-uuid-test',
    chatId: 'chat-uuid-test',
    messages: [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
    ],
};
const MOCK_LOGGER = new MockLogger();

/**
 * Defines and runs the standardized test suite for any AI Provider Adapter.
 * @param t - The Deno test context from the calling test.
 * @param AdapterClass - The adapter class to test (e.g., OpenAiAdapter).
 * @param mockApi - A provider-specific implementation of MockApi to handle API call simulations.
 * @param provider - The provider object from the database.
 */
export async function testAdapterContract(
    t: Deno.TestContext,
    AdapterClass: AiProviderAdapter,
    mockApi: MockApi,
    provider: Tables<'ai_providers'>,
) {
    const modelId = provider.api_identifier;

    await t.step(`[Contract] ${AdapterClass.name} - Instantiation`, () => {
        const adapter = new AdapterClass(provider, MOCK_API_KEY, MOCK_LOGGER);
        assertExists(adapter, "Adapter should instantiate successfully.");
        assertExists(adapter.sendMessage, "Adapter should have a sendMessage method.");
        assertExists(adapter.listModels, "Adapter should have a listModels method.");
    });

    await t.step(`[Contract] ${AdapterClass.name} - sendMessage: Success`, async () => {
        const sendMessageSpy = spy(mockApi, 'sendMessage');
        try {
            const adapter = new AdapterClass(provider, MOCK_API_KEY, MOCK_LOGGER);
            const result = await adapter.sendMessage(MOCK_CHAT_REQUEST, modelId);
            
            assertEquals(sendMessageSpy.calls.length, 1, "sendMessage should be called once on the mock API.");
            assertExists(result);
            assertEquals(result.role, 'assistant');
            assertExists(result.content);
            assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST.providerId);
        } finally {
            sendMessageSpy.restore();
        }
    });

    await t.step(`[Contract] ${AdapterClass.name} - sendMessage: API Error`, async () => {
        const apiError = new Error("Mock API Error: 500 Internal Server Error");
        // We stub the MOCK, not the adapter, because the adapter's prototype is already stubbed
        // in the calling test file to point to this mock.
        const sendMessageStub = stub(mockApi, 'sendMessage', () => Promise.reject(apiError));
        try {
            const adapter = new AdapterClass(provider, MOCK_API_KEY, MOCK_LOGGER);
            await assertRejects(
                () => adapter.sendMessage(MOCK_CHAT_REQUEST, modelId),
                Error,
                "Mock API Error"
            );
        } finally {
            sendMessageStub.restore();
        }
    });

    await t.step(`[Contract] ${AdapterClass.name} - sendMessage: Respects max_tokens_to_generate`, async () => {
        const sendMessageSpy = spy(mockApi, 'sendMessage');
        try {
            const adapter = new AdapterClass(provider, MOCK_API_KEY, MOCK_LOGGER);
            const requestWithMaxTokens: ChatApiRequest = {
                ...MOCK_CHAT_REQUEST,
                max_tokens_to_generate: 100,
            };
            await adapter.sendMessage(requestWithMaxTokens, modelId);

            assertEquals(sendMessageSpy.calls.length, 1);
        } finally {
            sendMessageSpy.restore();
        }
    });

    await t.step(`[Contract] ${AdapterClass.name} - sendMessage: Throws on excessive prompt tokens`, async () => {
        // This test remains a placeholder until token counting is standardized in the adapters.
        const config = provider.config;
        if (typeof config !== 'object' || config === null || Array.isArray(config)) {
            throw new Error("Provider config is not a valid JSON object");
        }
        const smallModelProvider: Tables<'ai_providers'> = {
            ...provider,
            config: {
                ...config,
                provider_max_input_tokens: 5, 
            }
        };
        const adapter = new AdapterClass(smallModelProvider, MOCK_API_KEY, MOCK_LOGGER);
        await adapter.sendMessage(MOCK_CHAT_REQUEST, modelId); // Should not throw yet
    });

    await t.step(`[Contract] ${AdapterClass.name} - listModels: Success`, async () => {
        const listModelsSpy = spy(mockApi, 'listModels');
        try {
            const adapter = new AdapterClass(provider, MOCK_API_KEY, MOCK_LOGGER);
            const result = await adapter.listModels();

            assertEquals(listModelsSpy.calls.length, 1);
            assertExists(result);
            assert(Array.isArray(result));
        } finally {
            listModelsSpy.restore();
        }
    });

    await t.step(`[Contract] ${AdapterClass.name} - listModels: API Error`, async () => {
        const apiError = new Error("Mock API Error: Failed to fetch models");
        const listModelsStub = stub(mockApi, 'listModels', () => Promise.reject(apiError));
        try {
            const adapter = new AdapterClass(provider, MOCK_API_KEY, MOCK_LOGGER);
            await assertRejects(
                () => adapter.listModels(),
                Error,
                "Mock API Error"
            );
        } finally {
            listModelsStub.restore();
        }
    });
}
