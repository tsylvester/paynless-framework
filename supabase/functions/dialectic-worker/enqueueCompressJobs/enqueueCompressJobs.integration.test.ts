import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getEncoding } from "npm:js-tiktoken@1.0.7";
import { countTokens as countTokensAnthropicLib } from "npm:@anthropic-ai/tokenizer@0.0.4";
import type { Database } from "../../types_db.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import {
  createMockSupabaseClient,
  type MockQueryBuilderState,
} from "../../_shared/supabase.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { MOCK_MODEL_CONFIG } from "../../_shared/_integration.test.utils.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { LangchainTextSplitter } from "../../_shared/utils/text_splitter.ts";
import {
  constructStoragePath,
  sanitizeForPath,
} from "../../_shared/utils/path_constructor.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";
import type { ModelContributionFileTypes } from "../../_shared/types/file_manager.types.ts";
import { isKnownTiktokenEncoding } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { enqueueCompressJobs } from "./enqueueCompressJobs.ts";
import { isDialecticCompressJobPayload } from "./enqueueCompressJobs.guard.ts";
import { buildenqueueCompressJobsParams } from "./enqueueCompressJobs.mock.ts";
import type {
  enqueueCompressJobsDeps,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
} from "./enqueueCompressJobs.interface.ts";

// Bounded subsystem: real enqueueCompressJobs, real constructStoragePath, real
// LangchainTextSplitter, real countTokens over a real tiktoken encoding; only the
// Supabase client is mocked (external boundary).

const PROVIDER_MAX_INPUT_TOKENS = 1000;
// The implementation's documented reserves: 500 template overhead + 32 safety buffer.
const TOKEN_BUDGET = PROVIDER_MAX_INPUT_TOKENS - 500 - 32;

const realModelConfig: AiModelExtendedConfig = {
  ...MOCK_MODEL_CONFIG,
  provider_max_input_tokens: PROVIDER_MAX_INPUT_TOKENS,
  tokenization_strategy: {
    type: "tiktoken",
    tiktoken_encoding_name: "cl100k_base",
  },
};

function buildRealTokenizerDeps(): CountTokensDeps {
  return {
    getEncoding: (encodingName: string) => {
      if (!isKnownTiktokenEncoding(encodingName)) {
        throw new Error(`Unknown tiktoken encoding: ${encodingName}`);
      }
      return getEncoding(encodingName);
    },
    countTokensAnthropic: (text: string) => countTokensAnthropicLib(text),
    logger: new MockLogger(),
  };
}

function buildRealDeps(): enqueueCompressJobsDeps {
  return {
    logger: new MockLogger(),
    textSplitter: new LangchainTextSplitter(),
    countTokens,
    constructStoragePath,
  };
}

function buildRealParams(
  dbClient: SupabaseClient<Database>,
  overrides?: { targetKey?: ModelContributionFileTypes },
): enqueueCompressJobsParams {
  return buildenqueueCompressJobsParams({
    dbClient,
    ...(overrides?.targetKey !== undefined ? { targetKey: overrides.targetKey } : {}),
    modelConfig: realModelConfig,
    tokenizerDeps: buildRealTokenizerDeps(),
  });
}

function realTokenCount(content: string): number {
  return countTokens(
    buildRealTokenizerDeps(),
    { message: content },
    realModelConfig,
  );
}

// Grow a stream of UNIQUE words until the real tokenizer crosses the budget.
// justUnder is the last content that fits; justOver is the first that exceeds.
// Unique words let the chunk-coverage test locate each chunk unambiguously.
function buildBoundaryContents(): { justUnder: string; justOver: string } {
  let index = 1;
  let content = `word${index}`;
  let previous = content;
  while (realTokenCount(content) <= TOKEN_BUDGET) {
    previous = content;
    index += 1;
    content = `${content} word${index}`;
  }
  return { justUnder: previous, justOver: content };
}

