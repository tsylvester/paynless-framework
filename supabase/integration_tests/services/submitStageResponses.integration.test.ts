import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
} from "../../functions/_shared/_integration.test.utils.ts";
import { type Database } from "../../functions/types_db.ts";
import {
  type DialecticProject,
  type SubmitStageResponsesPayload,
  type SubmitStageResponsesDependencies,
  type StartSessionPayload,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { testLogger } from "../../functions/_shared/_integration.test.utils.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { MockIndexingService } from "../../functions/_shared/services/indexing_service.mock.ts";
import { EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { getMockAiProviderAdapter } from "../../functions/_shared/ai_service/ai_provider.mock.ts";
import { MOCK_MODEL_CONFIG } from "../../functions/_shared/_integration.test.utils.ts";

describe("submitStageResponses integration tests", () => {
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

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userClient } = await coreCreateAndSetupTestUser();
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    const formData = new FormData();
    formData.append("projectName", "SubmitStageResponses Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for submitStageResponses");
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

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to create test session: ${sessionResult.error?.message}`);
    }
    testSessionId = sessionResult.data.id;

    const { data: stages, error: stagesError } = await adminClient
      .from("dialectic_stages")
      .select("id, slug")
      .in("slug", ["thesis", "antithesis", "paralysis"]);
    if (stagesError) throw new Error(`Failed to fetch stages: ${stagesError.message}`);
    assertExists(stages);
    thesisStageId = stages.find((s) => s.slug === "thesis")?.id ?? "";
    antithesisStageId = stages.find((s) => s.slug === "antithesis")?.id ?? "";
    paralysisStageId = stages.find((s) => s.slug === "paralysis")?.id ?? "";
    assertExists(thesisStageId, "thesis stage not found");
    assertExists(antithesisStageId, "antithesis stage not found");
    assertExists(paralysisStageId, "paralysis stage not found");

    // Seed thesis-stage rendered documents so submitStageResponses precondition check passes
    // (antithesis recipe requires four thesis documents: business_case, feature_spec, technical_approach, success_metrics)
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

  it("thesis_completed → submit → pending_antithesis with updated current_stage_id", async () => {
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
    assertEquals(result.data.updatedSession?.status, "pending_antithesis");
    assertEquals(result.data.updatedSession?.current_stage_id, antithesisStageId);
  });

  it("Already at pending_antithesis → submit for thesis → saves succeed, no advancement, no error", async () => {
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

    const { data: sessionAfter } = await adminClient
      .from("dialectic_sessions")
      .select("current_stage_id, status")
      .eq("id", testSessionId)
      .single();
    assertExists(sessionAfter);
    assertEquals(sessionAfter.current_stage_id, antithesisStageId);
    assertEquals(sessionAfter.status, "pending_antithesis");
  });

  it("running_thesis → submit → saves succeed, advancement succeeds", async () => {
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
    assertEquals(result.data.updatedSession?.status, "iteration_complete_pending_review");
  });
});
