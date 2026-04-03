import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../types_db.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import type { AiModelExtendedConfig, ChatApiRequest, OutboundDocument, ResourceDocument } from "../_shared/types.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { MockRagService } from "../_shared/services/rag_service.mock.ts";
import { TokenWalletService } from "../_shared/services/tokenWalletService.ts";
import { countTokens } from "../_shared/utils/tokenizer_utils.ts";
import { calculateAffordability } from "./calculateAffordability/calculateAffordability.provides.ts";
import type { BoundCalculateAffordabilityFn } from "./calculateAffordability/calculateAffordability.interface.ts";
import { compressPrompt } from "./compressPrompt/compressPrompt.provides.ts";
import type { BoundCompressPromptFn } from "./compressPrompt/compressPrompt.interface.ts";
import { applyInputsRequiredScope } from "../_shared/utils/applyInputsRequiredScope.ts";
import { validateWalletBalance } from "../_shared/utils/validateWalletBalance.ts";
import { validateModelCostRates } from "../_shared/utils/validateModelCostRates.ts";
import type { PrepareModelJobDeps } from "./prepareModelJob/prepareModelJob.interface.ts";
import {
  isExecuteModelCallAndSaveParams,
  isExecuteModelCallAndSavePayload,
} from "./executeModelCallAndSave/executeModelCallAndSave.interface.guard.ts";
import type {
  BoundExecuteModelCallAndSaveFn,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSavePayload,
} from "./executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import type { BoundEnqueueRenderJobFn } from "./enqueueRenderJob/enqueueRenderJob.interface.ts";
import {
  gatherArtifacts,
  buildDialecticContributionRow,
  buildDialecticProjectResourceRow,
  buildSelectHandler,
} from "./gatherArtifacts/gatherArtifacts.provides.ts";
import { createMockDownloadFromStorage } from "../_shared/supabase_storage_utils.mock.ts";
import { createMockJobContextParams } from "./createJobContext/JobContext.mock.ts";
import { createJobContext } from "./createJobContext/createJobContext.ts";
import type { BoundGatherArtifactsFn } from "./gatherArtifacts/gatherArtifacts.interface.ts";
import type { BoundPrepareModelJobFn } from "./createJobContext/JobContext.interface.ts";
import { prepareModelJob } from "./prepareModelJob/prepareModelJob.ts";
import type { PrepareModelJobPayload } from "./prepareModelJob/prepareModelJob.interface.ts";
import { isPrepareModelJobPayload } from "./prepareModelJob/prepareModelJob.guard.ts";
import {
  buildAiProviderRow,
  buildExtendedModelFixture,
  buildTokenWalletRow,
} from "./prepareModelJob/prepareModelJob.mock.ts";
import { processSimpleJob } from "./processSimpleJob.ts";
import {
  defaultStepSlug,
  mockJob,
  mockPayload,
  setupMockClient,
  stageInputsRequired,
  stageInputsRelevance,
  stageOutputsRequired,
} from "./processSimpleJob.mock.ts";
import type {
  DialecticJobRow,
  DialecticStageRecipeStep,
  InputRule,
} from "../dialectic-service/dialectic.interface.ts";
import { isRecord } from "../_shared/utils/type_guards.ts";

// --- Real-DB integration test imports ---
import {
  initializeTestDeps,
  initializeSupabaseAdminClient,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreUpsertTestProviders,
  registerUndoAction,
  supabaseAdminClient,
  testLogger,
  findProcessedResource,
} from "../_shared/_integration.test.utils.ts";
import { uploadToStorage, downloadFromStorage } from "../_shared/supabase_storage_utils.ts";
import { constructStoragePath } from "../_shared/utils/path_constructor.ts";
import { pickLatest } from "../_shared/utils/pickLatest.ts";
import { buildProcessSimpleJobExecutePayload } from "./processSimpleJob.mock.ts";
import { MockPromptAssembler } from "../_shared/prompt-assembler/prompt-assembler.mock.ts";
import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { isDialecticStageRecipeStep } from "../_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { isModelContributionFileType } from "../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isAiModelExtendedConfig } from "../_shared/utils/type-guards/type_guards.chat.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";

