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
import { isJson, isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { enqueueCompressJobs } from "./enqueueCompressJobs.ts";
import { isDialecticCompressJobPayload } from "./enqueueCompressJobs.guard.ts";
import {
  buildenqueueCompressJobsParams,
  buildenqueueCompressJobsPayload,
  buildenqueueCompressJobsVictim,
  buildDialecticCompressJobPayload,
} from "./enqueueCompressJobs.mock.ts";
import { buildDialecticJobRow } from "../../_shared/dialectic.mock.ts";
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

/**
 * Contract: given a contribution victim whose canonical final-artifact path already
 *   exists in dialectic_project_resources, enqueueCompressJobs returns createdCount 0
 *   and issues no insert, and the dedup select filters on the exact canonical path
 *   derived from the parentJob payload's identity fields.
 * Arrange: a mock Supabase client whose dialectic_project_resources select returns
 *   one existing row; a payload built from buildenqueueCompressJobsPayload with a
 *   contribution victim (documentKey business_case) and a parentJob carrying a
 *   DialecticCompressJobPayload with output_type success_metrics.
 * Act:     enqueueCompressJobs with real deps, params (dbClient only), and the payload.
 * Assert:  result is createdCount 0; insert callCount is 0; the eq filters on
 *   dialectic_project_resources match the canonical (storage_path, file_name) for
 *   the documentKey branch.
 * Boundary: real enqueueCompressJobs → real constructStoragePath; Supabase client mocked.
 * Mocked:   Supabase client — the test does not prove the real DB enforces uniqueness.
 */
Deno.test("enqueueCompressJobs integration: dedup existence query filters on the exact canonical final-artifact path for the documentKey branch",
  async () => {
    // Arrange
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
    const params: enqueueCompressJobsParams = buildenqueueCompressJobsParams({ dbClient });
    const parentJobPayload = buildDialecticCompressJobPayload({ output_type: FileType.success_metrics });
    if (!isJson(parentJobPayload)) throw new Error("test payload must be Json");
    const payload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "text",
        content: "compress me",
        sourceType: "contribution",
        documentKey: FileType.business_case,
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayload }),
      modelConfig: realModelConfig,
    });

    // Act
    const result = await enqueueCompressJobs(deps, params, payload);

    // Assert
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
      projectId: parentJobPayload.projectId,
      sessionId: parentJobPayload.sessionId,
      iteration: parentJobPayload.iterationNumber,
      stageSlug: parentJobPayload.stageSlug,
      output_type: parentJobPayload.output_type,
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

/**
 * Contract: given a history victim whose canonical final-artifact path already exists,
 *   enqueueCompressJobs returns createdCount 0 and issues no insert, and the dedup
 *   select filters on the exact canonical path for the sourceId/role branch.
 * Arrange: a mock Supabase client whose dialectic_project_resources select returns
 *   one existing row; a payload with a history victim (sourceId, role assistant) and
 *   a parentJob carrying a DialecticCompressJobPayload with output_type success_metrics.
 * Act:     enqueueCompressJobs with real deps, params (dbClient only), and the payload.
 * Assert:  result is createdCount 0; insert callCount is 0; the eq filters match the
 *   canonical (storage_path, file_name) for the sourceId branch.
 * Boundary: real enqueueCompressJobs → real constructStoragePath; Supabase client mocked.
 * Mocked:   Supabase client — the test does not prove the real DB enforces uniqueness.
 */
Deno.test("enqueueCompressJobs integration: dedup existence query filters on the exact canonical final-artifact path for the sourceId branch",
  async () => {
    // Arrange
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
    const params: enqueueCompressJobsParams = buildenqueueCompressJobsParams({ dbClient });
    const parentJobPayload = buildDialecticCompressJobPayload({ output_type: FileType.success_metrics });
    if (!isJson(parentJobPayload)) throw new Error("test payload must be Json");
    const payload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "text",
        content: "compress me",
        sourceType: "history",
        sourceId,
        role: "assistant",
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayload }),
      modelConfig: realModelConfig,
    });

    // Act
    const result = await enqueueCompressJobs(deps, params, payload);

    // Assert
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
      projectId: parentJobPayload.projectId,
      sessionId: parentJobPayload.sessionId,
      iteration: parentJobPayload.iterationNumber,
      stageSlug: parentJobPayload.stageSlug,
      output_type: parentJobPayload.output_type,
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

