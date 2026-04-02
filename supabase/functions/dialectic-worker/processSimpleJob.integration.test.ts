import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
} from "../dialectic-service/dialectic.interface.ts";
import { isRecord } from "../_shared/utils/type_guards.ts";

function toArrayBuffer(content: string): ArrayBuffer {
  const encoded: Uint8Array = new TextEncoder().encode(content);
  const buffer: ArrayBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

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
