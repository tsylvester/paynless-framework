import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FileType,
  DialecticStageSlug,
} from "../../_shared/types/file_manager.types.ts";
import {
  CompressJobEnqueueError,
  CompressJobValidationError,
  BoundenqueueCompressJobsFn,
  DialecticCompressJobPayload,
  enqueueCompressJobsDeps,
  enqueueCompressJobsErrorReturn,
  enqueueCompressJobsFn,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsReturn,
  enqueueCompressJobsSuccessReturn,
} from "./enqueueCompressJobs.interface.ts";

Deno.test("Contract: enqueueCompressJobsDeps declares four dependency keys", () => {
  const surface: Record<keyof enqueueCompressJobsDeps, true> = {
    logger: true,
    textSplitter: true,
    countTokens: true,
    constructStoragePath: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

Deno.test("Contract: enqueueCompressJobsParams declares 12 fields", () => {
  const surface: Record<keyof enqueueCompressJobsParams, true> = {
    dbClient: true,
    parentJob: true,
    sessionId: true,
    projectId: true,
    stageSlug: true,
    targetKey: true,
    iterationNumber: true,
    modelId: true,
    modelSlug: true,
    walletId: true,
    modelConfig: true,
    tokenizerDeps: true,
  };
  assertEquals(Object.keys(surface).length, 12);
});

Deno.test("Contract: enqueueCompressJobsPayload literal type-checks with enum members", () => {
  const mode: enqueueCompressJobsPayload["victim"]["mode"] = "json";
  const sourceType: enqueueCompressJobsPayload["victim"]["sourceType"] = "contribution";
  const payload: enqueueCompressJobsPayload = {
    victim: {
      mode,
      content: "some content",
      sourceType,
      documentKey: FileType.business_case,
      docType: FileType.business_case,
      sourceStageSlug: DialecticStageSlug.Thesis,
    },
  };
  assertEquals(payload.victim.mode, "json");
  assertEquals(payload.victim.sourceType, "contribution");
  assertEquals(payload.victim.content, "some content");
  assertEquals(payload.victim.documentKey, FileType.business_case);
  assertEquals(payload.victim.docType, FileType.business_case);
  assertEquals(payload.victim.sourceStageSlug, DialecticStageSlug.Thesis);
});

Deno.test("Contract: enqueueCompressJobsPayload victim carries role for history", () => {
  const role: enqueueCompressJobsPayload["victim"]["role"] = "assistant";
  const payload: enqueueCompressJobsPayload = {
    victim: {
      mode: "text",
      content: "some content",
      sourceType: "history",
      sourceId: "history-1",
      role,
    },
  };
  assertEquals(payload.victim.role, "assistant");
});

Deno.test("Contract: DialecticCompressJobPayload carries role for history", () => {
  const payload: DialecticCompressJobPayload = {
    job_type: "COMPRESS",
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    iterationNumber: 1,
    model_id: "model-1",
    model_slug: "gpt-4o",
    mode: "text",
    content: "some content",
    sourceType: "history",
    sourceId: "history-1",
    role: "user",
    walletId: "wallet-1",
    user_id: "user-1",
  };
  assertEquals(payload.role, "user");
});

Deno.test("Contract: DialecticCompressJobPayload continuation_count is optional", () => {
  const withContinuation: DialecticCompressJobPayload = {
    job_type: "COMPRESS",
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    iterationNumber: 1,
    model_id: "model-1",
    model_slug: "gpt-4o",
    mode: "text",
    content: "some content",
    sourceType: "contribution",
    documentKey: FileType.business_case,
    walletId: "wallet-1",
    user_id: "user-1",
    continuation_count: 1,
  };
  assertEquals(withContinuation.continuation_count, 1);

  const withoutContinuation: DialecticCompressJobPayload = {
    job_type: "COMPRESS",
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    iterationNumber: 1,
    model_id: "model-1",
    model_slug: "gpt-4o",
    mode: "text",
    content: "some content",
    sourceType: "contribution",
    documentKey: FileType.business_case,
    walletId: "wallet-1",
    user_id: "user-1",
  };
  assertEquals(withoutContinuation.continuation_count, undefined);
});

Deno.test("Contract: DialecticCompressJobPayload model_slug is required", () => {
  const payload: DialecticCompressJobPayload = {
    job_type: "COMPRESS",
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    iterationNumber: 1,
    model_id: "model-1",
    model_slug: "gpt-4o",
    mode: "text",
    content: "some content",
    sourceType: "contribution",
    documentKey: FileType.business_case,
    walletId: "wallet-1",
    user_id: "user-1",
  };
  assertEquals(payload.model_slug, "gpt-4o");
});

Deno.test("Contract: enqueueCompressJobsSuccessReturn and ErrorReturn form a union", () => {
  const success: enqueueCompressJobsSuccessReturn = { createdCount: 2 };
  const errorReturn: enqueueCompressJobsErrorReturn = {
    error: new CompressJobValidationError("validation failed"),
    retriable: false,
  };
  const enqueueErrorReturn: enqueueCompressJobsErrorReturn = {
    error: new CompressJobEnqueueError("enqueue failed"),
    retriable: true,
  };
  const result1: enqueueCompressJobsReturn = success;
  const result2: enqueueCompressJobsReturn = errorReturn;
  const result3: enqueueCompressJobsReturn = enqueueErrorReturn;
  assertEquals("createdCount" in result1, true);
  assertEquals("error" in result2, true);
  assertEquals("error" in result3, true);
});

Deno.test("Contract: enqueueCompressJobsFn and BoundenqueueCompressJobsFn signatures", () => {
  const fn: enqueueCompressJobsFn = async () => ({ createdCount: 0 });
  const bound: BoundenqueueCompressJobsFn = async () => ({ createdCount: 0 });
  assertEquals(typeof fn, "function");
  assertEquals(typeof bound, "function");
});
