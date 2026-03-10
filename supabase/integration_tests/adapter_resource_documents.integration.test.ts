/**
 * Integration tests for provider-specific resourceDocuments formatting.
 * Proves each adapter correctly formats resourceDocuments for its provider
 * and that documents reach the model (via mock/spy on provider API call).
 */
import "npm:openai/shims/web";
import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import type { Message, MessageParam } from "npm:@anthropic-ai/sdk/resources/messages";
import { APIPromise } from "npm:@anthropic-ai/sdk/core/api-promise";
import { GoogleGenerativeAI, FinishReason, ChatSession } from "npm:@google/generative-ai";
import type {
  GenerateContentResult,
  Part,
  GenerateContentStreamResult,
  Content,
  SingleRequestOptions,
} from "npm:@google/generative-ai";
import OpenAI from "npm:openai";
import type { ChatCompletion, ChatCompletionCreateParams, ChatCompletionMessageParam } from "npm:openai/resources/chat/completions";
import { APIPromise as OpenAiAPIPromise } from "npm:openai/core";
import type { FinalRequestOptions } from "npm:openai/core";

import { AnthropicAdapter } from "../functions/_shared/ai_service/anthropic_adapter.ts";
import { GoogleAdapter } from "../functions/_shared/ai_service/google_adapter.ts";
import { OpenAiAdapter } from "../functions/_shared/ai_service/openai_adapter.ts";
import type { ChatApiRequest } from "../functions/_shared/types.ts";
import type { AiModelExtendedConfig, GeminiSendMessagePart, GoogleStartChatStubReturn } from "../functions/_shared/types.ts";
import { MockLogger } from "../functions/_shared/logger.mock.ts";
import type { Tables, Json } from "../functions/types_db.ts";
import { isJson, isRecord } from "../functions/_shared/utils/type_guards.ts";

/** Return type of GoogleGenerativeAI.getGenerativeModel; stub must satisfy this. */
type GenerativeModel = ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

const mockLogger = new MockLogger();

const ANTHROPIC_CONFIG: AiModelExtendedConfig = {
  api_identifier: "claude-3-opus-20240229",
  input_token_cost_rate: 0,
  output_token_cost_rate: 0,
  tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-3-opus-20240229" },
};

const GOOGLE_CONFIG: AiModelExtendedConfig = {
  api_identifier: "gemini-1.5-pro-latest",
  input_token_cost_rate: 0,
  output_token_cost_rate: 0,
  tokenization_strategy: { type: "google_gemini_tokenizer" },
};

const OPENAI_CONFIG: AiModelExtendedConfig = {
  api_identifier: "gpt-4o",
  input_token_cost_rate: 0,
  output_token_cost_rate: 0,
  tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
};

if(!isJson(ANTHROPIC_CONFIG)) {
  throw new Error('ANTHROPIC_CONFIG is not a valid JSON object');
}
const ANTHROPIC_PROVIDER: Tables<"ai_providers"> = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
  provider: "anthropic",
  api_identifier: "anthropic-claude-3-opus-20240229",
  name: "Anthropic Claude 3 Opus",
  description: "Mock",
  is_active: true,
  is_default_embedding: false,
  is_enabled: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  config: ANTHROPIC_CONFIG,
};

if(!isJson(GOOGLE_CONFIG)) {
  throw new Error('GOOGLE_CONFIG is not a valid JSON object');
}
const GOOGLE_PROVIDER: Tables<"ai_providers"> = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
  provider: "google",
  api_identifier: "google-gemini-1.5-pro-latest",
  name: "Google Gemini",
  description: "Mock",
  is_active: true,
  is_default_embedding: false,
  is_enabled: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  config: GOOGLE_CONFIG,
};

if(!isJson(OPENAI_CONFIG)) {
  throw new Error('OPENAI_CONFIG is not a valid JSON object');
}
const OPENAI_PROVIDER: Tables<"ai_providers"> = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
  provider: "openai",
  api_identifier: "openai-gpt-4o",
  name: "OpenAI GPT-4o",
  description: "Mock",
  is_active: true,
  is_default_embedding: false,
  is_enabled: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  config: OPENAI_CONFIG,
};

