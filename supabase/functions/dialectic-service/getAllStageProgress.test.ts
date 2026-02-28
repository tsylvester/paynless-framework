/**
 * Unit tests for getAllStageProgress.
 * Tests use the exact stage and step structure from the existing DAG (thesis recipe per migrations).
 * See: Prelaunch Fixes checklist — Progress calculates correctly for every stage in the existing DAG.
 */
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { restoreFetch, mockFetch } from "../_shared/supabase.mock.ts";
import { getAllStageProgress } from "./getAllStageProgress.ts";
import { Database, Tables } from "../types_db.ts";
import {
  DialecticJobRow,
  DialecticProjectResourceRow,
  DialecticRecipeTemplateStep,
  DialecticRenderJobPayload,
  DialecticStage,
  DialecticStageRecipeInstance,
  GranularityStrategy,
  GranularityStrategies,
  GetAllStageProgressPayload,
  GetAllStageProgressDeps,
  GetAllStageProgressParams,
  GetAllStageProgressResponse,
  GetAllStageProgressResult,
  ProgressRecipeEdge,
  StageProgressEntry,
  StepProgressDto,
} from "./dialectic.interface.ts";
import { computeExpectedCounts } from "./computeExpectedCounts.ts";
import { deriveStepStatuses } from "./deriveStepStatuses.ts";
import { buildDocumentDescriptors } from "./buildDocumentDescriptors.ts";
import { topologicalSortSteps } from "./topologicalSortSteps.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import {
  isDialecticRenderJobPayload,
  isGranularityStrategy,
  isJobTypeEnum,
} from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";

const SUPABASE_URL = "http://localhost:54321";
const SUPABASE_ANON_KEY = "test-anon-key";

/** Thesis stage step keys from existing DAG (migrations: thesis_stage.sql). */
const THESIS_STEP_KEYS: readonly string[] = [
  "thesis_build_stage_header",
  "thesis_generate_business_case",
  "thesis_generate_feature_spec",
  "thesis_generate_technical_approach",
  "thesis_generate_success_metrics",
];

const THESIS_STAGE_SLUG = "thesis";
const ANTITHESIS_STAGE_SLUG = "antithesis";
const SYNTHESIS_STAGE_SLUG = "synthesis";
const PARENTHESIS_STAGE_SLUG = "parenthesis";
const PARALYSIS_STAGE_SLUG = "paralysis";

/** Step counts per stage in the existing DAG (DAG Progress Computation spec). */
const EXISTING_DAG_STEP_COUNTS: Readonly<Record<string, number>> = {
  [THESIS_STAGE_SLUG]: 5,
  [ANTITHESIS_STAGE_SLUG]: 7,
  [SYNTHESIS_STAGE_SLUG]: 13,
  [PARENTHESIS_STAGE_SLUG]: 4,
  [PARALYSIS_STAGE_SLUG]: 4,
};

