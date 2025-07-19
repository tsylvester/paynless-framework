import { assertEquals, assertExists, assertObjectMatch, assertRejects } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { spy, assertSpyCall, assertSpyCalls } from "https://deno.land/std@0.192.0/testing/mock.ts";
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  initializeTestDeps,
} from "../_shared/_integration.test.utils.ts";
import { handleMeRequest, MeHandlerDeps } from './index.ts';
import { createMockEmailMarketingService } from '../_shared/email_service/email.mock.ts';
import {
  createSupabaseClient,
  createUnauthorizedResponse
} from '../_shared/auth.ts';
import { 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from '../_shared/cors-headers.ts';
import { TablesUpdate } from "../types_db.ts";
import { UserProfileUpdate } from "../_shared/types.ts";

Deno.test("/me Integration Tests", async (t) => {
  initializeTestDeps();
  
  // --- Test Suite for GET /me ---
  await t.step("GET /me handler", async (t) => {
    const mockEmailService = createMockEmailMarketingService();
    const mockDeps: MeHandlerDeps = {
      handleCorsPreflightRequest,
      createUnauthorizedResponse,
      createErrorResponse,
      createSuccessResponse,
      createSupabaseClient,
      getEmailMarketingService: () => mockEmailService,
    };
    let testContext: Awaited<ReturnType<typeof coreInitializeTestStep>>;

    await t.step("Setup: Create test user", async () => {
        testContext = await coreInitializeTestStep({
            userProfile: { first_name: "MeGetTest" }
        });
    });

    await t.step("Success: Call /me with a valid token returns user and profile", async () => {
      const req = new Request(`http://localhost/me`, {
        method: 'GET',
        headers: {
          "Authorization": `Bearer ${testContext.primaryUserJwt}`,
        },
      });

      const res = await handleMeRequest(req, mockDeps);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertExists(body.user);
      assertExists(body.profile);
      assertEquals(body.user.id, testContext.primaryUserId);
      assertEquals(body.profile.id, testContext.primaryUserId);
      assertEquals(body.profile.first_name, "MeGetTest");
    });

    await t.step("Failure: Call /me without a token returns 401", async () => {
        const req = new Request(`http://localhost/me`, { method: 'GET' });
        const res = await handleMeRequest(req, mockDeps);
        assertEquals(res.status, 401);
    });

    await t.step("Cleanup: Remove test user", async () => {
        await coreCleanupTestResources();
    });
  });

  // --- Test Suite for POST /me ---
  await t.step("POST /me handler", async (t) => {
    const mockEmailService = createMockEmailMarketingService();
    const addUserToListSpy = spy(mockEmailService, 'addUserToList');
    const removeUserSpy = spy(mockEmailService, 'removeUser');

    const mockDeps: MeHandlerDeps = {
      handleCorsPreflightRequest,
      createUnauthorizedResponse,
      createErrorResponse,
      createSuccessResponse,
      createSupabaseClient,
      getEmailMarketingService: () => mockEmailService,
    };
    let testContext: Awaited<ReturnType<typeof coreInitializeTestStep>>;
    let initialProfile: TablesUpdate<'user_profiles'>;

    await t.step("Setup: Create a clean test user for POST tests", async () => {
        initialProfile = {
            first_name: 'Initial',
            last_name: 'User',
            is_subscribed_to_newsletter: false,
            has_seen_welcome_modal: false,
        };
        testContext = await coreInitializeTestStep({});
        // Manually update profile to desired initial state
        await testContext.adminClient.from('user_profiles').update(initialProfile).eq('id', testContext.primaryUserId);
    });

    await t.step("Basic Update: Can update first_name and last_name", async () => {
        const payload: UserProfileUpdate = { first_name: "UpdatedFirst", last_name: "UpdatedLast" };
        const req = new Request('http://localhost/me', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testContext.primaryUserJwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const res = await handleMeRequest(req, mockDeps);
        const body = await res.json();
        
        assertEquals(res.status, 200);
        assertObjectMatch(body, { first_name: "UpdatedFirst", last_name: "UpdatedLast" });

        const { data: dbProfile } = await testContext.adminClient.from('user_profiles').select('*').eq('id', testContext.primaryUserId).single();
        assertExists(dbProfile);
        assertObjectMatch(dbProfile, { first_name: "UpdatedFirst", last_name: "UpdatedLast" });
    });

    await t.step("Newsletter: Subscribing calls addUserToList", async () => {
        const payload: UserProfileUpdate = { is_subscribed_to_newsletter: true };
        const req = new Request('http://localhost/me', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testContext.primaryUserJwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        await handleMeRequest(req, mockDeps);
        
        assertSpyCalls(addUserToListSpy, 1);
        assertSpyCalls(removeUserSpy, 0);
    });

    await t.step("Newsletter: Unsubscribing calls removeUser", async () => {
        await testContext.adminClient.from('user_profiles').update({ is_subscribed_to_newsletter: true }).eq('id', testContext.primaryUserId);
        
        const payload: UserProfileUpdate = { is_subscribed_to_newsletter: false };
        const req = new Request('http://localhost/me', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testContext.primaryUserJwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        
        await handleMeRequest(req, mockDeps);

        assertSpyCalls(removeUserSpy, 1);
        assertSpyCalls(addUserToListSpy, 1); // Not reset from previous test
    });
    
    await t.step("Newsletter: No change in subscription does not call email service", async () => {
        const payload: UserProfileUpdate = { is_subscribed_to_newsletter: false, first_name: "NoSubChange" };
        const req = new Request('http://localhost/me', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testContext.primaryUserJwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        await handleMeRequest(req, mockDeps);

        assertSpyCalls(removeUserSpy, 1);
        assertSpyCalls(addUserToListSpy, 1);

        const { data: dbProfile } = await testContext.adminClient.from('user_profiles').select('*').eq('id', testContext.primaryUserId).single();
        assertExists(dbProfile);
        assertEquals(dbProfile.first_name, "NoSubChange");
    });

    await t.step("Welcome Modal: Can update has_seen_welcome_modal", async () => {
        const payload: UserProfileUpdate = { has_seen_welcome_modal: true };
        const req = new Request('http://localhost/me', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testContext.primaryUserJwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const res = await handleMeRequest(req, mockDeps);
        const body = await res.json();
        
        assertEquals(res.status, 200);
        assertEquals(body.has_seen_welcome_modal, true);
        assertSpyCalls(addUserToListSpy, 1);
        assertSpyCalls(removeUserSpy, 1);
    });

    await t.step("Edge Case: Empty payload does not error", async () => {
        const req = new Request('http://localhost/me', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testContext.primaryUserJwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });

        const res = await handleMeRequest(req, mockDeps);
        assertEquals(res.status, 200);
    });

    await t.step("Security: Unauthorized request fails", async () => {
        const req = new Request('http://localhost/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name: "Unauthorized" }),
        });

        const res = await handleMeRequest(req, mockDeps);
        assertEquals(res.status, 401);
    });

    await t.step("Cleanup: Remove test user", async () => {
        await coreCleanupTestResources();
    });
  });
});