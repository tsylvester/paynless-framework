// supabase/functions/_shared/ai_service/google_adapter.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "npm:@google/generative-ai";

import { GoogleAdapter } from './google_adapter.ts';
import { testAdapterContract, type MockApi } from './adapter_test_contract.ts';
import type { AdapterResponsePayload, ChatApiRequest, ProviderModelInfo, AiModelExtendedConfig } from "../types.ts";
import { MockLogger } from "../logger.mock.ts";
import { Tables } from "../../types_db.ts";
import { isJson } from "../utils/type_guards.ts";

// --- Mock Data & Helpers ---

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'gemini-1.5-pro-latest',
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { type: 'google_gemini_tokenizer' },
};
const mockLogger = new MockLogger();

if(!isJson(MOCK_MODEL_CONFIG)) {
    throw new Error('MOCK_MODEL_CONFIG is not a valid JSON object');
}

const MOCK_PROVIDER: Tables<'ai_providers'> = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15", // Unique mock ID
    provider: "google",
    api_identifier: "google-gemini-1.5-pro-latest",
    name: "Google Gemini 1.5 Pro",
    description: "A mock Google model for testing.",
    is_active: true,
    is_default_embedding: false,
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: MOCK_MODEL_CONFIG,
};

// This is the mock API that the test contract will spy on.
const mockGoogleApi: MockApi = {
    sendMessage: async (request: ChatApiRequest): Promise<AdapterResponsePayload> => {
        return {
            role: 'assistant',
            content: 'Mock response from Google API',
            ai_provider_id: request.providerId,
            system_prompt_id: request.promptId,
            token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            finish_reason: 'stop',
        };
    },
    listModels: async (): Promise<ProviderModelInfo[]> => {
        // Since the adapter's listModels is a placeholder, the mock can return an empty array.
        return [];
    }
};

// --- Contract Test Suite ---

Deno.test("GoogleAdapter: Contract Compliance", async (t) => {
    let sendMessageStub: Stub<GoogleAdapter>;
    let listModelsStub: Stub<GoogleAdapter>;

    await t.step("Setup: Stub adapter prototype", () => {
        sendMessageStub = stub(GoogleAdapter.prototype, "sendMessage", (req, modelId) => mockGoogleApi.sendMessage(req, modelId));
        listModelsStub = stub(GoogleAdapter.prototype, "listModels", () => mockGoogleApi.listModels());
    });

    await testAdapterContract(t, GoogleAdapter, mockGoogleApi, MOCK_PROVIDER);

    await t.step("Teardown: Restore stubs", () => {
        sendMessageStub.restore();
        listModelsStub.restore();
    });
});

// --- Provider-Specific Behavior Tests ---
// This test is no longer needed as the core logic is now encapsulated in the SDK,
// and the paradoxical fetch behavior is gone. The contract test is sufficient.
// We can add specific tests here later if the adapter develops more complex,
// non-SDK logic (e.g., custom message processing).

Deno.test("GoogleAdapter - Specific: forwards client cap to generationConfig.maxOutputTokens", async () => {
    // Capture generationConfig passed into startChat
    let capturedGenerationConfig: unknown = undefined;

    // Stub the SDK chain: getGenerativeModel().startChat({ generationConfig }).sendMessage(...)
    const getModelStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function () {
        return {
            startChat: (opts: { history: unknown; generationConfig?: { maxOutputTokens?: number } }) => {
                capturedGenerationConfig = opts?.generationConfig;
                return {
                    sendMessage: async () => ({
                        response: {
                            candidates: [{ finishReason: 'STOP' }],
                            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
                            text: () => 'ok',
                        },
                    }),
                } as unknown as ReturnType<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["startChat"]>;
            },
        } as unknown as ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
    });

    try {
        const adapter = new GoogleAdapter(MOCK_PROVIDER, 'sk-google-test', new MockLogger());
        const request: ChatApiRequest = {
            message: 'hi',
            providerId: 'prov',
            promptId: '__none__',
            max_tokens_to_generate: 123,
            messages: [ { role: 'user', content: 'hello' } ],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        // Adapter should map request.max_tokens_to_generate -> generationConfig.maxOutputTokens
        const cfg = capturedGenerationConfig as { maxOutputTokens?: number } | undefined;
        assert(cfg && cfg.maxOutputTokens === 123, 'generationConfig.maxOutputTokens must equal client cap');
    } finally {
        getModelStub.restore();
    }
});