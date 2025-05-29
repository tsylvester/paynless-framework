// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../../functions/types_db.ts";
import { initializeSupabaseAdminClient } from "../../functions/chat/_integration.test.utils.ts";

// Define the structure of our seed data for clarity in the test
interface ExpectedDomainOverlaySeed {
  system_prompt_name: string; // Name of the base prompt in system_prompts
  domain_tag: string;
  description: string;
  version: number;
  overlay_values_subset: Json; // We'll check for a subset of these values
  is_active?: boolean;
}

describe("Seeding: domain_specific_prompt_overlays Table", () => {
  let supabaseAdmin: SupabaseClient<Database>;
  let baseThesisPromptId: string | null = null;
  let baseAntithesisPromptId: string | null = null;

  const expectedOverlays: ExpectedDomainOverlaySeed[] = [
    {
      system_prompt_name: "dialectic_thesis_base_v1",
      domain_tag: "software_development",
      description: "Software development domain overlay for the base thesis prompt, focusing on common dev standards.",
      version: 1,
      overlay_values_subset: {
        "domain_standards": "SOLID, DRY, KISS principles, secure coding practices, comprehensive testing",
        "deployment_context": "Cloud-native serverless architecture, CI/CD pipeline integration",
      },
      is_active: true,
    },
    {
      system_prompt_name: "dialectic_antithesis_base_v1",
      domain_tag: "software_development",
      description: "Software development domain overlay for the base antithesis prompt, focusing on dev critique points.",
      version: 1,
      overlay_values_subset: {
        "critique_focus_areas": [
            "Scalability under load", 
            "Maintainability and code complexity", 
            "Security vulnerabilities (OWASP Top 10)", 
            "Cost efficiency of proposed solution",
            "Adherence to {domain_standards}"
        ]
      },
      is_active: true,
    },
  ];

  beforeAll(async () => {
    supabaseAdmin = initializeSupabaseAdminClient();
    // Fetch the IDs of the base prompts to link overlays correctly
    const { data: thesisPrompt, error: thesisErr } = await supabaseAdmin
      .from("system_prompts")
      .select("id, name") // Select name for logging
      .eq("name", "dialectic_thesis_base_v1")
      .single();
    if (thesisErr || !thesisPrompt) {
        console.error("Error fetching base thesis prompt:", thesisErr);
        throw new Error(`Could not fetch base thesis prompt: ${thesisErr?.message}`);
    }
    baseThesisPromptId = thesisPrompt.id;
    console.log(`Fetched baseThesisPromptId: ${baseThesisPromptId} for name: ${thesisPrompt.name}`);

    const { data: antithesisPrompt, error: antiErr } = await supabaseAdmin
      .from("system_prompts")
      .select("id, name") // Select name for logging
      .eq("name", "dialectic_antithesis_base_v1")
      .single();
    if (antiErr || !antithesisPrompt) {
        console.error("Error fetching base antithesis prompt:", antiErr);
        throw new Error(`Could not fetch base antithesis prompt: ${antiErr?.message}`);
    }
    baseAntithesisPromptId = antithesisPrompt.id;
    console.log(`Fetched baseAntithesisPromptId: ${baseAntithesisPromptId} for name: ${antithesisPrompt.name}`);
  });

  for (const expectedOverlay of expectedOverlays) {
    it(`should have the seeded domain overlay for: ${expectedOverlay.system_prompt_name} / ${expectedOverlay.domain_tag}`, async () => {
      const targetSystemPromptId = expectedOverlay.system_prompt_name === "dialectic_thesis_base_v1" 
        ? baseThesisPromptId 
        : baseAntithesisPromptId;
      
      console.log(`Testing overlay for system_prompt_name: ${expectedOverlay.system_prompt_name}, resolved targetSystemPromptId: ${targetSystemPromptId}`);
      console.log(`Querying domain_specific_prompt_overlays with system_prompt_id: ${targetSystemPromptId}, domain_tag: ${expectedOverlay.domain_tag}, version: ${expectedOverlay.version}`);

      expect(targetSystemPromptId).toBeDefined();
      if (!targetSystemPromptId) return;

      const { data: seededOverlays, error } = await supabaseAdmin
        .from("domain_specific_prompt_overlays")
        .select("*, system_prompts(name)")
        .eq("system_prompt_id", targetSystemPromptId)
        .eq("domain_tag", expectedOverlay.domain_tag)
        .eq("version", expectedOverlay.version);
      
      console.log(`Query result - error: ${JSON.stringify(error)}, data: ${JSON.stringify(seededOverlays)}`);

      expect(error).toBeNull();
      expect(seededOverlays).toBeInstanceOf(Array);
      // Add a more informative assertion failure message for length check
      if (!seededOverlays || seededOverlays.length !== 1) {
        // Log all overlays for the given system_prompt_id to see what IS there
        const { data: allOverlaysForPromptId, error: allError } = await supabaseAdmin
            .from("domain_specific_prompt_overlays")
            .select("*")
            .eq("system_prompt_id", targetSystemPromptId);
        console.error(`Expected 1 overlay, found ${seededOverlays?.length || 0}. All overlays for prompt ID ${targetSystemPromptId}: ${JSON.stringify(allOverlaysForPromptId)}, error: ${JSON.stringify(allError)}`);
      }
      expect(seededOverlays).toHaveLength(1);
      if (!seededOverlays || seededOverlays.length !== 1) return; // Guard again, though expect would have thrown

      const seededOverlay = seededOverlays[0];
      expect(seededOverlay.description).toBe(expectedOverlay.description);
      expect(seededOverlay.is_active).toBe(expectedOverlay.is_active === undefined ? true : expectedOverlay.is_active);
      expect(seededOverlay.version).toBe(expectedOverlay.version);

      // Check if all expected overlay_values_subset keys and values are present in the actual overlay_values
      if (typeof expectedOverlay.overlay_values_subset === 'object' && expectedOverlay.overlay_values_subset !== null) {
        expect(typeof seededOverlay.overlay_values).toBe('object');
        expect(seededOverlay.overlay_values).not.toBeNull();
        for (const key in expectedOverlay.overlay_values_subset) {
          expect(seededOverlay.overlay_values).toHaveProperty(key);
          // deno-lint-ignore no-explicit-any
          expect((seededOverlay.overlay_values as any)[key]).toEqual((expectedOverlay.overlay_values_subset as any)[key]);
        }
      } else {
        // If subset is not an object (e.g. null/undefined), then actual values should match (e.g. be null)
        expect(seededOverlay.overlay_values).toEqual(expectedOverlay.overlay_values_subset);
      }
    });
  }
}); 