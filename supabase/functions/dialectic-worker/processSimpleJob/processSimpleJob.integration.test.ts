import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { FileType, DialecticStageSlug } from "../_shared/types/file_manager.types.ts";
import type { ChatApiRequest, OutboundDocument } from "../_shared/types.ts";
import type { ResourceDocument } from "../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { AdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.provides.ts";
import { UserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.provides.ts";
import { countTokens } from "../_shared/utils/tokenizer_utils.ts";
import { calculateAffordability } from "./calculateAffordability/calculateAffordability.provides.ts";
import { compressPrompt } from "./compressPrompt/compressPrompt.provides.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";
import {
  isEnqueueModelCallParams,
  isEnqueueModelCallPayload,
  type EnqueueModelCallFn,
  type EnqueueModelCallDeps,
  type EnqueueModelCallParams,
  type EnqueueModelCallPayload,
} from "./enqueueModelCall/enqueueModelCall.provides.ts";
import {
  gatherArtifacts,
  type GatherArtifactsFn,
} from "./gatherArtifacts/gatherArtifacts.provides.ts";
import { applyCompressionOverlay } from "./applyCompressionOverlay/applyCompressionOverlay.provides.ts";
import { enqueueCompressJobs } from "./enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import { getSortedCompressionCandidates } from "../_shared/utils/vector_utils/vector_utils.provides.ts";
import { resolveCompressionSource } from "../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { LangchainTextSplitter } from "../_shared/utils/text_splitter.ts";
import { createMockDownloadFromStorage } from "../_shared/supabase_storage_utils.mock.ts";
import { buildJobContextParams } from "./createJobContext/JobContext.mock.ts";
import { createJobContext } from "./createJobContext/createJobContext.ts";
import { prepareModelJob, isPrepareModelJobPayload, type PrepareModelJobFn, type PrepareModelJobPayload } from "./prepareModelJob/prepareModelJob.provides.ts";
import { buildExtendedModelConfig, buildMockProvider } from "../_shared/ai_service/ai_provider.mock.ts";
import { processSimpleJob } from "./processSimpleJob.ts";
import type {
  DialecticStageRecipeStep,
  DialecticJobRow,
  DialecticExecuteJobPayload,
  InputRule,
} from "../dialectic-service/dialectic.interface.ts";
import { isRecord, isDialecticExecuteJobPayload } from "../_shared/utils/type_guards.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { mockNotificationService, resetMockNotificationService } from "../_shared/utils/notification.service.mock.ts";
import {
  buildDialecticProjectResourceRow,
  buildDialecticJobRow,
  buildDialecticExecuteJobPayload,
  buildDialecticStageRecipeStep,
  buildTokenWalletRow,
  buildDialecticSessionRow,
  buildDialecticProjectRow,
  buildDialecticStage,
  buildInputRule,
  buildDialecticContributionRow,
} from "../_shared/dialectic.mock.ts";
// --- Real-DB integration test imports ---
import {
  initializeTestDeps,
  initializeSupabaseAdminClient,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreUpsertTestProviders,
  registerUndoAction,
} from "../_shared/_integration.test.utils.ts";
import { uploadToStorage, downloadFromStorage } from "../_shared/supabase_storage_utils.ts";
import { constructStoragePath } from "../_shared/utils/path_constructor.ts";
import { isDialecticStageRecipeStep } from "../_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { isDialecticStageSlug, isModelContributionFileType } from "../_shared/utils/type-guards/type_guards.file_manager.ts";
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
  "integration: processSimpleJob uses factories-only overrides on mockClient; gather once; prepare forwards resourceDocuments to enqueueModelCall; no artifact table queries during prepare",
  async () => {
    const storageDownloadBody: string =
      "document-content-from-storage" +
      "0".repeat(10_000);
    const downloadBuffer: ArrayBuffer = toArrayBuffer(storageDownloadBody);

    const plannerMeta = buildDialecticExecuteJobPayload({
      planner_metadata: { recipe_step_id: "step-1" },
    }).planner_metadata;
    if (
      plannerMeta === null ||
      plannerMeta === undefined ||
      typeof plannerMeta.recipe_step_id !== "string" ||
      plannerMeta.recipe_step_id.length === 0
    ) {
      throw new Error("integration test requires planner_metadata.recipe_step_id");
    }
    const integrationRecipeStepId: string = plannerMeta.recipe_step_id;

    const dialecticStageRecipeStepRow = buildDialecticStageRecipeStep({
      id: integrationRecipeStepId,
      job_type: "EXECUTE",
      inputs_required: [
        buildInputRule({ type: "document", slug: "thesis", document_key: FileType.business_case }),
        buildInputRule({ type: "document", slug: "thesis", document_key: FileType.feature_spec }),
        buildInputRule({ type: "header_context", slug: "thesis", document_key: FileType.HeaderContext }),
      ],
    });
    if (dialecticStageRecipeStepRow === null) {
      throw new Error("buildDialecticStageRecipeStep returned null");
    }

    const compressionContextWindowTokens: number = 128_000;

    const mockSetup = createMockSupabaseClient(undefined, {
      genericMockResults: {
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
        dialectic_sessions: {
          select: () =>
            Promise.resolve({
              data: [buildDialecticSessionRow()],
              error: null,
            }),
        },
        dialectic_projects: {
          select: () =>
            Promise.resolve({
              data: [{
                ...buildDialecticProjectRow(),
                dialectic_domains: { id: 'test-domain-id', name: 'test domain', description: 'test domain description' },
              }],
              error: null,
            }),
        },
        dialectic_stages: {
          select: () =>
            Promise.resolve({
              data: [{
                ...buildDialecticStage(),
                system_prompts: { id: 'test-system-prompt-id', prompt_text: 'test system prompt' },
              }],
              error: null,
            }),
        },
        domain_specific_prompt_overlays: {
          select: () =>
            Promise.resolve({
              data: [{ overlay_values: {} }],
              error: null,
            }),
        },
        dialectic_project_resources: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const isGatherQuery = filters.some(
              (f) => isRecord(f) && f["type"] === "eq" && f["column"] === "resource_type" && f["value"] === "rendered_document",
            );
            if (!isGatherQuery) return Promise.resolve({ data: [], error: null });
            const bcPath = constructStoragePath({
              projectId: "test-project-id",
              sessionId: "test-session-id",
              iteration: 1,
              stageSlug: DialecticStageSlug.Thesis,
              fileType: FileType.RenderedDocument,
              modelSlug: "integration-test-model",
              attemptCount: 0,
              documentKey: FileType.business_case,
            });
            const fsPath = constructStoragePath({
              projectId: "test-project-id",
              sessionId: "test-session-id",
              iteration: 1,
              stageSlug: DialecticStageSlug.Thesis,
              fileType: FileType.RenderedDocument,
              modelSlug: "integration-test-model",
              attemptCount: 0,
              documentKey: FileType.feature_spec,
            });
            return Promise.resolve({
              data: [
                buildDialecticProjectResourceRow({
                  id: "psi-resource-bc",
                  stage_slug: "thesis",
                  resource_type: "rendered_document",
                  storage_path: bcPath.storagePath,
                  file_name: bcPath.fileName,
                }),
                buildDialecticProjectResourceRow({
                  id: "psi-resource-fs",
                  stage_slug: "thesis",
                  resource_type: "rendered_document",
                  storage_path: fsPath.storagePath,
                  file_name: fsPath.fileName,
                }),
              ],
              error: null,
            });
          },
        },
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
        dialectic_contributions: {
          select: () => {
            const { storagePath, fileName } = constructStoragePath({
              projectId: "test-project-id",
              sessionId: "test-session-id",
              iteration: 1,
              stageSlug: DialecticStageSlug.Thesis,
              fileType: FileType.HeaderContext,
              modelSlug: "integration-test-model",
              attemptCount: 0,
              documentKey: FileType.HeaderContext,
            });
            return Promise.resolve({
              data: [
                buildDialecticContributionRow({
                  id: "psi-contrib-hc",
                  stage: "thesis",
                  storage_path: storagePath,
                  file_name: fileName,
                }),
              ],
              error: null,
            });
          },
        },
        ai_providers: {
          select: () => {
            const extendedFixture = buildExtendedModelConfig({
              context_window_tokens: compressionContextWindowTokens,
            });
            if (!isJson(extendedFixture)) {
              throw new Error("extendedFixture is not Json-compatible");
            }
            const providerRow = buildMockProvider({
              config: extendedFixture,
            });
            return Promise.resolve({ data: [providerRow], error: null });
          },
        },
        token_wallets: {
          select: (state: unknown) => {
            if (isRecord(state) && state["selectColumns"] === "balance::text") {
              return Promise.resolve({ data: [{ balance: "100000" }], error: null });
            }
            return Promise.resolve({
              data: [buildTokenWalletRow({ wallet_id: buildDialecticExecuteJobPayload().walletId })],
              error: null,
            });
          },
        },
      },
    });

    const spies = mockSetup.spies;

    const logger = new MockLogger();
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

    const enqueueModelCallSpy: Spy<EnqueueModelCallFn> = spy(
      async (_deps: EnqueueModelCallDeps, _params: EnqueueModelCallParams, _payload: EnqueueModelCallPayload) => {
        return { queued: true };
      },
    );

    let gatherCallCount: number = 0;
    const unboundGather: GatherArtifactsFn = (deps, params, payload) => {
      gatherCallCount += 1;
      return gatherArtifacts(deps, params, payload);
    };

    let preparePayloadCaptured: unknown = undefined;
    let artifactTableQueryDuringPrepare: number = 0;
    const unboundPrepare: PrepareModelJobFn = (deps, params, payload) => {
      preparePayloadCaptured = payload;
      const projectResourcesSpyBefore = spies.getHistoricQueryBuilderSpies(
        "dialectic_project_resources",
        "select",
      );
      if (!projectResourcesSpyBefore) throw new Error("spy for dialectic_project_resources not found");
      const projectResourcesBefore = projectResourcesSpyBefore.callCount;
      const contributionsSpyBefore = spies.getHistoricQueryBuilderSpies(
        "dialectic_contributions",
        "select",
      );
      if (!contributionsSpyBefore) throw new Error("spy for dialectic_contributions not found");
      const contributionsBefore = contributionsSpyBefore.callCount;
      const feedbackSpyBefore = spies.getHistoricQueryBuilderSpies(
        "dialectic_feedback",
        "select",
      );
      if (!feedbackSpyBefore) throw new Error("spy for dialectic_feedback not found");
      const feedbackBefore = feedbackSpyBefore.callCount;
      try {
        return prepareModelJob(deps, params, payload);
      } finally {
        const projectResourcesSpyAfter = spies.getHistoricQueryBuilderSpies(
          "dialectic_project_resources",
          "select",
        );
        if (!projectResourcesSpyAfter) throw new Error("spy for dialectic_project_resources not found");
        const projectResourcesAfter = projectResourcesSpyAfter.callCount;
        const contributionsSpyAfter = spies.getHistoricQueryBuilderSpies(
          "dialectic_contributions",
          "select",
        );
        if (!contributionsSpyAfter) throw new Error("spy for dialectic_contributions not found");
        const contributionsAfter = contributionsSpyAfter.callCount;
        const feedbackSpyAfter = spies.getHistoricQueryBuilderSpies(
          "dialectic_feedback",
          "select",
        );
        if (!feedbackSpyAfter) throw new Error("spy for dialectic_feedback not found");
        const feedbackAfter = feedbackSpyAfter.callCount;
        artifactTableQueryDuringPrepare +=
          (projectResourcesAfter - projectResourcesBefore) +
          (contributionsAfter - contributionsBefore) +
          (feedbackAfter - feedbackBefore);
      }
    };

    const baseParams = buildJobContextParams({
      logger,
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadBuffer,
      }),
      countTokens,
      textSplitter: new LangchainTextSplitter(),
      constructStoragePath,
      userTokenWalletService: new UserTokenWalletService(dbClient),
      adminTokenWalletService: new AdminTokenWalletService(dbClient),
      calculateAffordability,
      compressPrompt,
      getSortedCompressionCandidates,
      enqueueCompressJobs,
      resolveCompressionSource,
      applyCompressionOverlay,
      getMaxOutputTokens,
      enqueueModelCall: enqueueModelCallSpy,
      gatherArtifacts: unboundGather,
      prepareModelJob: unboundPrepare,
    });

    const rootCtx = createJobContext(baseParams);

    const executeJobPayload = buildDialecticExecuteJobPayload({
      planner_metadata: { recipe_step_id: "step-1", recipe_template_id: "test-template-id" },
    });
    if (!isJson(executeJobPayload)) {
      throw new Error("executeJobPayload is not Json-compatible");
    }
    const executeJob = buildDialecticJobRow({
      payload: executeJobPayload,
    });
    if (!isDialecticExecuteJobPayload(executeJob.payload)) {
      throw new Error("executeJob.payload is not a valid DialecticExecuteJobPayload");
    }
    const typedExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      ...executeJob,
      payload: executeJob.payload,
    };

    try {
      await processSimpleJob(
        rootCtx,
        { dbClient: mockSetup.client as unknown as SupabaseClient<Database> },
        { job: typedExecuteJob },
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

      assertEquals(enqueueModelCallSpy.calls.length, 1);

      const firstEnqueueCall = enqueueModelCallSpy.calls[0];
      assertExists(firstEnqueueCall);
      assertEquals(firstEnqueueCall.args.length >= 3, true);
      const enqueueParamsUnknown: unknown = firstEnqueueCall.args[1];
      const enqueuePayloadUnknown: unknown = firstEnqueueCall.args[2];
      assertEquals(isEnqueueModelCallParams(enqueueParamsUnknown), true);
      assertEquals(isEnqueueModelCallPayload(enqueuePayloadUnknown), true);
      if (!isEnqueueModelCallParams(enqueueParamsUnknown)) {
        throw new Error("expected EnqueueModelCallParams");
      }
      if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
        throw new Error("expected EnqueueModelCallPayload");
      }
      const enqueueParams: EnqueueModelCallParams = enqueueParamsUnknown;
      const enqueuePayload: EnqueueModelCallPayload = enqueuePayloadUnknown;
      assertEquals(enqueueParams.job.id, typedExecuteJob.id);

      const chatApiRequest: ChatApiRequest = enqueuePayload.chatApiRequest;
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
    } finally {
      mockSetup.clearAllStubs?.();
    }
  },
);

