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
        const { data: thesisPrompt, error: thesisErr } = await adminClient
          .from("system_prompts").select("id").eq("name", "dialectic_thesis_base_v1").single();
        if (thesisErr || !thesisPrompt) {
          throw new Error("Failed to re-fetch thesis prompt for re-seeding");
        }

        const { error: upsertError } = await adminClient
          .from("domain_specific_prompt_overlays")
          .upsert([
            {
              system_prompt_id: thesisPrompt.id,
              domain_tag: TEST_DOMAIN_TAG_1,
              overlay_values: { test_data: "restore" },
              description: "Test overlay restore",
              version: 99,
            },
          ], { onConflict: "system_prompt_id,domain_tag,version" });
        if (upsertError) console.error("Failed to restore test data for overlays", upsertError);
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

    it("RED TEST: should generate thesis contributions, store them, and link to storage", async () => {
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
        .eq("stage", "THESIS");

      assert(!dbError, `Error fetching contributions from DB: ${dbError?.message}`);
      assertExists(dbContributions, "No contributions found in DB for the session and stage");
      assertEquals(dbContributions.length, responseData.data.contributions.length, "Mismatch in number of contributions in DB vs response");

      for (const contribution of dbContributions) {
        assertExists(contribution.id, "Contribution ID is missing in DB record");
        assertEquals(contribution.session_model_id, testSessionModelId, "Contribution not linked to the correct session_model_id");
        assertExists(contribution.content_storage_path, "content_storage_path is missing");
        assert(contribution.content_storage_path.startsWith(`${testPrimaryUserId}/${testSessionId}/`), `Content storage path '${contribution.content_storage_path}' incorrect for user ${testPrimaryUserId} and session ${testSessionId}`);
        assertEquals(contribution.content_storage_bucket, "dialectic-contributions", "Storage bucket is incorrect");
        assertEquals(contribution.content_mime_type, "application/json", "MIME type is incorrect for thesis content"); 
        assert(contribution.content_size_bytes && contribution.content_size_bytes > 0, "Content size should be greater than 0");

        if (contribution.raw_response_storage_path) {
          assert(contribution.raw_response_storage_path.startsWith(`${testPrimaryUserId}/${testSessionId}/`), "Raw response storage path is incorrect");
        }
      }
    });
  });

  async function invokeDialecticService(action: string, payload: unknown, authToken: string) {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/dialectic-service`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "X-Client-Info": "supabase-js/0.0.0-automated-test",
      },
      body: JSON.stringify({ action, payload }),
    });
    return response;
  }
}); 