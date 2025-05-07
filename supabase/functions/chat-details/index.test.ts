import {
  assertSpyCall,
  spy,
  stub,
  type Spy,
  type Stub,
} from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";

// Import the specific handler and HandlerError
import { mainHandler } from "./index.ts";
import { HandlerError } from '../api-subscriptions/handlers/current.ts';
// Import the shared ChatMessage type
import type { ChatMessage } from '../_shared/types.ts';

// --- Test Setup ---
let envStub: Stub | undefined;

const mockSupabaseUrl = "http://mock-supabase.co";
const mockAnonKey = "mock-anon-key";
const mockUserId = 'user-details-123';
const mockChatId = 'chat-details-abc';

const setup = () => {
  console.log("[Test Setup] Stubbing Deno.env.get for chat-details/index.ts");
  envStub = stub(Deno.env, "get", (key) => {
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    return undefined;
  });
};

const teardown = () => {
  if (envStub) {
    envStub.restore();
    console.log("[Test Teardown] Restored Deno.env.get");
  }
};

// --- Test Data ---
const mockMessages: ChatMessage[] = [
  { id: 'msg-1', chat_id: mockChatId, user_id: mockUserId, role: 'user', content: 'First message', created_at: new Date(Date.now() - 10000).toISOString(), ai_provider_id: null, system_prompt_id: null, token_usage: null },
  { id: 'msg-2', chat_id: mockChatId, user_id: null, role: 'assistant', content: 'First response', created_at: new Date().toISOString(), ai_provider_id: null, system_prompt_id: null, token_usage: null },
];

// --- Test Suite ---
Deno.test("Chat Details Function - mainHandler Logic Tests", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  setup();

  await t.step("should return messages array on success", async () => {
    const mockConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        chat_messages: {
          select: () => Promise.resolve({ data: mockMessages, error: null })
        }
      }
    };
    const { client: mockClient } = createMockSupabaseClient(mockConfig);

    const result = await mainHandler(mockClient, mockUserId, mockChatId);

    assertEquals(Array.isArray(result), true, "Response should be an array");
    assertEquals(result.length, 2, "Expected 2 chat messages");
    assertEquals(result[0].id, 'msg-1');
    assertEquals(result[1].role, 'assistant');
  });

  await t.step("should return empty array if chat exists but has no messages", async () => {
    const mockConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        chat_messages: {
          select: () => Promise.resolve({ data: [], error: null })
        },
        chats: {
          select: () => Promise.resolve({ data: [{id: mockChatId}], error: null, count: 1 })
        }
      }
    };
    const { client: mockClient } = createMockSupabaseClient(mockConfig);
    
    const result = await mainHandler(mockClient, mockUserId, mockChatId);

    assertEquals(result, [], "Should return empty array");
  });

  await t.step("should throw HandlerError(404) if chat not found (message fetch returns empty)", async () => {
    const mockConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        chat_messages: {
          select: () => Promise.resolve({ data: [], error: null })
        },
        chats: {
          select: () => Promise.resolve({ data: null, error: null, count: 0 })
        }
      }
    };
    const { client: mockClient } = createMockSupabaseClient(mockConfig);
    const nonExistentChatId = 'chat-does-not-exist';

    await assertRejects(
      async () => await mainHandler(mockClient, mockUserId, nonExistentChatId),
      HandlerError,
      "Chat not found or access denied."
    );
  });

  await t.step("should throw HandlerError(404) if chat check fails during message fetch error (PGRST116)", async () => {
    const dbError = { code: 'PGRST116', message: 'JWT expired', details: null, hint: null };
    const chatCheckError = new Error("RLS error checking chat");
    const mockConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        chat_messages: {
          select: () => Promise.resolve({ data: null, error: dbError })
        },
        chats: {
           select: () => Promise.resolve({ data: null, error: chatCheckError, count: 0 })
        }
      }
    };
    const { client: mockClient } = createMockSupabaseClient(mockConfig);
    const badChatId = 'chat-jwt-expired';

    await assertRejects(
      async () => await mainHandler(mockClient, mockUserId, badChatId),
      HandlerError,
      "Chat not found or access denied."
    );
  });

  await t.step("should throw HandlerError(500) for other message fetch errors", async () => {
    const dbError = new Error("Unexpected database connection issue");
    const mockConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        chat_messages: {
          select: () => Promise.resolve({ data: null, error: dbError })
        }
      }
    };
    const { client: mockClient } = createMockSupabaseClient(mockConfig);

    await assertRejects(
      async () => await mainHandler(mockClient, mockUserId, mockChatId),
      HandlerError,
      dbError.message
    );
  });

  teardown();
}); 