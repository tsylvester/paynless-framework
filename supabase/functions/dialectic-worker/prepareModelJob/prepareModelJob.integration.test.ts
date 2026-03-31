import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { logger } from "../../_shared/logger.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { pickLatest } from "../../_shared/utils/pickLatest.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
  InputRule,
  RelevanceRule,
  SourceDocument,
} from "../../dialectic-service/dialectic.interface.ts";
import type { CountTokensDeps, CountableChatPayload, CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { AiModelExtendedConfig, ChatApiRequest } from "../../_shared/types.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import type { BoundExecuteModelCallAndSaveFn } from "../executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import { isExecuteModelCallAndSavePayload } from "../executeModelCallAndSave/executeModelCallAndSave.interface.guard.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import { gatherArtifacts, isGatherArtifactsSuccessReturn } from "../gatherArtifacts/gatherArtifacts.provides.ts";
import {
  buildDialecticProjectResourceRow,
  buildDocumentRule,
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
  buildSelectHandler,
} from "../gatherArtifacts/gatherArtifacts.provides.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from "./prepareModelJob.interface.ts";
import { isPrepareModelJobSuccessReturn } from "./prepareModelJob.interface.guard.ts";
import {
  buildAiProviderRow,
  buildDialecticContributionRow,
  buildDialecticJobRow,
  buildDialecticSessionRow,
  buildExecuteJobPayload,
  buildPrepareModelJobDeps,
} from "./prepareModelJob.mock.ts";

function toArrayBuffer(content: string): ArrayBuffer {
  const encoded: Uint8Array = new TextEncoder().encode(content);
  const buffer: ArrayBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

Deno.test(
  "integration: gatherArtifacts pre-populates resourceDocuments and prepareModelJob flows them through scope, tokening, compression, and ChatApiRequest",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        dialectic_project_resources: {
          select: buildSelectHandler([
            buildDialecticProjectResourceRow({
              id: "int-doc-1",
              stage_slug: "thesis",
            }),
          ]),
        },
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const gatherResult = await gatherArtifacts(
      {
        logger,
        pickLatest,
        downloadFromStorage: createMockDownloadFromStorage({
          mode: "success",
          data: toArrayBuffer("document-content-from-storage"),
        }),
      },
      buildGatherArtifactsParams(dbClient),
      buildGatherArtifactsPayload([buildDocumentRule()]),
    );

    assertEquals(isGatherArtifactsSuccessReturn(gatherResult), true);
    if (!isGatherArtifactsSuccessReturn(gatherResult)) {
      throw new Error("expected gatherArtifacts success");
    }
    assertEquals(gatherResult.artifacts.length, 1);
    assertEquals(gatherResult.artifacts[0].id, "int-doc-1");
    assertEquals(gatherResult.artifacts[0].type, "document");
    assertEquals(gatherResult.artifacts[0].document_key, FileType.business_case);
    assertEquals(gatherResult.artifacts[0].stage_slug, "thesis");

    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const sessionData: DialecticSessionRow = buildDialecticSessionRow();
    const providerRow = buildAiProviderRow({
      api_identifier: "contract-api-v1",
      input_token_cost_rate: 0.0001,
      output_token_cost_rate: 0.0001,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: "cl100k_base",
      },
      hard_cap_output_tokens: 100,
      provider_max_output_tokens: 100,
      context_window_tokens: 30,
      provider_max_input_tokens: 400,
    });
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.integration",
      job,
      projectOwnerUserId: "owner-int",
      providerRow,
      sessionData,
    };

    let applyScopeCallCount = 0;
    const applyInputsRequiredScope: PrepareModelJobDeps["applyInputsRequiredScope"] = (docs, rules) => {
      applyScopeCallCount += 1;
      return docs.filter((doc) =>
        Array.isArray(rules) &&
        rules.some((rule) =>
          rule.type === doc.type &&
          rule.slug === doc.stage_slug &&
          rule.document_key === doc.document_key
        )
      );
    };

    let countTokensCallCount = 0;
    const countTokens: CountTokensFn = (
      _deps: CountTokensDeps,
      payload: CountableChatPayload,
      _modelConfig: AiModelExtendedConfig,
    ): number => {
      countTokensCallCount += 1;
      const docs = payload.resourceDocuments ?? [];
      if (docs.length === 0) return 5;
      const content = docs[0].content;
      if (content === "Mocked RAG context") return 10;
      return 120;
    };

    let compressionCallCount = 0;
    const compressionStrategy: ICompressionStrategy = async (_deps, _params, payload) => {
      compressionCallCount += 1;
      return [
        {
          id: payload.documents[0].id,
          content: payload.documents[0].content,
          sourceType: "document",
          originalIndex: 0,
          valueScore: 1,
          effectiveScore: 1,
        },
      ];
    };

    let emcasPayloadCaptured: unknown = undefined;
    const executeModelCallAndSave: Spy<BoundExecuteModelCallAndSaveFn> = spy(async (_p, payload) => {
      emcasPayloadCaptured = payload;
      return {
        contribution: buildDialecticContributionRow(),
        needsContinuation: false,
        stageRelationshipForStage: undefined,
        documentKey: undefined,
        fileType: FileType.HeaderContext,
        storageFileType: FileType.ModelContributionRawJson,
      };
    });
    const enqueueRenderJob: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));

    const baseDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave,
      enqueueRenderJob,
      countTokens,
    });
    const deps: PrepareModelJobDeps = {
      ...baseDeps,
      applyInputsRequiredScope,
    };

    const inputsRequired: InputRule[] = [
      { type: "document", slug: "thesis", required: true, document_key: FileType.business_case },
    ];
    const inputsRelevance: RelevanceRule[] = [
      { document_key: FileType.business_case, relevance: 0.8 },
    ];
    const sourceDocumentsFromArtifacts: SourceDocument[] = gatherResult.artifacts.map((artifact) => {
      const baseContribution = buildDialecticContributionRow();
      const { document_relationships: _ignoredRelationships, ...contributionWithoutRelationships } = baseContribution;
      return {
        ...contributionWithoutRelationships,
        id: artifact.id,
        content: artifact.content,
        document_key: artifact.document_key,
        stage_slug: artifact.stage_slug,
        type: artifact.type,
      };
    });
    const payload: PrepareModelJobPayload = {
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: sourceDocumentsFromArtifacts,
        currentUserPrompt: "integration prompt",
        source_prompt_resource_id: "source-prompt-resource-int",
      },
      compressionStrategy,
      inputsRequired,
      inputsRelevance,
    };

    const result = await prepareModelJob(deps, params, payload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(applyScopeCallCount, 1);
    assertEquals(compressionCallCount > 0, true);
    assertEquals(countTokensCallCount > 1, true);
    assertEquals(executeModelCallAndSave.calls.length, 1);
    assertEquals(enqueueRenderJob.calls.length, 1);

    assertEquals(isExecuteModelCallAndSavePayload(emcasPayloadCaptured), true);
    if (!isExecuteModelCallAndSavePayload(emcasPayloadCaptured)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const chatApiRequest: ChatApiRequest = emcasPayloadCaptured.chatApiRequest;
    assertExists(chatApiRequest.resourceDocuments);
    assertEquals(chatApiRequest.resourceDocuments?.length, 1);
    assertEquals(chatApiRequest.resourceDocuments?.[0].id, "int-doc-1");
    assertEquals(chatApiRequest.resourceDocuments?.[0].content, "Mocked RAG context");
  },
);

