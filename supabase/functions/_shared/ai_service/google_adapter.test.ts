// supabase/functions/_shared/ai_service/google_adapter.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "npm:@google/generative-ai";

import { GoogleAdapter } from './google_adapter.ts';
import { testAdapterContract, type MockApi } from './adapter_test_contract.ts';
import type {
    AdapterResponsePayload,
    ChatApiRequest,
    ProviderModelInfo,
    AiModelExtendedConfig,
    GeminiSendMessagePart,
    GoogleGetGenerativeModelStubReturn,
    GoogleGenerationConfigCapture,
    GoogleStartChatStubReturn,
} from "../types.ts";
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

function isGeminiPartsArray(val: unknown): val is GeminiSendMessagePart[] {
    if (!Array.isArray(val)) return false;
    return val.every((p) => typeof p === 'object' && p !== null && ('text' in p || 'inlineData' in p));
}

function isGoogleGenerationConfigCapture(val: unknown): val is GoogleGenerationConfigCapture {
    if (val === null || typeof val !== 'object') return false;
    const mt = Object.getOwnPropertyDescriptor(val, 'maxOutputTokens')?.value;
    return mt === undefined || typeof mt === 'number';
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
    let capturedGenerationConfig: unknown = undefined;

    const createStubReturn = (): GoogleGetGenerativeModelStubReturn => ({
        startChat: (opts: { history?: unknown; generationConfig?: GoogleGenerationConfigCapture }) => {
            capturedGenerationConfig = opts?.generationConfig;
            const sendMessageReturn: GoogleStartChatStubReturn['sendMessage'] = async () => ({
                response: {
                    candidates: [{ finishReason: 'STOP' }],
                    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
                    text: () => 'ok',
                },
            });
            return { sendMessage: sendMessageReturn };
        },
    });

    // Stub returns minimal shape; SDK expects full GenerativeModel. Adapter only uses startChat/sendMessage.
    // @ts-expect-error - stub intentionally returns minimal test double, not full GenerativeModel
    const getModelStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function (): GoogleGetGenerativeModelStubReturn {
        return createStubReturn();
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

        if (capturedGenerationConfig === undefined) throw new Error('expected generationConfig to be captured');
        if (!isGoogleGenerationConfigCapture(capturedGenerationConfig)) throw new Error('captured value must be GoogleGenerationConfigCapture');
        const cfg: GoogleGenerationConfigCapture = capturedGenerationConfig;
        assert(cfg.maxOutputTokens === 123, 'generationConfig.maxOutputTokens must equal client cap');
    } finally {
        getModelStub.restore();
    }
});

// --- resourceDocuments tests ---

function createResourceDocumentsStubReturn(capturedParts: { current: unknown }): GoogleGetGenerativeModelStubReturn {
    const sendMessageReturn: GoogleStartChatStubReturn['sendMessage'] = async (parts: unknown) => {
        capturedParts.current = parts;
        return {
            response: {
                candidates: [{ finishReason: 'STOP' }],
                usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
                text: () => 'ok',
            },
        };
    };
    return {
        startChat: () => ({ sendMessage: sendMessageReturn }),
    };
}

Deno.test("GoogleAdapter - resourceDocuments: when present appear as inlineData parts in API call", async () => {
    const captured: { current: unknown } = { current: undefined };
    // @ts-expect-error - stub returns minimal test double, not full GenerativeModel
    const getModelStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function (): GoogleGetGenerativeModelStubReturn {
        return createResourceDocumentsStubReturn(captured);
    });

    try {
        const adapter = new GoogleAdapter(MOCK_PROVIDER, 'sk-google-test', new MockLogger());
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [
                { id: 'd1', content: 'Doc A content', document_key: 'business_case', stage_slug: 'thesis' },
                { id: 'd2', content: 'Doc B content', document_key: 'feature_spec', stage_slug: 'thesis' },
            ],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        assertExists(captured.current, 'sendMessage must be called with parts');
        if (!isGeminiPartsArray(captured.current)) throw new Error('sendMessage parts must be GeminiSendMessagePart[]');
        const parts: GeminiSendMessagePart[] = captured.current;
        const textParts = parts.filter((p) => p.text != null);
        assert(textParts.length >= 2, 'Must have at least 2 text parts');
        assertEquals(textParts[0].text, '[Document: business_case from thesis]');
        assertEquals(textParts[1].text, 'Doc A content');
        assertEquals(textParts[2].text, '[Document: feature_spec from thesis]');
        assertEquals(textParts[3].text, 'Doc B content');
    } finally {
        getModelStub.restore();
    }
});

