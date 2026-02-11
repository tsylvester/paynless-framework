import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, User } from "npm:@supabase/supabase-js@2";
import { restoreFetch, mockFetch } from "../_shared/supabase.mock.ts";
import { getAllStageProgress } from "./getAllStageProgress.ts";
import { Database, Json } from "../types_db.ts";
import {
  DialecticJobRow,
  DialecticProjectResourceRow,
  DialecticStage,
  DialecticStageRecipeStep,
  DialecticStageRecipeInstance,
  DialecticRecipeTemplateStep,
  GetAllStageProgressPayload,
  JobProgressEntry,
  StageProgressEntry,
  DialecticExecuteJobPayload,
  DialecticRenderJobPayload,
  DialecticPlanJobPayload,
} from "./dialectic.interface.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import { isJson } from "../_shared/utils/type_guards.ts";

const SUPABASE_URL = "http://localhost:54321";
const SUPABASE_ANON_KEY = "test-anon-key";

const basePayload: GetAllStageProgressPayload = {
  sessionId: "sess-123",
  iterationNumber: 1,
  userId: "user-123",
  projectId: "proj-123",
};

const baseUser: User = {
  id: basePayload.userId,
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

Deno.test("getAllStageProgress - Test 1: Handles root PLAN jobs without planner_metadata", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";
  const recipeTemplateId = "template-thesis";

  const jobs: DialecticJobRow[] = [
    {
      id: "job-plan-root-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-planner",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlug,
        iterationNumber: basePayload.iterationNumber,
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
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: recipeTemplateId,
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  mockFetch([
    // dialectic_generation_jobs
    new Response(JSON.stringify(jobs), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    // dialectic_stages
    new Response(JSON.stringify(stages), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    // dialectic_stage_recipe_instances
    new Response(JSON.stringify(instances), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    // dialectic_stage_recipe_steps (may be queried even if unused by this test)
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    // dialectic_project_resources (rendered docs)
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data.length, 1);
    assertEquals(result.data[0].stageSlug, stageSlug);

    const stageProgress: StageProgressEntry = result.data[0];
    assert("jobProgress" in stageProgress);

    const rootJobProgressKey = "__job:job-plan-root-1";
    assert(rootJobProgressKey in stageProgress.jobProgress);
    const root: JobProgressEntry = stageProgress.jobProgress[rootJobProgressKey];
    assertEquals(root.totalJobs, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 2: Handles RENDER jobs with different payload shape", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";
  const recipeTemplateId = "template-thesis";

  const renderPayload: DialecticRenderJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    documentKey: FileType.business_case,
    sourceContributionId: "contrib-123",
    documentIdentity: "doc-ident-1",
    template_filename: "thesis_business_case.md",
  };

  if(!isJson(renderPayload)) {
    throw new Error("Invalid render payload");
  }

  const jobs: DialecticJobRow[] = [
    {
      id: "job-render-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: renderPayload,
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "RENDER",
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: {
        pathContext: {
          projectId: basePayload.projectId,
          sessionId: basePayload.sessionId,
          iteration: basePayload.iterationNumber,
          stageSlug: stageSlug,
          documentKey: "business_case",
          fileType: "rendered_document",
          modelSlug: "model-a",
          sourceContributionId: "contrib-123",
        },
      },
      error_details: null,
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: recipeTemplateId,
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const resources: DialecticProjectResourceRow[] = [
    {
      id: "res-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: basePayload.projectId,
      user_id: basePayload.userId,
      storage_bucket: "dialectic-contributions",
      storage_path: "proj/session/iteration/documents",
      file_name: "model-a_0_business_case.md",
      mime_type: "text/markdown",
      size_bytes: 1,
      resource_type: "rendered_document",
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      source_contribution_id: "contrib-123",
      resource_description: null,
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(resources), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data.length, 1);
    const stageProgress = result.data[0];

    const renderJobProgressKey = "__job:job-render-1";
    assert(renderJobProgressKey in stageProgress.jobProgress);
    assertEquals(stageProgress.jobProgress[renderJobProgressKey].totalJobs, 1);
    assertEquals(stageProgress.documents.length, 1);
    assertEquals(stageProgress.documents[0].documentKey, "business_case");
    assertEquals(stageProgress.documents[0].jobId, "job-render-1");
    assertEquals(stageProgress.documents[0].latestRenderedResourceId, "res-1");
    assertEquals(stageProgress.documents[0].stepKey, undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 3: Matches EXECUTE jobs to steps via planner_metadata.recipe_step_id", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";
  const recipeTemplateId = "template-thesis";

  const recipeSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-1",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  const executePayload: DialecticExecuteJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
    planner_metadata: {
      recipe_step_id: "step-1",
      stage_slug: stageSlug,
    },
  };

  if(!isJson(executePayload)) {
    throw new Error("Invalid execute payload");
  }

  const jobs: DialecticJobRow[] = [
    {
      id: "job-exec-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: executePayload,
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
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: recipeTemplateId,
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data.length, 1);
    const stageProgress = result.data[0];
    assert("a_key" in stageProgress.jobProgress);
    assertEquals(stageProgress.jobProgress["a_key"].totalJobs, 1);
    assertExists(stageProgress.jobProgress["a_key"].modelJobStatuses);
    assertEquals(stageProgress.jobProgress["a_key"].modelJobStatuses["model-a"], "completed");
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 4: Works with both cloned instances and template-based recipes", async () => {
  const stageSlugA = "thesis";
  const stageSlugB = "synthesis";
  const stageIdA = "stage-a";
  const stageIdB = "stage-b";
  const instanceIdA = "instance-a";
  const instanceIdB = "instance-b";
  const templateIdB = "template-b";

  const jobs: DialecticJobRow[] = [
    {
      id: "job-a-exec",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlugA,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-a",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlugA,
        iterationNumber: basePayload.iterationNumber,
        prompt_template_id: "pt-a",
        output_type: "business_case",
        canonicalPathParams: { contributionType: "thesis" },
        inputs: {},
        planner_metadata: { recipe_step_id: "step-a1", stage_slug: stageSlugA },
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
    },
    {
      id: "job-b-exec",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlugB,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-b",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlugB,
        iterationNumber: basePayload.iterationNumber,
        prompt_template_id: "pt-b",
        output_type: "feature_spec",
        canonicalPathParams: { contributionType: "synthesis" },
        inputs: {},
        planner_metadata: { recipe_step_id: "step-t1", stage_slug: stageSlugB },
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
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageIdA,
      slug: stageSlugA,
      display_name: "A",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceIdA,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
    {
      id: stageIdB,
      slug: stageSlugB,
      display_name: "B",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceIdB,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceIdA,
      stage_id: stageIdA,
      template_id: "template-a",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: instanceIdB,
      stage_id: stageIdB,
      template_id: templateIdB,
      is_cloned: false,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const clonedSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-a1",
      instance_id: instanceIdA,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A1",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  const templateSteps: DialecticRecipeTemplateStep[] = [
    {
      id: "step-t1",
      template_id: templateIdB,
      step_number: 1,
      step_key: "t_key",
      step_slug: "t",
      step_name: "T1",
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.feature_spec,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      parallel_group: null,
      step_description: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(clonedSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(templateSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);

    const thesis = result.data.find((s: StageProgressEntry) => s.stageSlug === stageSlugA);
    const synthesis = result.data.find((s: StageProgressEntry) => s.stageSlug === stageSlugB);
    assertExists(thesis);
    assertExists(synthesis);
    assert("a_key" in thesis.jobProgress);
    assert("t_key" in synthesis.jobProgress);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 5: Aggregates per-model status for EXECUTE jobs", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";

  const recipeSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-1",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  const jobs: DialecticJobRow[] = [
    {
      id: "job-exec-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-a",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlug,
        iterationNumber: basePayload.iterationNumber,
        prompt_template_id: "pt-1",
        output_type: "business_case",
        canonicalPathParams: { contributionType: "thesis" },
        inputs: {},
        planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
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
    },
    {
      id: "job-exec-2",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "failed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-b",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlug,
        iterationNumber: basePayload.iterationNumber,
        prompt_template_id: "pt-1",
        output_type: "business_case",
        canonicalPathParams: { contributionType: "thesis" },
        inputs: {},
        planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
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
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: "template-thesis",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    const stageProgress = result.data[0];
    assertExists(stageProgress.jobProgress["a_key"].modelJobStatuses);
    assertEquals(stageProgress.jobProgress["a_key"].modelJobStatuses["model-a"], "completed");
    assertEquals(stageProgress.jobProgress["a_key"].modelJobStatuses["model-b"], "failed");
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 6: Uses job_type column, not payload inference", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";

  const executeLikePayload: DialecticExecuteJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
    planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
  };

  if(!isJson(executeLikePayload)) {
    throw new Error("Invalid execute like payload");
  }

  const jobs: DialecticJobRow[] = [
    {
      id: "job-misleading-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: executeLikePayload,
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
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: "template-thesis",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data.length, 1);
    const stageProgress = result.data[0];

    const misleadingJobProgressKey = "__job:job-misleading-1";
    assert(misleadingJobProgressKey in stageProgress.jobProgress);
    assertEquals(stageProgress.jobProgress[misleadingJobProgressKey].totalJobs, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 7: Does not skip jobs with missing payload fields", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";

  const payloadWithoutModelId: Json = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
  };

  const payloadWithoutDocumentKey: DialecticExecuteJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
    planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
  };

  if(!isJson(payloadWithoutDocumentKey)) {
    throw new Error("Invalid payload without document key");
  }

  if(!isJson(payloadWithoutModelId)) {
    throw new Error("Invalid payload without model id");
  }

  const jobs: DialecticJobRow[] = [
    {
      id: "job-missing-model",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: payloadWithoutModelId,
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
    },
    {
      id: "job-missing-doc-key",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: payloadWithoutDocumentKey,
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
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: "template-thesis",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const recipeSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-1",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 500);
    assertExists(result.error);
    assertEquals(result.error.status, 500);
    assertEquals(result.error.message, "Job payload model_id is null or invalid");
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 8: Continuation jobs group with parent under same step", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";

  const recipeSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-1",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  const parentPayload: DialecticExecuteJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
    planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
  };

  const continuationPayload: DialecticExecuteJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
    // Intentionally omit planner_metadata to ensure parent_job_id grouping is used
  };

  if(!isJson(parentPayload)) {
    throw new Error("Invalid parent payload");
  }

  if(!isJson(continuationPayload)) {
    throw new Error("Invalid continuation payload");
  }

  const jobs: DialecticJobRow[] = [
    {
      id: "job-parent",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: parentPayload,
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
    },
    {
      id: "job-child",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: continuationPayload,
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 1,
      max_retries: 0,
      job_type: "EXECUTE",
      parent_job_id: "job-parent",
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: null,
      error_details: null,
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: "template-thesis",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data[0].jobProgress["a_key"].totalJobs, 2);
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 9: Derives correct step status from heterogeneous job statuses", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";

  const recipeSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-1",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  const jobs: DialecticJobRow[] = [
    {
      id: "job-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "in_progress",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-a",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlug,
        iterationNumber: basePayload.iterationNumber,
        prompt_template_id: "pt-1",
        output_type: "business_case",
        canonicalPathParams: { contributionType: "thesis" },
        inputs: {},
        planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
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
    },
    {
      id: "job-2",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "failed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-b",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlug,
        iterationNumber: basePayload.iterationNumber,
        prompt_template_id: "pt-1",
        output_type: "business_case",
        canonicalPathParams: { contributionType: "thesis" },
        inputs: {},
        planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
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
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: "template-thesis",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data[0].stepStatuses["a_key"], "failed");
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 10: Reports documents array from RENDER jobs, not EXECUTE jobs", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";

  const jobs: DialecticJobRow[] = [
    {
      id: "job-exec-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-a",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlug,
        iterationNumber: basePayload.iterationNumber,
        prompt_template_id: "pt-1",
        output_type: "business_case",
        canonicalPathParams: { contributionType: "thesis" },
        inputs: {},
        planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
        sourceContributionId: "contrib-1",
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
    },
    {
      id: "job-render-1",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: {
        sessionId: basePayload.sessionId,
        projectId: basePayload.projectId,
        model_id: "model-a",
        walletId: "wallet-1",
        user_jwt: "jwt",
        stageSlug: stageSlug,
        iterationNumber: basePayload.iterationNumber,
        documentKey: "business_case",
        sourceContributionId: "contrib-1",
        documentIdentity: "doc-ident-1",
        template_filename: "thesis_business_case.md",
      },
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "RENDER",
      parent_job_id: "job-exec-1",
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: {
        pathContext: {
          projectId: basePayload.projectId,
          sessionId: basePayload.sessionId,
          iteration: basePayload.iterationNumber,
          stageSlug: stageSlug,
          documentKey: "business_case",
          fileType: "rendered_document",
          modelSlug: "model-a",
          sourceContributionId: "contrib-1",
        },
      },
      error_details: null,
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: "template-thesis",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const recipeSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-1",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  const resources: DialecticProjectResourceRow[] = [
    {
      id: "res-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: basePayload.projectId,
      user_id: basePayload.userId,
      storage_bucket: "dialectic-contributions",
      storage_path: "proj/session/iteration/documents",
      file_name: "model-a_0_business_case.md",
      mime_type: "text/markdown",
      size_bytes: 1,
      resource_type: "rendered_document",
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      source_contribution_id: "contrib-1",
      resource_description: null,
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(resources), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data[0].documents.length, 1);
    assertEquals(result.data[0].documents[0].jobId, "job-render-1");
    assertEquals(result.data[0].documents[0].documentKey, "business_case");
    assertEquals(result.data[0].documents[0].latestRenderedResourceId, "res-1");
    assertEquals(result.data[0].documents[0].stepKey, "a_key");
  } finally {
    restoreFetch();
  }
});

Deno.test("getAllStageProgress - Test 11: Supports multiple rendered documents across multiple models for hydration", async () => {
  const stageSlug = "thesis";
  const stageId = "stage-thesis";
  const instanceId = "instance-thesis";

  const recipeSteps: DialecticStageRecipeStep[] = [
    {
      id: "step-1",
      instance_id: instanceId,
      step_key: "a_key",
      step_slug: "a",
      step_name: "A",
      execution_order: 1,
      parallel_group: null,
      branch_key: null,
      job_type: "EXECUTE",
      prompt_type: "Turn",
      prompt_template_id: null,
      output_type: FileType.business_case,
      granularity_strategy: "per_model",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      template_step_id: null,
      step_description: null,
    },
  ];

  const execPayloadA: DialecticExecuteJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
    planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
  };

  const execPayloadB: DialecticExecuteJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-b",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    prompt_template_id: "pt-1",
    output_type: FileType.business_case,
    canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
    inputs: {},
    planner_metadata: { recipe_step_id: "step-1", stage_slug: stageSlug },
  };

  const renderPayloadA: DialecticRenderJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-a",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    documentKey: FileType.business_case,
    sourceContributionId: "contrib-a",
    documentIdentity: "doc-ident-a",
    template_filename: "thesis_business_case.md",
  };

  const renderPayloadB: DialecticRenderJobPayload = {
    sessionId: basePayload.sessionId,
    projectId: basePayload.projectId,
    model_id: "model-b",
    walletId: "wallet-1",
    user_jwt: "jwt",
    stageSlug: stageSlug,
    iterationNumber: basePayload.iterationNumber,
    documentKey: FileType.business_case,
    sourceContributionId: "contrib-b",
    documentIdentity: "doc-ident-b",
    template_filename: "thesis_business_case.md",
  };

  if (!isJson(execPayloadA) || !isJson(execPayloadB)) {
    throw new Error("Invalid execute payload(s)");
  }
  if (!isJson(renderPayloadA) || !isJson(renderPayloadB)) {
    throw new Error("Invalid render payload(s)");
  }

  const jobs: DialecticJobRow[] = [
    {
      id: "job-exec-a",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: execPayloadA,
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
    },
    {
      id: "job-exec-b",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: execPayloadB,
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
    },
    {
      id: "job-render-a",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: renderPayloadA,
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "RENDER",
      parent_job_id: "job-exec-a",
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: null,
      error_details: null,
    },
    {
      id: "job-render-b",
      created_at: new Date().toISOString(),
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      status: "completed",
      payload: renderPayloadB,
      user_id: basePayload.userId,
      is_test_job: false,
      attempt_count: 0,
      max_retries: 0,
      job_type: "RENDER",
      parent_job_id: "job-exec-b",
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      results: null,
      error_details: null,
    },
  ];

  const stages: DialecticStage[] = [
    {
      id: stageId,
      slug: stageSlug,
      display_name: "Thesis",
      description: null,
      created_at: new Date().toISOString(),
      expected_output_template_ids: [],
      active_recipe_instance_id: instanceId,
      default_system_prompt_id: null,
      recipe_template_id: null,
    },
  ];

  const instances: DialecticStageRecipeInstance[] = [
    {
      id: instanceId,
      stage_id: stageId,
      template_id: "template-thesis",
      is_cloned: true,
      cloned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const resources: DialecticProjectResourceRow[] = [
    {
      id: "res-a",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: basePayload.projectId,
      user_id: basePayload.userId,
      storage_bucket: "dialectic-contributions",
      storage_path: "proj/session/iteration/documents",
      file_name: "model-a_0_business_case.md",
      mime_type: "text/markdown",
      size_bytes: 1,
      resource_type: "rendered_document",
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      source_contribution_id: "contrib-a",
      resource_description: null,
    },
    {
      id: "res-b",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: basePayload.projectId,
      user_id: basePayload.userId,
      storage_bucket: "dialectic-contributions",
      storage_path: "proj/session/iteration/documents",
      file_name: "model-b_0_business_case.md",
      mime_type: "text/markdown",
      size_bytes: 1,
      resource_type: "rendered_document",
      session_id: basePayload.sessionId,
      stage_slug: stageSlug,
      iteration_number: basePayload.iterationNumber,
      source_contribution_id: "contrib-b",
      resource_description: null,
    },
  ];

  mockFetch([
    new Response(JSON.stringify(jobs), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(stages), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(instances), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(recipeSteps), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(resources), { status: 200, headers: { "Content-Type": "application/json" } }),
  ]);

  const dbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await getAllStageProgress(basePayload, dbClient, baseUser);
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data.length, 1);
    const stageProgress: StageProgressEntry = result.data[0];

    assertExists(stageProgress.jobProgress["a_key"]);
    assertEquals(stageProgress.jobProgress["a_key"].totalJobs, 2);
    assertExists(stageProgress.jobProgress["a_key"].modelJobStatuses);
    assertEquals(stageProgress.jobProgress["a_key"].modelJobStatuses["model-a"], "completed");
    assertEquals(stageProgress.jobProgress["a_key"].modelJobStatuses["model-b"], "completed");

    assertEquals(stageProgress.documents.length, 2);

    const docA = stageProgress.documents.find((d) => d.modelId === "model-a");
    const docB = stageProgress.documents.find((d) => d.modelId === "model-b");
    assertExists(docA);
    assertExists(docB);
    if (!docA || !docB) {
      throw new Error("Documents not found by modelId");
    }

    assertEquals(docA.documentKey, "business_case");
    assertEquals(docA.jobId, "job-render-a");
    assertEquals(docA.latestRenderedResourceId, "res-a");
    assertEquals(docA.stepKey, "a_key");

    assertEquals(docB.documentKey, "business_case");
    assertEquals(docB.jobId, "job-render-b");
    assertEquals(docB.latestRenderedResourceId, "res-b");
    assertEquals(docB.stepKey, "a_key");
  } finally {
    restoreFetch();
  }
});

