import {
  assertSpyCall,
  spy,
  stub,
  type Spy,
  type Stub,
} from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects, assertObjectMatch } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";

// Import the newly exported mainHandler and deps types from ./index.ts
import { mainHandler as actualMainHandler, defaultDeps as actualDefaultDeps, type ChatDetailsHandlerDeps } from "./index.ts";
import { HandlerError } from '../api-subscriptions/handlers/current.ts';
// Import the shared ChatMessage type
import type { ChatMessage } from '../_shared/types.ts';
// Import Chat and ChatMessage types
import type { Database } from "../types_db.ts";

// Define Chat type based on DB schema
export type Chat = Database['public']['Tables']['chats']['Row'];

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
const mockFullChatDetails = {
  id: mockChatId,
  created_at: new Date(Date.now() - 20000).toISOString(),
  updated_at: new Date(Date.now() - 10000).toISOString(),
  organization_id: null as string | null, // Explicitly type null for consistency
  system_prompt_id: 'prompt-sys-123' as string | null, // Example system prompt ID
  title: 'Mock Chat Title For Details Test',
  user_id: mockUserId,
};

const mockMessages: ChatMessage[] = [
  { id: 'msg-1', chat_id: mockChatId, user_id: mockUserId, role: 'user', content: 'First message', created_at: new Date(Date.now() - 10000).toISOString(), ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true },
  { id: 'msg-2', chat_id: mockChatId, user_id: null, role: 'assistant', content: 'First response', created_at: new Date().toISOString(), ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true },
];