/**
 * Contract: given a feedback victim whose canonical final-artifact path already exists,
 *   enqueueCompressJobs returns createdCount 0 and issues no insert, and the dedup
 *   select filters on the exact canonical path for the feedback branch.
 * Arrange: a mock Supabase client whose dialectic_project_resources select returns
 *   one existing row; a payload with a feedback victim (documentKey business_case) and
 *   a parentJob carrying a DialecticCompressJobPayload with output_type success_metrics.
 * Act:     enqueueCompressJobs with real deps, params (dbClient only), and the payload.
 * Assert:  result is createdCount 0; insert callCount is 0; the eq filters match the
 *   canonical (storage_path, file_name) for the feedback branch.
 * Boundary: real enqueueCompressJobs → real constructStoragePath; Supabase client mocked.
 * Mocked:   Supabase client — the test does not prove the real DB enforces uniqueness.
 */
Deno.test("enqueueCompressJobs integration: dedup existence query filters on the exact canonical final-artifact path for the feedback branch",
  async () => {
    // Arrange
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
    const params: enqueueCompressJobsParams = buildenqueueCompressJobsParams({ dbClient });
    const parentJobPayload = buildDialecticCompressJobPayload({ output_type: FileType.success_metrics });
    if (!isJson(parentJobPayload)) throw new Error("test payload must be Json");
    const payload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "text",
        content: "compress me",
        sourceType: "feedback",
        documentKey: FileType.business_case,
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayload }),
      modelConfig: realModelConfig,
    });

    // Act
    const result = await enqueueCompressJobs(deps, params, payload);

    // Assert
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
      projectId: parentJobPayload.projectId,
      sessionId: parentJobPayload.sessionId,
      iteration: parentJobPayload.iterationNumber,
      stageSlug: parentJobPayload.stageSlug,
      output_type: parentJobPayload.output_type,
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

/**
 * Contract: given a contribution victim whose CHUNK-suffixed artifact exists but whose
 *   final-artifact path does not, enqueueCompressJobs proceeds to insert one COMPRESS
 *   row — the chunk path does not satisfy the final-artifact dedup check.
 * Arrange: a mock Supabase client whose select returns a row only when the file_name
 *   matches the chunk-suffixed path, and empty for any other; a payload with a
 *   contribution victim (documentKey business_case) and a parentJob carrying a
 *   DialecticCompressJobPayload with output_type success_metrics.
 * Act:     enqueueCompressJobs with real deps, params (dbClient only), and the payload.
 * Assert:  result is createdCount 1; insert callCount is 1.
 * Boundary: real enqueueCompressJobs → real constructStoragePath; Supabase client mocked.
 * Mocked:   Supabase client — the test does not prove the real DB enforces uniqueness.
 */
Deno.test("enqueueCompressJobs integration: a row existing only at the CHUNK path does not satisfy the final-artifact dedup check",
  async () => {
    // Arrange
    const documentKey = FileType.business_case;
    const output_type: ModelContributionFileTypes = FileType.success_metrics;

    const parentJobPayloadTemplate = buildDialecticCompressJobPayload({ output_type });
    if (!isJson(parentJobPayloadTemplate)) throw new Error("test payload must be Json");
    const chunkPath = constructStoragePath({
      fileType: FileType.CompressedContext,
      projectId: parentJobPayloadTemplate.projectId,
      sessionId: parentJobPayloadTemplate.sessionId,
      iteration: parentJobPayloadTemplate.iterationNumber,
      stageSlug: parentJobPayloadTemplate.stageSlug,
      output_type,
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
    const params: enqueueCompressJobsParams = buildenqueueCompressJobsParams({ dbClient });
    const payload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "text",
        content: "compress me",
        sourceType: "contribution",
        documentKey,
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayloadTemplate }),
      modelConfig: realModelConfig,
    });

    // Act
    const result = await enqueueCompressJobs(deps, params, payload);

    // Assert
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