// ---------------------------------------------------------------------------
// TEST 2 — Real-DB integration: artifacts gathered from real DB rows with real
//           storage survive the full pipeline to ChatApiRequest at enqueueModelCall boundary
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
        const rules: InputRule[] = candidate.inputs_required;
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

      const recipeInputRules: InputRule[] = chosenStep.inputs_required;
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

      // Get the deterministic AI provider seeded by coreUpsertTestProviders
      // (prepareModelJob validates config before calling enqueueModelCall)
      const { data: providerRow, error: providerErr } = await admin
        .from("ai_providers")
        .select("*")
        .eq("api_identifier", "openai-gpt-4o")
        .single();

      if (providerErr || !providerRow) {
        throw new Error(
          "No active AI provider with api_identifier 'openai-gpt-4o' found. " +
          "Seed the DB with coreUpsertTestProviders before running this test.",
        );
      }
      if (!isAiModelExtendedConfig(providerRow.config)) {
        throw new Error(
          "Seeded provider 'openai-gpt-4o' does not have a valid AiModelExtendedConfig. " +
          "Check that its config has api_identifier, non-negative input_token_cost_rate, " +
          "positive output_token_cost_rate, and a valid tokenization_strategy.",
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
      const storageBucket: string = Deno.env.get("SB_CONTENT_STORAGE_BUCKET")!;
      const modelSlug = "integration-test-model";

      // Track expected artifacts in inputsRequired order for assertion
      type ExpectedArtifact = {
        id: string;
        content: string;
        document_key: FileType;
        stage_slug: DialecticStageSlug;
        type: string;
      };
      const expectedArtifacts: ExpectedArtifact[] = [];

      for (let i = 0; i < recipeInputRules.length; i++) {
        const rule = recipeInputRules[i];
        if (!rule.document_key) continue;
        if (!isDialecticStageSlug(rule.slug)) {
          throw new Error(`Invalid stage slug: ${rule.slug}`);
        }

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
      // 6. Wire the pipeline: real gather + real prepare, spy at enqueueModelCall boundary
      // ---------------------------------------------------------------------
      const logger = new MockLogger();

      const enqueueModelCallSpy: Spy<EnqueueModelCallFn> = spy(
        async (_deps: EnqueueModelCallDeps, _params: EnqueueModelCallParams, _payload: EnqueueModelCallPayload) => {
          return { queued: true };
        },
      );

      let gatherCallCount = 0;
      const unboundGather: GatherArtifactsFn = (deps, params, payload) => {
        gatherCallCount += 1;
        return gatherArtifacts(deps, params, payload);
      };

      let preparePayloadCaptured: unknown = undefined;
      const unboundPrepare: PrepareModelJobFn = (deps, params, payload) => {
        preparePayloadCaptured = payload;
        return prepareModelJob(deps, params, payload);
      };

      const baseParams = buildJobContextParams({
        logger,
        downloadFromStorage,
        countTokens,
        textSplitter: new LangchainTextSplitter(),
        constructStoragePath,
        userTokenWalletService: new UserTokenWalletService(admin),
        adminTokenWalletService: new AdminTokenWalletService(admin),
        calculateAffordability,
        compressPrompt,
        getSortedCompressionCandidates,
        enqueueCompressJobs,
        resolveCompressionSource,
        applyCompressionOverlay,
        getMaxOutputTokens,
        enqueueModelCall: enqueueModelCallSpy,
        gatherArtifacts: unboundGather,
        prepareModelJob: unboundPrepare,
      });
      const rootCtx = createJobContext(baseParams);

      // Build the job payload pointing to our test data
      if (!isModelContributionFileType(chosenStep.output_type)) {
        throw new Error(
          `Recipe step output_type '${chosenStep.output_type}' is not a ModelContributionFileType — choose a different recipe step.`,
        );
      }

      if (!isDialecticStageSlug(stage.slug)) {
        throw new Error(`stage.slug '${stage.slug}' is not a valid DialecticStageSlug`);
      }
      const stageSlug: DialecticStageSlug = stage.slug;
      const jobPayload = buildDialecticExecuteJobPayload({
        projectId: testProjectId,
        sessionId: testSessionId,
        stageSlug,
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

      const testJob = buildDialecticJobRow({
        id: crypto.randomUUID(),
        session_id: testSessionId,
        user_id: primaryUserId,
        stage_slug: stage.slug,
        iteration_number: testIterationNumber,
        payload: jobPayload,
      });
      if (!isDialecticExecuteJobPayload(testJob.payload)) {
        throw new Error("testJob.payload is not a valid DialecticExecuteJobPayload");
      }
      const typedTestJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
        ...testJob,
        payload: testJob.payload,
      };

      // ---------------------------------------------------------------------
      // 7. Execute the pipeline
      // ---------------------------------------------------------------------
      await processSimpleJob(
        rootCtx,
        { dbClient: admin },
        { job: typedTestJob },
      );

      // ---------------------------------------------------------------------
      // 8. Assertions
      // ---------------------------------------------------------------------

      // 8a. gatherArtifacts called exactly once
      assertEquals(gatherCallCount, 1, "gatherArtifacts should be called exactly once");

      // 8b. enqueueModelCall was called
      assertEquals(enqueueModelCallSpy.calls.length, 1, "enqueueModelCall should be called exactly once");

      // 8c. Validate preparePayload captured the artifacts
      assertEquals(isPrepareModelJobPayload(preparePayloadCaptured), true);
      if (!isPrepareModelJobPayload(preparePayloadCaptured)) {
        throw new Error("expected PrepareModelJobPayload");
      }
      const capturedPayload: PrepareModelJobPayload = preparePayloadCaptured;
      const capturedDocs = capturedPayload.promptConstructionPayload.resourceDocuments;
      assertExists(capturedDocs, "resourceDocuments should exist in PrepareModelJobPayload");

      // 8d. Extract the final ChatApiRequest from the enqueueModelCall spy
      const enqueueCall = enqueueModelCallSpy.calls[0];
      assertExists(enqueueCall);
      const enqueuePayloadUnknown: unknown = enqueueCall.args[2];
      assertEquals(isEnqueueModelCallPayload(enqueuePayloadUnknown), true);
      if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
        throw new Error("expected EnqueueModelCallPayload");
      }
      const enqueuePayload: EnqueueModelCallPayload = enqueuePayloadUnknown;
      const chatApiRequest: ChatApiRequest = enqueuePayload.chatApiRequest;

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
          doc.document_key,
          expected.document_key,
          `resourceDocuments[${i}].document_key mismatch`,
        );
        assertEquals(
          doc.stage_slug,
          expected.stage_slug,
          `resourceDocuments[${i}].stage_slug mismatch`,
        );
        assertEquals(
          doc.type,
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

// ---------------------------------------------------------------------------
// TEST 3 — Oversized working set: COMPRESS rows inserted, returns deferred,
//           no notification, no row status write.
// Boundary: processSimpleJob → gatherArtifacts → applyCompressionOverlay →
//   prepareModelJob → calculateAffordability → compressPrompt → enqueueCompressJobs
// Mocked: Supabase client, enqueueModelCall (queue POST).
// ---------------------------------------------------------------------------

Deno.test(
  "integration: oversized working set drives COMPRESS row insertion and returns deferred with no notification",
  async () => {
    resetMockNotificationService();

    // Arrange: two oversized rendered documents against a tiny context window.
    const storageDownloadBody = "0".repeat(50_000);
    const downloadBuffer = toArrayBuffer(storageDownloadBody);
    const recipeStepId = "step-integration-chain";
    const documentKey = FileType.business_case;

    const inputRules = Array.from({ length: 2 }, () =>
      buildInputRule({ type: "document", slug: "thesis", document_key: documentKey })
    );
    const recipeStepRow = buildDialecticStageRecipeStep({
      id: recipeStepId,
      job_type: "EXECUTE",
      inputs_required: inputRules,
    });
    if (recipeStepRow === null) throw new Error("buildDialecticStageRecipeStep returned null");

    const resourceRows = inputRules.map((_rule, i) => {
      const { storagePath, fileName } = constructStoragePath({
        projectId: "test-project-id",
        sessionId: "test-session-id",
        iteration: 1,
        stageSlug: DialecticStageSlug.Thesis,
        fileType: FileType.RenderedDocument,
        modelSlug: `integration-test-model-${i}`,
        attemptCount: 0,
        documentKey,
      });
      return buildDialecticProjectResourceRow({
        id: `chain-resource-${i}`,
        stage_slug: "thesis",
        resource_type: "rendered_document",
        storage_path: storagePath,
        file_name: fileName,
      });
    });

    // pathKeyed download: resource paths return oversized content; compressed paths miss.
    const resourceFullPaths = resourceRows.map((r) => `${r.storage_path}/${r.file_name}`);
    const pathToData: Record<string, ArrayBuffer> = {};
    for (const p of resourceFullPaths) {
      pathToData[p] = downloadBuffer;
    }

    const extendedFixture = buildExtendedModelConfig({ context_window_tokens: 200 });
    if (!isJson(extendedFixture)) throw new Error("extendedFixture is not Json-compatible");
    const providerRow = buildMockProvider({ config: extendedFixture });

    const mockSetup = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_stage_recipe_steps: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const matches = filters.some((f) => isRecord(f) && f["type"] === "eq" && f["column"] === "id" && f["value"] === recipeStepId);
            if (matches) return Promise.resolve({ data: [recipeStepRow], error: null });
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_sessions: {
          select: () => Promise.resolve({ data: [buildDialecticSessionRow()], error: null }),
        },
        dialectic_projects: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: "test-domain-id", name: "d", description: "d" } }],
            error: null,
          }),
        },
        dialectic_stages: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticStage(), system_prompts: { id: "test-system-prompt-id", prompt_text: "sys" } }],
            error: null,
          }),
        },
        domain_specific_prompt_overlays: {
          select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }),
        },
        dialectic_project_resources: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            // gatherArtifacts queries by resource_type=rendered_document
            const isGatherQuery = filters.some(
              (f) => isRecord(f) && f["type"] === "eq" && f["column"] === "resource_type" && f["value"] === "rendered_document",
            );
            if (isGatherQuery) return Promise.resolve({ data: resourceRows, error: null });
            // enqueueCompressJobs existence check queries by storage_path + file_name
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_memory: { select: () => Promise.resolve({ data: [], error: null }) },
        dialectic_contributions: { select: () => Promise.resolve({ data: [], error: null }) },
        ai_providers: { select: () => Promise.resolve({ data: [providerRow], error: null }) },
        token_wallets: {
          select: (state: unknown) => {
            if (isRecord(state) && state["selectColumns"] === "balance::text") {
              return Promise.resolve({ data: [{ balance: "100000" }], error: null });
            }
            return Promise.resolve({ data: [buildTokenWalletRow({ wallet_id: buildDialecticExecuteJobPayload().walletId })], error: null });
          },
        },
      },
    });

    const spies = mockSetup.spies;
    const logger = new MockLogger();
    const enqueueModelCallSpy: Spy<EnqueueModelCallFn> = spy(
      async (_d: EnqueueModelCallDeps, _p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload) => ({ queued: true }),
    );

    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const rootCtx = createJobContext(buildJobContextParams({
      logger,
      downloadFromStorage: createMockDownloadFromStorage({ mode: "pathKeyed", pathToData }),
      countTokens,
      textSplitter: new LangchainTextSplitter(),
      constructStoragePath,
      userTokenWalletService: new UserTokenWalletService(dbClient),
      adminTokenWalletService: new AdminTokenWalletService(dbClient),
      calculateAffordability,
      compressPrompt,
      getSortedCompressionCandidates,
      enqueueCompressJobs,
      resolveCompressionSource,
      applyCompressionOverlay,
      getMaxOutputTokens,
      enqueueModelCall: enqueueModelCallSpy,
      gatherArtifacts,
      prepareModelJob,
    }));

    const executeJobPayload = buildDialecticExecuteJobPayload({
      planner_metadata: { recipe_step_id: recipeStepId, recipe_template_id: "test-template-id" },
    });
    if (!isJson(executeJobPayload)) throw new Error("executeJobPayload is not Json-compatible");
    const executeJob = buildDialecticJobRow({ payload: executeJobPayload });
    if (!isDialecticExecuteJobPayload(executeJob.payload)) {
      throw new Error("executeJob.payload is not a valid DialecticExecuteJobPayload");
    }
    const typedExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      ...executeJob,
      payload: executeJob.payload,
    };

    try {
      const result = await processSimpleJob(
        rootCtx,
        { dbClient: mockSetup.client as unknown as SupabaseClient<Database> },
        { job: typedExecuteJob },
      );

      // Assert: returns deferred
      assert("deferred" in result && result.deferred === true, "expected { deferred: true }");

      // Assert: no notification sent
      assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 0);

      // Assert: COMPRESS rows inserted into dialectic_generation_jobs
      const compressInsertSpy = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
      assertExists(compressInsertSpy);
      assert(compressInsertSpy.callCount >= 1, "expected at least one COMPRESS row insert");

      // Assert: parent job status updated to waiting_for_children by compressPrompt
      const updateSpy = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
      assertExists(updateSpy, "expected at least one update on dialectic_generation_jobs");
      const statusUpdates = updateSpy.callsArgs.filter(
        (args) => isRecord(args[0]) && "status" in args[0],
      );
      assertEquals(statusUpdates.length, 1, "expected exactly one status update");
      assertEquals(statusUpdates[0][0], { status: "waiting_for_children" });
    } finally {
      mockSetup.clearAllStubs?.();
    }
  },
);

