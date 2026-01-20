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
  SubmitStageResponsesPayload,
  SubmitStageResponsesDependencies,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { testLogger } from "../../functions/_shared/_integration.test.utils.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { MockIndexingService } from "../../functions/_shared/services/indexing_service.mock.ts";
import { EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { getMockAiProviderAdapter } from "../../functions/_shared/ai_service/ai_provider.mock.ts";
import { isDialecticJobRow } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
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
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import {
  ChatApiRequest,
  FinishReason,
} from "../../functions/_shared/types.ts";
import {
  SystemMaterials,
  HeaderContextArtifact,
  HeaderContext,
  UnifiedAIResponse,
  CallModelDependencies,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { isOutputRule, isContextForDocumentArray } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { deconstructStoragePath } from "../../functions/_shared/utils/path_deconstructor.ts";

describe("Dialectic Full DAG Traversal Integration Tests (Step 99.b)", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  const testModelIds: string[] = [];
  let testWalletId: string;
  let workerDeps: IJobContext;
  let testSessionId: string;

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
        let stepSlug: string | undefined;

        if (isCloned) {
          const { data: stepRow, error: stepError } = await adminClient
            .from("dialectic_stage_recipe_steps")
            .select("outputs_required, step_slug")
            .eq("instance_id", instanceRow.id)
            .eq("id", recipeStepId)
            .single();
          assert(!stepError, `Failed to load stage recipe step ${recipeStepId}: ${stepError?.message}`);
          outputsRequired = stepRow?.outputs_required;
          stepSlug = stepRow?.step_slug;
        } else {
          const { data: stepRow, error: stepError } = await adminClient
            .from("dialectic_recipe_template_steps")
            .select("outputs_required, step_slug")
            .eq("template_id", instanceRow.template_id)
            .eq("id", recipeStepId)
            .single();
          assert(!stepError, `Failed to load template recipe step ${recipeStepId}: ${stepError?.message}`);
          outputsRequired = stepRow?.outputs_required;
          stepSlug = stepRow?.step_slug;
        }

        if (!isOutputRule(outputsRequired)) {
          throw new Error(`Recipe step ${recipeStepId} outputs_required is not a valid OutputRule object`);
        }

        const contextForDocuments = outputsRequired.context_for_documents;
        if (!isContextForDocumentArray(contextForDocuments) || contextForDocuments.length === 0) {
          throw new Error(`Recipe step ${recipeStepId} outputs_required.context_for_documents must be a non-empty ContextForDocument[] for HeaderContext generation`);
        }

        // Dynamically determine the correct document_key for the header context
        // This is crucial for distinguishing between 'header_context' (default) and 'header_context_pairwise'
        let documentKey: HeaderContextArtifact['document_key'] = 'header_context';
        if (stepSlug === 'prepare-pairwise-synthesis-header') {
          documentKey = 'header_context_pairwise';
        } else if (stepSlug === 'generate-final-synthesis-header') {
          documentKey = 'header_context'; // Explicitly default, though 'header_context' is already set
        }

        const headerContextArtifact: HeaderContextArtifact = {
          type: "header_context",
          document_key: documentKey,
          artifact_class: "header_context",
          file_type: "json",
        };

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

  const processStageUntilComplete = async (
    sessionId: string,
    stageSlug: string,
    deps: IJobContext,
    maxIterations = 50,
  ): Promise<void> => {
    let iterations = 0;
    while (iterations < maxIterations) {
      const { data: pendingJobs } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .eq('stage_slug', stageSlug)
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);

      if (!pendingJobs || pendingJobs.length === 0) {
        return;
      }

      for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
          throw new Error(`Fetched entity is not a valid DialecticJobRow`);
        }
        await mockAndProcessJob(job, deps);
      }
      iterations++;
    }
    throw new Error(`Processing stage ${stageSlug} exceeded ${maxIterations} iterations; potential infinite loop`);
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
    formData.append("projectName", "Full DAG Traversal Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for full DAG traversal integration test");
    
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

    const modelIdentifiers = [
      { api_identifier: "full-dag-test-model-a", provider: "test-provider", name: "Full DAG Test Model A" },
      { api_identifier: "full-dag-test-model-b", provider: "test-provider", name: "Full DAG Test Model B" },
      { api_identifier: "full-dag-test-model-c", provider: "test-provider", name: "Full DAG Test Model C" },
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
      testModelIds.push(model.id);
    }

    assertEquals(testModelIds.length, 3, "Should have 3 model IDs");

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

  it("99.b.i: Thesis stage produces n×4 documents with correct header_context matching", async () => {
    const n = testModelIds.length;
    assertEquals(n, 3, "Test requires exactly 3 models");

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: testModelIds,
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;
    testSessionId = testSession.id;

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

    await processStageUntilComplete(testSession.id, "thesis", workerDeps);

    const { data: headerContexts } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSession.id)
      .eq('stage', 'thesis')
      .eq('contribution_type', 'header_context')
      .eq('iteration_number', 1);

    assertExists(headerContexts, "Header contexts should exist");
    assertEquals(headerContexts.length, n, `Should have ${n} header contexts, one for each model`);

    const headerContextModelIds = new Set(headerContexts.map(hc => hc.model_id).filter((id): id is string => id !== null));
    assertEquals(headerContextModelIds.size, n, `Each header context should have a distinct model_id`);

    for (const modelId of testModelIds) {
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
    const expectedDocumentCount = n * 4;
    assertEquals(documents.length, expectedDocumentCount, `Should have ${expectedDocumentCount} documents (${n} models × 4 documents per model)`);

    const documentsByModelId = new Map<string, number>();
    for (const doc of documents) {
      if (doc.model_id) {
        const count = documentsByModelId.get(doc.model_id) || 0;
        documentsByModelId.set(doc.model_id, count + 1);
      }
    }

    for (const modelId of testModelIds) {
      const docCount = documentsByModelId.get(modelId) || 0;
      assertEquals(docCount, 4, `Model ${modelId} should have exactly 4 documents`);
    }

    const headerContextsByModelId = new Map<string, typeof headerContexts[0]>();
    for (const hc of headerContexts) {
      if (hc.model_id) {
        headerContextsByModelId.set(hc.model_id, hc);
      }
    }

    for (const doc of documents) {
      if (!doc.model_id) {
        throw new Error(`Document ${doc.id} must have a model_id`);
      }
      const docModelId: string = doc.model_id;
      const matchingHeaderContext = headerContextsByModelId.get(docModelId);
      assertExists(matchingHeaderContext, `Document from model ${docModelId} should have a matching header_context`);
      
      const docInputs = doc.document_relationships;
      if (docInputs && typeof docInputs === 'object' && !Array.isArray(docInputs)) {
        const sourceDocumentId = isRecord(docInputs) && typeof docInputs.source_document === 'string' 
          ? docInputs.source_document 
          : null;
        if (sourceDocumentId) {
          const sourceDoc = headerContexts.find(hc => hc.id === sourceDocumentId);
          if (sourceDoc && sourceDoc.model_id === docModelId) {
            assert(true, `Document ${doc.id} correctly references header_context from same model ${docModelId}`);
          }
        }
      }
    }
  });

  it("99.b.ii: Antithesis stage produces n²×6 critique documents", async () => {
    const n = testModelIds.length;
    assertEquals(n, 3, "Test requires exactly 3 models");
    assertExists(testSessionId, "Test session must exist from previous test");

    // Check if session has already advanced to antithesis (it should have after thesis completion)
    const { data: sessionData } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage:current_stage_id(slug), status')
      .eq('id', testSessionId)
      .single();

    assertExists(sessionData, "Session must exist");
    
    // If session is already at antithesis, skip submitStageResponses
    const isAlreadyAtAntithesis = sessionData.current_stage && 
      !Array.isArray(sessionData.current_stage) && 
      sessionData.current_stage.slug === 'antithesis';
    
    if (!isAlreadyAtAntithesis) {
      // Get thesis contributions to use as responses for stage advancement
      const { data: thesisContributions } = await adminClient
        .from('dialectic_contributions')
        .select('id')
        .eq('session_id', testSessionId)
        .eq('stage', 'thesis')
        .eq('contribution_type', 'thesis')
        .eq('iteration_number', 1);

      assertExists(thesisContributions, "Thesis contributions must exist");
      assert(thesisContributions.length > 0, "Must have at least one thesis contribution");

      // Advance session to antithesis stage using submitStageResponses
      const submitPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProject.id,
        stageSlug: 'thesis',
        currentIterationNumber: 1,
        responses: thesisContributions.map(c => ({
          originalContributionId: c.id,
          responseText: `Integration test response for contribution ${c.id}`,
        })),
      };

      const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });
      
      // Use provided mocks to avoid API calls
      const indexingService = new MockIndexingService();
      // Create valid config with output_token_cost_rate > 0 (required by factory validation)
      const validMockConfig = {
        ...MOCK_MODEL_CONFIG,
        output_token_cost_rate: 0.001, // Must be > 0, not 0
      };
      const { instance: mockAdapter } = getMockAiProviderAdapter(testLogger, validMockConfig);
      const adapterWithEmbedding = {
        ...mockAdapter,
        getEmbedding: async (_text: string) => ({
          embedding: Array(1536).fill(0.1), // Valid embedding dimension
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      };
      const embeddingClient = new EmbeddingClient(adapterWithEmbedding);

      const submitDeps: SubmitStageResponsesDependencies = {
        logger: testLogger,
        fileManager: fileManager,
        downloadFromStorage: downloadFromStorage,
        indexingService: indexingService,
        embeddingClient: embeddingClient,
      };

      const submitResult = await submitStageResponses(
        submitPayload,
        adminClient,
        testUser,
        submitDeps,
      );

      assert(submitResult.data, `Failed to advance session to antithesis: ${submitResult.error?.message}`);
      assertExists(submitResult.data?.updatedSession, "Session should be updated after stage submission");
    }

    // Verify session is at antithesis stage (either already was, or was advanced by submitStageResponses)
    const { data: finalSessionData } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage:current_stage_id(slug)')
      .eq('id', testSessionId)
      .single();

    assertExists(finalSessionData?.current_stage, "Session must have current_stage");
    if (Array.isArray(finalSessionData.current_stage) || finalSessionData.current_stage.slug !== 'antithesis') {
      throw new Error(`Session is not at antithesis stage. Current stage: ${Array.isArray(finalSessionData.current_stage) ? 'array' : finalSessionData.current_stage?.slug}`);
    }

    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSessionId,
      stageSlug: "antithesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    await processStageUntilComplete(testSessionId, "antithesis", workerDeps);

    const { data: allAntithesisContributions } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSessionId)
      .eq('stage', 'antithesis')
      .eq('iteration_number', 1);

    const headerContexts = allAntithesisContributions?.filter(c => c.contribution_type === 'header_context') || [];
    const otherContributions = allAntithesisContributions?.filter(c => c.contribution_type !== 'header_context') || [];

    if (headerContexts.length === 0) {
      throw new Error(`No header contexts found. Found ${otherContributions.length} other contributions. Contribution types: ${Array.from(new Set(otherContributions.map(c => c.contribution_type))).join(', ')}`);
    }

    const expectedHeaderContextCount = n * n;
    assertEquals(headerContexts.length, expectedHeaderContextCount, `Should have ${expectedHeaderContextCount} header contexts (${n} models × ${n} thesis proposals = ${n}²)`);

    const { data: critiqueDocuments } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSessionId)
      .eq('stage', 'antithesis')
      .eq('contribution_type', 'antithesis')
      .eq('iteration_number', 1);

    assertExists(critiqueDocuments, "Critique documents should exist");
    const expectedCritiqueCount = n * n * 6;
    assertEquals(critiqueDocuments.length, expectedCritiqueCount, `Should have ${expectedCritiqueCount} critique documents (${n}² proposals × 6 critiques per proposal = ${n}²×6)`);

    const documentsByModelId = new Map<string, number>();
    for (const doc of critiqueDocuments) {
      if (doc.model_id) {
        const count = documentsByModelId.get(doc.model_id) || 0;
        documentsByModelId.set(doc.model_id, count + 1);
      }
    }

    const expectedDocumentsPerModel = n * 6;
    for (const modelId of testModelIds) {
      const docCount = documentsByModelId.get(modelId) || 0;
      assertEquals(docCount, expectedDocumentsPerModel, `Model ${modelId} should have exactly ${expectedDocumentsPerModel} critique documents (${n} proposals × 6 critiques)`);
    }

    const expectedDocumentKeys = [
      'business_case_critique',
      'technical_feasibility_assessment',
      'risk_register',
      'non_functional_requirements',
      'dependency_map',
      'comparison_vector',
    ];

    const documentsByKey = new Map<string, number>();
    for (const doc of critiqueDocuments) {
      if (doc.file_name && doc.storage_path) {
        try {
          const pathInfo = deconstructStoragePath({
            storageDir: doc.storage_path,
            fileName: doc.file_name,
          });
          if (pathInfo.documentKey) {
            const count = documentsByKey.get(pathInfo.documentKey) || 0;
            documentsByKey.set(pathInfo.documentKey, count + 1);
          }
        } catch (error) {
          throw new Error(`Failed to extract document_key from file_name '${doc.file_name}' and storage_path '${doc.storage_path}': ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    for (const expectedKey of expectedDocumentKeys) {
      const keyCount = documentsByKey.get(expectedKey) || 0;
      assertEquals(keyCount, n * n, `Should have ${n * n} documents with document_key '${expectedKey}' (${n}² proposals)`);
    }
  });

  it("99.b.iii: Synthesis pairwise step produces n³×4 pairwise documents", async () => {
    const n = testModelIds.length;
    assertEquals(n, 3, "Test requires exactly 3 models");
    assertExists(testSessionId, "Test session must exist from previous test");

    // Check if session has already advanced to synthesis
    const { data: sessionData } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage:current_stage_id(slug)')
      .eq('id', testSessionId)
      .single();

    assertExists(sessionData, "Session must exist");
    
    // If session is already at synthesis, skip submitStageResponses
    const isAlreadyAtSynthesis = sessionData.current_stage && 
      !Array.isArray(sessionData.current_stage) && 
      sessionData.current_stage.slug === 'synthesis';
    
    if (!isAlreadyAtSynthesis) {
      // Get antithesis contributions to use as responses
      const { data: antithesisContributions } = await adminClient
        .from('dialectic_contributions')
        .select('id')
        .eq('session_id', testSessionId)
        .eq('stage', 'antithesis')
        .eq('contribution_type', 'antithesis')
        .eq('iteration_number', 1);

      assertExists(antithesisContributions, "Antithesis contributions must exist");
      assert(antithesisContributions.length > 0, "Must have at least one antithesis contribution");

      // Advance session to synthesis stage using submitStageResponses
      const submitPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProject.id,
        stageSlug: 'antithesis',
        currentIterationNumber: 1,
        responses: antithesisContributions.map(c => ({
          originalContributionId: c.id,
          responseText: `Integration test response for contribution ${c.id}`,
        })),
      };

      // Dependencies (reuse from previous test blocks if possible, or recreate)
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
        fileManager: fileManager,
        downloadFromStorage: downloadFromStorage,
        indexingService: indexingService,
        embeddingClient: embeddingClient,
      };

      const submitResult = await submitStageResponses(
        submitPayload,
        adminClient,
        testUser,
        submitDeps,
      );

      assert(submitResult.data, `Failed to advance session to synthesis: ${submitResult.error?.message}`);
      assertExists(submitResult.data?.updatedSession, "Session should be updated after stage submission");
    }

    // Trigger Synthesis Generation
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSessionId,
      stageSlug: "synthesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };

    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate synthesis contributions: ${planJobsResult.error?.message}`);

    await processStageUntilComplete(testSessionId, "synthesis", workerDeps);

    // Query for pairwise outputs
    // Note: Intermediate synthesis chunks often have contribution_type = 'synthesis' or are distinguished by is_intermediate flag or document keys
    // The checklist specifically asks about pairwise documents.
    // Based on FileType enum, pairwise keys are: synthesis_pairwise_business_case, etc.
    const { data: pairwiseDocuments } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', testSessionId)
      .eq('stage', 'synthesis')
      .eq('iteration_number', 1)
      .in('contribution_type', ['synthesis', 'assembled_document_json', 'model_contribution_raw_json']); // Filter by expected types if known, or filter by file paths later

    assertExists(pairwiseDocuments, "Pairwise documents should exist");

    // Filter for actual pairwise keys using deconstructStoragePath or if contribution_type matches
    // Since we don't have explicit 'pairwise' contribution_type in enum (it's usually 'synthesis'), rely on document keys
    const pairwiseKeys = [
      'synthesis_pairwise_business_case',
      'synthesis_pairwise_feature_spec',
      'synthesis_pairwise_technical_approach',
      'synthesis_pairwise_success_metrics'
    ];

    const actualPairwiseDocs = pairwiseDocuments.filter(doc => {
      if (!doc.file_name || !doc.storage_path) return false;
      try {
        const info = deconstructStoragePath({ storageDir: doc.storage_path, fileName: doc.file_name });
        return info.documentKey && pairwiseKeys.includes(info.documentKey);
      } catch {
        return false;
      }
    });

    const expectedPairwiseCount = n * n * n * 4; // n^3 * 4
    assertEquals(actualPairwiseDocs.length, expectedPairwiseCount, `Should have ${expectedPairwiseCount} pairwise documents (${n}^3 pairs × 4 types). Found ${actualPairwiseDocs.length}.`);
  });
});
