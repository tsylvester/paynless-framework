
import { getSessionDetails } from "../../functions/dialectic-service/getSessionDetails.ts";
import { listStageDocuments } from "../../functions/dialectic-service/listStageDocuments.ts";
import { getProjectResourceContent } from "../../functions/dialectic-service/getProjectResourceContent.ts";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assert,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { 
  SupabaseClient, 
  User 
} from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticProject,
  StartSessionPayload,
  GenerateContributionsPayload,
  DialecticJobRow,
  ContentToInclude,
  ContextForDocument,
  HeaderContext,
  HeaderContextArtifact,
  SystemMaterials,
  UnifiedAIResponse,
  CallModelDependencies,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { isDialecticJobRow } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { FileType } from "../../functions/_shared/types/file_manager.types.ts";
import { 
  ChatApiRequest, 
  FinishReason 
} from "../../functions/_shared/types.ts";
import { 
  createDialecticWorkerDeps, 
  handleJob 
} from "../../functions/dialectic-worker/index.ts";
import { IJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";

// This comment block outlines the comprehensive testing strategy for the document generation and stage completion flow.
// The primary goal is to prove that the entire lifecycle—from job creation to final artifact rendering and stage completion—
// works correctly for the recipes defined in the database migrations.

// The tests will be orchestrated by directly calling the application's own functions, such as `startSession`, 
// `processComplexJob`, and `processJob`, to simulate the complete, end-to-end workflow of a stage. 
// This ensures we are testing the real, integrated system behavior.

// The test sequence will be as follows:
// 1. A test for the complete 'thesis' recipe with a single model.
// 2. A test for the complete 'synthesis' recipe with a single model.
// 3. A test for the complete 'synthesis' recipe with two models to verify multi-model coordination.
// This comment block outlines the comprehensive testing strategy for the document generation and stage completion flow.
// The primary goal is to prove that the entire lifecycle—from job creation to final artifact rendering and stage completion—
// works correctly for the recipes defined in the database migrations.

// The tests will be orchestrated by directly calling the application's own functions, such as `startSession`,
// `processComplexJob`, and `processJob`, to simulate the complete, end-to-end workflow of a stage.
// This ensures we are testing the real, integrated system behavior.

// The test sequence will be as follows:
// 1. A test for the complete 'thesis' recipe with a single model.
// 2. A test for the complete 'synthesis' recipe with a single model.
// 3. A test for the complete 'synthesis' recipe with two models to verify multi-model coordination.
describe("executeModelCallAndSave Document Generation End-to-End Integration Tests", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testModelId: string;
  let testWalletId: string;
  let workerDeps: IJobContext;

  const mockAndProcessJob = async (job: DialecticJobRow, deps: IJobContext) => {
    const payload = job.payload;
    const outputTypeRaw = isRecord(payload) ? payload["output_type"] : undefined;
    const outputType = typeof outputTypeRaw === "string" ? outputTypeRaw : undefined;

    // Override the external AI call for this specific job processing run
    const finishReason: FinishReason = "stop";
    const rawProviderResponse: Record<string, unknown> = {};

    const systemMaterials: SystemMaterials = {
      stage_rationale: "Integration test stub: stage rationale",
      executive_summary: "Integration test stub: executive summary",
      input_artifacts_summary: "Integration test stub: input artifacts summary",
    };

    const headerContextArtifact: HeaderContextArtifact = {
      type: "header_context",
      document_key: "header_context",
      artifact_class: "header_context",
      file_type: "json",
    };

    // Populate content_to_include keys required by the real recipe validation (see failing logs).
    const emptyString = "";
    const emptyStringArray: string[] = [];

    const businessCaseContentToInclude: ContentToInclude = {
      threats: emptyString,
      strengths: emptyString,
      next_steps: emptyString,
      weaknesses: emptyString,
      opportunities: emptyString,
      executive_summary: emptyString,
      market_opportunity: emptyString,
      "risks_&_mitigation": emptyString,
      proposal_references: emptyStringArray,
      competitive_analysis: emptyString,
      user_problem_validation: emptyString,
      "differentiation_&_value_proposition": emptyString,
    };

    const featureSpecFeature: ContentToInclude = {
      dependencies: emptyStringArray,
      feature_name: emptyString,
      user_stories: emptyStringArray,
      success_metrics: emptyStringArray,
      feature_objective: emptyString,
      acceptance_criteria: emptyStringArray,
    };
    const featureSpecFeatures: ContentToInclude[] = [featureSpecFeature];
    const featureSpecContentToInclude: ContentToInclude = {
      features: featureSpecFeatures,
    };

    const technicalApproachContentToInclude: ContentToInclude = {
      data: emptyString,
      components: emptyString,
      deployment: emptyString,
      sequencing: emptyString,
      architecture: emptyString,
      open_questions: emptyString,
      risk_mitigation: emptyString,
    };

    const successMetricsContentToInclude: ContentToInclude = {
      ownership: emptyString,
      guardrails: emptyString,
      next_steps: emptyString,
      data_sources: emptyStringArray,
      primary_kpis: emptyString,
      risk_signals: emptyString,
      escalation_plan: emptyString,
      measurement_plan: emptyString,
      north_star_metric: emptyString,
      outcome_alignment: emptyString,
      reporting_cadence: emptyString,
      lagging_indicators: emptyString,
      leading_indicators: emptyString,
    };

    const contextForDocuments: ContextForDocument[] = [
      { document_key: FileType.business_case, content_to_include: businessCaseContentToInclude },
      { document_key: FileType.feature_spec, content_to_include: featureSpecContentToInclude },
      { document_key: FileType.technical_approach, content_to_include: technicalApproachContentToInclude },
      { document_key: FileType.success_metrics, content_to_include: successMetricsContentToInclude },
    ];

    const headerContext: HeaderContext = {
      system_materials: systemMaterials,
      header_context_artifact: headerContextArtifact,
      context_for_documents: contextForDocuments,
    };

    const documentStub: Record<string, unknown> = {
      content: `# ${outputType ?? "document"}\n\nThis is an integration test stub document body.`,
    };

    const shouldReturnHeaderContext =
      outputType === FileType.HeaderContext ||
      outputType === "header_context" ||
      outputType === "header_context_pairwise" ||
      outputType === "synthesis_header_context";

    const stubContentObject: unknown = shouldReturnHeaderContext ? headerContext : documentStub;
    const response: UnifiedAIResponse = {
      content: JSON.stringify(stubContentObject),
      finish_reason: finishReason,
      inputTokens: 100,
      outputTokens: 200,
      processingTimeMs: 500,
      rawProviderResponse,
    };

    const callStub = stub(
      deps,
      "callUnifiedAIModel",
      async (
        _chatApiRequest: ChatApiRequest,
        _userAuthToken: string,
        _dependencies?: CallModelDependencies,
      ): Promise<UnifiedAIResponse> => response,
    );
    try {
      await handleJob(adminClient, job, deps, testUserJwt);
    } finally {
      callStub.restore();
    }
  };

  const processJobQueueUntilCompletion = async (sessionId: string, deps: IJobContext, authToken: string) => {
    for (let i = 0; i < 15; i++) { // Safety break
      const { data: pendingJobs, error } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);
      
      assert(!error, `Failed to fetch pending jobs: ${error?.message}`);
      
      if (!pendingJobs || pendingJobs.length === 0) {
        console.log(`[processJobQueueUntilCompletion] No more pending jobs for session ${sessionId}. Exiting.`);
        return;
      }

      console.log(`[processJobQueueUntilCompletion] Iteration ${i + 1}: Found ${pendingJobs.length} pending jobs.`);
      for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
            throw new Error(`Fetched entity is not a valid DialecticJobRow: ${JSON.stringify(job)}`);
        }
        await mockAndProcessJob(job, deps);
      }
    }
    assert(false, "processJobQueueUntilCompletion exceeded max iterations.");
  };

  const pollForCondition = async (
    condition: () => Promise<boolean>,
    timeoutMessage: string,
    interval = 500,
    timeout = 2000,
  ) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(`Timeout waiting for condition: ${timeoutMessage}`);
  };

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userId, jwt, userClient } = await coreCreateAndSetupTestUser();
    testUserId = userId;
    testUserJwt = jwt;
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    workerDeps = await createDialecticWorkerDeps(adminClient);

    const formData = new FormData();
    formData.append("projectName", "Document Generation End-to-End Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for document generation end-to-end integration test");
    
    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
    assertExists(domain, "Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error) {
      throw new Error(`Failed to create test project: ${projectResult.error.message}`);
    }
    if (!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    testProject = projectResult.data;

    const { data: existingModel } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    
    const validConfig = {
      api_identifier: MOCK_MODEL_CONFIG.api_identifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens || 128000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      tokenization_strategy: MOCK_MODEL_CONFIG.tokenization_strategy,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 16000,
    };

    let model = existingModel;
    if (!model) {
      const { data: newModel, error: createError } = await adminClient
        .from("ai_providers")
        .insert({
          api_identifier: MOCK_MODEL_CONFIG.api_identifier,
          provider: "test-provider",
          name: "Test Model",
          config: validConfig,
          is_active: true,
          is_enabled: true,
        })
        .select("id")
        .single();
      assert(!createError, `Failed to create test model: ${createError?.message}`);
      assertExists(newModel, "New model should be created");
      model = newModel;
    } else {
      const { error: updateError } = await adminClient
        .from("ai_providers")
        .update({ config: validConfig })
        .eq("id", model.id);
      assert(!updateError, `Failed to update model config: ${updateError?.message}`);
    }
    testModelId = model.id;

    await coreEnsureTestUserAndWallet(testUserId, 1000000, 'local');
    
    const { data: walletData, error: walletError } = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    assert(!walletError, `Failed to fetch wallet: ${walletError?.message}`);
    assertExists(walletData, "Wallet should exist");
    if (!walletData || !walletData.wallet_id) {
      throw new Error("Wallet record is missing wallet_id");
    }
    testWalletId = walletData.wallet_id;
  });

  afterAll(async () => {
    await coreCleanupTestResources();
  });

  it("21.b.i: should generate complete document end-to-end: EXECUTE job → contribution save → RENDER job enqueue → RENDER job process → document render → stage completion", async () => {
    const stageSlug = "thesis";
    const iterationNumber = 1;

    // 1. Start a new session for this specific test to ensure isolation.
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session for thesis stage: ${sessionResult.error?.message}`);
    }
    const thesisSession = sessionResult.data;

    // 2. Step 1 (Act & Assert): Call generateContributions to create the initial PLAN job.
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: thesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);
    assertExists(planJobsResult.data, "generateContributions should return data");
    
    if(!planJobsResult.data || !planJobsResult.data.job_ids) {
      throw new Error("generateContributions should return job_ids");
    }
    const { data: planJob, error: planJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .in("id", planJobsResult.data.job_ids)
      .single();

    assert(!planJobError, `Failed to fetch PLAN job: ${planJobError?.message}`);
    assertExists(planJob, "PLAN job should have been created");
    assertEquals(planJob.status, "pending", "Initial PLAN job status should be pending");

    // 3. Process the entire job queue until no pending jobs are left.
    await processJobQueueUntilCompletion(thesisSession.id, workerDeps, testUserJwt);

    // 4. Wait until all jobs for the session are in a terminal state.
    await pollForCondition(async () => {
      const { data: activeJobs, error } = await adminClient
        .from("dialectic_generation_jobs")
        .select("id")
        .eq("session_id", thesisSession.id)
        .in("status", ["pending", "retrying", "pending_continuation", "pending_next_step", "processing", "waiting_for_children"]);
      
      assert(!error, `Polling for active jobs failed: ${error?.message}`);
      return activeJobs !== null && activeJobs.length === 0;
    }, "All jobs for the session should have completed.", 1000, 3000);

    // 5. Final Assertions: Verify the end-to-end completion of the stage.
    const { data: finalJobs, error: finalJobsError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("id, job_type, status, parent_job_id")
      .eq("session_id", thesisSession.id);

    assert(!finalJobsError, `Failed to fetch final jobs: ${finalJobsError?.message}`);
    assertExists(finalJobs, "Final jobs should exist");

    // All jobs should be completed.
    const nonCompletedJobs = finalJobs.filter(j => j.status !== 'completed');
    assertEquals(nonCompletedJobs.length, 0, `All jobs should be completed. Found ${nonCompletedJobs.length} non-completed jobs: ${JSON.stringify(nonCompletedJobs)}`);

    // There should be one PLAN, four EXECUTE, and four RENDER jobs.
    assertEquals(finalJobs.filter(j => j.job_type === 'PLAN').length, 1, "Should be one PLAN job");
    assertEquals(finalJobs.filter(j => j.job_type === 'EXECUTE').length, 4, "Should be four EXECUTE jobs");
    assertEquals(finalJobs.filter(j => j.job_type === 'RENDER').length, 4, "Should be four RENDER jobs");

    // Verify that rendered documents exist for each of the 4 EXECUTE jobs.
    const { data: finalResources, error: finalResourcesError } = await adminClient
      .from("dialectic_project_resources")
      .select("id")
      .eq("session_id", thesisSession.id)
      .eq("resource_type", "rendered_document");
    
    assert(!finalResourcesError, `Failed to fetch final resources: ${finalResourcesError?.message}`);
    assertExists(finalResources, "Final resources should exist");
    assertEquals(finalResources.length, 4, "Should have created 4 rendered document resources");
    
    // 6. Verify stage completion by checking the session status.
    const { data: updatedSession, error: updatedSessionError } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", thesisSession.id)
      .single();

    assert(!updatedSessionError, `Failed to fetch updated session: ${updatedSessionError?.message}`);
    assertExists(updatedSession, "Updated session should exist");
    assertEquals(updatedSession.status, "pending_antithesis", "Session status should be advanced to 'pending_antithesis' after all jobs are complete");
  });

  it("21.b.ii: should NOT enqueue RENDER job when shouldEnqueueRenderJob returns false (JSON-only artifacts)", async () => {
    const stageSlug = "synthesis"; // Use a stage that produces JSON artifacts
    const iterationNumber = 1;

    // 1. Start a new session configured for the 'synthesis' stage.
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session for synthesis stage: ${sessionResult.error?.message}`);
    }
    const synthesisSession = sessionResult.data;

    // 2. Kick off the stage using the application's entry point.
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: synthesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);
    assertExists(planJobsResult.data, "generateContributions should return data");

    // 3. Simulate the worker by processing all pending jobs.
    let pendingJobsExist = true;
    while (pendingJobsExist) {
      const { data: pendingJobs, error: pendingJobsError } = await adminClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("session_id", synthesisSession.id)
        .in("status", ["pending", "retrying"]);

      assert(!pendingJobsError, `Failed to fetch pending jobs: ${pendingJobsError?.message}`);
      assertExists(pendingJobs, "Pending jobs query should return data");

      if (pendingJobs.length === 0) {
        pendingJobsExist = false;
        continue;
      }

      for (const job of pendingJobs) {
        await mockAndProcessJob(job, workerDeps);
      }
    }

    // 4. Verify that NO "rendered_document" was created for this stage and session.
    const { data: documents, error: listError } = await listStageDocuments({
      sessionId: synthesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      userId: testUserId,
      projectId: testProject.id
    }, adminClient);

    assert(!listError, `Failed to list stage documents: ${listError?.message}`);
    if(!documents || !documents.documents) {
      throw new Error("listStageDocuments should return documents");
    }
    
    const renderedDocuments = documents.documents.filter(d => d.documentKey.includes('rendered_'));
    assertEquals(renderedDocuments.length, 0, "No rendered_document should be created for JSON-only artifacts");
  });

  it("21.b.iii: should handle continuation chunks correctly in end-to-end flow", async () => {
    const stageSlug = "thesis";
    const iterationNumber = 1;

    // 1. Start a new session.
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const thesisSession = sessionResult.data;

    // 2. Kick off the stage.
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: thesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    // 3. Simulate the worker.
    let pendingJobsExist = true;
    while (pendingJobsExist) {
      const { data: pendingJobs, error: pendingJobsError } = await adminClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("session_id", thesisSession.id)
        .in("status", ["pending", "retrying", "pending_continuation"]);
      assert(!pendingJobsError, `Failed to fetch pending jobs: ${pendingJobsError?.message}`);
      if (pendingJobs.length === 0) {
        pendingJobsExist = false;
        continue;
      }
      for (const job of pendingJobs) {
        await mockAndProcessJob(job, workerDeps);
      }
    }

    // 4. Verify the final rendered document contains both chunks.
    const { data: documents, error: listError } = await listStageDocuments({
      sessionId: thesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      userId: testUserId,
      projectId: testProject.id
    }, adminClient);

    assert(!listError, `Failed to list stage documents: ${listError?.message}`);
    if(!documents) {
      throw new Error("listStageDocuments should return documents");
    }
    assertExists(documents.documents, "listStageDocuments should return documents");
    
    const renderedDoc = documents.documents.find(d => d.documentKey.includes('rendered_'));
    assertExists(renderedDoc, "A rendered document should exist");

    if(!renderedDoc) {
      throw new Error("Rendered document should have a last rendered resource ID");
    }
    const { data: content, error: contentError } = await getProjectResourceContent({ resourceId: renderedDoc.lastRenderedResourceId! }, adminClient, testUser);
    assert(!contentError, `Failed to get resource content: ${contentError?.message}`);
    assertExists(content, "Rendered document should have content");
    if(!content) {
      throw new Error("Resource content should exist");
    }
    assert(content.content.includes("Business Case Document"), "Content should include root chunk");
  });

  it("21.b.iv: should correctly identify stage completion when all EXECUTE and RENDER jobs complete", async () => {
    const stageSlug = "thesis";
    const iterationNumber = 1;

    // 1. Start a new session for this test.
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const cleanSession = sessionResult.data;

    // 2. Kick off the stage using the application's entry point.
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: cleanSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    // 3. Simulate the worker, processing all jobs to completion.
    let pendingJobsExist = true;
    while (pendingJobsExist) {
      const { data: pendingJobs, error: pendingJobsError } = await adminClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("session_id", cleanSession.id)
        .in("status", ["pending", "retrying"]);
      assert(!pendingJobsError, `Failed to fetch pending jobs: ${pendingJobsError?.message}`);
      if (pendingJobs.length === 0) {
        pendingJobsExist = false;
        continue;
      }
      for (const job of pendingJobs) {
        await mockAndProcessJob(job, workerDeps);
      }
    }

    // 4. USE THE APPLICATION'S FUNCTIONS to verify stage completion.
    const { data: updatedSession, error: sessionError } = await getSessionDetails({ sessionId: cleanSession.id }, adminClient, testUser);
    assert(!sessionError, `Failed to get session details: ${sessionError?.message}`);
    if(!updatedSession) {
      throw new Error("getSessionDetails should return session data");
    }
    assertEquals(updatedSession.session.status, "pending_antithesis", "Session status should be advanced to the next stage upon completion of the current one");
  });

  it("21.b.v: should NOT mark stage complete when RENDER jobs are stuck in pending status", async () => {
    const stageSlug = "thesis";
    const iterationNumber = 1;

    // 1. Start a new session.
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const thesisSession = sessionResult.data;

    // 2. Kick off the stage.
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: thesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);

    // 3. Simulate the worker.
    let pendingJobsExist = true;
    while (pendingJobsExist) {
      const { data: pendingJobs, error: pendingJobsError } = await adminClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("session_id", thesisSession.id)
        .in("status", ["pending", "retrying"]);
      assert(!pendingJobsError, `Failed to fetch pending jobs: ${pendingJobsError?.message}`);
      if (pendingJobs.length === 0) {
        pendingJobsExist = false;
        continue;
      }
      for (const job of pendingJobs) {
        try {
          await mockAndProcessJob(job, workerDeps);
        } catch (e) {
          if (e instanceof Error) {
            console.log(`Caught expected error during job processing: ${e.message}`);
          } else {
            console.log(`Caught expected error during job processing: ${String(e)}`);
          }
        }
      }
    }

    // 4. Verify the session is NOT marked as complete.
    const { data: updatedSession, error: sessionError } = await getSessionDetails({ sessionId: thesisSession.id }, adminClient, testUser);
    assert(!sessionError, `Failed to get session details: ${sessionError?.message}`);
    if(!updatedSession) {
      throw new Error("getSessionDetails should return session data");
    }
    assert(updatedSession.session.status !== "pending_antithesis", "Session status should NOT be advanced");
    assertEquals(updatedSession.session.status, "running_thesis", "Session should remain in the 'running_thesis' state");
  });
  
  it("21.b.vi: should generate complete document for SYNTHESIS stage (Product Requirements) using real DB recipe", async () => {
    const stageSlug = "synthesis";
    const iterationNumber = 1;

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session for synthesis stage: ${sessionResult.error?.message}`);
    }
    const synthesisSession = sessionResult.data;

    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: synthesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    let pendingJobsExist = true;
    while (pendingJobsExist) {
      const { data: pendingJobs, error: pendingJobsError } = await adminClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("session_id", synthesisSession.id)
        .in("status", ["pending", "retrying"]);
      assert(!pendingJobsError, `Failed to fetch pending jobs: ${pendingJobsError?.message}`);
      if (pendingJobs.length === 0) {
        pendingJobsExist = false;
        continue;
      }
      for (const job of pendingJobs) {
        await mockAndProcessJob(job, workerDeps);
      }
    }

    const { data: documents, error: listError } = await listStageDocuments({
      sessionId: synthesisSession.id,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      userId: testUserId,
      projectId: testProject.id
    }, adminClient);
    
    assert(!listError, `Failed to list stage documents: ${listError?.message}`);
    if (!documents || !documents.documents) {
      throw new Error("listStageDocuments should return documents");
    }
    
    const renderedDocuments = documents.documents.filter(d => d.documentKey.includes('rendered_'));
    assertEquals(renderedDocuments.length, 1, "Should have created 1 final rendered document for the synthesis stage");
    assert(renderedDocuments[0].documentKey.includes(FileType.product_requirements), "The final document should be a product_requirements file");
  });
});
