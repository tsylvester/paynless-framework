import {
  assertSpyCall,
  spy,
  stub,
  type Spy,
  type Stub,
  assertSpyCalls,
} from "jsr:@std/testing@0.225.1/mock";
import { 
  assert, 
  assertEquals, 
  assertExists, 
  assertRejects, 
  assertObjectMatch 
} from "jsr:@std/assert@0.225.3";
// Remove unused SupabaseClient import from npm
// import type { SupabaseClient } from "npm:@supabase/supabase-js"; 

// Imports for the handler and its types
import { 
    mainHandler as actualMainHandler, 
    defaultDeps as actualDefaultDeps,
    type ChatHistoryHandlerDeps,
    type ChatHistoryItem 
} from "./index.ts";
import { HandlerError } from '../api-subscriptions/handlers/current.ts'; // Assuming this is still used for assertRejects

// Imports for mocking
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig, 
    type MockQueryBuilderState 
} from "../_shared/supabase.mock.ts";
// We might not need Database type directly if ChatHistoryItem covers all needs
// import type { Database } from "../types_db.ts"; 

// --- Test Setup (similar to chat-details.test.ts) ---
let envStub: Stub | undefined;
const mockSupabaseUrl = "http://mock-chat-history-supabase.co";
const mockAnonKey = "mock-chat-history-anon-key";
const mockUserIdGlobal = 'user-hist-global-123'; // A global mock user for simple cases

const setup = () => {
  console.log("[Test Setup] Stubbing Deno.env.get for chat-history/index.ts");
  envStub = stub(Deno.env, "get", (key) => {
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    return undefined;
  });
};

const teardown = () => {
  if (envStub) {
    envStub.restore();
    console.log("[Test Teardown] Restored Deno.env.get for chat-history");
  }
};

// Helper to create dependencies for chat history tests
const createChatHistoryTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  depOverrides?: Partial<ChatHistoryHandlerDeps>
) => {
  const { client: mockSupabaseClient, spies: clientSpies } = createMockSupabaseClient(supaConfig);
  const deps: ChatHistoryHandlerDeps = {
    ...actualDefaultDeps, // Start with actual default deps
    createSupabaseClient: spy(() => mockSupabaseClient) as any, // Override with mock client creator
    ...depOverrides,
  };
  return { deps, mockClient: mockSupabaseClient, clientSpies }; 
};

// --- Test Suite ---
Deno.test("Chat History Function Tests (Refactored)", {
  sanitizeOps: false, // Standard Deno test options
  sanitizeResources: false,
}, async (t) => {
  try {
    setup(); // Call setup once for the suite

    await t.step("GET request for personal chats should return history array", async () => {
      const mockUserId = 'user-personal-hist-123';
      const mockPersonalHistory: ChatHistoryItem[] = [
        { id: 'chat-hist-p1', title: 'Personal History 1', updated_at: new Date().toISOString() },
        { id: 'chat-hist-p2', title: 'Personal History 2', updated_at: new Date(Date.now() - 1000).toISOString() },
      ];
      
      const supaConfig: MockSupabaseDataConfig = {
          mockUser: { id: mockUserId } as any,
          getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
          genericMockResults: {
              chats: {
                  select: spy(async (state: MockQueryBuilderState) => {
                      // Expecting filter for organization_id IS NULL for personal chats
                      if (state.filters.some(f => f.column === 'organization_id' && f.type === 'is' && f.value === null)) {
                          return { data: mockPersonalHistory as any[], error: null, count: mockPersonalHistory.length, status: 200 };
                      }
                      console.error("[Test Mock Chats Select - Personal History] Unexpected filter state:", state.filters);
                      return { data: [], error: new Error('Mock expected personal chat filter (org_id is null)'), status: 500 };
                  })
              }
          }
      };
      const { deps, clientSpies } = createChatHistoryTestDeps(supaConfig);

      const req = new Request('http://localhost/chat-history', { 
          method: 'GET', 
          headers: { Authorization: `Bearer test-token` }
      });

      const response = await actualMainHandler(req, deps);
      assertEquals(response.status, 200);
      const responseBody = await response.json();
      assertEquals(responseBody.length, mockPersonalHistory.length);
      assertObjectMatch(responseBody[0], { id: 'chat-hist-p1', title: 'Personal History 1' });

      // Verify Supabase client interactions
      const fromSpy = clientSpies.fromSpy;
      assertSpyCall(fromSpy, 0, { args: ['chats'] });
      const qbSpy = fromSpy.calls[0].returned as any; // IMockQueryBuilder
      assertExists(qbSpy.select, "select should be on query builder spy");
      assertSpyCall(qbSpy.select, 0); // Args can be more specific if needed, e.g. 'id, title, updated_at, user_id, organization_id'
      assertExists(qbSpy.is, "is filter should be on query builder spy");
      assertSpyCall(qbSpy.is, 0, { args: ['organization_id', null]});
      assertExists(qbSpy.order, "order should be on query builder spy");
      assertSpyCall(qbSpy.order, 0, { args: ['updated_at', { ascending: false }] });
    });

    // ... other test steps will follow here ...

    // For now, let's assume each test suite manages its own setup/teardown if nested, or a single one for the top Deno.test call.
    // Let's call teardown at the end of this top-level test block.
  } finally {
    teardown(); // Ensure teardown is called
  }
});