// --- Test Suite (Old GET tests - to be refactored) ---
Deno.test("Chat Details Function - GET Logic Tests (Refactored)", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  setup();

  // Helper to create dependencies for GET tests
  const createGetTestDeps = (
    supaConfig: MockSupabaseDataConfig = {},
    depOverrides?: Partial<ChatDetailsHandlerDeps>
  ) => {
    const { client: mockSupabaseClient } = createMockSupabaseClient(supaConfig);
    const deps: ChatDetailsHandlerDeps = {
      ...actualDefaultDeps, // Start with actual default deps
      createSupabaseClient: spy(() => mockSupabaseClient) as any,
      ...depOverrides,
    };
    return { deps, mockClient: mockSupabaseClient };
  };

  await t.step("GET should return full chat details and messages array on success", async () => {
    const supaConfig: MockSupabaseDataConfig = {
        mockUser: { id: mockUserId } as any, // For auth check in handler
        getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
        genericMockResults: {
            chats: { // For preliminary access check
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockChatId)) {
                        // Return the full chat details object
                        return { data: [mockFullChatDetails], error: null, count: 1, status: 200 };
                    }
                    return { data: null, error: new Error('Chat not found in mock'), status: 404 };
                }
            },
            chat_messages: { // For getChatMessages internal call
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'chat_id' && f.value === mockChatId)) {
                        const typedMockMessages: any[] = mockMessages;
                        return { data: typedMockMessages, error: null, count: mockMessages.length, status: 200 };
                    }
                    return { data: [], error: null, count: 0, status: 200 };
                }
            }
        }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` }
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 200);
    const responseBody = await response.json();
    
    assert(typeof responseBody === 'object' && responseBody !== null, "Response body should be an object");
    assertExists(responseBody.chat, "Response body should have a 'chat' property");
    assertExists(responseBody.messages, "Response body should have a 'messages' property");

    // Use assertObjectMatch for the chat details
    assertObjectMatch(responseBody.chat, mockFullChatDetails);
    
    assertEquals(Array.isArray(responseBody.messages), true, "responseBody.messages should be an array");
    assertEquals(responseBody.messages.length, 2, "Expected 2 chat messages");
    assertEquals(responseBody.messages[0].id, 'msg-1');
    assertEquals(responseBody.messages[1].role, 'assistant');
  });

  await t.step("GET should return full chat details and empty messages array if chat exists but has no messages", async () => {
    const supaConfig: MockSupabaseDataConfig = {
        mockUser: { id: mockUserId } as any,
        getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
        genericMockResults: {
            chats: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockChatId)) {
                         // Return the full chat details object
                        return { data: [mockFullChatDetails], error: null, count: 1, status: 200 };
                    }
                    return { data: null, error: new Error('Chat not found in mock'), status: 404 };
                }
            },
            chat_messages: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'chat_id' && f.value === mockChatId)) {
                        return { data: [], error: null, count: 0, status: 200 }; // No messages
                    }
                    return { data: null, error: new Error('Should not query other chat IDs'), status: 500 };
                }
            }
        }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` }
    });
    
    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 200);
    const responseBody = await response.json();

    assert(typeof responseBody === 'object' && responseBody !== null, "Response body should be an object");
    assertExists(responseBody.chat, "Response body should have a 'chat' property");
    assertExists(responseBody.messages, "Response body should have a 'messages' property");

    // Use assertObjectMatch for the chat details
    assertObjectMatch(responseBody.chat, mockFullChatDetails);

    assertEquals(responseBody.messages, [], "responseBody.messages should be an empty array");
  });

  await t.step("GET should return 404 if chat not found", async () => {
    const nonExistentChatId = 'chat-does-not-exist';
    const supaConfig: MockSupabaseDataConfig = {
        mockUser: { id: mockUserId } as any,
        getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
        genericMockResults: {
            chats: { // Mock for preliminary access check returning no chat
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === nonExistentChatId)) {
                        return { data: null, error: null, count: 0, status: 200 }; // Simulate chat not found
                    }
                    return { data: [{id: 'some-other-chat'}], error: null, count: 1, status: 200 }; // Default for other chat IDs
                }
            }
            // No chat_messages mock needed as it shouldn't be reached
        }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${nonExistentChatId}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` }
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 404);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Chat not found or access denied.");
  });

  await t.step("GET should return 500 for chat_messages fetch error", async () => {
    const dbError = new Error("DB error fetching messages");
    const supaConfig: MockSupabaseDataConfig = {
        mockUser: { id: mockUserId } as any,
        getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
        genericMockResults: {
            chats: { // For preliminary access check - success
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockChatId)) {
                        return { data: [{ id: mockChatId, user_id: mockUserId, organization_id: null }], error: null, count: 1, status: 200 };
                    }
                    return { data: null, error: new Error('Chat not found in mock for error test'), status: 404 };
                }
            },
            chat_messages: { // For getChatMessages internal call - error
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'chat_id' && f.value === mockChatId)) {
                        return { data: null, error: dbError, status: 500, count: 0 }; 
                    }
                    return { data: [], error: null, count: 0, status: 200 };
                }
            }
        }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` }
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 500);
    const responseBody = await response.json();
    assertEquals(responseBody.error, dbError.message); 
  });

  await t.step("GET should return 401 if Authorization header is missing", async () => {
    const { deps } = createGetTestDeps(); // No specific supaConfig needed as it should fail before DB interaction
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { 
        method: 'GET' 
        // No Authorization header
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 401);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Missing Authorization header");
  });

  await t.step("GET should return 401 if Authorization token is invalid/expired", async () => {
    const supaConfig: MockSupabaseDataConfig = {
        // Mock getUser to return an error, simulating an invalid token
        getUserResult: { data: { user: null }, error: { message: "Invalid token", name: "AuthApiError", status: 401 } as any }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer invalid-token` }
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 401);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Invalid token");
  });

  await t.step("GET should return 400 if chatId is missing from path", async () => {
    const { deps } = createGetTestDeps(); // Auth/DB not reached
    // Requesting the base path without a specific chatId
    const req = new Request(`http://localhost/chat-details/`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` } 
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 400);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Missing or invalid chatId in request path");
  });

  await t.step("GET should return messages for an organization chat if user is a member", async () => {
    const orgId = 'org-for-get-test';
    const orgChatId = 'chat-org-get-abc';
    const mockOrgChatDetails: Chat = {
        id: orgChatId,
        user_id: 'creator-user-id',
        organization_id: orgId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        system_prompt_id: null,
        title: 'Org Chat for GET Test'
    };
    const mockOrgMessages: ChatMessage[] = [
        { id: 'org-msg-1', chat_id: orgChatId, user_id: 'another-user-id', role: 'user', content: 'Org chat message', created_at: new Date().toISOString(), ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true },
    ];

    const supaConfig: MockSupabaseDataConfig = {
        mockUser: { id: mockUserId } as any, 
        getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
        genericMockResults: {
            chats: { 
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === orgChatId)) {
                        return { data: [mockOrgChatDetails], error: null, count: 1, status: 200 };
                    }
                    return { data: null, error: new Error('Chat not found in org mock'), status: 404 };
                }
            },
            chat_messages: { 
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'chat_id' && f.value === orgChatId)) {
                        return { data: mockOrgMessages as any[], error: null, count: mockOrgMessages.length, status: 200 };
                    }
                    return { data: [], error: null, count: 0, status: 200 };
                }
            }
        }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${orgChatId}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` }
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 200);
    const responseBody = await response.json();
    assertExists(responseBody.chat, "Response body should have a 'chat' property for org chat");
    assertExists(responseBody.messages, "Response body should have a 'messages' property for org chat");
    assertEquals(responseBody.messages.length, 1, "Expected 1 message for org chat");
    assertObjectMatch(responseBody.messages[0], { id: 'org-msg-1', content: 'Org chat message' });
    assertObjectMatch(responseBody.chat, mockOrgChatDetails); 
  });

  await t.step("GET should return 404 for an organization chat if user is not a member", async () => {
    const orgIdNotMember = 'org-not-member-of';
    const orgChatIdNotMember = 'chat-org-not-member-abc';

    const supaConfig: MockSupabaseDataConfig = {
        mockUser: { id: mockUserId } as any, 
        getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
        genericMockResults: {
            chats: { 
                select: async (state: MockQueryBuilderState) => {
                    // Simulate RLS preventing access - .maybeSingle() returns { data: null, error: null }
                    if (state.filters.some(f => f.column === 'id' && f.value === orgChatIdNotMember)) {
                        return { data: null, error: null, count: 0, status: 200 }; 
                    }
                    // Fallback for any other chat ID query in this test setup
                    return { data: [{ id: 'some-other-chat'}], error: null, count: 1, status: 200 };
                }
            }
            // No chat_messages mock needed as it shouldn't be reached
        }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${orgChatIdNotMember}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` }
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 404);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Chat not found or access denied.");
  });

  await t.step("GET should only return messages with is_active_in_thread = true", async () => {
    const chatWithMixedMessagesId = 'chat-mixed-activity';
    const activeMessage = { id: 'active-msg', chat_id: chatWithMixedMessagesId, user_id: mockUserId, role: 'user', content: 'Active message', created_at: new Date().toISOString(), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null };
    const inactiveMessage = { id: 'inactive-msg', chat_id: chatWithMixedMessagesId, user_id: mockUserId, role: 'user', content: 'Inactive message', created_at: new Date(Date.now() - 5000).toISOString(), is_active_in_thread: false, ai_provider_id: null, system_prompt_id: null, token_usage: null };
    const mockChatForMixedActivity: Chat = {
        id: chatWithMixedMessagesId,
        user_id: mockUserId,
        organization_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        system_prompt_id: null,
        title: 'Chat with mixed activity'
    };
    
    const supaConfig: MockSupabaseDataConfig = {
        mockUser: { id: mockUserId } as any, 
        getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
        genericMockResults: {
            chats: { 
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === chatWithMixedMessagesId)) {
                        return { data: [mockChatForMixedActivity], error: null, count: 1, status: 200 };
                    }
                    return { data: null, error: new Error('Chat not found in mixed activity mock'), status: 404 };
                }
            },
            chat_messages: { 
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'chat_id' && f.value === chatWithMixedMessagesId)) {
                        if (state.filters.some(f => f.column === 'is_active_in_thread' && f.value === true)) {
                            return { data: [activeMessage] as any[], error: null, count: 1, status: 200 };
                        } else {
                            console.warn("[Test Mock chat_messages] Query did not explicitly filter for is_active_in_thread: true. This might indicate a handler logic issue if this test fails.");
                            return { data: [activeMessage, inactiveMessage] as any[], error: null, count: 2, status: 200 };
                        }
                    }
                    return { data: [], error: null, count: 0, status: 200 };
                }
            }
        }
    };
    const { deps } = createGetTestDeps(supaConfig);
    const req = new Request(`http://localhost/chat-details/${chatWithMixedMessagesId}`, { 
        method: 'GET', 
        headers: { Authorization: `Bearer test-token` }
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 200);
    const responseBody = await response.json();
    assertExists(responseBody.chat, "Response body should have a 'chat' property for mixed activity chat");
    assertExists(responseBody.messages, "Response body should have a 'messages' property for mixed activity chat");
    assertEquals(responseBody.messages.length, 1, "Should only return one active message");
    assertEquals(responseBody.messages[0].id, 'active-msg');
    assertEquals(responseBody.messages[0].is_active_in_thread, true);
    assertObjectMatch(responseBody.chat, mockChatForMixedActivity);
  });

  // Remove old HandlerError specific tests if covered by new structure or redundant
  // The old assertRejects tests for mainHandler(mockClient, mockUserId, mockChatId) are no longer valid

  teardown();
}); 

