/**
 * Integration tests for the complete status lifecycle: handle_job_completion trigger
 * sets {stage}_completed without advancing current_stage_id; submitStageResponses
 * advances stage on user submit. Proves decoupled lifecycle and idempotency for prior-stage submissions.
 */
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  testLogger,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import type { Database } from "../../functions/types_db.ts";
import type {
  DialecticProject,
  SubmitStageResponsesPayload,
  SubmitStageResponsesDependencies,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { MockIndexingService } from "../../functions/_shared/services/indexing_service.mock.ts";
import { EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { getMockAiProviderAdapter } from "../../functions/_shared/ai_service/ai_provider.mock.ts";
import type { Json } from "../../functions/types_db.ts";

describe("State management stage_completed lifecycle integration tests", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testProject: DialecticProject;
  let testSessionId: string;
  let thesisStageId: string;
  let antithesisStageId: string;
  let paralysisStageId: string;

  function createSubmitDeps(): SubmitStageResponsesDependencies {
    const fileManager = new FileManagerService(adminClient, {
      constructStoragePath,
      logger: testLogger,
    });
    const indexingService = new MockIndexingService();
    const validMockConfig = { ...MOCK_MODEL_CONFIG, output_token_cost_rate: 0.001 };
    const { instance: mockAdapter } = getMockAiProviderAdapter(testLogger, validMockConfig);
    const adapterWithEmbedding = {
      ...mockAdapter,
      getEmbedding: async (_text: string) => ({
        embedding: Array(1536).fill(0.1),
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    };
    const embeddingClient = new EmbeddingClient(adapterWithEmbedding);
    return {
      logger: testLogger,
      fileManager,
      downloadFromStorage,
      indexingService,
      embeddingClient,
    };
  }

  async function getSessionStatusAndStage(sessionId: string): Promise<{ status: string; current_stage_id: string | null }> {
    const { data, error } = await adminClient
      .from("dialectic_sessions")
      .select("status, current_stage_id")
      .eq("id", sessionId)
      .single();
    if (error) throw new Error(`Failed to fetch session: ${error.message}`);
    assertExists(data);
    return { status: data.status, current_stage_id: data.current_stage_id };
  }

  async function getStageIdBySlug(slug: string): Promise<string> {
    const { data, error } = await adminClient
      .from("dialectic_stages")
      .select("id")
      .eq("slug", slug)
      .single();
    if (error) throw new Error(`Failed to get stage ${slug}: ${error.message}`);
    assertExists(data);
    return data.id;
  }

  async function createSessionWithStatus(
    status: string,
    stageId: string,
    projectId: string,
  ): Promise<string> {
    const { data, error } = await adminClient
      .from("dialectic_sessions")
      .insert({
        project_id: projectId,
        status,
        iteration_count: 1,
        current_stage_id: stageId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create session: ${error.message}`);
    assertExists(data);
    return data.id;
  }

  async function createRootPlanJob(
    sessionId: string,
    stageSlug: string,
    projectId: string,
    userId: string,
    status: string,
    jobIds: string[],
  ): Promise<string> {
    const payload: Json = {
      job_type: "plan",
      model_id: "test-model",
      sessionId,
      projectId,
    };
    const { data, error } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        session_id: sessionId,
        stage_slug: stageSlug,
        iteration_number: 1,
        user_id: userId,
        status,
        payload,
        job_type: "PLAN",
        parent_job_id: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create root PLAN job: ${error.message}`);
    assertExists(data);
    jobIds.push(data.id);
    return data.id;
  }

  async function createChildExecuteJob(
    sessionId: string,
    stageSlug: string,
    parentJobId: string,
    projectId: string,
    userId: string,
    status: string,
    jobIds: string[],
  ): Promise<string> {
    const payload: Json = {
      job_type: "execute",
      model_id: "test-model",
      sessionId,
      projectId,
    };
    const { data, error } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        session_id: sessionId,
        stage_slug: stageSlug,
        iteration_number: 1,
        user_id: userId,
        status,
        payload,
        job_type: "EXECUTE",
        parent_job_id: parentJobId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create child EXECUTE job: ${error.message}`);
    assertExists(data);
    jobIds.push(data.id);
    return data.id;
  }

  async function updateJobStatus(jobId: string, status: string): Promise<void> {
    const { error } = await adminClient
      .from("dialectic_generation_jobs")
      .update({ status })
      .eq("id", jobId);
    if (error) throw new Error(`Failed to update job ${jobId}: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userClient } = await coreCreateAndSetupTestUser();
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    const formData = new FormData();
    formData.append("projectName", "State Management Stage Completed Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for stage_completed lifecycle");
    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    if (domainError) throw new Error(`Failed to fetch domain: ${domainError.message}`);
    assertExists(domain);
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error || !projectResult.data) {
      throw new Error(`Failed to create test project: ${projectResult.error?.message}`);
    }
    testProject = projectResult.data;

    const sessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [] as string[],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to create test session: ${sessionResult.error?.message}`);
    }
    testSessionId = sessionResult.data.id;

    thesisStageId = await getStageIdBySlug("thesis");
    antithesisStageId = await getStageIdBySlug("antithesis");
    paralysisStageId = await getStageIdBySlug("paralysis");

    const thesisDocumentKeys: string[] = [
      "business_case",
      "feature_spec",
      "technical_approach",
      "success_metrics",
    ];
    const seedRows = thesisDocumentKeys.map((docKey) => ({
      project_id: testProject.id,
      user_id: testUser.id,
      session_id: testSessionId,
      stage_slug: "thesis",
      iteration_number: 1,
      resource_type: "rendered_document",
      file_name: `${docKey}.md`,
      storage_bucket: "dialectic-contributions",
      storage_path: `projects/${testProject.id}/sessions/${testSessionId}/thesis/iteration_1/${docKey}.md`,
      mime_type: "text/markdown",
      size_bytes: 0,
    }));
    const { error: seedError } = await adminClient
      .from("dialectic_project_resources")
      .insert(seedRows);
    if (seedError) throw new Error(`Failed to seed thesis resources: ${seedError.message}`);
  });

  afterAll(async () => {
    await coreCleanupTestResources("local");
  });

  it("Jobs complete → trigger sets thesis_completed, current_stage_id unchanged", async () => {
    const triggerSessionId = await createSessionWithStatus(
      "running_thesis",
      thesisStageId,
      testProject.id,
    );
    const jobIds: string[] = [];

    const planJobId = await createRootPlanJob(
      triggerSessionId,
      "thesis",
      testProject.id,
      testUser.id,
      "pending",
      jobIds,
    );
    const executeJob1Id = await createChildExecuteJob(
      triggerSessionId,
      "thesis",
      planJobId,
      testProject.id,
      testUser.id,
      "pending",
      jobIds,
    );
    const executeJob2Id = await createChildExecuteJob(
      triggerSessionId,
      "thesis",
      planJobId,
      testProject.id,
      testUser.id,
      "pending",
      jobIds,
    );

    await updateJobStatus(executeJob1Id, "completed");
    await updateJobStatus(executeJob2Id, "completed");
    await updateJobStatus(planJobId, "completed");

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { status, current_stage_id } = await getSessionStatusAndStage(triggerSessionId);
    assertEquals(status, "thesis_completed", "Trigger should set status to thesis_completed");
    assertEquals(
      current_stage_id,
      thesisStageId,
      "Trigger must NOT advance current_stage_id",
    );

    for (const id of jobIds) {
      await adminClient.from("dialectic_generation_jobs").delete().eq("id", id);
    }
    await adminClient.from("dialectic_sessions").delete().eq("id", triggerSessionId);
  });

  it("thesis_completed → submit → pending_antithesis + current_stage_id updated", async () => {
    const { error: updateError } = await adminClient
      .from("dialectic_sessions")
      .update({ status: "thesis_completed", current_stage_id: thesisStageId })
      .eq("id", testSessionId);
    if (updateError) throw new Error(`Failed to set session status: ${updateError.message}`);

    const payload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProject.id,
      stageSlug: "thesis",
      currentIterationNumber: 1,
      responses: [],
    };
    const result = await submitStageResponses(
      payload,
      adminClient,
      testUser,
      createSubmitDeps(),
    );
    assertEquals(result.status, 200);
    assertExists(result.data);
    if(!result.data) throw new Error("Submission failed to return data");
    assertEquals(result.data.updatedSession?.status, "pending_antithesis");
    assertEquals(result.data.updatedSession?.current_stage_id, antithesisStageId);
  });

  it("Already pending_antithesis → submit for thesis → success, no error, no duplicate advancement", async () => {
    const { error: updateError } = await adminClient
      .from("dialectic_sessions")
      .update({ status: "pending_antithesis", current_stage_id: antithesisStageId })
      .eq("id", testSessionId);
    if (updateError) throw new Error(`Failed to set session to antithesis: ${updateError.message}`);

    const payload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProject.id,
      stageSlug: "thesis",
      currentIterationNumber: 1,
      responses: [],
    };
    const result = await submitStageResponses(
      payload,
      adminClient,
      testUser,
      createSubmitDeps(),
    );
    assertEquals(result.status, 200);
    assertExists(result.data);

    const sessionAfter = await getSessionStatusAndStage(testSessionId);
    assertEquals(sessionAfter.current_stage_id, antithesisStageId);
    assertEquals(sessionAfter.status, "pending_antithesis");
  });

  it("User submits during running_thesis (trigger not yet fired) → success", async () => {
    const { error: updateError } = await adminClient
      .from("dialectic_sessions")
      .update({ status: "running_thesis", current_stage_id: thesisStageId })
      .eq("id", testSessionId);
    if (updateError) throw new Error(`Failed to set session status: ${updateError.message}`);

    const payload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProject.id,
      stageSlug: "thesis",
      currentIterationNumber: 1,
      responses: [],
    };
    const result = await submitStageResponses(
      payload,
      adminClient,
      testUser,
      createSubmitDeps(),
    );
    assertEquals(result.status, 200);
    assertExists(result.data);
    if(!result.data) throw new Error("Submission failed to return data");
    assertEquals(result.data.updatedSession?.status, "pending_antithesis");
    assertEquals(result.data.updatedSession?.current_stage_id, antithesisStageId);
  });

  it("paralysis_completed → submit → iteration_complete_pending_review", async () => {
    const { error: updateError } = await adminClient
      .from("dialectic_sessions")
      .update({ status: "paralysis_completed", current_stage_id: paralysisStageId })
      .eq("id", testSessionId);
    if (updateError) throw new Error(`Failed to set session to paralysis: ${updateError.message}`);

    const payload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProject.id,
      stageSlug: "paralysis",
      currentIterationNumber: 1,
      responses: [],
    };
    const result = await submitStageResponses(
      payload,
      adminClient,
      testUser,
      createSubmitDeps(),
    );
    assertEquals(result.status, 200);
    assertExists(result.data);
    if(!result.data) throw new Error("Submission failed to return data");
    assertEquals(result.data.updatedSession?.status, "iteration_complete_pending_review");
  });
});