/**
 * Contract: given content at the real-tokenizer budget, enqueueCompressJobs produces
 *   one child with mode preserved and no chunk fields; given content one word over,
 *   it splits into N > 1 text-mode chunks each carrying chunk_index and chunk_total.
 * Arrange: boundary contents grown until the real tokenizer crosses the budget; two
 *   payloads (under and over) with json-mode contribution victims and parentJobs
 *   carrying DialecticCompressJobPayloads.
 * Act:     enqueueCompressJobs with real deps, params (dbClient only), and each payload.
 * Assert:  under → createdCount 1, mode json, no chunk fields; over → createdCount > 1,
 *   every chunk mode text with sequential chunk_index and constant chunk_total.
 * Boundary: real enqueueCompressJobs → real countTokens → real tiktoken; real
 *   LangchainTextSplitter; Supabase client mocked.
 * Mocked:   Supabase client — the test does not prove the real DB persists rows.
 */
Deno.test("enqueueCompressJobs integration: content at the real-tokenizer budget produces one child with mode preserved; content just over splits into text chunks",
  async () => {
    // Arrange
    const { justUnder, justOver } = buildBoundaryContents();

    // Pin the arithmetic: the flip happens exactly at
    // provider_max_input_tokens - 500 - 32, measured by the real tokenizer.
    assert(realTokenCount(justUnder) <= TOKEN_BUDGET);
    assert(realTokenCount(justOver) > TOKEN_BUDGET);

    const parentJobPayloadUnder = buildDialecticCompressJobPayload({
      output_type: FileType.business_case,
    });
    if (!isJson(parentJobPayloadUnder)) throw new Error("test payload must be Json");
    const underPayload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "json",
        sourceType: "contribution",
        documentKey: FileType.business_case,
        docType: FileType.business_case,
        sourceStageSlug: DialecticStageSlug.Thesis,
        content: justUnder,
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayloadUnder }),
      modelConfig: realModelConfig,
    });

    const parentJobPayloadOver = buildDialecticCompressJobPayload({
      output_type: FileType.business_case,
    });
    if (!isJson(parentJobPayloadOver)) throw new Error("test payload must be Json");
    const overPayload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "json",
        sourceType: "contribution",
        documentKey: FileType.business_case,
        docType: FileType.business_case,
        sourceStageSlug: DialecticStageSlug.Thesis,
        content: justOver,
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayloadOver }),
      modelConfig: realModelConfig,
    });

    // Act — Run A: fits exactly -> ONE child, json mode preserved, no chunk fields.
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
      buildenqueueCompressJobsParams({
        dbClient: underSetup.client as unknown as SupabaseClient<Database>,
      }),
      underPayload,
    );

    // Assert — under
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

    // Act — Run B: one word over -> N > 1 chunk children, every one forced to text mode.
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
      buildenqueueCompressJobsParams({
        dbClient: overSetup.client as unknown as SupabaseClient<Database>,
      }),
      overPayload,
    );

    // Assert — over
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

/**
 * Contract: given content just over the real-tokenizer budget, the real splitter's
 *   chunk payloads cover the source in order with no dropped span — every chunk is a
 *   substring of the source, chunks appear in source order, adjacent chunks overlap
 *   or touch, and the chunks span the source end to end.
 * Arrange: boundary content grown until the real tokenizer crosses the budget; a
 *   payload with a text-mode contribution victim and a parentJob carrying a
 *   DialecticCompressJobPayload.
 * Act:     enqueueCompressJobs with real deps, params (dbClient only), and the payload.
 * Assert:  createdCount > 1; every chunk is a non-empty substring of the source;
 *   chunks appear in source order; no gap between adjacent chunks; first chunk starts
 *   at source index 0; last chunk ends at source length.
 * Boundary: real enqueueCompressJobs → real countTokens → real tiktoken; real
 *   LangchainTextSplitter; Supabase client mocked.
 * Mocked:   Supabase client — the test does not prove the real DB persists rows.
 */
