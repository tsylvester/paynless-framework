import { assertSpyCall, assertSpyCalls, spy, stub } from "jsr:@std/testing@0.225.1/mock";
import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";

// Import the *inner* handler and its types, and HandlerError
import { mainHandler, type LoginCredentials } from "./index.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import type { Database } from "../types_db.ts";
import type { User, Session } from "npm:@supabase/supabase-js@2";

Deno.test("Login Function - mainHandler Tests", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  
  await t.step("on successful login, calls true_up_user and returns the user profile", async () => {
    // 1. Setup
    const mockCreds: LoginCredentials = { email: "success@example.com", password: "password123" };
    const mockUser: User = { 
      id: 'user-123', 
      email: mockCreds.email,
      app_metadata: { provider: 'email' }, 
      user_metadata: { name: 'Test User' }, 
      aud: 'authenticated', 
      created_at: new Date().toISOString()
    };
    const mockSession: Session = { 
      access_token: 'abc', 
      refresh_token: 'def', 
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mockUser 
    }; 
    const mockProfile: Database['public']['Tables']['user_profiles']['Row'] = { 
      id: mockUser.id, 
      created_at: new Date().toISOString(),
      first_name: "Test", 
      last_name: "User", 
      role: "user", 
      updated_at: new Date().toISOString(),
      last_selected_org_id: null,
      profile_privacy_setting: 'private',
      chat_context: null
    };

    // 2. Configure the Mock Client
    const mockConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        user_profiles: {
          select: { data: [mockProfile] }
        }
      },
      rpcResults: {
        true_up_user: { data: null, error: null }
      }
    };

    const { client: mockSupabaseClient, spies } = createMockSupabaseClient(mockUser.id, mockConfig);
    
    // WORKAROUND: Stub the signInWithPassword method on the auth object.
    const signInStub = stub(mockSupabaseClient.auth as any, "signInWithPassword", () => Promise.resolve({
      data: { user: mockUser, session: mockSession },
      error: null,
    }));

    // 3. Action
    const result = await mainHandler(mockSupabaseClient as any, mockCreds);

    // 4. Assertions
    assertEquals(result.user?.id, mockUser.id);
    assertExists(result.session);
    assertEquals(result.profile, mockProfile);
    
    assertSpyCall(spies.rpcSpy, 0, {
      args: ['true_up_user', { p_user_id: mockUser.id }]
    });
    assertSpyCalls(spies.rpcSpy, 1);

    const queryBuilderSpies = spies.getLatestQueryBuilderSpies('user_profiles');
    assertExists(queryBuilderSpies);
    assertSpyCalls(queryBuilderSpies.select!, 1);
    assertSpyCalls(queryBuilderSpies.eq!, 1);
    assertSpyCall(queryBuilderSpies.eq!, 0, { args: ['id', mockUser.id] });
    assertSpyCalls(queryBuilderSpies.maybeSingle!, 1);

    // Cleanup
    signInStub.restore();
  });
}); 