Deno.test("GoogleAdapter - resourceDocuments: mime_type is text/plain", async () => {
    const captured: { current: unknown } = { current: undefined };
    // @ts-expect-error - stub returns minimal test double, not full GenerativeModel
    const getModelStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function (): GoogleGetGenerativeModelStubReturn {
        return createResourceDocumentsStubReturn(captured);
    });

    try {
        const adapter = new GoogleAdapter(MOCK_PROVIDER, 'sk-google-test', new MockLogger());
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [{ content: 'Doc content', document_key: 'key', stage_slug: 'thesis' }],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        if (!isGeminiPartsArray(captured.current)) throw new Error('sendMessage parts must be GeminiSendMessagePart[]');
        const parts: GeminiSendMessagePart[] = captured.current;
        const withText = parts.find((p) => p.text != null);
        assert(withText != null, 'Must have text part');
        assertEquals(withText.text, '[Document: key from thesis]');
        assertEquals(withText.text, '[Document: key from thesis]');
    } finally {
        getModelStub.restore();
    }
});

Deno.test("GoogleAdapter - resourceDocuments: document label text precedes each inlineData", async () => {
    const captured: { current: unknown } = { current: undefined };
    // @ts-expect-error - stub returns minimal test double, not full GenerativeModel
    const getModelStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function (): GoogleGetGenerativeModelStubReturn {
        return createResourceDocumentsStubReturn(captured);
    });

    try {
        const adapter = new GoogleAdapter(MOCK_PROVIDER, 'sk-google-test', new MockLogger());
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [{ content: 'Doc content', document_key: 'key', stage_slug: 'thesis' }],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        if (!isGeminiPartsArray(captured.current)) throw new Error('sendMessage parts must be GeminiSendMessagePart[]');
        const parts: GeminiSendMessagePart[] = captured.current;
    // Proposed fix for lines 250-256
    const labelPart = parts.find((p) => p.text != null && p.text.includes('[Document:') && p.text.includes('from'));
    // Find a text part that is NOT the label we just found
    const contentPart = parts.find((p) => p.text != null && p !== labelPart && !p.text?.includes('[Document:'));

    assert(labelPart != null, 'Must have label text part');
    assert(contentPart != null, 'Must have content text part');
    const labelIdx = parts.indexOf(labelPart);
    const textIdx = parts.indexOf(contentPart);
    assert(labelIdx < textIdx, 'Document label text must precede text part');
    } finally {
        getModelStub.restore();
    }
});

Deno.test("GoogleAdapter - resourceDocuments: empty resourceDocuments does not add extra parts", async () => {
    const captured: { current: unknown } = { current: undefined };
    // @ts-expect-error - stub returns minimal test double, not full GenerativeModel
    const getModelStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function (): GoogleGetGenerativeModelStubReturn {
        return createResourceDocumentsStubReturn(captured);
    });

    try {
        const adapter = new GoogleAdapter(MOCK_PROVIDER, 'sk-google-test', new MockLogger());
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        if (!isGeminiPartsArray(captured.current)) throw new Error('sendMessage parts must be GeminiSendMessagePart[]');
        const parts: GeminiSendMessagePart[] = captured.current;
        const textParts = parts.filter((p) => p.text != null);
        assertEquals(textParts.length, 1, 'Must not add additional text parts when resourceDocuments is empty');
    } finally {
        getModelStub.restore();
    }
});