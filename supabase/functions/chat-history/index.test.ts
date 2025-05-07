import {
  assertSpyCall,
  spy,
  stub,
  type Spy,
  type Stub,
  assertSpyCalls,
} from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
// Remove unused SupabaseClient import from npm
// import type { SupabaseClient } from "npm:@supabase/supabase-js"; 

// Import the *inner* handler, its types, and HandlerError
import { mainHandler, type ChatHistoryItem } from "./index.ts";
import { HandlerError } from '../api-subscriptions/handlers/current.ts';
// Import shared testing utilities
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts"; // Correct import name
import type { Database } from "../types_db.ts";

// --- Test Suite ---
Deno.test("Chat History Function Tests", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  // Remove beforeEach/afterEach and cleanup - spies are local to each test step now
  /*
  t.beforeEach(() => {}); 
  t.afterEach(() => {
    cleanup(); 
  });
  */

  // --- Test Cases ---

  await t.step("GET request should return chat history array", async () => {
    // *** Refactor this test using createMockSupabaseClient ***
    const mockUserId = 'user-hist-123';
    const mockHistory: ChatHistoryItem[] = [
      { id: 'chat-hist-1', title: 'History Chat 1', updated_at: new Date().toISOString() },
      { id: 'chat-hist-2', title: 'History Chat 2', updated_at: new Date().toISOString() },
    ];
    const { client: mockClient, spies } = createMockSupabaseClient({
        genericMockResults: {
            chats: {
                select: { data: mockHistory, error: null }
            }
        }
    });

    const result = await mainHandler(mockClient as any, mockUserId);

    assertEquals(result, mockHistory);
    // Verify the spy was called correctly
    assertSpyCalls(spies.fromSpy, 1); 
    // Access the query builder mock from the spy's call info
    const queryBuilder = spies.fromSpy.calls[0].returned;
    assertSpyCalls(queryBuilder.select, 1);
    assertSpyCalls(queryBuilder.order, 1); 
    // Check the arguments if needed, e.g.:
    // assertSpyCall(queryBuilder.select, 0, { args: ['id, title, updated_at'] });
    // assertSpyCall(queryBuilder.order, 0, { args: ['updated_at', { ascending: false }] });
  });

  await t.step("GET request when database returns empty array", async () => {
    // *** Refactor this test using createMockSupabaseClient ***
    const mockUserId = 'user-empty-hist';
    const { client: mockClient, spies } = createMockSupabaseClient({
        genericMockResults: {
            chats: {
                select: { data: [], error: null } // Mock empty array response
            }
        }
    });

    const result = await mainHandler(mockClient as any, mockUserId);

    assertEquals(result, []);
    assertSpyCalls(spies.fromSpy, 1);
    const queryBuilder = spies.fromSpy.calls[0].returned;
    assertSpyCalls(queryBuilder.select, 1);
    assertSpyCalls(queryBuilder.order, 1);
  });

  await t.step("GET request when database query fails", async () => {
    // *** Refactor this test using createMockSupabaseClient and assertRejects ***
    const mockUserId = 'user-db-error';
    const mockError = { message: 'Database query failed', code: '500' };
    const { client: mockClient, spies } = createMockSupabaseClient({
        genericMockResults: {
            chats: {
                select: { data: null, error: mockError } // Mock error response
            }
        }
    });

    await assertRejects(
        async () => {
            await mainHandler(mockClient as any, mockUserId);
        },
        HandlerError, // Expect a HandlerError
        mockError.message // Expect the original DB error message wrapped in HandlerError
    );

    assertSpyCalls(spies.fromSpy, 1);
    const queryBuilder = spies.fromSpy.calls[0].returned;
    assertSpyCalls(queryBuilder.select, 1);
    assertSpyCalls(queryBuilder.order, 1);
  });
}); 