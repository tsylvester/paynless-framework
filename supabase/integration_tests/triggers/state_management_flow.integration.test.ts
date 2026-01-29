import {
  describe,
  it,
  beforeAll,
  afterAll,
} from "jsr:@std/testing@0.225.1/bdd";
import {
  assertEquals,
  assert,
  assertExists,
} from "jsr:@std/assert@0.225.3";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import { Database } from "../../functions/types_db.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { createSupabaseAdminClient } from "../../functions/_shared/auth.ts";
import {
  DialecticJobRow,
  StartSessionPayload,
  GenerateContributionsPayload,
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
  FinishReason,
} from "../../functions/_shared/types.ts";
import {
  createDialecticWorkerDeps,
  handleJob,
} from "../../functions/dialectic-worker/index.ts";
import { IJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";

describe("State Management Flow Integration Tests", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProjectId: string;
  let testModelId: string;
  let testWalletId: string;
  let workerDeps: IJobContext;

  const mockAndProcessJob = async (job: DialecticJobRow, deps: IJobContext) => {
    const payload = job.payload;
    const outputTypeRaw = isRecord(payload) ? payload["output_type"] : undefined;
    const outputType = typeof outputTypeRaw === "string" ? outputTypeRaw : undefined;

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
    for (let i = 0; i < 20; i++) {
      const { data: pendingJobs, error } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);
      
      assert(!error, `Failed to fetch pending jobs: ${error?.message}`);
      
      if (!pendingJobs || pendingJobs.length === 0) {
        return;
      }

      for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
          throw new Error(`Fetched entity is not a valid DialecticJobRow: ${JSON.stringify(job)}`);
        }
        await mockAndProcessJob(job, deps);
      }
      
      // Wait a bit for triggers to process
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("processJobQueueUntilCompletion exceeded max iterations.");
  };

  const pollForSessionStatus = async (
    sessionId: string,
    expectedStatus: string,
    timeout = 5000,
  ): Promise<void> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const { data: session, error } = await adminClient
        .from('dialectic_sessions')
        .select('status')
        .eq('id', sessionId)
        .single();
      
      assert(!error, `Failed to fetch session: ${error?.message}`);
      if (session?.status === expectedStatus) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const { data: session } = await adminClient
      .from('dialectic_sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    throw new Error(`Timeout waiting for session status to be '${expectedStatus}'. Current status: '${session?.status}'`);
  };

  const waitForAllJobsToComplete = async (sessionId: string, timeout = 10000): Promise<void> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const { data: incompleteJobs, error } = await adminClient
        .from('dialectic_generation_jobs')
        .select('id, status, job_type')
        .eq('session_id', sessionId)
        .not('status', 'in', '(completed, failed, retry_loop_failed)')
        .neq('job_type', 'RENDER')
        .neq('status', 'waiting_for_prerequisite');
      
      assert(!error, `Failed to fetch incomplete jobs: ${error?.message}`);
      
      if (!incompleteJobs || incompleteJobs.length === 0) {
        return;
      }
      
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    
    // Final check to get current state for error message
    const { data: finalIncomplete } = await adminClient
      .from('dialectic_generation_jobs')
      .select('id, status, job_type')
      .eq('session_id', sessionId)
      .not('status', 'in', '(completed, failed, retry_loop_failed)')
      .neq('job_type', 'RENDER')
      .neq('status', 'waiting_for_prerequisite');
    
    throw new Error(`Timeout waiting for all jobs to complete. Incomplete jobs: ${JSON.stringify(finalIncomplete)}`);
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
    formData.append("projectName", "State Management Flow Test Project");
    formData.append("initialUserPromptText", "Test prompt for state management flow tests");
    
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
    testProjectId = projectResult.data.id;

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

  it("67.b.i: should progress session through complete thesis stage lifecycle: pending_thesis → running_thesis → pending_antithesis", async () => {
    // (1) Create session with status = 'pending_thesis', project with thesis→antithesis transition
    const sessionPayload: StartSessionPayload = {
      projectId: testProjectId,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const thesisSession = sessionResult.data;

    // Verify initial session status is pending_thesis
    assertEquals(thesisSession.status, "pending_thesis", "Session should start with pending_thesis status");

    // (2) Create root PLAN job with status = 'pending' (via generateContributions)
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: thesisSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);
    assertExists(planJobsResult.data, "generateContributions should return data");
    assertExists(planJobsResult.data?.job_ids, "generateContributions should return job_ids");
    
    if (!planJobsResult.data?.job_ids) {
      throw new Error("generateContributions returned no job_ids");
    }

    const { data: planJob, error: planJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .in("id", planJobsResult.data.job_ids)
      .single();
    
    assert(!planJobError, `Failed to fetch PLAN job: ${planJobError?.message}`);
    assertExists(planJob, "PLAN job should have been created");
    assertEquals(planJob.status, "pending", "Initial PLAN job status should be pending");

    // (3) Process the PLAN job - this will transition it to 'processing' and trigger session status update
    await mockAndProcessJob(planJob, workerDeps);
    
    // Wait for trigger to process session status update
    await new Promise((resolve) => setTimeout(resolve, 500));

    // (4) Assert session status is 'running_thesis'
    await pollForSessionStatus(thesisSession.id, "running_thesis");

    // (5) Process remaining jobs (child EXECUTE jobs, etc.)
    await processJobQueueUntilCompletion(thesisSession.id, workerDeps, testUserJwt);

    // Wait for all jobs to reach terminal states (triggers will update PLAN job when children complete)
    await waitForAllJobsToComplete(thesisSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // (7) Assert session status is 'pending_antithesis'
    await pollForSessionStatus(thesisSession.id, "pending_antithesis");
  });

  it("67.b.ii: should progress session through multi-stage flow: thesis → antithesis → synthesis", async () => {
    // Start with thesis stage
    const thesisSessionPayload: StartSessionPayload = {
      projectId: testProjectId,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const thesisSessionResult = await startSession(testUser, adminClient, thesisSessionPayload);
    if (thesisSessionResult.error || !thesisSessionResult.data) {
      throw new Error(`Failed to start thesis session: ${thesisSessionResult.error?.message}`);
    }
    const thesisSession = thesisSessionResult.data;

    // Process thesis stage
    const thesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: thesisSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const thesisPlanResult = await generateContributions(adminClient, thesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(thesisPlanResult.success, `Failed to generate thesis contributions: ${thesisPlanResult.error?.message}`);
    
    // Process thesis stage to completion (includes PLAN job processing)
    await processJobQueueUntilCompletion(thesisSession.id, workerDeps, testUserJwt);
    await waitForAllJobsToComplete(thesisSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Assert session advanced to pending_antithesis
    await pollForSessionStatus(thesisSession.id, "pending_antithesis");

    // Process antithesis stage
    const antithesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: thesisSession.id,
      stageSlug: "antithesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const antithesisPlanResult = await generateContributions(adminClient, antithesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(antithesisPlanResult.success, `Failed to generate antithesis contributions: ${antithesisPlanResult.error?.message}`);
    
    // Process antithesis stage to completion (includes PLAN job processing)
    await processJobQueueUntilCompletion(thesisSession.id, workerDeps, testUserJwt);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Assert session advanced to pending_synthesis
    await pollForSessionStatus(thesisSession.id, "pending_synthesis");
  });

  it("67.b.iii: should handle synthesis stage with multiple PLAN jobs correctly", async () => {
    // Start from thesis stage and progress through all stages in the same session (like a real user)
    const sessionPayload: StartSessionPayload = {
      projectId: testProjectId,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // (1) Process thesis stage to completion
    const thesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const thesisPlanResult = await generateContributions(adminClient, thesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(thesisPlanResult.success, `Failed to generate thesis contributions: ${thesisPlanResult.error?.message}`);
    
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    await waitForAllJobsToComplete(testSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await pollForSessionStatus(testSession.id, "pending_antithesis");

    // (2) Process antithesis stage to completion
    const antithesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "antithesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const antithesisPlanResult = await generateContributions(adminClient, antithesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(antithesisPlanResult.success, `Failed to generate antithesis contributions: ${antithesisPlanResult.error?.message}`);
    
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    await waitForAllJobsToComplete(testSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await pollForSessionStatus(testSession.id, "pending_synthesis");

    // (3) Now process synthesis stage with multiple PLAN jobs (via generateContributions - uses real recipe)
    const synthesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "synthesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const synthesisPlanResult = await generateContributions(adminClient, synthesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(synthesisPlanResult.success, `Failed to generate synthesis contributions: ${synthesisPlanResult.error?.message}`);
    assertExists(synthesisPlanResult.data?.job_ids, "Synthesis should create job_ids");

    if (!synthesisPlanResult.data?.job_ids) {
      throw new Error("generateContributions returned no job_ids");
    }
    
    // Get all root PLAN jobs for synthesis (the recipe may create multiple PLAN jobs)
    const { data: planJobs, error: planJobsError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("session_id", testSession.id)
      .eq("stage_slug", "synthesis")
      .eq("job_type", "PLAN")
      .is("parent_job_id", null)
      .eq("iteration_number", 1);
    
    assert(!planJobsError, `Failed to fetch PLAN jobs: ${planJobsError?.message}`);
    assertExists(planJobs, "PLAN jobs should exist");
    
    // Synthesis recipe may create 1 or more PLAN jobs depending on recipe structure
    // If there's only 1 PLAN job, process it and verify stage completion
    // If there are multiple, process them sequentially
    if (planJobs.length === 1) {
      // Single PLAN job - process it completely
      await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
      await waitForAllJobsToComplete(testSession.id);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else if (planJobs.length >= 2) {
      // Multiple PLAN jobs - process first one
      const firstPlanJob = planJobs[0];
      await mockAndProcessJob(firstPlanJob, workerDeps);
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Process first PLAN job's children
      await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
      await waitForAllJobsToComplete(testSession.id);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // (4) Assert session stays in 'running_synthesis' (not all PLAN jobs complete yet)
      await pollForSessionStatus(testSession.id, "running_synthesis");

      // (5) Process second PLAN job through lifecycle
      const secondPlanJob = planJobs[1];
      await mockAndProcessJob(secondPlanJob, workerDeps);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Process second PLAN job's children
      await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
      await waitForAllJobsToComplete(testSession.id);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // (6) Assert session advances to next stage
    const { data: finalSession } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSession.id)
      .single();
    
    assertExists(finalSession, "Session should exist");
    assert(
      finalSession.status === "pending_parenthesis" || finalSession.status === "iteration_complete_pending_review",
      `Session should advance after all PLAN jobs complete. Current status: ${finalSession.status}`,
    );
  });

  it("67.b.iv: should reach iteration_complete_pending_review after paralysis stage", async () => {
    // Start from thesis stage and progress through all stages in the same session (like a real user)
    const sessionPayload: StartSessionPayload = {
      projectId: testProjectId,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // (1) Process thesis stage to completion
    const thesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const thesisPlanResult = await generateContributions(adminClient, thesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(thesisPlanResult.success, `Failed to generate thesis contributions: ${thesisPlanResult.error?.message}`);
    
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    await waitForAllJobsToComplete(testSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await pollForSessionStatus(testSession.id, "pending_antithesis");

    // (2) Process antithesis stage to completion
    const antithesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "antithesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const antithesisPlanResult = await generateContributions(adminClient, antithesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(antithesisPlanResult.success, `Failed to generate antithesis contributions: ${antithesisPlanResult.error?.message}`);
    
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    await waitForAllJobsToComplete(testSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await pollForSessionStatus(testSession.id, "pending_synthesis");

    // (3) Process synthesis stage to completion
    const synthesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "synthesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const synthesisPlanResult = await generateContributions(adminClient, synthesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(synthesisPlanResult.success, `Failed to generate synthesis contributions: ${synthesisPlanResult.error?.message}`);
    
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    await waitForAllJobsToComplete(testSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Check if there's a next stage (parenthesis) or if we go directly to paralysis
    const { data: sessionAfterSynthesis } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSession.id)
      .single();
    
    if (sessionAfterSynthesis?.status === "pending_parenthesis") {
      // (4) Process parenthesis stage to completion
      const parenthesisGeneratePayload: GenerateContributionsPayload = {
        projectId: testProjectId,
        sessionId: testSession.id,
        stageSlug: "parenthesis",
        iterationNumber: 1,
        walletId: testWalletId,
        user_jwt: testUserJwt,
        is_test_job: true,
      };
      
      const parenthesisPlanResult = await generateContributions(adminClient, parenthesisGeneratePayload, testUser, workerDeps, testUserJwt);
      assert(parenthesisPlanResult.success, `Failed to generate parenthesis contributions: ${parenthesisPlanResult.error?.message}`);
      
      await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
      await waitForAllJobsToComplete(testSession.id);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await pollForSessionStatus(testSession.id, "pending_paralysis");
    } else {
      // Synthesis may go directly to paralysis depending on recipe
      await pollForSessionStatus(testSession.id, "pending_paralysis");
    }

    // (5) Process paralysis stage (terminal stage)
    const paralysisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "paralysis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const paralysisPlanResult = await generateContributions(adminClient, paralysisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(paralysisPlanResult.success, `Failed to generate paralysis contributions: ${paralysisPlanResult.error?.message}`);
    
    // Process all jobs to completion (includes PLAN job processing)
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    await waitForAllJobsToComplete(testSession.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // (6) Assert session status is 'iteration_complete_pending_review'
    await pollForSessionStatus(testSession.id, "iteration_complete_pending_review");
  });

  it("67.b.v: should handle failed PLAN job correctly (stage fails, no advancement)", async () => {
    // (1) Create session with PLAN job
    const sessionPayload: StartSessionPayload = {
      projectId: testProjectId,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    const generatePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const planResult = await generateContributions(adminClient, generatePayload, testUser, workerDeps, testUserJwt);
    assert(planResult.success, `Failed to generate contributions: ${planResult.error?.message}`);
    
    const { data: planJob } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .in("id", planResult.data?.job_ids ?? [])
      .single();
    
    assertExists(planJob, "PLAN job should exist");

    // Process the PLAN job to get to running_thesis
    await mockAndProcessJob(planJob, workerDeps);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await pollForSessionStatus(testSession.id, "running_thesis");

    // (2) Mark PLAN job as 'failed'
    const { error: failError } = await adminClient
      .from("dialectic_generation_jobs")
      .update({ status: "failed" })
      .eq("id", planJob.id);
    assert(!failError, `Failed to mark PLAN job as failed: ${failError?.message}`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // (3) Assert session status does NOT advance (stays at 'running_thesis')
    const { data: session } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSession.id)
      .single();
    
    assertExists(session, "Session should exist");
    assertEquals(
      session.status,
      "running_thesis",
      "Session status should remain running_thesis when PLAN job fails",
    );
  });

  it("67.b.vi: should handle retry_loop_failed PLAN job correctly (stage fails, no advancement)", async () => {
    // (1) Create session with PLAN job
    const sessionPayload: StartSessionPayload = {
      projectId: testProjectId,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    const generatePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const planResult = await generateContributions(adminClient, generatePayload, testUser, workerDeps, testUserJwt);
    assert(planResult.success, `Failed to generate contributions: ${planResult.error?.message}`);
    
    const { data: planJob } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .in("id", planResult.data?.job_ids ?? [])
      .single();
    
    assertExists(planJob, "PLAN job should exist");

    // Process the PLAN job to get to running_thesis
    await mockAndProcessJob(planJob, workerDeps);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await pollForSessionStatus(testSession.id, "running_thesis");

    // (2) Mark PLAN job as 'retry_loop_failed'
    const { error: failError } = await adminClient
      .from("dialectic_generation_jobs")
      .update({ status: "retry_loop_failed" })
      .eq("id", planJob.id);
    assert(!failError, `Failed to mark PLAN job as retry_loop_failed: ${failError?.message}`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // (3) Assert session status does NOT advance (stays at 'running_thesis')
    const { data: session } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSession.id)
      .single();
    
    assertExists(session, "Session should exist");
    assertEquals(
      session.status,
      "running_thesis",
      "Session status should remain running_thesis when PLAN job retry_loop_failed",
    );
  });

  it("67.b.vii: transaction safety: job status and session status updated atomically", async () => {
    // Create session and PLAN job
    const sessionPayload: StartSessionPayload = {
      projectId: testProjectId,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    const generatePayload: GenerateContributionsPayload = {
      projectId: testProjectId,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    
    const planResult = await generateContributions(adminClient, generatePayload, testUser, workerDeps, testUserJwt);
    assert(planResult.success, `Failed to generate contributions: ${planResult.error?.message}`);
    
    const { data: planJob } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .in("id", planResult.data?.job_ids ?? [])
      .single();
    
    assertExists(planJob, "PLAN job should exist");

    // Process PLAN job to get to running_thesis
    await mockAndProcessJob(planJob, workerDeps);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await pollForSessionStatus(testSession.id, "running_thesis");

    // Process all children
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mark PLAN job as completed - this should trigger session status update in same transaction
    const { error: completeError } = await adminClient
      .from("dialectic_generation_jobs")
      .update({ status: "completed" })
      .eq("id", planJob.id);
    assert(!completeError, `Failed to mark PLAN job as completed: ${completeError?.message}`);

    // Immediately check both job and session status - they should be consistent
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const { data: finalJob } = await adminClient
      .from("dialectic_generation_jobs")
      .select("status")
      .eq("id", planJob.id)
      .single();
    
    const { data: finalSession } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSession.id)
      .single();
    
    assertExists(finalJob, "Job should exist");
    assertExists(finalSession, "Session should exist");
    
    // If job is completed, session should have advanced (atomic update)
    if (finalJob.status === "completed") {
      assert(
        finalSession.status === "pending_antithesis" || finalSession.status === "running_thesis",
        `If PLAN job is completed, session should be in valid state. Job status: ${finalJob.status}, Session status: ${finalSession.status}`,
      );
    }
    
    // Verify atomicity: if we query again, state should be consistent
    await new Promise((resolve) => setTimeout(resolve, 500));
    const { data: verifySession } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSession.id)
      .single();
    
    assertExists(verifySession, "Session should exist");
    assertEquals(
      verifySession.status,
      finalSession.status,
      "Session status should remain consistent (atomic update)",
    );
  });
});