// --- New Test Suite for DELETE Logic (adapted) ---
Deno.test("Chat Details Function - DELETE Logic Tests", {
  sanitizeOps: false, 
  sanitizeResources: false,
}, async (t) => {
  const testUserIdForDelete = 'user-delete-test-123';
  const personalChatIdToDelete = 'chat-personal-to-delete-abc';

  // Helper to create dependencies for DELETE tests
  const createTestDepsForDelete = (
    supaConfig: MockSupabaseDataConfig = {},
    depOverrides?: Partial<ChatDetailsHandlerDeps>
  ) => {
    const { client: mockSupabaseClient, spies: clientSpies } = createMockSupabaseClient(supaConfig);
    const deps: ChatDetailsHandlerDeps = {
      ...actualDefaultDeps, // Start with actual default deps
      createSupabaseClient: spy(() => mockSupabaseClient) as any,
      ...depOverrides,
    };
    return { deps, mockClient: mockSupabaseClient, clientSpies }; // Return clientSpies too
  };

  setup(); 

  await t.step("DELETE should return 401 if Authorization header is missing", async () => {
    const { deps } = createTestDepsForDelete(); // No specific supaConfig needed
    const req = new Request(`http://localhost/chat-details/${personalChatIdToDelete}`, {
      method: 'DELETE',
      // No Authorization header
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 401);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Missing Authorization header");
  });

  await t.step("DELETE should return 401 if Authorization token is invalid/expired", async () => {
    const supaConfig: MockSupabaseDataConfig = {
        getUserResult: { data: { user: null }, error: { message: "Invalid token for delete", name: "AuthApiError", status: 401 } as any }
    };
    const { deps } = createTestDepsForDelete(supaConfig);
    const req = new Request(`http://localhost/chat-details/${personalChatIdToDelete}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer invalid-token` },
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 401);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Invalid token for delete");
  });

  await t.step("DELETE personal chat by non-owner returns 403", async () => {
    const otherUsersPersonalChatId = 'chat-other-user-personal';
    const actualOwnerId = 'actual-owner-id';

    const supaConfig: MockSupabaseDataConfig = {
      mockUser: { id: testUserIdForDelete } as any, // Authenticated user is testUserIdForDelete
      getUserResult: { data: { user: { id: testUserIdForDelete } as any }, error: null },
      genericMockResults: {
        chats: {
          select: spy(async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === otherUsersPersonalChatId)) {
              // Chat exists, but user_id does not match authenticated user
              return { data: [{ id: otherUsersPersonalChatId, user_id: actualOwnerId, organization_id: null }], error: null, count: 1, status: 200 };
            }
            return { data: null, error: new Error('Unexpected select for non-owner delete test'), status: 500 };
          }),
          // Delete mock should not be called
          delete: spy(async () => { 
            throw new Error("Delete should not have been called for non-owner personal chat attempt");
          })
        }
      }
    };

    const { deps } = createTestDepsForDelete(supaConfig);
    const req = new Request(`http://localhost/chat-details/${otherUsersPersonalChatId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer test-token` }, // Token for testUserIdForDelete
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 403, "Expected 403 Forbidden");
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Forbidden: You do not have permission to delete this chat.");
    
    // Verify delete was not called
    const deleteMockSpy = supaConfig.genericMockResults!.chats!.delete as Spy<any, [MockQueryBuilderState], Promise<any>>; 
    assertEquals(deleteMockSpy.calls.length, 0, "Delete mock should not have been called");
  });

  await t.step("DELETE organization chat by org admin successfully returns 204", async () => {
    const orgChatId = 'org-chat-to-delete-by-admin';
    const orgId = 'org-admin-owns';
    // Full chat details for the access check part
    const mockOrgChatToDeleteDetails: Partial<Chat> = { 
        id: orgChatId, 
        user_id: 'some-creator-id', 
        organization_id: orgId,
        // Add other fields as returned by the select query in mainHandler
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString(),
        system_prompt_id: null,
        title: 'Org chat to delete'
    };

    const supaConfig: MockSupabaseDataConfig = {
      mockUser: { id: testUserIdForDelete } as any, 
      getUserResult: { data: { user: { id: testUserIdForDelete } as any }, error: null },
      rpcResults: {
        is_org_admin: { data: true as any, error: null }
      },
      genericMockResults: {
        chats: {
          select: spy(async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === orgChatId)) {
              return { data: [mockOrgChatToDeleteDetails as Chat], error: null, count: 1, status: 200 }; // Return full chat details
            }
            return { data: null, error: new Error('Chat not found for org admin delete'), status: 404 };
          }),
          delete: spy(async (state: MockQueryBuilderState) => {
            if (state.matchQuery && (state.matchQuery as {id?:string}).id === orgChatId) {
              return { data: [{id: orgChatId}], error: null, count: 1, status: 200 };
            }
            return { data: null, error: new Error('Unexpected delete call for org admin'), status: 500 };
          })
        }
      }
    };

    const { deps, clientSpies } = createTestDepsForDelete(supaConfig);
    const req = new Request(`http://localhost/chat-details/${orgChatId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer test-token` }, 
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 204, "Expected 204 No Content for successful org chat delete by admin");

    const deleteMockSpy = supaConfig.genericMockResults!.chats!.delete as Spy<any, [MockQueryBuilderState], Promise<any>>;
    assertExists(deleteMockSpy, "Delete mock spy function should exist on supaConfig");
    assertEquals(deleteMockSpy.calls.length, 1, "Delete mock spy should have been called once");

    const rpcSpy = clientSpies.rpcSpy;
    assertExists(rpcSpy.calls.find(call => call.args[0] === 'is_org_admin'), "is_org_admin RPC should have been called");
    const isOrgAdminCall = rpcSpy.calls.find(call => call.args[0] === 'is_org_admin');
    assertExists(isOrgAdminCall, "is_org_admin call should exist");
    assertEquals(isOrgAdminCall.args.length, 2, "is_org_admin RPC should be called with 2 arguments");
    assertEquals(isOrgAdminCall.args[0], 'is_org_admin');
    assertEquals(isOrgAdminCall.args[1], { org_id: orgId });
  });

  await t.step("DELETE organization chat by org member (non-admin) returns 403", async () => {
    const orgChatId = 'org-chat-non-admin-delete';
    const orgId = 'org-member-not-admin';
    const memberUserId = 'user-member-id'; // This user is a member, not an admin

    const supaConfig: MockSupabaseDataConfig = {
      mockUser: { id: memberUserId } as any,
      getUserResult: { data: { user: { id: memberUserId } as any }, error: null },
      rpcResults: {
        is_org_admin: { data: false as any, error: null }
      },
      genericMockResults: {
        chats: {
          select: spy(async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === orgChatId)) {
              return { data: [{ id: orgChatId, user_id: 'some-creator-id', organization_id: orgId }], error: null, count: 1, status: 200 };
            }
            return { data: null, error: new Error('Chat not found for org non-admin delete'), status: 404 };
          }),
          delete: spy(async () => { 
            throw new Error("Delete should not have been called for non-admin org chat attempt");
          })
        }
      }
    };

    const { deps, clientSpies } = createTestDepsForDelete(supaConfig);
    const req = new Request(`http://localhost/chat-details/${orgChatId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer test-token` }, // Token for memberUserId
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 403, "Expected 403 Forbidden for non-admin deleting org chat");
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Forbidden: You do not have permission to delete this chat.");

    const rpcSpy = clientSpies.rpcSpy;
    assertExists(rpcSpy.calls.find(call => call.args[0] === 'is_org_admin'), "is_org_admin RPC should have been called");
    
    const deleteMockSpy = supaConfig.genericMockResults!.chats!.delete as Spy<any, any[], any>; 
    assertEquals(deleteMockSpy.calls.length, 0, "Delete mock should not have been called");
  });

  await t.step("DELETE returns 500 if Supabase delete operation fails", async () => {
    const chatIdForDbError = 'chat-delete-db-error';
    const dbDeleteError = new Error("Simulated DB error on delete");

    const supaConfig: MockSupabaseDataConfig = {
      mockUser: { id: testUserIdForDelete } as any, 
      getUserResult: { data: { user: { id: testUserIdForDelete } as any }, error: null },
      genericMockResults: {
        chats: {
          // Access check passes
          select: spy(async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === chatIdForDbError)) {
              return { data: [{ id: chatIdForDbError, user_id: testUserIdForDelete, organization_id: null }], error: null, count: 1, status: 200 };
            }
            return { data: null, error: new Error('Chat not found for DB error delete test'), status: 404 };
          }),
          // Actual delete operation fails
          delete: spy(async (state: MockQueryBuilderState) => {
            if (state.matchQuery && (state.matchQuery as {id?: string}).id === chatIdForDbError) {
              return { data: null, error: dbDeleteError, status: 500, count: 0 };
            }
            return { data: null, error: new Error('Unexpected delete call in DB error test'), status: 500 };
          })
        }
      }
    };

    const { deps } = createTestDepsForDelete(supaConfig);
    const req = new Request(`http://localhost/chat-details/${chatIdForDbError}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer test-token` },
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 500);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Failed to delete chat."); 
    // Note: The handler wraps the original error message. If we wanted to check for dbDeleteError.message,
    // the error creation in mainHandler would need to pass it through more directly.
  });

  await t.step("DELETE org chat returns 500 if is_org_admin RPC fails", async () => {
    const orgChatIdForRpcError = 'org-chat-rpc-error';
    const orgIdForRpcError = 'org-rpc-error';
    const rpcError = new Error("Simulated RPC error for is_org_admin");

    const supaConfig: MockSupabaseDataConfig = {
      mockUser: { id: testUserIdForDelete } as any,
      getUserResult: { data: { user: { id: testUserIdForDelete } as any }, error: null },
      rpcResults: {
        is_org_admin: { data: null, error: rpcError }
      },
      genericMockResults: {
        chats: {
          // Access check passes, revealing it's an org chat
          select: spy(async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === orgChatIdForRpcError)) {
              return { data: [{ id: orgChatIdForRpcError, user_id: 'some-user', organization_id: orgIdForRpcError }], error: null, count: 1, status: 200 };
            }
            return { data: null, error: new Error('Chat not found for RPC error test'), status: 404 };
          }),
          // Delete should not be called if RPC fails before it
          delete: spy(async () => { 
            throw new Error("Delete should not be called if is_org_admin RPC fails");
          })
        }
      }
    };

    const { deps, clientSpies } = createTestDepsForDelete(supaConfig);
    const req = new Request(`http://localhost/chat-details/${orgChatIdForRpcError}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer test-token` },
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 500);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Failed to verify organization permissions.");

    // Verify is_org_admin was called
    const rpcSpy = clientSpies.rpcSpy;
    assertExists(rpcSpy.calls.find(call => call.args[0] === 'is_org_admin'), "is_org_admin RPC should have been called");
  });

  await t.step("DELETE personal chat successfully returns 204 and calls delete", async () => {
    const supaConfig: MockSupabaseDataConfig = {
      mockUser: { id: testUserIdForDelete } as any, 
      getUserResult: { data: { user: { id: testUserIdForDelete } as any }, error: null },
      genericMockResults: {
        chats: {
          select: spy(async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === personalChatIdToDelete)) {
              console.log(`[Test Mock Chats Select - Access/Details for Delete] Matched for ID: ${personalChatIdToDelete}`);
              return { data: [{ id: personalChatIdToDelete, user_id: testUserIdForDelete, organization_id: null }], error: null, count: 1, status: 200 };
            }
            console.error("[Test Mock Chats Select - Delete] Unexpected select call:", state);
            return { data: null, error: new Error('Unexpected select on chats table for delete test'), status: 500 };
          }),
          delete: spy(async (state: MockQueryBuilderState) => {
            if (state.matchQuery && (state.matchQuery as {id?:string}).id === personalChatIdToDelete) {
              console.log(`[Test Mock Chats Delete] Matched for ID (via matchQuery): ${personalChatIdToDelete}`);
              return { data: [{id: personalChatIdToDelete}], error: null, count: 1, status: 200 }; 
            }
            console.error("[Test Mock Chats Delete] Unexpected delete call. MatchQuery:", state.matchQuery, "Filters:", state.filters);
            return { data: null, error: new Error('Unexpected delete on chats table or wrong matchQuery/filters'), status: 500 };
          })
        }
      }
    };

    const { deps, clientSpies } = createTestDepsForDelete(supaConfig);

    const req = new Request(`http://localhost/chat-details/${personalChatIdToDelete}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer test-token` },
    });

    const response = await actualMainHandler(req, deps);
    
    assertEquals(response.status, 204, "Expected 204 No Content for successful delete");

    const deleteMockSpy = supaConfig.genericMockResults!.chats!.delete as Spy<any, [MockQueryBuilderState], Promise<any>>;
    assertExists(deleteMockSpy, "Delete mock spy function should exist on supaConfig");
    assertSpyCall(deleteMockSpy, 0, { /* Args checked by spy conditions in spy anfn */ });
    assertEquals(deleteMockSpy.calls.length, 1, "Delete mock spy function should be called once");
  });

  await t.step("DELETE non-existent chat returns 404", async () => {
    const nonExistentChatId = 'chat-id-does-not-exist';
    const supaConfig: MockSupabaseDataConfig = {
      mockUser: { id: testUserIdForDelete } as any, 
      getUserResult: { data: { user: { id: testUserIdForDelete } as any }, error: null },
      genericMockResults: {
        chats: {
          select: spy(async (state: MockQueryBuilderState) => { 
            // Simulate chat not found by the preliminary access check
            if (state.filters.some((f: any) => f.column === 'id' && f.value === nonExistentChatId)) {
              return { data: null, error: null, count: 0, status: 200 }; 
            }
            return { data: [{id: 'some-other-chat'}], error: null, count: 1, status: 200 };
          }),
          delete: spy(async () => { 
            throw new Error("Delete should not be called for a non-existent chat ID");
          })
        }
      }
    };

    const { deps } = createTestDepsForDelete(supaConfig);
    const req = new Request(`http://localhost/chat-details/${nonExistentChatId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer test-token` },
    });

    const response = await actualMainHandler(req, deps);
    assertEquals(response.status, 404);
    const responseBody = await response.json();
    assertEquals(responseBody.error, "Chat not found or access denied.");
    
    const deleteMockSpy = supaConfig.genericMockResults!.chats!.delete as Spy<any, any[], any>; 
    assertEquals(deleteMockSpy.calls.length, 0, "Delete mock should not have been called");
  });

  teardown(); 
});