Deno.test("enqueueCompressJobs integration: real-splitter chunk payloads cover the source in order with no dropped span",
  async () => {
    // Arrange
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
    const parentJobPayload = buildDialecticCompressJobPayload({
      output_type: FileType.business_case,
    });
    if (!isJson(parentJobPayload)) throw new Error("test payload must be Json");
    const payload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "text",
        content: justOver,
        sourceType: "contribution",
        documentKey: FileType.business_case,
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayload }),
      modelConfig: realModelConfig,
    });

    // Act
    const result = await enqueueCompressJobs(
      buildRealDeps(),
      buildenqueueCompressJobsParams({
        dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
      }),
      payload,
    );

    // Assert
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

/**
 * Contract: given a resource victim that fits the budget, the inserted COMPRESS row
 *   carries every downstream identity field the trigger, worker, and saveResponse
 *   depend on — row columns from parentJob, payload fields from parentJob.payload,
 *   and neither job_type nor user_id in the payload.
 * Arrange: a mock Supabase client whose select and insert return empty success; a
 *   payload with a resource victim (documentKey business_case) and a parentJob
 *   carrying a DialecticCompressJobPayload.
 * Act:     enqueueCompressJobs with real deps, params (dbClient only), and the payload.
 * Assert:  result is createdCount 1; the inserted row carries job_type COMPRESS,
 *   parent_job_id, user_id, is_test_job, session_id, stage_slug, iteration_number,
 *   status pending, and a non-empty idempotency_key; the payload passes
 *   isDialecticCompressJobPayload and carries model_id, walletId, user_jwt,
 *   idempotencyKey matching the row's idempotency_key, sessionId, projectId,
 *   stageSlug, output_type, iterationNumber — and neither job_type nor user_id.
 * Boundary: real enqueueCompressJobs → real constructStoragePath → real countTokens;
 *   Supabase client mocked.
 * Mocked:   Supabase client — the test does not prove the real DB persists rows.
 */
Deno.test("enqueueCompressJobs integration: inserted rows carry the downstream identity fields the trigger, worker, and saveResponse depend on",
  async () => {
    // Arrange
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
    const params: enqueueCompressJobsParams = buildenqueueCompressJobsParams({ dbClient });
    const parentJobPayload = buildDialecticCompressJobPayload();
    if (!isJson(parentJobPayload)) throw new Error("test payload must be Json");
    const payload: enqueueCompressJobsPayload = buildenqueueCompressJobsPayload({
      victim: buildenqueueCompressJobsVictim({
        mode: "text",
        content: "compress me",
        sourceType: "resource",
        documentKey: FileType.business_case,
      }),
      parentJob: buildDialecticJobRow({ payload: parentJobPayload }),
      modelConfig: realModelConfig,
    });

    // Act
    const result = await enqueueCompressJobs(deps, params, payload);

    // Assert
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
    assertEquals(row.parent_job_id, payload.parentJob.id);
    assertEquals(row.user_id, payload.parentJob.user_id);
    assertEquals(row.is_test_job, payload.parentJob.is_test_job);
    assertEquals(row.session_id, payload.parentJob.session_id);
    assertEquals(row.stage_slug, payload.parentJob.stage_slug);
    assertEquals(row.iteration_number, payload.parentJob.iteration_number);
    assertEquals(row.status, "pending");
    assert(
      typeof row.idempotency_key === "string" && row.idempotency_key !== "",
    );

    assert(
      isDialecticCompressJobPayload(row.payload),
      "fitting text child payload must pass isDialecticCompressJobPayload",
    );
    assertEquals(row.payload.model_id, parentJobPayload.model_id);
    assertEquals(row.payload.walletId, parentJobPayload.walletId);
    assertEquals(row.payload.user_jwt, parentJobPayload.user_jwt);
    assertEquals(row.payload.idempotencyKey, row.idempotency_key);
    assertEquals("job_type" in row.payload, false);
    assertEquals(row.payload.sessionId, parentJobPayload.sessionId);
    assertEquals(row.payload.projectId, parentJobPayload.projectId);
    assertEquals(row.payload.stageSlug, parentJobPayload.stageSlug);
    assertEquals(row.payload.output_type, parentJobPayload.output_type);
    assertEquals(row.payload.iterationNumber, parentJobPayload.iterationNumber);
  },
);
