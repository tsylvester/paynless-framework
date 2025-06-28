import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { spy, stub } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.208.0/testing/bdd.ts"; // Import Deno BDD test functions
import {
  handleRequest,
  type ActionHandlers,
} from "./index.ts";
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type { ServiceError } from '../_shared/types.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup, type IMockSupabaseClient, type MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';
import { DialecticSession } from "./dialectic.interface.ts";
import * as sharedLogger from "../_shared/logger.ts";

const MOCK_USER_ID = "test-user-id-session-details";
const getMockUser = (id: string = MOCK_USER_ID): User => ({
  id,
  app_metadata: { provider: "email" },
  user_metadata: { name: "Test User SessionDetails" },
  aud: "authenticated",
  confirmation_sent_at: new Date().toISOString(),
  recovery_sent_at: "",
  email_change_sent_at: "",
  new_email: "",
  new_phone: "",
  invited_at: "",
  action_link: "",
  email: `${id}@example.com`,
  phone: "",
  created_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  email_confirmed_at: new Date().toISOString(),
  phone_confirmed_at: "",
  last_sign_in_at: new Date().toISOString(),
  role: "authenticated",
  updated_at: new Date().toISOString(),
  identities: [],
  factors: [],
});

const createJsonRequest = (
  action: string,
  payload?: unknown,
  authToken?: string
): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const body = { action, payload };
  return new Request("http://localhost/dialectic-service", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

describe("Dialectic Service - getSessionDetails Integration Tests", () => {
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockAdminClient: IMockSupabaseClient;
  let mockUserClient: IMockSupabaseClient;
  let mockHandlers: Partial<ActionHandlers>;
  let loggerStubs: { debug: any; info: any; warn: any; error: any };

  beforeEach(() => {
    // Initial default setup
    const defaultConfig: MockSupabaseDataConfig = { mockUser: getMockUser() }; // Ensures a valid user for auth checks by default
    mockSupabaseSetup = createMockSupabaseClient(MOCK_USER_ID, defaultConfig);
    mockAdminClient = mockSupabaseSetup.client;
    mockUserClient = mockSupabaseSetup.client;

    mockHandlers = {}; // No specific handlers mocked for these integration tests

    loggerStubs = {
      debug: stub(sharedLogger.logger, "debug", () => {}),
      info: stub(sharedLogger.logger, "info", () => {}),
      warn: stub(sharedLogger.logger, "warn", () => {}),
      error: stub(sharedLogger.logger, "error", () => {}),
    };
  });

  afterEach(() => {
    loggerStubs.debug.restore();
    loggerStubs.info.restore();
    loggerStubs.warn.restore();
    loggerStubs.error.restore();
    mockSupabaseSetup.clearAllStubs?.();
  });

  it("should return 400 if sessionId is not provided in payload for getSessionDetails", async () => {
    const req = createJsonRequest("getSessionDetails", {}, "mock-auth-token"); // Authenticated request, empty payload
    const response = await handleRequest(
      req,
      mockHandlers as ActionHandlers,
      mockUserClient as any, 
      mockAdminClient as any
    );
    const body = await response.json();

    assertEquals(response.status, 400);
    assertExists(body.error);
    assertEquals(body.error, "sessionId is required for getSessionDetails");
  });

  it("should return 401 if auth token is missing or invalid for getSessionDetails", async () => {
    const authErrorConfig: MockSupabaseDataConfig = {
      getUserResult: { 
        data: { user: null }, 
        error: { name: "AuthError", message: "User not authenticated", status: 401 } as any 
      }
    };
    const specificAuthErrorSetup = createMockSupabaseClient(MOCK_USER_ID, authErrorConfig);
    const userClientForAuthError = specificAuthErrorSetup.client;
    
    const req = createJsonRequest("getSessionDetails", { sessionId: "some-session-id" }); // No token provided
    const response = await handleRequest(
      req,
      mockHandlers as ActionHandlers,
      userClientForAuthError as any,
      mockAdminClient as any 
    );
    const body = await response.json();

    assertEquals(response.status, 401);
    assertExists(body.error);
    assertEquals(body.error, "User not authenticated"); 
  });
  
  // More tests to come:
  // - 404 if session not found
  // - 404 if session found but does not belong to the user
  // - 500 for database errors during fetch
  // - 200 with correct session data, ensuring only user's own session is accessible
}); 