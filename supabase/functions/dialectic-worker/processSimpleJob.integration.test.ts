import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../types_db.ts";
import { FileType } from "../_shared/types/file_manager.types.ts";
import type { AiModelExtendedConfig, ChatApiRequest, OutboundDocument, ResourceDocument } from "../_shared/types.ts";
import type { CountTokensDeps, CountableChatPayload, CountTokensFn } from "../_shared/types/tokenizer.types.ts";
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
import { isPrepareModelJobPayload } from "./prepareModelJob/prepareModelJob.interface.guard.ts";
import {
  buildAiProviderRow,
  buildExtendedModelFixture,
  buildPrepareModelJobDeps,
} from "./prepareModelJob/prepareModelJob.mock.ts";
import { processSimpleJob } from "./processSimpleJob.ts";
import {
  defaultStepSlug,
  mockJob,
  mockPayload,
  setupMockClient,
} from "./processSimpleJob.mock.ts";
import type { DialecticJobRow } from "../dialectic-service/dialectic.interface.ts";

function toArrayBuffer(content: string): ArrayBuffer {
  const encoded: Uint8Array = new TextEncoder().encode(content);
  const buffer: ArrayBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

Deno.test(
  "integration: processSimpleJob uses factories-only overrides on setupMockClient; gather once; prepare forwards resourceDocuments to EMCAS; no artifact table queries during prepare",
  async () => {
    const downloadBuffer: ArrayBuffer = toArrayBuffer("document-content-from-storage");

    const mockSetup = setupMockClient({
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
            context_window_tokens: 30,
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

    const countTokens: CountTokensFn = (
      _deps: CountTokensDeps,
      payload: CountableChatPayload,
      _modelConfig: AiModelExtendedConfig,
    ): number => {
      const docs: NonNullable<CountableChatPayload["resourceDocuments"]> = payload.resourceDocuments ?? [];
      if (docs.length === 0) return 5;
      const firstContent: string = typeof docs[0].content === "string" ? docs[0].content : "";
      if (firstContent === "Mocked RAG context") return 10;
      return 120;
    };

    const prepareDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave,
      enqueueRenderJob,
      countTokens,
    });

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
