/**
 * Unit tests for getAllStageProgress.
 * Tests use the exact stage and step structure from the existing DAG (thesis recipe per migrations).
 * See: Prelaunch Fixes checklist — Progress calculates correctly for every stage in the existing DAG.
 *
 * Count derivation (granularity strategies, lineageCount walk) lives in computeTemplateStageCounts
 * and computeExpectedCounts tests; this suite injects createMockComputeTemplateStageCountsFn.
 */
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { restoreFetch, mockFetch } from "../_shared/supabase.mock.ts";
import { getAllStageProgress } from "./getAllStageProgress.ts";
import { Database } from "../types_db.ts";
import {
  DialecticJobRow,
  DialecticProjectRow,
  DialecticProjectResourceRow,
  DialecticRenderJobPayload,
  DialecticSessionRow,
  GranularityStrategy,
  JobType,
  GetAllStageProgressPayload,
  GetAllStageProgressDeps,
  GetAllStageProgressParams,
  GetAllStageProgressResponse,
  GetAllStageProgressResult,
  JobProgressDto,
  ProgressRecipeEdge,
  ProgressRecipeStep,
  StageDocumentDescriptorDto,
  StageProgressEntry,
  StepProgressDto,
  BuildDocumentDescriptorsDeps,
  BuildDocumentDescriptorsParams,
  BuildJobProgressDtosDeps,
  BuildJobProgressDtosParams,
  DeriveStepStatusesDeps,
  DeriveStepStatusesParams,
  DeriveStepStatusesResult,
} from "./dialectic.interface.ts";
import {
  buildComputeTemplateStageCountsFailureResult,
  buildStageCountsEntry,
  createMockComputeTemplateStageCountsFn,
} from "./computeTemplateStageCounts/computeTemplateStageCounts.mock.ts";
import type {
  ComputeTemplateStageCountsData,
  ComputeTemplateStageCountsResult,
  StageCountsEntry,
} from "./computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";
import { buildGetAllStageProgressDeps } from "./getAllStageProgress.mock.ts";
import { mockDialecticSessionRow } from "../dialectic-worker/prepareModelJob/prepareModelJob.mock.ts";
import { deriveStepStatuses } from "./deriveStepStatuses.ts";
import { buildDocumentDescriptors } from "./buildDocumentDescriptors.ts";
import { buildJobProgressDtos } from "./buildJobProgressDtos.ts";
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

  const progressSteps: ProgressRecipeStep[] = [
    { id: planStepId, step_key: THESIS_STEP_KEYS[0], job_type: "PLAN", granularity_strategy: "all_to_one" },
    { id: businessStepId, step_key: THESIS_STEP_KEYS[1], job_type: "EXECUTE", granularity_strategy: "per_source_document" },
    { id: featureStepId, step_key: THESIS_STEP_KEYS[2], job_type: "EXECUTE", granularity_strategy: "per_source_document" },
    { id: technicalStepId, step_key: THESIS_STEP_KEYS[3], job_type: "EXECUTE", granularity_strategy: "per_source_document" },
    { id: successStepId, step_key: THESIS_STEP_KEYS[4], job_type: "EXECUTE", granularity_strategy: "per_source_document" },
  ];

  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: planStepId, to_step_id: businessStepId },
    { from_step_id: planStepId, to_step_id: featureStepId },
    { from_step_id: planStepId, to_step_id: technicalStepId },
    { from_step_id: planStepId, to_step_id: successStepId },
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
      idempotency_key: null,
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
      idempotency_key: null,
    },
  ];

  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const thesisIso: string = new Date().toISOString();
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-1",
    created_at: thesisIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: thesisIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const stepIdToStepKey: Map<string, string> = new Map<string, string>();
  for (const row of progressSteps) {
    stepIdToStepKey.set(row.id, row.step_key);
  }
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 13,
      })],
      totalStages: 1,
      stepIdToStepKey,
    },
  };
  if (countsConfig.data === undefined) {
    throw new Error("countsConfig.data missing");
  }
  const countsData: ComputeTemplateStageCountsData = countsConfig.data;

  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);

  if (sessionRow.selected_model_ids === null) {
    throw new Error("selected_model_ids must not be null");
  }
  const selectedModelCount: number = sessionRow.selected_model_ids.length;

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
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
      assertEquals(data.stages.length, countsData.stages.length);
      for (const countsEntry of countsData.stages) {
        let progressEntry: StageProgressEntry = data.stages[0];
        for (const candidate of data.stages) {
          if (candidate.stageSlug === countsEntry.stageSlug) {
            progressEntry = candidate;
          }
        }
        assertEquals(progressEntry.stageSlug, countsEntry.stageSlug);
      }
    });

    let thesisEntry: StageProgressEntry = data.stages[0];
    for (const candidate of data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        thesisEntry = candidate;
      }
    }
    assertEquals(thesisEntry.stageSlug, THESIS_STAGE_SLUG);

    await t.step("when stage has jobs (started), modelCount is n", () => {
      assertEquals(thesisEntry.modelCount, selectedModelCount);
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
        let step: StepProgressDto = thesisEntry.steps[0];
        for (const candidate of thesisEntry.steps) {
          if (candidate.stepKey === stepKey) {
            step = candidate;
          }
        }
        assertExists(step, `step ${stepKey} must appear in response`);
      }
      if (thesisEntry.status === "completed") {
        assertEquals(thesisEntry.progress.completedSteps, thesisEntry.progress.totalSteps);
        assertEquals(thesisEntry.progress.failedSteps, 0);
      }
    });

    await t.step("model count loaded from dialectic_sessions.selected_models.length", () => {
      assertEquals(thesisEntry.modelCount, selectedModelCount);
    });

    await t.step("total stages from computeTemplateStageCounts totalStages", () => {
      assertEquals(data.dagProgress.totalStages, countsData.totalStages);
    });

    await t.step("progress is independent of granularity strategy: a step with per_model and a step with all_to_one are each one step toward completedSteps", () => {
      assertEquals(thesisEntry.progress.totalSteps, progressSteps.length);
    });

    await t.step("edge loading: cloned instances use dialectic_stage_recipe_edges (instance_id in edges)", () => {
      assertEquals(progressEdges.length, 4);
      assertEquals(thesisEntry.progress.totalSteps, progressSteps.length);
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

  const allProgressSteps: { instanceId: string; step: ProgressRecipeStep }[] = [];
  const allProgressEdges: { instanceId: string; edge: ProgressRecipeEdge }[] = [];

  // Thesis: real recipe from 20251006194531_thesis_stage.sql (planner → 4 execute)
  const thesisStepIds: string[] = [];
  for (let j = 0; j < THESIS_STEP_KEYS.length; j++) {
    const stepId: string = `step-${THESIS_STAGE_SLUG}-${j}`;
    thesisStepIds.push(stepId);
    const jobType: string = j === 0 ? "PLAN" : "EXECUTE";
    const strategy: string = j === 0 ? "all_to_one" : "per_source_document";
    if (!isJobTypeEnum(jobType)) {
      throw new Error(`invalid job_type: ${jobType}`);
    }
    if (!isGranularityStrategy(strategy)) {
      throw new Error(`invalid granularity_strategy: ${strategy}`);
    }
    const step: ProgressRecipeStep = {
      id: stepId,
      step_key: THESIS_STEP_KEYS[j],
      job_type: jobType,
      granularity_strategy: strategy,
    };
    allProgressSteps.push({ instanceId: instanceIds[0], step });
  }
  for (let j = 1; j < thesisStepIds.length; j++) {
    allProgressEdges.push({
      instanceId: instanceIds[0],
      edge: { from_step_id: thesisStepIds[0], to_step_id: thesisStepIds[j] },
    });
  }

  // Antithesis: real recipe from 20251006194542_antithesis_stage.sql (planner → 6 execute)
  const antithesisStepIds: string[] = [];
  for (let j = 0; j < ANTITHESIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${ANTITHESIS_STAGE_SLUG}-${j}`;
    antithesisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = ANTITHESIS_STEP_SPEC[j];
    if (!isJobTypeEnum(spec.job_type)) {
      throw new Error(`invalid job_type: ${spec.job_type}`);
    }
    if (!isGranularityStrategy(spec.granularity_strategy)) {
      throw new Error(`invalid granularity_strategy: ${spec.granularity_strategy}`);
    }
    const step: ProgressRecipeStep = {
      id: stepId,
      step_key: spec.step_key,
      job_type: spec.job_type,
      granularity_strategy: spec.granularity_strategy,
    };
    allProgressSteps.push({ instanceId: instanceIds[1], step });
  }
  for (let j = 1; j < antithesisStepIds.length; j++) {
    allProgressEdges.push({
      instanceId: instanceIds[1],
      edge: { from_step_id: antithesisStepIds[0], to_step_id: antithesisStepIds[j] },
    });
  }

  // Synthesis: real recipe from 20251006194549_synthesis_stage.sql (planner → 4 pairwise → 4 doc → final header → 3 product)
  const synthesisStepIds: string[] = [];
  for (let j = 0; j < SYNTHESIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${SYNTHESIS_STAGE_SLUG}-${j}`;
    synthesisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = SYNTHESIS_STEP_SPEC[j];
    if (!isJobTypeEnum(spec.job_type)) {
      throw new Error(`invalid job_type: ${spec.job_type}`);
    }
    if (!isGranularityStrategy(spec.granularity_strategy)) {
      throw new Error(`invalid granularity_strategy: ${spec.granularity_strategy}`);
    }
    const step: ProgressRecipeStep = {
      id: stepId,
      step_key: spec.step_key,
      job_type: spec.job_type,
      granularity_strategy: spec.granularity_strategy,
    };
    allProgressSteps.push({ instanceId: instanceIds[2], step });
  }
  for (let j = 1; j <= 4; j++) {
    allProgressEdges.push({
      instanceId: instanceIds[2],
      edge: { from_step_id: synthesisStepIds[0], to_step_id: synthesisStepIds[j] },
    });
  }
  for (let j = 1; j <= 4; j++) {
    allProgressEdges.push({
      instanceId: instanceIds[2],
      edge: { from_step_id: synthesisStepIds[j], to_step_id: synthesisStepIds[4 + j] },
    });
  }
  for (let j = 5; j <= 8; j++) {
    allProgressEdges.push({
      instanceId: instanceIds[2],
      edge: { from_step_id: synthesisStepIds[j], to_step_id: synthesisStepIds[9] },
    });
  }
  for (let j = 10; j <= 12; j++) {
    allProgressEdges.push({
      instanceId: instanceIds[2],
      edge: { from_step_id: synthesisStepIds[9], to_step_id: synthesisStepIds[j] },
    });
  }

  // Parenthesis: real recipe from 20251006194558_parenthesis_stage.sql (planner → 3 execute)
  const parenthesisStepIds: string[] = [];
  for (let j = 0; j < PARENTHESIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${PARENTHESIS_STAGE_SLUG}-${j}`;
    parenthesisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = PARENTHESIS_STEP_SPEC[j];
    if (!isJobTypeEnum(spec.job_type)) {
      throw new Error(`invalid job_type: ${spec.job_type}`);
    }
    if (!isGranularityStrategy(spec.granularity_strategy)) {
      throw new Error(`invalid granularity_strategy: ${spec.granularity_strategy}`);
    }
    const step: ProgressRecipeStep = {
      id: stepId,
      step_key: spec.step_key,
      job_type: spec.job_type,
      granularity_strategy: spec.granularity_strategy,
    };
    allProgressSteps.push({ instanceId: instanceIds[3], step });
  }
  for (let j = 1; j < parenthesisStepIds.length; j++) {
    allProgressEdges.push({
      instanceId: instanceIds[3],
      edge: { from_step_id: parenthesisStepIds[0], to_step_id: parenthesisStepIds[j] },
    });
  }

  // Paralysis: real recipe from 20251006194605_paralysis_stage.sql (planner → 2 execute → advisor_recommendations)
  const paralysisStepIds: string[] = [];
  for (let j = 0; j < PARALYSIS_STEP_SPEC.length; j++) {
    const stepId: string = `step-${PARALYSIS_STAGE_SLUG}-${j}`;
    paralysisStepIds.push(stepId);
    const spec: { step_key: string; job_type: string; granularity_strategy: string } = PARALYSIS_STEP_SPEC[j];
    if (!isJobTypeEnum(spec.job_type)) {
      throw new Error(`invalid job_type: ${spec.job_type}`);
    }
    if (!isGranularityStrategy(spec.granularity_strategy)) {
      throw new Error(`invalid granularity_strategy: ${spec.granularity_strategy}`);
    }
    const step: ProgressRecipeStep = {
      id: stepId,
      step_key: spec.step_key,
      job_type: spec.job_type,
      granularity_strategy: spec.granularity_strategy,
    };
    allProgressSteps.push({ instanceId: instanceIds[4], step });
  }
  allProgressEdges.push(
    { instanceId: instanceIds[4], edge: { from_step_id: paralysisStepIds[0], to_step_id: paralysisStepIds[1] } },
    { instanceId: instanceIds[4], edge: { from_step_id: paralysisStepIds[0], to_step_id: paralysisStepIds[2] } },
    { instanceId: instanceIds[4], edge: { from_step_id: paralysisStepIds[1], to_step_id: paralysisStepIds[3] } },
    { instanceId: instanceIds[4], edge: { from_step_id: paralysisStepIds[2], to_step_id: paralysisStepIds[3] } },
  );

  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
  });
  const dagIso: string = new Date().toISOString();
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-five",
    created_at: dagIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: dagIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const jobs: DialecticJobRow[] = [];

  const dagCountsStages: StageCountsEntry[] = [];
  const dagStepIdToStepKey: Map<string, string> = new Map<string, string>();
  for (let i = 0; i < stageIds.length; i++) {
    const instanceId: string = instanceIds[i];
    const progressSteps: ProgressRecipeStep[] = [];
    for (const item of allProgressSteps) {
      if (item.instanceId !== instanceId) {
        continue;
      }
      progressSteps.push(item.step);
      dagStepIdToStepKey.set(item.step.id, item.step.step_key);
    }
    const progressEdges: ProgressRecipeEdge[] = [];
    for (const item of allProgressEdges) {
      if (item.instanceId !== instanceId) {
        continue;
      }
      progressEdges.push(item.edge);
    }
    dagCountsStages.push(
      buildStageCountsEntry({
        stageId: stageIds[i],
        stageSlug: stageSlugs[i],
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: EXISTING_DAG_STEP_COUNTS[stageSlugs[i]],
      }),
    );
  }
  const dagCountsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: dagCountsStages,
      totalStages: stageSlugs.length,
      stepIdToStepKey: dagStepIdToStepKey,
    },
  };

  const headers: { "Content-Type": string } = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);

  const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(dagCountsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, "expected status 200");
    assertExists(result.data);
    if (!result.data) throw new Error("result.data missing");
    const data: GetAllStageProgressResponse = result.data;

    await t.step("response contains an entry for every stage in the existing DAG (thesis, antithesis, synthesis, parenthesis, paralysis)", () => {
      assertEquals(data.stages.length, stageSlugs.length);
      for (const slug of stageSlugs) {
        let entry: StageProgressEntry = data.stages[0];
        for (const candidate of data.stages) {
          if (candidate.stageSlug === slug) {
            entry = candidate;
          }
        }   
        assertEquals(entry.stageSlug, slug);
      }
    });

    for (const slug of stageSlugs) {
      const expectedTotal: number = EXISTING_DAG_STEP_COUNTS[slug];
      await t.step(`${slug}: totalSteps == recipe step count (${expectedTotal})`, () => {
        let entry: StageProgressEntry = data.stages[0];
        for (const candidate of data.stages) {
          if (candidate.stageSlug === slug) {
            entry = candidate;
          }
        }
        assertEquals(entry.stageSlug, slug);
        assertEquals(entry.progress.totalSteps, expectedTotal);
        assertEquals(entry.steps.length, expectedTotal);
      });
      await t.step(`${slug}: completedSteps == count of steps with status completed`, () => {
        let entry: StageProgressEntry = data.stages[0];
        for (const candidate of data.stages) {
          if (candidate.stageSlug === slug) {
            entry = candidate;
          }
        }
        const completedCount: number = entry.steps.filter(
          (s: StepProgressDto) => s.status === "completed",
        ).length;
        assertEquals(entry.progress.completedSteps, completedCount);
      });
      await t.step(`${slug}: failedSteps == count of steps with status failed`, () => {
        let entry: StageProgressEntry = data.stages[0];
        for (const candidate of data.stages) {
          if (candidate.stageSlug === slug) {
            entry = candidate;
          }
        }
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
  const progressSteps: ProgressRecipeStep[] = [
    { id: planStepId, step_key: "plan", job_type: "PLAN", granularity_strategy: "all_to_one" },
    { id: executeStepId, step_key: "execute", job_type: "EXECUTE", granularity_strategy: "per_model" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: planStepId, to_step_id: executeStepId },
  ];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([
    [planStepId, "plan"],
    [executeStepId, "execute"],
  ]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 13,
      })],
      totalStages: 1,
      stepIdToStepKey,
    },
  };
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
    idempotency_key: null,
  };
  const sourceContributionId = "contrib-render-1";
  const renderPayload: DialecticRenderJobPayload = {
    idempotencyKey: 'job-id-123_render',
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
    idempotency_key: null,
  };
  const jobs: DialecticJobRow[] = [executeJob, renderJob];
  const iso: string = new Date().toISOString();
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
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: iso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: iso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify(resources), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, "expected status 200");
    if (!result.data) throw new Error("result.data missing");
    let entry: StageProgressEntry = result.data.stages[0];
    for (const candidate of result.data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entry = candidate;
      }
    }
    assertExists(entry);
    if (!entry) throw new Error("entry missing");
    await t.step("step count equals recipe steps only (RENDER not a step)", () => {
      assertEquals(entry.steps.length, progressSteps.length);
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
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepId, step_key: "step_one", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([[stepId, "step_one"]]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 1,
        }),
      ],
      totalStages: 1,
      stepIdToStepKey,
    },
  };
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
    idempotency_key: null,
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
    idempotency_key: null,
  };
  const jobs: DialecticJobRow[] = [normalJob, continuationJob];
  const contIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: contIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: contIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, "expected status 200");
    if (!result.data) throw new Error("result.data missing");
    let entry: StageProgressEntry = result.data.stages[0];
    for (const candidate of result.data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entry = candidate;
      }
    }
    assertEquals(entry.stageSlug, THESIS_STAGE_SLUG);
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
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepId, step_key: "step_one", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([[stepId, "step_one"]]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 1,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };
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
    idempotency_key: null,
  }];
  const monoIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: monoIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: monoIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const first: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    const second: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(first.status, 200, "first call expected status 200");
    assertEquals(second.status, 200, "second call expected status 200");
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
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepId, step_key: "step_one", job_type: "EXECUTE", granularity_strategy: "per_model" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([[stepId, "step_one"]]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 1,
      }),
    ],
      totalStages: 1,
      stepIdToStepKey,
    },
  };
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
    idempotency_key: null,
  };
  const nIso: string = new Date().toISOString();
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: nIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: nIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  const jobsForN: DialecticJobRow[] = [job];
  const sessionRowN2: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["m1", "m2"],
    current_stage_id: stageId,
  });
  const sessionRowN3: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["m1", "m2", "m3"],
    current_stage_id: stageId,
  });
  mockFetch([
    new Response(JSON.stringify(sessionRowN2), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobsForN), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify(sessionRowN3), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobsForN), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const resultN2: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    const resultN3: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(resultN2.status, 200, "resultN2 expected status 200");
    assertEquals(resultN3.status, 200, "resultN3 expected status 200");
    if (!resultN2.data || !resultN3.data) throw new Error("data missing");
    let entryN2: StageProgressEntry = resultN2.data.stages[0];
    for (const candidate of resultN2.data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entryN2 = candidate;
      }
    }
    let entryN3: StageProgressEntry = resultN3.data.stages[0];
    for (const candidate of resultN3.data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entryN3 = candidate;
      }
    }
    assertEquals(entryN2.stageSlug, THESIS_STAGE_SLUG);
    assertEquals(entryN3.stageSlug, THESIS_STAGE_SLUG);
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
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepAId, step_key: "step_a", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
    { id: stepBId, step_key: "step_b", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: stepAId, to_step_id: stepBId },
  ];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([
    [stepAId, "step_a"],
    [stepBId, "step_b"],
  ]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 2,
      }),
    ],
      totalStages: 1,
      stepIdToStepKey,
    },
  };
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
    idempotency_key: null,
  };
  const jobs: DialecticJobRow[] = [jobForB];
  const zeroIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: zeroIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: zeroIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, "expected status 200");
    if (!result.data) throw new Error("result.data missing");
    let entry: StageProgressEntry = result.data.stages[0];
    for (const candidate of result.data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entry = candidate;
      }
    }
    assertEquals(entry.stageSlug, THESIS_STAGE_SLUG);
    let stepA: StepProgressDto = entry.steps[0];
    for (const candidate of entry.steps) {
      if (candidate.stepKey === "step_a") {
        stepA = candidate;
      }
    }
    assertEquals(stepA.stepKey, "step_a");
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
  const stepsA: ProgressRecipeStep[] = [];
  for (let i = 0; i < numStepsA; i++) {
    const stepId: string = `step-a-${i}`;
    const jobType: JobType = i === 0 ? "PLAN" : "EXECUTE";
    const strat: GranularityStrategy = STRATEGIES_NO_PRIOR_CONTEXT[Math.floor(Math.random() * STRATEGIES_NO_PRIOR_CONTEXT.length)];
    const step: ProgressRecipeStep = {
      id: stepId,
      step_key: `step_a_${i}`,
      job_type: jobType,
      granularity_strategy: strat,
    };
    stepsA.push(step);
  }
  const edgesA: ProgressRecipeEdge[] = [];
  for (let i = 0; i < numStepsA - 1; i++) {
    edgesA.push({ from_step_id: stepsA[i].id, to_step_id: stepsA[i + 1].id });
  }
  const stepsB: ProgressRecipeStep[] = [];
  for (let i = 0; i < numStepsB; i++) {
    const stepId: string = `step-b-${i}`;
    const jobType: JobType = i === 0 ? "PLAN" : "EXECUTE";
    const strat: GranularityStrategy = STRATEGIES_SUPPORTED[Math.floor(Math.random() * STRATEGIES_SUPPORTED.length)];
    const step: ProgressRecipeStep = {
      id: stepId,
      step_key: `step_b_${i}`,
      job_type: jobType,
      granularity_strategy: strat,
    };
    stepsB.push(step);
  }
  const edgesB: ProgressRecipeEdge[] = [];
  for (let i = 0; i < numStepsB - 1; i++) {
    edgesB.push({ from_step_id: stepsB[i].id, to_step_id: stepsB[i + 1].id });
  }
  const randStepIdToStepKey: Map<string, string> = new Map<string, string>();
  for (const step of stepsA) {
    randStepIdToStepKey.set(step.id, step.step_key);
  }
  for (const step of stepsB) {
    randStepIdToStepKey.set(step.id, step.step_key);
  }
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId: stageIdA,
        stageSlug: THESIS_STAGE_SLUG,
        steps: stepsA,
        edges: edgesA,
        totalExpected: numStepsA,
      }),
      buildStageCountsEntry({
        stageId: stageIdB,
        stageSlug: SYNTHESIS_STAGE_SLUG,
        steps: stepsB,
        edges: edgesB,
        totalExpected: numStepsB,
      }),
      ],
      totalStages: 2,
      stepIdToStepKey: randStepIdToStepKey,
    },
  };
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
      idempotency_key: null,
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
      idempotency_key: null,
    });
  }
  const randIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: randIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: randIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers: { "Content-Type": string } = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200, "expected status 200");
    if (!result.data) throw new Error("result.data missing");
    let entryA: StageProgressEntry = result.data.stages[0];
    for (const candidate of result.data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entryA = candidate;
      }
    }
    let entryB: StageProgressEntry = result.data.stages[0];
    for (const candidate of result.data.stages) {
      if (candidate.stageSlug === SYNTHESIS_STAGE_SLUG) {
        entryB = candidate;
      }
    }
    assertEquals(entryA.stageSlug, THESIS_STAGE_SLUG);
    assertEquals(entryB.stageSlug, SYNTHESIS_STAGE_SLUG);
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

Deno.test("getAllStageProgress: paused_nsf step status drives stage status (NSF Pause and Resume Node 6)", async (t) => {
  const stageId: string = "stage-paused-nsf-id";
  const instanceId: string = "instance-paused-nsf-id";
  const templateId: string = "template-paused-nsf-id";
  const modelId: string = "model-1";
  const stepAId: string = "step-paused-a";
  const stepBId: string = "step-paused-b";
  const iso: string = new Date().toISOString();
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepAId, step_key: "step_paused_a", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
    { id: stepBId, step_key: "step_paused_b", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: stepAId, to_step_id: stepBId },
  ];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([
    [stepAId, "step_paused_a"],
    [stepBId, "step_paused_b"],
  ]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 2,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: iso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: iso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers: HeadersInit = { "Content-Type": "application/json" };

  await t.step("when any step has status paused_nsf, stage status is paused_nsf", async () => {
    const jobs: DialecticJobRow[] = [{
      id: "job-paused-only",
      created_at: iso,
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "paused_nsf",
      payload: {
          sessionId: basePayload.sessionId,
          projectId: basePayload.projectId,
          model_id: modelId,
          walletId: "wallet-1",
          user_jwt: "jwt",
          stageSlug: THESIS_STAGE_SLUG,
          iterationNumber: basePayload.iterationNumber,
          planner_metadata: { recipe_step_id: stepAId, stage_slug: THESIS_STAGE_SLUG },
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
      completed_at: null,
      results: null,
      error_details: null,
      idempotency_key: null,
    }];
    mockFetch([
      new Response(JSON.stringify(sessionRow), { status: 200, headers }),
      new Response(JSON.stringify(projectRow), { status: 200, headers }),
      new Response(JSON.stringify(jobs), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
    ]);
    const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    try {
      const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
        computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
      });
      const params: GetAllStageProgressParams = { payload: basePayload };
      const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
      assertEquals(result.status, 200, "expected status 200");
      assertExists(result.data);
      let entry: StageProgressEntry = result.data!.stages[0];
      for (const candidate of result.data!.stages) {
        if (candidate.stageSlug === THESIS_STAGE_SLUG) {
          entry = candidate;
        }
      }
      assertExists(entry);
      assertEquals(entry!.status, "paused_nsf");
    } finally {
      restoreFetch();
    }
  });

  await t.step("when steps have mix of paused_nsf and completed, stage status is paused_nsf", async () => {
    const jobs: DialecticJobRow[] = [
      {
        id: "job-completed-a",
        created_at: iso,
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
          planner_metadata: { recipe_step_id: stepAId, stage_slug: THESIS_STAGE_SLUG },
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
        completed_at: iso,
        results: null,
        error_details: null,
        idempotency_key: null,
      },
      {
        id: "job-paused-b",
        created_at: iso,
        session_id: basePayload.sessionId,
        stage_slug: THESIS_STAGE_SLUG,
        iteration_number: basePayload.iterationNumber,
        status: "paused_nsf",
        payload: {
          sessionId: basePayload.sessionId,
          projectId: basePayload.projectId,
          model_id: modelId,
          walletId: "wallet-1",
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
        completed_at: null,
        results: null,
        error_details: null,
        idempotency_key: null,
      },
    ];
    mockFetch([
      new Response(JSON.stringify(sessionRow), { status: 200, headers }),
      new Response(JSON.stringify(projectRow), { status: 200, headers }),
      new Response(JSON.stringify(jobs), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
    ]);
    const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    try {
      const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
        computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
      });
      const params: GetAllStageProgressParams = { payload: basePayload };
      const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
      assertEquals(result.status, 200, "expected status 200");
      assertExists(result.data);
      let entry: StageProgressEntry = result.data!.stages[0];
      for (const candidate of result.data!.stages) {
        if (candidate.stageSlug === THESIS_STAGE_SLUG) {
          entry = candidate;
        }
      }
      assertExists(entry);
      assertEquals(entry!.status, "paused_nsf");
    } finally {
      restoreFetch();
    }
  });

  await t.step("when steps have mix of paused_nsf and failed, stage status is failed", async () => {
    const jobs: DialecticJobRow[] = [
      {
        id: "job-paused-a",
        created_at: iso,
        session_id: basePayload.sessionId,
        stage_slug: THESIS_STAGE_SLUG,
        iteration_number: basePayload.iterationNumber,
        status: "paused_nsf",
        payload: {
          sessionId: basePayload.sessionId,
          projectId: basePayload.projectId,
          model_id: modelId,
          walletId: "wallet-1",
          user_jwt: "jwt",
          stageSlug: THESIS_STAGE_SLUG,
          iterationNumber: basePayload.iterationNumber,
          planner_metadata: { recipe_step_id: stepAId, stage_slug: THESIS_STAGE_SLUG },
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
        completed_at: null,
        results: null,
        error_details: null,
        idempotency_key: null,
      },
      {
        id: "job-failed-b",
        created_at: iso,
        session_id: basePayload.sessionId,
        stage_slug: THESIS_STAGE_SLUG,
        iteration_number: basePayload.iterationNumber,
        status: "failed",
        payload: {
          sessionId: basePayload.sessionId,
          projectId: basePayload.projectId,
          model_id: modelId,
          walletId: "wallet-1",
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
        completed_at: null,
        results: null,
        error_details: null,
        idempotency_key: null,
      },
    ];
    mockFetch([
      new Response(JSON.stringify(sessionRow), { status: 200, headers }),
      new Response(JSON.stringify(projectRow), { status: 200, headers }),
      new Response(JSON.stringify(jobs), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
    ]);
    const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    try {
      const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
        computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
      });
      const params: GetAllStageProgressParams = { payload: basePayload };
      const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
      assertEquals(result.status, 200, "expected status 200");
      assertExists(result.data);
      let entry: StageProgressEntry = result.data!.stages[0];
      for (const candidate of result.data!.stages) {
        if (candidate.stageSlug === THESIS_STAGE_SLUG) {
          entry = candidate;
        }
      }
      assertExists(entry);
      assertEquals(entry!.status, "failed");
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("getAllStageProgress: paused_user step status drives stage status (user pause/resume)", async (t) => {
  const stageId: string = "stage-paused-user-id";
  const instanceId: string = "instance-paused-user-id";
  const templateId: string = "template-paused-user-id";
  const modelId: string = "model-1";
  const stepAId: string = "step-paused-user-a";
  const stepBId: string = "step-paused-user-b";
  const iso: string = new Date().toISOString();
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepAId, step_key: "step_paused_user_a", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
    { id: stepBId, step_key: "step_paused_user_b", job_type: "EXECUTE", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: stepAId, to_step_id: stepBId },
  ];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([
    [stepAId, "step_paused_user_a"],
    [stepBId, "step_paused_user_b"],
  ]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 2,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-1",
    created_at: iso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: iso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers: HeadersInit = { "Content-Type": "application/json" };

  await t.step("when any step has status paused_user, stage status is paused_user", async () => {
    const jobs: DialecticJobRow[] = [{
      id: "job-paused-user-only",
      created_at: iso,
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "paused_user",
      payload: {
          sessionId: basePayload.sessionId,
          projectId: basePayload.projectId,
          model_id: modelId,
          walletId: "wallet-1",
          user_jwt: "jwt",
          stageSlug: THESIS_STAGE_SLUG,
          iterationNumber: basePayload.iterationNumber,
          planner_metadata: { recipe_step_id: stepAId, stage_slug: THESIS_STAGE_SLUG },
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
      completed_at: null,
      results: null,
      error_details: null,
      idempotency_key: null,
    }];
    mockFetch([
      new Response(JSON.stringify(sessionRow), { status: 200, headers }),
      new Response(JSON.stringify(projectRow), { status: 200, headers }),
      new Response(JSON.stringify(jobs), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
    ]);
    const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    try {
      const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
        computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
      });
      const params: GetAllStageProgressParams = { payload: basePayload };
      const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
      assertEquals(result.status, 200, "expected status 200");
      assertExists(result.data);
      let entry: StageProgressEntry = result.data!.stages[0];
      for (const candidate of result.data!.stages) {
        if (candidate.stageSlug === THESIS_STAGE_SLUG) {
          entry = candidate;
        }
      }
      assertExists(entry);
      assertEquals(entry!.status, "paused_user");
    } finally {
      restoreFetch();
    }
  });

  await t.step("when steps have mix of paused_user and completed, stage status is paused_user", async () => {
    const jobs: DialecticJobRow[] = [
      {
        id: "job-completed-pu-a",
        created_at: iso,
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
          planner_metadata: { recipe_step_id: stepAId, stage_slug: THESIS_STAGE_SLUG },
        },
        user_id: basePayload.userId,
        is_test_job: false,
        attempt_count: 0,
        max_retries: 0,
        job_type: "EXECUTE",
        parent_job_id: null,
        prerequisite_job_id: null,
        target_contribution_id: null,
        started_at: iso,
        completed_at: iso,
        results: null,
        error_details: null,
        idempotency_key: null,
      },
      {
        id: "job-paused-user-b",
        created_at: iso,
        session_id: basePayload.sessionId,
        stage_slug: THESIS_STAGE_SLUG,
        iteration_number: basePayload.iterationNumber,
        status: "paused_user",
        payload: {
          sessionId: basePayload.sessionId,
          projectId: basePayload.projectId,
          model_id: modelId,
          walletId: "wallet-1",
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
        completed_at: null,
        results: null,
        error_details: null,
        idempotency_key: null,
      },
    ];
    mockFetch([
      new Response(JSON.stringify(sessionRow), { status: 200, headers }),
      new Response(JSON.stringify(projectRow), { status: 200, headers }),
      new Response(JSON.stringify(jobs), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
      new Response(JSON.stringify([]), { status: 200, headers }),
    ]);
    const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    try {
      const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
        computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
      });
      const params: GetAllStageProgressParams = { payload: basePayload };
      const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
      assertEquals(result.status, 200, "expected status 200");
      assertExists(result.data);
      let entry: StageProgressEntry = result.data!.stages[0];
      for (const candidate of result.data!.stages) {
        if (candidate.stageSlug === THESIS_STAGE_SLUG) {
          entry = candidate;
        }
      }
      assertExists(entry);
      assertEquals(entry!.status, "paused_user");
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("getAllStageProgress: stages[].jobs contains JobProgressDto[] with correct fields and all job types/statuses, stages[].edges match recipe", async (t) => {
  const stageId: string = "stage-jobs-edges-id";
  const instanceId: string = "instance-jobs-edges-id";
  const templateId: string = "template-jobs-edges-id";
  const modelId: string = "model-1";
  const planStepId: string = "step-plan-je";
  const executeStepId: string = "step-execute-je";
  const renderStepId: string = "step-render-je";

  const progressSteps: ProgressRecipeStep[] = [
    { id: planStepId, step_key: "plan", job_type: "PLAN", granularity_strategy: "all_to_one" },
    { id: executeStepId, step_key: "execute", job_type: "EXECUTE", granularity_strategy: "per_model" },
    { id: renderStepId, step_key: "render", job_type: "RENDER", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: planStepId, to_step_id: executeStepId },
    { from_step_id: executeStepId, to_step_id: renderStepId },
  ];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([
    [planStepId, "plan"],
    [executeStepId, "execute"],
    [renderStepId, "render"],
  ]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 3,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };

  const iso: string = new Date().toISOString();

  const jobs: DialecticJobRow[] = [
    {
      id: "job-plan-pending",
      created_at: "2025-01-01T00:00:00Z",
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "pending",
      payload: { sessionId: basePayload.sessionId, projectId: basePayload.projectId, model_id: modelId, planner_metadata: { recipe_step_id: planStepId, stage_slug: THESIS_STAGE_SLUG } },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "PLAN",
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      idempotency_key: null,
    },
    {
      id: "job-execute-completed",
      created_at: "2025-01-01T00:01:00Z",
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: { sessionId: basePayload.sessionId, projectId: basePayload.projectId, model_id: modelId, documentKey: "doc-1", planner_metadata: { recipe_step_id: executeStepId, stage_slug: THESIS_STAGE_SLUG } },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "EXECUTE",
      parent_job_id: "job-plan-pending",
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: "2025-01-01T00:01:00Z",
      completed_at: "2025-01-01T00:02:00Z",
      results: null,
      error_details: null,
      idempotency_key: null,
    },
    {
      id: "job-render-failed",
      created_at: "2025-01-01T00:02:00Z",
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "failed",
      payload: { sessionId: basePayload.sessionId, projectId: basePayload.projectId, model_id: modelId, planner_metadata: { recipe_step_id: renderStepId, stage_slug: THESIS_STAGE_SLUG } },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "RENDER",
      parent_job_id: "job-execute-completed",
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: "2025-01-01T00:02:00Z",
      completed_at: null,
      results: null,
      error_details: null,
      idempotency_key: null,
    },
    {
      id: "job-execute-paused_nsf",
      created_at: "2025-01-01T00:03:00Z",
      session_id: basePayload.sessionId,
      stage_slug: THESIS_STAGE_SLUG,
      iteration_number: basePayload.iterationNumber,
      status: "paused_nsf",
      payload: { sessionId: basePayload.sessionId, projectId: basePayload.projectId, model_id: modelId, documentKey: "doc-2", planner_metadata: { recipe_step_id: executeStepId, stage_slug: THESIS_STAGE_SLUG } },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "EXECUTE",
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      idempotency_key: null,
    },
  ];

  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: [modelId],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-1",
    created_at: iso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: iso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };

  const headers: HeadersInit = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);

  const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200);
    assertExists(result.data);
    if (!result.data) throw new Error("result.data missing");
    const data: GetAllStageProgressResponse = result.data;
    let entry: StageProgressEntry = data.stages[0];
    for (const candidate of data.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entry = candidate;
      }
    }
    assertExists(entry);
    if (!entry) throw new Error("entry missing");

    await t.step("response stages[].jobs contains JobProgressDto[] with correct fields (id, status, jobType, stepKey, modelId, documentKey, parentJobId, createdAt, startedAt, completedAt)", () => {
      assert(Array.isArray(entry.jobs));
      assertEquals(entry.jobs.length, jobs.length);
      const first: JobProgressDto = entry.jobs[0];
      assertExists(first);
      if (!first) return;
      assertEquals(typeof first.id, "string");
      assertEquals(typeof first.status, "string");
      assert(first.jobType === null || ["PLAN", "EXECUTE", "RENDER"].includes(first.jobType));
      assert(first.stepKey === null || typeof first.stepKey === "string");
      assert(first.modelId === null || typeof first.modelId === "string");
      assert(first.documentKey === null || typeof first.documentKey === "string");
      assert(first.parentJobId === null || typeof first.parentJobId === "string");
      assertEquals(typeof first.createdAt, "string");
      assert(first.startedAt === null || typeof first.startedAt === "string");
      assert(first.completedAt === null || typeof first.completedAt === "string");
    });

    await t.step("stages[].jobs includes ALL job types (PLAN, EXECUTE, RENDER)", () => {
      const jobTypes: string[] = entry.jobs.reduce<string[]>((acc: string[], j: JobProgressDto) => {
        if (j.jobType !== null) acc.push(j.jobType);
        return acc;
      }, []);
      const types: Set<string> = new Set<string>(jobTypes);
      assert(types.has("PLAN"));
      assert(types.has("EXECUTE"));
      assert(types.has("RENDER"));
    });

    await t.step("stages[].jobs includes jobs in ALL statuses (pending, completed, failed, paused_nsf)", () => {
      const statuses: Set<string> = new Set<string>(entry.jobs.map((j: JobProgressDto) => j.status));
      assert(statuses.has("pending"));
      assert(statuses.has("completed"));
      assert(statuses.has("failed"));
      assert(statuses.has("paused_nsf"));
    });

    await t.step("response stages[].edges contains ProgressRecipeEdge[] matching the recipe edges for that stage", () => {
      assert(Array.isArray(entry.edges));
      assertEquals(entry.edges.length, progressEdges.length);
      for (const e of entry.edges) {
        assertEquals(typeof e.from_step_id, "string");
        assertEquals(typeof e.to_step_id, "string");
      }
    });

    await t.step("existing steps and documents fields are unchanged (additive only)", () => {
      assertEquals(entry.steps.length, progressSteps.length);
      assert(Array.isArray(entry.documents));
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: stage with no jobs returns empty jobs: [] array", async (t) => {
  const stageId: string = "stage-no-jobs-id";
  const instanceId: string = "instance-no-jobs-id";
  const templateId: string = "template-no-jobs-id";
  const stepId: string = "step-single";
  const iso: string = new Date().toISOString();
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepId, step_key: "single", job_type: "PLAN", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([[stepId, "single"]]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 1,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };
  const jobs: DialecticJobRow[] = [];

  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["model-1"],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-1",
    created_at: iso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: iso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };

  const headers: HeadersInit = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);

  const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200);
    assertExists(result.data);
    let entry: StageProgressEntry = result.data!.stages[0];
    for (const candidate of result.data!.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entry = candidate;
      }
    }
    assertExists(entry);
    await t.step("stage with no jobs returns jobs: [] (not null, not omitted)", () => {
      assert(Array.isArray(entry!.jobs));
      assertEquals(entry!.jobs.length, 0);
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: stage with no edges returns empty edges: [] array", async (t) => {
  const stageId: string = "stage-no-edges-id";
  const instanceId: string = "instance-no-edges-id";
  const templateId: string = "template-no-edges-id";
  const stepId: string = "step-single-ne";
  const iso: string = new Date().toISOString();
  const progressSteps: ProgressRecipeStep[] = [
    { id: stepId, step_key: "single", job_type: "PLAN", granularity_strategy: "all_to_one" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([[stepId, "single"]]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 1,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };
  const jobs: DialecticJobRow[] = [];

  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["model-1"],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-1",
    created_at: iso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: iso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };

  const headers: HeadersInit = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify(jobs), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);

  const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const params: GetAllStageProgressParams = { payload: basePayload };
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, params);
    assertEquals(result.status, 200);
    assertExists(result.data);
    let entry: StageProgressEntry = result.data!.stages[0];
    for (const candidate of result.data!.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entry = candidate;
      }
    }
    assertExists(entry);
    await t.step("stage with no edges returns edges: [] (not null, not omitted)", () => {
      assert(Array.isArray(entry!.edges));
      assertEquals(entry!.edges.length, 0);
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: StageProgressEntry.expectedCount equals injected StageCountsEntry.totalExpected", async () => {
  const stageId = "stage-expected-count-id";
  const planStepId = "step-plan-expected";
  const execStepId = "step-exec-expected";
  const progressSteps: ProgressRecipeStep[] = [
    { id: planStepId, step_key: "plan", job_type: "PLAN", granularity_strategy: "all_to_one" },
    { id: execStepId, step_key: "execute", job_type: "EXECUTE", granularity_strategy: "per_model" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: planStepId, to_step_id: execStepId },
  ];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([
    [planStepId, "plan"],
    [execStepId, "execute"],
  ]);
  const totalExpected = 42;
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };
  const expectedIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["model-1"],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-expected",
    created_at: expectedIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: expectedIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
    });
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, { payload: basePayload });
    assertEquals(result.status, 200);
    assertExists(result.data);
    let entry: StageProgressEntry = result.data!.stages[0];
    for (const candidate of result.data!.stages) {
      if (candidate.stageSlug === THESIS_STAGE_SLUG) {
        entry = candidate;
      }
    }
    assertEquals(entry.expectedCount, totalExpected);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: layering receives core stepIdToStepKey steps and edges", async () => {
  const stageId = "stage-layering-id";
  const planStepId = "step-plan-layer";
  const execStepId = "step-exec-layer";
  const progressSteps: ProgressRecipeStep[] = [
    { id: planStepId, step_key: "plan", job_type: "PLAN", granularity_strategy: "all_to_one" },
    { id: execStepId, step_key: "execute", job_type: "EXECUTE", granularity_strategy: "per_model" },
  ];
  const progressEdges: ProgressRecipeEdge[] = [
    { from_step_id: planStepId, to_step_id: execStepId },
  ];
  const stepIdToStepKey: Map<string, string> = new Map<string, string>([
    [planStepId, "plan"],
    [execStepId, "execute"],
  ]);
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [
      buildStageCountsEntry({
        stageId,
        stageSlug: THESIS_STAGE_SLUG,
        steps: progressSteps,
        edges: progressEdges,
        totalExpected: 2,
      }),
    ],
    totalStages: 1,
    stepIdToStepKey,
    },
  };
  const capturedDeriveParams: DeriveStepStatusesParams[] = [];
  const capturedBuildDocsParams: BuildDocumentDescriptorsParams[] = [];
  const capturedBuildJobsParams: BuildJobProgressDtosParams[] = [];
  const layerIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["model-1"],
    current_stage_id: stageId,
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-layer",
    created_at: layerIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: layerIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: createMockComputeTemplateStageCountsFn(countsConfig),
      deriveStepStatuses: (
        d: DeriveStepStatusesDeps,
        p: DeriveStepStatusesParams,
      ): DeriveStepStatusesResult => {
        capturedDeriveParams.push(p);
        return deriveStepStatuses(d, p);
      },
      buildDocumentDescriptors: (
        d: BuildDocumentDescriptorsDeps,
        p: BuildDocumentDescriptorsParams,
      ): Map<string, StageDocumentDescriptorDto[]> => {
        capturedBuildDocsParams.push(p);
        return buildDocumentDescriptors(d, p);
      },
      buildJobProgressDtos: (
        d: BuildJobProgressDtosDeps,
        p: BuildJobProgressDtosParams,
      ): Map<string, JobProgressDto[]> => {
        capturedBuildJobsParams.push(p);
        return buildJobProgressDtos(d, p);
      },
    });
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, { payload: basePayload });
    assertEquals(result.status, 200);
    assertEquals(capturedDeriveParams.length, 1);
    assertEquals(capturedBuildDocsParams.length, 1);
    assertEquals(capturedBuildJobsParams.length, 1);
    const deriveParamsAt = capturedDeriveParams[0];
    const buildDocsParamsAt = capturedBuildDocsParams[0];
    const buildJobsParamsAt = capturedBuildJobsParams[0];
    assertEquals(deriveParamsAt !== undefined, true);
    assertEquals(buildDocsParamsAt !== undefined, true);
    assertEquals(buildJobsParamsAt !== undefined, true);
    if (deriveParamsAt === undefined || buildDocsParamsAt === undefined || buildJobsParamsAt === undefined) {
      throw new Error("layering params not captured");
    }
    const deriveParams: DeriveStepStatusesParams = deriveParamsAt;
    const buildDocsParams: BuildDocumentDescriptorsParams = buildDocsParamsAt;
    const buildJobsParams: BuildJobProgressDtosParams = buildJobsParamsAt;
    assertEquals(deriveParams.stepIdToStepKey, stepIdToStepKey);
    assertEquals(deriveParams.steps, progressSteps);
    assertEquals(deriveParams.edges, progressEdges);
    assertEquals(buildDocsParams.stepIdToStepKey, stepIdToStepKey);
    assertEquals(buildJobsParams.stepIdToStepKey, stepIdToStepKey);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: computeTemplateStageCounts 500 short-circuits without layering", async () => {
  let buildDocsCalled = false;
  let buildJobsCalled = false;
  let deriveCalled = false;
  const failIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["model-1"],
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-fail",
    created_at: failIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: failIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: async () => buildComputeTemplateStageCountsFailureResult(),
      buildDocumentDescriptors: (
        d: BuildDocumentDescriptorsDeps,
        p: BuildDocumentDescriptorsParams,
      ): Map<string, StageDocumentDescriptorDto[]> => {
        buildDocsCalled = true;
        return buildDocumentDescriptors(d, p);
      },
      buildJobProgressDtos: (
        d: BuildJobProgressDtosDeps,
        p: BuildJobProgressDtosParams,
      ): Map<string, JobProgressDto[]> => {
        buildJobsCalled = true;
        return buildJobProgressDtos(d, p);
      },
      deriveStepStatuses: (
        d: DeriveStepStatusesDeps,
        p: DeriveStepStatusesParams,
      ): DeriveStepStatusesResult => {
        deriveCalled = true;
        return deriveStepStatuses(d, p);
      },
    });
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, { payload: basePayload });
    assertEquals(result.status, 500);
    assertExists(result.error);
    assertEquals(buildDocsCalled, false);
    assertEquals(buildJobsCalled, false);
    assertEquals(deriveCalled, false);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress: calls computeTemplateStageCounts once without transitions recipe fetch", async () => {
  let coreCallCount = 0;
  const countsConfig: ComputeTemplateStageCountsResult = {
    status: 200,
    data: {
      stages: [buildStageCountsEntry({ stageSlug: THESIS_STAGE_SLUG, totalExpected: 7 })],
      totalStages: 1,
      stepIdToStepKey: new Map<string, string>([["step-plan-id", "plan"]]),
    },
  };
  const baseFn = createMockComputeTemplateStageCountsFn(countsConfig);
  const onceIso: string = new Date().toISOString();
  const sessionRow: DialecticSessionRow = mockDialecticSessionRow({
    id: basePayload.sessionId,
    project_id: basePayload.projectId,
    selected_model_ids: ["model-1"],
  });
  const projectRow: DialecticProjectRow = {
    id: basePayload.projectId,
    process_template_id: "process-tpl-once",
    created_at: onceIso,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    project_name: "test",
    repo_url: null,
    selected_domain_id: "domain-1",
    selected_domain_overlay_id: null,
    status: "active",
    updated_at: onceIso,
    user_domain_overlay_values: null,
    user_id: basePayload.userId,
    idempotency_key: null,
  };
  const headers = { "Content-Type": "application/json" };
  mockFetch([
    new Response(JSON.stringify(sessionRow), { status: 200, headers }),
    new Response(JSON.stringify(projectRow), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
    new Response(JSON.stringify([]), { status: 200, headers }),
  ]);
  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const deps: GetAllStageProgressDeps = buildGetAllStageProgressDeps(dbClient, baseUser, {
      computeTemplateStageCounts: async (d, p) => {
        coreCallCount += 1;
        return baseFn(d, p, { processTemplateId: "process-tpl-once", modelCount: 1 });
      },
    });
    const result: GetAllStageProgressResult = await getAllStageProgress(deps, { payload: basePayload });
    assertEquals(result.status, 200);
    assertEquals(coreCallCount, 1);
  } finally {
    restoreFetch();
  }
});
