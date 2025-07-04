import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.192.0/testing/mock.ts";
import { handleTokenEstimatorRequest, type TokenEstimatorHandlerDeps } from "./index.ts";
import type { AiModelExtendedConfig, MessageForTokenCounting } from '../_shared/types.ts';
import type { User } from "npm:@supabase/supabase-js@^2.43.4";

// Mock user
const MOCK_USER: User = {
  id: 'test-user-id-tokenestimator',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

// Test model configs
const tiktokenModelConfig: AiModelExtendedConfig = {
  api_identifier: 'gpt-4',
  input_token_cost_rate: 0.03,
  output_token_cost_rate: 0.06,
  hard_cap_output_tokens: 4096,
  tokenization_strategy: {
    type: 'tiktoken',
    api_identifier_for_tokenization: 'gpt-4',
    tiktoken_encoding_name: 'cl100k_base',
    is_chatml_model: true
  }
};

const roughCharCountModelConfig: AiModelExtendedConfig = {
  api_identifier: 'test-model',
  input_token_cost_rate: 0.01,
  output_token_cost_rate: 0.02,
  hard_cap_output_tokens: 2048,
  tokenization_strategy: {
    type: 'rough_char_count',
    chars_per_token_ratio: 4
  }
};

// Helper to create mock request
const createMockRequest = (method: string, body?: unknown, withAuth = true): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (withAuth) {
    headers.set("Authorization", "Bearer mock-token");
  }
  
  return new Request("http://localhost/test", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
};

// Helper to create mock dependencies
const createMockDeps = (options: {
  shouldAuthenticate?: boolean;
  shouldReturnCors?: boolean;
} = {}): TokenEstimatorHandlerDeps => {
  const { shouldAuthenticate = true, shouldReturnCors = false } = options;

  return {
    createSupabaseClient: spy(() => ({
      auth: {
        getUser: spy(() => Promise.resolve({
          data: { user: shouldAuthenticate ? MOCK_USER : null },
          error: shouldAuthenticate ? null : { message: 'Unauthorized' }
        }))
      }
    } as any)),
    
    handleCorsPreflightRequest: spy((req: Request) => {
      if (shouldReturnCors && req.method === 'OPTIONS') {
        return new Response(null, { 
          status: 204,
          headers: { 'access-control-allow-origin': '*' }
        });
      }
      return null;
    }),
    
    createErrorResponse: spy((message: string, status: number) => 
      new Response(JSON.stringify({ error: message }), { 
        status, 
        headers: { 'content-type': 'application/json' } 
      })
    ),
    
    createSuccessResponse: spy((data: unknown, status: number) => 
      new Response(JSON.stringify(data), { 
        status, 
        headers: { 'content-type': 'application/json' } 
      })
    ),
    
    tokenEstimationDeps: {
      createEncoding: spy((encodingName: string) => {
        // Mock encoding that returns reasonable token counts for testing
        if (encodingName === 'cl100k_base') {
          return {
            encode: spy((text: string) => ({ length: Math.ceil(text.length / 4) }))
          };
        }
        throw new Error(`Invalid encoding: ${encodingName}`);
      }),
      logger: {
        info: spy(),
        warn: spy(),
        error: spy()
      } as any
    }
  };
};

Deno.test("tokenEstimator Handler Unit Tests", async (t) => {
  await t.step("should handle CORS preflight", async () => {
    const deps = createMockDeps({ shouldReturnCors: true });
    const req = new Request("http://localhost/test", { method: "OPTIONS" });
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 204);
    assertEquals(response.headers.get('access-control-allow-origin'), '*');
  });

  await t.step("should require authentication", async () => {
    const deps = createMockDeps({ shouldAuthenticate: false });
    const req = createMockRequest("POST", {
      textOrMessages: 'test message',
      modelConfig: tiktokenModelConfig
    }, false); // no auth header
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 401);
    const body = await response.json();
    assertEquals(body.error, 'Authentication required');
  });

  await t.step("should estimate tokens for simple string with tiktoken", async () => {
    const deps = createMockDeps();
    const req = createMockRequest("POST", {
      textOrMessages: 'Hello, how are you today?',
      modelConfig: tiktokenModelConfig
    });
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.estimatedTokens);
    assertEquals(typeof data.estimatedTokens, 'number');
    assertEquals(data.estimatedTokens > 0, true);
  });

  await t.step("should estimate tokens for ChatML messages", async () => {
    const deps = createMockDeps();
    const messages: MessageForTokenCounting[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'The capital of France is Paris.' }
    ];

    const req = createMockRequest("POST", {
      textOrMessages: messages,
      modelConfig: tiktokenModelConfig
    });
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.estimatedTokens);
    assertEquals(typeof data.estimatedTokens, 'number');
    assertEquals(data.estimatedTokens > 0, true);
  });

  await t.step("should estimate tokens with rough character count", async () => {
    const deps = createMockDeps();
    const testText = 'This is a test message that should be roughly 16 characters per token with ratio 4';
    
    const req = createMockRequest("POST", {
      textOrMessages: testText,
      modelConfig: roughCharCountModelConfig
    });
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.estimatedTokens);
    assertEquals(typeof data.estimatedTokens, 'number');
    
    // Should be roughly text.length / 4
    const expectedTokens = Math.ceil(testText.length / 4);
    assertEquals(data.estimatedTokens, expectedTokens);
  });

  await t.step("should handle missing tokenization strategy", async () => {
    const deps = createMockDeps();
    const modelConfigWithoutStrategy: AiModelExtendedConfig = {
      api_identifier: 'test-model',
      input_token_cost_rate: 0.01,
      output_token_cost_rate: 0.02,
      hard_cap_output_tokens: 2048,
      tokenization_strategy: { type: 'none' }
    };

    const req = createMockRequest("POST", {
      textOrMessages: 'test message',
      modelConfig: modelConfigWithoutStrategy
    });
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.estimatedTokens);
    assertEquals(typeof data.estimatedTokens, 'number');
    assertEquals(data.estimatedTokens > 0, true);
  });

  await t.step("should return 400 for missing required fields", async () => {
    const deps = createMockDeps();
    const req = createMockRequest("POST", {
      textOrMessages: 'test message'
      // Missing modelConfig
    });
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'Missing required fields: textOrMessages and modelConfig');
  });

  await t.step("should return 405 for non-POST methods", async () => {
    const deps = createMockDeps();
    const req = createMockRequest("GET");
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 405);
    const data = await response.json();
    assertEquals(data.error, 'Method not allowed');
  });

  await t.step("should handle JSON parsing errors gracefully", async () => {
    const deps = createMockDeps();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer mock-token"
      },
      body: "invalid json",
    });
    
    const response = await handleTokenEstimatorRequest(req, deps);
    
    assertEquals(response.status, 500);
    const data = await response.json();
    assertExists(data.error);
  });
});