Deno.test("enqueueCompressJobs integration: dedup existence query filters on the exact canonical final-artifact path for the documentKey branch",
  async () => {
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [{ id: "existing-artifact" }], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildRealDeps();
    const params = buildRealParams(dbClient, { targetKey: FileType.success_metrics });
    const payload: enqueueCompressJobsPayload = {
      victim: {
        mode: "text",
        content: "compress me",
        sourceType: "contribution",
        documentKey: FileType.business_case,
      },
    };

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 0);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);

    const expectedPath = constructStoragePath({
      fileType: FileType.CompressedContext,
      projectId: params.projectId,
      sessionId: params.sessionId,
      iteration: params.iterationNumber,
      stageSlug: params.stageSlug,
      targetKey: params.targetKey,
      sourceType: payload.victim.sourceType,
      documentKey: payload.victim.documentKey,
    });
    assert(expectedPath.storagePath.endsWith("/_work"));
    assertEquals(
      expectedPath.fileName,
      `${sanitizeForPath("business_case")}_compressed_for_${
        sanitizeForPath("success_metrics")
      }.md`,
    );

    const eqCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_project_resources",
      "eq",
    );
    assertExists(eqCalls);
    assertEquals(eqCalls.callsArgs, [
      ["storage_path", expectedPath.storagePath],
      ["file_name", expectedPath.fileName],
    ]);
  },
);

Deno.test("enqueueCompressJobs integration: dedup existence query filters on the exact canonical final-artifact path for the sourceId branch",
  async () => {
    const sourceId = "3f7a1c2e-9d4b-4a6f-8e15-0b2c7d9e4f61";
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [{ id: "existing-artifact" }], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildRealDeps();
    const params = buildRealParams(dbClient, { targetKey: FileType.success_metrics });
    const payload: enqueueCompressJobsPayload = {
      victim: {
        mode: "text",
        content: "compress me",
        sourceType: "history",
        sourceId,
        role: "assistant",
      },
    };

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 0);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);

    const expectedPath = constructStoragePath({
      fileType: FileType.CompressedContext,
      projectId: params.projectId,
      sessionId: params.sessionId,
      iteration: params.iterationNumber,
      stageSlug: params.stageSlug,
      targetKey: params.targetKey,
      sourceType: payload.victim.sourceType,
      sourceId,
      role: "assistant",
    });
    assert(expectedPath.storagePath.endsWith("/_work"));
    assertEquals(
      expectedPath.fileName,
      `message_assistant_${sourceId}_compressed_for_${
        sanitizeForPath("success_metrics")
      }.md`,
    );

    const eqCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_project_resources",
      "eq",
    );
    assertExists(eqCalls);
    assertEquals(eqCalls.callsArgs, [
      ["storage_path", expectedPath.storagePath],
      ["file_name", expectedPath.fileName],
    ]);
  },
);

Deno.test("enqueueCompressJobs integration: dedup existence query filters on the exact canonical final-artifact path for the feedback branch",
  async () => {
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [{ id: "existing-artifact" }], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildRealDeps();
    const params = buildRealParams(dbClient, { targetKey: FileType.success_metrics });
    const payload: enqueueCompressJobsPayload = {
      victim: {
        mode: "text",
        content: "compress me",
        sourceType: "feedback",
        documentKey: FileType.business_case,
      },
    };

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 0);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);

    const expectedPath = constructStoragePath({
      fileType: FileType.CompressedContext,
      projectId: params.projectId,
      sessionId: params.sessionId,
      iteration: params.iterationNumber,
      stageSlug: params.stageSlug,
      targetKey: params.targetKey,
      sourceType: payload.victim.sourceType,
      documentKey: payload.victim.documentKey,
    });
    assert(expectedPath.storagePath.endsWith("/_work"));
    assertEquals(
      expectedPath.fileName,
      `${sanitizeForPath("business_case")}_feedback_compressed_for_${
        sanitizeForPath("success_metrics")
      }.md`,
    );

    const eqCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_project_resources",
      "eq",
    );
    assertExists(eqCalls);
    assertEquals(eqCalls.callsArgs, [
      ["storage_path", expectedPath.storagePath],
      ["file_name", expectedPath.fileName],
    ]);
  },
);

