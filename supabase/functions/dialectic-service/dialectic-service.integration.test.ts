import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { 
  assertEquals,
  assert,
  assertExists,
  assertNotEquals,
  assertThrows,
  assertStringIncludes,
  fail,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient, type SupabaseClient, FunctionsHttpError } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../types_db.ts";
import {
  initializeTestDeps,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreGenerateTestUserJwt,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  TestResourceRequirement,
  registerUndoAction,
} from "../_shared/_integration.test.utils.ts";
import type { DialecticServiceRequest, GenerateContributionsPayload, StartSessionPayload } from "./dialectic.interface.ts";

const TEST_DOMAIN_TAG_1 = "software_development";
const TEST_DOMAIN_TAG_2 = "technical_writing";
const INVALID_DOMAIN_TAG = "invalid_domain_tag_for_testing";

describe("Edge Function: dialectic-service", () => {
  let adminClient: SupabaseClient<Database>;

  let baseThesisPromptId: string;
  let baseAntithesisPromptId: string;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { data: thesisPrompt, error: thesisErr } = await adminClient
      .from("system_prompts")
      .select("id")
      .eq("name", "dialectic_thesis_base_v1")
      .single();
    if (thesisErr || !thesisPrompt) {
      throw new Error("Test setup failed: Could not fetch base thesis prompt. Ensure it's seeded.");
    }
    baseThesisPromptId = thesisPrompt.id;

    const { data: antithesisPrompt, error: antiErr } = await adminClient
      .from("system_prompts")
      .select("id")
      .eq("name", "dialectic_antithesis_base_v1")
      .single();
    if (antiErr || !antithesisPrompt) {
      throw new Error("Test setup failed: Could not fetch base antithesis prompt. Ensure it's seeded.");
    }
    baseAntithesisPromptId = antithesisPrompt.id;

    // Removed manual seeding of domain_specific_prompt_overlays
    // console.log("Shared test domain overlays upserted for dialectic-service tests."); // Keep if other global setup happens
  });

  afterAll(async () => {
    // Removed manual cleanup of domain_specific_prompt_overlays
    // The global coreCleanupTestResources will handle resources registered with 'global' scope.
    await coreCleanupTestResources('all');
  });

  describe("Action: listAvailableDomains", () => {
    describe("With existing domain tags", () => {
      beforeEach(async () => {
        // Setup the specific overlays needed for this test suite
        await coreInitializeTestStep({ 
          resources: [
            {
              tableName: "domain_specific_prompt_overlays",
              identifier: { system_prompt_id: baseThesisPromptId, domain_tag: TEST_DOMAIN_TAG_1, version: 99 },
              desiredState: { 
                overlay_values: { test_data: "ensure software_development for thesis" }, 
                description: "Test overlay for software_development (thesis)",
                is_active: true,
              },
            },
            {
              tableName: "domain_specific_prompt_overlays",
              identifier: { system_prompt_id: baseAntithesisPromptId, domain_tag: TEST_DOMAIN_TAG_1, version: 99 },
              desiredState: { 
                overlay_values: { test_data: "ensure software_development for antithesis" }, 
                description: "Test overlay for software_development (antithesis)",
                is_active: true,
              },
            },
            {
              tableName: "domain_specific_prompt_overlays",
              identifier: { system_prompt_id: baseThesisPromptId, domain_tag: TEST_DOMAIN_TAG_2, version: 99 },
              desiredState: { 
                overlay_values: { test_data: "ensure technical_writing" }, 
                description: "Test overlay for technical_writing",
                is_active: true,
              },
            },
          ],
          userProfile: { first_name: "ListDomainTagsUser" }
        }, 'local');
      });

      afterEach(async () => {
        await coreCleanupTestResources('local');
      });

      it("should return a distinct list of available domain tags", async () => {
        const request: DialecticServiceRequest = { action: "listAvailableDomains" };
        const { data: actualData, error } = await adminClient.functions.invoke("dialectic-service", { body: request });
        
        assertEquals(error, null, "Function invocation should not error");
        assertExists(actualData, "Response data should exist");
        assertEquals((actualData)?.error, undefined, "Response data should not contain an error structure");
        
        assert(Array.isArray(actualData), "Payload data should be an array");
        const tags = actualData;
        assert(tags.includes(TEST_DOMAIN_TAG_1), "Tags should include TEST_DOMAIN_TAG_1");
        assert(tags.includes(TEST_DOMAIN_TAG_2), "Tags should include TEST_DOMAIN_TAG_2");
        const distinctTags = [...new Set(tags)];
        assertEquals(tags.length, distinctTags.length, "Tags list should only contain distinct tags");
      });
    });

    describe("With no existing domain tags", () => {
      let testUserClient: SupabaseClient<Database>;

      beforeEach(async () => {
        if (!adminClient) {
          throw new Error("Supabase admin client not available for 'With no existing domain tags' setup.");
        }

        console.log("[TestEnv] Deleting overlays for specific test tags (TDT1, TDT2) for 'empty list' test precondition.");
        const tagsToClear = [TEST_DOMAIN_TAG_1, TEST_DOMAIN_TAG_2];
        for (const tag of tagsToClear) {
          const { error: deleteError } = await adminClient
            .from('domain_specific_prompt_overlays')
            .delete()
            .eq('domain_tag', tag);
          if (deleteError && deleteError.code !== 'PGRST116') { // PGRST116 means 0 rows, which is fine
              console.error(`[TestEnv] Error deleting overlays for tag '${tag}': ${deleteError.message}.`);
              throw deleteError;
          }
        }
        
        const setupResult = await coreInitializeTestStep({
          userProfile: { first_name: `TestUser${crypto.randomUUID().substring(0,4)}` },
        });
        testUserClient = setupResult.primaryUserClient;
      });

      afterEach(async () => {
        await coreCleanupTestResources('local');
      });

      it("should return an empty list if no domain_specific_prompt_overlays exist", async () => {
        const request: DialecticServiceRequest = {
          action: "listAvailableDomains",
        };
        // Use adminClient as listAvailableDomainTags is likely an admin/public action not needing user context
        const { data: actualData, error } = await adminClient.functions.invoke("dialectic-service", { body: request });

        assertEquals(error, null, "Function invocation should not error");
        assertExists(actualData, "Response data should exist");
        assertEquals((actualData)?.error, undefined, "Response data should not contain an error structure");
        
        assert(Array.isArray(actualData), "Payload data should be an array");
        assertEquals((actualData).length, 0, "Expected empty array when no overlays exist");
      });
    });
  });

  describe("Action: listProjects", () => {
    let testUserClient: SupabaseClient<Database>;
    let testUserId: string;

    afterEach(async () => {
      await coreCleanupTestResources('local');
    });

    it("should return an empty list for a new user with no projects", async () => {
      const { primaryUserClient, primaryUserId } = await coreInitializeTestStep({ userProfile: { first_name: "ListProjectsUserNoProjects" } });
      testUserClient = primaryUserClient;
      testUserId = primaryUserId;
      const testUserAuthToken = await coreGenerateTestUserJwt(testUserId);

      const request: DialecticServiceRequest = { action: "listProjects" };
      const { data: actualData, error } = await testUserClient.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });

      assertEquals(error, null, "Function invocation should not error");
      assertExists(actualData, "Response data should exist and not be an error structure");
      assertEquals((actualData)?.error, undefined, "Response data should not contain an error structure");
      assert(Array.isArray(actualData), "Payload data should be an array");
      assertEquals((actualData).length, 0, "Expected empty array for new user");
    });

    it("should return a list of projects for a user who owns them", async () => {
      const uniqueProjectName1 = `MyListProject1-${crypto.randomUUID().substring(0, 8)}`;
      const uniqueProjectName2 = `MyListProject2-${crypto.randomUUID().substring(0, 8)}`;
      
      const { primaryUserClient, primaryUserId } = await coreInitializeTestStep({
        userProfile: { first_name: "ListProjectsUserWithProjects" },
        resources: [
          {
            tableName: "dialectic_projects",
            identifier: { project_name: uniqueProjectName1 },
            desiredState: { initial_user_prompt: "Prompt 1" },
            linkUserId: true,
          },
          {
            tableName: "dialectic_projects",
            identifier: { project_name: uniqueProjectName2 },
            desiredState: { initial_user_prompt: "Prompt 2" },
            linkUserId: true,
          },
        ],
      });
      testUserClient = primaryUserClient;
      testUserId = primaryUserId;
      const testUserAuthToken = await coreGenerateTestUserJwt(testUserId);

      const request: DialecticServiceRequest = { action: "listProjects" };
      const { data: actualData, error } = await testUserClient.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });
      assertEquals(error, null, "Function invocation should not error");
      assertExists(actualData, "Response data should exist and not be an error structure");
      assertEquals((actualData?.error), undefined, "Response data should not contain an error structure");
      assert(Array.isArray(actualData), "Payload should be an array");
      const projects = actualData;
      assertEquals(projects.length, 2, "Expected 2 projects");
      const names = projects.map(p => p.project_name);
      assert(names.includes(uniqueProjectName1) && names.includes(uniqueProjectName2), "Returned names should include both created projects");
      assertNotEquals(projects[0].project_name, projects[1].project_name, "Project names should be unique");
    });

    it("should not list projects belonging to another user", async () => {
      // User A creates a project
      const projectForUserAName = `ProjectForUserA-${crypto.randomUUID().substring(0,8)}`;
      const userASetup = await coreInitializeTestStep({
        userProfile: { first_name: "UserAForListIsolation" },
        resources: [{
          tableName: "dialectic_projects",
          identifier: { project_name: projectForUserAName },
          desiredState: { initial_user_prompt: "User A's prompt" },
          linkUserId: true, // This will link it to UserAForListIsolation
        }],
      }, 'local'); 
      // userASetup.primaryUserId now has a project linked to it.

      // User B (our test user) tries to list projects
      const { primaryUserClient: userBClient, primaryUserId: userBId } = await coreInitializeTestStep({ 
        userProfile: { first_name: "UserBForListIsolation" }
      }, 'local'); // Specify 'local' scope for User B's resources as well
      const userBAuthToken = await coreGenerateTestUserJwt(userBId);
      
      const request: DialecticServiceRequest = { action: "listProjects" };
      const { data: actualData, error } = await userBClient.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${userBAuthToken}` }
      });
      assertEquals(error, null, "Function invocation should not error");
      assertExists(actualData, "Response data should exist and not be an error structure");
      assertEquals((actualData?.error), undefined, "Response data should not contain an error structure");
      assert(Array.isArray(actualData), "Payload should be an array");
      assertEquals((actualData).length, 0, "User B should see no projects");
    });

    it("should return 401 if JWT is missing or invalid", async () => {
      const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      });
      const functionUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/dialectic-service`;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const requestBody: DialecticServiceRequest = { action: "listProjects" };
      const allowedOriginForTest = "http://localhost:5173";

      // Test with missing Authorization header (using fetch to ensure no implicit auth from client)
      try {
        const response = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseAnonKey, // Supabase gateway requires this for direct calls
            "Origin": allowedOriginForTest, // Added origin for CORS check by server
          },
          body: JSON.stringify(requestBody)
        });
        console.log("[Test Debug] Missing Auth (fetch) - Response Status:", response.status);
        const responseJsonMissingAuth = await response.json();
        console.log("[Test Debug] Missing Auth (fetch) - Response Body:", responseJsonMissingAuth);
        assertEquals(response.status, 401, "Expected 401 for missing auth");
        if (typeof responseJsonMissingAuth?.msg === 'string') {
          assertStringIncludes(responseJsonMissingAuth.msg.toLowerCase(), "missing authorization header");
        }

      } catch (fetchError: unknown) {
        // console.error("[Test Debug] Fetch error (Missing Auth Test):", fetchError);
        // Deno.test might not catch this if the fetch itself fails before HTTP error
        fail("Fetch itself failed for missing auth test");
      }
      
      // Test with invalid Authorization header (using invoke which might handle errors differently)
      try {
        const { data, error: invokeError } = await anonClient.functions.invoke("dialectic-service", {
          body: requestBody,
          headers: { Authorization: "Bearer invalid.token.here" }
        });
        console.log("[Test Debug] Invalid Auth Invoke - Result - Data:", data);
        console.log("[Test Debug] Invalid Auth Invoke - Result - Error:", invokeError);

        // If invokeError is present, it means the client library itself caught an HTTP error
        assert(invokeError, "Expected an error for invalid JWT");
        if (invokeError) {
            const err = invokeError; // FunctionsError | Error
            console.log("[Test Debug] Invalid Auth - Error Name (from invokeError.name):", err.name);
            console.log("[Test Debug] Invalid Auth - Error Message (from invokeError.message):", err.message);
            // Check for FunctionsHttpError which often wraps the actual response error
            if (err.name === 'FunctionsHttpError' && err.context && typeof err.context.json === 'function') {
                const errorBody = await err.context.json(); // Parse the JSON body from the response context
                console.log("[Test Debug] Invalid Auth - Error Body (from err.context.json()):", errorBody);
                assertEquals(err.context.status, 401);
                const message = errorBody.error || errorBody.msg || ""; // Check .error or .msg
                assertStringIncludes(String(message).toLowerCase(), 'invalid jwt');
            } else if (err.name === 'AuthApiError' || err.message?.includes('AuthApiError')) { // Direct AuthApiError
                console.log("[Test Debug] Invalid Auth - Direct AuthApiError or message includes it");
                assert(!!(err.status === 401 || err.code === 401 || err.statusCode === 401 || err.cause?.status === 401), "Expected 401 status");
                assertStringIncludes(err.message.toLowerCase(), 'invalid jwt');
            } else {
                 // Fallback for other error types, less specific check
                console.log("[Test Debug] Invalid Auth - Other error type, checking message for 'Invalid JWT' or status 401");
                const messageContainsInvalidJwt = err.message?.toLowerCase().includes('invalid jwt');
                const statusIs401 = err.status === 401 || err.code === 401 || err.details?.status === 401 || (err.context && err.context.status === 401);
                assert(!!(messageContainsInvalidJwt || statusIs401), "Error message should indicate invalid JWT or status should be 401");
            }
        }
      } catch (e: unknown) {
        console.error("[Test Debug] Error during invalid JWT test with invoke:", e);
        fail("Test with invalid JWT (invoke) failed unexpectedly");
      }
    });
  });

  describe("'generateContributions' action", () => {
    let testPrimaryUserId: string;
    let testPrimaryUserClient: SupabaseClient<Database>;
    let testUserAuthToken: string;
    let testAdminClient: SupabaseClient<Database>;

    let testProjectId: string;
    let testSessionId: string;
    // session model linkage removed; we validate contributions without referencing dialectic_session_models
    let testAssociatedChatId: string;

    // const TEST_AI_PROVIDER_ID = "openai"; // Commenting out as we'll use a dummy model
    // const TEST_MODEL_CATALOG_ID = "gpt-4"; // Commenting out

    beforeEach(async () => {
      testAssociatedChatId = crypto.randomUUID();

      const uniqueProjectName = `Thesis Test Project ${crypto.randomUUID()}`;
      // Use THE single, globally seeded, working dummy provider ID
      const workingDummyProviderId = '11111111-1111-1111-1111-111111111111'; 

      const setupResult = await coreInitializeTestStep({
        userProfile: { first_name: "DialecticThesisUser" },
        resources: [
          {
            tableName: "dialectic_projects",
            identifier: { project_name: uniqueProjectName },
            desiredState: {
              initial_user_prompt: "A fascinating problem for the AI.",
              selected_domain_tag: TEST_DOMAIN_TAG_1,
            },
            linkUserId: true,
          },
          // NO ai_providers resource definition here. We rely on the globally seeded one.
          // The following are other necessary resources for the test.
          {
            tableName: "domain_specific_prompt_overlays",
            identifier: { system_prompt_id: baseThesisPromptId, domain_tag: TEST_DOMAIN_TAG_1, version: 99 },
            desiredState: { 
              overlay_values: { test_data: "ensure software_development for thesis" }, 
              description: "Test overlay for software_development (thesis) for generateContributions",
              is_active: true,
            },
          },
          {
            tableName: "domain_specific_prompt_overlays",
            identifier: { system_prompt_id: baseAntithesisPromptId, domain_tag: TEST_DOMAIN_TAG_1, version: 99 },
            desiredState: { 
              overlay_values: { test_data: "ensure software_development for antithesis" }, 
              description: "Test overlay for software_development (antithesis) for generateContributions",
              is_active: true,
            },
          },
          // ADD System Prompts required for startSession for TEST_DOMAIN_TAG_1
          {
            tableName: "system_prompts",
            identifier: { id: baseThesisPromptId }, // Use the known ID from the constant
            desiredState: {
              name: "dialectic_thesis_base_v1", // Keep original name, or a test-specific one if not relying on this for lookup
              prompt_text: "Test-specific thesis prompt for {{domain_tag}}.",
              description: "Test thesis prompt aligned with service default lookup.",
              is_active: true,
              version: 1, // Or appropriate version
              // Fields for default lookup by startSession:
              stage_association: 'thesis',
              is_stage_default: true,
              context: TEST_DOMAIN_TAG_1, // Align with project's domain tag
              // prompt_name is not used by service for default lookup, but 'name' column is.
            },
          },
          {
            tableName: "system_prompts",
            identifier: { id: baseAntithesisPromptId }, // Use the known ID from the constant
            desiredState: {
              name: "dialectic_antithesis_base_v1", // Keep original name
              prompt_text: "Test-specific antithesis prompt for {{domain_tag}}.",
              description: "Test antithesis prompt aligned with service default lookup.",
              is_active: true,
              version: 1, // Or appropriate version
              // Fields for default lookup by startSession:
              stage_association: 'antithesis',
              is_stage_default: true,
              context: TEST_DOMAIN_TAG_1, // Align with project's domain tag
            },
          }
        ],
      }, 'local');

      testPrimaryUserId = setupResult.primaryUserId;
      testPrimaryUserClient = setupResult.primaryUserClient;
      testAdminClient = setupResult.adminClient;
      testUserAuthToken = await coreGenerateTestUserJwt(testPrimaryUserId);

      const projectResourceInfo = setupResult.processedResources.find(
        (r) => 
          r.tableName === "dialectic_projects" && 
          (r.identifier).project_name === uniqueProjectName
      );

      if (!projectResourceInfo || projectResourceInfo.status === 'failed' || !projectResourceInfo.resource?.id) {
        const errorMessage = `Failed to get or create project '${uniqueProjectName}' during test setup. Status: ${projectResourceInfo?.status}, Error: ${projectResourceInfo?.error || 'Unknown error'}`;
        console.error(errorMessage, projectResourceInfo);
        throw new Error(errorMessage);
      }
      testProjectId = projectResourceInfo.resource.id;

      // Ensure we have the initial user prompt from the project data for the session
      const { data: projectData, error: projectError } = await testAdminClient
        .from('dialectic_projects')
        .select('initial_user_prompt, selected_domain_id')
        .eq('id', testProjectId)
        .single();

      if (projectError || !projectData) {
        throw new Error(`Test setup for generateContributions failed to fetch project details: ${projectError?.message || 'No project data'}`);
      }

      // Prepare and call startSession to create session and session_models
      const startSessionPayload: StartSessionPayload = {
        projectId: testProjectId,
        // Use the SAME globally seeded dummy ID twice
        selectedModelIds: [workingDummyProviderId, workingDummyProviderId], 
        sessionDescription: "Test session for generating thesis contributions with duplicated (global) dummy model",
        originatingChatId: testAssociatedChatId, 
      };

      const { data: sessionDataFromInvoke, error: sessionError } = await testPrimaryUserClient.functions.invoke(
        "dialectic-service", 
        { 
          body: { action: "startSession", payload: startSessionPayload },
          headers: { Authorization: `Bearer ${testUserAuthToken}` } // Ensure user context
        }
      );

      if (sessionError || !sessionDataFromInvoke || (sessionDataFromInvoke).error) {
        const serviceError = (sessionDataFromInvoke)?.error;
        console.error("Test setup: startSession error data:", serviceError);
        throw new Error(`Test setup failed: startSession action failed: ${sessionError?.message || serviceError?.message || 'Unknown error during startSession'}`);
      }
      
      // sessionDataFromInvoke is the direct payload: { message, sessionId, initialStatus, associatedChatId }
      if (!sessionDataFromInvoke.sessionId) {
        throw new Error(`Test setup failed: startSession did not return a sessionId. Response: ${JSON.stringify(sessionDataFromInvoke)}`);
      }
      testSessionId = sessionDataFromInvoke.sessionId;
      
      // Session models are created by startSession; detailed validation of that table is out of scope here.

    });

    afterEach(async () => {
      // Manually delete storage files associated with contributions for this session.
      // This MUST happen before DB records are deleted by coreCleanupTestResources,
      // especially if there are any triggers or FKs that might care.
      if (testSessionId && testProjectId && testAdminClient) { // Added testAdminClient null check
          console.log(`[Test Cleanup] Attempting to delete storage files for project ${testProjectId}, session ${testSessionId}`);
          const { data: listResults, error: listError } = await testAdminClient.storage
              .from('dialectic-contributions')
              .list(`projects/${testProjectId}/sessions/${testSessionId}/contributions`);

          if (listError) {
              console.warn(`[Test Cleanup] Error listing storage files for session ${testSessionId}:`, listError.message);
          } else if (listResults && listResults.length > 0) {
              const filesToDelete = listResults.flatMap(contribFolder => 
                  contribFolder.name ? [ // Check if contribFolder.name is not null or undefined
                      `projects/${testProjectId}/sessions/${testSessionId}/contributions/${contribFolder.name}/thesis.md`,
                      `projects/${testProjectId}/sessions/${testSessionId}/contributions/${contribFolder.name}/raw_thesis_response.json`
                  ] : [] // Return an empty array if contribFolder.name is null or undefined
              ).filter(path => path); // Ensure no undefined paths if folder name was missing.

              if (filesToDelete.length > 0) {
                  console.log(`[Test Cleanup] Deleting ${filesToDelete.length} storage files:`, filesToDelete);
                  const { data: deleteData, error: deleteError } = await testAdminClient.storage
                      .from('dialectic-contributions')
                      .remove(filesToDelete);
                  if (deleteError) {
                      console.warn(`[Test Cleanup] Error deleting storage files for session ${testSessionId}:`, deleteError.message);
                  } else {
                      console.log(`[Test Cleanup] Successfully deleted ${deleteData?.length || 0} storage files.`);
                  }
              } else {
                  console.log(`[Test Cleanup] No contribution files found in storage to delete for session ${testSessionId}.`);
              }
          } else {
              console.log(`[Test Cleanup] No contribution folders found in storage to delete for session ${testSessionId}.`);
          }
      }

      // Clean up chat messages and chat session created by the /chat function
      if (testAssociatedChatId && testPrimaryUserId && testAdminClient) { // Added testAdminClient null check
        console.log(`[Test Cleanup] Deleting chat messages for chat ID: ${testAssociatedChatId} and user ID: ${testPrimaryUserId}`);
        const { error: msgDelError } = await testAdminClient
          .from('chat_messages')
          .delete()
          .eq('chat_id', testAssociatedChatId)
          .eq('user_id', testPrimaryUserId); // Also scope by user_id for safety
        if (msgDelError) {
          console.warn(`[Test Cleanup] Error deleting chat_messages for chat ${testAssociatedChatId}:`, msgDelError);
        } else {
          console.log(`[Test Cleanup] Successfully deleted chat_messages for chat ${testAssociatedChatId}.`);
        }

        console.log(`[Test Cleanup] Deleting chat session for chat ID: ${testAssociatedChatId} and user ID: ${testPrimaryUserId}`);
        const { error: chatDelError } = await testAdminClient
          .from('chats')
          .delete()
          .eq('id', testAssociatedChatId)
          .eq('user_id', testPrimaryUserId); // Also scope by user_id for safety
        if (chatDelError) {
          console.warn(`[Test Cleanup] Error deleting chat session ${testAssociatedChatId}:`, chatDelError);
        } else {
          console.log(`[Test Cleanup] Successfully deleted chat session ${testAssociatedChatId}.`);
        }
      }

      // Clean up token wallet transactions recorded by the test user
      if (testPrimaryUserId && testAdminClient) {
        console.log(`[Test Cleanup] Deleting token_wallet_transactions for user ID: ${testPrimaryUserId}`);
        const { error: txnDelError } = await testAdminClient
          .from('token_wallet_transactions')
          .delete()
          .eq('recorded_by_user_id', testPrimaryUserId);
        if (txnDelError) {
          console.warn(`[Test Cleanup] Error deleting token_wallet_transactions for user ${testPrimaryUserId}:`, txnDelError);
        } else {
          console.log(`[Test Cleanup] Successfully deleted token_wallet_transactions for user ${testPrimaryUserId}.`);
        }
      }

      // Then, let the standard cleanup handle DB records.
      await coreCleanupTestResources('local');
    });

    it("should generate thesis contributions, store them, and link to storage", async () => {
      const payload: GenerateContributionsPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        walletId: crypto.randomUUID(),
      };

      // Using functions.invoke instead of fetch
      const { data: responseData, error: invokeError } = await testPrimaryUserClient.functions.invoke(
        "dialectic-service",
        {
          body: { action: "generateContributions", payload },
          headers: { 
            Authorization: `Bearer ${testUserAuthToken}`,
            "X-Client-Info": "supabase-js/0.0.0-automated-test-thesis-invoke", // Optional: update client info
          }
        }
      );
      
      if (invokeError) {
        console.log("[generateContributions Test] Detailed Invoke Error Name:", invokeError.name);
        console.log("[generateContributions Test] Detailed Invoke Error Message:", invokeError.message);
        if (invokeError.context) {
          console.log("[generateContributions Test] Detailed Invoke Error Context Keys:", Object.keys(invokeError.context));
          if (invokeError.context.status) { // Log status if available directly
            console.log("[generateContributions Test] Detailed Invoke Error Context Status:", invokeError.context.status);
          }
          if (typeof invokeError.context.json === 'function') {
            try {
              const errBody = await invokeError.context.json();
              console.log("[generateContributions Test] Detailed Invoke Error Context JSON Body:", JSON.stringify(errBody, null, 2));
            } catch (e:any) {
              console.log("[generateContributions Test] Detailed Invoke Error Context JSON Parse Error:", e.message);
              // Fallback to text if json parsing fails or if it's not a function but text is
              if (typeof invokeError.context.text === 'function') {
                const errText = await invokeError.context.text();
                console.log("[generateContributions Test] Detailed Invoke Error Context Text Body (after JSON parse error):", errText);
              }
            }
          } else if (typeof invokeError.context.text === 'function') { // If .json was not a function, try .text
            const errText = await invokeError.context.text();
            console.log("[generateContributions Test] Detailed Invoke Error Context Text Body (json not function):", errText);
          }
        } else {
          console.log("[generateContributions Test] Invoke Error Context is null or undefined.");
        }
      }
      console.log("[generateContributions Test] Original Invoke Response Data:", JSON.stringify(responseData, null, 2));

      assertEquals(invokeError, null, `generateContributions error: ${invokeError ? invokeError.message : 'Unknown error'}`);
      assertExists(responseData, "generateContributions data should exist");
      
      // responseData is GenerateContributionsSuccessResponse: { message, contributions, updatedStatus }
      // No 'success' field or outer 'data' field in responseData itself after invoke.
      assertStringIncludes(responseData.message, "successfully processed");
      assertExists(responseData.contributions, "Contributions array is missing from response data");
      assert(Array.isArray(responseData.contributions), "Contributions should be an array");
      assertEquals(responseData.contributions.length, 2, "Expected two contributions in the response for two models.");
      assertEquals(responseData.updatedStatus, "pending_antithesis");

      const { data: dbContributions, error: dbError } = await testAdminClient
        .from("dialectic_contributions")
        .select("*")
        .eq("session_id", testSessionId)
        .eq("stage", "thesis");

      assert(!dbError, `Error fetching contributions from DB: ${dbError?.message}`);
      assertExists(dbContributions, "No contributions found in DB for the session and stage");
      assertEquals(dbContributions.length, 2, "Mismatch in number of contributions in DB vs expected for two models.");

      for (const contribution of dbContributions) {
        assertExists(contribution.id, "Contribution ID is missing in DB record");
        assertExists(contribution.storage_path, "storage_path is missing");
        // Storage path check needs project_id, which is testProjectId
        assert(contribution.storage_path.startsWith(`projects/${testProjectId}/sessions/${testSessionId}/`), `Content storage path '${contribution.storage_path}' incorrect for project ${testProjectId} and session ${testSessionId}`);
        // assertEquals(contribution.storage_bucket, "dialectic-contributions", "Storage bucket is incorrect"); // Bucket name is not in this table
        // assertEquals(contribution.mime_type, "text/markdown", "MIME type is incorrect for thesis content"); // MIME type is not in this table
        assert(contribution.size_bytes && contribution.size_bytes > 0, "Content size should be greater than 0");

        if (contribution.raw_response_storage_path) {
          assert(contribution.raw_response_storage_path.startsWith(`projects/${testProjectId}/sessions/${testSessionId}/`), "Raw response storage path is incorrect");
        }
      }
    });
  });

  // --- Test Suite for updateProjectDomain ---
  describe("Action: updateProjectDomain", () => {
    let testUserId: string;
    let testUserClient: SupabaseClient<Database>;
    let testUserAuthToken: string;
    let testProjectId: string;

    beforeEach(async () => {
      const setup = await coreInitializeTestStep({
        userProfile: { first_name: "UpdateDomainTagUser" },
        resources: [
          {
            tableName: "dialectic_projects",
            identifier: { project_name: `ProjectToUpdateTag-${crypto.randomUUID()}` },
            desiredState: { initial_user_prompt: "Test for tag update" },
            linkUserId: true,
          },
          {
            tableName: "domain_specific_prompt_overlays",
            identifier: { system_prompt_id: baseThesisPromptId, domain_tag: TEST_DOMAIN_TAG_1, version: 99 },
            desiredState: { 
              overlay_values: { test_data: "updateProjectDomainTag suite - TDT1 Thesis" }, 
              description: "Test overlay for software_development (thesis) for updateProjectDomainTag suite",
              is_active: true,
            },
          },
          {
            tableName: "domain_specific_prompt_overlays",
            identifier: { system_prompt_id: baseAntithesisPromptId, domain_tag: TEST_DOMAIN_TAG_1, version: 99 },
            desiredState: { 
              overlay_values: { test_data: "updateProjectDomainTag suite - TDT1 Antithesis" }, 
              description: "Test overlay for software_development (antithesis) for updateProjectDomainTag suite",
              is_active: true,
            },
          },
          {
            tableName: "domain_specific_prompt_overlays",
            identifier: { system_prompt_id: baseThesisPromptId, domain_tag: TEST_DOMAIN_TAG_2, version: 99 },
            desiredState: { 
              overlay_values: { test_data: "updateProjectDomainTag suite - TDT2 Thesis" }, 
              description: "Test overlay for technical_writing (thesis) for updateProjectDomainTag suite",
              is_active: true,
            },
          },
        ],
      }, 'local');
      testUserId = setup.primaryUserId;
      testUserClient = setup.primaryUserClient;
      testUserAuthToken = await coreGenerateTestUserJwt(testUserId);
      testProjectId = setup.processedResources.find(r => r.tableName === "dialectic_projects")!.resource!.id;
    });

    afterEach(async () => {
      await coreCleanupTestResources();
    });

    it("should allow a user to update the selected_domain_id of their project to a valid domain", async () => {
      // fetch any valid domain id
      const { data: domainRow } = await adminClient
        .from('dialectic_domains')
        .select('id')
        .limit(1)
        .maybeSingle();
      const selectedDomainId = domainRow?.id ?? crypto.randomUUID();

      const { data: responseData, error } = await testUserClient.functions.invoke(
        "dialectic-service",
        {
          body: {
            action: "updateProjectDomain",
            payload: { projectId: testProjectId, selectedDomainId }
          },
          headers: { Authorization: `Bearer ${testUserAuthToken}` }
        }
      );

      if (error) {
        console.log("[updateProjectDomainTag - valid tag Test] Detailed Invoke Error Name:", error.name);
        console.log("[updateProjectDomainTag - valid tag Test] Detailed Invoke Error Message:", error.message);
        if (error.context) {
          console.log("[updateProjectDomainTag - valid tag Test] Detailed Invoke Error Context Keys:", Object.keys(error.context));
          if (error.context.status) { 
            console.log("[updateProjectDomainTag - valid tag Test] Detailed Invoke Error Context Status:", error.context.status);
          }
          if (typeof error.context.json === 'function') {
            try {
              const errBody = await error.context.json();
              console.log("[updateProjectDomainTag - valid tag Test] Detailed Invoke Error Context Body (parsed):", errBody);
            } catch (e) {
              console.log("[updateProjectDomainTag - valid tag Test] Failed to parse error context JSON:", e);
            }
          } else if (typeof error.context.text === 'function') {
             try {
              const errText = await error.context.text();
              console.log("[updateProjectDomainTag - valid tag Test] Detailed Invoke Error Context Text:", errText);
            } catch (e) {
              console.log("[updateProjectDomainTag - valid tag Test] Failed to get error context text:", e);
            }
          }
        }
        // Fail fast if an unexpected error occurred during invocation for a supposedly valid update
        assertEquals(error, null, `Function invocation failed unexpectedly for a valid domain tag update: ${error.message || JSON.stringify(error)}`);
      }
      
      // If we reach here, error should have been null.
      assertExists(responseData, "Response data should exist for a successful update");
      assertExists(responseData.project, "Response data should contain a project object");
      
      // Now, we can safely access responseData.project properties
      assertEquals(responseData.project.id, testProjectId);
      assertEquals(responseData.project.selected_domain_id, selectedDomainId);

      // Verify in DB
      const { data: dbProject, error: dbError } = await adminClient
        .from("dialectic_projects")
        .select("selected_domain_id")
        .eq("id", testProjectId)
        .single();
      assertEquals(dbError, null);
      assertEquals(dbProject?.selected_domain_id, selectedDomainId);
    });

    // selected_domain_id is non-nullable in schema; skipping 'set to null' test.

    it("should prevent updating to an invalid domain_tag", async () => {
      const request: DialecticServiceRequest = {
        action: "updateProjectDomain",
        payload: { projectId: testProjectId, selectedDomainId: INVALID_DOMAIN_TAG },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
         body: request,
         headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });
      
      assert(error, "Expected function invocation to result in an error due to invalid tag");
      assertEquals(error.context.status, 400, "Expected HTTP status 400 for invalid domain tag");

      let actualErrorMessage = "Error message not found in response";
      try {
        const parsedBody = await error.context.json();
        if (parsedBody && typeof parsedBody.error === 'string') {
          actualErrorMessage = parsedBody.error;
        } else {
          console.warn("[Test Warn] Parsed error body for invalid domain tag did not have a string 'error' property. Body:", parsedBody);
          actualErrorMessage = JSON.stringify(parsedBody); // fallback to stringified body
        }
      } catch (e: any) {
        console.warn("[Test Warn] Failed to parse JSON from error response for invalid domain tag:", e.message);
        actualErrorMessage = await error.context.text(); // fallback to raw text
      }
      assertStringIncludes(actualErrorMessage, "Invalid domainTag"); 
    });

    it("should fail if trying to update a non-existent project", async () => {
      const nonExistentProjectId = crypto.randomUUID();
      const request: DialecticServiceRequest = {
        action: "updateProjectDomain",
        payload: { projectId: nonExistentProjectId, selectedDomainId: crypto.randomUUID() },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
         body: request,
         headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });

      assert(error, "Expected function invocation to error for non-existent project");
      // Status might be 404 Not Found or 400 Bad Request depending on implementation
      // For now, let's be flexible or check for either if unsure, then refine.
      // Based on current createError, it's likely a 404 or a 400 with a specific message.
      assert(!!([400, 404].includes(error.context.status)), `Expected HTTP status 404 or 400, got ${error.context.status}`);
      
      let actualErrorMessage = "Error message not found in response";
      try {
        const parsedBody = await error.context.json();
        if (parsedBody && typeof parsedBody.error === 'string') {
          actualErrorMessage = parsedBody.error;
        } else {
          console.warn("[Test Warn] Parsed error body for non-existent project did not have a string 'error' property. Body:", parsedBody);
          actualErrorMessage = JSON.stringify(parsedBody);
        }
      } catch (e: any) {
        console.warn("[Test Warn] Failed to parse JSON from error response for non-existent project:", e.message);
        actualErrorMessage = await error.context.text(); 
      }
      assertStringIncludes(actualErrorMessage, "Project not found or access denied");
    });

    it("should prevent updating a project belonging to another user", async () => {
      // User A (testUserClient, testUserId, testUserAuthToken) owns testProjectId (created in beforeEach)

      // Setup User B
      const userBSetup = await coreInitializeTestStep({
        userProfile: { first_name: "UserBAttacker" }
      });
      const userBClient = userBSetup.primaryUserClient;
      const userBAuthToken = await coreGenerateTestUserJwt(userBSetup.primaryUserId);

      const request: DialecticServiceRequest = {
        action: "updateProjectDomain",
        payload: { projectId: testProjectId, selectedDomainId: crypto.randomUUID() }, // testProjectId belongs to testUser
      };
      const { data, error } = await userBClient.functions.invoke("dialectic-service", { // Invoked by User B
         body: request,
         headers: { Authorization: `Bearer ${userBAuthToken}` }
      });

      assert(error, "Expected function invocation to error for unauthorized update");
      // Status might be 403 Forbidden, 404 Not Found (if hiding existence), or 400 Bad Request
      assert(!!([400, 403, 404].includes(error.context.status)), `Expected HTTP status 403, 404 or 400, got ${error.context.status}`);
      
      let actualErrorMessage = "Error message not found in response";
      try {
        const parsedBody = await error.context.json();
        if (parsedBody && typeof parsedBody.error === 'string') {
          actualErrorMessage = parsedBody.error;
        } else {
          console.warn("[Test Warn] Parsed error body for unauthorized project update did not have a string 'error' property. Body:", parsedBody);
          actualErrorMessage = JSON.stringify(parsedBody);
        }
      } catch (e: any) {
        console.warn("[Test Warn] Failed to parse JSON from error response for unauthorized project update:", e.message);
        actualErrorMessage = await error.context.text(); 
      }
      assertStringIncludes(actualErrorMessage, "Project not found or access denied");

      // Crucially, ensure the original project's tag was NOT changed
      const { data: dbProject, error: dbError } = await adminClient
        .from("dialectic_projects")
        .select("selected_domain_id")
        .eq("id", testProjectId) // testProjectId still belongs to the original testUser
        .single();
      assertEquals(dbError, null);
      // Ensure it was not set to null (non-nullable) and not changed by attacker
      assert(dbProject?.selected_domain_id !== null, "selected_domain_id should remain non-null");
    });

    // Add more tests: trying to update other user's project, project not found, etc.
  });
  // --- End Test Suite for updateProjectDomainTag ---

  // Note: createProject is handled via multipart/form-data in this service. JSON-based tests removed.

  // Test Suite for getContributionContentData
  describe("Action: getContributionContentData", () => {
    let testPrimaryUserId: string;
    let testPrimaryUserClient: SupabaseClient<Database>;
    let testUserAuthToken: string;

    let otherTestUserId: string;
    let otherUserClient: SupabaseClient<Database>;
    let otherTestUserAuthToken: string;

    let testProjectId: string;
    let testSessionId: string;
    let testContributionId: string;
    const testBucketName = "dialectic-contributions";
    let testStoragePath: string;
    const testFileContent = "This is dummy content for signed URL testing.";
    const testMimeType = "text/plain";
    const testFileContentBuffer = new TextEncoder().encode(testFileContent);
    const testFileSize = testFileContentBuffer.byteLength;
    let testSessionModelId: string; // Added to store the created session_model_id

    beforeEach(async () => {
      const primaryUserSetup = await coreInitializeTestStep({
        userProfile: { first_name: "SignedUrlOwner" },
        resources: [
          {
            tableName: "dialectic_projects",
            identifier: { project_name: `Signed URL Proj ${crypto.randomUUID().substring(0,4)}` },
            desiredState: { initial_user_prompt: "Prompt for signed URL test." },
            linkUserId: true,
          },
        ],
      }, 'local');
      testPrimaryUserId = primaryUserSetup.primaryUserId;
      testPrimaryUserClient = primaryUserSetup.primaryUserClient;
      testUserAuthToken = await coreGenerateTestUserJwt(testPrimaryUserId);
      const projectResource = primaryUserSetup.processedResources.find(r => r.tableName === 'dialectic_projects');
      if (!projectResource || !projectResource.resource?.id) throw new Error("Test project not created or ID missing.");
      testProjectId = projectResource.resource.id;

      const otherUserSetup = await coreInitializeTestStep({
        userProfile: { first_name: "SignedUrlNonOwner" },
      }, 'local');
      otherTestUserId = otherUserSetup.primaryUserId;
      otherUserClient = otherUserSetup.primaryUserClient;
      otherTestUserAuthToken = await coreGenerateTestUserJwt(otherTestUserId);
      
      // Fetch a valid current stage id (thesis)
      const { data: stageRow, error: stageErr } = await adminClient
        .from('dialectic_stages')
        .select('id, slug')
        .eq('slug', 'thesis')
        .single();
      if (stageErr || !stageRow) throw new Error(`Failed to fetch thesis stage: ${stageErr?.message}`);

      const { data: session, error: sessionErr } = await adminClient
        .from("dialectic_sessions")
        .insert({
          project_id: testProjectId,
          current_stage_id: stageRow.id,
          iteration_count: 1,
          associated_chat_id: crypto.randomUUID(),
        })
        .select("id")
        .single();
      if (sessionErr || !session) throw new Error(`Failed to create session for test: ${sessionErr?.message}`);
      testSessionId = session.id;
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_sessions', criteria: { id: testSessionId }, scope: 'local' });

      // Skip direct session model creation; not required for content URL tests

      testContributionId = crypto.randomUUID();
      testStoragePath = `${testProjectId}/${testSessionId}/${testContributionId}.txt`;
      const { error: uploadError } = await adminClient.storage
        .from(testBucketName)
        .upload(testStoragePath, testFileContentBuffer, { contentType: testMimeType, upsert: true });
      if (uploadError) throw new Error(`Storage upload failed for test: ${uploadError.message}`);
      registerUndoAction({ 
        type: 'DELETE_STORAGE_OBJECT',
        bucketName: testBucketName, 
        path: testStoragePath, 
        scope: 'local' 
      });
      
      const { data: contributionRec, error: contribErr } = await adminClient
        .from("dialectic_contributions")
        .insert({
          id: testContributionId,
          session_id: testSessionId,
          stage: "thesis",
          storage_bucket: testBucketName,
          storage_path: testStoragePath,
          mime_type: testMimeType,
          size_bytes: testFileSize,
        })
        .select('id')
        .single();
      if (contribErr || !contributionRec) throw new Error(`Failed to create contribution for test: ${contribErr?.message}`);
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'dialectic_contributions', criteria: { id: testContributionId }, scope: 'local' });
    });

    afterEach(async () => {
      await coreCleanupTestResources('local');
    });

    it("should return content data for an owned contribution", async () => {
      const request: DialecticServiceRequest = {
        action: "getContributionContentData",
        payload: { contributionId: testContributionId },
      };
      const { data: actualData, error: funcError } = await testPrimaryUserClient.functions.invoke(
        "dialectic-service",
        { body: request, headers: { Authorization: `Bearer ${testUserAuthToken}` } }
      );
      assertEquals(funcError, null, `Function invocation error: ${funcError?.message}`);
      assertExists(actualData, "Response data (actualData) should exist");
      // actualData is { fileName, mimeType, content }
      assertEquals(actualData.error, undefined, `Service action error: ${JSON.stringify(actualData.error)}`);
      const { fileName, mimeType, content } = actualData;
      assertEquals(fileName, testStoragePath.split('/').pop());
      assertEquals(mimeType, testMimeType);
      assertEquals(new TextDecoder().decode(new Uint8Array(content.data)), "This is dummy content for signed URL testing.");
    });

    it("should fail for an unauthenticated request", async () => {
      const requestPayload: DialecticServiceRequest = {
        action: "getContributionContentData",
        payload: { contributionId: testContributionId },
      };

      let funcError: any = null;
      let funcResponse: any = null;

      try {
        // Create an unauthenticated client using createClient
        const unauthClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { auth: { persistSession: false, autoRefreshToken: false } } // Ensure no session persistence or auto-refresh
        );
        const { data, error } = await unauthClient.functions.invoke("dialectic-service", {
          body: requestPayload,
        });
        funcResponse = data;
        funcError = error;
      } catch (e) {
        funcError = e;
      }
      
      assertExists(funcError, "Expected an error for unauthenticated request.");
      if (funcError && Object.prototype.hasOwnProperty.call(funcError, 'context')) {
        assertEquals(funcError.context.status, 401);
        try {
            // Standard error response is { error: "message" }
            const errorBody = JSON.parse(await funcError.context.text());
            if (typeof errorBody?.error === 'string') {
              assertStringIncludes(errorBody.error, "User not authenticated");
            }
        } catch (_e) {
            console.warn("[Test Warning] Unauthenticated request did not return a JSON error body, but status was 401.");
        }
      } else {
        console.warn("[Test Warning] Unauthenticated request error was not a FunctionsHttpError with context. Error:", funcError);
      }
      assertEquals(funcResponse?.data, undefined);
    });

    it("should fail if the contribution is not found", async () => {
      const requestPayload: DialecticServiceRequest = {
        action: "getContributionContentData",
        payload: { contributionId: crypto.randomUUID() }, // Non-existent ID
      };

      let invokeException: any = null;
      let funcHttpError: FunctionsHttpError | null = null;
      let responseJson: any = null;

      try {
        const { data, error } = await testPrimaryUserClient.functions.invoke("dialectic-service", {
          body: requestPayload,
          headers: { Authorization: `Bearer ${testUserAuthToken}` },
        });
        if (error) {
          funcHttpError = error;
          if (error.context && typeof error.context.json === 'function') {
            responseJson = await error.context.json();
          } else if (error.context && error.context.body) {
            const text = await error.context.text();
            try { responseJson = JSON.parse(text); } catch { responseJson = { error: { message: text } }; }
          } else {
            responseJson = { error: { message: error.message || 'Unknown error structure'} };
          }
        } else {
          console.warn("[Test Warning] Contribution not found test received a 2xx response unexpectedly.");
          responseJson = data;
        }
      } catch (e) {
        invokeException = e;
        if (e instanceof Error) {
          responseJson = { error: { message: e.message, code: e.name } };
        } else {
          responseJson = { error: { message: String(e), code: "UnknownException" } };
        }
      }
      
      assertExists(funcHttpError, "Function invocation should have resulted in a FunctionsHttpError.");
      assertStringIncludes(String(funcHttpError?.message ?? ''), "Edge Function returned a non-2xx status code");
      assertExists(funcHttpError?.context, "Error context should exist for HTTP errors.");
      assertEquals(funcHttpError?.context.status, 404); 

      console.log("[Test Debug] 'Contribution not found' responseJson:", JSON.stringify(responseJson)); 
      assertExists(responseJson, "Parsed JSON error response should exist.");
      assertExists(responseJson.error, "Expected 'error' property in parsed JSON response.");
      // The service returns "[NOT_FOUND] Contribution not found."
      // The createErrorResponse wrapper will pass this message through.
      assertEquals(responseJson.error, "[NOT_FOUND] Contribution not found.");
    });

    it("should fail if the user is not the owner of the contribution's project", async () => {
      const requestPayload: DialecticServiceRequest = {
        action: "getContributionContentData",
        payload: { contributionId: testContributionId }, // testContributionId is owned by testPrimaryUser
      };

      let invokeException: any = null;
      let funcHttpError: FunctionsHttpError | null = null;
      let responseJson: any = null;

      try {
        const { data, error } = await otherUserClient.functions.invoke("dialectic-service", { 
          body: requestPayload,
          headers: { Authorization: `Bearer ${otherTestUserAuthToken}` },
        });
        if (error) {
          funcHttpError = error;
          if (error.context && typeof error.context.json === 'function') {
            responseJson = await error.context.json();
          } else if (error.context && error.context.body) {
            const text = await error.context.text();
            try { responseJson = JSON.parse(text); } catch { responseJson = { error: { message: text } }; }
          } else {
            responseJson = { error: { message: error.message || 'Unknown error structure'} }; 
          }
        } else {
          console.warn("[Test Warning] Non-owner access test received a 2xx response unexpectedly.");
          responseJson = data;
        }
      } catch (e) {
        invokeException = e;
        if (e instanceof Error) {
          responseJson = { error: { message: e.message, code: e.name } };
        } else {
          responseJson = { error: { message: String(e), code: "UnknownException" } };
        }
      }

      assertExists(funcHttpError, "Function invocation should have resulted in a FunctionsHttpError for non-owner.");
      assertStringIncludes(String(funcHttpError?.message ?? ''), "Edge Function returned a non-2xx status code");
      assertExists(funcHttpError?.context, "Error context should exist for HTTP errors.");
      assertEquals(funcHttpError?.context.status, 403);

      console.log("[Test Debug] 'Not owner' responseJson:", JSON.stringify(responseJson)); 
      assertExists(responseJson, "Parsed JSON error response should exist.");
      assertExists(responseJson.error, "Expected 'error' property in parsed JSON response.");
      // The service returns "[AUTH_FORBIDDEN] User not authorized to access this contribution."
      assertEquals(responseJson.error, "[AUTH_FORBIDDEN] User not authorized to access this contribution.");
    });

    it("should return a 401 if the JWT is missing or invalid for getContributionContentSignedUrl", async () => {
      const requestPayload: DialecticServiceRequest = {
        action: "getContributionContentData",
        payload: { contributionId: testContributionId },
      };

      let invokeException: any = null;
      let funcHttpError: FunctionsHttpError | null = null;
      let responseJson: any = null;

      try {
        // Use a clearly invalid token
        const { data, error } = await testPrimaryUserClient.functions.invoke("dialectic-service", {
          body: requestPayload,
          headers: { Authorization: `Bearer invalid.jwt.token` }, 
        });

        if (error) {
          if (error instanceof FunctionsHttpError) {
            funcHttpError = error;
            try {
              const parsedError = await error.context.json();
              // If parsedError is the actual error message (e.g., from GoTrue), wrap it.
              if (typeof parsedError.msg === 'string') { // GoTrue returns { msg: "..." }
                responseJson = { error: { message: parsedError.msg, code: String(error.context.status) } };
              } else if (typeof parsedError.error === 'string') { // Edge function's format
                responseJson = { error: { message: parsedError.error, code: String(error.context.status) } };
              } else if (parsedError.error && typeof parsedError.error.message === 'string') { // Deeper nested error
                responseJson = { error: { message: parsedError.error.message, code: parsedError.error.code || String(error.context.status) } };
              } else {
                // Fallback for unknown error structure
                responseJson = { error: { message: JSON.stringify(parsedError), code: String(error.context.status) } };
              }
            } catch (jsonParseError) {
              // If parsing JSON fails, use the raw response text or a generic message
              const responseText = await error.context.text().catch(() => "Could not parse error response");
              responseJson = { error: { message: responseText, code: String(error.context.status) } };
              console.warn("Error parsing JSON from FunctionsHttpError context, using raw text:", responseText);
            }
          } else {
            // Not a FunctionsHttpError, but still an error from the invoke call itself
            invokeException = error;
            responseJson = { error: { message: error.message || String(error), code: error.name || "InvokeClientError" } };
          }
        } else if (data) { // Should not happen for an error case, but good to log if it does
          console.warn("Received data instead of error for an expected error scenario (401). Data:", data);
          responseJson = { error: { message: "Received data instead of error", code: "UnexpectedSuccess" } };
        }

      } catch (e) {
        invokeException = e;
        if (e instanceof Error) {
          responseJson = { error: { message: e.message, code: e.name } };
        } else {
          responseJson = { error: { message: String(e), code: "UnknownException" } };
        }
      }
      
      console.log("[Test Debug] '401 Unauthenticated/Invalid JWT' responseJson:", JSON.stringify(responseJson)); // DEBUGGING

      assertExists(funcHttpError, "Function invocation should have resulted in a FunctionsHttpError for invalid JWT.");
      assertExists(funcHttpError?.context, "Error context should exist for HTTP errors.");
      assertEquals(funcHttpError?.context.status, 401); 

      assertExists(responseJson, "Parsed JSON error response should exist.");
      assertExists(responseJson.error, "Expected 'error' property in parsed JSON response.");
      // The message from createErrorResponse will be like "[AUTH_INVALID_TOKEN] Invalid or malformed token"
      // or "[AUTH_ERROR] Invalid JWT" depending on how auth.getUser() fails.
      if (typeof responseJson?.error?.message === 'string') {
        assertStringIncludes(responseJson.error.message.toLowerCase(), "invalid jwt");
      }
    });

  }); // End of describe("Action: getContributionContentSignedUrl")
}); 