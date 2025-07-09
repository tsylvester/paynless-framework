import { assertEquals, assertExists, assertRejects, assertInstanceOf, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { GoogleAdapter } from './google_adapter.ts';
import type { ChatApiRequest, ILogger, AiModelExtendedConfig } from '../types.ts';

// Mock logger for testing
const mockLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// --- Test Data ---
const MOCK_API_KEY = 'google-test-api-key';
const MOCK_MODEL_ID = 'google-gemini-1.5-pro-latest';
const MOCK_SYSTEM_PROMPT_GOOGLE = "Be concise and helpful.";
const MOCK_CHAT_REQUEST_GOOGLE: ChatApiRequest = {
  message: 'Explain black holes briefly.',
  providerId: 'provider-uuid-google',
  promptId: 'prompt-uuid-google-system',
  chatId: 'chat-uuid-jkl',
  messages: [
    { role: 'system', content: MOCK_SYSTEM_PROMPT_GOOGLE },
    { role: 'user', content: 'Earlier question' },
    { role: 'assistant', content: 'Earlier answer' },
  ],
};

const MOCK_GOOGLE_SUCCESS_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: " A region in spacetime where gravity is so strong nothing escapes, not even light. "
          }
        ],
        role: "model"
      },
      finishReason: "STOP",
      index: 0,
      safetyRatings: [
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", probability: "NEGLIGIBLE" },
        // ... other ratings
      ]
    }
  ],
  // The 'usageMetadata' field is now critical for tests as the adapter uses it for token counts.
  usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 25, totalTokenCount: 40 }
};

const MOCK_GOOGLE_MODELS_RESPONSE = {
  models: [
    {
      name: "models/gemini-1.5-pro-latest",
      version: "1.5-pro-latest",
      displayName: "Gemini 1.5 Pro Latest",
      description: "The latest Gemini 1.5 Pro model.",
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: [
        "generateContent",
        "countTokens"
      ],
      temperature: 0.9,
      topP: 1,
      topK: 1
    },
    {
      name: "models/gemini-1.0-pro",
      version: "1.0-pro",
      displayName: "Gemini 1.0 Pro",
      description: "The standard Gemini 1.0 Pro model.",
      inputTokenLimit: 30720,
      outputTokenLimit: 2048,
      supportedGenerationMethods: [
        "generateContent",
        "countTokens"
      ],
      // ... other fields
    },
    {
      name: "models/text-bison-001", // Older model, may not have generateContent
      version: "001",
      displayName: "Text Bison",
      description: "Legacy text generation model.",
      supportedGenerationMethods: [
        "generateText" // Doesn't support generateContent
      ],
      // ... other fields
    }
  ]
};

const MOCK_GOOGLE_MAX_TOKENS_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [
          { text: "A region in spacetime where gravity is so strong..." } // Partial response
        ],
        role: "model"
      },
      finishReason: "MAX_TOKENS", // Different reason
      index: 0,
      safetyRatings: [ /* ... */ ]
    }
  ]
};

const MOCK_GOOGLE_OTHER_REASON_RESPONSE = {
  candidates: [
    {
      content: { parts: [{ text: "Something went wrong..." }], role: "model" },
      finishReason: "OTHER", // Different reason
      index: 0,
      safetyRatings: [ /* ... */ ]
    }
  ]
};

