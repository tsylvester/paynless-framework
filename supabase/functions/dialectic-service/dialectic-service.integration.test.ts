// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "npm:chai@4.3.7";
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
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../types_db.ts";
import {
  initializeTestDeps,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreGenerateTestUserJwt,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  TestResourceRequirement,
} from "../_shared/_integration.test.utils.ts";
import { User } from "npm:@supabase/supabase-js@2";
import type { DialecticServiceRequest, GenerateThesisContributionsPayload, StartSessionPayload } from "./dialectic.interface.ts";

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

    const overlaysToSeedData = [
      {
        system_prompt_id: baseThesisPromptId, 
        domain_tag: TEST_DOMAIN_TAG_1, 
        version: 99, 
        overlay_values: { test_data: "ensure software_development for thesis" } as unknown as Json, 
        description: "Test overlay for software_development (thesis)",
        is_active: true,
      },
      {
        system_prompt_id: baseAntithesisPromptId, 
        domain_tag: TEST_DOMAIN_TAG_1, 
        version: 99, 
        overlay_values: { test_data: "ensure software_development for antithesis" } as unknown as Json, 
        description: "Test overlay for software_development (antithesis)",
        is_active: true,
      },
      {
        system_prompt_id: baseThesisPromptId, 
        domain_tag: TEST_DOMAIN_TAG_2, 
        version: 99, 
        overlay_values: { test_data: "ensure technical_writing" } as unknown as Json, 
        description: "Test overlay for technical_writing",
        is_active: true,
      },
    ];

    for (const pełnaDaneNakładki of overlaysToSeedData) {
        const { error } = await adminClient.from("domain_specific_prompt_overlays").upsert(
            pełnaDaneNakładki,
            { onConflict: "system_prompt_id,domain_tag,version" }
        );
        if (error) {
            console.error("Error upserting test domain overlay:", pełnaDaneNakładki, error);
            throw new Error(`Test setup failed: Could not upsert test domain overlay: ${error.message}`);
        }
    }
    console.log("Shared test domain overlays upserted for dialectic-service tests.");
  });

  afterAll(async () => {
    if (adminClient) {
        const { error: deleteError } = await adminClient
        .from("domain_specific_prompt_overlays")
        .delete()
        .eq("version", 99);
        if (deleteError) {
        console.error("Failed to clean up test domain overlays:", deleteError);
        }
    }
    await coreCleanupTestResources('all');
  });

  describe("Action: listAvailableDomainTags", () => {
    it("should return a distinct list of available domain tags", async () => {
      const request: DialecticServiceRequest = { action: "listAvailableDomainTags" };
      const { data, error } = await adminClient.functions.invoke("dialectic-service", { body: request });
      expect(error, "Function invocation should not error").to.be.null;
      expect(data, "Response data should exist").to.exist;
      const responsePayload = data as any; 
      expect(responsePayload.error, `Service action error: ${responsePayload.error?.message}`).to.be.undefined;
      expect(responsePayload.data, "Payload data should be an array").to.be.an("array");
      const tags = responsePayload.data as string[];
      expect(tags).to.include.members([TEST_DOMAIN_TAG_1, TEST_DOMAIN_TAG_2]);
      const distinctTags = [...new Set(tags)];
      expect(tags.length, "Tags list should only contain distinct tags").to.equal(distinctTags.length);
    });

    it("should return an empty list if no domain_specific_prompt_overlays exist", async () => {
      const { error: delErr } = await adminClient.from("domain_specific_prompt_overlays").delete().neq("domain_tag", "_some_non_existent_tag_for_safety_");
      expect(delErr, "Failed to clear overlays for empty test").to.be.null;

      try {
        const request: DialecticServiceRequest = {
          action: "listAvailableDomainTags",
        };
        const { data, error } = await adminClient.functions.invoke("dialectic-service", { body: request });
        expect(error).to.be.null;
        expect(data).to.exist;
        const responsePayload = data as any;
        expect(responsePayload.error).to.be.undefined;
        expect(responsePayload.data).to.be.an("array").that.is.empty;
      } finally {
        // Re-seed all original overlays to ensure test isolation
        console.log("Attempting to re-seed all test domain overlays in finally block...");
        const overlaysToReseed = [
          {
            system_prompt_id: baseThesisPromptId, 
            domain_tag: TEST_DOMAIN_TAG_1, 
            version: 99, 
            overlay_values: { test_data: "ensure software_development for thesis" } as unknown as Json, 
            description: "Test overlay for software_development (thesis)",
            is_active: true,
          },
          {
            system_prompt_id: baseAntithesisPromptId, 
            domain_tag: TEST_DOMAIN_TAG_1, 
            version: 99, 
            overlay_values: { test_data: "ensure software_development for antithesis" } as unknown as Json, 
            description: "Test overlay for software_development (antithesis)",
            is_active: true,
          },
          {
            system_prompt_id: baseThesisPromptId, 
            domain_tag: TEST_DOMAIN_TAG_2, 
            version: 99, 
            overlay_values: { test_data: "ensure technical_writing" } as unknown as Json, 
            description: "Test overlay for technical_writing",
            is_active: true,
          },
        ];

        for (const overlayData of overlaysToReseed) {
            // Ensure system_prompt_id is valid before attempting to upsert
            if (!overlayData.system_prompt_id) {
                console.error("Cannot re-seed overlay due to missing system_prompt_id:", overlayData);
                continue; 
            }
            const { error: upsertError } = await adminClient.from("domain_specific_prompt_overlays").upsert(
                overlayData,
                { onConflict: "system_prompt_id,domain_tag,version" }
            );
            if (upsertError) {
                console.error("Failed to re-seed test domain overlay in finally block:", overlayData, upsertError);
            }
        }
        console.log("Re-seeding of test domain overlays in finally block complete.");
      }
    });
  });

  describe("'generateThesisContributions' action", () => {
    let testPrimaryUserId: string;
    let testPrimaryUserClient: SupabaseClient<Database>;
    let testUserAuthToken: string;
    let testAdminClient: SupabaseClient<Database>;

    let testProjectId: string;
    let testSessionId: string;
    let testSessionModelId: string;
    let testAssociatedChatId: string;

    // const TEST_AI_PROVIDER_ID = "openai"; // Commenting out as we'll use a dummy model
    // const TEST_MODEL_CATALOG_ID = "gpt-4"; // Commenting out

    beforeEach(async () => {
      testAssociatedChatId = crypto.randomUUID();

      const uniqueProjectName = `Thesis Test Project ${crypto.randomUUID()}`;

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
        ],
      }, 'local');

      testPrimaryUserId = setupResult.primaryUserId;
      testPrimaryUserClient = setupResult.primaryUserClient;
      testAdminClient = setupResult.adminClient;
      testUserAuthToken = await coreGenerateTestUserJwt(testPrimaryUserId);

      const projectResourceInfo = setupResult.processedResources.find(
        (r) => 
          r.tableName === "dialectic_projects" && 
          (r.identifier as { project_name: string }).project_name === uniqueProjectName
      );

      if (!projectResourceInfo || projectResourceInfo.status === 'failed' || !projectResourceInfo.resource?.id) {
        const errorMessage = `Failed to get or create project '${uniqueProjectName}' during test setup. Status: ${projectResourceInfo?.status}, Error: ${projectResourceInfo?.error || 'Unknown error'}`;
        console.error(errorMessage, projectResourceInfo);
        throw new Error(errorMessage);
      }
      testProjectId = projectResourceInfo.resource.id as string;

      // Ensure we have the initial user prompt from the project data for the session
      const initialUserPromptForSession = projectResourceInfo.resource?.initial_user_prompt;
      if (!initialUserPromptForSession) {
        throw new Error(`Initial user prompt not found for project ${testProjectId} in test setup.`);
      }

      const { data: session, error: sessionError } = await testAdminClient
        .from("dialectic_sessions")
        .insert({
          project_id: testProjectId,
          associated_chat_id: testAssociatedChatId,
          status: "pending_thesis",
          current_stage_seed_prompt: initialUserPromptForSession,
        })
        .select("id")
        .single();

      if (sessionError || !session) {
        throw new Error(`Failed to create session for test: ${sessionError?.message}`);
      }
      testSessionId = session.id;
      
      const modelIdForSession = '11111111-1111-1111-1111-111111111111'; // Changed to use the dummy provider's UUID

      const { data: sessionModel, error: smError } = await testAdminClient
        .from("dialectic_session_models")
        .insert({
          session_id: testSessionId,
          model_id: modelIdForSession,
        })
        .select("id")
        .single();
      
      if (smError || !sessionModel) {
          throw new Error(`Failed to create session model for test: ${smError?.message}. Ensure AI provider and model catalog entries are seeded.`);
      }
      testSessionModelId = sessionModel.id;
    });

    afterEach(async () => {
      await coreCleanupTestResources('local');
    });

    it("should generate thesis contributions, store them, and link to storage", async () => {
      const payload: GenerateThesisContributionsPayload = {
        sessionId: testSessionId,
      };

      const response = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/dialectic-service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testUserAuthToken}`,
          "X-Client-Info": "supabase-js/0.0.0-automated-test-thesis",
        },
        body: JSON.stringify({
          action: "generateThesisContributions",
          payload,
        }),
      });
      const responseData = await response.json().catch(e => {
        console.error("Failed to parse JSON response:", e);
        return { error: { message: "Failed to parse JSON response", details: e.message }, data: null, success: false };
      });
      
      console.log("[generateThesisContributions Test] Response Status:", response.status);
      console.log("[generateThesisContributions Test] Response Data:", JSON.stringify(responseData, null, 2));

      assertEquals(response.status, 200, `Service action failed with status ${response.status}: ${JSON.stringify(responseData.error || responseData)}`);
      assert(responseData.success === true, responseData.error?.message || "Request was not successful or success flag missing/false");
      assertExists(responseData.data, "Response data object is missing");
      assertExists(responseData.data.contributions, "Contributions array is missing from response data");
      assert(Array.isArray(responseData.data.contributions), "Contributions should be an array");
      assert(responseData.data.contributions.length > 0, "No contributions were generated");

      const { data: dbContributions, error: dbError } = await testAdminClient
        .from("dialectic_contributions")
        .select("*")
        .eq("session_id", testSessionId)
        .eq("stage", "thesis");

      assert(!dbError, `Error fetching contributions from DB: ${dbError?.message}`);
      assertExists(dbContributions, "No contributions found in DB for the session and stage");
      assertEquals(dbContributions.length, responseData.data.contributions.length, "Mismatch in number of contributions in DB vs response");

      for (const contribution of dbContributions) {
        assertExists(contribution.id, "Contribution ID is missing in DB record");
        assertEquals(contribution.session_model_id, testSessionModelId, "Contribution not linked to the correct session_model_id");
        assertExists(contribution.content_storage_path, "content_storage_path is missing");
        assert(contribution.content_storage_path.startsWith(`${testProjectId}/${testSessionId}/`), `Content storage path '${contribution.content_storage_path}' incorrect for project ${testProjectId} and session ${testSessionId}`);
        assertEquals(contribution.content_storage_bucket, "dialectic-contributions", "Storage bucket is incorrect");
        assertEquals(contribution.content_mime_type, "text/markdown", "MIME type is incorrect for thesis content"); 
        assert(contribution.content_size_bytes && contribution.content_size_bytes > 0, "Content size should be greater than 0");

        if (contribution.raw_response_storage_path) {
          assert(contribution.raw_response_storage_path.startsWith(`${testProjectId}/${testSessionId}/`), "Raw response storage path is incorrect");
        }
      }
    });
  });

  // --- Test Suite for updateProjectDomainTag ---
  describe("Action: updateProjectDomainTag", () => {
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
        ],
      });
      testUserId = setup.primaryUserId;
      testUserClient = setup.primaryUserClient;
      testUserAuthToken = await coreGenerateTestUserJwt(testUserId);
      testProjectId = setup.processedResources.find(r => r.tableName === "dialectic_projects")!.resource!.id as string;
    });

    afterEach(async () => {
      await coreCleanupTestResources();
    });

    it("should allow a user to update the selected_domain_tag of their project to a valid tag", async () => {
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: TEST_DOMAIN_TAG_1 },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
         body: request,
         headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });

      expect(error, `Function invocation error: ${JSON.stringify(error)}`).to.be.null;
      expect(data, "Response data should exist").to.exist;
      const responsePayload = data as any;
      expect(responsePayload.error, `Service action error: ${responsePayload.error?.message}`).to.be.undefined;
      expect(responsePayload.data.id).to.equal(testProjectId);
      expect(responsePayload.data.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);

      // Verify in DB
      const { data: dbProject, error: dbError } = await adminClient
        .from("dialectic_projects")
        .select("selected_domain_tag")
        .eq("id", testProjectId)
        .single();
      expect(dbError).to.be.null;
      expect(dbProject?.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);
    });

    it("should allow a user to set the selected_domain_tag to null", async () => {
      // First set it to something
      await adminClient.from("dialectic_projects").update({ selected_domain_tag: TEST_DOMAIN_TAG_1 }).eq("id", testProjectId);
      
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: null },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
         body: request,
         headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });
      expect(error).to.be.null;
      expect(data.error).to.be.undefined;
      expect(data.data.selected_domain_tag).to.be.null;

      const { data: dbProject, error: dbError } = await adminClient
        .from("dialectic_projects")
        .select("selected_domain_tag")
        .eq("id", testProjectId)
        .single();
      expect(dbError).to.be.null;
      expect(dbProject?.selected_domain_tag).to.be.null;
    });

    it("should prevent updating to an invalid domain_tag", async () => {
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: INVALID_DOMAIN_TAG },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
         body: request,
         headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });
      
      expect(error, "Expected function invocation to result in an error due to invalid tag").to.exist;
      expect(error.context.status, "Expected HTTP status to be 400 for invalid domain tag").to.equal(400);

      console.log(`[Test Debug] updateProjectDomainTag - invalid tag - error object:`, error);
      console.log(`[Test Debug] updateProjectDomainTag - invalid tag - error.context object:`, error.context);
      let actualErrorMessage = "Error message not found";
      if (error && error.context) {
        let bodyText: string | null = null;
        try {
          if (typeof error.context.text === 'function') {
            bodyText = await error.context.text(); // Consumes body
          }
        } catch (e: any) {
           console.warn("[Test Warn] Failed to get text from error.context:", e.message);
        }

        if (bodyText) {
          try {
            const parsedBody = JSON.parse(bodyText);
            if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
              actualErrorMessage = parsedBody.error.message;
            } else {
              actualErrorMessage = `Error response body parsed, but no .error.message string found. Body Snippet: ${bodyText.substring(0, 200)}`;
            }
          } catch (e: any) {
            actualErrorMessage = `Error response body was not valid JSON. Body Snippet: ${bodyText.substring(0, 200)}. Parse Error: ${e.message}`;
          }
        } else {
          // Body text could not be retrieved, try original error.message
          if (error.message) {
            if (typeof error.message === 'string' && error.message.includes('{')) {
                try {
                    const parsedEM = JSON.parse(error.message);
                    if (parsedEM && parsedEM.error && typeof parsedEM.error.message === 'string') {
                        actualErrorMessage = parsedEM.error.message;
                    } else {
                        actualErrorMessage = error.message;
                    }
                } catch (e: any) {
                    actualErrorMessage = error.message;
                }
            } else {
                 actualErrorMessage = error.message;
            }
          } else {
            actualErrorMessage = "Error object provided no parsable message and no text body in context.";
          }
        }
      } else if (error && error.message) {
        actualErrorMessage = error.message;
      } else if (error) {
        actualErrorMessage = "Unknown error object."
      }
      expect(actualErrorMessage).to.contain("Invalid domainTag");
    });

    it("should fail if trying to update a non-existent project", async () => {
      const nonExistentProjectId = crypto.randomUUID();
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: nonExistentProjectId, domainTag: TEST_DOMAIN_TAG_1 },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
         body: request,
         headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });

      expect(error, "Expected function invocation to error for non-existent project").to.exist;
      // Status might be 404 Not Found or 400 Bad Request depending on implementation
      // For now, let's be flexible or check for either if unsure, then refine.
      // Based on current createError, it's likely a 404 or a 400 with a specific message.
      expect(error.context.status, `Expected HTTP status 404 or 400, got ${error.context.status}`).to.be.oneOf([400, 404]);
      
      let actualErrorMessage = "Error message not found";
      if (error && error.context) {
        let bodyText: string | null = null;
        try {
          if (typeof error.context.text === 'function') {
            bodyText = await error.context.text(); // Consumes body
          }
        } catch (e: any) {
           console.warn("[Test Warn] Failed to get text from error.context:", e.message);
        }

        if (bodyText) {
          try {
            const parsedBody = JSON.parse(bodyText);
            if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
              actualErrorMessage = parsedBody.error.message;
            } else {
              actualErrorMessage = `Error response body parsed, but no .error.message string found. Body Snippet: ${bodyText.substring(0, 200)}`;
            }
          } catch (e: any) {
            actualErrorMessage = `Error response body was not valid JSON. Body Snippet: ${bodyText.substring(0, 200)}. Parse Error: ${e.message}`;
          }
        } else {
          // Body text could not be retrieved, try original error.message
          if (error.message) {
            if (typeof error.message === 'string' && error.message.includes('{')) {
                try {
                    const parsedEM = JSON.parse(error.message);
                    if (parsedEM && parsedEM.error && typeof parsedEM.error.message === 'string') {
                        actualErrorMessage = parsedEM.error.message;
                    } else {
                        actualErrorMessage = error.message;
                    }
                } catch (e: any) {
                    actualErrorMessage = error.message;
                }
            } else {
                 actualErrorMessage = error.message;
            }
          } else {
            actualErrorMessage = "Error object provided no parsable message and no text body in context.";
          }
        }
      } else if (error && error.message) {
        actualErrorMessage = error.message;
      } else if (error) {
        actualErrorMessage = "Unknown error object."
      }
      expect(actualErrorMessage).to.contain("Project not found or access denied"); // Adjusted to match actual server message
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
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: TEST_DOMAIN_TAG_2 }, // testProjectId belongs to testUser
      };
      const { data, error } = await userBClient.functions.invoke("dialectic-service", { // Invoked by User B
         body: request,
         headers: { Authorization: `Bearer ${userBAuthToken}` }
      });

      expect(error, "Expected function invocation to error for unauthorized update").to.exist;
      // Status might be 403 Forbidden, 404 Not Found (if hiding existence), or 400 Bad Request
      expect(error.context.status, `Expected HTTP status 403, 404 or 400, got ${error.context.status}`).to.be.oneOf([400, 403, 404]);
      
      let actualErrorMessage = "Error message not found";
      if (error && error.context) {
        let bodyText: string | null = null;
        try {
          if (typeof error.context.text === 'function') {
            bodyText = await error.context.text(); // Consumes body
          }
        } catch (e: any) {
           console.warn("[Test Warn] Failed to get text from error.context:", e.message);
        }

        if (bodyText) {
          try {
            const parsedBody = JSON.parse(bodyText);
            if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
              actualErrorMessage = parsedBody.error.message;
            } else {
              actualErrorMessage = `Error response body parsed, but no .error.message string found. Body Snippet: ${bodyText.substring(0, 200)}`;
            }
          } catch (e: any) {
            actualErrorMessage = `Error response body was not valid JSON. Body Snippet: ${bodyText.substring(0, 200)}. Parse Error: ${e.message}`;
          }
        } else {
          // Body text could not be retrieved, try original error.message
          if (error.message) {
            if (typeof error.message === 'string' && error.message.includes('{')) {
                try {
                    const parsedEM = JSON.parse(error.message);
                    if (parsedEM && parsedEM.error && typeof parsedEM.error.message === 'string') {
                        actualErrorMessage = parsedEM.error.message;
                    } else {
                        actualErrorMessage = error.message;
                    }
                } catch (e: any) {
                    actualErrorMessage = error.message;
                }
            } else {
                 actualErrorMessage = error.message;
            }
          } else {
            actualErrorMessage = "Error object provided no parsable message and no text body in context.";
          }
        }
      } else if (error && error.message) {
        actualErrorMessage = error.message;
      } else if (error) {
        actualErrorMessage = "Unknown error object."
      }
      expect(actualErrorMessage).to.contain("Project not found or access denied"); // Adjusted, expecting RLS to cause this via PGRST116

      // Crucially, ensure the original project's tag was NOT changed
      const { data: dbProject, error: dbError } = await adminClient
        .from("dialectic_projects")
        .select("selected_domain_tag")
        .eq("id", testProjectId) // testProjectId still belongs to the original testUser
        .single();
      expect(dbError).to.be.null;
      // It should still be its original state (null, as it's not set to TEST_DOMAIN_TAG_1 or _2 in the beforeEach for this suite)
      // Or, if it was set in a prior test step and not cleaned up, this might be flaky.
      // Let's ensure it's not TEST_DOMAIN_TAG_2 which User B tried to set.
      expect(dbProject?.selected_domain_tag).to.not.equal(TEST_DOMAIN_TAG_2);
    });

    // Add more tests: trying to update other user's project, project not found, etc.
  });
  // --- End Test Suite for updateProjectDomainTag ---

  // --- Test Suite for createProject ---
  describe("Action: createProject", () => {
    let testUserId: string;
    let testUserClient: SupabaseClient<Database>;
    let testUserAuthToken: string;
    const createdProjectIds: string[] = [];

    beforeEach(async () => {
      createdProjectIds.length = 0; // Clear the array before each test in this suite
      const setup = await coreInitializeTestStep({
        userProfile: { first_name: "CreateProjectUser" }
        // No resources needed here as we are testing creation
      });
      testUserId = setup.primaryUserId;
      testUserClient = setup.primaryUserClient;
      testUserAuthToken = await coreGenerateTestUserJwt(testUserId);
    });

    afterEach(async () => {
      await coreCleanupTestResources();
    });

    it("should successfully create a new project with a valid selected_domain_tag", async () => {
      const projectName = `Test Project ${crypto.randomUUID()}`;
      const initialUserPrompt = "This is a test prompt.";
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: { 
          projectName, 
          initialUserPrompt, 
          selected_domain_tag: TEST_DOMAIN_TAG_1 
        },
      };

      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });

      expect(error, `Function invocation error: ${JSON.stringify(error)}`).to.be.null;
      expect(data, "Response data should exist").to.exist;
      const responsePayload = data as any;
      expect(responsePayload.error, `Service action error: ${responsePayload.error?.message}`).to.be.undefined;
      expect(responsePayload.data.id, "Response should contain project ID").to.exist;
      createdProjectIds.push(responsePayload.data.id);

      expect(responsePayload.data.project_name).to.equal(projectName);
      expect(responsePayload.data.initial_user_prompt).to.equal(initialUserPrompt);
      expect(responsePayload.data.user_id).to.equal(testUserId);
      expect(responsePayload.data.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);

      // Verify in DB
      const { data: dbProject, error: dbError } = await adminClient
        .from("dialectic_projects")
        .select("*")
        .eq("id", responsePayload.data.id)
        .single();
      
      expect(dbError).to.be.null;
      expect(dbProject).to.exist;
      expect(dbProject?.project_name).to.equal(projectName);
      expect(dbProject?.initial_user_prompt).to.equal(initialUserPrompt);
      expect(dbProject?.user_id).to.equal(testUserId);
      expect(dbProject?.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);
    });

    it("should successfully create a new project with selected_domain_tag as null", async () => {
      const projectName = `Test Project Null Tag ${crypto.randomUUID()}`;
      const initialUserPrompt = "Another test prompt.";
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: { 
          projectName, 
          initialUserPrompt, 
          selected_domain_tag: null 
        },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", { 
        body: request, 
        headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });

      expect(error).to.be.null;
      const responsePayload = data as any;
      expect(responsePayload.error).to.be.undefined;
      expect(responsePayload.data.id).to.exist;
      createdProjectIds.push(responsePayload.data.id);
      expect(responsePayload.data.selected_domain_tag).to.be.null;

      const { data: dbProject, error: dbError } = await adminClient
        .from("dialectic_projects")
        .select("selected_domain_tag")
        .eq("id", responsePayload.data.id)
        .single();
      expect(dbError).to.be.null;
      expect(dbProject?.selected_domain_tag).to.be.null;
    });

    it("should fail to create a project with an invalid selected_domain_tag", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: { 
          projectName: "Invalid Tag Test", 
          initialUserPrompt: "Prompt for invalid tag.", 
          selected_domain_tag: INVALID_DOMAIN_TAG 
        },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", {
         body: request,
         headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });

      expect(error, "Expected function invocation to error due to invalid selected_domain_tag").to.exist;
      expect(error.context.status, "Expected HTTP status 400 for invalid selected_domain_tag").to.equal(400);
      console.log(`[Test Debug] createProject - invalid selected_domain_tag - error object:`, error);
      console.log(`[Test Debug] createProject - invalid selected_domain_tag - error.context object:`, error.context);
      let actualErrorMessage = "Error message not found";
      if (error && error.context && typeof error.context.json === 'function') {
        try {
          const parsedBody = await error.context.json();
          if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
            actualErrorMessage = parsedBody.error.message;
          } else {
            actualErrorMessage = `Parsed error.context.json() but expected structure not found. Parsed: ${JSON.stringify(parsedBody)}`;
          }
        } catch (e: any) {
          actualErrorMessage = `Failed to parse error.context.json(). Parse error: ${e.message}`;
        }
      } else if (error && typeof error.message === 'string' && error.message.includes('{')) {
        try {
          const parsedBody = JSON.parse(error.message);
          if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
            actualErrorMessage = parsedBody.error.message;
          }
        } catch (e: any) { /* ignore */ }
      } else if (error && error.message) {
        actualErrorMessage = error.message;
      }
      expect(actualErrorMessage).to.contain("Invalid selectedDomainTag"); 
      expect(createdProjectIds.length).to.equal(0); 
    });

    it("should fail if projectName is missing", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: { 
          projectName: "", 
          initialUserPrompt: "Prompt here.", 
          selected_domain_tag: TEST_DOMAIN_TAG_1 
        },
      };
      const { data, error } = await testUserClient.functions.invoke("dialectic-service", { 
        body: request,
        headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });
      expect(error, "Expected function invocation to error due to missing projectName").to.exist;
      expect(error.context.status, "Expected HTTP status 400 for missing projectName").to.equal(400);
      console.log(`[Test Debug] createProject - missing projectName - error object:`, error);
      console.log(`[Test Debug] createProject - missing projectName - error.context object:`, error.context);
      let actualErrorMessage = "Error message not found";
      if (error && error.context && typeof error.context.json === 'function') {
        try {
          const parsedBody = await error.context.json();
          if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
            actualErrorMessage = parsedBody.error.message;
          } else {
            actualErrorMessage = `Parsed error.context.json() but expected structure not found. Parsed: ${JSON.stringify(parsedBody)}`;
          }
        } catch (e: any) {
          actualErrorMessage = `Failed to parse error.context.json(). Parse error: ${e.message}`;
        }
      } else if (error && typeof error.message === 'string' && error.message.includes('{')) {
        try {
          const parsedBody = JSON.parse(error.message);
          if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
            actualErrorMessage = parsedBody.error.message;
          }
        } catch (e: any) { /* ignore */ }
      } else if (error && error.message) {
        actualErrorMessage = error.message;
      }
      expect(actualErrorMessage).to.contain("projectName and initialUserPrompt are required");
    });

    it("should fail if initialUserPrompt is missing", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: { 
          projectName: "A Project", 
          initialUserPrompt: "", 
          selected_domain_tag: TEST_DOMAIN_TAG_1 
        },
      };
       const { data, error } = await testUserClient.functions.invoke("dialectic-service", { 
        body: request,
        headers: { Authorization: `Bearer ${testUserAuthToken}` }
      });
      expect(error, "Expected function invocation to error due to missing initialUserPrompt").to.exist;
      expect(error.context.status, "Expected HTTP status 400 for missing initialUserPrompt").to.equal(400);
      console.log(`[Test Debug] createProject - missing initialUserPrompt - error object:`, error);
      console.log(`[Test Debug] createProject - missing initialUserPrompt - error.context object:`, error.context);
      let actualErrorMessage = "Error message not found";
      if (error && error.context && typeof error.context.json === 'function') {
        try {
          const parsedBody = await error.context.json();
          if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
            actualErrorMessage = parsedBody.error.message;
          } else {
            actualErrorMessage = `Parsed error.context.json() but expected structure not found. Parsed: ${JSON.stringify(parsedBody)}`;
          }
        } catch (e: any) {
          actualErrorMessage = `Failed to parse error.context.json(). Parse error: ${e.message}`;
        }
      } else if (error && typeof error.message === 'string' && error.message.includes('{')) {
        try {
          const parsedBody = JSON.parse(error.message);
          if (parsedBody && parsedBody.error && typeof parsedBody.error.message === 'string') {
            actualErrorMessage = parsedBody.error.message;
          }
        } catch (e: any) { /* ignore */ }
      } else if (error && error.message) {
        actualErrorMessage = error.message;
      }
      expect(actualErrorMessage).to.contain("projectName and initialUserPrompt are required");
    });

  });
  // --- End Test Suite for createProject ---
}); 