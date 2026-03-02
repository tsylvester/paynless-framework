import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { getStageRecipe } from "./getStageRecipe.ts";
import { BranchKey } from "./dialectic.interface.ts";

Deno.test("getStageRecipe - Happy Path: returns sorted steps and preserves grouping, includes all steps for frontend tracking", async () => {
  const stageSlug = "synthesis";
  const instanceId = "instance-123";

  // Three steps: one PLAN step with header_context (needed for frontend tracking), two EXECUTE steps with renderable types
  // All steps should appear in the DTO - frontend needs all steps to track progress
  // Steps are out of order to assert sorting by execution_order, then step_key
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
      output_type: "business_case",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "document", stage_slug: "thesis", document_key: "feature_spec", required: true }],
      inputs_relevance: [{ document_key: "feature_spec", type: "document", relevance: 1.0, stage_slug: "thesis" }],
      outputs_required: {
        documents: [
          {
            document_key: "business_case",
            template_filename: "synthesis_business_case.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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
      id: "step-plan-backend",
      instance_id: instanceId,
      step_key: "plan_header",
      step_slug: "plan-header",
      step_name: "Plan Header",
      execution_order: 0,
      parallel_group: null,
      branch_key: null,
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "pt-planner",
      output_type: "header_context",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "seed_prompt", document_key: "seed_prompt", required: true }],
      inputs_relevance: [],
      outputs_required: {
        header_context_artifact: {
          type: 'header_context',
          document_key: 'header_context',
          artifact_class: 'header_context',
          file_type: 'json',
        },
      },
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
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-a",
      output_type: "feature_spec",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "document", stage_slug: "thesis", document_key: "business_case", required: true }],
      inputs_relevance: [{ document_key: "business_case", type: "document", relevance: 1.0, stage_slug: "thesis" }],
      outputs_required: {
        documents: [
          {
            document_key: "feature_spec",
            template_filename: "synthesis_feature_spec.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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
  // All steps should appear in the DTO - frontend needs all steps (including PLAN with header_context) to track progress
  // Sorted: plan_header (order 0), step-a (order 1), then step-b (order 2)
  assertEquals(payload.steps.length, 3);
  assertEquals(payload.steps[0].step_key, 'plan_header');
  assertEquals(payload.steps[0].output_type, 'header_context');
  assertEquals(payload.steps[0].job_type, 'PLAN');
  assertEquals(payload.steps[1].step_key, 'a_key');
  assertEquals(payload.steps[1].output_type, 'feature_spec');
  assertEquals(payload.steps[1].parallel_group, 1);
  assertEquals(payload.steps[1].branch_key, BranchKey.feature_spec);
  assertEquals(payload.steps[2].step_key, 'b_key');
  assertEquals(payload.steps[2].output_type, 'business_case');
  assertEquals(payload.steps[2].parallel_group, 2);
  assertEquals(payload.steps[2].branch_key, BranchKey.business_case);
  assertExists(payload.edges);
  assertEquals(Array.isArray(payload.edges), true);
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
      output_type: "business_case",
      granularity_strategy: "per_source_document",
      // Malformed: inputs_required should be an array
      inputs_required: null,
      inputs_relevance: [],
      outputs_required: null,
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

Deno.test("getStageRecipe - accepts renderable ModelContributionFileType 'business_case' for EXECUTE job", async () => {
  const stageSlug = "thesis";
  const instanceId = "instance-business-case";

  const rawSteps = [
    {
      id: "step-business-case",
      instance_id: instanceId,
      step_key: "thesis_generate_business_case",
      step_slug: "generate-business-case",
      step_name: "Generate Business Case",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-business-case",
      output_type: "business_case",
      granularity_strategy: "per_source_document",
      inputs_required: [{ type: "header_context", slug: "thesis", document_key: "header_context", required: true }],
      inputs_relevance: [{ document_key: "header_context", relevance: 1.0 }],
      outputs_required: {
        documents: [
          {
            document_key: "business_case",
            template_filename: "thesis_business_case.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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
  assertEquals(result.data.steps.length, 1);
  assertEquals(result.data.steps[0].output_type, "business_case");
});

Deno.test("getStageRecipe - accepts renderable ModelContributionFileType 'feature_spec' for EXECUTE job", async () => {
  const stageSlug = "thesis";
  const instanceId = "instance-feature-spec";

  const rawSteps = [
    {
      id: "step-feature-spec",
      instance_id: instanceId,
      step_key: "thesis_generate_feature_spec",
      step_slug: "generate-feature-spec",
      step_name: "Generate Feature Spec",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-feature-spec",
      output_type: "feature_spec",
      granularity_strategy: "per_source_document",
      inputs_required: [{ type: "header_context", slug: "thesis", document_key: "header_context", required: true }],
      inputs_relevance: [{ document_key: "header_context", relevance: 1.0 }],
      outputs_required: {
        documents: [
          {
            document_key: "feature_spec",
            template_filename: "thesis_feature_spec.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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
  assertEquals(result.data.steps.length, 1);
  assertEquals(result.data.steps[0].output_type, "feature_spec");
});

Deno.test("getStageRecipe - includes PLAN job step with 'header_context' output_type in DTO for frontend tracking", async () => {
  const stageSlug = "thesis";
  const instanceId = "instance-header-context";

  const rawSteps = [
    {
      id: "step-header-context",
      instance_id: instanceId,
      step_key: "thesis_build_stage_header",
      step_slug: "build-stage-header",
      step_name: "Build Stage Header",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "pt-planner",
      output_type: "header_context",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "seed_prompt", document_key: "seed_prompt", required: true }],
      inputs_relevance: [],
      outputs_required: {
        header_context_artifact: {
          type: 'header_context',
          document_key: 'header_context',
          artifact_class: 'header_context',
          file_type: 'json',
        },
      },
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
  // All steps should appear in frontend DTO - frontend needs PLAN steps with header_context to track progress
  assertEquals(result.data.steps.length, 1);
  assertEquals(result.data.steps[0].step_key, "thesis_build_stage_header");
  assertEquals(result.data.steps[0].output_type, "header_context");
  assertEquals(result.data.steps[0].job_type, "PLAN");
});

Deno.test("getStageRecipe - rejects invalid 'rendered_document' output_type (not a ModelContributionFileType)", async () => {
  const stageSlug = "thesis";
  const instanceId = "instance-rendered-doc";

  const rawSteps = [
    {
      id: "step-rendered-doc",
      instance_id: instanceId,
      step_key: "thesis_generate_doc",
      step_slug: "generate-doc",
      step_name: "Generate Document",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-doc",
      output_type: "rendered_document",
      granularity_strategy: "per_source_document",
      inputs_required: [{ type: "header_context", slug: "thesis", document_key: "header_context", required: true }],
      inputs_relevance: [{ document_key: "header_context", relevance: 1.0 }],
      outputs_required: {
        documents: [
          {
            document_key: "business_case",
            template_filename: "thesis_business_case.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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

  assertEquals(result.status, 500);
  assertExists(result.error);
  // Error should indicate that output_type is not a valid ModelContributionFileType
});

Deno.test("getStageRecipe - filters out EXECUTE step with backend-only 'assembled_document_json' output_type", async () => {
  const stageSlug = "synthesis";
  const instanceId = "instance-assembled-doc";

  const rawSteps = [
    {
      id: "step-assembled-doc",
      instance_id: instanceId,
      step_key: "synthesis_pairwise_business_case",
      step_slug: "pairwise-synthesis-business-case",
      step_name: "Pairwise Synthesis – Business Case",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-pairwise",
      output_type: "assembled_document_json",
      granularity_strategy: "per_source_document",
      inputs_required: [
        { type: "header_context", slug: "synthesis", document_key: "header_context_pairwise", required: true },
        { type: "document", slug: "thesis", document_key: "business_case", required: true },
        { type: "document", slug: "antithesis", document_key: "business_case_critique", required: true },
      ],
      inputs_relevance: [
        { document_key: "header_context_pairwise", relevance: 1.0 },
        { document_key: "business_case", relevance: 1.0 },
        { document_key: "business_case_critique", relevance: 0.95 },
      ],
      outputs_required: {
        documents: [
          {
            document_key: "synthesis_pairwise_business_case",
            template_filename: "synthesis_pairwise_business_case.json",
            artifact_class: "assembled_document_json",
            file_type: "json",
          },
        ],
      },
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
      id: "step-renderable",
      instance_id: instanceId,
      step_key: "synthesis_render_product_requirements",
      step_slug: "render-product-requirements",
      step_name: "Render Product Requirements",
      execution_order: 2,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-render",
      output_type: "product_requirements",
      granularity_strategy: "all_to_one",
      inputs_required: [
        { type: "header_context", slug: "synthesis", document_key: "header_context", required: true },
        { type: "document", slug: "synthesis", document_key: "synthesis_document_business_case", required: true },
      ],
      inputs_relevance: [
        { document_key: "header_context", relevance: 1.0 },
        { document_key: "synthesis_document_business_case", relevance: 1.0 },
      ],
      outputs_required: {
        documents: [
          {
            document_key: "product_requirements",
            template_filename: "product_requirements.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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
  // Backend-only EXECUTE step with 'assembled_document_json' should be filtered out
  // Only the renderable step with 'product_requirements' should appear in the DTO
  assertEquals(result.data.steps.length, 1);
  assertEquals(result.data.steps[0].step_key, "synthesis_render_product_requirements");
  assertEquals(result.data.steps[0].output_type, "product_requirements");
});

Deno.test("getStageRecipe - successful response includes edges array with correct from_step_id and to_step_id", async () => {
  const stageSlug = "synthesis";
  const instanceId = "instance-with-edges";
  const stepIdA = "step-a-id";
  const stepIdB = "step-b-id";
  const rawSteps = [
    {
      id: stepIdA,
      instance_id: instanceId,
      step_key: "plan_header",
      step_slug: "plan-header",
      step_name: "Plan Header",
      execution_order: 0,
      parallel_group: null,
      branch_key: null,
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "pt-planner",
      output_type: "header_context",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "seed_prompt", document_key: "seed_prompt", required: true }],
      inputs_relevance: [],
      outputs_required: {
        header_context_artifact: {
          type: "header_context",
          document_key: "header_context",
          artifact_class: "header_context",
          file_type: "json",
        },
      },
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
      id: stepIdB,
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a-slug",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-a",
      output_type: "feature_spec",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "document", stage_slug: "thesis", document_key: "business_case", required: true }],
      inputs_relevance: [{ document_key: "business_case", type: "document", relevance: 1.0, stage_slug: "thesis" }],
      outputs_required: {
        documents: [
          {
            document_key: "feature_spec",
            template_filename: "synthesis_feature_spec.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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
  const rawEdges = [
    { from_step_id: stepIdA, to_step_id: stepIdB },
  ];
  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_stages: {
        select: {
          data: [{ id: "stage-id", slug: stageSlug, active_recipe_instance_id: instanceId }],
          error: null,
        },
      },
      dialectic_stage_recipe_steps: {
        select: { data: rawSteps, error: null },
      },
      dialectic_stage_recipe_edges: {
        select: { data: rawEdges, error: null },
      },
    },
  });
  const result = await getStageRecipe({ stageSlug }, mockSupabase.client as unknown as SupabaseClient<Database>);
  assertEquals(result.status, 200);
  assertExists(result.data);
  assertExists(result.data.edges);
  assertEquals(result.data.edges.length, 1);
  assertEquals(result.data.edges[0].from_step_id, stepIdA);
  assertEquals(result.data.edges[0].to_step_id, stepIdB);
});

Deno.test("getStageRecipe - when no edges exist for the instance edges is empty array", async () => {
  const stageSlug = "thesis";
  const instanceId = "instance-no-edges";
  const rawSteps = [
    {
      id: "step-only",
      instance_id: instanceId,
      step_key: "thesis_generate_business_case",
      step_slug: "generate-business-case",
      step_name: "Generate Business Case",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: "pt-business-case",
      output_type: "business_case",
      granularity_strategy: "per_source_document",
      inputs_required: [{ type: "header_context", slug: "thesis", document_key: "header_context", required: true }],
      inputs_relevance: [{ document_key: "header_context", relevance: 1.0 }],
      outputs_required: {
        documents: [
          {
            document_key: "business_case",
            template_filename: "thesis_business_case.md",
            artifact_class: "rendered_document",
            file_type: "markdown",
          },
        ],
      },
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
      dialectic_stages: {
        select: {
          data: [{ id: "stage-id", slug: stageSlug, active_recipe_instance_id: instanceId }],
          error: null,
        },
      },
      dialectic_stage_recipe_steps: {
        select: { data: rawSteps, error: null },
      },
      dialectic_stage_recipe_edges: {
        select: { data: [], error: null },
      },
    },
  });
  const result = await getStageRecipe({ stageSlug }, mockSupabase.client as unknown as SupabaseClient<Database>);
  assertEquals(result.status, 200);
  assertExists(result.data);
  assertExists(result.data.edges);
  assertEquals(Array.isArray(result.data.edges), true);
  assertEquals(result.data.edges.length, 0);
});

Deno.test("getStageRecipe - edge rows with missing or invalid from_step_id or to_step_id are filtered out", async () => {
  const stageSlug = "synthesis";
  const instanceId = "instance-filter-edges";
  const stepIdValid = "step-valid-id";
  const rawSteps = [
    {
      id: stepIdValid,
      instance_id: instanceId,
      step_key: "plan_header",
      step_slug: "plan-header",
      step_name: "Plan Header",
      execution_order: 0,
      parallel_group: null,
      branch_key: null,
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "pt-planner",
      output_type: "header_context",
      granularity_strategy: "all_to_one",
      inputs_required: [{ type: "seed_prompt", document_key: "seed_prompt", required: true }],
      inputs_relevance: [],
      outputs_required: {
        header_context_artifact: {
          type: "header_context",
          document_key: "header_context",
          artifact_class: "header_context",
          file_type: "json",
        },
      },
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
  const rawEdges = [
    { from_step_id: stepIdValid, to_step_id: "step-other-valid" },
    { from_step_id: "", to_step_id: "step-other" },
    { from_step_id: "step-from", to_step_id: "" },
  ];
  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_stages: {
        select: {
          data: [{ id: "stage-id", slug: stageSlug, active_recipe_instance_id: instanceId }],
          error: null,
        },
      },
      dialectic_stage_recipe_steps: {
        select: { data: rawSteps, error: null },
      },
      dialectic_stage_recipe_edges: {
        select: { data: rawEdges, error: null },
      },
    },
  });
  const result = await getStageRecipe({ stageSlug }, mockSupabase.client as unknown as SupabaseClient<Database>);
  assertEquals(result.status, 200);
  assertExists(result.data);
  assertExists(result.data.edges);
  const validEdges = result.data.edges.filter(
    (e) => typeof e.from_step_id === "string" && e.from_step_id.trim() !== "" && typeof e.to_step_id === "string" && e.to_step_id.trim() !== ""
  );
  assertEquals(validEdges.length, 1);
  assertEquals(validEdges[0].from_step_id, stepIdValid);
  assertEquals(validEdges[0].to_step_id, "step-other-valid");
});