// Call teardown once after the entire test suite finishes or if an error occurs
// This is a bit tricky with async tests. A finally block in the Deno.test callback is better.

// --- REVISED Test Suite Structure with finally for teardown ---
Deno.test("Chat History Function Tests (Refactored with Proper Teardown)", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  try {
    setup();

    await t.step("GET request for personal chats should return history array (Revised)", async () => {
        const mockUserId = 'user-personal-revised-123';
        const mockPersonalHistory: ChatHistoryItem[] = [
          { id: 'chat-hist-pr1', title: 'Personal Revised 1', updated_at: new Date().toISOString() },
        ];
        
        const supaConfig: MockSupabaseDataConfig = {
            mockUser: { id: mockUserId } as any,
            getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
            genericMockResults: {
                chats: {
                    select: spy(async (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'organization_id' && f.type === 'is' && f.value === null)) {
                            return { data: mockPersonalHistory as any[], error: null, count: mockPersonalHistory.length, status: 200 };
                        }
                        return { data: [], error: new Error('Mock expected org_id is null filter'), status: 500 };
                    })
                }
            }
        };
        const { deps, clientSpies } = createChatHistoryTestDeps(supaConfig);
        const req = new Request('http://localhost/chat-history', { 
            method: 'GET', headers: { Authorization: `Bearer test-token` }
        });
        const response = await actualMainHandler(req, deps);
        assertEquals(response.status, 200);
        const responseBody = await response.json();
        assertEquals(responseBody.length, 1);
        assertObjectMatch(responseBody[0], { id: 'chat-hist-pr1'});

        const fromSpy = clientSpies.fromSpy;
        assertSpyCall(fromSpy, 0, { args: ['chats'] });
        const qbSpy = fromSpy.calls[0].returned as any;
        assertExists(qbSpy.is);
        assertSpyCall(qbSpy.is, 0, { args: ['organization_id', null]});
    });

    // Refactor other original tests into this structure
    await t.step("GET request for personal chats (empty history) returns empty array (Revised)", async () => {
        const mockUserId = 'user-empty-revised';
        const supaConfig: MockSupabaseDataConfig = {
            mockUser: { id: mockUserId } as any,
            getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
            genericMockResults: {
                chats: { select: spy(async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'organization_id' && f.type === 'is' && f.value === null)) {
                        return { data: [], error: null, count: 0, status: 200 };
                    }
                    return { data: null, error: new Error('Mock expected org_id is null for empty personal'), status: 500 };
                })}
            }
        };
        const { deps } = createChatHistoryTestDeps(supaConfig);
        const req = new Request('http://localhost/chat-history', { 
            method: 'GET', headers: { Authorization: `Bearer test-token` }
        });
        const response = await actualMainHandler(req, deps);
        assertEquals(response.status, 200);
        const responseBody = await response.json();
        assertEquals(responseBody, []);
    });

    await t.step("GET request for personal chats (DB query fails) returns 500 (Revised)", async () => {
        const mockUserId = 'user-db-error-revised';
        const mockError = new Error('DB query failed for personal Revised');
        const supaConfig: MockSupabaseDataConfig = {
            mockUser: { id: mockUserId } as any,
            getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
            genericMockResults: {
                chats: { select: spy(async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'organization_id' && f.type === 'is' && f.value === null)) {
                        return { data: null, error: mockError, status: 500, count: 0 };
                    }
                    return { data: null, error: new Error('Mock expected org_id is null for DB error personal'), status: 500 };
                })}
            }
        };
        const { deps } = createChatHistoryTestDeps(supaConfig);
        const req = new Request('http://localhost/chat-history', { 
            method: 'GET', headers: { Authorization: `Bearer test-token` }
        });
        
        const response = await actualMainHandler(req, deps);
        assertEquals(response.status, 500);
        const responseBody = await response.json();
        // The mainHandler wraps the HandlerError message
        // The fetchChatHistoryLogic throws new HandlerError(fetchError.message ...)
        assertEquals(responseBody.error, mockError.message); 
    });

    // Add NEW test cases here
    await t.step("GET request with missing Authorization header returns 401", async () => {
        const { deps } = createChatHistoryTestDeps(); // No supaConfig needed
        const req = new Request('http://localhost/chat-history', { 
            method: 'GET'
            // No Authorization header
        });
        const response = await actualMainHandler(req, deps);
        assertEquals(response.status, 401);
        const responseBody = await response.json();
        assertEquals(responseBody.error, "Missing Authorization header");
    });

    await t.step("GET request with invalid/expired token returns 401", async () => {
        const authErrMessage = "Invalid authentication credentials via mock";
        const supaConfig: MockSupabaseDataConfig = {
            // Mock getUser to return an error
            getUserResult: { data: { user: null }, error: { message: authErrMessage, name: "AuthApiError", status: 401 } as any }
        };
        const { deps } = createChatHistoryTestDeps(supaConfig);
        const req = new Request('http://localhost/chat-history', { 
            method: 'GET', 
            headers: { Authorization: `Bearer invalid-token` }
        });
        const response = await actualMainHandler(req, deps);
        assertEquals(response.status, 401);
        const responseBody = await response.json();
        assertEquals(responseBody.error, authErrMessage);
    });

    await t.step("GET request for organization chats should return history array", async () => {
        const mockUserId = 'user-org-hist-123';
        const mockOrgId = 'org-abc-789';
        const mockOrgHistory: ChatHistoryItem[] = [
          { id: 'chat-hist-org1', title: 'Org History 1', updated_at: new Date().toISOString() },
        ];
        
        const supaConfig: MockSupabaseDataConfig = {
            mockUser: { id: mockUserId } as any,
            getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
            genericMockResults: {
                chats: {
                    select: spy(async (state: MockQueryBuilderState) => {
                        // Expecting filter for the specific organization_id
                        if (state.filters.some((f: any) => f.column === 'organization_id' && f.type === 'eq' && f.value === mockOrgId)) {
                            // Simulate RLS allowing access and returning chats for this org
                            return { data: mockOrgHistory as any[], error: null, count: mockOrgHistory.length, status: 200 };
                        }
                        console.error("[Test Mock Chats Select - Org History] Unexpected filter state:", state.filters);
                        return { data: [], error: new Error('Mock expected organization_id filter'), status: 500 };
                    })
                }
            }
        };
        const { deps, clientSpies } = createChatHistoryTestDeps(supaConfig);

        const req = new Request(`http://localhost/chat-history?organizationId=${mockOrgId}`, { 
            method: 'GET', 
            headers: { Authorization: `Bearer test-token` }
        });

        const response = await actualMainHandler(req, deps);
        assertEquals(response.status, 200);
        const responseBody = await response.json();
        assertEquals(responseBody.length, mockOrgHistory.length);
        assertObjectMatch(responseBody[0], { id: 'chat-hist-org1' });

        const fromSpy = clientSpies.fromSpy;
        assertSpyCall(fromSpy, 0, { args: ['chats'] });
        const qbSpy = fromSpy.calls[0].returned as any; 
        assertExists(qbSpy.eq);
        assertSpyCall(qbSpy.eq, 0, { args: ['organization_id', mockOrgId]}); // First .eq will be for org_id
    });

    await t.step("GET for orgId where user lacks RLS access should return empty array", async () => {
        const mockUserId = 'user-no-access-org-123';
        const targetOrgId = 'org-no-access-456';
        
        const supaConfig: MockSupabaseDataConfig = {
            mockUser: { id: mockUserId } as any,
            getUserResult: { data: { user: { id: mockUserId } as any }, error: null },
            genericMockResults: {
                chats: {
                    select: spy(async (state: MockQueryBuilderState) => {
                        if (state.filters.some((f: any) => f.column === 'organization_id' && f.type === 'eq' && f.value === targetOrgId)) {
                            // Simulate RLS returning no rows for this user + orgId combination
                            return { data: [], error: null, count: 0, status: 200 };
                        }
                        return { data: null, error: new Error('Mock expected specific org filter for no RLS access test'), status: 500 };
                    })
                }
            }
        };
        const { deps, clientSpies } = createChatHistoryTestDeps(supaConfig);
        const req = new Request(`http://localhost/chat-history?organizationId=${targetOrgId}`, { 
            method: 'GET', 
            headers: { Authorization: `Bearer test-token` }
        });

        const response = await actualMainHandler(req, deps);
        assertEquals(response.status, 200);
        const responseBody = await response.json();
        assertEquals(responseBody, [], "Expected empty array due to RLS filtering");

        const fromSpy = clientSpies.fromSpy;
        assertSpyCall(fromSpy, 0, { args: ['chats'] });
        const qbSpy = fromSpy.calls[0].returned as any; 
        assertSpyCall(qbSpy.eq, 0, { args: ['organization_id', targetOrgId]});
    });

  } finally {
    teardown(); // Ensure teardown runs
  }
}); 