const MOCK_ANTHROPIC_MESSAGE: Message = {
  id: "msg-test",
  type: "message",
  role: "assistant",
  model: "claude-3-opus-20240229",
  content: [{ type: "text", text: "Ok", citations: [] }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 0 },
    service_tier: "standard",
  },
};

function createAnthropicMessagePromise(msg: Message): APIPromise<Message> {
  const client = new Anthropic({ apiKey: "sk-ant-test" });
  const response = new Response(JSON.stringify(msg), { headers: {} });
  type ResponsePromise = ConstructorParameters<typeof APIPromise>[1];
  const props: Awaited<ResponsePromise> = {
    response,
    options: { method: "post", path: "/v1/messages" },
    controller: new AbortController(),
    requestLogID: "test",
    retryOfRequestLogID: undefined,
    startTime: Date.now(),
  };
  const responsePromise: ResponsePromise = Promise.resolve(props);
  const parseResponse = (): Message => msg;
  return new APIPromise<Message>(client, responsePromise, parseResponse);
}

function isGeminiPartsArray(val: unknown): val is GeminiSendMessagePart[] {
  if (!Array.isArray(val)) return false;
  return val.every((p) => typeof p === "object" && p !== null && ("text" in p || "inlineData" in p));
}

function createGoogleStubModel(captured: { current: unknown }): GenerativeModel {
  const stubResponse: GenerateContentResult["response"] = {
    candidates: [{ index: 0, content: { role: "model", parts: [] }, finishReason: FinishReason.STOP }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    text: () => "ok",
    functionCall: () => undefined,
    functionCalls: () => undefined,
  };
  const sendMessageReturn = async (_request: string | (string | Part)[]): Promise<GenerateContentResult> => {
    captured.current = _request;
    return { response: stubResponse };
  };
  class StubChatSession extends ChatSession {
    private sendMessageFn: (request: string | (string | Part)[]) => Promise<GenerateContentResult>;
    private stubResp: GenerateContentResult["response"];
    constructor(
      sendMessageFn: (request: string | (string | Part)[]) => Promise<GenerateContentResult>,
      stubResp: GenerateContentResult["response"],
    ) {
      super("", "test", undefined, undefined);
      this.sendMessageFn = sendMessageFn;
      this.stubResp = stubResp;
    }
    sendMessage(
      request: string | (string | Part)[],
      _requestOptions?: SingleRequestOptions,
    ): Promise<GenerateContentResult> {
      return this.sendMessageFn(request);
    }
    getHistory(): Promise<Content[]> {
      return Promise.resolve([]);
    }
    sendMessageStream(
      _request: string | (string | Part)[],
      _requestOptions?: SingleRequestOptions,
    ): Promise<GenerateContentStreamResult> {
      return Promise.resolve({
        stream: (async function* () {})(),
        response: Promise.resolve(this.stubResp),
      });
    }
  }
  const stubModel: GenerativeModel = {
    apiKey: "",
    _requestOptions: {},
    model: "",
    generationConfig: {},
    startChat: () => new StubChatSession(sendMessageReturn, stubResponse),
  };
  return stubModel;
}

const MOCK_OPENAI_CHAT_COMPLETION: ChatCompletion = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o",
  choices: [{ index: 0, message: { role: "assistant", content: "Ok", refusal: null }, logprobs: null, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function getMessageTextContent(msg: ChatCompletionMessageParam): string {
  const content: unknown = Object.getOwnPropertyDescriptor(msg, "content")?.value;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const text: unknown = Object.getOwnPropertyDescriptor(part, "text")?.value;
    if (typeof text === "string") out += text;
  }
  return out;
}

function buildOpenAiResponseProps(): Awaited<ConstructorParameters<typeof OpenAiAPIPromise>[0]> {
  const response = new Response();
  const options: FinalRequestOptions = { method: "post", path: "/v1/chat/completions" };
  const controller = new AbortController();
  // SDK expects Response with buffer/size/textConverted/timeout; Web Response is minimal test double.
  return { response, options, controller };
}

function createOpenAiChatPromise(resp: ChatCompletion): OpenAiAPIPromise<ChatCompletion> {
  const responsePromise = Promise.resolve(buildOpenAiResponseProps());
  const parseResponse = (_props: Awaited<ConstructorParameters<typeof OpenAiAPIPromise>[0]>): Promise<ChatCompletion & { requestId: string }> =>
    Promise.resolve(Object.assign({}, resp, { requestId: "test" }));
  // Test double: response shape is minimal; SDK expects extended Response (buffer, size, etc.).
  return new OpenAiAPIPromise<ChatCompletion>(responsePromise, parseResponse);
}

function isChatCompletionCreateParams(val: unknown): val is ChatCompletionCreateParams {
  if (typeof val !== "object" || val === null) return false;
  const messages: unknown = Object.getOwnPropertyDescriptor(val, "messages")?.value;
  return Array.isArray(messages);
}

/** Document content block shape produced by AnthropicAdapter for resourceDocuments (type, title, context). */
interface AnthropicDocumentContentBlock {
  type: "document";
  source: { type: string; media_type: string; data: string };
  title: string;
  context: string;
}

/** Element type of MessageParam.content so filter narrows correctly. */
type ContentBlockParam = (NonNullable<MessageParam["content"]>)[number];

function isAnthropicDocumentBlock(c: ContentBlockParam): c is AnthropicDocumentContentBlock {
  return isRecord(c) && c["type"] === "document" && typeof c["title"] === "string" && typeof c["context"] === "string";
}

describe("adapter resourceDocuments integration", () => {
  it("AnthropicAdapter includes document content blocks with title/context", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () =>
      createAnthropicMessagePromise(MOCK_ANTHROPIC_MESSAGE)
    );

    try {
      const adapter = new AnthropicAdapter(ANTHROPIC_PROVIDER, "sk-ant-test", mockLogger);
      const request: ChatApiRequest = {
        message: "User prompt",
        providerId: "test",
        promptId: "__none__",
        resourceDocuments: [
          { id: "d1", content: "Doc A", document_key: "business_case", stage_slug: "thesis" },
          { content: "Doc B", document_key: "feature_spec", stage_slug: "thesis" },
        ],
      };

      await adapter.sendMessage(request, ANTHROPIC_PROVIDER.api_identifier);

      assertEquals(messagesCreateStub.calls.length, 1);
      const callArgs = messagesCreateStub.calls[0].args[0];
      assert(isRecord(callArgs) && Array.isArray(callArgs.messages), "messages must be array");
      const firstMessage = callArgs.messages[0];
      assert(Array.isArray(firstMessage.content), "First message content must be array");
      const content = firstMessage.content;
      const documentBlocks: AnthropicDocumentContentBlock[] = content.filter(isAnthropicDocumentBlock);
      assert(documentBlocks.length >= 2, "Must have at least 2 document blocks");
      assert(documentBlocks[0].title === "business_case", "First block title must be document_key");
      assert(documentBlocks[0].context === "thesis", "First block context must be stage_slug");
      assert(documentBlocks[1].title === "feature_spec", "Second block title must be document_key");
    } finally {
      messagesCreateStub.restore();
    }
  });

  it("GoogleAdapter includes inline_data parts with text/plain", async () => {
    const captured: { current: unknown } = { current: undefined };
    const getModelStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function (): GenerativeModel {
      return createGoogleStubModel(captured);
    });

    try {
      const adapter = new GoogleAdapter(GOOGLE_PROVIDER, "sk-google-test", mockLogger);
      const request: ChatApiRequest = {
        message: "User prompt",
        providerId: "test",
        promptId: "__none__",
        resourceDocuments: [
          { id: "d1", content: "Doc A", document_key: "business_case", stage_slug: "thesis" },
          { content: "Doc B", document_key: "feature_spec", stage_slug: "thesis" },
        ],
      };

      await adapter.sendMessage(request, GOOGLE_PROVIDER.api_identifier);

      assertExists(captured.current, "sendMessage must be called with parts");
      if (!isGeminiPartsArray(captured.current)) {
        throw new Error("parts must be GeminiSendMessagePart[]");
      }
      const parts = captured.current;
      const inlineDataParts = parts.filter((p) => p.inlineData != null);
      assert(inlineDataParts.length >= 2, "Must have at least 2 inlineData parts");
      assertEquals(inlineDataParts[0].inlineData?.mimeType, "text/plain");
      assertEquals(inlineDataParts[0].inlineData?.data, "Doc A");
      assertEquals(inlineDataParts[1].inlineData?.mimeType, "text/plain");
    } finally {
      getModelStub.restore();
    }
  });

  it("OpenAiAdapter includes labeled text in messages", async () => {
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
      createOpenAiChatPromise(MOCK_OPENAI_CHAT_COMPLETION)
    );

    try {
      const adapter = new OpenAiAdapter(OPENAI_PROVIDER, "sk-test-key", mockLogger);
      const request: ChatApiRequest = {
        message: "User prompt",
        providerId: "test",
        promptId: "__none__",
        resourceDocuments: [
          { id: "d1", content: "Doc A", document_key: "business_case", stage_slug: "thesis" },
          { content: "Doc B", document_key: "feature_spec", stage_slug: "thesis" },
        ],
      };

      await adapter.sendMessage(request, OPENAI_PROVIDER.api_identifier);

      assertEquals(chatCreateStub.calls.length, 1);
      const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
      assert(isChatCompletionCreateParams(payloadUnknown), "payload must be ChatCompletionCreateParams");
      const payload: ChatCompletionCreateParams = payloadUnknown;
      const allContent = payload.messages.map(getMessageTextContent).join("\n");
      assert(allContent.includes("[Document:"), "Document label must be present");
      assert(allContent.includes("from thesis]"), "Stage must be present in label");
      assert(allContent.includes("business_case"), "document_key must be present");
      assert(allContent.includes("Doc A"), "Document content must appear as text");
      assert(allContent.includes("User prompt"), "User message must be present");
    } finally {
      chatCreateStub.restore();
    }
  });

  it("Empty resourceDocuments does not break any adapter", async () => {
    const requestEmpty: ChatApiRequest = {
      message: "User prompt",
      providerId: "test",
      promptId: "__none__",
      resourceDocuments: [],
    };

    const anthropicStub = stub(Anthropic.Messages.prototype, "create", () =>
      createAnthropicMessagePromise(MOCK_ANTHROPIC_MESSAGE)
    );
    try {
      const anthropicAdapter = new AnthropicAdapter(ANTHROPIC_PROVIDER, "sk-ant-test", mockLogger);
      const anthropicResult = await anthropicAdapter.sendMessage(requestEmpty, ANTHROPIC_PROVIDER.api_identifier);
      assert(anthropicResult.content != null, "AnthropicAdapter must return content");
    } finally {
      anthropicStub.restore();
    }

    const googleCaptured: { current: unknown } = { current: undefined };
    const googleStub = stub(GoogleGenerativeAI.prototype, "getGenerativeModel", function (): GenerativeModel {
      return createGoogleStubModel(googleCaptured);
    });
    try {
      const googleAdapter = new GoogleAdapter(GOOGLE_PROVIDER, "sk-google-test", mockLogger);
      const googleResult = await googleAdapter.sendMessage(requestEmpty, GOOGLE_PROVIDER.api_identifier);
      assert(googleResult.content != null, "GoogleAdapter must return content");
      if (isGeminiPartsArray(googleCaptured.current)) {
        const inlineParts = googleCaptured.current.filter((p) => p.inlineData != null);
        assertEquals(inlineParts.length, 0, "Empty resourceDocuments must not add inlineData parts");
      }
    } finally {
      googleStub.restore();
    }

    const openaiStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
      createOpenAiChatPromise(MOCK_OPENAI_CHAT_COMPLETION)
    );
    try {
      const openaiAdapter = new OpenAiAdapter(OPENAI_PROVIDER, "sk-test-key", mockLogger);
      const openaiResult = await openaiAdapter.sendMessage(requestEmpty, OPENAI_PROVIDER.api_identifier);
      assert(openaiResult.content != null, "OpenAiAdapter must return content");
      const payloadUnknownOpenAi: unknown = openaiStub.calls[0].args[0];
      if (isChatCompletionCreateParams(payloadUnknownOpenAi)) {
        assertEquals(payloadUnknownOpenAi.messages.length, 1, "Empty resourceDocuments must not add extra messages");
      }
    } finally {
      openaiStub.restore();
    }
  });
});