// ---------------------------------------------------------------------------
// TEST 4 — Within-budget working set: queue receives one POST, returns
//           dispatched, exactly one execute_completed event.
// Boundary: processSimpleJob → gatherArtifacts → prepareModelJob → enqueueModelCall
// Mocked: Supabase client, enqueueModelCall (queue POST).
// ---------------------------------------------------------------------------

Deno.test(
  "integration: within-budget working set dispatches to queue with exactly one execute_completed event",
  async () => {
    resetMockNotificationService();

    // Arrange: one small rendered document against a large context window.
    const storageDownloadBody = "small content";
    const downloadBuffer = toArrayBuffer(storageDownloadBody);
    const recipeStepId = "step-integration-chain";
    const documentKey = FileType.business_case;

    const inputRule = buildInputRule({ type: "document", slug: "thesis", document_key: documentKey });
    const recipeStepRow = buildDialecticStageRecipeStep({
      id: recipeStepId,
      job_type: "EXECUTE",
      inputs_required: [inputRule],
    });
    if (recipeStepRow === null) throw new Error("buildDialecticStageRecipeStep returned null");

    const { storagePath, fileName } = constructStoragePath({
      projectId: "test-project-id",
      sessionId: "test-session-id",
      iteration: 1,
      stageSlug: DialecticStageSlug.Thesis,
      fileType: FileType.RenderedDocument,
      modelSlug: "integration-test-model",
      attemptCount: 0,
      documentKey,
    });
    const resourceRow = buildDialecticProjectResourceRow({
      id: "chain-resource-0",
      stage_slug: "thesis",
      resource_type: "rendered_document",
      storage_path: storagePath,
      file_name: fileName,
    });

    const extendedFixture = buildExtendedModelConfig({ context_window_tokens: 128_000 });
    if (!isJson(extendedFixture)) throw new Error("extendedFixture is not Json-compatible");
    const providerRow = buildMockProvider({ config: extendedFixture });

    const mockSetup = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_stage_recipe_steps: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const matches = filters.some((f) => isRecord(f) && f["type"] === "eq" && f["column"] === "id" && f["value"] === recipeStepId);
            if (matches) return Promise.resolve({ data: [recipeStepRow], error: null });
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_sessions: {
          select: () => Promise.resolve({ data: [buildDialecticSessionRow()], error: null }),
        },
        dialectic_projects: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: "test-domain-id", name: "d", description: "d" } }],
            error: null,
          }),
        },
        dialectic_stages: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticStage(), system_prompts: { id: "test-system-prompt-id", prompt_text: "sys" } }],
            error: null,
          }),
        },
        domain_specific_prompt_overlays: {
          select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }),
        },
        dialectic_project_resources: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const isGatherQuery = filters.some(
              (f) => isRecord(f) && f["type"] === "eq" && f["column"] === "resource_type" && f["value"] === "rendered_document",
            );
            if (isGatherQuery) return Promise.resolve({ data: [resourceRow], error: null });
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_memory: { select: () => Promise.resolve({ data: [], error: null }) },
        dialectic_contributions: { select: () => Promise.resolve({ data: [], error: null }) },
        ai_providers: { select: () => Promise.resolve({ data: [providerRow], error: null }) },
        token_wallets: {
          select: (state: unknown) => {
            if (isRecord(state) && state["selectColumns"] === "balance::text") {
              return Promise.resolve({ data: [{ balance: "100000" }], error: null });
            }
            return Promise.resolve({ data: [buildTokenWalletRow({ wallet_id: buildDialecticExecuteJobPayload().walletId })], error: null });
          },
        },
      },
    });

    const logger = new MockLogger();
    const enqueueModelCallSpy: Spy<EnqueueModelCallFn> = spy(
      async (_d: EnqueueModelCallDeps, _p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload) => ({ queued: true }),
    );

    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const rootCtx = createJobContext(buildJobContextParams({
      logger,
      downloadFromStorage: createMockDownloadFromStorage({ mode: "success", data: downloadBuffer }),
      countTokens,
      textSplitter: new LangchainTextSplitter(),
      constructStoragePath,
      userTokenWalletService: new UserTokenWalletService(dbClient),
      adminTokenWalletService: new AdminTokenWalletService(dbClient),
      calculateAffordability,
      compressPrompt,
      getSortedCompressionCandidates,
      enqueueCompressJobs,
      resolveCompressionSource,
      applyCompressionOverlay,
      getMaxOutputTokens,
      enqueueModelCall: enqueueModelCallSpy,
      gatherArtifacts,
      prepareModelJob,
    }));

    const executeJobPayload = buildDialecticExecuteJobPayload({
      planner_metadata: { recipe_step_id: recipeStepId, recipe_template_id: "test-template-id" },
    });
    if (!isJson(executeJobPayload)) throw new Error("executeJobPayload is not Json-compatible");
    const executeJob = buildDialecticJobRow({ payload: executeJobPayload });
    if (!isDialecticExecuteJobPayload(executeJob.payload)) {
      throw new Error("executeJob.payload is not a valid DialecticExecuteJobPayload");
    }
    const typedExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      ...executeJob,
      payload: executeJob.payload,
    };

    try {
      const result = await processSimpleJob(
        rootCtx,
        { dbClient: mockSetup.client as unknown as SupabaseClient<Database> },
        { job: typedExecuteJob },
      );

      // Assert: returns dispatched
      assert("dispatched" in result && result.dispatched === true, "expected { dispatched: true }");

      // Assert: queue received one POST
      assertEquals(enqueueModelCallSpy.calls.length, 1);

      // Assert: exactly one execute_completed event
      const executeCompletedCalls = mockNotificationService.sendJobNotificationEvent.calls.filter(
        (c) => isRecord(c.args[0]) && c.args[0]["type"] === "execute_completed",
      );
      assertEquals(executeCompletedCalls.length, 1);
    } finally {
      mockSetup.clearAllStubs?.();
    }
  },
);