function toArrayBuffer(content: string): ArrayBuffer {
  const encoded: Uint8Array = new TextEncoder().encode(content);
  const buffer: ArrayBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

// ---------------------------------------------------------------------------
// TEST 1 — Mock-based wiring test (existing)
// ---------------------------------------------------------------------------

Deno.test(
  "integration: processSimpleJob uses factories-only overrides on setupMockClient; gather once; prepare forwards resourceDocuments to EMCAS; no artifact table queries during prepare",
  async () => {
    const storageDownloadBody: string =
      "document-content-from-storage" +
      "0".repeat(10_000);
    const downloadBuffer: ArrayBuffer = toArrayBuffer(storageDownloadBody);

    const plannerMeta = mockPayload.planner_metadata;
    if (
      plannerMeta === null ||
      plannerMeta === undefined ||
      typeof plannerMeta.recipe_step_id !== "string" ||
      plannerMeta.recipe_step_id.length === 0
    ) {
      throw new Error("integration test requires mockPayload.planner_metadata.recipe_step_id");
    }
    const integrationRecipeStepId: string = plannerMeta.recipe_step_id;

    const dialecticStageRecipeStepRow: DialecticStageRecipeStep = {
      id: integrationRecipeStepId,
      instance_id: "instance-1",
      template_step_id: "step-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      step_key: defaultStepSlug,
      step_slug: defaultStepSlug,
      step_name: "Doc-centric execution step",
      step_description: "Generate the main business case document.",
      job_type: "EXECUTE",
      prompt_type: "Turn",
      output_type: FileType.business_case,
      granularity_strategy: "per_source_document",
      inputs_required: stageInputsRequired,
      inputs_relevance: stageInputsRelevance,
      outputs_required: stageOutputsRequired,
      config_override: { temperature: 0.2 },
      object_filter: { branch_key: "business_case" },
      output_overrides: { document_key: FileType.business_case },
      is_skipped: false,
      parallel_group: null,
      branch_key: null,
      prompt_template_id: "prompt-123",
      execution_order: 1,
    };

    const compressionContextWindowTokens: number = 200;

    const mockSetup = setupMockClient({
      dialectic_stage_recipe_steps: {
        select: (state: unknown) => {
          if (!isRecord(state)) {
            return Promise.resolve({ data: [], error: null });
          }
          const filtersUnknown: unknown = state["filters"];
          const filters: unknown[] = Array.isArray(filtersUnknown) ? filtersUnknown : [];
          const matchesIntegrationId: boolean = filters.some((f) => {
            if (!isRecord(f)) {
              return false;
            }
            return (
              f["type"] === "eq" &&
              f["column"] === "id" &&
              f["value"] === integrationRecipeStepId
            );
          });
          if (matchesIntegrationId) {
            return Promise.resolve({ data: [dialecticStageRecipeStepRow], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      },
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "psi-resource-bc",
            project_id: mockPayload.projectId,
            session_id: mockPayload.sessionId,
            iteration_number: mockPayload.iterationNumber,
            stage_slug: defaultStepSlug,
          }),
          buildDialecticProjectResourceRow({
            id: "psi-resource-fs",
            project_id: mockPayload.projectId,
            session_id: mockPayload.sessionId,
            iteration_number: mockPayload.iterationNumber,
            stage_slug: defaultStepSlug,
            file_name: "model-collect_1_feature_spec.md",
          }),
        ]),
      },
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
      dialectic_contributions: {
        select: () =>
          Promise.resolve({
            data: [
              buildDialecticContributionRow({
                id: "psi-contrib-hc",
                session_id: mockPayload.sessionId,
                iteration_number: mockPayload.iterationNumber,
                stage: defaultStepSlug,
              }),
            ],
            error: null,
          }),
      },
      ai_providers: {
        select: () => {
          const extendedFixture: AiModelExtendedConfig = {
            ...buildExtendedModelFixture(),
            context_window_tokens: compressionContextWindowTokens,
            provider_max_input_tokens: 400,
            hard_cap_output_tokens: 100,
          };
          const providerRow: Tables<"ai_providers"> = {
            ...buildAiProviderRow(extendedFixture),
            id: "model-def",
          };
          return Promise.resolve({ data: [providerRow], error: null });
        },
      },
      token_wallets: {
        select: () =>
          Promise.resolve({
            data: [
              buildTokenWalletRow({
                wallet_id: mockPayload.walletId,
              }),
            ],
            error: null,
          }),
      },
    });

    const spies = mockSetup.spies;

    const baseParams = createMockJobContextParams({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadBuffer,
      }),
    });

    let gatherCallCount: number = 0;
    const boundGather: BoundGatherArtifactsFn = async (gatherParams, gatherPayload) => {
      gatherCallCount += 1;
      return gatherArtifacts(
        {
          logger: baseParams.logger,
          pickLatest: baseParams.pickLatest,
          downloadFromStorage: baseParams.downloadFromStorage,
        },
        gatherParams,
        gatherPayload,
      );
    };

    const executeModelCallAndSave: Spy<BoundExecuteModelCallAndSaveFn> = spy(async (_p, _payload) => {
      return {
        contribution: buildDialecticContributionRow({ id: "psi-emcas-contrib" }),
        needsContinuation: false,
        stageRelationshipForStage: undefined,
        documentKey: undefined,
        fileType: FileType.HeaderContext,
        storageFileType: FileType.ModelContributionRawJson,
      };
    });
    const enqueueRenderJob: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));

    const logger = new MockLogger();
    const ragService = new MockRagService();
    const embeddingClient = {
      getEmbedding: async (_text: string) => ({
        embedding: [],
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    };
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const tokenWalletService = new TokenWalletService(dbClient, dbClient);
    const boundCompressPrompt: BoundCompressPromptFn = (cpParams, cpPayload) =>
      compressPrompt({ logger, ragService, embeddingClient, tokenWalletService, countTokens }, cpParams, cpPayload);
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = (caParams, caPayload) =>
      calculateAffordability({ logger, countTokens, compressPrompt: boundCompressPrompt }, caParams, caPayload);
    const prepareDeps: PrepareModelJobDeps = {
      logger,
      applyInputsRequiredScope,
      tokenWalletService,
      validateWalletBalance,
      validateModelCostRates,
      calculateAffordability: boundCalculateAffordability,
      executeModelCallAndSave,
      enqueueRenderJob,
    };

    let preparePayloadCaptured: unknown = undefined;
    let artifactTableQueryDuringPrepare: number = 0;
    const boundPrepare: BoundPrepareModelJobFn = async (prepareParams, preparePayload) => {
      preparePayloadCaptured = preparePayload;
      const projectResourcesBefore = spies.getHistoricQueryBuilderSpies(
        "dialectic_project_resources",
        "select",
      )?.callCount ?? 0;
      const contributionsBefore = spies.getHistoricQueryBuilderSpies(
        "dialectic_contributions",
        "select",
      )?.callCount ?? 0;
      const feedbackBefore = spies.getHistoricQueryBuilderSpies(
        "dialectic_feedback",
        "select",
      )?.callCount ?? 0;
      try {
        return await prepareModelJob(prepareDeps, prepareParams, preparePayload);
      } finally {
        const projectResourcesAfter = spies.getHistoricQueryBuilderSpies(
          "dialectic_project_resources",
          "select",
        )?.callCount ?? 0;
        const contributionsAfter = spies.getHistoricQueryBuilderSpies(
          "dialectic_contributions",
          "select",
        )?.callCount ?? 0;
        const feedbackAfter = spies.getHistoricQueryBuilderSpies(
          "dialectic_feedback",
          "select",
        )?.callCount ?? 0;
        artifactTableQueryDuringPrepare +=
          (projectResourcesAfter - projectResourcesBefore) +
          (contributionsAfter - contributionsBefore) +
          (feedbackAfter - feedbackBefore);
      }
    };

    const rootCtx = createJobContext({
      ...baseParams,
      gatherArtifacts: boundGather,
      prepareModelJob: boundPrepare,
    });

    const executeJob: DialecticJobRow = { ...mockJob, job_type: "EXECUTE" };

    try {
      await processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        "user-789",
        rootCtx,
        "auth-token",
      );

      const expectedArtifactIdsSorted: string[] = [
        "psi-contrib-hc",
        "psi-resource-bc",
        "psi-resource-fs",
      ].sort();

      assertEquals(gatherCallCount, 1);

      assertEquals(isPrepareModelJobPayload(preparePayloadCaptured), true);
      if (!isPrepareModelJobPayload(preparePayloadCaptured)) {
        throw new Error("expected PrepareModelJobPayload");
      }
      const preparePayload: PrepareModelJobPayload = preparePayloadCaptured;
      const promptResourceDocuments = preparePayload.promptConstructionPayload.resourceDocuments;
      assertExists(promptResourceDocuments);
      assertEquals(promptResourceDocuments.length, 3);
      const promptIdsSorted: string[] = promptResourceDocuments.map((d: ResourceDocument) => d.id).sort();
      assertEquals(promptIdsSorted, expectedArtifactIdsSorted);

      const projectResourceSelectHistoric = spies.getHistoricQueryBuilderSpies(
        "dialectic_project_resources",
        "select",
      );
      assertExists(projectResourceSelectHistoric);
      assertEquals(projectResourceSelectHistoric.callCount >= 1, true);
      assertEquals(artifactTableQueryDuringPrepare, 0);

      assertEquals(executeModelCallAndSave.calls.length, 1);
      assertEquals(enqueueRenderJob.calls.length, 1);

      const firstEmcasCall = executeModelCallAndSave.calls[0];
      assertExists(firstEmcasCall);
      assertEquals(firstEmcasCall.args.length >= 2, true);
      const emcasParamsUnknown: unknown = firstEmcasCall.args[0];
      const emcasPayloadUnknown: unknown = firstEmcasCall.args[1];
      assertEquals(isExecuteModelCallAndSaveParams(emcasParamsUnknown), true);
      assertEquals(isExecuteModelCallAndSavePayload(emcasPayloadUnknown), true);
      if (!isExecuteModelCallAndSaveParams(emcasParamsUnknown)) {
        throw new Error("expected ExecuteModelCallAndSaveParams");
      }
      if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
        throw new Error("expected ExecuteModelCallAndSavePayload");
      }
      const emcasParams: ExecuteModelCallAndSaveParams = emcasParamsUnknown;
      const emcasPayload: ExecuteModelCallAndSavePayload = emcasPayloadUnknown;
      assertEquals(emcasParams.job.id, mockJob.id);
      assertEquals(emcasParams.sessionId, mockPayload.sessionId);
      assertEquals(emcasParams.projectId, mockPayload.projectId);

      const chatApiRequest: ChatApiRequest = emcasPayload.chatApiRequest;
      assertExists(chatApiRequest.resourceDocuments);
      assertEquals(chatApiRequest.resourceDocuments.length, 3);
      const promptDocsSorted = [...promptResourceDocuments].sort((a, b) => a.id.localeCompare(b.id));
      const chatDocsSorted = [...chatApiRequest.resourceDocuments].sort((a, b) => a.id.localeCompare(b.id));
      assertEquals(
        chatDocsSorted.map((d: OutboundDocument) => d.id),
        promptDocsSorted.map((d: ResourceDocument) => d.id),
      );
      const chatIdsSorted: string[] = chatApiRequest.resourceDocuments.map((d: OutboundDocument) => d.id).sort();
      assertEquals(chatIdsSorted, expectedArtifactIdsSorted);
      const hasRagCompressedContent: boolean = chatApiRequest.resourceDocuments.some(
        (d: OutboundDocument) => d.content === "Mocked RAG context",
      );
      assertEquals(hasRagCompressedContent, true);
    } finally {
      mockSetup.clearAllStubs?.();
    }
  },
);

