import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import {
  assertSpyCall,
  assertSpyCalls,
  spy,
  stub,
  type Spy,
} from "jsr:@std/testing@0.225.1/mock";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseClient, createUnauthorizedResponse } from "../_shared/auth.ts";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { getEmailMarketingService } from "../_shared/email_service/factory.ts";
import {
  createMockSupabaseClient,
  type IMockClientSpies,
  type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";
import type { EmailMarketingService } from "../_shared/types.ts";
import { handleMeRequest } from "./index.ts";
import { MeGetResponse, MeHandlerDeps } from "./index.interface.ts";
import {
  createMockTierDefinitions,
  findMockTierByLevel,
  mockMeHandlerDeps,
  mockTierDefinitionsSelect,
  mockUserSubscriptionsSelect,
} from "./index.mock.ts";

Deno.test("Me Function (/me) Tests", async (t) => {
  const mockUserId = "user-me-123";
  const mockUser: User = {
    id: mockUserId,
    email: "me@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    role: "authenticated",
  };
  const mockProfile = { id: mockUserId, username: "testuser", avatar_url: "url" };
  const mockUpdateData = { username: "updateduser" };
  const mockUpdatedProfile = { ...mockProfile, ...mockUpdateData };
  const mockNewsletterProfileSelectRow = {
    is_subscribed_to_newsletter: false,
    first_name: "Test",
    last_name: "User",
  };
  const expectedTiers = createMockTierDefinitions();

  let createUnauthorizedSpy: Spy<typeof createUnauthorizedResponse>;
  let createErrorSpy: Spy<typeof createErrorResponse>;
  let createSuccessSpy: Spy<typeof createSuccessResponse>;
  let createSupabaseSpy: Spy<typeof createSupabaseClient>;
  let getEmailServiceSpy: Spy<typeof getEmailMarketingService>;
  let addUserToListSpy: Spy<EmailMarketingService["addUserToList"]>;
  let removeUserSpy: Spy<EmailMarketingService["removeUser"]>;

  let supabaseSpies: IMockClientSpies;

  const setup = (config: MockSupabaseDataConfig = {}) => {
    const { client: mockSupabaseClient, spies } = createMockSupabaseClient(
      mockUserId,
      {
        mockUser,
        simulateAuthError: config.simulateAuthError,
        genericMockResults: {
          user_profiles: {
            select: { data: [mockProfile], error: null },
            update: { data: [mockUpdatedProfile], error: null },
            ...config.genericMockResults?.user_profiles,
          },
          user_subscriptions: {
            select: mockUserSubscriptionsSelect(0),
            ...config.genericMockResults?.user_subscriptions,
          },
          tier_definitions: {
            select: mockTierDefinitionsSelect(),
            ...config.genericMockResults?.tier_definitions,
          },
          ...config.genericMockResults,
        },
      },
    );
    supabaseSpies = spies;

    createUnauthorizedSpy = spy(
      (msg: string) =>
        new Response(JSON.stringify({ error: msg }), { status: 401 }),
    );
    createErrorSpy = spy(
      (msg: string, status = 500) =>
        new Response(JSON.stringify({ error: msg }), { status }),
    );
    createSuccessSpy = spy(
      (data: MeGetResponse | MeGetResponse["profile"]) =>
        new Response(JSON.stringify(data), { status: 200 }),
    );
    createSupabaseSpy = spy(() => mockSupabaseClient as unknown as SupabaseClient);

    addUserToListSpy = spy(() => Promise.resolve());
    removeUserSpy = spy(() => Promise.resolve());
    getEmailServiceSpy = spy(() => ({
      addUserToList: addUserToListSpy,
      removeUser: removeUserSpy,
      updateUserAttributes: spy(() => Promise.resolve()),
    }));
  };

  const getDeps = (): MeHandlerDeps =>
    mockMeHandlerDeps({
      handleCorsPreflightRequest: () => null,
      createUnauthorizedResponse: createUnauthorizedSpy,
      createErrorResponse: createErrorSpy,
      createSuccessResponse: createSuccessSpy,
      createSupabaseClient: createSupabaseSpy,
      getEmailMarketingService: getEmailServiceSpy,
    });

  const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
    if (key === "SUPABASE_URL") return "http://localhost:54321";
    if (key === "SUPABASE_ANON_KEY") return "test-anon-key";
    return "dummy-value";
  });

  try {
    await t.step("OPTIONS request should handle CORS preflight", async () => {
      setup();
      const mockResponse = new Response(null, { status: 204 });
      const deps = getDeps();

      const corsStub = stub(deps, "handleCorsPreflightRequest", () => mockResponse);

      try {
        const req = new Request("http://example.com/me", { method: "OPTIONS" });
        const res = await handleMeRequest(req, deps);
        assertEquals(res, mockResponse);
        assertSpyCall(corsStub, 0);
      } finally {
        corsStub.restore();
      }
    });

    await t.step("Request without auth token should fail", async () => {
      setup({ simulateAuthError: new Error("Auth error") });
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      assertSpyCall(createUnauthorizedSpy, 0);
    });

    await t.step("GET: successful profile fetch returns profile", async () => {
      setup();
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      const querySpies = supabaseSpies.getLatestQueryBuilderSpies("user_profiles");
      assertExists(querySpies?.select);
      assertSpyCall(querySpies.select, 0);
      assertSpyCall(createSuccessSpy, 0);
      const responseData: MeGetResponse = createSuccessSpy.calls[0].args[0];
      assertEquals(responseData.userTier, findMockTierByLevel(0));
      assertEquals(responseData.tiers.length, 4);
      assertEquals(responseData.tiers, expectedTiers);
    });

    await t.step("GET: returns correct userTier for tier_level 0", async () => {
      setup();
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      const responseData: MeGetResponse = createSuccessSpy.calls[0].args[0];
      assertEquals(responseData.userTier, findMockTierByLevel(0));
    });

    await t.step("GET: returns correct userTier for tier_level 20", async () => {
      setup({
        genericMockResults: {
          user_subscriptions: {
            select: mockUserSubscriptionsSelect(20),
          },
        },
      });
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      const responseData: MeGetResponse = createSuccessSpy.calls[0].args[0];
      assertEquals(responseData.userTier, findMockTierByLevel(20));
    });

    await t.step("GET: returns all tier_definitions in tiers array", async () => {
      setup();
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      const responseData: MeGetResponse = createSuccessSpy.calls[0].args[0];
      assertEquals(responseData.tiers, expectedTiers);
    });

    await t.step("GET: returns 500 when user_subscriptions query errors", async () => {
      setup({
        genericMockResults: {
          user_subscriptions: {
            select: { data: null, error: new Error("query failed") },
          },
        },
      });
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      assertSpyCall(createErrorSpy, 0);
      assertSpyCalls(createSuccessSpy, 0);
    });

    await t.step("GET: returns 500 when user_subscriptions row does not exist", async () => {
      setup({
        genericMockResults: {
          user_subscriptions: {
            select: { data: null, error: null },
          },
        },
      });
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      assertSpyCall(createErrorSpy, 0);
      assertSpyCalls(createSuccessSpy, 0);
    });

    await t.step("GET: returns 500 when tier_definitions query errors", async () => {
      setup({
        genericMockResults: {
          tier_definitions: {
            select: { data: null, error: new Error("query failed") },
          },
        },
      });
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      assertSpyCall(createErrorSpy, 0);
      assertSpyCalls(createSuccessSpy, 0);
    });

    await t.step("GET: returns 500 when tier_definitions returns empty array", async () => {
      setup({
        genericMockResults: {
          tier_definitions: {
            select: { data: [], error: null },
          },
        },
      });
      const req = new Request("http://example.com/me", { method: "GET" });
      await handleMeRequest(req, getDeps());
      assertSpyCall(createErrorSpy, 0);
      assertSpyCalls(createSuccessSpy, 0);
    });

    await t.step(
      "GET: returns 500 when tier_level has no matching tier definition",
      async () => {
        setup({
          genericMockResults: {
            user_subscriptions: {
              select: mockUserSubscriptionsSelect(99),
            },
          },
        });
        const req = new Request("http://example.com/me", { method: "GET" });
        await handleMeRequest(req, getDeps());
        assertSpyCall(createErrorSpy, 0);
        assertSpyCalls(createSuccessSpy, 0);
      },
    );

    await t.step("POST: successful profile update returns updated profile", async () => {
      setup();
      const req = new Request("http://example.com/me", {
        method: "POST",
        body: JSON.stringify(mockUpdateData),
      });
      await handleMeRequest(req, getDeps());
      const querySpies = supabaseSpies.getLatestQueryBuilderSpies("user_profiles");
      assertExists(querySpies?.update);
      assertSpyCall(querySpies.update, 0, { args: [mockUpdateData] });
      assertSpyCall(createSuccessSpy, 0);
    });

    await t.step("POST: subscribing to newsletter calls addUserToList", async () => {
      setup({
        genericMockResults: {
          user_profiles: {
            select: { data: [mockNewsletterProfileSelectRow], error: null },
            update: {
              data: [{ ...mockNewsletterProfileSelectRow, is_subscribed_to_newsletter: true }],
              error: null,
            },
          },
        },
      });
      const req = new Request("http://example.com/me", {
        method: "POST",
        body: JSON.stringify({ is_subscribed_to_newsletter: true }),
      });
      await handleMeRequest(req, getDeps());
      assertSpyCall(addUserToListSpy, 0);
      assertSpyCalls(removeUserSpy, 0);
    });

    await t.step("POST: unsubscribing from newsletter calls removeUser", async () => {
      setup({
        genericMockResults: {
          user_profiles: {
            select: {
              data: [{ ...mockNewsletterProfileSelectRow, is_subscribed_to_newsletter: true }],
              error: null,
            },
            update: {
              data: [{ ...mockNewsletterProfileSelectRow, is_subscribed_to_newsletter: false }],
              error: null,
            },
          },
        },
      });
      const req = new Request("http://example.com/me", {
        method: "POST",
        body: JSON.stringify({ is_subscribed_to_newsletter: false }),
      });
      await handleMeRequest(req, getDeps());
      assertSpyCalls(addUserToListSpy, 0);
      assertSpyCall(removeUserSpy, 0);
    });

    await t.step("GET: missing profile creates a new one", async () => {
      const newProfileData = { id: mockUserId, first_name: null, role: "user" };
      setup({
        genericMockResults: {
          user_profiles: {
            select: { data: null, error: null },
            insert: { data: [newProfileData], error: null },
          },
        },
      });
      const req = new Request("http://example.com/me", { method: "GET" });
      const res = await handleMeRequest(req, getDeps());
      const body = await res.json();
      assertEquals(body.profile.id, newProfileData.id);
      const querySpies = supabaseSpies.getLatestQueryBuilderSpies("user_profiles");
      assertExists(querySpies?.insert);
      assertSpyCall(querySpies.insert, 0);
      assertSpyCall(createSuccessSpy, 0);
    });
  } finally {
    envGetStub.restore();
  }
});
