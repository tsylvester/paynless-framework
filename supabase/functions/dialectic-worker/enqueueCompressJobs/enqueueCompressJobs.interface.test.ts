import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FileType,
  DialecticStageSlug,
} from "../../_shared/types/file_manager.types.ts";
import {
  CompressJobEnqueueError,
  CompressJobValidationError,
  BoundenqueueCompressJobsFn,
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

Deno.test("Contract: enqueueCompressJobsParams declares 11 fields", () => {
  const surface: Record<keyof enqueueCompressJobsParams, true> = {
    dbClient: true,
    parentJob: true,
    sessionId: true,
    projectId: true,
    stageSlug: true,
    targetKey: true,
    iterationNumber: true,
    modelId: true,
    walletId: true,
    modelConfig: true,
    tokenizerDeps: true,
  };
  assertEquals(Object.keys(surface).length, 11);
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