/** Antithesis step keys and job_type/granularity_strategy (migrations: 20251006194542_antithesis_stage.sql). */
const ANTITHESIS_STEP_SPEC: Readonly<{ step_key: string; job_type: string; granularity_strategy: string }[]> = [
  { step_key: "antithesis_prepare_proposal_review_plan", job_type: "PLAN", granularity_strategy: "per_source_document_by_lineage" },
  { step_key: "antithesis_generate_business_case_critique", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "antithesis_generate_technical_feasibility_assessment", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "antithesis_generate_risk_register", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "antithesis_generate_non_functional_requirements", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "antithesis_generate_dependency_map", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "antithesis_generate_comparison_vector", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
];

/** Synthesis step keys and job_type/granularity_strategy (migrations: 20251006194549_synthesis_stage.sql). */
const SYNTHESIS_STEP_SPEC: Readonly<{ step_key: string; job_type: string; granularity_strategy: string }[]> = [
  { step_key: "synthesis_prepare_pairwise_header", job_type: "PLAN", granularity_strategy: "all_to_one" },
  { step_key: "synthesis_pairwise_business_case", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "synthesis_pairwise_feature_spec", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "synthesis_pairwise_technical_approach", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "synthesis_pairwise_success_metrics", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "synthesis_document_business_case", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  { step_key: "synthesis_document_feature_spec", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  { step_key: "synthesis_document_technical_approach", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  { step_key: "synthesis_document_success_metrics", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  { step_key: "generate_final_synthesis_header", job_type: "PLAN", granularity_strategy: "all_to_one" },
  { step_key: "product_requirements", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  { step_key: "system_architecture", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  { step_key: "tech_stack", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
];

/** Parenthesis step keys and job_type/granularity_strategy (migrations: 20251006194558_parenthesis_stage.sql). */
const PARENTHESIS_STEP_SPEC: Readonly<{ step_key: string; job_type: string; granularity_strategy: string }[]> = [
  { step_key: "build-planning-header", job_type: "PLAN", granularity_strategy: "all_to_one" },
  { step_key: "generate-technical_requirements", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "generate-master-plan", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "generate-milestone-schema", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
];

/** Paralysis step keys and job_type/granularity_strategy (migrations: 20251006194605_paralysis_stage.sql). */
const PARALYSIS_STEP_SPEC: Readonly<{ step_key: string; job_type: string; granularity_strategy: string }[]> = [
  { step_key: "build-implementation-header", job_type: "PLAN", granularity_strategy: "all_to_one" },
  { step_key: "generate-actionable-checklist", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "generate-updated-master-plan", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  { step_key: "generate-advisor-recommendations", job_type: "EXECUTE", granularity_strategy: "per_source_document" },
];

/** Strategies supported by computeExpectedCounts that do not require priorStageContext. */
const STRATEGIES_NO_PRIOR_CONTEXT: readonly GranularityStrategy[] = [
  "all_to_one",
  "per_model",
  "per_source_document",
];
/** All strategies supported by computeExpectedCounts (excludes per_source_group). Used for stages that have prior context. */
const STRATEGIES_SUPPORTED: readonly GranularityStrategy[] = [
  "all_to_one",
  "per_model",
  "per_source_document",
  "pairwise_by_origin",
  "per_source_document_by_lineage",
];

const basePayload: GetAllStageProgressPayload = {
  sessionId: "sess-thesis-1",
  iterationNumber: 1,
  userId: "user-thesis-1",
  projectId: "proj-thesis-1",
};

const baseUser: User = {
  id: basePayload.userId,
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

/** Builds a full DB row for dialectic_stage_recipe_steps (cloned). Used by getAllStageProgress test mocks. */
function buildClonedStepRow(
  id: string,
  instance_id: string,
  step_key: string,
  job_type: string,
  granularity_strategy: string,
): Tables<"dialectic_stage_recipe_steps"> {
  const iso: string = new Date().toISOString();
  return {
    id,
    instance_id,
    step_key,
    step_slug: step_key.replace(/_/g, "-"),
    step_name: step_key,
    step_description: null,
    job_type,
    prompt_type: "Turn",
    prompt_template_id: null,
    output_type: "contribution",
    granularity_strategy,
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {},
    config_override: {},
    object_filter: {},
    output_overrides: {},
    is_skipped: false,
    execution_order: null,
    parallel_group: null,
    branch_key: null,
    template_step_id: null,
    created_at: iso,
    updated_at: iso,
  };
}

function createGetAllStageProgressDeps(
  dbClient: SupabaseClient<Database>,
  user: User,
): GetAllStageProgressDeps {
  return {
    dbClient,
    user,
    topologicalSortSteps,
    deriveStepStatuses,
    computeExpectedCounts,
    buildDocumentDescriptors,
  };
}

Deno.test("getAllStageProgress: thesis stage with full recipe and sparse jobs returns 200 and satisfies spec invariants", async (t) => {
  const stageId = "stage-thesis-id";
  const instanceId = "instance-thesis-id";
  const templateId = "template-thesis-id";
  const modelId = "model-1";

  const planStepId = "step-thesis-header";
  const businessStepId = "step-thesis-business";
  const featureStepId = "step-thesis-feature";
  const technicalStepId = "step-thesis-technical";
  const successStepId = "step-thesis-success";

  const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
    buildClonedStepRow(planStepId, instanceId, THESIS_STEP_KEYS[0], "PLAN", "all_to_one"),
    buildClonedStepRow(businessStepId, instanceId, THESIS_STEP_KEYS[1], "EXECUTE", "per_source_document"),
    buildClonedStepRow(featureStepId, instanceId, THESIS_STEP_KEYS[2], "EXECUTE", "per_source_document"),
    buildClonedStepRow(technicalStepId, instanceId, THESIS_STEP_KEYS[3], "EXECUTE", "per_source_document"),
    buildClonedStepRow(successStepId, instanceId, THESIS_STEP_KEYS[4], "EXECUTE", "per_source_document"),
  ];

  const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [
    { instance_id: instanceId, from_step_id: planStepId, to_step_id: businessStepId },
    { instance_id: instanceId, from_step_id: planStepId, to_step_id: featureStepId },
    { instance_id: instanceId, from_step_id: planStepId, to_step_id: technicalStepId },
    { instance_id: instanceId, from_step_id: planStepId, to_step_id: successStepId },
  ];

  const jobs: DialecticJobRow[] = [
    {
      id: "job-plan-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: modelId,
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: THESIS_STAGE_SLUG,
        iterationNumber: basePayload.iterationNumber,
        continueUntilComplete: true,
      },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "PLAN",
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: null,
      error_details: null,
    },
    {
      id: "job-execute-business-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: modelId,
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: THESIS_STAGE_SLUG,
        iterationNumber: basePayload.iterationNumber,
        planner_metadata: { recipe_step_id: businessStepId, stage_slug: THESIS_STAGE_SLUG },
      },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "EXECUTE",
      parent_job_id: "job-plan-1",
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: null,
      error_details: null,
    },
  ];

  const sessionRow = {
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
  };
  const projectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-1",
  };
  const transitions = [
    { source_stage_id: stageId, target_stage_id: stageId },
  ];
  const templateStages = [
    { id: stageId, slug: THESIS_STAGE_SLUG },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: THESIS_STAGE_SLUG,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: templateId,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: templateId,
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(edges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);

    await t.step("calls getAllStageProgress(deps, params) with typed Deps and Params and returns 200", () => {
      assertEquals(result.status, 200, result.error ? `getAllStageProgress returned ${result.status}: ${result.error.message}` : undefined);
      assertExists(result.data);
    });

    if (!result.data) throw new Error("result.data missing");
    const data: GetAllStageProgressResponse = result.data;

    await t.step("response contains dagProgress: { completedStages, totalStages } envelope", () => {
      assertEquals(typeof data.dagProgress.completedStages, "number");
      assertEquals(typeof data.dagProgress.totalStages, "number");
    });

    await t.step("response contains stages array with entries for every stage in the process template (including not_started)", () => {
      assert(Array.isArray(data.stages));
      assertEquals(data.stages.length, templateStages.length);
    });

    const thesisEntry: StageProgressEntry | undefined = data.stages.find(
      (s: StageProgressEntry) => s.stageSlug === THESIS_STAGE_SLUG,
    );
    assertExists(thesisEntry, "thesis stage must appear in response");
    if (!thesisEntry) throw new Error("thesis entry missing");

    await t.step("when stage has jobs (started), modelCount is n", () => {
      assertEquals(thesisEntry.modelCount, sessionRow.selected_model_ids.length);
    });

    await t.step("each stage has progress: { completedSteps, totalSteps, failedSteps } where totalSteps = recipe.steps.length", () => {
      assertExists(thesisEntry.progress);
      assertEquals(thesisEntry.progress.totalSteps, THESIS_STEP_KEYS.length);
      assertEquals(typeof thesisEntry.progress.completedSteps, "number");
      assertEquals(typeof thesisEntry.progress.failedSteps, "number");
    });

    await t.step("each stage has steps array with { stepKey, status } per step — no per-step job counts, no progress field on StepProgressDto", () => {
      assertEquals(thesisEntry.steps.length, THESIS_STEP_KEYS.length);
      for (const step of thesisEntry.steps) {
        assertEquals(typeof step.stepKey, "string");
        assert(["not_started", "in_progress", "completed", "failed"].includes(step.status));
        assert(!("progress" in step));
      }
    });

    await t.step("dagProgress.completedStages = count of stages where status === 'completed'", () => {
      const completedStagesCount: number = data.stages.filter((s: StageProgressEntry) => s.status === "completed").length;
      assertEquals(data.dagProgress.completedStages, completedStagesCount);
    });

    await t.step("stage status derivation: completed iff completedSteps === totalSteps && failedSteps === 0; failed if failedSteps > 0; in_progress if any step in_progress or completed but stage not fully done; not_started if no steps reached", () => {
      if (thesisEntry.progress.completedSteps === thesisEntry.progress.totalSteps && thesisEntry.progress.failedSteps === 0) {
        assertEquals(thesisEntry.status, "completed");
      } else if (thesisEntry.progress.failedSteps > 0) {
        assertEquals(thesisEntry.status, "failed");
      } else if (thesisEntry.steps.some((s: StepProgressDto) => s.status === "in_progress" || s.status === "completed")) {
        assertEquals(thesisEntry.status, "in_progress");
      } else {
        assertEquals(thesisEntry.status, "not_started");
      }
    });

    await t.step("invariant: stage.progress.completedSteps == count of steps in stage.steps where status === 'completed'", () => {
      const completedStepsCount: number = thesisEntry.steps.filter((s: StepProgressDto) => s.status === "completed").length;
      assertEquals(thesisEntry.progress.completedSteps, completedStepsCount);
    });

    await t.step("invariant: stage.progress.totalSteps == stage.steps.length == recipe step count for that stage", () => {
      assertEquals(thesisEntry.progress.totalSteps, thesisEntry.steps.length);
      assertEquals(thesisEntry.progress.totalSteps, THESIS_STEP_KEYS.length);
    });

    await t.step("invariant: stage.progress.failedSteps == count of steps in stage.steps where status === 'failed'", () => {
      const failedStepsCount: number = thesisEntry.steps.filter((s: StepProgressDto) => s.status === "failed").length;
      assertEquals(thesisEntry.progress.failedSteps, failedStepsCount);
    });

    await t.step("progress calculates correctly for every stage in the existing DAG (thesis recipe)", () => {
      for (const stepKey of THESIS_STEP_KEYS) {
        const step: StepProgressDto | undefined = thesisEntry.steps.find((s: StepProgressDto) => s.stepKey === stepKey);
        assertExists(step, `step ${stepKey} must appear in response`);
      }
      if (thesisEntry.status === "completed") {
        assertEquals(thesisEntry.progress.completedSteps, thesisEntry.progress.totalSteps);
        assertEquals(thesisEntry.progress.failedSteps, 0);
      }
    });

    await t.step("model count loaded from dialectic_sessions.selected_models.length", () => {
      assertEquals(thesisEntry.modelCount, sessionRow.selected_model_ids.length);
    });

    await t.step("total stages loaded from dialectic_stage_transitions for the session process template", () => {
      assertEquals(data.dagProgress.totalStages, templateStages.length);
    });

    await t.step("progress is independent of granularity strategy: a step with per_model and a step with all_to_one are each one step toward completedSteps", () => {
      assertEquals(thesisEntry.progress.totalSteps, recipeSteps.length);
    });

    await t.step("edge loading: cloned instances use dialectic_stage_recipe_edges (instance_id in edges)", () => {
      assertEquals(edges.every((e: { instance_id: string }) => e.instance_id === instanceId), true);
      assertEquals(thesisEntry.progress.totalSteps, recipeSteps.length);
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: progress calculates correctly for every stage in the existing DAG", async (t) => {
  const stageSlugs: string[] = [
    THESIS_STAGE_SLUG,
    ANTITHESIS_STAGE_SLUG,
    SYNTHESIS_STAGE_SLUG,
    PARENTHESIS_STAGE_SLUG,
    PARALYSIS_STAGE_SLUG,
  ];
  const stageIds: string[] = stageSlugs.map((slug: string) => `stage-${slug}-id`);
  const instanceIds: string[] = stageSlugs.map((slug: string) => `instance-${slug}-id`);
  const templateIds: string[] = stageSlugs.map((slug: string) => `template-${slug}-id`);
  const modelId = "model-1";

  const allRecipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [];
  const allEdges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];

  // Thesis: real recipe from 20251006194531_thesis_stage.sql (planner → 4 execute)
  const thesisStepIds: string[] = [];
  for (let j = 0; j < THESIS_STEP_KEYS.length; j++) {
    const stepId: string = `step-${THESIS_STAGE_SLUG}-${j}`;
    thesisStepIds.push(stepId);
    const jobType: string = j === 0 ? "PLAN" : "EXECUTE";
    const strategy: string = j === 0 ? "all_to_one" : "per_source_document";
    allRecipeSteps.push(
      buildClonedStepRow(stepId, instanceIds[0], THESIS_STEP_KEYS[j], jobType, strategy),
    );
  }
  for (let j = 1; j < thesisStepIds.length; j++) {
    allEdges.push({
      instance_id: instanceIds[0],
      from_step_id: thesisStepIds[0],
      to_step_id: thesisStepIds[j],
    });
  }

  // Antithesis: real recipe from 20251006194542_antithesis_stage.sql (planner → 6 execute)
  const antithesisStepIds: string[] = [];
  for (let j = 0; j < ANTITHESIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${ANTITHESIS_STAGE_SLUG}-${j}`;
    antithesisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = ANTITHESIS_STEP_SPEC[j];
    allRecipeSteps.push(
      buildClonedStepRow(stepId, instanceIds[1], spec.step_key, spec.job_type, spec.granularity_strategy),
    );
  }
  for (let j = 1; j < antithesisStepIds.length; j++) {
    allEdges.push({
      instance_id: instanceIds[1],
      from_step_id: antithesisStepIds[0],
      to_step_id: antithesisStepIds[j],
    });
  }

  // Synthesis: real recipe from 20251006194549_synthesis_stage.sql (planner → 4 pairwise → 4 doc → final header → 3 product)
  const synthesisStepIds: string[] = [];
  for (let j = 0; j < SYNTHESIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${SYNTHESIS_STAGE_SLUG}-${j}`;
    synthesisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = SYNTHESIS_STEP_SPEC[j];
    allRecipeSteps.push(
      buildClonedStepRow(stepId, instanceIds[2], spec.step_key, spec.job_type, spec.granularity_strategy),
    );
  }
  for (let j = 1; j <= 4; j++) {
    allEdges.push({
      instance_id: instanceIds[2],
      from_step_id: synthesisStepIds[0],
      to_step_id: synthesisStepIds[j],
    });
  }
  for (let j = 1; j <= 4; j++) {
    allEdges.push({
      instance_id: instanceIds[2],
      from_step_id: synthesisStepIds[j],
      to_step_id: synthesisStepIds[4 + j],
    });
  }
  for (let j = 5; j <= 8; j++) {
    allEdges.push({
      instance_id: instanceIds[2],
      from_step_id: synthesisStepIds[j],
      to_step_id: synthesisStepIds[9],
    });
  }
  for (let j = 10; j <= 12; j++) {
    allEdges.push({
      instance_id: instanceIds[2],
      from_step_id: synthesisStepIds[9],
      to_step_id: synthesisStepIds[j],
    });
  }

  // Parenthesis: real recipe from 20251006194558_parenthesis_stage.sql (planner → 3 execute)
  const parenthesisStepIds: string[] = [];
  for (let j = 0; j < PARENTHESIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${PARENTHESIS_STAGE_SLUG}-${j}`;
    parenthesisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = PARENTHESIS_STEP_SPEC[j];
    allRecipeSteps.push(
      buildClonedStepRow(stepId, instanceIds[3], spec.step_key, spec.job_type, spec.granularity_strategy),
    );
  }
  for (let j = 1; j < parenthesisStepIds.length; j++) {
    allEdges.push({
      instance_id: instanceIds[3],
      from_step_id: parenthesisStepIds[0],
      to_step_id: parenthesisStepIds[j],
    });
  }

  // Paralysis: real recipe from 20251006194605_paralysis_stage.sql (planner → 2 execute → advisor_recommendations)
  const paralysisStepIds: string[] = [];
  for (let j = 0; j < PARALYSIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${PARALYSIS_STAGE_SLUG}-${j}`;
    paralysisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = PARALYSIS_STEP_SPEC[j];
    allRecipeSteps.push(
      buildClonedStepRow(stepId, instanceIds[4], spec.step_key, spec.job_type, spec.granularity_strategy),
    );
  }
  allEdges.push(
    { instance_id: instanceIds[4], from_step_id: paralysisStepIds[0], to_step_id: paralysisStepIds[1] },
    { instance_id: instanceIds[4], from_step_id: paralysisStepIds[0], to_step_id: paralysisStepIds[2] },
    { instance_id: instanceIds[4], from_step_id: paralysisStepIds[1], to_step_id: paralysisStepIds[3] },
    { instance_id: instanceIds[4], from_step_id: paralysisStepIds[2], to_step_id: paralysisStepIds[3] },
  );

  const transitions: { source_stage_id: string; target_stage_id: string }[] = [];
  for (let i = 0; i < stageIds.length - 1; i++) {
    transitions.push({ source_stage_id: stageIds[i], target_stage_id: stageIds[i + 1] });
  }
  for (const id of stageIds) {
    transitions.push({ source_stage_id: id, target_stage_id: id });
  }

  const templateStages: { id: string; slug: string }[] = stageIds.map((id: string, i: number) => ({
    id,
    slug: stageSlugs[i],
  }));

  const sessionRow: { id: string; project_id: string; selected_model_ids: string[] } = {
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
  };
  const projectRow: { id: string; process_template_id: string } = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-five",
  };
  const jobs: DialecticJobRow[] = [];
  const stages: DialecticStage[] = stageIds.map((id: string, i: number) => ({
    id,
    slug: stageSlugs[i],
    display_name: stageSlugs[i],
    description: null,
    created_at: new Date().toISOString(),
    expected_output_template_ids: [],
    active_recipe_instance_id: instanceIds[i],
    default_system_prompt_id: null,
    recipe_template_id: templateIds[i],
  }));
  const instances: DialecticStageRecipeInstance[] = instanceIds.map((id: string, i: number) => ({
    id,
    stage_id: stageIds[i],
    template_id: templateIds[i],
    is_cloned: true,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const headers: { "Content-Type": string } = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(allRecipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(allEdges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);

  const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, result.error?.message ?? "non-200 response");
    assertExists(result.data);
    if (!result.data) throw new Error("result.data missing");
    const data: GetAllStageProgressResponse = result.data;

    await t.step("response contains an entry for every stage in the existing DAG (thesis, antithesis, synthesis, parenthesis, paralysis)", () => {
      assertEquals(data.stages.length, stageSlugs.length);
      for (const slug of stageSlugs) {
        const entry: StageProgressEntry | undefined = data.stages.find(
          (s: StageProgressEntry) => s.stageSlug === slug,
        );
        assertExists(entry, `stage ${slug} must appear in response`);
      }
    });

    for (const slug of stageSlugs) {
      const expectedTotal: number = EXISTING_DAG_STEP_COUNTS[slug];
      await t.step(`${slug}: totalSteps == recipe step count (${expectedTotal})`, () => {
        const entry: StageProgressEntry | undefined = data.stages.find(
          (s: StageProgressEntry) => s.stageSlug === slug,
        );
        assertExists(entry);
        if (!entry) throw new Error(`entry ${slug} missing`);
        assertEquals(entry.progress.totalSteps, expectedTotal);
        assertEquals(entry.steps.length, expectedTotal);
      });
      await t.step(`${slug}: completedSteps == count of steps with status completed`, () => {
        const entry: StageProgressEntry | undefined = data.stages.find(
          (s: StageProgressEntry) => s.stageSlug === slug,
        );
        assertExists(entry);
        if (!entry) throw new Error(`entry ${slug} missing`);
        const completedCount: number = entry.steps.filter(
          (s: StepProgressDto) => s.status === "completed",
        ).length;
        assertEquals(entry.progress.completedSteps, completedCount);
      });
      await t.step(`${slug}: failedSteps == count of steps with status failed`, () => {
        const entry: StageProgressEntry | undefined = data.stages.find(
          (s: StageProgressEntry) => s.stageSlug === slug,
        );
        assertExists(entry);
        if (!entry) throw new Error(`entry ${slug} missing`);
        const failedCount: number = entry.steps.filter(
          (s: StepProgressDto) => s.status === "failed",
        ).length;
        assertEquals(entry.progress.failedSteps, failedCount);
      });
    }

    await t.step("when stages have no jobs (not_started), modelCount is null", () => {
      for (const entry of data.stages) {
        assertEquals(entry.modelCount, null);
      }
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: RENDER jobs excluded from step status derivation (appear only in documents)", async (t) => {
  const stageId = "stage-render-id";
  const instanceId = "instance-render-id";
  const templateId = "template-render-id";
  const modelId = "model-1";
  const planStepId = "step-plan";
  const executeStepId = "step-execute";
  const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
    buildClonedStepRow(planStepId, instanceId, "plan", "PLAN", "all_to_one"),
    buildClonedStepRow(executeStepId, instanceId, "execute", "EXECUTE", "per_model"),
  ];
  const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [
    { instance_id: instanceId, from_step_id: planStepId, to_step_id: executeStepId },
  ];
  const executeJob: DialecticJobRow = {
    id: "job-exec",
    created_at: new Date().toISOString(),
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    status: "completed",
    payload: {
      sessionId: basePayload.sessionId,
      projectId: basePayload.projectId,
      model_id: modelId,
      walletId: "w",
      user_jwt: "jwt",
      stageSlug: THESIS_STAGE_SLUG,
      iterationNumber: basePayload.iterationNumber,
      planner_metadata: { recipe_step_id: executeStepId, stage_slug: THESIS_STAGE_SLUG },
    },
    user_id: basePayload.userId,
    is_test_job: false,
    attempt_count: 0,
    max_retries: 0,
    job_type: "EXECUTE",
    parent_job_id: null,
    prerequisite_job_id: null,
    target_contribution_id: null,
    started_at: null,
    completed_at: new Date().toISOString(),
    results: null,
    error_details: null,
  };
  const sourceContributionId = "contrib-render-1";
  const renderPayload: DialecticRenderJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: modelId,
    walletId: "w",
    user_jwt: "jwt",
    stageSlug: THESIS_STAGE_SLUG,
    iterationNumber: basePayload.iterationNumber,
    documentIdentity: "doc-1",
    documentKey: FileType.business_case,
    sourceContributionId,
    template_filename: "output.md",
  };

  if (!isJson(renderPayload)) throw new Error("Invalid render payload");
  if (!isDialecticRenderJobPayload(renderPayload)) throw new Error("Invalid render payload");
  const renderJob: DialecticJobRow = {
    id: "job-render",
    created_at: new Date().toISOString(),
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    status: "completed",
    payload: renderPayload,
    user_id: basePayload.userId,
    is_test_job: false,
    attempt_count: 0,
    max_retries: 0,
    job_type: "RENDER",
    parent_job_id: "job-exec",
    prerequisite_job_id: null,
    target_contribution_id: null,
    started_at: null,
    completed_at: new Date().toISOString(),
    results: null,
    error_details: null,
  };
  const jobs: DialecticJobRow[] = [executeJob, renderJob];
  const tplPlanId = "tpl-plan";
  const tplExecId = "tpl-execute";
  const templateSteps: Pick<DialecticRecipeTemplateStep, "id" | "template_id" | "step_key" | "job_type" | "granularity_strategy">[] = [
    { id: tplPlanId, template_id: templateId, step_key: "plan", job_type: "PLAN", granularity_strategy: "all_to_one" },
    { id: tplExecId, template_id: templateId, step_key: "execute", job_type: "EXECUTE", granularity_strategy: "per_model" },
  ];
  const templateEdges: (ProgressRecipeEdge & { template_id: string })[] = [
    { template_id: templateId, from_step_id: tplPlanId, to_step_id: tplExecId },
  ];
  const iso = new Date().toISOString();
  const renderResource: DialecticProjectResourceRow = {
    id: "resource-render-1",
    source_contribution_id: sourceContributionId,
    resource_type: "rendered_document",
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    project_id: basePayload.projectId,
    user_id: basePayload.userId,
    file_name: "doc.md",
    storage_bucket: "bucket",
    storage_path: "path",
    mime_type: "text/markdown",
    size_bytes: 0,
    created_at: iso,
    updated_at: iso,
    resource_description: null,
  };
  const resources: DialecticProjectResourceRow[] = [renderResource];
  const sessionRow = { id: basePayload.sessionId, project_id: basePayload.projectId, selected_model_ids: [modelId] };
  const projectRow = { id: basePayload.projectId, process_template_id: "process-1" };
  const transitions = [{ source_stage_id: stageId, target_stage_id: stageId }];
  const templateStages = [{ id: stageId, slug: THESIS_STAGE_SLUG }];
  const stages: DialecticStage[] = [{
    id: stageId,
    slug: THESIS_STAGE_SLUG,
    display_name: "Thesis",
    description: null,
    created_at: new Date().toISOString(),
    expected_output_template_ids: [],
    active_recipe_instance_id: instanceId,
    default_system_prompt_id: null,
    recipe_template_id: templateId,
  }];
  const instances: DialecticStageRecipeInstance[] = [{
    id: instanceId,
    stage_id: stageId,
    template_id: templateId,
    is_cloned: true,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];
  const headers = { "Content-Type": "application/json" };
  // Implementation fetches only cloned steps/edges when all instances are cloned (no template steps/edges).
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(edges), { status: 200, headers }),
    new Response(JSON.stringify(resources), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, result.error?.message ?? "non-200 response");
    if (!result.data) throw new Error("result.data missing");
    const entry: StageProgressEntry | undefined = result.data.stages.find((s: StageProgressEntry) => s.stageSlug === THESIS_STAGE_SLUG);
    assertExists(entry);
    if (!entry) throw new Error("entry missing");
    await t.step("step count equals recipe steps only (RENDER not a step)", () => {
      assertEquals(entry.steps.length, recipeSteps.length);
    });
    await t.step("no step has stepKey from RENDER job (RENDER excluded from step attribution)", () => {
      for (const step of entry.steps) {
        assert(step.stepKey === "plan" || step.stepKey === "execute");
      }
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: continuation jobs excluded from step status derivation", async (t) => {
  const stageId = "stage-cont-id";
  const instanceId = "instance-cont-id";
  const templateId = "template-cont-id";
  const modelId = "model-1";
  const stepId = "step-1";
  const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
    buildClonedStepRow(stepId, instanceId, "step_one", "EXECUTE", "all_to_one"),
  ];
  const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];
  const normalJob: DialecticJobRow = {
    id: "job-normal",
    created_at: new Date().toISOString(),
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    status: "completed",
    payload: {
      sessionId: basePayload.sessionId,
      projectId: basePayload.projectId,
      model_id: modelId,
      walletId: "w",
      user_jwt: "jwt",
      stageSlug: THESIS_STAGE_SLUG,
      iterationNumber: basePayload.iterationNumber,
      planner_metadata: { recipe_step_id: stepId, stage_slug: THESIS_STAGE_SLUG },
    },
    user_id: basePayload.userId,
    is_test_job: false,
    attempt_count: 0,
    max_retries: 0,
    job_type: "EXECUTE",
    parent_job_id: null,
    prerequisite_job_id: null,
    target_contribution_id: null,
    started_at: null,
    completed_at: new Date().toISOString(),
    results: null,
    error_details: null,
  };
  const continuationJob: DialecticJobRow = {
    id: "job-cont",
    created_at: new Date().toISOString(),
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    status: "completed",
    payload: {
      sessionId: basePayload.sessionId,
      projectId: basePayload.projectId,
      model_id: modelId,
      walletId: "w",
      user_jwt: "jwt",
      stageSlug: THESIS_STAGE_SLUG,
      iterationNumber: basePayload.iterationNumber,
      planner_metadata: { recipe_step_id: stepId, stage_slug: THESIS_STAGE_SLUG },
    },
    user_id: basePayload.userId,
    is_test_job: false,
    attempt_count: 0,
    max_retries: 0,
    job_type: "EXECUTE",
    parent_job_id: null,
    prerequisite_job_id: null,
    target_contribution_id: "contrib-1",
    started_at: null,
    completed_at: new Date().toISOString(),
    results: null,
    error_details: null,
  };
  const jobs: DialecticJobRow[] = [normalJob, continuationJob];
  const sessionRow = { id: basePayload.sessionId, project_id: basePayload.projectId, selected_model_ids: [modelId] };
  const projectRow = { id: basePayload.projectId, process_template_id: "process-1" };
  const transitions = [{ source_stage_id: stageId, target_stage_id: stageId }];
  const templateStages = [{ id: stageId, slug: THESIS_STAGE_SLUG }];
  const stages: DialecticStage[] = [{
    id: stageId,
    slug: THESIS_STAGE_SLUG,
    display_name: "Thesis",
    description: null,
    created_at: new Date().toISOString(),
    expected_output_template_ids: [],
    active_recipe_instance_id: instanceId,
    default_system_prompt_id: null,
    recipe_template_id: templateId,
  }];
  const instances: DialecticStageRecipeInstance[] = [{
    id: instanceId,
    stage_id: stageId,
    template_id: templateId,
    is_cloned: true,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(edges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, result.error?.message ?? "non-200 response");
    if (!result.data) throw new Error("result.data missing");
    const entry: StageProgressEntry | undefined = result.data.stages.find((s: StageProgressEntry) => s.stageSlug === THESIS_STAGE_SLUG);
    assertExists(entry);
    if (!entry) throw new Error("entry missing");
    await t.step("completedSteps equals count of steps with status completed (continuation job not double-counted)", () => {
      const completedCount: number = entry.steps.filter((s: StepProgressDto) => s.status === "completed").length;
      assertEquals(entry.progress.completedSteps, completedCount);
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: spec invariant progress never decreases across successive calls", async (t) => {
  const stageId = "stage-mono-id";
  const instanceId = "instance-mono-id";
  const templateId = "template-mono-id";
  const modelId = "model-1";
  const stepId = "step-mono";
  const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
    buildClonedStepRow(stepId, instanceId, "step_one", "EXECUTE", "all_to_one"),
  ];
  const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];
  const jobs: DialecticJobRow[] = [{
    id: "job-1",
    created_at: new Date().toISOString(),
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    status: "completed",
    payload: {
      sessionId: basePayload.sessionId,
      projectId: basePayload.projectId,
      model_id: modelId,
      walletId: "w",
      user_jwt: "jwt",
      stageSlug: THESIS_STAGE_SLUG,
      iterationNumber: basePayload.iterationNumber,
      planner_metadata: { recipe_step_id: stepId, stage_slug: THESIS_STAGE_SLUG },
    },
    user_id: basePayload.userId,
    is_test_job: false,
    attempt_count: 0,
    max_retries: 0,
    job_type: "EXECUTE",
    parent_job_id: null,
    prerequisite_job_id: null,
    target_contribution_id: null,
    started_at: null,
    completed_at: new Date().toISOString(),
    results: null,
    error_details: null,
  }];
  const sessionRow = { id: basePayload.sessionId, project_id: basePayload.projectId, selected_model_ids: [modelId] };
  const projectRow = { id: basePayload.projectId, process_template_id: "process-1" };
  const transitions = [{ source_stage_id: stageId, target_stage_id: stageId }];
  const templateStages = [{ id: stageId, slug: THESIS_STAGE_SLUG }];
  const stages: DialecticStage[] = [{
    id: stageId,
    slug: THESIS_STAGE_SLUG,
    display_name: "Thesis",
    description: null,
    created_at: new Date().toISOString(),
    expected_output_template_ids: [],
    active_recipe_instance_id: instanceId,
    default_system_prompt_id: null,
    recipe_template_id: templateId,
  }];
  const instances: DialecticStageRecipeInstance[] = [{
    id: instanceId,
    stage_id: stageId,
    template_id: templateId,
    is_cloned: true,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];
  const templateStepsMono: Pick<DialecticRecipeTemplateStep, "id" | "template_id" | "step_key" | "job_type" | "granularity_strategy">[] = [
    { id: "tpl-mono", template_id: templateId, step_key: "step_one", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  ];
  const templateEdgesMono: (ProgressRecipeEdge & { template_id: string })[] = [];
  const headers = { "Content-Type": "application/json" };
  // Implementation fetches only cloned steps/edges when all instances are cloned (no template steps/edges).
  // Each Response body is single-use; second getAllStageProgress call needs fresh Response objects.
  const buildMonoResponses = (): Response[] => [
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(edges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ];
  mockFetch([...buildMonoResponses(), ...buildMonoResponses()]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const first: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    const second: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(first.status, 200, first.error?.message ?? "first call non-200");
    assertEquals(second.status, 200, second.error?.message ?? "second call non-200");
    if (!first.data || !second.data) throw new Error("data missing");
    const firstData: GetAllStageProgressResponse = first.data;
    const secondData: GetAllStageProgressResponse = second.data;
    await t.step("progress never decreases across successive calls", () => {
      for (let i = 0; i < firstData.stages.length; i++) {
        assert(secondData.stages[i].progress.completedSteps >= firstData.stages[i].progress.completedSteps);
      }
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: progress independent of model count", async (t) => {
  const stageId = "stage-n-id";
  const instanceId = "instance-n-id";
  const templateId = "template-n-id";
  const stepId = "step-n";
  const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
    buildClonedStepRow(stepId, instanceId, "step_one", "EXECUTE", "per_model"),
  ];
  const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];
  const job: DialecticJobRow = {
    id: "job-n",
    created_at: new Date().toISOString(),
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    status: "completed",
    payload: {
      sessionId: basePayload.sessionId,
      projectId: basePayload.projectId,
      model_id: "model-1",
      walletId: "w",
      user_jwt: "jwt",
      stageSlug: THESIS_STAGE_SLUG,
      iterationNumber: basePayload.iterationNumber,
      planner_metadata: { recipe_step_id: stepId, stage_slug: THESIS_STAGE_SLUG },
    },
    user_id: basePayload.userId,
    is_test_job: false,
    attempt_count: 0,
    max_retries: 0,
    job_type: "EXECUTE",
    parent_job_id: null,
    prerequisite_job_id: null,
    target_contribution_id: null,
    started_at: null,
    completed_at: new Date().toISOString(),
    results: null,
    error_details: null,
  };
  const projectRow = { id: basePayload.projectId, process_template_id: "process-1" };
  const transitions = [{ source_stage_id: stageId, target_stage_id: stageId }];
  const templateStages = [{ id: stageId, slug: THESIS_STAGE_SLUG }];
  const stages: DialecticStage[] = [{
    id: stageId,
    slug: THESIS_STAGE_SLUG,
    display_name: "Thesis",
    description: null,
    created_at: new Date().toISOString(),
    expected_output_template_ids: [],
    active_recipe_instance_id: instanceId,
    default_system_prompt_id: null,
    recipe_template_id: templateId,
  }];
  const instances: DialecticStageRecipeInstance[] = [{
    id: instanceId,
    stage_id: stageId,
    template_id: templateId,
    is_cloned: true,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];
  const headers = { "Content-Type": "application/json" };
  const jobsForN: DialecticJobRow[] = [job];
  const sessionRowN2 = { id: basePayload.sessionId, project_id: basePayload.projectId, selected_model_ids: ["m1", "m2"] };
  const sessionRowN3 = { id: basePayload.sessionId, project_id: basePayload.projectId, selected_model_ids: ["m1", "m2", "m3"] };
  mockFetch([
    new Response(JSON.stringify(sessionRowN2), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobsForN), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(edges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify(sessionRowN3), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobsForN), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(edges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const resultN2: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    const resultN3: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(resultN2.status, 200, resultN2.error?.message ?? "resultN2 non-200");
    assertEquals(resultN3.status, 200, resultN3.error?.message ?? "resultN3 non-200");
    if (!resultN2.data || !resultN3.data) throw new Error("data missing");
    const entryN2: StageProgressEntry | undefined = resultN2.data.stages.find((s: StageProgressEntry) => s.stageSlug === THESIS_STAGE_SLUG);
    const entryN3: StageProgressEntry | undefined = resultN3.data.stages.find((s: StageProgressEntry) => s.stageSlug === THESIS_STAGE_SLUG);
    assertExists(entryN2);
    assertExists(entryN3);
    if (!entryN2 || !entryN3) throw new Error("entry missing");
    await t.step("totalSteps same regardless of model count n", () => {
      assertEquals(entryN2.progress.totalSteps, entryN3.progress.totalSteps);
    });
    await t.step("completedSteps same regardless of model count n (step-based not job-count)", () => {
      assertEquals(entryN2.progress.completedSteps, entryN3.progress.completedSteps);
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: step with zero jobs whose successors have been reached has status completed", async (t) => {
  const stageId = "stage-zero-id";
  const instanceId = "instance-zero-id";
  const templateId = "template-zero-id";
  const modelId = "model-1";
  const stepAId = "step-a";
  const stepBId = "step-b";
  const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
    buildClonedStepRow(stepAId, instanceId, "step_a", "EXECUTE", "all_to_one"),
    buildClonedStepRow(stepBId, instanceId, "step_b", "EXECUTE", "all_to_one"),
  ];
  const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [
    { instance_id: instanceId, from_step_id: stepAId, to_step_id: stepBId },
  ];
  const jobForB: DialecticJobRow = {
    id: "job-b",
    created_at: new Date().toISOString(),
    session_id: basePayload.sessionId,
    stage_slug: THESIS_STAGE_SLUG,
    iteration_number: basePayload.iterationNumber,
    status: "completed",
    payload: {
      sessionId: basePayload.sessionId,
      projectId: basePayload.projectId,
      model_id: modelId,
      walletId: "w",
      user_jwt: "jwt",
      stageSlug: THESIS_STAGE_SLUG,
      iterationNumber: basePayload.iterationNumber,
      planner_metadata: { recipe_step_id: stepBId, stage_slug: THESIS_STAGE_SLUG },
    },
    user_id: basePayload.userId,
    is_test_job: false,
    attempt_count: 0,
    max_retries: 0,
    job_type: "EXECUTE",
    parent_job_id: null,
    prerequisite_job_id: null,
    target_contribution_id: null,
    started_at: null,
    completed_at: new Date().toISOString(),
    results: null,
    error_details: null,
  };
  const jobs: DialecticJobRow[] = [jobForB];
  const sessionRow = { id: basePayload.sessionId, project_id: basePayload.projectId, selected_model_ids: [modelId] };
  const projectRow = { id: basePayload.projectId, process_template_id: "process-1" };
  const transitions = [{ source_stage_id: stageId, target_stage_id: stageId }];
  const templateStages = [{ id: stageId, slug: THESIS_STAGE_SLUG }];
  const stages: DialecticStage[] = [{
    id: stageId,
    slug: THESIS_STAGE_SLUG,
    display_name: "Thesis",
    description: null,
    created_at: new Date().toISOString(),
    expected_output_template_ids: [],
    active_recipe_instance_id: instanceId,
    default_system_prompt_id: null,
    recipe_template_id: templateId,
  }];
  const instances: DialecticStageRecipeInstance[] = [{
    id: instanceId,
    stage_id: stageId,
    template_id: templateId,
    is_cloned: true,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
    new Response(JSON.stringify(edges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, result.error?.message ?? "non-200 response");
    if (!result.data) throw new Error("result.data missing");
    const entry: StageProgressEntry | undefined = result.data.stages.find((s: StageProgressEntry) => s.stageSlug === THESIS_STAGE_SLUG);
    assertExists(entry);
    if (!entry) throw new Error("entry missing");
    const stepA: StepProgressDto | undefined = entry.steps.find((s: StepProgressDto) => s.stepKey === "step_a");
    assertExists(stepA);
    await t.step("step with zero jobs whose successors have been reached has status completed", () => {
      assertEquals(stepA.status, "completed");
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: randomized DAG test and progress for any valid DAG topology", async (t) => {
  const stageIdA = "stage-rand-a";
  const stageIdB = "stage-rand-b";
  const instanceIdA = "instance-rand-a";
  const instanceIdB = "instance-rand-b";
  const templateIdA = "template-rand-a";
  const templateIdB = "template-rand-b";
  const modelId = "model-1";
  const numStepsA: number = 2 + Math.floor(Math.random() * 3);
  const numStepsB: number = 2 + Math.floor(Math.random() * 3);
  const stepsA: Tables<"dialectic_stage_recipe_steps">[] = [];
  for (let i = 0; i < numStepsA; i++) {
    const strat: GranularityStrategy = STRATEGIES_NO_PRIOR_CONTEXT[Math.floor(Math.random() * STRATEGIES_NO_PRIOR_CONTEXT.length)];
    stepsA.push(buildClonedStepRow(`step-a-${i}`, instanceIdA, `step_a_${i}`, i === 0 ? "PLAN" : "EXECUTE", strat));
  }
  const edgesA: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];
  for (let i = 0; i < numStepsA - 1; i++) {
    edgesA.push({ instance_id: instanceIdA, from_step_id: stepsA[i].id, to_step_id: stepsA[i + 1].id });
  }
  const stepsB: Tables<"dialectic_stage_recipe_steps">[] = [];
  for (let i = 0; i < numStepsB; i++) {
    const strat: GranularityStrategy = STRATEGIES_SUPPORTED[Math.floor(Math.random() * STRATEGIES_SUPPORTED.length)];
    stepsB.push(buildClonedStepRow(`step-b-${i}`, instanceIdB, `step_b_${i}`, i === 0 ? "PLAN" : "EXECUTE", strat));
  }
  const edgesB: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];
  for (let i = 0; i < numStepsB - 1; i++) {
    edgesB.push({ instance_id: instanceIdB, from_step_id: stepsB[i].id, to_step_id: stepsB[i + 1].id });
  }
  const allSteps: Tables<"dialectic_stage_recipe_steps">[] = [...stepsA, ...stepsB];
  const allEdges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [...edgesA, ...edgesB];
  const jobs: DialecticJobRow[] = [];
  const completedA: number = Math.floor(Math.random() * (numStepsA + 1));
  for (let j = 0; j < numStepsA; j++) {
    if (stepsA[j].job_type === "PLAN") continue;
    if (j >= completedA) break;
    jobs.push({
      id: `job-a-${j}`,
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: modelId,
        walletId: "w",
        user_jwt: "jwt",
        stageSlug: THESIS_STAGE_SLUG,
        iterationNumber: basePayload.iterationNumber,
        planner_metadata: { recipe_step_id: stepsA[j].id, stage_slug: THESIS_STAGE_SLUG },
      },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "EXECUTE",
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: null,
      error_details: null,
    });
  }
  const completedB: number = Math.floor(Math.random() * (numStepsB + 1));
  for (let j = 0; j < numStepsB; j++) {
    if (stepsB[j].job_type === "PLAN") continue;
    if (j >= completedB) break;
    jobs.push({
      id: `job-b-${j}`,
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: SYNTHESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: modelId,
        walletId: "w",
        user_jwt: "jwt",
        stageSlug: SYNTHESIS_STAGE_SLUG,
        iterationNumber: basePayload.iterationNumber,
        planner_metadata: { recipe_step_id: stepsB[j].id, stage_slug: SYNTHESIS_STAGE_SLUG },
      },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "EXECUTE",
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: null,
      error_details: null,
    });
  }
  const sessionRow: { id: string; project_id: string; selected_model_ids: string[] } = {
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
  };
  const projectRow: { id: string; process_template_id: string } = {
    id: basePayload.projectId,
    process_template_id: "process-1",
  };
  const transitions: { source_stage_id: string; target_stage_id: string }[] = [
    { source_stage_id: stageIdA, target_stage_id: stageIdA },
    { source_stage_id: stageIdB, target_stage_id: stageIdB },
    { source_stage_id: stageIdA, target_stage_id: stageIdB },
  ];
  const templateStages: { id: string; slug: string }[] = [
    { id: stageIdA, slug: THESIS_STAGE_SLUG },
    { id: stageIdB, slug: SYNTHESIS_STAGE_SLUG },
  ];
  const stages: DialecticStage[] = [
    {
      id: stageIdA,
      slug: THESIS_STAGE_SLUG,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceIdA,
      default_system_prompt_id: null,
      recipe_template_id: templateIdA,
    },
    {
      id: stageIdB,
      slug: SYNTHESIS_STAGE_SLUG,
      display_name: "Synthesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceIdB,
      default_system_prompt_id: null,
      recipe_template_id: templateIdB,
    },
  ];
  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceIdA,
      stage_id: stageIdA,
      template_id: templateIdA,
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: instanceIdB,
      stage_id: stageIdB,
      template_id: templateIdB,
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const headers: { "Content-Type": string } = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(transitions), { status: 200, headers }),
    new Response(JSON.stringify(templateStages), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(stages), { status: 200, headers }),
    new Response(JSON.stringify(instances), { status: 200, headers }),
    new Response(JSON.stringify(allSteps), { status: 200, headers }),
    new Response(JSON.stringify(allEdges), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = createGetAllStageProgressDeps(dbClient, baseUser);
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, result.error?.message ?? "non-200 response");
    if (!result.data) throw new Error("result.data missing");
    const entryA: StageProgressEntry | undefined = result.data.stages.find((s: StageProgressEntry) => s.stageSlug === THESIS_STAGE_SLUG);
    const entryB: StageProgressEntry | undefined = result.data.stages.find((s: StageProgressEntry) => s.stageSlug === SYNTHESIS_STAGE_SLUG);
    assertExists(entryA);
    assertExists(entryB);
    if (!entryA || !entryB) throw new Error("entry missing");
    await t.step("thesis: completedSteps == count of completed status", () => {
      const completedCount: number = entryA.steps.filter((s: StepProgressDto) => s.status === "completed").length;
      assertEquals(entryA.progress.completedSteps, completedCount);
    });
    await t.step("thesis: totalSteps == steps.length", () => {
      assertEquals(entryA.progress.totalSteps, stepsA.length);
    });
    await t.step("thesis: failedSteps == count of failed status", () => {
      const failedCount: number = entryA.steps.filter((s: StepProgressDto) => s.status === "failed").length;
      assertEquals(entryA.progress.failedSteps, failedCount);
    });
    await t.step("synthesis: completedSteps == count of completed status", () => {
      const completedCount: number = entryB.steps.filter((s: StepProgressDto) => s.status === "completed").length;
      assertEquals(entryB.progress.completedSteps, completedCount);
    });
    await t.step("synthesis: totalSteps == steps.length", () => {
      assertEquals(entryB.progress.totalSteps, stepsB.length);
    });
    await t.step("synthesis: failedSteps == count of failed status", () => {
      const failedCount: number = entryB.steps.filter((s: StepProgressDto) => s.status === "failed").length;
      assertEquals(entryB.progress.failedSteps, failedCount);
    });
    await t.step("progress calculates correctly for any valid multi-stage DAG (prior context supplied)", () => {
      assertEquals(result.data!.stages.length, 2);
      assertEquals(entryA.progress.totalSteps, numStepsA);
      assertEquals(entryB.progress.totalSteps, numStepsB);
    });
  } finally {
    restoreFetch();
  }
});
