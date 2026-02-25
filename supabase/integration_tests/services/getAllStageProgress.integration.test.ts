import {
  beforeEach,
  afterEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database, TablesInsert } from "../../functions/types_db.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  setSharedAdminClient,
} from "../../functions/_shared/_integration.test.utils.ts";
import {
  DialecticExecuteJobPayload,
  DialecticPlanJobPayload,
  DialecticRenderJobPayload,
  DialecticProject,
  GetAllStageProgressPayload,
  StageProgressEntry,
  StartSessionPayload,
  StartSessionSuccessResponse,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { FileType } from "../../functions/_shared/types/file_manager.types.ts";
import { isJson } from "../../functions/_shared/utils/type_guards.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { getAllStageProgress } from "../../functions/dialectic-service/getAllStageProgress.ts";

describe("getAllStageProgress Integration Tests", () => {
  let adminClient: SupabaseClient<Database>;

  beforeEach(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);
  });

  afterEach(async () => {
    await coreCleanupTestResources("local");
  });

  it("Integration Test 1: Full thesis stage with root PLAN + EXECUTE + RENDER jobs", async () => {
    const { userId, userClient, jwt } = await coreCreateAndSetupTestUser();
    const userResponse = await userClient.auth.getUser();
    const testUser: User | null = userResponse.data.user;
    assertExists(testUser, "Test user could not be created or fetched.");

    await coreEnsureTestUserAndWallet(userId, 1000000, "local");
    const walletResponse = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", userId)
      .is("organization_id", null)
      .single();
    assertEquals(walletResponse.error, null);
    assertExists(walletResponse.data);
    const walletId: string = walletResponse.data.wallet_id;

    const domainResponse = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assertEquals(domainResponse.error, null);
    assertExists(domainResponse.data);
    const domainId: string = domainResponse.data.id;

    const projectName: string = `getAllStageProgress IT1 ${crypto.randomUUID().slice(0, 8)}`;
    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("initialUserPromptText", "Integration Test: getAllStageProgress thesis.");
    formData.append("selectedDomainId", domainId);

    const projectResult = await createProject(formData, adminClient, testUser);
    assertEquals(projectResult.error, undefined);
    assertExists(projectResult.data);
    if(!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    const project: DialecticProject = projectResult.data;

    const modelResponse = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("is_active", true)
      .eq("is_enabled", true)
      .eq("is_default_embedding", false)
      .limit(1)
      .single();
    assertEquals(modelResponse.error, null);
    assertExists(modelResponse.data);
    const modelId: string = modelResponse.data.id;

    const sessionPayload: StartSessionPayload = {
      projectId: project.id,
      selectedModelIds: [modelId],
      sessionDescription: "getAllStageProgress IT1 session",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    assertEquals(sessionResult.error, undefined);
    assertExists(sessionResult.data);
    if(!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    const session: StartSessionSuccessResponse = sessionResult.data;

    const stageSlug: string = "thesis";
    const stageResponse = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", stageSlug)
      .single();
    assertEquals(stageResponse.error, null);
    assertExists(stageResponse.data);
    assertExists(stageResponse.data.active_recipe_instance_id);
    const instanceId: string = stageResponse.data.active_recipe_instance_id;

    const instanceResponse = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", instanceId)
      .single();
    assertEquals(instanceResponse.error, null);
    assertExists(instanceResponse.data);
    const isCloned: boolean = instanceResponse.data.is_cloned === true;

    let executeRecipeStepId: string;
    let executeStepKey: string;

    if (isCloned) {
      const stepResponse = await adminClient
        .from("dialectic_stage_recipe_steps")
        .select("id, step_key, job_type")
        .eq("instance_id", instanceId)
        .eq("job_type", "EXECUTE")
        .limit(1)
        .single();
      assertEquals(stepResponse.error, null);
      assertExists(stepResponse.data);
      executeRecipeStepId = stepResponse.data.id;
      executeStepKey = stepResponse.data.step_key;
    } else {
      assertExists(instanceResponse.data.template_id);
      const templateId: string = instanceResponse.data.template_id;
      const stepResponse = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("id, step_key, job_type")
        .eq("template_id", templateId)
        .eq("job_type", "EXECUTE")
        .limit(1)
        .single();
      assertEquals(stepResponse.error, null);
      assertExists(stepResponse.data);
      executeRecipeStepId = stepResponse.data.id;
      executeStepKey = stepResponse.data.step_key;
    }

    const iterationNumber: number = 1;

    const planPayload: DialecticPlanJobPayload = {
      sessionId: session.id,
      projectId: project.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: walletId,
      continueUntilComplete: true,
      user_jwt: jwt,
      model_id: modelId,
    };

    if(!isJson(planPayload)) {
      throw new Error("Invalid plan payload");
    }
    const planJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
      session_id: session.id,
      user_id: userId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
      payload: planPayload,
      status: "completed",
      job_type: "PLAN",
      is_test_job: true,
      max_retries: 0,
      attempt_count: 0,
      results: null,
      error_details: null,
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
    };
    const planJobResponse = await adminClient
      .from("dialectic_generation_jobs")
      .insert(planJobInsert)
      .select("id")
      .single();
    assertEquals(planJobResponse.error, null);
    assertExists(planJobResponse.data);
    const planJobId: string = planJobResponse.data.id;

    const executePayload: DialecticExecuteJobPayload = {
      sessionId: session.id,
      projectId: project.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: walletId,
      user_jwt: jwt,
      model_id: modelId,
      prompt_template_id: "pt-integration-test",
      output_type: FileType.business_case,
      canonicalPathParams: { contributionType: "thesis", stageSlug: stageSlug },
      inputs: {},
      planner_metadata: { recipe_step_id: executeRecipeStepId, stage_slug: stageSlug },
    };
    if(!isJson(executePayload)) {
      throw new Error("Invalid execute payload");
    }
    const executeJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
      session_id: session.id,
      user_id: userId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
      payload: executePayload,
      status: "completed",
      job_type: "EXECUTE",
      is_test_job: true,
      max_retries: 0,
      attempt_count: 0,
      results: null,
      error_details: null,
      parent_job_id: planJobId,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
    };
    const executeJobResponse = await adminClient
      .from("dialectic_generation_jobs")
      .insert(executeJobInsert)
      .select("id")
      .single();
    assertEquals(executeJobResponse.error, null);
    assertExists(executeJobResponse.data);
    const executeJobId: string = executeJobResponse.data.id;

    const sourceContributionId: string = crypto.randomUUID();
    const contributionInsert: TablesInsert<"dialectic_contributions"> = {
      id: sourceContributionId,
      session_id: session.id,
      stage: stageSlug,
      iteration_number: iterationNumber,
      storage_path: `integration_tests/${project.id}/${session.id}/${stageSlug}/${sourceContributionId}`,
      storage_bucket: "dialectic-contributions",
      mime_type: "text/markdown",
      is_latest_edit: true,
      is_header: false,
      edit_version: 1,
      user_id: userId,
      model_id: modelId,
      model_name: "integration-test-model",
    };
    const contributionResponse = await adminClient
      .from("dialectic_contributions")
      .insert(contributionInsert)
      .select("id")
      .single();
    assertEquals(contributionResponse.error, null);
    assertExists(contributionResponse.data);

    const resourcePath: string = `integration_tests/${project.id}/session_${session.id}/iteration_${iterationNumber}/${stageSlug}/documents`;
    const resourceFileName: string = `${modelId}_0_business_case.md`;
    const resourceInsert: TablesInsert<"dialectic_project_resources"> = {
      project_id: project.id,
      user_id: userId,
      session_id: session.id,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
      source_contribution_id: sourceContributionId,
      resource_type: "rendered_document",
      storage_bucket: "dialectic-contributions",
      storage_path: resourcePath,
      file_name: resourceFileName,
      mime_type: "text/markdown",
      size_bytes: 1,
      resource_description: null,
    };
    const resourceResponse = await adminClient
      .from("dialectic_project_resources")
      .insert(resourceInsert)
      .select("id")
      .single();
    assertEquals(resourceResponse.error, null);
    assertExists(resourceResponse.data);
    const renderedResourceId: string = resourceResponse.data.id;

    const renderPayload: DialecticRenderJobPayload = {
      sessionId: session.id,
      projectId: project.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: walletId,
      user_jwt: jwt,
      model_id: modelId,
      documentIdentity: sourceContributionId,
      documentKey: FileType.business_case,
      sourceContributionId: sourceContributionId,
      template_filename: "thesis_business_case.md",
    };
    if(!isJson(renderPayload)) {
      throw new Error("Invalid render payload");
    }
    const renderJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
      session_id: session.id,
      user_id: userId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
      payload: renderPayload,
      status: "completed",
      job_type: "RENDER",
      is_test_job: true,
      max_retries: 0,
      attempt_count: 0,
      results: null,
      error_details: null,
      parent_job_id: executeJobId,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
    };
    const renderJobResponse = await adminClient
      .from("dialectic_generation_jobs")
      .insert(renderJobInsert)
      .select("id")
      .single();
    assertEquals(renderJobResponse.error, null);
    assertExists(renderJobResponse.data);
    const renderJobId: string = renderJobResponse.data.id;

    const progressPayload: GetAllStageProgressPayload = {
      sessionId: session.id,
      iterationNumber: iterationNumber,
      userId: userId,
      projectId: project.id,
    };
    const progressResult = await getAllStageProgress(progressPayload, adminClient, testUser);
    assertEquals(progressResult.status, 200);
    assertExists(progressResult.data);
    if(!progressResult.data) {
      throw new Error("Progress result returned no data");
    }
    const thesisEntry: StageProgressEntry | undefined = progressResult.data.find((s: StageProgressEntry) => s.stageSlug === stageSlug);
    assertExists(thesisEntry);
    if(!thesisEntry) {
      throw new Error("Thesis entry not found");
    }

    const planKey: string = `__job:${planJobId}`;
    const renderKey: string = `__job:${renderJobId}`;

    assert(planKey in thesisEntry.jobProgress);
    assert(renderKey in thesisEntry.jobProgress);
    assert(executeStepKey in thesisEntry.jobProgress);

    assertEquals(thesisEntry.documents.length, 1);
    assertEquals(thesisEntry.documents[0].jobId, renderJobId);
    assertEquals(thesisEntry.documents[0].documentKey, "business_case");
    assertEquals(thesisEntry.documents[0].latestRenderedResourceId, renderedResourceId);
    assertEquals(thesisEntry.documents[0].stepKey, executeStepKey);

    assertEquals(thesisEntry.stepStatuses[executeStepKey], "completed");
    assertEquals(thesisEntry.stepStatuses[planKey], undefined);
    assertEquals(thesisEntry.stepStatuses[renderKey], undefined);

    const cleanupJobs = await adminClient
      .from("dialectic_generation_jobs")
      .delete()
      .eq("session_id", session.id);
    assertEquals(cleanupJobs.error, null);
    const cleanupResources = await adminClient
      .from("dialectic_project_resources")
      .delete()
      .eq("project_id", project.id);
    assertEquals(cleanupResources.error, null);
    const cleanupContributions = await adminClient
      .from("dialectic_contributions")
      .delete()
      .eq("session_id", session.id);
    assertEquals(cleanupContributions.error, null);
    const cleanupSession = await adminClient
      .from("dialectic_sessions")
      .delete()
      .eq("id", session.id);
    assertEquals(cleanupSession.error, null);
    const cleanupProject = await adminClient
      .from("dialectic_projects")
      .delete()
      .eq("id", project.id);
    assertEquals(cleanupProject.error, null);
  });

  it("Integration Test 2: Synthesis stage with pairwise EXECUTE jobs (n=3 models)", async () => {
    const { userId, userClient, jwt } = await coreCreateAndSetupTestUser();
    const userResponse = await userClient.auth.getUser();
    const testUser: User | null = userResponse.data.user;
    assertExists(testUser, "Test user could not be created or fetched.");

    await coreEnsureTestUserAndWallet(userId, 1000000, "local");
    const walletResponse = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", userId)
      .is("organization_id", null)
      .single();
    assertEquals(walletResponse.error, null);
    assertExists(walletResponse.data);
    const walletId: string = walletResponse.data.wallet_id;

    const domainResponse = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assertEquals(domainResponse.error, null);
    assertExists(domainResponse.data);
    const domainId: string = domainResponse.data.id;

    const projectName: string = `getAllStageProgress IT2 ${crypto.randomUUID().slice(0, 8)}`;
    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("initialUserPromptText", "Integration Test: getAllStageProgress synthesis.");
    formData.append("selectedDomainId", domainId);

    const projectResult = await createProject(formData, adminClient, testUser);
    assertEquals(projectResult.error, undefined);
    assertExists(projectResult.data);
    if(!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    const project: DialecticProject = projectResult.data;

    const modelsResponse = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("is_active", true)
      .eq("is_enabled", true)
      .eq("is_default_embedding", false)
      .limit(3);
    assertEquals(modelsResponse.error, null);
    assertExists(modelsResponse.data);
    assert(modelsResponse.data.length === 3, "Integration precondition failed: need 3 active non-embedding models.");
    const modelIds: string[] = modelsResponse.data.map((m) => m.id);

    const sessionPayload: StartSessionPayload = {
      projectId: project.id,
      selectedModelIds: modelIds,
      sessionDescription: "getAllStageProgress IT2 session",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    assertEquals(sessionResult.error, undefined);
    assertExists(sessionResult.data);
    if(!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    const session: StartSessionSuccessResponse = sessionResult.data;

    const stageSlug: string = "synthesis";
    const stageResponse = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", stageSlug)
      .single();
    assertEquals(stageResponse.error, null);
    assertExists(stageResponse.data);
    assertExists(stageResponse.data.active_recipe_instance_id);
    const instanceId: string = stageResponse.data.active_recipe_instance_id;

    const instanceResponse = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", instanceId)
      .single();
    assertEquals(instanceResponse.error, null);
    assertExists(instanceResponse.data);
    const isCloned: boolean = instanceResponse.data.is_cloned === true;

    let pairwiseRecipeStepId: string | null = null;
    let pairwiseStepKey: string | null = null;

    if (isCloned) {
      const stepResponse = await adminClient
        .from("dialectic_stage_recipe_steps")
        .select("id, step_key, step_slug, job_type")
        .eq("instance_id", instanceId)
        .eq("job_type", "EXECUTE");
      assertEquals(stepResponse.error, null);
      assertExists(stepResponse.data);
      for (const row of stepResponse.data) {
        if (typeof row.step_slug === "string" && row.step_slug.includes("pairwise")) {
          pairwiseRecipeStepId = row.id;
          pairwiseStepKey = row.step_key;
          break;
        }
      }
    } else {
      assertExists(instanceResponse.data.template_id);
      const templateId: string = instanceResponse.data.template_id;
      const stepResponse = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("id, step_key, step_slug, job_type")
        .eq("template_id", templateId)
        .eq("job_type", "EXECUTE");
      assertEquals(stepResponse.error, null);
      assertExists(stepResponse.data);
      for (const row of stepResponse.data) {
        if (typeof row.step_slug === "string" && row.step_slug.includes("pairwise")) {
          pairwiseRecipeStepId = row.id;
          pairwiseStepKey = row.step_key;
          break;
        }
      }
    }

    assertExists(pairwiseRecipeStepId, "Integration precondition failed: could not locate a synthesis pairwise EXECUTE step.");
    assertExists(pairwiseStepKey, "Integration precondition failed: could not locate a synthesis pairwise step_key.");

    const iterationNumber: number = 1;
    const totalJobs: number = 27;
    const jobIds: string[] = [];

    if(!pairwiseRecipeStepId) {
      throw new Error("Integration precondition failed: could not locate a synthesis pairwise recipe step id.");
    }
    if(!pairwiseStepKey) {
      throw new Error("Integration precondition failed: could not locate a synthesis pairwise step key.");
    }

    for (let i = 0; i < totalJobs; i++) {
      const modelId: string = modelIds[i % modelIds.length];
      const executePayload: DialecticExecuteJobPayload = {
        sessionId: session.id,
        projectId: project.id,
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        walletId: walletId,
        user_jwt: jwt,
        model_id: modelId,
        prompt_template_id: "pt-integration-test-pairwise",
        output_type: FileType.business_case,
        canonicalPathParams: { contributionType: "synthesis", stageSlug: stageSlug },
        inputs: {},
        planner_metadata: { recipe_step_id: pairwiseRecipeStepId, stage_slug: stageSlug },
      };
      if(!isJson(executePayload)) {
        throw new Error("Invalid execute payload");
      }
      const executeJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
        session_id: session.id,
        user_id: userId,
        stage_slug: stageSlug,
        iteration_number: iterationNumber,
        payload: executePayload,
        status: "completed",
        job_type: "EXECUTE",
        is_test_job: true,
        max_retries: 0,
        attempt_count: 0,
        results: null,
        error_details: null,
        parent_job_id: null,
        prerequisite_job_id: null,
        target_contribution_id: null,
        started_at: null,
        completed_at: new Date().toISOString(),
      };
      const executeJobResponse = await adminClient
        .from("dialectic_generation_jobs")
        .insert(executeJobInsert)
        .select("id")
        .single();
      assertEquals(executeJobResponse.error, null);
      assertExists(executeJobResponse.data);
      jobIds.push(executeJobResponse.data.id);
    }

    const progressPayload: GetAllStageProgressPayload = {
      sessionId: session.id,
      iterationNumber: iterationNumber,
      userId: userId,
      projectId: project.id,
    };
    const progressResult = await getAllStageProgress(progressPayload, adminClient, testUser);
    assertEquals(progressResult.status, 200);
    assertExists(progressResult.data);
    if(!progressResult.data) {
      throw new Error("Progress result returned no data");
    }
    const synthesisEntry: StageProgressEntry | undefined = progressResult.data.find((s: StageProgressEntry) => s.stageSlug === stageSlug);
    assertExists(synthesisEntry);
    if(!synthesisEntry) {
      throw new Error("Synthesis entry not found");
    }
    assertExists(synthesisEntry.jobProgress[pairwiseStepKey]);
    assertEquals(synthesisEntry.jobProgress[pairwiseStepKey].totalJobs, totalJobs);
    assertEquals(synthesisEntry.stepStatuses[pairwiseStepKey], "completed");

    const cleanupJobs = await adminClient
      .from("dialectic_generation_jobs")
      .delete()
      .eq("session_id", session.id);
    assertEquals(cleanupJobs.error, null);
    const cleanupResources = await adminClient
      .from("dialectic_project_resources")
      .delete()
      .eq("project_id", project.id);
    assertEquals(cleanupResources.error, null);
    const cleanupContributions = await adminClient
      .from("dialectic_contributions")
      .delete()
      .eq("session_id", session.id);
    assertEquals(cleanupContributions.error, null);
    const cleanupSession = await adminClient
      .from("dialectic_sessions")
      .delete()
      .eq("id", session.id);
    assertEquals(cleanupSession.error, null);
    const cleanupProject = await adminClient
      .from("dialectic_projects")
      .delete()
      .eq("id", project.id);
    assertEquals(cleanupProject.error, null);
  });

  it({
    name: "Integration Test 3: Cloned vs template recipe instances map recipe steps correctly",
    ignore: true,
    fn: async () => {
    const { userId, userClient, jwt } = await coreCreateAndSetupTestUser();
    const userResponse = await userClient.auth.getUser();
    const testUser: User | null = userResponse.data.user;
    assertExists(testUser, "Test user could not be created or fetched.");

    await coreEnsureTestUserAndWallet(userId, 1000000, "local");
    const walletResponse = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", userId)
      .is("organization_id", null)
      .single();
    assertEquals(walletResponse.error, null);
    assertExists(walletResponse.data);
    const walletId: string = walletResponse.data.wallet_id;

    const domainResponse = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assertEquals(domainResponse.error, null);
    assertExists(domainResponse.data);
    const domainId: string = domainResponse.data.id;

    const projectName: string = `getAllStageProgress IT3 ${crypto.randomUUID().slice(0, 8)}`;
    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("initialUserPromptText", "Integration Test: getAllStageProgress cloned vs template.");
    formData.append("selectedDomainId", domainId);

    const projectResult = await createProject(formData, adminClient, testUser);
    assertEquals(projectResult.error, undefined);
    assertExists(projectResult.data);
    if(!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    const project: DialecticProject = projectResult.data;

    const modelResponse = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("is_active", true)
      .eq("is_enabled", true)
      .eq("is_default_embedding", false)
      .limit(1)
      .single();
    assertEquals(modelResponse.error, null);
    assertExists(modelResponse.data);
    const modelId: string = modelResponse.data.id;

    const stageRowsResponse = await adminClient
      .from("dialectic_stages")
      .select("slug, active_recipe_instance_id")
      .in("slug", ["thesis", "antithesis", "synthesis", "parenthesis", "paralysis"]);
    assertEquals(stageRowsResponse.error, null);
    assertExists(stageRowsResponse.data);

    let clonedStageSlug: string | null = null;
    let clonedInstanceId: string | null = null;
    let templateStageSlug: string | null = null;
    let templateInstanceId: string | null = null;
    let templateId: string | null = null;

    for (const stageRow of stageRowsResponse.data) {
      if (typeof stageRow.active_recipe_instance_id !== "string" || stageRow.active_recipe_instance_id.length === 0) {
        continue;
      }
      const instanceResponse = await adminClient
        .from("dialectic_stage_recipe_instances")
        .select("id, is_cloned, template_id")
        .eq("id", stageRow.active_recipe_instance_id)
        .single();
      if (instanceResponse.error) {
        continue;
      }
      if (!instanceResponse.data) {
        continue;
      }

      if (instanceResponse.data.is_cloned === true && !clonedStageSlug) {
        clonedStageSlug = stageRow.slug;
        clonedInstanceId = instanceResponse.data.id;
      }
      if (instanceResponse.data.is_cloned === false && !templateStageSlug) {
        templateStageSlug = stageRow.slug;
        templateInstanceId = instanceResponse.data.id;
        templateId = instanceResponse.data.template_id;
      }
    }

    assertExists(clonedStageSlug, "Integration precondition failed: no stage with a cloned recipe instance found.");
    assertExists(clonedInstanceId, "Integration precondition failed: no cloned recipe instance id found.");
    assertExists(templateStageSlug, "Integration precondition failed: no stage with a template recipe instance found.");
    assertExists(templateInstanceId, "Integration precondition failed: no template recipe instance id found.");
    assertExists(templateId, "Integration precondition failed: template instance has no template_id.");

    const sessionPayloadA: StartSessionPayload = {
      projectId: project.id,
      selectedModelIds: [modelId],
      sessionDescription: "getAllStageProgress IT3 session A",
    };
    const sessionPayloadB: StartSessionPayload = {
      projectId: project.id,
      selectedModelIds: [modelId],
      sessionDescription: "getAllStageProgress IT3 session B",
    };

    const sessionResultA = await startSession(testUser, adminClient, sessionPayloadA);
    assertEquals(sessionResultA.error, undefined);
    assertExists(sessionResultA.data);
    if(!sessionResultA.data) {
      throw new Error("Session creation returned no data");
    }
    const sessionA: StartSessionSuccessResponse = sessionResultA.data;

    const sessionResultB = await startSession(testUser, adminClient, sessionPayloadB);
    assertEquals(sessionResultB.error, undefined);
    assertExists(sessionResultB.data);
    if(!sessionResultB.data) {
      throw new Error("Session creation returned no data");
    }
    const sessionB: StartSessionSuccessResponse = sessionResultB.data;

    const clonedStepResponse = await adminClient
      .from("dialectic_stage_recipe_steps")
      .select("id, step_key")
      .eq("instance_id", clonedInstanceId)
      .eq("job_type", "EXECUTE")
      .limit(1)
      .single();
    assertEquals(clonedStepResponse.error, null);
    assertExists(clonedStepResponse.data);
    const clonedStepId: string = clonedStepResponse.data.id;
    const clonedStepKey: string = clonedStepResponse.data.step_key;

    const templateStepResponse = await adminClient
      .from("dialectic_recipe_template_steps")
      .select("id, step_key")
      .eq("template_id", templateId)
      .eq("job_type", "EXECUTE")
      .limit(1)
      .single();
    assertEquals(templateStepResponse.error, null);
    assertExists(templateStepResponse.data);
    const templateStepId: string = templateStepResponse.data.id;
    const templateStepKey: string = templateStepResponse.data.step_key;

    const iterationNumber: number = 1;

    if(!clonedStageSlug) {
      throw new Error("Integration precondition failed: cloned stage slug is null");
    }
    if(!templateStageSlug) {
      throw new Error("Integration precondition failed: template stage slug is null");
    }
    if(!clonedStepId) {
      throw new Error("Integration precondition failed: cloned step id is null");
    }
    if(!templateStepId) {
      throw new Error("Integration precondition failed: template step id is null");
    }

    const clonedExecutePayload: DialecticExecuteJobPayload = {
      sessionId: sessionA.id,
      projectId: project.id,
      stageSlug: clonedStageSlug,
      iterationNumber: iterationNumber,
      walletId: walletId,
      user_jwt: jwt,
      model_id: modelId,
      prompt_template_id: "pt-integration-test-cloned",
      output_type: FileType.business_case,
      canonicalPathParams: { contributionType: "thesis", stageSlug: clonedStageSlug },
      inputs: {},
      planner_metadata: { recipe_step_id: clonedStepId, stage_slug: clonedStageSlug },
    };
    assert(isJson(clonedExecutePayload), "clonedExecutePayload must be Json");

    const templateExecutePayload: DialecticExecuteJobPayload = {
      sessionId: sessionB.id,
      projectId: project.id,
      stageSlug: templateStageSlug,
      iterationNumber: iterationNumber,
      walletId: walletId,
      user_jwt: jwt,
      model_id: modelId,
      prompt_template_id: "pt-integration-test-template",
      output_type: FileType.business_case,
      canonicalPathParams: { contributionType: "thesis", stageSlug: templateStageSlug },
      inputs: {},
      planner_metadata: { recipe_step_id: templateStepId, stage_slug: templateStageSlug },
    };
    assert(isJson(templateExecutePayload), "templateExecutePayload must be Json");
    if(!isJson(clonedExecutePayload)) {
      throw new Error("Invalid cloned execute payload");
    }
    if(!isJson(templateExecutePayload)) {
      throw new Error("Invalid template execute payload");
    }
    const clonedJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
      session_id: sessionA.id,
      user_id: userId,
      stage_slug: clonedStageSlug,
      iteration_number: iterationNumber,
      payload: clonedExecutePayload,
      status: "completed",
      job_type: "EXECUTE",
      is_test_job: true,
      max_retries: 0,
      attempt_count: 0,
      results: null,
      error_details: null,
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
    };
    const templateJobInsert: TablesInsert<"dialectic_generation_jobs"> = {
      session_id: sessionB.id,
      user_id: userId,
      stage_slug: templateStageSlug,
      iteration_number: iterationNumber,
      payload: templateExecutePayload,
      status: "completed",
      job_type: "EXECUTE",
      is_test_job: true,
      max_retries: 0,
      attempt_count: 0,
      results: null,
      error_details: null,
      parent_job_id: null,
      prerequisite_job_id: null,
      target_contribution_id: null,
      started_at: null,
      completed_at: new Date().toISOString(),
    };

    const clonedJobResponse = await adminClient
      .from("dialectic_generation_jobs")
      .insert(clonedJobInsert)
      .select("id")
      .single();
    assertEquals(clonedJobResponse.error, null);
    assertExists(clonedJobResponse.data);

    const templateJobResponse = await adminClient
      .from("dialectic_generation_jobs")
      .insert(templateJobInsert)
      .select("id")
      .single();
    assertEquals(templateJobResponse.error, null);
    assertExists(templateJobResponse.data);

    const payloadA: GetAllStageProgressPayload = {
      sessionId: sessionA.id,
      iterationNumber: iterationNumber,
      userId: userId,
      projectId: project.id,
    };
    const payloadB: GetAllStageProgressPayload = {
      sessionId: sessionB.id,
      iterationNumber: iterationNumber,
      userId: userId,
      projectId: project.id,
    };

    const resultA = await getAllStageProgress(payloadA, adminClient, testUser);
    assertEquals(resultA.status, 200);
    assertExists(resultA.data);
    if(!resultA.data) {
      throw new Error("Result A returned no data");
    }
    const entryA: StageProgressEntry | undefined = resultA.data.find((s: StageProgressEntry) => s.stageSlug === clonedStageSlug);
    assertExists(entryA);
    if(!entryA) {
      throw new Error("Entry A not found");
    }
    assertExists(entryA.jobProgress[clonedStepKey]);

    const resultB = await getAllStageProgress(payloadB, adminClient, testUser);
    assertEquals(resultB.status, 200);
    assertExists(resultB.data);
    if(!resultB.data) {
      throw new Error("Result B returned no data");
    }
    const entryB: StageProgressEntry | undefined = resultB.data.find((s: StageProgressEntry) => s.stageSlug === templateStageSlug);
    assertExists(entryB);
    if(!entryB) {
      throw new Error("Entry B not found");
    }
    assertExists(entryB.jobProgress[templateStepKey]);

    const cleanupJobsA = await adminClient
      .from("dialectic_generation_jobs")
      .delete()
      .eq("session_id", sessionA.id);
    assertEquals(cleanupJobsA.error, null);
    const cleanupJobsB = await adminClient
      .from("dialectic_generation_jobs")
      .delete()
      .eq("session_id", sessionB.id);
    assertEquals(cleanupJobsB.error, null);
    const cleanupResources = await adminClient
      .from("dialectic_project_resources")
      .delete()
      .eq("project_id", project.id);
    assertEquals(cleanupResources.error, null);
    const cleanupContributions = await adminClient
      .from("dialectic_contributions")
      .delete()
      .in("session_id", [sessionA.id, sessionB.id]);
    assertEquals(cleanupContributions.error, null);
    const cleanupSessions = await adminClient
      .from("dialectic_sessions")
      .delete()
      .in("id", [sessionA.id, sessionB.id]);
    assertEquals(cleanupSessions.error, null);
    const cleanupProject = await adminClient
      .from("dialectic_projects")
      .delete()
      .eq("id", project.id);
    assertEquals(cleanupProject.error, null);
  }});
});

