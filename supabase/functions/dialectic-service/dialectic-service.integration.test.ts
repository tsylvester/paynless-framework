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
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import {
  initializeSupabaseAdminClient,
  coreCreateAndSetupTestUser,
  coreGenerateTestUserJwt,
  setSupabaseAdminClientForTests,
  // coreResetDatabaseState, // Potentially for a global teardown
} from "../_shared/_integration.test.utils.ts";
import { User } from "npm:@supabase/supabase-js@2";

// Assuming the dialectic-service will have a handler for different actions
interface DialecticServiceRequest {
  action: string;
  // deno-lint-ignore no-explicit-any
  payload?: any; // Define more specific payloads as actions are added
}

// We might need to seed specific data for these tests or ensure it exists.
const TEST_DOMAIN_TAG_1 = "software_development"; // From existing seeds
const TEST_DOMAIN_TAG_2 = "technical_writing";
const INVALID_DOMAIN_TAG = "invalid_domain_tag_for_testing";

describe("Edge Function: dialectic-service", () => {
  let supabaseAdmin: SupabaseClient<Database>;
  // let userClient: SupabaseClient<Database>; // If auth is needed for the endpoint

  beforeAll(async () => {
    supabaseAdmin = initializeSupabaseAdminClient();
    setSupabaseAdminClientForTests(supabaseAdmin);

    // Ensure a second distinct domain tag exists for testing listAvailableDomainTags
    // This assumes the "software_development" tag is already seeded.
    // We need to ensure there are at least two overlays with TEST_DOMAIN_TAG_1
    // and one with TEST_DOMAIN_TAG_2 to test distinctness.

    // Fetch existing base prompts to link new test overlays
    const { data: thesisPrompt, error: thesisErr } = await supabaseAdmin
      .from("system_prompts")
      .select("id")
      .eq("name", "dialectic_thesis_base_v1")
      .single();
    if (thesisErr || !thesisPrompt) {
      throw new Error("Test setup failed: Could not fetch base thesis prompt.");
    }

    const { data: antithesisPrompt, error: antiErr } = await supabaseAdmin
    .from("system_prompts")
    .select("id")
    .eq("name", "dialectic_antithesis_base_v1")
    .single();
  if (antiErr || !antithesisPrompt) {
    throw new Error("Test setup failed: Could not fetch base antithesis prompt.");
  }

    // Upsert an overlay with the second test domain tag to ensure it exists.
    // Also ensure multiple entries for TEST_DOMAIN_TAG_1 if not already present from main seed.
    const overlaysToUpsert = [
      {
        system_prompt_id: thesisPrompt.id,
        domain_tag: TEST_DOMAIN_TAG_1, // Ensuring at least one for this tag
        overlay_values: { test_data: "ensure software_development for thesis" },
        description: "Test overlay for software_development (thesis)",
        version: 99, // Use a distinct version to avoid conflict with actual seeds
      },
      {
        system_prompt_id: antithesisPrompt.id, // Link to a different prompt to ensure variety
        domain_tag: TEST_DOMAIN_TAG_1, // Another one for software_development
        overlay_values: { test_data: "ensure software_development for antithesis" },
        description: "Test overlay for software_development (antithesis)",
        version: 99,
      },
      {
        system_prompt_id: thesisPrompt.id,
        domain_tag: TEST_DOMAIN_TAG_2,
        overlay_values: { test_data: "ensure technical_writing" },
        description: "Test overlay for technical_writing",
        version: 99,
      },
    ];

    const { error: upsertError } = await supabaseAdmin
      .from("domain_specific_prompt_overlays")
      .upsert(overlaysToUpsert, { onConflict: "system_prompt_id,domain_tag,version" }); // Assumes this unique constraint exists

    if (upsertError) {
      console.error("Error upserting test domain overlays:", upsertError);
      throw new Error(`Test setup failed: Could not upsert test domain overlays: ${upsertError.message}`);
    }
    console.log("Test domain overlays upserted for dialectic-service tests.");
  });

  afterAll(async () => {
    // Clean up test-specific domain overlays by version
    const { error: deleteError } = await supabaseAdmin
      .from("domain_specific_prompt_overlays")
      .delete()
      .eq("version", 99);
    if (deleteError) {
      console.error("Failed to clean up test domain overlays:", deleteError);
    }
    // Consider calling coreResetDatabaseState here if users/projects aren't cleaned up by specific test suites.
  });

  describe("Action: listAvailableDomainTags", () => {
    it("should return a distinct list of available domain tags", async () => {
      // This test is initially RED because the Edge Function action doesn't exist yet.
      const request: DialecticServiceRequest = {
        action: "listAvailableDomainTags",
      };

      const { data, error } = await supabaseAdmin.functions.invoke(
        "dialectic-service",
        { body: request }
      );

      console.log("listAvailableDomainTags response data:", data);
      console.log("listAvailableDomainTags response error:", error);

      expect(error, "Function invocation should not error").to.be.null;
      expect(data, "Response data should exist").to.exist;
      // deno-lint-ignore no-explicit-any
      const responsePayload = data as any; // Cast for now, will be typed later
      
      expect(responsePayload.error, `Service action error: ${responsePayload.error?.message}`).to.be.undefined;
      expect(responsePayload.data, "Payload data should be an array").to.be.an("array");
      
      const tags = responsePayload.data as string[];
      expect(tags).to.include.members([TEST_DOMAIN_TAG_1, TEST_DOMAIN_TAG_2]);
      
      // Check for distinctness
      const distinctTags = [...new Set(tags)];
      expect(tags.length, "Tags list should only contain distinct tags").to.equal(distinctTags.length);
    });

    // Add more tests: e.g., what happens if there are no overlays? (should return empty array)
    it("should return an empty list if no domain_specific_prompt_overlays exist", async () => {
      // Temporarily delete all overlays to test empty case
      // This is risky if tests run in parallel or if main seed is vital, better to use a unique test table or versioning
      // For now, we rely on afterAll to clean up version 99, and assume main seeds are different.
      // A more robust way would be to use a transaction or a specific test context if possible.
      
      // To be safe, let's delete only our test versions + any other version for a moment
      // then re-insert one of our test versions to ensure the table isn't fully empty from other tests.
      const { error: delErr } = await supabaseAdmin.from("domain_specific_prompt_overlays").delete().neq("domain_tag", "_some_non_existent_tag_for_safety_");
      expect(delErr, "Failed to clear overlays for empty test").to.be.null;

      try {
        const request: DialecticServiceRequest = {
          action: "listAvailableDomainTags",
        };
        const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", { body: request });
        expect(error).to.be.null;
        expect(data).to.exist;
        // deno-lint-ignore no-explicit-any
        const responsePayload = data as any;
        expect(responsePayload.error).to.be.undefined;
        expect(responsePayload.data).to.be.an("array").that.is.empty;
      } finally {
        // Restore the test data for subsequent tests within this describe block or if other tests run.
        // This is a simplified re-setup; ideally, tests are isolated or use transactions.
        const { data: thesisPrompt, error: thesisErr } = await supabaseAdmin
          .from("system_prompts").select("id").eq("name", "dialectic_thesis_base_v1").single();
        if (thesisErr || !thesisPrompt) {
          // deno-lint-ignore-line no-unsafe-finally
          throw new Error("Failed to re-fetch thesis prompt for re-seeding");
        }

        const { error: upsertError } = await supabaseAdmin
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

  describe("Action: updateProjectDomainTag", () => {
    let testUserId: string;
    let testUserJwt: string;
    let testProjectId: string;
    let testProjectInitialTag: string | null = null;

    beforeAll(async () => {
      testUserId = await coreCreateAndSetupTestUser({ first_name: "DialecticUpdateTest" });
      testUserJwt = await coreGenerateTestUserJwt(testUserId);

      // Create a project for the test user
      const { data: project, error: createError } = await supabaseAdmin
        .from("dialectic_projects")
        .insert({
          user_id: testUserId,
          project_name: "Test Project for Domain Tag Update",
          initial_user_prompt: "Test initial prompt",
          selected_domain_tag: testProjectInitialTag, // Initially null or a specific tag
        })
        .select("id, selected_domain_tag")
        .single();

      if (createError || !project) {
        throw new Error(`Failed to create test project: ${createError?.message || "No project data"}`);
      }
      testProjectId = project.id;
      testProjectInitialTag = project.selected_domain_tag;
    });

    afterAll(async () => {
      if (testProjectId) {
        await supabaseAdmin.from("dialectic_projects").delete().eq("id", testProjectId);
      }
      if (testUserId) {
        // This user will be cleaned up by the global test user cleanup if it exists,
        // or add: await supabaseAdmin.auth.admin.deleteUser(testUserId);
      }
    });

    it("should successfully update selected_domain_tag with a valid tag", async () => {
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: TEST_DOMAIN_TAG_1 },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });

      expect(error, `Function error: ${error?.message}`).to.be.null;
      expect(data, "Response data should exist").to.exist;
      const responsePayload = data as any;
      expect(responsePayload.error, `Service error: ${responsePayload.error?.message}`).to.be.undefined;
      expect(responsePayload.data).to.exist;
      expect(responsePayload.data.id).to.equal(testProjectId);
      expect(responsePayload.data.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);

      // Verify in DB
      const { data: dbData, error: dbError } = await supabaseAdmin.from("dialectic_projects").select("selected_domain_tag").eq("id", testProjectId).single();
      expect(dbError).to.be.null;
      expect(dbData?.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);
    });

    it("should successfully update selected_domain_tag to null", async () => {
      // First set it to something non-null
      await supabaseAdmin.from("dialectic_projects").update({ selected_domain_tag: TEST_DOMAIN_TAG_1 }).eq("id", testProjectId);

      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: null },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });

      expect(error).to.be.null;
      expect(data).to.exist;
      const responsePayload = data as any;
      expect(responsePayload.error).to.be.undefined;
      expect(responsePayload.data.selected_domain_tag).to.be.null;

      const { data: dbData, error: dbError } = await supabaseAdmin.from("dialectic_projects").select("selected_domain_tag").eq("id", testProjectId).single();
      expect(dbError).to.be.null;
      expect(dbData?.selected_domain_tag).to.be.null;
    });

    it("should fail to update with an invalid domain_tag", async () => {
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: INVALID_DOMAIN_TAG },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });

      expect(data).to.be.null;
      expect(error, "Function invocation should produce an error for invalid input").to.exist;
      
      const fnError = error as any; 
      expect(fnError.context, "Error context should exist").to.exist;
      expect(fnError.context.status, "HTTP status should be 400").to.equal(400);

      let errorPayload;
      try {
        errorPayload = await fnError.context.json();
      } catch (e: unknown) {
        const parseError = e as Error;
        const textContent = await fnError.context.text();
        console.error("[TEST_ERROR] Failed to parse JSON response. Text content was:", textContent);
        throw new Error(`Failed to parse JSON response from function. Status: ${fnError.context.status}. Error: ${parseError.message}. Body: ${textContent}`);
      }
      
      expect(errorPayload, "Parsed error payload should exist").to.exist;
      expect(errorPayload.error, "Error payload should have an 'error' property which is a string message").to.be.a('string');
      expect(errorPayload.error).to.include(`Invalid domainTag: "${INVALID_DOMAIN_TAG}"`);
    });

    it("should fail if projectId is missing", async () => {
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { domainTag: TEST_DOMAIN_TAG_1 }, 
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });
      expect(data).to.be.null;
      expect(error).to.exist;
      const fnError = error as any;
      expect(fnError.context).to.exist;
      expect(fnError.context.status).to.equal(400);
      let errorPayload;
      try { errorPayload = await fnError.context.json(); } 
      catch (e: unknown) { 
        const parseError = e as Error;
        const textContent = await fnError.context.text(); 
        console.error("[TEST_ERROR] Failed to parse JSON. Body:", textContent); 
        throw new Error(`Parse failed: ${parseError.message}. Body: ${textContent}`);
      }
      expect(errorPayload).to.exist;
      expect(errorPayload.error).to.be.a('string');
      expect(errorPayload.error).to.equal("projectId is required");
    });

    it("should fail if project does not exist or user does not have access", async () => {
      const nonExistentProjectId = crypto.randomUUID();
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: nonExistentProjectId, domainTag: TEST_DOMAIN_TAG_1 },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });
      expect(data).to.be.null;
      expect(error).to.exist;
      const fnError = error as any;
      expect(fnError.context).to.exist;
      expect(fnError.context.status).to.equal(404);
      let errorPayload;
      try { errorPayload = await fnError.context.json(); }       
      catch (e: unknown) { 
        const parseError = e as Error;
        const textContent = await fnError.context.text(); 
        console.error("[TEST_ERROR] Failed to parse JSON. Body:", textContent); 
        throw new Error(`Parse failed: ${parseError.message}. Body: ${textContent}`);
      }
      expect(errorPayload).to.exist;
      expect(errorPayload.error).to.be.a('string');
      expect(errorPayload.error).to.equal("Project not found or access denied");
    });

    it("should fail if user is not authenticated", async () => {
      const request: DialecticServiceRequest = {
        action: "updateProjectDomainTag",
        payload: { projectId: testProjectId, domainTag: TEST_DOMAIN_TAG_1 },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", { body: request });
      expect(data).to.be.null;
      expect(error).to.exist;
      const fnError = error as any;
      expect(fnError.context).to.exist;
      expect(fnError.context.status).to.equal(401);
      let errorPayload;
      try { errorPayload = await fnError.context.json(); } 
      catch (e: unknown) { 
        const parseError = e as Error;
        const textContent = await fnError.context.text(); 
        console.error("[TEST_ERROR] Failed to parse JSON. Body:", textContent); 
        throw new Error(`Parse failed: ${parseError.message}. Body: ${textContent}`);
      }
      expect(errorPayload).to.exist;
      expect(errorPayload.error).to.be.a('string');
      expect(errorPayload.error).to.equal("User not authenticated");
    });
  });

  describe("Action: createProject", () => {
    let testUserId: string;
    let testUserJwt: string;
    const validProjectName = "My New Dialectic Project";
    const validInitialPrompt = "This is the initial problem statement.";

    beforeAll(async () => {
      testUserId = await coreCreateAndSetupTestUser({ first_name: "DialecticCreateTest" });
      testUserJwt = await coreGenerateTestUserJwt(testUserId);
      // Ensure TEST_DOMAIN_TAG_1 is available from the domain_specific_prompt_overlays for validation
      // This is already handled in the outer describe's beforeAll for listAvailableDomainTags tests
    });

    afterEach(async () => {
      // Clean up any projects created during tests by this user to keep tests idempotent
      // This is important if a test fails mid-way
      await supabaseAdmin
        .from("dialectic_projects")
        .delete()
        .match({ user_id: testUserId, project_name: validProjectName });
    });

    afterAll(async () => {
      if (testUserId) {
        // User cleanup might be handled by a global teardown, or do it here:
        // await supabaseAdmin.auth.admin.deleteUser(testUserId);
      }
    });

    it("should successfully create a project with required fields and no domain tag", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: {
          projectName: validProjectName,
          initialUserPrompt: validInitialPrompt,
        },
      };

      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });

      expect(error, `Function error: ${error?.message}`).to.be.null;
      expect(data, "Response data should exist").to.exist;
      const responsePayload = data as any;
      expect(responsePayload.error, `Service error: ${responsePayload.error?.message}`).to.be.undefined;
      expect(responsePayload.data).to.exist;
      expect(responsePayload.data.project_name).to.equal(validProjectName);
      expect(responsePayload.data.initial_user_prompt).to.equal(validInitialPrompt);
      expect(responsePayload.data.user_id).to.equal(testUserId);
      expect(responsePayload.data.selected_domain_tag).to.be.null;
      expect(responsePayload.data.id).to.be.a("string");

      // Verify in DB
      const { data: dbData, error: dbError } = await supabaseAdmin
        .from("dialectic_projects")
        .select("*")
        .eq("id", responsePayload.data.id)
        .single();
      expect(dbError).to.be.null;
      expect(dbData).to.exist;
      expect(dbData?.project_name).to.equal(validProjectName);
      expect(dbData?.selected_domain_tag).to.be.null;
    });

    it("should successfully create a project with a valid selected_domain_tag", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: {
          projectName: validProjectName,
          initialUserPrompt: validInitialPrompt,
          selectedDomainTag: TEST_DOMAIN_TAG_1, // TEST_DOMAIN_TAG_1 is "software_development"
        },
      };

      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });

      expect(error).to.be.null;
      expect(data).to.exist;
      const responsePayload = data as any;
      expect(responsePayload.error).to.be.undefined;
      expect(responsePayload.data.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);

      const { data: dbData, error: dbError } = await supabaseAdmin
        .from("dialectic_projects")
        .select("selected_domain_tag")
        .eq("id", responsePayload.data.id)
        .single();
      expect(dbError).to.be.null;
      expect(dbData?.selected_domain_tag).to.equal(TEST_DOMAIN_TAG_1);
    });

    it("should successfully create a project when selected_domain_tag is null", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: {
          projectName: validProjectName,
          initialUserPrompt: validInitialPrompt,
          selectedDomainTag: null,
        },
      };

      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });

      expect(error).to.be.null;
      expect(data).to.exist;
      const responsePayload = data as any;
      expect(responsePayload.error).to.be.undefined;
      expect(responsePayload.data.selected_domain_tag).to.be.null;
    });

    it("should fail to create a project with an invalid selected_domain_tag", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: {
          projectName: validProjectName,
          initialUserPrompt: validInitialPrompt,
          selectedDomainTag: INVALID_DOMAIN_TAG,
        },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });

      expect(data).to.be.null;
      expect(error).to.exist;
      const fnError = error as any;
      expect(fnError.context).to.exist;
      expect(fnError.context.status).to.equal(400);
      let errorPayload;
      try { errorPayload = await fnError.context.json(); } 
      catch (e: unknown) { 
        const parseError = e as Error;
        const textContent = await fnError.context.text(); 
        console.error("[TEST_ERROR] Failed to parse JSON. Body:", textContent); 
        throw new Error(`Parse failed: ${parseError.message}. Body: ${textContent}`);
      }
      expect(errorPayload).to.exist;
      expect(errorPayload.error).to.be.a('string');
      expect(errorPayload.error).to.include(`Invalid selectedDomainTag: "${INVALID_DOMAIN_TAG}"`);
    });

    it("should fail if projectName is missing", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: { initialUserPrompt: validInitialPrompt },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });
      expect(data).to.be.null;
      expect(error).to.exist;
      const fnError = error as any;
      expect(fnError.context).to.exist;
      expect(fnError.context.status).to.equal(400);
      let errorPayload;
      try { errorPayload = await fnError.context.json(); } 
      catch (e: unknown) { 
        const parseError = e as Error;
        const textContent = await fnError.context.text(); 
        console.error("[TEST_ERROR] Failed to parse JSON. Body:", textContent); 
        throw new Error(`Parse failed: ${parseError.message}. Body: ${textContent}`);
      }
      expect(errorPayload).to.exist;
      expect(errorPayload.error).to.be.a('string');
      expect(errorPayload.error).to.equal("projectName and initialUserPrompt are required");
    });

    it("should fail if initialUserPrompt is missing", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: { projectName: validProjectName },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", {
        body: request,
        headers: { Authorization: `Bearer ${testUserJwt}` },
      });
      expect(data).to.be.null;
      expect(error).to.exist;
      const fnError = error as any;
      expect(fnError.context).to.exist;
      expect(fnError.context.status).to.equal(400);
      let errorPayload;
      try { errorPayload = await fnError.context.json(); } 
      catch (e: unknown) { 
        const parseError = e as Error;
        const textContent = await fnError.context.text(); 
        console.error("[TEST_ERROR] Failed to parse JSON. Body:", textContent); 
        throw new Error(`Parse failed: ${parseError.message}. Body: ${textContent}`);
      }
      expect(errorPayload).to.exist;
      expect(errorPayload.error).to.be.a('string');
      expect(errorPayload.error).to.equal("projectName and initialUserPrompt are required");
    });

    it("should fail if user is not authenticated", async () => {
      const request: DialecticServiceRequest = {
        action: "createProject",
        payload: {
          projectName: validProjectName,
          initialUserPrompt: validInitialPrompt,
        },
      };
      const { data, error } = await supabaseAdmin.functions.invoke("dialectic-service", { body: request });
      expect(data).to.be.null;
      expect(error).to.exist;
      const fnError = error as any;
      expect(fnError.context).to.exist;
      expect(fnError.context.status).to.equal(401);
      let errorPayload;
      try { errorPayload = await fnError.context.json(); } 
      catch (e: unknown) { 
        const parseError = e as Error;
        const textContent = await fnError.context.text(); 
        console.error("[TEST_ERROR] Failed to parse JSON. Body:", textContent); 
        throw new Error(`Parse failed: ${parseError.message}. Body: ${textContent}`);
      }
      expect(errorPayload).to.exist;
      expect(errorPayload.error).to.be.a('string');
      expect(errorPayload.error).to.equal("User not authenticated");
    });
  });

  // We will add more describe blocks for other actions of dialectic-service here
  // e.g., describe("Action: createProject", () => { ... });
}); 