// Add an interface for the expected token usage structure
interface MockTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// --- Tests ---
Deno.test("GoogleAdapter sendMessage - Success", async () => {
  const mockSuccessfulGenerateContent = {
    // Ensure the mock response includes the usageMetadata field
    ...MOCK_GOOGLE_SUCCESS_RESPONSE
  };

  const mockFetch = stub(globalThis, "fetch", (input: string | URL | Request, _options?: RequestInit) => {
    const urlString = input.toString();
    if (urlString.includes(":generateContent")) {
      return Promise.resolve(
        new Response(JSON.stringify(mockSuccessfulGenerateContent), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    // No longer expecting :countTokens calls
    return Promise.reject(new Error(`Unexpected fetch call in mock: ${urlString}`));
  });

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_GOOGLE, MOCK_MODEL_ID);

    // Assert fetch was called correctly
    assertEquals(mockFetch.calls.length, 1, "Expected only 1 fetch call to generateContent");
    const fetchArgs = mockFetch.calls[0].args;
    const expectedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${MOCK_API_KEY}`;
    assertEquals(fetchArgs[0], expectedUrl);
    assertEquals(fetchArgs[1]?.method, 'POST');
    assertEquals((fetchArgs[1]?.headers as Record<string, string>)['Content-Type'], 'application/json');
    const body = JSON.parse(fetchArgs[1]?.body as string);
    assertEquals(body.contents.length, 3); // History + new message
    // Check system prompt prepended to first user message
    assertEquals(body.contents[0].role, 'user');
    assert(body.contents[0].parts[0].text.includes(MOCK_SYSTEM_PROMPT_GOOGLE), 'System prompt missing from first user message');
    assert(body.contents[0].parts[0].text.includes('Earlier question'), 'Original user content missing from first user message');
    assertEquals(body.contents[1].role, 'model'); // Google uses 'model'
    assertEquals(body.contents[2].role, 'user');
    assertEquals(body.contents[2].parts[0].text, 'Explain black holes briefly.');

    // Assert result structure
    assertExists(result);
    assertEquals(result.role, 'assistant');
    assertEquals(result.content, 'A region in spacetime where gravity is so strong nothing escapes, not even light.'); // Trimmed
    assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST_GOOGLE.providerId);
    assertEquals(result.system_prompt_id, MOCK_CHAT_REQUEST_GOOGLE.promptId);
    
    // Assert token usage is parsed correctly from usageMetadata
    assertExists(result.token_usage, "Token usage should be present");
    const tokenUsage = result.token_usage as unknown as MockTokenUsage;
    assertEquals(tokenUsage.prompt_tokens, MOCK_GOOGLE_SUCCESS_RESPONSE.usageMetadata.promptTokenCount);
    assertEquals(tokenUsage.completion_tokens, MOCK_GOOGLE_SUCCESS_RESPONSE.usageMetadata.candidatesTokenCount);
    assertEquals(tokenUsage.total_tokens, MOCK_GOOGLE_SUCCESS_RESPONSE.usageMetadata.totalTokenCount);

  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter sendMessage - Success with Token Counting", async () => {
  // This test's purpose is now merged with the main "Success" test,
  // as token counting is no longer a separate flow.
  // We will re-purpose this test to ensure that even if `usageMetadata` is missing,
  // the call succeeds with `token_usage: null`.

  const mockGenerateContentResponse = {
    candidates: [
      {
        content: { parts: [{ text: "Test AI response." }], role: "model" },
        finishReason: "STOP",
      },
    ],
    // Deliberately omit usageMetadata to test graceful handling
  };
  
  const mockFetch = stub(globalThis, "fetch", async (input: string | URL | Request, _options?: RequestInit) => {
    const urlString = input.toString();
    if (urlString.includes(":generateContent")) {
      return Promise.resolve(
        new Response(JSON.stringify(mockGenerateContentResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    return Promise.reject(new Error(`Unexpected fetch call: ${urlString}`));
  });

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_GOOGLE, MOCK_MODEL_ID);

    assertEquals(mockFetch.calls.length, 1, "Expected only 1 fetch call to generateContent");
    
    assertExists(result);
    assertEquals(result.content, "Test AI response.");
    assertEquals(result.token_usage, null, "Token usage should be null when usageMetadata is not provided");

  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter sendMessage - API Error", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { code: 400, message: 'Invalid API key', status: 'INVALID_ARGUMENT' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    await assertRejects(
      () => adapter.sendMessage(MOCK_CHAT_REQUEST_GOOGLE, MOCK_MODEL_ID),
      Error,
      "Google Gemini API request failed: 400 - Invalid API key"
    );
  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter sendMessage - Blocked by Safety", async () => {
  const blockedResponse = {
    candidates: [], // No candidates if blocked
    promptFeedback: {
      blockReason: "SAFETY",
      safetyRatings: [
         { category: "HARM_CATEGORY_DANGEROUS_CONTENT", probability: "HIGH" }
      ]
    }
  };
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(blockedResponse), {
        status: 200, // Google might return 200 even if blocked
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    await assertRejects(
      () => adapter.sendMessage(MOCK_CHAT_REQUEST_GOOGLE, MOCK_MODEL_ID),
      Error,
      "Request blocked by Google Gemini due to: SAFETY"
    );
  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter sendMessage - Finish Reason MAX_TOKENS", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(MOCK_GOOGLE_MAX_TOKENS_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_GOOGLE, MOCK_MODEL_ID);

    // Assert that the partial content is returned
    assertEquals(result.content, "A region in spacetime where gravity is so strong...");
    // Assert that the standardized finish reason is 'length'
    assertEquals(result.finish_reason, 'length');
  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter sendMessage - Finish Reason OTHER", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(MOCK_GOOGLE_OTHER_REASON_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_GOOGLE, MOCK_MODEL_ID);

    // Assert that the partial content is returned even with an 'OTHER' reason
    assertEquals(result.content, "Something went wrong...");
    // Assert that the standardized finish reason is 'unknown'
    assertEquals(result.finish_reason, 'unknown');
  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter listModels - Success", async () => {
  // Mocking the main models list and individual model details
  const mockFetch = stub(globalThis, "fetch", (input: string | URL | Request) => {
    const urlString = input.toString();
    if (urlString.includes('/models?key=')) { // Main list call
      return Promise.resolve(new Response(JSON.stringify(MOCK_GOOGLE_MODELS_RESPONSE), { status: 200 }));
    }
    // Individual model detail calls
    const modelNameMatch = urlString.match(/models\/([^?]+)/);
    if (modelNameMatch) {
      const modelId = modelNameMatch[1];
      const modelData = MOCK_GOOGLE_MODELS_RESPONSE.models.find(m => m.name === `models/${modelId}`);
      if (modelData) {
        return Promise.resolve(new Response(JSON.stringify(modelData), { status: 200 }));
      }
    }
    // Fallback for unexpected calls
    return Promise.reject(new Error(`Unexpected fetch call in mock: ${urlString}`));
  });

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    const models = await adapter.listModels();
    
    // We expect 2 models, as one doesn't support 'generateContent'
    assertEquals(models.length, 2);
    // 1 list call + 2 get calls for the valid models
    assertEquals(mockFetch.calls.length, 3); 
    
    const geminiPro = models.find(m => m.api_identifier === 'google-gemini-1.5-pro-latest');
    assertExists(geminiPro);
    assertEquals(geminiPro.name, "Gemini 1.5 Pro Latest");
    assertExists(geminiPro.config, "Config should be populated from getModelDetails");
    
    const config = geminiPro.config as unknown as AiModelExtendedConfig;
    assertEquals(config.context_window_tokens, 1048576);
    assertEquals(config.hard_cap_output_tokens, 8192);

  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter listModels - API Error", async () => {
  const mockFetch = stub(globalThis, "fetch", () => {
    // This will cause the initial list fetch to fail
    return Promise.resolve(new Response("Server Error", { status: 500 }));
  });

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    // The adapter is designed to handle this gracefully and return an empty array
    const models = await adapter.listModels();
    assertEquals(models.length, 0);
  } finally {
    mockFetch.restore();
  }
});

// Test for when getModelDetails fails for one model but not others
Deno.test("GoogleAdapter listModels - Partial Failure in getModelDetails", async () => {
  const mockFetch = stub(globalThis, "fetch", (input: string | URL | Request) => {
    const urlString = input.toString();
    if (urlString.includes('/models?key=')) {
      return Promise.resolve(new Response(JSON.stringify(MOCK_GOOGLE_MODELS_RESPONSE), { status: 200 }));
    }
    
    // This regex now specifically looks for the full model name in the URL
    const modelNameMatch = urlString.match(/models\/(gemini-1\.5-pro-latest|gemini-1\.0-pro)/);
    if (modelNameMatch) {
      const modelId = modelNameMatch[1];
      // Intentionally fail the getModelDetails call for gemini-1.0-pro
      if (modelId === 'gemini-1.0-pro') {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }
      // Succeed for all other valid models
      const modelData = MOCK_GOOGLE_MODELS_RESPONSE.models.find(m => m.name === `models/${modelId}`);
      if (modelData) {
        return Promise.resolve(new Response(JSON.stringify(modelData), { status: 200 }));
      }
    }
    
    return Promise.reject(new Error(`Unexpected fetch call in mock: ${urlString}`));
  });

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    const models = await adapter.listModels();
    
    // Should return only the one successful model that supports generateContent
    assertEquals(models.length, 1);
    assertEquals(models[0].api_identifier, 'google-gemini-1.5-pro-latest');
    // 1 list call + 2 get attempts (one success, one failure for the valid models)
    assertEquals(mockFetch.calls.length, 3); 

  } finally {
    mockFetch.restore();
  }
});

Deno.test("GoogleAdapter sendMessage - API Error (generateContent)", async () => {
  const mockFetch = stub(globalThis, "fetch", () => {
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  try {
    const adapter = new GoogleAdapter(MOCK_API_KEY, mockLogger);
    await assertRejects(
      async () => {
        await adapter.sendMessage(MOCK_CHAT_REQUEST_GOOGLE, MOCK_MODEL_ID);
      },
      Error,
      "Google Gemini API request failed: 400 - Invalid API key"
    );

    // After the change, we only expect one call, which fails.
    assertEquals(mockFetch.calls.length, 1, "Expected only one fetch call");

  } finally {
    mockFetch.restore();
  }
}); 