// ---------------------------------------------------------------------------
// TEST 5 — Already-compressed working set: overlay swaps victim's content,
//           recount fits, reaches queue without any COMPRESS row inserted.
// Boundary: processSimpleJob → gatherArtifacts → applyCompressionOverlay →
//   prepareModelJob → calculateAffordability → enqueueModelCall
// Mocked: Supabase client, enqueueModelCall (queue POST).
// ---------------------------------------------------------------------------

Deno.test(
  "integration: already-compressed working set reaches queue without COMPRESS row insertion",
  async () => {
    resetMockNotificationService();

    // Arrange: oversized original content, but the overlay returns compressed content that fits.
    const oversizedContent = "0".repeat(50_000);
    const compressedContent = "compressed";
    const oversizedBuffer = toArrayBuffer(oversizedContent);
    const compressedBuffer = toArrayBuffer(compressedContent);
    const recipeStepId = "step-integration-chain";
    const documentKey = FileType.business_case;

    const inputRule = buildInputRule({ type: "document", slug: "thesis", document_key: documentKey });
    const recipeStepRow = buildDialecticStageRecipeStep({
      id: recipeStepId,
      job_type: "EXECUTE",
      inputs_required: [inputRule],
    });
    if (recipeStepRow === null) throw new Error("buildDialecticStageRecipeStep returned null");

    const resourcePath = constructStoragePath({
      projectId: "test-project-id",
      sessionId: "test-session-id",
      iteration: 1,
      stageSlug: DialecticStageSlug.Thesis,
      fileType: FileType.RenderedDocument,
      modelSlug: "integration-test-model",
      attemptCount: 0,
      documentKey,
    });
    const resourceFullPath = `${resourcePath.storagePath}/${resourcePath.fileName}`;
    const resourceRow = buildDialecticProjectResourceRow({
      id: "chain-resource-0",
      stage_slug: "thesis",
      resource_type: "rendered_document",
      storage_path: resourcePath.storagePath,
      file_name: resourcePath.fileName,
    });

    // Compressed path for the overlay — applyCompressionOverlay downloads from this.
    const compressedPath = constructStoragePath({
      projectId: "test-project-id",
      sessionId: "test-session-id",
      iteration: 1,
      stageSlug: DialecticStageSlug.Thesis,
      fileType: FileType.CompressedContext,
      modelSlug: "integration-test-model",
      attemptCount: 0,
      documentKey,
      sourceType: "resource",
      output_type: FileType.business_case,
    });
    const compressedFullPath = `${compressedPath.storagePath}/${compressedPath.fileName}`;

    // pathKeyed: resource path returns oversized, compressed path returns small.
    const pathToData: Record<string, ArrayBuffer> = {
      [resourceFullPath]: oversizedBuffer,
      [compressedFullPath]: compressedBuffer,
    };

    const extendedFixture = buildExtendedModelConfig({ context_window_tokens: 200 });
    if (!isJson(extendedFixture)) throw new Error("extendedFixture is not Json-compatible");
    const providerRow = buildMockProvider({ config: extendedFixture });

    const mockSetup = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_stage_recipe_steps: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const matches = filters.some((f) => isRecord(f) && f["type"] === "eq" && f["column"] === "id" && f["value"] === recipeStepId);
            if (matches) return Promise.resolve({ data: [recipeStepRow], error: null });
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_sessions: {
          select: () => Promise.resolve({ data: [buildDialecticSessionRow()], error: null }),
        },
        dialectic_projects: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: "test-domain-id", name: "d", description: "d" } }],
            error: null,
          }),
        },
        dialectic_stages: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticStage(), system_prompts: { id: "test-system-prompt-id", prompt_text: "sys" } }],
            error: null,
          }),
        },
        domain_specific_prompt_overlays: {
          select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }),
        },
        dialectic_project_resources: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const isGatherQuery = filters.some(
              (f) => isRecord(f) && f["type"] === "eq" && f["column"] === "resource_type" && f["value"] === "rendered_document",
            );
            if (isGatherQuery) return Promise.resolve({ data: [resourceRow], error: null });
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_memory: { select: () => Promise.resolve({ data: [], error: null }) },
        dialectic_contributions: { select: () => Promise.resolve({ data: [], error: null }) },
        ai_providers: { select: () => Promise.resolve({ data: [providerRow], error: null }) },
        token_wallets: {
          select: (state: unknown) => {
            if (isRecord(state) && state["selectColumns"] === "balance::text") {
              return Promise.resolve({ data: [{ balance: "100000" }], error: null });
            }
            return Promise.resolve({ data: [buildTokenWalletRow({ wallet_id: buildDialecticExecuteJobPayload().walletId })], error: null });
          },
        },
      },
    });

    const logger = new MockLogger();
    const enqueueModelCallSpy: Spy<EnqueueModelCallFn> = spy(
      async (_d: EnqueueModelCallDeps, _p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload) => ({ queued: true }),
    );

    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const rootCtx = createJobContext(buildJobContextParams({
      logger,
      downloadFromStorage: createMockDownloadFromStorage({ mode: "pathKeyed", pathToData }),
      countTokens,
      textSplitter: new LangchainTextSplitter(),
      constructStoragePath,
      userTokenWalletService: new UserTokenWalletService(dbClient),
      adminTokenWalletService: new AdminTokenWalletService(dbClient),
      calculateAffordability,
      compressPrompt,
      getSortedCompressionCandidates,
      enqueueCompressJobs,
      resolveCompressionSource,
      applyCompressionOverlay,
      getMaxOutputTokens,
      enqueueModelCall: enqueueModelCallSpy,
      gatherArtifacts,
      prepareModelJob,
    }));

    const executeJobPayload = buildDialecticExecuteJobPayload({
      planner_metadata: { recipe_step_id: recipeStepId, recipe_template_id: "test-template-id" },
    });
    if (!isJson(executeJobPayload)) throw new Error("executeJobPayload is not Json-compatible");
    const executeJob = buildDialecticJobRow({ payload: executeJobPayload });
    if (!isDialecticExecuteJobPayload(executeJob.payload)) {
      throw new Error("executeJob.payload is not a valid DialecticExecuteJobPayload");
    }
    const typedExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      ...executeJob,
      payload: executeJob.payload,
    };

    try {
      const result = await processSimpleJob(
        rootCtx,
        { dbClient: mockSetup.client as unknown as SupabaseClient<Database> },
        { job: typedExecuteJob },
      );

      // Assert: reaches queue (dispatched)
      assert("dispatched" in result && result.dispatched === true, "expected { dispatched: true }");
      assertEquals(enqueueModelCallSpy.calls.length, 1);

      // Assert: no COMPRESS row inserted
      const compressInsertSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
      const insertCallCount = compressInsertSpy?.callCount;
      assertEquals(insertCallCount, 0);
    } finally {
      mockSetup.clearAllStubs?.();
    }
  },
);

