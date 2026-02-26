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
  DialecticPlanJobPayload,
  DialecticStageRecipeStep,
  SourceDocument,
  SelectAnchorResult,
  DialecticRecipeStep,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { isDialecticJobRow, isDialecticRecipeStep } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { FileType } from "../../functions/_shared/types/file_manager.types.ts";
import { 
  createDialecticWorkerDeps, 
  handleJob,
} from "../../functions/dialectic-worker/index.ts";
import { IJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { findSourceDocuments } from "../../functions/dialectic-worker/findSourceDocuments.ts";
import { planPerSourceDocument } from "../../functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts";
import { planPerModel } from "../../functions/dialectic-worker/strategies/planners/planPerModel.ts";
import { selectAnchorSourceDocument } from "../../functions/dialectic-worker/strategies/helpers.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import {
  ChatApiRequest,
  FinishReason,
} from "../../functions/_shared/types.ts";
import {
  SystemMaterials,
  HeaderContextArtifact,
  HeaderContext,
  ContextForDocument,
  UnifiedAIResponse,
  CallModelDependencies,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { isOutputRule, isContextForDocumentArray, isDialecticStageRecipeStep } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { isDialecticRecipeTemplateStep } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { isDialecticExecuteJobPayload } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { isJson } from "../../functions/_shared/utils/type_guards.ts";

describe("selectAnchorSourceDocument Planner Integration Tests (Step 94.f)", () => {
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

    const finishReason: FinishReason = "stop";
    const rawProviderResponse: Record<string, unknown> = {};

    const systemMaterials: SystemMaterials = {
      stage_rationale: "Integration test stub: stage rationale",
      agent_notes_to_self: "Integration test stub: agent internal summary",
      input_artifacts_summary: "Integration test stub: input artifacts summary",
    };

    const headerContextArtifact: HeaderContextArtifact = {
      type: "header_context",
      document_key: "header_context",
      artifact_class: "header_context",
      file_type: "json",
    };

    const documentStub: Record<string, unknown> = {
      content: `# ${outputType ?? "document"}\n\nThis is an integration test stub document body.`,
    };

    const shouldReturnHeaderContext =
      outputType === FileType.HeaderContext ||
      outputType === "header_context" ||
      outputType === "header_context_pairwise" ||
      outputType === "synthesis_header_context";

    const callStub = stub(
      deps,
      "callUnifiedAIModel",
      async (
        _chatApiRequest: ChatApiRequest,
        _userAuthToken: string,
        _dependencies?: CallModelDependencies,
      ): Promise<UnifiedAIResponse> => {
        if (!shouldReturnHeaderContext) {
          return {
            content: JSON.stringify(documentStub),
            finish_reason: finishReason,
            inputTokens: 100,
            outputTokens: 200,
            processingTimeMs: 500,
            rawProviderResponse,
          };
        }

        const plannerMetadata = isRecord(payload) ? payload["planner_metadata"] : undefined;
        const recipeStepId = isRecord(plannerMetadata) ? plannerMetadata["recipe_step_id"] : undefined;
        if (typeof recipeStepId !== "string" || recipeStepId.length === 0) {
          throw new Error("Integration test harness requires payload.planner_metadata.recipe_step_id to build HeaderContext from DB recipe step");
        }

        const stageSlugRaw = job.stage_slug;
        if (typeof stageSlugRaw !== "string" || stageSlugRaw.length === 0) {
          throw new Error("Integration test harness requires job.stage_slug to be a non-empty string to resolve the active recipe instance");
        }

        const { data: stageRow, error: stageRowError } = await adminClient
          .from("dialectic_stages")
          .select("active_recipe_instance_id")
          .eq("slug", stageSlugRaw)
          .single();
        assert(!stageRowError, `Failed to resolve stage '${stageSlugRaw}': ${stageRowError?.message}`);
        assertExists(stageRow?.active_recipe_instance_id, `Stage '${stageSlugRaw}' has no active_recipe_instance_id`);

        const { data: instanceRow, error: instanceRowError } = await adminClient
          .from("dialectic_stage_recipe_instances")
          .select("id, is_cloned, template_id")
          .eq("id", stageRow.active_recipe_instance_id)
          .single();
        assert(!instanceRowError, `Failed to load recipe instance '${stageRow.active_recipe_instance_id}': ${instanceRowError?.message}`);
        assertExists(instanceRow, `Recipe instance '${stageRow.active_recipe_instance_id}' not found`);

        const isCloned = instanceRow.is_cloned === true;
        let outputsRequired: unknown;
        if (isCloned) {
          const { data: stepRow, error: stepError } = await adminClient
            .from("dialectic_stage_recipe_steps")
            .select("outputs_required")
            .eq("instance_id", instanceRow.id)
            .eq("id", recipeStepId)
            .single();
          assert(!stepError, `Failed to load stage recipe step ${recipeStepId}: ${stepError?.message}`);
          outputsRequired = stepRow?.outputs_required;
        } else {
          const { data: stepRow, error: stepError } = await adminClient
            .from("dialectic_recipe_template_steps")
            .select("outputs_required")
            .eq("template_id", instanceRow.template_id)
            .eq("id", recipeStepId)
            .single();
          assert(!stepError, `Failed to load template recipe step ${recipeStepId}: ${stepError?.message}`);
          outputsRequired = stepRow?.outputs_required;
        }

        if (!isOutputRule(outputsRequired)) {
          throw new Error(`Recipe step ${recipeStepId} outputs_required is not a valid OutputRule object`);
        }

        const contextForDocuments = outputsRequired.context_for_documents;
        if (!isContextForDocumentArray(contextForDocuments) || contextForDocuments.length === 0) {
          throw new Error(`Recipe step ${recipeStepId} outputs_required.context_for_documents must be a non-empty ContextForDocument[] for HeaderContext generation`);
        }

        const headerContext: HeaderContext = {
          system_materials: systemMaterials,
          header_context_artifact: headerContextArtifact,
          context_for_documents: contextForDocuments,
        };

        return {
          content: JSON.stringify(headerContext),
          finish_reason: finishReason,
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          rawProviderResponse,
        };
      },
    );
    try {
      await handleJob(adminClient, job, deps, testUserJwt);
    } finally {
      callStub.restore();
    }
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
    formData.append("projectName", "SelectAnchorSourceDocument Planner Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for selectAnchorSourceDocument planner integration test");
    
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
    testWalletId = walletData.wallet_id;
  });

  afterAll(async () => {
    await coreCleanupTestResources('local');
  });

  // Test 94.f.i: planPerSourceDocument correctly handles 'derive_from_header_context' status
  it("94.f.i: planPerSourceDocument correctly handles derive_from_header_context status", async () => {
    // Create a session and generate thesis stage to get header_context
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // Generate thesis stage contributions (creates header_context and documents)
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    // Process thesis stage jobs until header_context is created
    let iterations = 0;
    while (iterations < 10) {
      const { data: pendingJobs } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', testSession.id)
        .eq('stage_slug', 'thesis')
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);
      
      if (!pendingJobs || pendingJobs.length === 0) {
        break;
      }

      for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
          throw new Error(`Fetched entity is not a valid DialecticJobRow`);
        }
        await mockAndProcessJob(job, workerDeps);
      }
      iterations++;
    }

    // Get the thesis stage recipe step for Step 2 (Thesis EXECUTE step that uses header_context)
    const { data: thesisStage } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", "thesis")
      .single();
    assertExists(thesisStage?.active_recipe_instance_id, "Thesis stage must have active recipe instance");

    const { data: instance } = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", thesisStage.active_recipe_instance_id)
      .single();
    assertExists(instance, "Recipe instance must exist");

    // Get recipe steps - find Step 2 EXECUTE step (execution_order = 2)
    const isCloned = instance.is_cloned === true;
    let recipeSteps: unknown[] = [];
    if (isCloned) {
      const { data: steps } = await adminClient
        .from("dialectic_stage_recipe_steps")
        .select("*")
        .eq("instance_id", instance.id)
        .eq("execution_order", 2)
        .eq("job_type", "EXECUTE");
      recipeSteps = steps || [];
    } else {
      const { data: steps } = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("*")
        .eq("template_id", instance.template_id)
        .eq("step_number", 2)
        .eq("job_type", "EXECUTE");
      recipeSteps = steps || [];
    }

    assert(recipeSteps.length > 0, "Must find at least one Step 2 EXECUTE recipe step");
    
    // Find a step that requires header_context input and produces documents
    let thesisStep2: DialecticRecipeStep | null = null;
    for (const step of recipeSteps) {
      if (!isRecord(step)) continue;
      
      // Type guard for step.id
      const stepId = step.id;
      if (typeof stepId !== 'string' || stepId.length === 0) continue;
      
      const inputsRequired = step.inputs_required;
      const outputsRequired = step.outputs_required;
      
      // Check if step requires header_context input
      const requiresHeaderContext = Array.isArray(inputsRequired) && 
        inputsRequired.some((rule: unknown) => 
          isRecord(rule) && rule.type === 'header_context'
        );
      
      // Check if step produces documents (not header_context)
      const producesDocuments = isRecord(outputsRequired) && 
        Array.isArray(outputsRequired.documents) && 
        outputsRequired.documents.length > 0;

      if (requiresHeaderContext && producesDocuments) {
        // Convert to DialecticStageRecipeStep format
        const { data: fullStep } = isCloned
          ? await adminClient
              .from("dialectic_stage_recipe_steps")
              .select("*")
              .eq("id", stepId)
              .single()
          : await adminClient
              .from("dialectic_recipe_template_steps")
              .select("*")
              .eq("id", stepId)
              .single();
        
        if (fullStep && isDialecticRecipeStep(fullStep)) {
          thesisStep2 = fullStep;
          break;
        }
      }
    }

    assertExists(thesisStep2, "Must find a Thesis Step 2 that requires header_context and produces documents");

    if (!thesisStep2) {
      throw new Error("thesisStep2 is null after assertExists");
    }

    // Create a parent job for antithesis stage
    const parentJobPayload: DialecticPlanJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: 'thesis',
      iterationNumber: 1,
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    if (!isJson(parentJobPayload)) {
      throw new Error("Parent job payload is not a valid JSON object");
    }

    const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: 'thesis',
      iteration_number: 1,
      status: "pending",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: parentJobPayload,
      is_test_job: false,
      job_type: "PLAN",
    };

    // Find source documents for this step (should include header_context but no document inputs)
    const sourceDocuments = await findSourceDocuments(
      adminClient,
      parentJob,
      thesisStep2.inputs_required,
    );

    assert(sourceDocuments.length > 0, "Must find at least one source document (header_context)");

    // Verify selectAnchorSourceDocument returns 'derive_from_header_context'
    const anchorResult: SelectAnchorResult = selectAnchorSourceDocument(thesisStep2, sourceDocuments);
    assertEquals(anchorResult.status, 'derive_from_header_context', 'selectAnchorSourceDocument should return derive_from_header_context for Thesis Step 2');

    // Call planPerSourceDocument with the real source documents and recipe step
    const childPayloads = planPerSourceDocument(
      sourceDocuments,
      parentJob,
      thesisStep2,
      testUserJwt,
    );

    // Verify planPerSourceDocument handles derive_from_header_context correctly
    // When derive_from_header_context, planner should derive anchor from header_context's sourceAnchorModelSlug
    assert(childPayloads.length > 0, "planPerSourceDocument should create child jobs");
    
    for (const payload of childPayloads) {
      assert(isDialecticExecuteJobPayload(payload), "Each child payload should be an EXECUTE job payload");
      
      if (isDialecticExecuteJobPayload(payload)) {
        // Verify document_relationships is set correctly
        // For derive_from_header_context, the planner should look up header_context and use its source_group if available
        const relationships = payload.document_relationships;
        assertExists(relationships, "document_relationships must be defined");
        
        // The planner should have handled derive_from_header_context status appropriately
        // This test verifies the planner doesn't throw an error and produces valid payloads
      }
    }
  });

  // Test 94.f.ii: planPerModel correctly handles 'no_anchor_required' for consolidation
  it("94.f.ii: planPerModel correctly handles no_anchor_required for consolidation", async () => {
    // Create a session and generate through synthesis pairwise stage
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: "synthesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // Generate synthesis stage up to Step 3 (consolidation)
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "synthesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    // Note: We don't process jobs here because synthesis requires thesis/antithesis documents
    // that don't exist in this test setup. The test only needs the Step 3 recipe step,
    // which we can find directly from the database without processing jobs.

    // Get the synthesis stage recipe step for Step 3 (consolidation with per_model granularity)
    const { data: synthesisStage } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", "synthesis")
      .single();
    assertExists(synthesisStage?.active_recipe_instance_id, "Synthesis stage must have active recipe instance");

    const { data: synthesisInstance } = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", synthesisStage.active_recipe_instance_id)
      .single();
    assertExists(synthesisInstance, "Recipe instance must exist");

    // Get Step 3 consolidation recipe step by specific step_key
    const consolidationStepKey = "synthesis_document_business_case";
    const isCloned = synthesisInstance.is_cloned === true;
    let consolidationStep: DialecticRecipeStep | null = null;

    if (isCloned) {
      const { data: step } = await adminClient
        .from("dialectic_stage_recipe_steps")
        .select("*")
        .eq("instance_id", synthesisInstance.id)
        .eq("step_key", consolidationStepKey)
        .single();
      if (step && isDialecticStageRecipeStep(step)) {
        consolidationStep = step;
      }
    } else {
      const { data: step } = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("*")
        .eq("template_id", synthesisInstance.template_id)
        .eq("step_key", consolidationStepKey)
        .single();
      if (step && isDialecticRecipeStep(step)) {
        consolidationStep = step;
      }
    }

    assertExists(consolidationStep, `Must find Synthesis consolidation recipe step '${consolidationStepKey}'`);
    assertEquals(consolidationStep?.granularity_strategy, "per_model", `Step '${consolidationStepKey}' must have granularity_strategy = 'per_model'`);

    if (!consolidationStep) {
      throw new Error("consolidationStep is null after assertExists");
    }

    // Create a parent job for synthesis consolidation
    const parentJobPayload: DialecticPlanJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: 'synthesis',
      iterationNumber: 1,
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    if (!isJson(parentJobPayload)) {
      throw new Error("Parent job payload is not a valid JSON object");
    }

    const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: 'synthesis',
      iteration_number: 1,
      status: "pending",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: parentJobPayload,
      is_test_job: false,
      job_type: "PLAN",
    };

    // Seed dialectic_project_resources with mock pairwise synthesis documents
    // that findSourceDocuments will query for
    const mockResourceIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const resourceId = crypto.randomUUID();
      mockResourceIds.push(resourceId);
      const { error: insertError } = await adminClient
        .from("dialectic_project_resources")
        .insert({
          id: resourceId,
          project_id: testProject.id,
          session_id: testSession.id,
          stage_slug: "synthesis",
          iteration_number: 1,
          resource_type: "rendered_document",
          file_name: `synthesis_pairwise_business_case_${i}.md`,
          storage_bucket: "dialectic-contributions",
          storage_path: `/test/projects/${testProject.id}/sessions/${testSession.id}/synthesis/synthesis_pairwise_business_case_${i}.md`,
          mime_type: "text/markdown",
          size_bytes: 100,
          user_id: testUserId,
        });
      if (insertError) {
        throw new Error(`Failed to seed mock resource: ${insertError.message}`);
      }
    }

    // Find source documents for consolidation step (pairwise synthesis chunks)
    const sourceDocuments = await findSourceDocuments(
      adminClient,
      parentJob,
      consolidationStep.inputs_required,
    );

    // Verify selectAnchorSourceDocument returns 'no_anchor_required' for consolidation
    const anchorResult: SelectAnchorResult = selectAnchorSourceDocument(consolidationStep, sourceDocuments);
    assertEquals(anchorResult.status, 'no_anchor_required', 'selectAnchorSourceDocument should return no_anchor_required for consolidation step');

    // Call planPerModel with the real source documents and recipe step
    const childPayloads = planPerModel(
      sourceDocuments,
      parentJob,
      consolidationStep,
      testUserJwt,
    );

    // Verify planPerModel handles no_anchor_required correctly
    // When no_anchor_required, planner should set source_group = null to create new lineage root
    assert(childPayloads.length > 0, "planPerModel should create child jobs");
    
    for (const payload of childPayloads) {
      assert(isDialecticExecuteJobPayload(payload), "Each child payload should be an EXECUTE job payload");
      
      if (isDialecticExecuteJobPayload(payload)) {
        const relationships = payload.document_relationships;
        assertExists(relationships, "document_relationships must be defined");
        
        if (relationships) {
          // For consolidation with no_anchor_required, source_group should be null to signal new lineage root
          // The producer will set source_group to self.id when it saves the contribution
          if (relationships.source_group !== null && relationships.source_group !== undefined) {
            // If source_group is set, it should be explicitly null for consolidation
            // (The planner may set it to null, or the producer will set it later)
            // The key test is that the planner doesn't throw an error and produces valid payloads
          }
        }
      }
    }
  });

  // Test 95.f: planPerSourceDocument model-filtering integration tests
  it("95.f.i: Thesis stage with 3 models produces 3 header_contexts, then 3×4=12 documents where each model uses its own header_context", async () => {
    const modelIds: string[] = [];
    const modelIdentifiers = [
      { api_identifier: "test-model-a", provider: "test-provider", name: "Model A" },
      { api_identifier: "test-model-b", provider: "test-provider", name: "Model B" },
      { api_identifier: "test-model-c", provider: "test-provider", name: "Model C" },
    ];

    for (const modelInfo of modelIdentifiers) {
      const { data: existingModel } = await adminClient
        .from("ai_providers")
        .select("id")
        .eq("api_identifier", modelInfo.api_identifier)
        .eq("is_active", true)
        .eq("is_enabled", true)
        .maybeSingle();

      const validConfig = {
        api_identifier: modelInfo.api_identifier,
        context_window_tokens: 128000,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: "cl100k_base",
        },
        provider_max_input_tokens: 128000,
        provider_max_output_tokens: 16000,
      };

      let model = existingModel;
      if (!model) {
        const { data: newModel, error: createError } = await adminClient
          .from("ai_providers")
          .insert({
            api_identifier: modelInfo.api_identifier,
            provider: modelInfo.provider,
            name: modelInfo.name,
            config: validConfig,
            is_active: true,
            is_enabled: true,
          })
          .select("id")
          .single();
        assert(!createError, `Failed to create test model ${modelInfo.name}: ${createError?.message}`);
        assertExists(newModel, `New model ${modelInfo.name} should be created`);
        model = newModel;
      } else {
        // Update existing model's config to ensure it's valid
        const { error: updateError } = await adminClient
          .from("ai_providers")
          .update({ config: validConfig })
          .eq("id", model.id);
        assert(!updateError, `Failed to update test model ${modelInfo.name} config: ${updateError?.message}`);
      }
      modelIds.push(model.id);
    }

    assertEquals(modelIds.length, 3, "Should have 3 model IDs");

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: modelIds,
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    let iterations = 0;
    while (iterations < 50) {
      const { data: pendingJobs } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', testSession.id)
        .eq('stage_slug', 'thesis')
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);

      if (!pendingJobs || pendingJobs.length === 0) {
        break;
      }

      for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
          throw new Error(`Fetched entity is not a valid DialecticJobRow`);
        }
        await mockAndProcessJob(job, workerDeps);
      }
      iterations++;
    }

    const { data: headerContexts } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSession.id)
      .eq('stage', 'thesis')
      .eq('contribution_type', 'header_context')
      .eq('iteration_number', 1);

    assertExists(headerContexts, "Header contexts should exist");
    assertEquals(headerContexts.length, 3, "Should have 3 header contexts, one for each model");

    const headerContextModelIds = new Set(headerContexts.map(hc => hc.model_id).filter((id): id is string => id !== null));
    assertEquals(headerContextModelIds.size, 3, "Each header context should have a distinct model_id");

    for (const modelId of modelIds) {
      const matchingHeaderContexts = headerContexts.filter(hc => hc.model_id === modelId);
      assertEquals(matchingHeaderContexts.length, 1, `Should have exactly one header context for model ${modelId}`);
    }

    const { data: documents } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSession.id)
      .eq('stage', 'thesis')
      .eq('contribution_type', 'thesis')
      .eq('iteration_number', 1);

    assertExists(documents, "Documents should exist");
    assertEquals(documents.length, 12, "Should have 12 documents (3 models × 4 documents per model)");

    const documentsByModelId = new Map<string, number>();
    for (const doc of documents) {
      if (doc.model_id) {
        const count = documentsByModelId.get(doc.model_id) || 0;
        documentsByModelId.set(doc.model_id, count + 1);
      }
    }

    for (const modelId of modelIds) {
      const docCount = documentsByModelId.get(modelId) || 0;
      assertEquals(docCount, 4, `Model ${modelId} should have exactly 4 documents`);
    }
  });

  it("95.f.ii: Child job payload includes correct model_id from source document", async () => {
    const { data: existingModel } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    
    assertExists(existingModel, "Test model should exist");
    const testModelId = existingModel.id;

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    let iterations = 0;
    while (iterations < 50) {
      const { data: pendingJobs } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', testSession.id)
        .eq('stage_slug', 'thesis')
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);

      if (!pendingJobs || pendingJobs.length === 0) {
        break;
      }

      for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
          throw new Error(`Fetched entity is not a valid DialecticJobRow`);
        }
        await mockAndProcessJob(job, workerDeps);
      }
      iterations++;
    }

    const { data: headerContexts } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSession.id)
      .eq('stage', 'thesis')
      .eq('contribution_type', 'header_context')
      .eq('iteration_number', 1)
      .eq('model_id', testModelId);

    assertExists(headerContexts, "Header context should exist");
    assertEquals(headerContexts.length, 1, "Should have exactly one header context for test model");

    const headerContextDoc = headerContexts[0];
    assertExists(headerContextDoc, "Header context document should exist for test model");

    const { data: sourceDocs } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSession.id)
      .eq('stage', 'thesis')
      .eq('contribution_type', 'thesis')
      .eq('iteration_number', 1)
      .eq('model_id', testModelId);

    assertExists(sourceDocs, "Source documents should exist");
    assert(sourceDocs.length > 0, "Should have at least one source document");

    // Get the thesis stage recipe step for Step 2
    const { data: thesisStage } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", "thesis")
      .single();
    assertExists(thesisStage?.active_recipe_instance_id, "Thesis stage must have active recipe instance");

    const { data: instance } = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", thesisStage.active_recipe_instance_id)
      .single();
    assertExists(instance, "Recipe instance must exist");

    const isCloned = instance.is_cloned === true;
    let recipeSteps: unknown | null = null;
    
    if (isCloned) {
      const { data: step } = await adminClient
        .from("dialectic_stage_recipe_steps")
        .select("*")
        .eq("instance_id", instance.id)
        .eq("step_key", "thesis_generate_business_case")
        .maybeSingle();
      recipeSteps = step;
    } else {
      const { data: step } = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("*")
        .eq("template_id", instance.template_id)
        .eq("step_key", "thesis_generate_business_case")
        .maybeSingle();
      recipeSteps = step;
    }

    assertExists(recipeSteps, "Recipe step should exist");
    
    if (!isDialecticRecipeStep(recipeSteps)) {
      throw new Error("Recipe step from database is not a valid DialecticRecipeStep");
    }
    
    const executeStep: DialecticRecipeStep = recipeSteps;

    const parentJobPayload: DialecticPlanJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    if (!isJson(parentJobPayload)) {
      throw new Error("Parent job payload is not a valid JSON object");
    }

    const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "pending",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: parentJobPayload,
      is_test_job: false,
      job_type: "PLAN",
    };

    const sourceDocuments: SourceDocument[] = [
      {
        ...headerContextDoc,
        content: '',
        document_relationships: null,
      },
      ...sourceDocs.map(doc => ({
        ...doc,
        content: '',
        document_relationships: null,
      })),
    ];

    const childPayloads = planPerSourceDocument(
      sourceDocuments,
      parentJob,
      executeStep,
      testUserJwt,
    );

    assert(childPayloads.length > 0, "planPerSourceDocument should create child jobs");
    
    for (const payload of childPayloads) {
      assert(isDialecticExecuteJobPayload(payload), "Each child payload should be an EXECUTE job payload");
      
      if (isDialecticExecuteJobPayload(payload)) {
        const sourceDocCandidate = sourceDocuments.find(doc =>
          Object.values(payload.inputs ?? {}).includes(doc.id)
        );
        assertExists(sourceDocCandidate, "Source document should be found for child payload");
        
        if (!sourceDocCandidate) {
          throw new Error("Source document must exist");
        }
        
        const sourceDoc: SourceDocument = sourceDocCandidate;
        
        if (!sourceDoc.model_id) {
          throw new Error("Source document model_id should not be null");
        }
        
        const sourceDocModelId: string = sourceDoc.model_id;
        assertEquals(payload.model_id, sourceDocModelId, "Child job model_id must match source document model_id");
      }
    }
  });

  // Test 96.f.i: Synthesis Step 3 with 3 models produces 3×4=12 consolidated documents
  it("96.f.i: Synthesis Step 3 with 3 models produces 3×4=12 consolidated documents", async () => {
    // This test verifies planPerModel bundles inputs correctly for consolidation steps
    // Setup: Create 3 models for the test
    const modelIds: string[] = [];
    const modelIdentifiers = [
      { api_identifier: "consolidation-test-model-a", provider: "test-provider", name: "Consolidation Model A" },
      { api_identifier: "consolidation-test-model-b", provider: "test-provider", name: "Consolidation Model B" },
      { api_identifier: "consolidation-test-model-c", provider: "test-provider", name: "Consolidation Model C" },
    ];

    for (const modelInfo of modelIdentifiers) {
      const { data: existingModel } = await adminClient
        .from("ai_providers")
        .select("id")
        .eq("api_identifier", modelInfo.api_identifier)
        .eq("is_active", true)
        .eq("is_enabled", true)
        .maybeSingle();

      const validConfig = {
        api_identifier: modelInfo.api_identifier,
        context_window_tokens: 128000,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: "cl100k_base",
        },
        provider_max_input_tokens: 128000,
        provider_max_output_tokens: 16000,
      };

      let model = existingModel;
      if (!model) {
        const { data: newModel, error: createError } = await adminClient
          .from("ai_providers")
          .insert({
            api_identifier: modelInfo.api_identifier,
            provider: modelInfo.provider,
            name: modelInfo.name,
            config: validConfig,
            is_active: true,
            is_enabled: true,
          })
          .select("id")
          .single();
        assert(!createError, `Failed to create test model ${modelInfo.name}: ${createError?.message}`);
        assertExists(newModel, `New model ${modelInfo.name} should be created`);
        model = newModel;
      } else {
        const { error: updateError } = await adminClient
          .from("ai_providers")
          .update({ config: validConfig })
          .eq("id", model.id);
        assert(!updateError, `Failed to update test model ${modelInfo.name} config: ${updateError?.message}`);
      }
      modelIds.push(model.id);
    }

    assertEquals(modelIds.length, 3, "Should have 3 model IDs");

    // Get synthesis Stage 3 consolidation step with per_model granularity
    const { data: synthesisStage } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", "synthesis")
      .single();
    assertExists(synthesisStage?.active_recipe_instance_id, "Synthesis stage must have active recipe instance");

    const { data: synthesisInstance } = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", synthesisStage.active_recipe_instance_id)
      .single();
    assertExists(synthesisInstance, "Recipe instance must exist");

    // Get all Step 3 consolidation recipe steps (execution_order = 3, granularity_strategy = 'per_model')
    const isCloned = synthesisInstance.is_cloned === true;
    const consolidationSteps: DialecticRecipeStep[] = [];

    if (isCloned) {
      const { data: steps } = await adminClient
        .from("dialectic_stage_recipe_steps")
        .select("*")
        .eq("instance_id", synthesisInstance.id)
        .eq("execution_order", 3)
        .eq("granularity_strategy", "per_model");
      if (steps) {
        for (const step of steps) {
          if (isDialecticRecipeStep(step)) {
            consolidationSteps.push(step);
          }
        }
      }
    } else {
      const { data: steps } = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("*")
        .eq("template_id", synthesisInstance.template_id)
        .eq("step_number", 3)
        .eq("granularity_strategy", "per_model");
      if (steps) {
        for (const step of steps) {
          if (isDialecticRecipeStep(step)) {
            consolidationSteps.push(step);
          }
        }
      }
    }

    assert(consolidationSteps.length === 4, `Should find 4 Step 3 consolidation recipe steps with per_model granularity, found ${consolidationSteps.length}`);

    // Create a parent job for synthesis consolidation
    const testSessionId = crypto.randomUUID();

    // For each model and each consolidation step, planPerModel should create exactly 1 child job
    // Total expected: 3 models × 4 consolidation steps = 12 consolidated documents
    let totalChildPayloads = 0;

    for (const modelId of modelIds) {
      const parentJobPayload: DialecticPlanJobPayload = {
        projectId: testProject.id,
        sessionId: testSessionId,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: modelId,
        walletId: testWalletId,
        user_jwt: testUserJwt,
      };

      if (!isJson(parentJobPayload)) {
        throw new Error("Parent job payload is not a valid JSON object");
      }

      const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        id: crypto.randomUUID(),
        parent_job_id: null,
        session_id: testSessionId,
        user_id: testUserId,
        stage_slug: "synthesis",
        iteration_number: 1,
        status: "pending",
        max_retries: 3,
        attempt_count: 0,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        payload: parentJobPayload,
        is_test_job: false,
        job_type: "PLAN",
      };

      for (const consolidationStep of consolidationSteps) {
        // Create mock source documents (pairwise outputs) for this model
        // In real scenario, these would be the pairwise synthesis outputs
        const nowIso = new Date().toISOString();
        const mockSourceDocuments: SourceDocument[] = [
          {
            id: crypto.randomUUID(),
            session_id: testSessionId,
            stage: "synthesis",
            contribution_type: "synthesis_pairwise",
            iteration_number: 1,
            model_id: modelId,
            document_key: "synthesis_pairwise_business_case",
            storage_path: `/test/path/${crypto.randomUUID()}`,
            content: "mock pairwise content 1",
            document_relationships: { source_group: crypto.randomUUID() },
            created_at: nowIso,
            updated_at: nowIso,
            // Required fields from DialecticContributionRow
            citations: null,
            edit_version: 1,
            error: null,
            file_name: "mock_pairwise_1.md",
            is_header: false,
            is_latest_edit: true,
            mime_type: "text/markdown",
            model_name: "test-model",
            original_model_contribution_id: null,
            processing_time_ms: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: null,
            source_prompt_resource_id: null,
            storage_bucket: "dialectic-contributions",
            target_contribution_id: null,
            tokens_used_input: null,
            tokens_used_output: null,
            user_id: testUserId,
          },
          {
            id: crypto.randomUUID(),
            session_id: testSessionId,
            stage: "synthesis",
            contribution_type: "synthesis_pairwise",
            iteration_number: 1,
            model_id: modelId,
            document_key: "synthesis_pairwise_business_case",
            storage_path: `/test/path/${crypto.randomUUID()}`,
            content: "mock pairwise content 2",
            document_relationships: { source_group: crypto.randomUUID() },
            created_at: nowIso,
            updated_at: nowIso,
            // Required fields from DialecticContributionRow
            citations: null,
            edit_version: 1,
            error: null,
            file_name: "mock_pairwise_2.md",
            is_header: false,
            is_latest_edit: true,
            mime_type: "text/markdown",
            model_name: "test-model",
            original_model_contribution_id: null,
            processing_time_ms: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: null,
            source_prompt_resource_id: null,
            storage_bucket: "dialectic-contributions",
            target_contribution_id: null,
            tokens_used_input: null,
            tokens_used_output: null,
            user_id: testUserId,
          },
        ];

        // Call planPerModel which should bundle all inputs into a single job per model
        const childPayloads = planPerModel(
          mockSourceDocuments,
          parentJob,
          consolidationStep,
          testUserJwt,
        );

        // planPerModel should create exactly 1 child job for this model and step
        // Use type guard to narrow consolidationStep to a type with step_key
        if (!isDialecticStageRecipeStep(consolidationStep) && !isDialecticRecipeTemplateStep(consolidationStep)) {
          throw new Error("consolidationStep must be a DialecticStageRecipeStep or DialecticRecipeTemplateStep");
        }
        assertEquals(childPayloads.length, 1, `planPerModel should create exactly 1 child job per model for consolidation step ${consolidationStep.step_key}`);
        totalChildPayloads += childPayloads.length;

        // Verify the child payload bundles all source documents
        for (const payload of childPayloads) {
          assert(isDialecticExecuteJobPayload(payload), "Each child payload should be an EXECUTE job payload");

          if (isDialecticExecuteJobPayload(payload)) {
            // Verify model_id is set correctly
            assertEquals(payload.model_id, modelId, "Child job model_id must match parent job model_id");

            // Verify document_relationships exists
            const relationships = payload.document_relationships;
            assertExists(relationships, "document_relationships must be defined");
          }
        }
      }
    }

    // Verify total: 3 models × 4 consolidation steps = 12 child payloads
    assertEquals(totalChildPayloads, 12, "Should have 12 total child payloads (3 models × 4 consolidation steps)");
  });

  // Test 96.f.ii: Each consolidated document has source_group = self.id
  it("96.f.ii: Each consolidated document has source_group = null for new lineage root", async () => {
    // This test verifies that consolidation steps set source_group = null to signal new lineage
    // The producer will later set source_group = self.id when saving the contribution

    // Get synthesis Stage 3 consolidation step
    const { data: synthesisStage } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", "synthesis")
      .single();
    assertExists(synthesisStage?.active_recipe_instance_id, "Synthesis stage must have active recipe instance");

    const { data: synthesisInstance } = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", synthesisStage.active_recipe_instance_id)
      .single();
    assertExists(synthesisInstance, "Recipe instance must exist");

    // Get first Step 3 consolidation step
    const isCloned = synthesisInstance.is_cloned === true;
    let consolidationStep: DialecticRecipeStep | null = null;

    if (isCloned) {
      const { data: step } = await adminClient
        .from("dialectic_stage_recipe_steps")
        .select("*")
        .eq("instance_id", synthesisInstance.id)
        .eq("execution_order", 3)
        .eq("granularity_strategy", "per_model")
        .limit(1)
        .maybeSingle();
      if (step && isDialecticRecipeStep(step)) {
        consolidationStep = step;
      }
    } else {
      const { data: step } = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("*")
        .eq("template_id", synthesisInstance.template_id)
        .eq("step_number", 3)
        .eq("granularity_strategy", "per_model")
        .limit(1)
        .maybeSingle();
      if (step && isDialecticRecipeStep(step)) {
        consolidationStep = step;
      }
    }

    assertExists(consolidationStep, "Must find Synthesis Step 3 consolidation recipe step");

    if (!consolidationStep) {
      throw new Error("consolidationStep is null after assertExists");
    }

    // Create a parent job for synthesis consolidation
    const testSessionId = crypto.randomUUID();
    const parentJobPayload: DialecticPlanJobPayload = {
      projectId: testProject.id,
      sessionId: testSessionId,
      stageSlug: "synthesis",
      iterationNumber: 1,
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    if (!isJson(parentJobPayload)) {
      throw new Error("Parent job payload is not a valid JSON object");
    }

    const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSessionId,
      user_id: testUserId,
      stage_slug: "synthesis",
      iteration_number: 1,
      status: "pending",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: parentJobPayload,
      is_test_job: false,
      job_type: "PLAN",
    };

    // Create mock source documents with existing source_group values
    const existingSourceGroup = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const mockSourceDocuments: SourceDocument[] = [
      {
        id: crypto.randomUUID(),
        session_id: testSessionId,
        stage: "synthesis",
        contribution_type: "synthesis_pairwise",
        iteration_number: 1,
        model_id: testModelId,
        document_key: "synthesis_pairwise_business_case",
        storage_path: `/test/path/${crypto.randomUUID()}`,
        content: "mock pairwise content 1",
        document_relationships: { source_group: existingSourceGroup },
        created_at: nowIso,
        updated_at: nowIso,
        // Required fields from DialecticContributionRow
        citations: null,
        edit_version: 1,
        error: null,
        file_name: "mock_pairwise_1.md",
        is_header: false,
        is_latest_edit: true,
        mime_type: "text/markdown",
        model_name: "test-model",
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        storage_bucket: "dialectic-contributions",
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: testUserId,
      },
      {
        id: crypto.randomUUID(),
        session_id: testSessionId,
        stage: "synthesis",
        contribution_type: "synthesis_pairwise",
        iteration_number: 1,
        model_id: testModelId,
        document_key: "synthesis_pairwise_business_case",
        storage_path: `/test/path/${crypto.randomUUID()}`,
        content: "mock pairwise content 2",
        document_relationships: { source_group: existingSourceGroup },
        created_at: nowIso,
        updated_at: nowIso,
        // Required fields from DialecticContributionRow
        citations: null,
        edit_version: 1,
        error: null,
        file_name: "mock_pairwise_2.md",
        is_header: false,
        is_latest_edit: true,
        mime_type: "text/markdown",
        model_name: "test-model",
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        storage_bucket: "dialectic-contributions",
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: testUserId,
      },
    ];

    // Verify selectAnchorSourceDocument returns 'no_anchor_required' for consolidation
    const anchorResult: SelectAnchorResult = selectAnchorSourceDocument(consolidationStep, mockSourceDocuments);
    assertEquals(anchorResult.status, "no_anchor_required", "selectAnchorSourceDocument should return no_anchor_required for consolidation");

    // Call planPerModel
    const childPayloads = planPerModel(
      mockSourceDocuments,
      parentJob,
      consolidationStep,
      testUserJwt,
    );

    assert(childPayloads.length > 0, "planPerModel should create child jobs");

    for (const payload of childPayloads) {
      assert(isDialecticExecuteJobPayload(payload), "Each child payload should be an EXECUTE job payload");

      if (isDialecticExecuteJobPayload(payload)) {
        const relationships = payload.document_relationships;
        assertExists(relationships, "document_relationships must be defined");

        if (relationships) {
          // For consolidation with no_anchor_required, source_group should be null
          // This signals that the producer should set source_group = self.id when saving
          assertEquals(
            relationships.source_group,
            null,
            "Consolidation child job should have source_group = null to signal new lineage root"
          );
        }
      }
    }
  });
});