Deno.test("enqueueCompressJobs integration: a row existing only at the CHUNK path does not satisfy the final-artifact dedup check",
  async () => {
    const documentKey = FileType.business_case;
    const targetKey = FileType.success_metrics;

    const paramsTemplate = buildenqueueCompressJobsParams();
    const chunkPath = constructStoragePath({
      fileType: FileType.CompressedContext,
      projectId: paramsTemplate.projectId,
      sessionId: paramsTemplate.sessionId,
      iteration: paramsTemplate.iterationNumber,
      stageSlug: paramsTemplate.stageSlug,
      targetKey,
      sourceType: "contribution",
      documentKey,
      chunkIndex: 1,
      chunkTotal: 2,
    });

    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: (state: MockQueryBuilderState) => {
            // The simulated DB holds ONLY the chunk-suffixed artifact for this
            // identity; a query for any other (storage_path, file_name) finds nothing.
            const fileNameFilter = state.filters.find(
              (f) => f.type === "eq" && f.column === "file_name",
            );
            if (fileNameFilter && fileNameFilter.value === chunkPath.fileName) {
              return Promise.resolve({
                data: [{ id: "chunk-artifact" }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildRealDeps();
    const params = buildRealParams(dbClient, { targetKey: FileType.success_metrics });
    const payload: enqueueCompressJobsPayload = {
      victim: {
        mode: "text",
        content: "compress me",
        sourceType: "contribution",
        documentKey,
      },
    };

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
  },
);

Deno.test("enqueueCompressJobs integration: content at the real-tokenizer budget produces one child with mode preserved; content just over splits into text chunks",
  async () => {
    const { justUnder, justOver } = buildBoundaryContents();

    // Pin the arithmetic: the flip happens exactly at
    // provider_max_input_tokens - 500 - 32, measured by the real tokenizer.
    assert(realTokenCount(justUnder) <= TOKEN_BUDGET);
    assert(realTokenCount(justOver) > TOKEN_BUDGET);

    const underPayload: enqueueCompressJobsPayload = {
      victim: {
        mode: "json",
        sourceType: "contribution",
        documentKey: FileType.business_case,
        docType: FileType.business_case,
        sourceStageSlug: DialecticStageSlug.Thesis,
        content: justUnder,
      },
    };

    const overPayload: enqueueCompressJobsPayload = {
      victim: {
        mode: "json",
        sourceType: "contribution",
        documentKey: FileType.business_case,
        docType: FileType.business_case,
        sourceStageSlug: DialecticStageSlug.Thesis,
        content: justOver,
      },
    };

    // Run A: fits exactly -> ONE child, json mode preserved, no chunk fields.
    const underSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const underResult = await enqueueCompressJobs(
      buildRealDeps(),
      buildRealParams(
        underSetup.client as unknown as SupabaseClient<Database>,
      ),
      underPayload,
    );

    assertEquals("createdCount" in underResult, true);
    if ("createdCount" in underResult) {
      assertEquals(underResult.createdCount, 1);
    }

    const underInsertCalls = underSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(underInsertCalls);
    assertEquals(underInsertCalls.callCount, 1);
    assertExists(underInsertCalls.callsArgs[0]);
    const underRows = underInsertCalls.callsArgs[0][0];
    assert(Array.isArray(underRows));
    assertEquals(underRows.length, 1);
    const underRow = underRows[0];
    assert(isRecord(underRow));
    assert(
      isDialecticCompressJobPayload(underRow.payload),
      "fitting json child payload must pass isDialecticCompressJobPayload",
    );
    assertEquals(underRow.payload.mode, "json");
    assertEquals(underRow.payload.content, justUnder);
    assertEquals(underRow.payload.chunk_index, undefined);
    assertEquals(underRow.payload.chunk_total, undefined);

    // Run B: one word over -> N > 1 chunk children, every one forced to text mode.
    const overSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const overResult = await enqueueCompressJobs(
      buildRealDeps(),
      buildRealParams(
        overSetup.client as unknown as SupabaseClient<Database>,
      ),
      overPayload,
    );

    assertEquals("createdCount" in overResult, true);
    if (!("createdCount" in overResult)) {
      return;
    }
    assert(
      overResult.createdCount > 1,
      `expected the real splitter to produce multiple chunks, got ${overResult.createdCount}`,
    );

    const overInsertCalls = overSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(overInsertCalls);
    assertEquals(overInsertCalls.callCount, 1);
    assertExists(overInsertCalls.callsArgs[0]);
    const overRows = overInsertCalls.callsArgs[0][0];
    assert(Array.isArray(overRows));
    assertEquals(overRows.length, overResult.createdCount);

    for (let i = 0; i < overRows.length; i += 1) {
      const row = overRows[i];
      assert(isRecord(row));
      assert(
        isDialecticCompressJobPayload(row.payload),
        `chunk child ${i + 1} payload must pass isDialecticCompressJobPayload`,
      );
      assertEquals(row.payload.mode, "text");
      assertEquals(row.payload.chunk_index, i + 1);
      assertEquals(row.payload.chunk_total, overRows.length);
      assertEquals(row.payload.sourceType, "contribution");
      assertEquals(row.payload.documentKey, "business_case");
    }
  },
);

Deno.test("enqueueCompressJobs integration: real-splitter chunk payloads cover the source in order with no dropped span",
  async () => {
    const { justOver } = buildBoundaryContents();

    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const result = await enqueueCompressJobs(
      buildRealDeps(),
      buildRealParams(
        mockSetup.client as unknown as SupabaseClient<Database>,
      ),
      {
        victim: {
          mode: "text",
          content: justOver,
          sourceType: "contribution",
          documentKey: FileType.business_case,
        },
      },
    );

    assertEquals("createdCount" in result, true);
    if (!("createdCount" in result)) {
      return;
    }
    assert(result.createdCount > 1);

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertExists(insertCalls.callsArgs[0]);
    const rows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(rows));

    // Collect chunk contents in chunk_index order.
    const chunkContents: string[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      assert(isRecord(row));
      assert(isDialecticCompressJobPayload(row.payload));
      assertEquals(row.payload.chunk_index, i + 1);
      assertEquals(row.payload.chunk_total, rows.length);
      chunkContents.push(row.payload.content);
    }

    // Every chunk is a non-empty substring of the source (unique words make each
    // chunk's position unambiguous); chunks appear in source order; adjacent
    // chunks overlap or touch (at most one separator character dropped between
    // them, per the real splitter's trimming) — so no span of the source is
    // absent from all chunks; and the chunks span the source end to end.
    let previousStart = -1;
    let previousEnd = 0;
    for (const chunk of chunkContents) {
      assert(chunk.length > 0, "chunk content must be non-empty");
      const start = justOver.indexOf(chunk);
      assert(start >= 0, "chunk content must be a substring of the source");
      assert(start > previousStart, "chunks must appear in source order");
      assert(
        start <= previousEnd + 1,
        `gap in source coverage: chunk starts at ${start} but previous chunk ended at ${previousEnd}`,
      );
      previousStart = start;
      previousEnd = start + chunk.length;
    }
    assertEquals(justOver.indexOf(chunkContents[0]), 0);
    assertEquals(previousEnd, justOver.length);
  },
);

Deno.test("enqueueCompressJobs integration: inserted rows carry the downstream identity fields the trigger, worker, and saveResponse depend on",
  async () => {
    const mockSetup = createMockSupabaseClient("user-789", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildRealDeps();
    const params = buildRealParams(dbClient);
    const payload: enqueueCompressJobsPayload = {
      victim: {
        mode: "text",
        content: "compress me",
        sourceType: "resource",
        documentKey: FileType.business_case,
      },
    };

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertExists(insertCalls.callsArgs[0]);
    const rows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(rows));
    assertEquals(rows.length, 1);
    const row = rows[0];
    assert(isRecord(row));

    assertEquals(row.job_type, "COMPRESS");
    assertEquals(row.parent_job_id, params.parentJob.id);
    assertEquals(row.user_id, params.parentJob.user_id);
    assertEquals(row.is_test_job, params.parentJob.is_test_job);
    assertEquals(row.session_id, params.sessionId);
    assertEquals(row.stage_slug, params.stageSlug);
    assertEquals(row.iteration_number, params.iterationNumber);
    assertEquals(row.status, "pending");
    assert(
      typeof row.idempotency_key === "string" && row.idempotency_key !== "",
    );

    assert(
      isDialecticCompressJobPayload(row.payload),
      "fitting text child payload must pass isDialecticCompressJobPayload",
    );
    assertEquals(row.payload.model_id, params.modelId);
    assertEquals(row.payload.walletId, params.walletId);
    assertEquals(row.payload.user_id, params.parentJob.user_id);
    assertEquals(row.payload.sessionId, params.sessionId);
    assertEquals(row.payload.projectId, params.projectId);
    assertEquals(row.payload.stageSlug, params.stageSlug);
    assertEquals(row.payload.targetKey, params.targetKey);
    assertEquals(row.payload.iterationNumber, params.iterationNumber);
  },
);