// ---------------------------------------------------------------------------
// TEST 6 — Failure through the chain: returned error arm with no
//           dialectic_generation_jobs write.
// Boundary: processSimpleJob → real chain (fails at session lookup)
// Mocked: Supabase client (returns no session), enqueueModelCall (queue POST).
// ---------------------------------------------------------------------------

Deno.test(
  "integration: failure through chain returns error arm with no dialectic_generation_jobs write",
  async () => {
    resetMockNotificationService();

    // Arrange: session lookup returns no rows — the chain fails at the first step.
    const downloadBuffer = toArrayBuffer("small content");
    const recipeStepId = "step-integration-chain";
    const documentKey = FileType.business_case;

    const inputRule = buildInputRule({ type: "document", slug: "thesis", document_key: documentKey });
    const recipeStepRow = buildDialecticStageRecipeStep({
      id: recipeStepId,
      job_type: "EXECUTE",
      inputs_required: [inputRule],
    });
    if (recipeStepRow === null) throw new Error("buildDialecticStageRecipeStep returned null");

    const { storagePath, fileName } = constructStoragePath({
      projectId: "test-project-id",
      sessionId: "test-session-id",
      iteration: 1,
      stageSlug: DialecticStageSlug.Thesis,
      fileType: FileType.RenderedDocument,
      modelSlug: "integration-test-model",
      attemptCount: 0,
      documentKey,
    });
    const resourceRow = buildDialecticProjectResourceRow({
      id: "chain-resource-0",
      stage_slug: "thesis",
      resource_type: "rendered_document",
      storage_path: storagePath,
      file_name: fileName,
    });

    const extendedFixture = buildExtendedModelConfig({ context_window_tokens: 128_000 });
    if (!isJson(extendedFixture)) throw new Error("extendedFixture is not Json-compatible");
    const providerRow = buildMockProvider({ config: extendedFixture });

    const mockSetup = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_stage_recipe_steps: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const matches = filters.some((f) => isRecord(f) && f["type"] === "eq" && f["column"] === "id" && f["value"] === recipeStepId);
            if (matches) return Promise.resolve({ data: [recipeStepRow], error: null });
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_sessions: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
        dialectic_projects: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: "test-domain-id", name: "d", description: "d" } }],
            error: null,
          }),
        },
        dialectic_stages: {
          select: () => Promise.resolve({
            data: [{ ...buildDialecticStage(), system_prompts: { id: "test-system-prompt-id", prompt_text: "sys" } }],
            error: null,
          }),
        },
        domain_specific_prompt_overlays: {
          select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }),
        },
        dialectic_project_resources: {
          select: (state: unknown) => {
            if (!isRecord(state)) return Promise.resolve({ data: [], error: null });
            const filters: unknown[] = Array.isArray(state["filters"]) ? state["filters"] : [];
            const isGatherQuery = filters.some(
              (f) => isRecord(f) && f["type"] === "eq" && f["column"] === "resource_type" && f["value"] === "rendered_document",
            );
            if (isGatherQuery) return Promise.resolve({ data: [resourceRow], error: null });
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_memory: { select: () => Promise.resolve({ data: [], error: null }) },
        dialectic_contributions: { select: () => Promise.resolve({ data: [], error: null }) },
        ai_providers: { select: () => Promise.resolve({ data: [providerRow], error: null }) },
        token_wallets: {
          select: (state: unknown) => {
            if (isRecord(state) && state["selectColumns"] === "balance::text") {
              return Promise.resolve({ data: [{ balance: "100000" }], error: null });
            }
            return Promise.resolve({ data: [buildTokenWalletRow({ wallet_id: buildDialecticExecuteJobPayload().walletId })], error: null });
          },
        },
      },
    });

    const spies = mockSetup.spies;
    const logger = new MockLogger();
    const enqueueModelCallSpy: Spy<EnqueueModelCallFn> = spy(
      async (_d: EnqueueModelCallDeps, _p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload) => ({ queued: true }),
    );

    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const rootCtx = createJobContext(buildJobContextParams({
      logger,
      downloadFromStorage: createMockDownloadFromStorage({ mode: "success", data: downloadBuffer }),
      countTokens,
      textSplitter: new LangchainTextSplitter(),
      constructStoragePath,
      userTokenWalletService: new UserTokenWalletService(dbClient),
      adminTokenWalletService: new AdminTokenWalletService(dbClient),
      calculateAffordability,
      compressPrompt,
      getSortedCompressionCandidates,
      enqueueCompressJobs,
      resolveCompressionSource,
      applyCompressionOverlay,
      getMaxOutputTokens,
      enqueueModelCall: enqueueModelCallSpy,
      gatherArtifacts,
      prepareModelJob,
    }));

    const executeJobPayload = buildDialecticExecuteJobPayload({
      planner_metadata: { recipe_step_id: recipeStepId, recipe_template_id: "test-template-id" },
    });
    if (!isJson(executeJobPayload)) throw new Error("executeJobPayload is not Json-compatible");
    const executeJob = buildDialecticJobRow({ payload: executeJobPayload });
    if (!isDialecticExecuteJobPayload(executeJob.payload)) {
      throw new Error("executeJob.payload is not a valid DialecticExecuteJobPayload");
    }
    const typedExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      ...executeJob,
      payload: executeJob.payload,
    };

    try {
      const result = await processSimpleJob(
        rootCtx,
        { dbClient: mockSetup.client as unknown as SupabaseClient<Database> },
        { job: typedExecuteJob },
      );

      // Assert: returns error arm
      assert("error" in result, "expected error arm in result");
      assert(result.retriable === false, "expected retriable: false");

      // Assert: no dialectic_generation_jobs write (insert or update)
      const insertSpy = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
      const updateSpy = spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
      assertEquals(insertSpy?.callCount, 0);
      assertEquals(updateSpy?.callCount, 0);
    } finally {
      mockSetup.clearAllStubs?.();
    }
  },
);
