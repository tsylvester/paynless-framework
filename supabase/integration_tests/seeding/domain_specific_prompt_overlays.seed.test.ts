// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "npm:chai@4.3.7";
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
      .select("id")
      .eq("name", "dialectic_thesis_base_v1")
      .single();
    if (thesisErr || !thesisPrompt) throw new Error(`Could not fetch base thesis prompt: ${thesisErr?.message}`);
    baseThesisPromptId = thesisPrompt.id;

    const { data: antithesisPrompt, error: antiErr } = await supabaseAdmin
      .from("system_prompts")
      .select("id")
      .eq("name", "dialectic_antithesis_base_v1")
      .single();
    if (antiErr || !antithesisPrompt) throw new Error(`Could not fetch base antithesis prompt: ${antiErr?.message}`);
    baseAntithesisPromptId = antithesisPrompt.id;
  });

  for (const expectedOverlay of expectedOverlays) {
    it(`should have the seeded domain overlay for: ${expectedOverlay.system_prompt_name} / ${expectedOverlay.domain_tag}`, async () => {
      const targetSystemPromptId = expectedOverlay.system_prompt_name === "dialectic_thesis_base_v1" 
        ? baseThesisPromptId 
        : baseAntithesisPromptId;

      expect(targetSystemPromptId, `Base prompt ID for ${expectedOverlay.system_prompt_name} must be resolved`).to.exist;
      if (!targetSystemPromptId) return; // Should not happen due to expect above

      const { data: seededOverlays, error } = await supabaseAdmin
        .from("domain_specific_prompt_overlays")
        .select("*, system_prompts(name)") // Include base prompt name for easier debugging if needed
        .eq("system_prompt_id", targetSystemPromptId)
        .eq("domain_tag", expectedOverlay.domain_tag)
        .eq("version", expectedOverlay.version);
      
      expect(error).to.be.null;
      expect(seededOverlays, "Seeded overlay data not found or multiple found when one expected").to.be.an("array").with.lengthOf(1);
      if (!seededOverlays || seededOverlays.length !== 1) return;

      const seededOverlay = seededOverlays[0];
      expect(seededOverlay.description).to.equal(expectedOverlay.description);
      expect(seededOverlay.is_active).to.equal(expectedOverlay.is_active === undefined ? true : expectedOverlay.is_active);
      expect(seededOverlay.version).to.equal(expectedOverlay.version);

      // Check if all expected overlay_values_subset keys and values are present in the actual overlay_values
      if (typeof expectedOverlay.overlay_values_subset === 'object' && expectedOverlay.overlay_values_subset !== null) {
        expect(seededOverlay.overlay_values, "Overlay values should be an object").to.be.an('object');
        for (const key in expectedOverlay.overlay_values_subset) {
          expect(seededOverlay.overlay_values, `Key '${key}' not found in overlay_values`).to.have.property(key);
          // deno-lint-ignore no-explicit-any
          expect((seededOverlay.overlay_values as any)[key], `Value for key '${key}' mismatch`).to.deep.equal((expectedOverlay.overlay_values_subset as any)[key]);
        }
      } else {
        // If subset is not an object (e.g. null/undefined), then actual values should match (e.g. be null)
        expect(seededOverlay.overlay_values).to.deep.equal(expectedOverlay.overlay_values_subset);
      }
    });
  }
}); 