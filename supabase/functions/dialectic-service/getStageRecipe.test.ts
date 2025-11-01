import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { getStageRecipe } from "./getStageRecipe.ts";
import { BranchKey } from "./dialectic.interface.ts";

Deno.test("getStageRecipe - Happy Path: returns sorted steps and preserves grouping", async () => {
  const stageSlug = "synthesis";
  const instanceId = "instance-123";

  // Two steps out of order to assert sorting by execution_order, then step_key
  const rawSteps = [
    {
      id: "step-b",
      instance_id: instanceId,
      step_key: "b_key",
      step_slug: "b-slug",
      step_name: "B",
      execution_order: 2,
      parallel_group: 2,
      branch_key: BranchKey.business_case,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-b",
      output_type: "AssembledDocumentJson",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "document", stage_slug: "thesis", document_key: "feature_spec", required: true }],
      inputs_relevance: [{ document_key: "feature_spec", type: "document", relevance: 1.0, stage_slug: "thesis" }],
      outputs_required: [{ type: "header_context", document_key: "header_ctx_b" }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: "",
    },
    {
      id: "step-a",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a-slug",
      step_name: "A",
      execution_order: 1,
      parallel_group: 1,
      branch_key: BranchKey.feature_spec,
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "pt-a",
      output_type: "HeaderContext",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "seed_prompt", document_key: "seed_prompt", required: true }],
      inputs_relevance: [],
      outputs_required: [{ type: "header_context", document_key: "header_ctx_a" }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: "",
    },
  ];

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_stages': {
        select: {
          data: [{ id: 'stage-id', slug: stageSlug, active_recipe_instance_id: instanceId }],
          error: null,
        },
      },
      'dialectic_stage_recipe_steps': {
        select: { data: rawSteps, error: null },
      },
    },
  });

  const result = await getStageRecipe({ stageSlug }, mockSupabase.client as unknown as SupabaseClient<Database>);

  assertEquals(result.status, 200);
  assertExists(result.data);
  const payload = result.data;
  assertEquals(payload.stageSlug, stageSlug);
  assertEquals(payload.instanceId, instanceId);
  // Sorted: step-a (order 1) then step-b (order 2)
  assertEquals(payload.steps[0].step_key, 'a_key');
  assertEquals(payload.steps[0].parallel_group, 1);
  assertEquals(payload.steps[0].branch_key, BranchKey.feature_spec);
  assertEquals(payload.steps[1].step_key, 'b_key');
  assertEquals(payload.steps[1].parallel_group, 2);
  assertEquals(payload.steps[1].branch_key, BranchKey.business_case);
});

Deno.test("getStageRecipe - Error: missing stage returns 404", async () => {
  const stageSlug = "missing-stage";
  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_stages': { select: { data: null, error: null } },
    },
  });

  const result = await getStageRecipe({ stageSlug }, mockSupabase.client as unknown as SupabaseClient<Database>);
  assertEquals(result.status, 404);
  assertExists(result.error);
});

Deno.test("getStageRecipe - Error: stage missing active_recipe_instance_id returns 400", async () => {
  const stageSlug = "synthesis";
  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_stages': { select: { data: [{ id: 'stage-id', slug: stageSlug, active_recipe_instance_id: null }], error: null } },
    },
  });

  const result = await getStageRecipe({ stageSlug }, mockSupabase.client as unknown as SupabaseClient<Database>);
  assertEquals(result.status, 400);
  assertExists(result.error);
});

Deno.test("getStageRecipe - Error: malformed step rows are rejected", async () => {
  const stageSlug = "synthesis";
  const instanceId = "instance-err";

  const badSteps = [
    {
      id: "bad",
      instance_id: instanceId,
      step_key: "bad_key",
      step_slug: "bad-slug",
      step_name: "bad",
      execution_order: 1,
      parallel_group: 1,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: "AssembledDocumentJson",
      granularity_strategy: "one_to_one",
      // Malformed: inputs_required should be an array
      inputs_required: null,
      inputs_relevance: [],
      outputs_required: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: "",
    },
  ];

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_stages': {
        select: {
          data: [{ id: 'stage-id', slug: stageSlug, active_recipe_instance_id: instanceId }],
          error: null,
        },
      },
      'dialectic_stage_recipe_steps': {
        select: { data: badSteps, error: null },
      },
    },
  });

  const result = await getStageRecipe({ stageSlug }, mockSupabase.client as unknown as SupabaseClient<Database>);
  assertEquals(result.status, 500);
  assertExists(result.error);
});


