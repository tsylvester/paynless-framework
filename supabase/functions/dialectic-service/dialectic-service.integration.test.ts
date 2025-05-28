// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "npm:chai@4.3.7";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import { initializeSupabaseAdminClient } from "../chat/_integration.test.utils.ts"; // May need a more general utility

// Assuming the dialectic-service will have a handler for different actions
interface DialecticServiceRequest {
  action: string;
  // deno-lint-ignore no-explicit-any
  payload?: any; // Define more specific payloads as actions are added
}

// We might need to seed specific data for these tests or ensure it exists.
const TEST_DOMAIN_TAG_1 = "software_development"; // From existing seeds
const TEST_DOMAIN_TAG_2 = "technical_writing";

describe("Edge Function: dialectic-service", () => {
  let supabaseAdmin: SupabaseClient<Database>;
  // let userClient: SupabaseClient<Database>; // If auth is needed for the endpoint

  beforeAll(async () => {
    supabaseAdmin = initializeSupabaseAdminClient();

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
        if (thesisErr || !thesisPrompt) throw new Error("Failed to re-fetch thesis prompt for re-seeding");

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

  // We will add more describe blocks for other actions of dialectic-service here
  // e.g., describe("Action: createProject", () => { ... });
}); 