// ---------------------------------------------------------------------------
// TEST 2 — Real-DB integration: artifacts gathered from real DB rows with real
//           storage survive the full pipeline to ChatApiRequest at EMCAS boundary
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration (real DB): artifacts from contributions/resources/feedback survive pipeline to ChatApiRequest with ordering and identity preserved",
  // This test requires a running Supabase instance
  ignore: !Deno.env.get("SUPABASE_URL"),
  fn: async () => {
    // -----------------------------------------------------------------------
    // 1. Bootstrap: admin client, test user, wallet, AI provider
    // -----------------------------------------------------------------------
    initializeTestDeps();
    const adminClient: SupabaseClient<Database> = initializeSupabaseAdminClient();

    const { primaryUserId, primaryUserJwt, adminClient: admin } =
      await coreInitializeTestStep(
        { initialWalletBalance: 100_000 },
        "local",
      );

    await coreUpsertTestProviders(admin, "local");

    // Retrieve the wallet ID created by coreInitializeTestStep
    const { data: walletRow, error: walletQueryErr } = await admin
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", primaryUserId)
      .is("organization_id", null)
      .single();
    if (walletQueryErr || !walletRow) {
      throw new Error(`Could not find token wallet for test user ${primaryUserId}`);
    }
    const testWalletId: string = walletRow.wallet_id;

    try {
      // ---------------------------------------------------------------------
      // 2. Find a real recipe step from the database
      // ---------------------------------------------------------------------
      const { data: recipeSteps, error: recipeErr } = await admin
        .from("dialectic_stage_recipe_steps")
        .select("*")
        .eq("job_type", "EXECUTE")
        .limit(20);

      if (recipeErr || !recipeSteps || recipeSteps.length === 0) {
        throw new Error(
          "No EXECUTE recipe steps found in dialectic_stage_recipe_steps — " +
          "seed the database with at least one recipe before running this test.",
        );
      }

      // Pick a step with at least 2 distinct input rule types (document + feedback or seed_prompt)
      let chosenStep: DialecticStageRecipeStep | null = null;
      for (const candidate of recipeSteps) {
        if (!isDialecticStageRecipeStep(candidate)) continue;
        const rules: InputRule[] = candidate.inputs_required ?? [];
        const types = new Set(rules.map((r) => r.type));
        if (types.size >= 2 && rules.length >= 2) {
          chosenStep = candidate;
          break;
        }
      }
      if (!chosenStep) {
        // Fall back to first valid step even if it has only one type
        for (const candidate of recipeSteps) {
          if (isDialecticStageRecipeStep(candidate)) {
            chosenStep = candidate;
            break;
          }
        }
      }
      if (!chosenStep) {
        throw new Error("Could not find any valid DialecticStageRecipeStep in the database.");
      }

      const recipeInputRules: InputRule[] = chosenStep.inputs_required ?? [];
      const recipeStepSlug: string = chosenStep.step_slug;

      console.log(
        `[integration] Using recipe step '${chosenStep.id}' (slug: ${recipeStepSlug}) with ${recipeInputRules.length} input rules`,
      );
      console.log("[integration] recipeInputRules:", JSON.stringify(recipeInputRules, null, 2));

      // ---------------------------------------------------------------------
      // 3. Resolve the parent recipe instance → stage → template chain
      //    so we can create a valid project + session + stage environment
      // ---------------------------------------------------------------------
      const { data: recipeInstance } = await admin
        .from("dialectic_stage_recipe_instances")
        .select("*")
        .eq("id", chosenStep.instance_id)
        .single();

      if (!recipeInstance) {
        throw new Error(`Recipe instance ${chosenStep.instance_id} not found.`);
      }

      // Get the stage that owns this recipe instance
      const { data: stage } = await admin
        .from("dialectic_stages")
        .select("*, system_prompts(id, prompt_text)")
        .eq("id", recipeInstance.stage_id)
        .single();

      if (!stage) {
        throw new Error(`Stage for recipe instance ${recipeInstance.id} not found.`);
      }

      // Get an AI provider whose config passes isAiModelExtendedConfig
      // (prepareModelJob validates config before calling executeModelCallAndSave)
      const { data: allProviders } = await admin
        .from("ai_providers")
        .select("*")
        .eq("is_active", true);

      if (!allProviders || allProviders.length === 0) {
        throw new Error("No active AI providers found.");
      }
      const providerRow = allProviders.find((p) => isAiModelExtendedConfig(p.config));
      if (!providerRow) {
        throw new Error(
          "No active AI provider has a valid config (tokenization_strategy). " +
          "Seed the DB with at least one properly configured provider.",
        );
      }

      // Get (or verify) domain overlay for this stage
      const systemPromptId: string | null = stage.default_system_prompt_id;
      if (!systemPromptId) {
        throw new Error(`Stage ${stage.id} has no default_system_prompt_id.`);
      }

      // Find a domain that has overlays for this stage's system prompt
      const { data: overlayRows } = await admin
        .from("domain_specific_prompt_overlays")
        .select("domain_id")
        .eq("system_prompt_id", systemPromptId)
        .limit(1);

      if (!overlayRows || overlayRows.length === 0) {
        throw new Error(
          `No domain overlays found for system_prompt_id '${systemPromptId}'. Seed the DB first.`,
        );
      }
      const domainId: string = overlayRows[0].domain_id;

      // Find or get the domain
      const { data: domain } = await admin
        .from("dialectic_domains")
        .select("id, name, description")
        .eq("id", domainId)
        .single();

      if (!domain) {
        throw new Error(`Domain ${domainId} not found.`);
      }

      // ---------------------------------------------------------------------
      // 4. Create test project, session, and supporting rows
      // ---------------------------------------------------------------------

      // Get the process_template_id from domain_process_associations (same as createProject.ts)
      const { data: domainProcessAssoc } = await admin
        .from("domain_process_associations")
        .select("process_template_id")
        .eq("domain_id", domainId)
        .limit(1)
        .single();

      if (!domainProcessAssoc) {
        throw new Error(`No process template association found for domain ${domainId}.`);
      }

      const testProjectId = crypto.randomUUID();
      const testSessionId = crypto.randomUUID();
      const testIterationNumber = 1;

      const { error: projectErr } = await admin
        .from("dialectic_projects")
        .insert({
          id: testProjectId,
          user_id: primaryUserId,
          project_name: "Integration Test Project",
          initial_user_prompt: "This is the initial user prompt for integration testing.",
          selected_domain_id: domainId,
          status: "active",
          process_template_id: domainProcessAssoc.process_template_id,
        });
      if (projectErr) throw new Error(`Failed to create test project: ${projectErr.message}`);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_projects",
        criteria: { id: testProjectId },
        scope: "local",
      });

      const { error: sessionErr } = await admin
        .from("dialectic_sessions")
        .insert({
          id: testSessionId,
          project_id: testProjectId,
          session_description: "Integration test session",
          iteration_count: testIterationNumber,
          selected_model_ids: [providerRow.id],
          status: "in-progress",
          current_stage_id: stage.id,
        });
      if (sessionErr) throw new Error(`Failed to create test session: ${sessionErr.message}`);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_sessions",
        criteria: { id: testSessionId },
        scope: "local",
      });

      // ---------------------------------------------------------------------
      // 5. Upload stub documents and create artifact DB rows for each input rule
      // ---------------------------------------------------------------------
      const storageBucket: string =
        Deno.env.get("SB_CONTENT_STORAGE_BUCKET") ?? "dialectic-contributions";
      const modelSlug = "integration-test-model";

      // Track expected artifacts in inputsRequired order for assertion
      type ExpectedArtifact = {
        id: string;
        content: string;
        document_key: string;
        stage_slug: string;
        type: string;
      };
      const expectedArtifacts: ExpectedArtifact[] = [];

      for (let i = 0; i < recipeInputRules.length; i++) {
        const rule = recipeInputRules[i];
        if (!rule.document_key) continue;

        const stubContent = `STUB_CONTENT_${rule.type}_${rule.document_key}_${i}`;
        const contentBuffer: ArrayBuffer = toArrayBuffer(stubContent);

        if (rule.type === "document") {
          // Upload to storage using real path constructor for RenderedDocument
          const pathResult = constructStoragePath({
            projectId: testProjectId,
            fileType: FileType.RenderedDocument,
            sessionId: testSessionId,
            iteration: testIterationNumber,
            stageSlug: rule.slug,
            modelSlug,
            attemptCount: 0,
            documentKey: rule.document_key,
          });

          const fullPath = `${pathResult.storagePath}/${pathResult.fileName}`;
          const uploadResult = await uploadToStorage(
            admin,
            storageBucket,
            fullPath,
            contentBuffer,
            { contentType: "text/markdown", upsert: true },
          );
          if (uploadResult.error) {
            throw new Error(`Storage upload failed for ${fullPath}: ${uploadResult.error.message}`);
          }
          registerUndoAction({
            type: "DELETE_STORAGE_OBJECT",
            bucketName: storageBucket,
            path: fullPath,
            scope: "local",
          });

          // Insert dialectic_project_resources row
          const resourceId = crypto.randomUUID();
          const { error: resErr } = await admin
            .from("dialectic_project_resources")
            .insert({
              id: resourceId,
              project_id: testProjectId,
              session_id: testSessionId,
              iteration_number: testIterationNumber,
              stage_slug: rule.slug,
              resource_type: "rendered_document",
              storage_bucket: storageBucket,
              storage_path: pathResult.storagePath,
              file_name: pathResult.fileName,
              mime_type: "text/markdown",
              size_bytes: contentBuffer.byteLength,
              user_id: primaryUserId,
            });
          if (resErr) throw new Error(`Failed to insert project resource: ${resErr.message}`);
          registerUndoAction({
            type: "DELETE_CREATED_ROW",
            tableName: "dialectic_project_resources",
            criteria: { id: resourceId },
            scope: "local",
          });

          expectedArtifacts.push({
            id: resourceId,
            content: stubContent,
            document_key: rule.document_key,
            stage_slug: rule.slug,
            type: "document",
          });
        } else if (rule.type === "feedback") {
          // Upload feedback file — use the RenderedDocument path as the "original" path
          // since UserFeedback requires originalStoragePath/originalBaseName
          const baseDocPath = constructStoragePath({
            projectId: testProjectId,
            fileType: FileType.RenderedDocument,
            sessionId: testSessionId,
            iteration: testIterationNumber,
            stageSlug: rule.slug,
            modelSlug,
            attemptCount: 0,
            documentKey: rule.document_key,
          });
          const feedbackPath = constructStoragePath({
            projectId: testProjectId,
            fileType: FileType.UserFeedback,
            sessionId: testSessionId,
            iteration: testIterationNumber,
            stageSlug: rule.slug,
            originalStoragePath: baseDocPath.storagePath,
            originalBaseName: baseDocPath.fileName.replace(".md", ""),
          });

          const fullPath = `${feedbackPath.storagePath}/${feedbackPath.fileName}`;
          const uploadResult = await uploadToStorage(
            admin,
            storageBucket,
            fullPath,
            contentBuffer,
            { contentType: "text/markdown", upsert: true },
          );
          if (uploadResult.error) {
            throw new Error(`Storage upload failed for ${fullPath}: ${uploadResult.error.message}`);
          }
          registerUndoAction({
            type: "DELETE_STORAGE_OBJECT",
            bucketName: storageBucket,
            path: fullPath,
            scope: "local",
          });

          // Insert dialectic_feedback row
          const feedbackId = crypto.randomUUID();
          const { error: fbErr } = await admin
            .from("dialectic_feedback")
            .insert({
              id: feedbackId,
              project_id: testProjectId,
              session_id: testSessionId,
              iteration_number: testIterationNumber,
              stage_slug: rule.slug,
              feedback_type: "user_feedback",
              storage_bucket: storageBucket,
              storage_path: feedbackPath.storagePath,
              file_name: feedbackPath.fileName,
              mime_type: "text/markdown",
              size_bytes: contentBuffer.byteLength,
              user_id: primaryUserId,
            });
          if (fbErr) throw new Error(`Failed to insert feedback row: ${fbErr.message}`);
          registerUndoAction({
            type: "DELETE_CREATED_ROW",
            tableName: "dialectic_feedback",
            criteria: { id: feedbackId },
            scope: "local",
          });

          expectedArtifacts.push({
            id: feedbackId,
            content: stubContent,
            document_key: rule.document_key,
            stage_slug: rule.slug,
            type: "feedback",
          });
        } else if (rule.type === "seed_prompt") {
          // Upload seed prompt
          const seedPath = constructStoragePath({
            projectId: testProjectId,
            fileType: FileType.SeedPrompt,
            sessionId: testSessionId,
            iteration: testIterationNumber,
            stageSlug: rule.slug,
          });

          const fullPath = `${seedPath.storagePath}/${seedPath.fileName}`;
          const uploadResult = await uploadToStorage(
            admin,
            storageBucket,
            fullPath,
            contentBuffer,
            { contentType: "text/markdown", upsert: true },
          );
          if (uploadResult.error) {
            throw new Error(`Storage upload failed for ${fullPath}: ${uploadResult.error.message}`);
          }
          registerUndoAction({
            type: "DELETE_STORAGE_OBJECT",
            bucketName: storageBucket,
            path: fullPath,
            scope: "local",
          });

          // Insert dialectic_project_resources row with resource_type=seed_prompt
          const seedId = crypto.randomUUID();
          const { error: seedErr } = await admin
            .from("dialectic_project_resources")
            .insert({
              id: seedId,
              project_id: testProjectId,
              session_id: testSessionId,
              iteration_number: testIterationNumber,
              stage_slug: rule.slug,
              resource_type: "seed_prompt",
              storage_bucket: storageBucket,
              storage_path: seedPath.storagePath,
              file_name: seedPath.fileName,
              mime_type: "text/markdown",
              size_bytes: contentBuffer.byteLength,
              user_id: primaryUserId,
            });
          if (seedErr) throw new Error(`Failed to insert seed prompt resource: ${seedErr.message}`);
          registerUndoAction({
            type: "DELETE_CREATED_ROW",
            tableName: "dialectic_project_resources",
            criteria: { id: seedId },
            scope: "local",
          });

          expectedArtifacts.push({
            id: seedId,
            content: stubContent,
            document_key: rule.document_key,
            stage_slug: rule.slug,
            type: "seed_prompt",
          });
        } else if (rule.type === "header_context") {
          // Upload header context as a contribution
          const hcPath = constructStoragePath({
            projectId: testProjectId,
            fileType: FileType.HeaderContext,
            sessionId: testSessionId,
            iteration: testIterationNumber,
            stageSlug: rule.slug,
            modelSlug,
            attemptCount: 0,
            documentKey: rule.document_key,
          });

          const fullPath = `${hcPath.storagePath}/${hcPath.fileName}`;
          const uploadResult = await uploadToStorage(
            admin,
            storageBucket,
            fullPath,
            contentBuffer,
            { contentType: "application/json", upsert: true },
          );
          if (uploadResult.error) {
            throw new Error(`Storage upload failed for ${fullPath}: ${uploadResult.error.message}`);
          }
          registerUndoAction({
            type: "DELETE_STORAGE_OBJECT",
            bucketName: storageBucket,
            path: fullPath,
            scope: "local",
          });

          // Insert dialectic_contributions row
          const contribId = crypto.randomUUID();
          const { error: contribErr } = await admin
            .from("dialectic_contributions")
            .insert({
              id: contribId,
              session_id: testSessionId,
              stage: rule.slug,
              iteration_number: testIterationNumber,
              model_id: providerRow.id,
              model_name: providerRow.name,
              user_id: primaryUserId,
              contribution_type: "header_context",
              storage_bucket: storageBucket,
              storage_path: hcPath.storagePath,
              file_name: hcPath.fileName,
              mime_type: "application/json",
              size_bytes: contentBuffer.byteLength,
              is_latest_edit: true,
              edit_version: 1,
            });
          if (contribErr) throw new Error(`Failed to insert contribution: ${contribErr.message}`);
          registerUndoAction({
            type: "DELETE_CREATED_ROW",
            tableName: "dialectic_contributions",
            criteria: { id: contribId },
            scope: "local",
          });

          expectedArtifacts.push({
            id: contribId,
            content: stubContent,
            document_key: rule.document_key,
            stage_slug: rule.slug,
            type: "header_context",
          });
        } else if (rule.type === "project_resource") {
          // Upload project resource
          const prPath = constructStoragePath({
            projectId: testProjectId,
            fileType: FileType.InitialUserPrompt,
            originalFileName: `${rule.document_key}.md`,
          });

          const fullPath = `${prPath.storagePath}/${prPath.fileName}`;
          const uploadResult = await uploadToStorage(
            admin,
            storageBucket,
            fullPath,
            contentBuffer,
            { contentType: "text/markdown", upsert: true },
          );
          if (uploadResult.error) {
            throw new Error(`Storage upload failed for ${fullPath}: ${uploadResult.error.message}`);
          }
          registerUndoAction({
            type: "DELETE_STORAGE_OBJECT",
            bucketName: storageBucket,
            path: fullPath,
            scope: "local",
          });

          const isInitialPrompt = rule.document_key === "initial_user_prompt";
          const prId = crypto.randomUUID();
          const { error: prErr } = await admin
            .from("dialectic_project_resources")
            .insert({
              id: prId,
              project_id: testProjectId,
              session_id: testSessionId,
              iteration_number: testIterationNumber,
              stage_slug: rule.slug,
              resource_type: isInitialPrompt ? "initial_user_prompt" : "project_resource",
              storage_bucket: storageBucket,
              storage_path: prPath.storagePath,
              file_name: prPath.fileName,
              mime_type: "text/markdown",
              size_bytes: contentBuffer.byteLength,
              user_id: primaryUserId,
            });
          if (prErr) throw new Error(`Failed to insert project resource: ${prErr.message}`);
          registerUndoAction({
            type: "DELETE_CREATED_ROW",
            tableName: "dialectic_project_resources",
            criteria: { id: prId },
            scope: "local",
          });

          expectedArtifacts.push({
            id: prId,
            content: stubContent,
            document_key: rule.document_key,
            stage_slug: rule.slug,
            type: "project_resource",
          });
        } else {
          // Unhandled rule type — skip but warn
          console.warn(
            `[integration] Skipping unhandled input rule type '${rule.type}' for document_key '${rule.document_key}'`,
          );
        }
      }

      console.log(
        `[integration] Seeded ${expectedArtifacts.length} artifacts for ${recipeInputRules.length} input rules`,
      );

      // Fail fast if we couldn't seed any artifacts
      assert(
        expectedArtifacts.length > 0,
        "Expected at least one artifact to be seeded from the recipe's inputs_required",
      );

      // ---------------------------------------------------------------------
      // 6. Wire the pipeline: real gather + real prepare, spy at EMCAS boundary
      // ---------------------------------------------------------------------
      const logger = new MockLogger();
      const ragService = new MockRagService();
      const embeddingClient = {
        getEmbedding: async (_text: string) => ({
          embedding: [],
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      };
      const tokenWalletService = new TokenWalletService(admin, admin);

      // Spy on EMCAS — capture the final ChatApiRequest
      const emcasSpy: Spy<BoundExecuteModelCallAndSaveFn> = spy(async (_p, _payload) => {
        return {
          contribution: buildDialecticContributionRow({ id: "integ-emcas-contrib" }),
          needsContinuation: false,
          stageRelationshipForStage: undefined,
          documentKey: undefined,
          fileType: FileType.HeaderContext,
          storageFileType: FileType.ModelContributionRawJson,
        };
      });
      const enqueueRenderJobSpy: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({
        renderJobId: null,
      }));

      // Real compressPrompt + calculateAffordability chain
      const boundCompressPrompt: BoundCompressPromptFn = (cpParams, cpPayload) =>
        compressPrompt(
          { logger, ragService, embeddingClient, tokenWalletService, countTokens },
          cpParams,
          cpPayload,
        );
      const boundCalculateAffordability: BoundCalculateAffordabilityFn = (caParams, caPayload) =>
        calculateAffordability(
          { logger, countTokens, compressPrompt: boundCompressPrompt },
          caParams,
          caPayload,
        );

      const prepareDeps: PrepareModelJobDeps = {
        logger,
        applyInputsRequiredScope,
        tokenWalletService,
        validateWalletBalance,
        validateModelCostRates,
        calculateAffordability: boundCalculateAffordability,
        executeModelCallAndSave: emcasSpy,
        enqueueRenderJob: enqueueRenderJobSpy,
      };

      // Real gatherArtifacts with real DB + real storage download
      let gatherCallCount = 0;
      const boundGather: BoundGatherArtifactsFn = async (gatherParams, gatherPayload) => {
        gatherCallCount += 1;
        return gatherArtifacts(
          {
            logger,
            pickLatest,
            downloadFromStorage,
          },
          gatherParams,
          gatherPayload,
        );
      };

      // Real prepareModelJob
      let preparePayloadCaptured: unknown = undefined;
      const boundPrepare: BoundPrepareModelJobFn = async (prepareParams, preparePayload) => {
        preparePayloadCaptured = preparePayload;
        return prepareModelJob(prepareDeps, prepareParams, preparePayload);
      };

      // Build the job context — mock only non-pipeline services
      const baseParams = createMockJobContextParams({
        logger,
        downloadFromStorage,
        gatherArtifacts: boundGather,
        prepareModelJob: boundPrepare,
      });
      const rootCtx = createJobContext({
        ...baseParams,
        gatherArtifacts: boundGather,
        prepareModelJob: boundPrepare,
      });

      // Build the job payload pointing to our test data
      if (!isModelContributionFileType(chosenStep.output_type)) {
        throw new Error(
          `Recipe step output_type '${chosenStep.output_type}' is not a ModelContributionFileType — choose a different recipe step.`,
        );
      }

      const jobPayload = buildProcessSimpleJobExecutePayload({
        projectId: testProjectId,
        sessionId: testSessionId,
        stageSlug: stage.slug,
        model_id: providerRow.id,
        iterationNumber: testIterationNumber,
        walletId: testWalletId,
        user_jwt: primaryUserJwt,
        planner_metadata: {
          recipe_step_id: chosenStep.id,
          recipe_template_id: recipeInstance.template_id,
        },
        output_type: chosenStep.output_type,
      });

      if (!isJson(jobPayload)) {
        throw new Error("jobPayload is not valid JSON");
      }

      const testJob: DialecticJobRow = {
        ...mockJob,
        id: crypto.randomUUID(),
        session_id: testSessionId,
        user_id: primaryUserId,
        stage_slug: stage.slug,
        iteration_number: testIterationNumber,
        job_type: "EXECUTE",
        payload: jobPayload,
      };

      // ---------------------------------------------------------------------
      // 7. Execute the pipeline
      // ---------------------------------------------------------------------
      await processSimpleJob(
        admin,
        testJob,
        primaryUserId,
        rootCtx,
        primaryUserJwt,
      );

      // ---------------------------------------------------------------------
      // 8. Assertions
      // ---------------------------------------------------------------------

      // 8a. gatherArtifacts called exactly once
      assertEquals(gatherCallCount, 1, "gatherArtifacts should be called exactly once");

      // 8b. EMCAS was called
      assertEquals(emcasSpy.calls.length, 1, "executeModelCallAndSave should be called exactly once");

      // 8c. Validate preparePayload captured the artifacts
      assertEquals(isPrepareModelJobPayload(preparePayloadCaptured), true);
      if (!isPrepareModelJobPayload(preparePayloadCaptured)) {
        throw new Error("expected PrepareModelJobPayload");
      }
      const capturedPayload: PrepareModelJobPayload = preparePayloadCaptured;
      const capturedDocs = capturedPayload.promptConstructionPayload.resourceDocuments;
      assertExists(capturedDocs, "resourceDocuments should exist in PrepareModelJobPayload");

      // 8d. Extract the final ChatApiRequest from the EMCAS spy
      const emcasCall = emcasSpy.calls[0];
      assertExists(emcasCall);
      const emcasPayloadUnknown: unknown = emcasCall.args[1];
      assertEquals(isExecuteModelCallAndSavePayload(emcasPayloadUnknown), true);
      if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
        throw new Error("expected ExecuteModelCallAndSavePayload");
      }
      const emcasPayload: ExecuteModelCallAndSavePayload = emcasPayloadUnknown;
      const chatApiRequest: ChatApiRequest = emcasPayload.chatApiRequest;

      // 8e. ChatApiRequest.resourceDocuments has the expected count
      assertExists(chatApiRequest.resourceDocuments, "ChatApiRequest must have resourceDocuments");
      console.log("[integration] expectedArtifacts:", JSON.stringify(expectedArtifacts, null, 2));
      console.log("[integration] chatApiRequest.resourceDocuments:", JSON.stringify(chatApiRequest.resourceDocuments, null, 2));
      assertEquals(
        chatApiRequest.resourceDocuments.length,
        expectedArtifacts.length,
        `Expected ${expectedArtifacts.length} artifacts in ChatApiRequest.resourceDocuments, got ${chatApiRequest.resourceDocuments.length}`,
      );

      // 8f. Content ordering matches inputsRequired declaration order
      const actualContents: string[] = chatApiRequest.resourceDocuments.map(
        (d: OutboundDocument) => d.content,
      );
      const expectedContents: string[] = expectedArtifacts.map((a) => a.content);
      assertEquals(
        actualContents,
        expectedContents,
        "resourceDocuments content ordering must match inputsRequired declaration order",
      );

      // 8g. Identity-rich fields present on every document
      for (let i = 0; i < chatApiRequest.resourceDocuments.length; i++) {
        const doc = chatApiRequest.resourceDocuments[i];
        const expected = expectedArtifacts[i];
        assert(isRecord(doc), `resourceDocuments[${i}] must be a record`);
        assertEquals(
          (doc as ResourceDocument).document_key,
          expected.document_key,
          `resourceDocuments[${i}].document_key mismatch`,
        );
        assertEquals(
          (doc as ResourceDocument).stage_slug,
          expected.stage_slug,
          `resourceDocuments[${i}].stage_slug mismatch`,
        );
        assertEquals(
          (doc as ResourceDocument).type,
          expected.type,
          `resourceDocuments[${i}].type mismatch`,
        );
        assertEquals(
          doc.id,
          expected.id,
          `resourceDocuments[${i}].id mismatch`,
        );
      }

      // 8h. Artifact content not merged into messages
      const messageContents: string[] = Array.isArray(chatApiRequest.messages)
        ? chatApiRequest.messages
            .map((m) => (isRecord(m) && typeof m["content"] === "string" ? m["content"] : ""))
            .filter((c) => c.length > 0)
        : [];
      for (const artifactContent of actualContents) {
        assert(
          !messageContents.includes(artifactContent),
          `Artifact content '${artifactContent.substring(0, 40)}...' must not be merged into messages`,
        );
      }

      console.log(
        `[integration] PASS: ${expectedArtifacts.length} artifacts survived pipeline with ordering and identity preserved`,
      );
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});
