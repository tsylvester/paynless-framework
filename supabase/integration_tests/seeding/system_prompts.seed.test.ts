// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "npm:chai@4.3.7";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import { initializeSupabaseAdminClient } from "../../functions/chat/_integration.test.utils.ts";

describe("Migration & Seed: Initial system_prompts for Dialectic Engine", () => {
  let supabaseAdmin: SupabaseClient<Database>;

  beforeAll(() => {
    // Assumes migrations (including the one that seeds system_prompts) 
    // have been applied to the test DB prior to this test suite.
    // This typically involves: supabase db reset && supabase migration up
    supabaseAdmin = initializeSupabaseAdminClient();
  });

  const expectedPrompts = [
    {
      name: "dialectic_thesis_base_v1",
      stage_association: "thesis",
      context: "general",
      is_stage_default: true,
      version: 1,
      // We won't check the full prompt_text here for brevity, 
      // but we'll check for its existence and key variables.
      variables_expected_subset: [
        "user_objective", 
        "domain", 
        "agent_count", 
        "context_description",
        "reference_documents",
        "success_criteria"
      ]
    },
    {
      name: "dialectic_antithesis_base_v1",
      stage_association: "antithesis",
      context: "general",
      is_stage_default: true,
      version: 1,
      variables_expected_subset: [
        "user_objective",
        "domain",
        "agent_count",
        "reference_documents",
        "domain_standards",
        "success_criteria"
      ]
    }
  ];

  for (const expectedPrompt of expectedPrompts) {
    it(`should have the seeded prompt: ${expectedPrompt.name}`, async () => {
      const query = `
        SELECT name, stage_association, context, is_stage_default, version, prompt_text, variables_required
        FROM public.system_prompts
        WHERE name = '${expectedPrompt.name}'
      `;
      const { data: promptData, error } = await supabaseAdmin
        .rpc('execute_sql', { query });

      expect(error, `Error querying for prompt ${expectedPrompt.name}`).to.be.null;
      expect(promptData, `Prompt ${expectedPrompt.name} not found or rpc returned no data`).to.be.an("array").with.lengthOf(1);
      
      const seededPrompt = promptData![0] as any;

      expect(seededPrompt.name).to.equal(expectedPrompt.name);
      expect(seededPrompt.stage_association).to.equal(expectedPrompt.stage_association);
      expect(seededPrompt.context).to.equal(expectedPrompt.context);
      expect(seededPrompt.is_stage_default).to.equal(expectedPrompt.is_stage_default);
      expect(seededPrompt.version).to.equal(expectedPrompt.version);
      expect(seededPrompt.prompt_text).to.be.a("string").and.not.empty;
      
      expect(seededPrompt.variables_required).to.be.an("array"); // JSONB array comes as a JS array
      // Check if all expected variables are present in the variables_required array/object
      if (Array.isArray(seededPrompt.variables_required)) { // If variables_required is an array of strings
        for (const variable of expectedPrompt.variables_expected_subset) {
          expect(seededPrompt.variables_required).to.include(variable);
        }
      } else { // If variables_required is an object e.g. {"var1": "text", ...}
         for (const variable of expectedPrompt.variables_expected_subset) {
          expect(seededPrompt.variables_required).to.have.property(variable);
        }
      }
    });
  }
}); 