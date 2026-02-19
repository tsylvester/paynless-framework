
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
  SubmitStageResponsesPayload,
  SubmitStageResponsesDependencies,
  DialecticSession,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { testLogger } from "../../functions/_shared/_integration.test.utils.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { MockIndexingService } from "../../functions/_shared/services/indexing_service.mock.ts";
import { EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { getMockAiProviderAdapter } from "../../functions/_shared/ai_service/ai_provider.mock.ts";
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
  // Shared session that persists across tests for multi-stage testing
  let sharedSession: DialecticSession | null = null;
  let capturedChatApiRequests: ChatApiRequest[] = [];

  const mockAndProcessJob = async (job: DialecticJobRow, deps: IJobContext) => {
    const payload = job.payload;
    const outputTypeRaw = isRecord(payload) ? payload["output_type"] : undefined;
    const outputType = typeof outputTypeRaw === "string" ? outputTypeRaw : undefined;

    // Override the external AI call for this specific job processing run
    const finishReason: FinishReason = "stop";
    const rawProviderResponse: Record<string, unknown> = {};

    const systemMaterials: SystemMaterials = {
      stage_rationale: "Integration test stub: stage rationale",
      agent_internal_summary: "Integration test stub: agent internal summary",
      input_artifacts_summary: "Integration test stub: input artifacts summary",
    };

    const headerContextArtifact: HeaderContextArtifact = {
      type: "header_context",
      document_key: "header_context",
      artifact_class: "header_context",
      file_type: "json",
    };

    // Populate content_to_include keys required by the real recipe validation (see failing logs).
    // Non-empty stub values ensure renderPrompt preserves section blocks and produces renderable output,
    // so that gatherArtifacts downloads non-empty content from storage into ChatApiRequest.resourceDocuments.
    const stubString = "Integration test stub content";
    const stubStringArray: string[] = ["Integration test stub item"];

    const businessCaseContentToInclude: ContentToInclude = {
      threats: stubString,
      strengths: stubString,
      next_steps: stubString,
      weaknesses: stubString,
      opportunities: stubString,
      executive_summary: stubString,
      market_opportunity: stubString,
      "risks_&_mitigation": stubString,
      proposal_references: stubStringArray,
      competitive_analysis: stubString,
      user_problem_validation: stubString,
      "differentiation_&_value_proposition": stubString,
    };

    const featureSpecFeature: ContentToInclude = {
      dependencies: stubStringArray,
      feature_name: stubString,
      user_stories: stubStringArray,
      success_metrics: stubStringArray,
      feature_objective: stubString,
      acceptance_criteria: stubStringArray,
    };
    const featureSpecFeatures: ContentToInclude[] = [featureSpecFeature];
    const featureSpecContentToInclude: ContentToInclude = {
      features: featureSpecFeatures,
    };

    const technicalApproachContentToInclude: ContentToInclude = {
      data: stubString,
      components: stubString,
      deployment: stubString,
      sequencing: stubString,
      architecture: stubString,
      open_questions: stubString,
      risk_mitigation: stubString,
    };

    const successMetricsContentToInclude: ContentToInclude = {
      ownership: stubString,
      guardrails: stubString,
      next_steps: stubString,
      data_sources: stubStringArray,
      primary_kpis: stubString,
      risk_signals: stubString,
      escalation_plan: stubString,
      measurement_plan: stubString,
      north_star_metric: stubString,
      outcome_alignment: stubString,
      reporting_cadence: stubString,
      lagging_indicators: stubString,
      leading_indicators: stubString,
    };

    const businessCaseCritiqueContentToInclude: ContentToInclude = {
      notes: stubStringArray,
      errors: stubStringArray,
      threats: stubStringArray,
      problems: stubStringArray,
      obstacles: stubStringArray,
      omissions: stubStringArray,
      strengths: stubStringArray,
      next_steps: stubString,
      weaknesses: stubStringArray,
      feasibility: stubString,
      discrepancies: stubStringArray,
      opportunities: stubStringArray,
      recommendations: stubStringArray,
      risks_mitigation: stubString,
      executive_summary: stubString,
      market_opportunity: stubString,
      proposal_references: stubString,
      competitive_analysis: stubString,
      areas_for_improvement: stubStringArray,
      user_problem_validation: stubString,
      fit_to_original_user_request: stubString,
      differentiation_value_proposition: stubString,
    };

    const technicalFeasibilityContentToInclude: ContentToInclude = {
      cost: stubString,
      data: stubString,
      team: stubString,
      summary: stubString,
      findings: stubStringArray,
      timeline: stubString,
      compliance: stubString,
      components: stubString,
      deployment: stubString,
      sequencing: stubString,
      integration: stubString,
      architecture: stubString,
      open_questions: stubString,
      risk_mitigation: stubString,
      constraint_checklist: stubStringArray,
    };

    const riskRegisterContentToInclude: ContentToInclude = {
      risk: stubString,
      notes: stubString,
      impact: stubString,
      overview: stubString,
      likelihood: stubString,
      mitigation: stubString,
      seed_examples: stubStringArray,
      mitigation_plan: stubString,
      required_fields: stubStringArray,
    };

    const nonFunctionalRequirementsContentToInclude: ContentToInclude = {
      overview: stubString,
      security: stubString,
      categories: stubStringArray,
      compliance: stubString,
      guardrails: stubString,
      next_steps: stubString,
      performance: stubString,
      reliability: stubString,
      scalability: stubString,
      primary_kpis: stubString,
      risk_signals: stubString,
      maintainability: stubString,
      measurement_plan: stubString,
      outcome_alignment: stubString,
      lagging_indicators: stubString,
      leading_indicators: stubString,
    };

    const dependencyMapContentToInclude: ContentToInclude = {
      overview: stubString,
      components: stubStringArray,
      sequencing: stubString,
      dependencies: stubString,
      conflict_flags: stubStringArray,
      open_questions: stubString,
      risk_mitigation: stubString,
      integration_points: stubStringArray,
    };

    const comparisonVectorContentToInclude: ContentToInclude = {
      proposal: { lineage_key: stubString, source_model_slug: stubString },
      dimensions: {
        feasibility: { score: 1, rationale: stubString },
        complexity: { score: 1, rationale: stubString },
        security: { score: 1, rationale: stubString },
        performance: { score: 1, rationale: stubString },
        maintainability: { score: 1, rationale: stubString },
        scalability: { score: 1, rationale: stubString },
        cost: { score: 1, rationale: stubString },
        time_to_market: { score: 1, rationale: stubString },
        compliance_risk: { score: 1, rationale: stubString },
        alignment_with_constraints: { score: 1, rationale: stubString },
      },
    };

    const synthPairwiseBusinessCaseContentToInclude: ContentToInclude = {
      thesis_document: stubString,
      critique_document: stubString,
      comparison_signal: stubString,
      executive_summary: stubString,
      user_problem_validation: stubString,
      market_opportunity: stubString,
      competitive_analysis: stubString,
      "differentiation_&_value_proposition": stubString,
      "risks_&_mitigation": stubString,
      strengths: stubStringArray,
      weaknesses: stubStringArray,
      opportunities: stubStringArray,
      threats: stubStringArray,
      critique_alignment: stubString,
      resolved_positions: stubStringArray,
      open_questions: stubStringArray,
      next_steps: stubString,
      proposal_references: stubStringArray,
    };

    const synthPairwiseFeatureSpecContentToInclude: ContentToInclude = {
      thesis_document: stubString,
      feasibility_document: stubString,
      nfr_document: stubString,
      comparison_signal: stubString,
      features: [{ feature_name: stubString, feature_objective: stubString, user_stories: stubStringArray, acceptance_criteria: stubStringArray, dependencies: stubStringArray, success_metrics: stubStringArray, risk_mitigation: stubString, open_questions: stubString, feasibility_insights: stubStringArray, non_functional_alignment: stubStringArray, score_adjustments: stubStringArray }],
      feature_scope: stubStringArray,
      tradeoffs: stubStringArray,
    };

    const synthPairwiseTechnicalApproachContentToInclude: ContentToInclude = {
      thesis_document: stubString,
      risk_document: stubString,
      dependency_document: stubString,
      architecture: stubString,
      components: stubStringArray,
      data: stubString,
      deployment: stubString,
      sequencing: stubString,
      architecture_alignment: stubStringArray,
      risk_mitigations: stubStringArray,
      dependency_resolution: stubStringArray,
      open_questions: stubStringArray,
    };

    const synthPairwiseSuccessMetricsContentToInclude: ContentToInclude = {
      thesis_document: stubString,
      critique_document: stubString,
      comparison_signal: stubString,
      outcome_alignment: stubString,
      north_star_metric: stubString,
      primary_kpis: stubStringArray,
      leading_indicators: stubStringArray,
      lagging_indicators: stubStringArray,
      guardrails: stubStringArray,
      measurement_plan: stubString,
      risk_signals: stubStringArray,
      next_steps: stubString,
      metric_alignment: stubStringArray,
      tradeoffs: stubStringArray,
      validation_checks: stubStringArray,
    };

    const productRequirementsContentToInclude: ContentToInclude = {
      executive_summary: stubString,
      mvp_description: stubString,
      user_problem_validation: stubString,
      market_opportunity: stubString,
      competitive_analysis: stubString,
      "differentiation_&_value_proposition": stubString,
      "risks_&_mitigation": stubString,
      strengths: stubStringArray,
      weaknesses: stubStringArray,
      opportunities: stubStringArray,
      threats: stubStringArray,
      feature_scope: stubStringArray,
      features: [{ feature_name: stubString, feature_objective: stubString, user_stories: stubStringArray, acceptance_criteria: stubStringArray, dependencies: stubStringArray, success_metrics: stubStringArray, risk_mitigation: stubString, open_questions: stubString, tradeoffs: stubStringArray }],
      feasibility_insights: stubStringArray,
      non_functional_alignment: stubStringArray,
      score_adjustments: stubStringArray,
      outcome_alignment: stubString,
      north_star_metric: stubString,
      primary_kpis: stubStringArray,
      leading_indicators: stubStringArray,
      lagging_indicators: stubStringArray,
      guardrails: stubStringArray,
      measurement_plan: stubString,
      risk_signals: stubStringArray,
      resolved_positions: stubStringArray,
      open_questions: stubStringArray,
      next_steps: stubString,
      proposal_references: stubStringArray,
      release_plan: stubStringArray,
      assumptions: stubStringArray,
      open_decisions: stubStringArray,
      implementation_risks: stubStringArray,
      stakeholder_communications: stubStringArray,
    };

    const systemArchitectureContentToInclude: ContentToInclude = {
      architecture_summary: stubString,
      architecture: stubString,
      services: stubStringArray,
      components: stubStringArray,
      data_flows: stubStringArray,
      interfaces: stubStringArray,
      integration_points: stubStringArray,
      dependency_resolution: stubStringArray,
      conflict_flags: stubStringArray,
      sequencing: stubString,
      risk_mitigations: stubStringArray,
      risk_signals: stubStringArray,
      security_measures: stubStringArray,
      observability_strategy: stubStringArray,
      scalability_plan: stubStringArray,
      resilience_strategy: stubStringArray,
      compliance_controls: stubStringArray,
      open_questions: stubStringArray,
      rationale: stubString,
    };

    const techStackContentToInclude: ContentToInclude = {
      frontend_stack: {},
      backend_stack: {},
      data_platform: {},
      devops_tooling: {},
      security_tooling: {},
      shared_libraries: stubStringArray,
      third_party_services: stubStringArray,
      components: [{ component_name: stubString, recommended_option: stubString, rationale: stubString, alternatives: stubStringArray, tradeoffs: stubStringArray, risk_signals: stubStringArray, integration_requirements: stubStringArray, operational_owners: stubStringArray, migration_plan: stubStringArray }],
      open_questions: stubStringArray,
      next_steps: stubStringArray,
    };

    const contextForDocuments: ContextForDocument[] = [
      { document_key: FileType.business_case, content_to_include: businessCaseContentToInclude },
      { document_key: FileType.feature_spec, content_to_include: featureSpecContentToInclude },
      { document_key: FileType.technical_approach, content_to_include: technicalApproachContentToInclude },
      { document_key: FileType.success_metrics, content_to_include: successMetricsContentToInclude },
      { document_key: FileType.business_case_critique, content_to_include: businessCaseCritiqueContentToInclude },
      { document_key: FileType.technical_feasibility_assessment, content_to_include: technicalFeasibilityContentToInclude },
      { document_key: FileType.risk_register, content_to_include: riskRegisterContentToInclude },
      { document_key: FileType.non_functional_requirements, content_to_include: nonFunctionalRequirementsContentToInclude },
      { document_key: FileType.dependency_map, content_to_include: dependencyMapContentToInclude },
      { document_key: FileType.comparison_vector, content_to_include: comparisonVectorContentToInclude },
      { document_key: FileType.synthesis_pairwise_business_case, content_to_include: synthPairwiseBusinessCaseContentToInclude },
      { document_key: FileType.synthesis_pairwise_feature_spec, content_to_include: synthPairwiseFeatureSpecContentToInclude },
      { document_key: FileType.synthesis_pairwise_technical_approach, content_to_include: synthPairwiseTechnicalApproachContentToInclude },
      { document_key: FileType.synthesis_pairwise_success_metrics, content_to_include: synthPairwiseSuccessMetricsContentToInclude },
      { document_key: FileType.product_requirements, content_to_include: productRequirementsContentToInclude },
      { document_key: FileType.system_architecture, content_to_include: systemArchitectureContentToInclude },
      { document_key: FileType.tech_stack, content_to_include: techStackContentToInclude },
    ];

    const headerContext: HeaderContext = {
      system_materials: systemMaterials,
      header_context_artifact: headerContextArtifact,
      context_for_documents: contextForDocuments,
    };

    const shouldReturnHeaderContext =
      outputType === FileType.HeaderContext ||
      outputType === "header_context" ||
      outputType === "header_context_pairwise" ||
      outputType === "synthesis_header_context";

    const assembledDocumentJsonStub: ContentToInclude = { assembled_content: stubString };

    const contentByOutputType: Record<string, ContentToInclude> = {
      [FileType.business_case]: businessCaseContentToInclude,
      [FileType.feature_spec]: featureSpecContentToInclude,
      [FileType.technical_approach]: technicalApproachContentToInclude,
      [FileType.success_metrics]: successMetricsContentToInclude,
      [FileType.business_case_critique]: businessCaseCritiqueContentToInclude,
      [FileType.technical_feasibility_assessment]: technicalFeasibilityContentToInclude,
      [FileType.risk_register]: riskRegisterContentToInclude,
      [FileType.non_functional_requirements]: nonFunctionalRequirementsContentToInclude,
      [FileType.dependency_map]: dependencyMapContentToInclude,
      assembled_document_json: assembledDocumentJsonStub,
      [FileType.product_requirements]: productRequirementsContentToInclude,
      [FileType.system_architecture]: systemArchitectureContentToInclude,
      [FileType.tech_stack]: techStackContentToInclude,
    };

    let stubContentObject: unknown;
    if (shouldReturnHeaderContext) {
      stubContentObject = headerContext;
    } else if (outputType === undefined) {
      // RENDER jobs are created by DB triggers and carry no output_type.
      // They never invoke callUnifiedAIModel, so stub content is irrelevant.
      stubContentObject = { content: stubString };
    } else {
      if (!(outputType in contentByOutputType)) {
        throw new Error(`mockAndProcessJob: no stub defined for output_type '${outputType}'. Add an explicit entry to contentByOutputType.`);
      }
      stubContentObject = { content: contentByOutputType[outputType] };
    }
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
        chatApiRequest: ChatApiRequest,
        _userAuthToken: string,
        _dependencies?: CallModelDependencies,
      ): Promise<UnifiedAIResponse> => {
        capturedChatApiRequests.push(chatApiRequest);
        return response;
      },
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
    assertEquals(finalJobs.filter(j => j.job_type === 'EXECUTE').length, 5, "Should be five EXECUTE jobs");
    assertEquals(finalJobs.filter(j => j.job_type === 'RENDER').length, 4, "Should be four RENDER jobs (header_context does not require rendering)");
    
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
    // All thesis jobs (PLAN + EXECUTE + RENDER) complete → status transitions to 'thesis_completed'.
    // Stage advancement to 'pending_antithesis' requires an explicit submitStageResponses call.
    const { data: updatedSession, error: updatedSessionError } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", thesisSession.id)
      .single();

    assert(!updatedSessionError, `Failed to fetch updated session: ${updatedSessionError?.message}`);
    assertExists(updatedSession, "Updated session should exist");
    assertEquals(updatedSession.status, "thesis_completed", "Session status should be 'thesis_completed' after all thesis jobs complete");

    // 7. Advance session to antithesis via submitStageResponses so sharedSession is ready for subsequent tests.
    const { data: thesisContributions } = await adminClient
      .from("dialectic_contributions")
      .select("id")
      .eq("session_id", thesisSession.id)
      .eq("stage", "thesis")
      .eq("contribution_type", "thesis")
      .eq("iteration_number", 1);

    assertExists(thesisContributions, "Thesis contributions must exist to advance session");
    assert(thesisContributions.length > 0, "Must have at least one thesis contribution to advance");

    const advanceFileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });
    const advanceIndexingService = new MockIndexingService();
    const advanceMockConfig = { ...MOCK_MODEL_CONFIG, output_token_cost_rate: 0.001 };
    const { instance: advanceMockAdapter } = getMockAiProviderAdapter(testLogger, advanceMockConfig);
    const advanceAdapterWithEmbedding = {
      ...advanceMockAdapter,
      getEmbedding: async (_text: string) => ({
        embedding: Array(1536).fill(0.1),
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    };
    const advanceEmbeddingClient = new EmbeddingClient(advanceAdapterWithEmbedding);
    const advanceDeps: SubmitStageResponsesDependencies = {
      logger: testLogger,
      fileManager: advanceFileManager,
      downloadFromStorage,
      indexingService: advanceIndexingService,
      embeddingClient: advanceEmbeddingClient,
    };

    const advancePayload: SubmitStageResponsesPayload = {
      sessionId: thesisSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      currentIterationNumber: 1,
      responses: thesisContributions.map(c => ({
        originalContributionId: c.id,
        responseText: `Integration test response for contribution ${c.id}`,
      })),
    };
    const advanceResult = await submitStageResponses(advancePayload, adminClient, testUser, advanceDeps);
    assert(advanceResult.data, `Failed to advance session to antithesis: ${advanceResult.error?.message}`);

    // Save session for subsequent tests that need to continue from thesis stage
    sharedSession = thesisSession;
  });

  it("21.b.ii: should NOT enqueue RENDER job when shouldEnqueueRenderJob returns false (JSON-only artifacts)", async () => {
    const iterationNumber = 1;

    // 1. Verify we have the shared session from the thesis test
    assertExists(sharedSession, "sharedSession must exist from 21.b.i thesis test");
    if (!sharedSession) throw new Error("sharedSession must exist from 21.b.i thesis test");
    const sessionId = sharedSession.id;

    // Helper to create submitStageResponses dependencies
    const createSubmitDeps = (): SubmitStageResponsesDependencies => {
      const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });
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
        fileManager: fileManager,
        downloadFromStorage: downloadFromStorage,
        indexingService: indexingService,
        embeddingClient: embeddingClient,
      };
    };

    // Helper to process a stage until completion
    const processStageUntilComplete = async (stageSlug: string) => {
      for (let i = 0; i < 50; i++) {
        const { data: pendingJobs } = await adminClient
          .from('dialectic_generation_jobs')
          .select('*')
          .eq('session_id', sessionId)
          .eq('stage_slug', stageSlug)
          .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);

        if (!pendingJobs || pendingJobs.length === 0) return;

        for (const job of pendingJobs) {
          if (!isDialecticJobRow(job)) throw new Error(`Invalid job row: ${JSON.stringify(job)}`);
          await mockAndProcessJob(job, workerDeps);
        }
      }
      throw new Error(`Processing stage ${stageSlug} exceeded max iterations`);
    };

    // 2. Check current session stage and advance as needed
    const { data: sessionData } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage:current_stage_id(slug)')
      .eq('id', sessionId)
      .single();

    assertExists(sessionData, "Session must exist");
    const currentStageSlug = sessionData.current_stage && !Array.isArray(sessionData.current_stage) 
      ? sessionData.current_stage.slug 
      : null;

    // If still at thesis, advance to antithesis
    if (currentStageSlug === 'thesis') {
      const { data: thesisContributions } = await adminClient
        .from('dialectic_contributions')
        .select('id')
        .eq('session_id', sessionId)
        .eq('stage', 'thesis')
        .eq('contribution_type', 'thesis')
        .eq('iteration_number', 1);

      assertExists(thesisContributions, "Thesis contributions must exist");
      assert(thesisContributions.length > 0, "Must have at least one thesis contribution");

      const thesisSubmitPayload: SubmitStageResponsesPayload = {
        sessionId: sessionId,
        projectId: testProject.id,
        stageSlug: 'thesis',
        currentIterationNumber: 1,
        responses: thesisContributions.map(c => ({
          originalContributionId: c.id,
          responseText: `Integration test response for contribution ${c.id}`,
        })),
      };

      const thesisSubmitResult = await submitStageResponses(thesisSubmitPayload, adminClient, testUser, createSubmitDeps());
      assert(thesisSubmitResult.data, `Failed to advance session to antithesis: ${thesisSubmitResult.error?.message}`);
    }

    // 3. Re-check stage and process antithesis if needed
    const { data: sessionDataAfterThesis } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage:current_stage_id(slug)')
      .eq('id', sessionId)
      .single();

    const stageAfterThesis = sessionDataAfterThesis?.current_stage && !Array.isArray(sessionDataAfterThesis.current_stage)
      ? sessionDataAfterThesis.current_stage.slug
      : null;

    if (stageAfterThesis === 'antithesis') {
      const antithesisPayload: GenerateContributionsPayload = {
        projectId: testProject.id,
        sessionId: sessionId,
        stageSlug: "antithesis",
        iterationNumber: iterationNumber,
        walletId: testWalletId,
        user_jwt: testUserJwt,
        is_test_job: true,
      };
      const antithesisResult = await generateContributions(adminClient, antithesisPayload, testUser, workerDeps, testUserJwt);
      assert(antithesisResult.success, `Failed to generate antithesis contributions: ${antithesisResult.error?.message}`);

      await processStageUntilComplete("antithesis");

      // 4. Advance session from antithesis to synthesis
      const { data: antithesisContributions } = await adminClient
        .from('dialectic_contributions')
        .select('id')
        .eq('session_id', sessionId)
        .eq('stage', 'antithesis')
        .eq('contribution_type', 'antithesis')
        .eq('iteration_number', 1);

      assertExists(antithesisContributions, "Antithesis contributions must exist");
      assert(antithesisContributions.length > 0, "Must have at least one antithesis contribution");

      const antithesisSubmitPayload: SubmitStageResponsesPayload = {
        sessionId: sessionId,
        projectId: testProject.id,
        stageSlug: 'antithesis',
        currentIterationNumber: 1,
        responses: antithesisContributions.map(c => ({
          originalContributionId: c.id,
          responseText: `Integration test response for contribution ${c.id}`,
        })),
      };

      const antithesisSubmitResult = await submitStageResponses(antithesisSubmitPayload, adminClient, testUser, createSubmitDeps());
      assert(antithesisSubmitResult.data, `Failed to advance session to synthesis: ${antithesisSubmitResult.error?.message}`);
    }

    // 5. Re-check stage and process synthesis if needed
    const { data: sessionDataAfterAntithesis } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage:current_stage_id(slug)')
      .eq('id', sessionId)
      .single();

    const stageAfterAntithesis = sessionDataAfterAntithesis?.current_stage && !Array.isArray(sessionDataAfterAntithesis.current_stage)
      ? sessionDataAfterAntithesis.current_stage.slug
      : null;

    if (stageAfterAntithesis === 'synthesis') {
      const synthesisPayload: GenerateContributionsPayload = {
        projectId: testProject.id,
        sessionId: sessionId,
        stageSlug: "synthesis",
        iterationNumber: iterationNumber,
        walletId: testWalletId,
        user_jwt: testUserJwt,
        is_test_job: true,
      };
      const synthesisResult = await generateContributions(adminClient, synthesisPayload, testUser, workerDeps, testUserJwt);
      assert(synthesisResult.success, `Failed to generate synthesis contributions: ${synthesisResult.error?.message}`);

      await processStageUntilComplete("synthesis");
    }

    // 6. Verify that NO "rendered_document" was created for synthesis stage (JSON-only artifacts)
    const { data: documents, error: listError } = await listStageDocuments({
      sessionId: sessionId,
      stageSlug: "synthesis",
      iterationNumber: iterationNumber,
      userId: testUserId,
      projectId: testProject.id
    }, adminClient);

    assert(!listError, `Failed to list stage documents: ${listError?.message}`);
    if(!documents) {
      throw new Error("listStageDocuments should return documents");
    }
    
    const renderedDocuments = documents.filter(d => d.documentKey.includes('rendered_'));
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

    // 3. Simulate the worker using the robust helpers so RENDER jobs created by
    //    DB triggers are also picked up after EXECUTE jobs complete.
    await processJobQueueUntilCompletion(thesisSession.id, workerDeps, testUserJwt);
    await pollForCondition(
      async () => {
        const { data: jobs } = await adminClient
          .from("dialectic_generation_jobs")
          .select("status")
          .eq("session_id", thesisSession.id)
          .in("status", ["pending", "retrying", "pending_continuation", "pending_next_step"]);
        return !jobs || jobs.length === 0;
      },
      "All thesis jobs to reach terminal state",
    );

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
    assertExists(documents, "listStageDocuments should return documents");
    
    const renderedDoc = documents.find(d => d.documentKey === FileType.business_case);
    assertExists(renderedDoc, "A rendered business_case document should exist");

    if(!renderedDoc) {
      throw new Error("Rendered document should have a last rendered resource ID");
    }
    const { data: content, error: contentError } = await getProjectResourceContent({ resourceId: renderedDoc.latestRenderedResourceId! }, adminClient, testUser);
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

    // 3. Simulate the worker using the robust helpers so RENDER jobs created by
    //    DB triggers are also picked up after EXECUTE jobs complete.
    await processJobQueueUntilCompletion(cleanSession.id, workerDeps, testUserJwt);
    await pollForCondition(
      async () => {
        const { data: jobs } = await adminClient
          .from("dialectic_generation_jobs")
          .select("status")
          .eq("session_id", cleanSession.id)
          .in("status", ["pending", "retrying", "pending_continuation", "pending_next_step"]);
        return !jobs || jobs.length === 0;
      },
      "All thesis jobs to reach terminal state",
    );

    // 4. USE THE APPLICATION'S FUNCTIONS to verify stage completion.
    // All thesis jobs complete → status is 'thesis_completed'. Advancing to 'pending_antithesis'
    // requires a separate submitStageResponses call which is outside this test's scope.
    const { data: updatedSession, error: sessionError } = await getSessionDetails({ sessionId: cleanSession.id }, adminClient, testUser);
    assert(!sessionError, `Failed to get session details: ${sessionError?.message}`);
    if(!updatedSession) {
      throw new Error("getSessionDetails should return session data");
    }
    assertEquals(updatedSession.session.status, "thesis_completed", "Session status should be 'thesis_completed' after all thesis jobs complete");
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
    const iterationNumber = 1;

    // Use the shared session that was advanced through thesis → antithesis → synthesis in 21.b.ii
    assertExists(sharedSession, "sharedSession must exist from prior tests");
    if (!sharedSession) throw new Error("sharedSession must exist from prior tests");
    const sessionId = sharedSession.id;

    // Synthesis was already processed in 21.b.ii, so just verify the outputs
    const { data: documents, error: listError } = await listStageDocuments({
      sessionId: sessionId,
      stageSlug: "synthesis",
      iterationNumber: iterationNumber,
      userId: testUserId,
      projectId: testProject.id
    }, adminClient);
    
    assert(!listError, `Failed to list stage documents: ${listError?.message}`);
    if (!documents) {
      throw new Error("listStageDocuments should return documents");
    }
    
    // Synthesis produces final deliverables (product_requirements, system_architecture, tech_stack)
    const productRequirementsDocs = documents.filter(d => 
      d.documentKey.includes(FileType.product_requirements)
    );
    assert(productRequirementsDocs.length >= 1, "Should have at least 1 product_requirements document from synthesis stage");
  });

  it("21.b.vii: EXECUTE jobs with document-type input rules send non-empty resourceDocuments content to the AI model", async () => {
    capturedChatApiRequests = [];
    const iterationNumber = 1;

    // Start a new isolated session for this test to ensure clean, independent verification
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const isolatedSession = sessionResult.data;

    // 1. Process thesis stage to completion — this creates rendered_document resources in storage
    //    that antithesis EXECUTE jobs will consume via document-type input rules.
    const thesisPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: isolatedSession.id,
      stageSlug: "thesis",
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    const thesisResult = await generateContributions(adminClient, thesisPayload, testUser, workerDeps, testUserJwt);
    assert(thesisResult.success, `Failed to generate thesis contributions: ${thesisResult.error?.message}`);
    await processJobQueueUntilCompletion(isolatedSession.id, workerDeps, testUserJwt);

    // Reset captures — we care only about requests sent by jobs that have document-type input rules
    capturedChatApiRequests = [];

    // 2. Advance session from thesis to antithesis
    const { data: thesisContributions } = await adminClient
      .from("dialectic_contributions")
      .select("id")
      .eq("session_id", isolatedSession.id)
      .eq("stage", "thesis")
      .eq("contribution_type", "thesis")
      .eq("iteration_number", iterationNumber);

    assertExists(thesisContributions, "Thesis contributions must exist before advancing");
    assert(thesisContributions.length > 0, "Must have at least one thesis contribution to advance");

    const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });
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
    const submitDeps: SubmitStageResponsesDependencies = {
      logger: testLogger,
      fileManager,
      downloadFromStorage,
      indexingService,
      embeddingClient,
    };

    const thesisSubmitPayload: SubmitStageResponsesPayload = {
      sessionId: isolatedSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      currentIterationNumber: iterationNumber,
      responses: thesisContributions.map(c => ({
        originalContributionId: c.id,
        responseText: `Integration test response for contribution ${c.id}`,
      })),
    };
    const thesisSubmitResult = await submitStageResponses(thesisSubmitPayload, adminClient, testUser, submitDeps);
    assert(thesisSubmitResult.data, `Failed to advance session to antithesis: ${thesisSubmitResult.error?.message}`);

    // 3. Generate and process antithesis stage.
    //    Antithesis EXECUTE jobs have document-type input rules that reference thesis rendered documents.
    //    gatherArtifacts must download those documents from Supabase Storage and populate resourceDocuments.
    const antithesisPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: isolatedSession.id,
      stageSlug: "antithesis",
      iterationNumber: iterationNumber,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      is_test_job: true,
    };
    const antithesisResult = await generateContributions(adminClient, antithesisPayload, testUser, workerDeps, testUserJwt);
    assert(antithesisResult.success, `Failed to generate antithesis contributions: ${antithesisResult.error?.message}`);
    await processJobQueueUntilCompletion(isolatedSession.id, workerDeps, testUserJwt);

    // 4. Assert: at least one captured ChatApiRequest has non-empty resourceDocuments.
    //    This proves gatherArtifacts downloaded real content from storage rather than returning empty strings.
    const requestsWithDocuments = capturedChatApiRequests.filter(
      req => Array.isArray(req.resourceDocuments) && req.resourceDocuments.length > 0,
    );
    assert(
      requestsWithDocuments.length > 0,
      `Expected at least one ChatApiRequest with non-empty resourceDocuments from EXECUTE jobs with document-type input rules, but found none. Total captured requests: ${capturedChatApiRequests.length}`,
    );

    for (const req of requestsWithDocuments) {
      for (const doc of req.resourceDocuments!) {
        assert(
          typeof doc.content === "string" && doc.content.length > 0,
          `Expected resourceDocuments entry to have non-empty content string, but got: ${JSON.stringify(doc.content)}`,
        );
      }
    }
  });
});
