import { assertEquals } from "jsr:@std/assert";
import type {
  BoundMergeChunkContentFn,
  DownloadedChunkText,
  MergeChunkContentDeps,
  MergeChunkContentErrorReturn,
  MergeChunkContentFn,
  MergeChunkContentParams,
  MergeChunkContentPayload,
  MergeChunkContentReturn,
  MergeChunkContentSuccessReturn,
} from "./mergeChunkContent.interface.ts";
import type { DialecticContributionRow } from "../../../../dialectic-service/dialectic.interface.ts";

Deno.test(
  "MergeChunkContentDeps exposes sanitizeJsonContent for dependency injection",
  () => {
    const depsSurface: Record<keyof MergeChunkContentDeps, true> = {
      downloadFromStorage: true,
      logger: true,
      sanitizeJsonContent: true,
    };

    assertEquals("sanitizeJsonContent" in depsSurface, true);
  },
);

Deno.test("MergeChunkContentParams has the expected shape", () => {
  const paramsSurface: Record<keyof MergeChunkContentParams, true> = {
    dbClient: true,
  };

  assertEquals("dbClient" in paramsSurface, true);
  assertEquals(Object.keys(paramsSurface).length, 1);
});

Deno.test(
  "MergeChunkContentPayload has the expected shape",
  () => {
    const now = new Date().toISOString();
    const contribution: DialecticContributionRow = {
      id: "contribution-id-1",
      session_id: "session_abc",
      stage: "THESIS",
      iteration_number: 1,
      model_id: null,
      model_name: null,
      storage_bucket: "content",
      storage_path: "proj_x/session_s/iteration_1/thesis/documents",
      file_name: "mock-model_0_business_case_raw.json",
      raw_response_storage_path:
        "proj_x/session_s/iteration_1/thesis/documents/mock-model_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: "root-id-1" },
      created_at: now,
      updated_at: now,
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: null,
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
    };

    const payload: MergeChunkContentPayload = {
      orderedChunks: [contribution],
    };

    assertEquals("orderedChunks" in payload, true);
    assertEquals(Array.isArray(payload.orderedChunks), true);
    assertEquals(payload.orderedChunks.length, 1);
    assertEquals(payload.orderedChunks[0].id, "contribution-id-1");
  },
);

Deno.test(
  "MergeChunkContentSuccessReturn and MergeChunkContentErrorReturn never co-occur",
  () => {
    const success: MergeChunkContentSuccessReturn = {
      mergedStructuredData: {},
    };
    const errorReturn: MergeChunkContentErrorReturn = {
      error: new Error("merge failed"),
      retriable: false,
    };

    const result1: MergeChunkContentReturn = success;
    const result2: MergeChunkContentReturn = errorReturn;

    assertEquals("mergedStructuredData" in success, true);
    assertEquals("error" in success, false);
    assertEquals("error" in errorReturn, true);
    assertEquals("retriable" in errorReturn, true);
    assertEquals("mergedStructuredData" in errorReturn, false);
    assertEquals("mergedStructuredData" in result1, true);
    assertEquals("error" in result2, true);
  },
);

Deno.test("MergeChunkContentFn and BoundMergeChunkContentFn signatures", () => {
  const fn: MergeChunkContentFn = async () => ({
    mergedStructuredData: {},
  });
  const bound: BoundMergeChunkContentFn = async () => ({
    mergedStructuredData: {},
  });

  assertEquals(typeof fn, "function");
  assertEquals(typeof bound, "function");
});

Deno.test("DownloadedChunkText has the expected shape", () => {
  const downloadedChunk: DownloadedChunkText = {
    chunkId: "chunk-1",
    text: "raw json text",
    rawJsonPath: "path/to/file.json",
  };

  assertEquals(downloadedChunk.chunkId, "chunk-1");
  assertEquals(downloadedChunk.text, "raw json text");
  assertEquals(downloadedChunk.rawJsonPath, "path/to/file.json");
});
