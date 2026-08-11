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
import type { DialecticBaseJobPayload } from "../../dialectic-service/dialectic.interface.ts";

Deno.test("Contract: enqueueCompressJobsDeps declares four dependency keys", () => {
  const surface: Record<keyof enqueueCompressJobsDeps, true> = {
    logger: true,
    textSplitter: true,
    countTokens: true,
    constructStoragePath: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

Deno.test("Contract: enqueueCompressJobsParams declares 13 fields", () => {
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
    userJwt: true,
    walletId: true,
    modelConfig: true,
    tokenizerDeps: true,
  };
  assertEquals(Object.keys(surface).length, 13);
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

Deno.test("Contract: DialecticCompressJobPayload carries role for history, with user_jwt and idempotencyKey inherited and no job_type or user_id", () => {
  const payload: DialecticCompressJobPayload = {
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
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
  };
  assertEquals(payload.role, "user");
  assertEquals(payload.user_jwt, "jwt-1");
  assertEquals(payload.idempotencyKey, "idem-1");
});

Deno.test("Contract: DialecticCompressJobPayload continuation_count is optional, with user_jwt and idempotencyKey inherited and no job_type or user_id", () => {
  const withContinuation: DialecticCompressJobPayload = {
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
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
    continuation_count: 1,
  };
  assertEquals(withContinuation.continuation_count, 1);

  const withoutContinuation: DialecticCompressJobPayload = {
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
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
  };
  assertEquals(withoutContinuation.continuation_count, undefined);
});

Deno.test("Contract: DialecticCompressJobPayload model_slug is required, with user_jwt and idempotencyKey inherited and no job_type or user_id", () => {
  const payload: DialecticCompressJobPayload = {
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
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
  };
  assertEquals(payload.model_slug, "gpt-4o");
});

Deno.test("Contract: DialecticCompressJobPayload is a member of DialecticBaseJobPayload", () => {
  const payload: DialecticCompressJobPayload = {
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
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
  };
  const base: DialecticBaseJobPayload = payload;
  assertEquals(base, payload);
});

Deno.test("Contract: source_prompt_resource_id is an optional member of DialecticBaseJobPayload", () => {
  const withId: DialecticBaseJobPayload = {
    sessionId: "session-1",
    projectId: "project-1",
    walletId: "wallet-1",
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
    model_id: "model-1",
    source_prompt_resource_id: "resource-1",
  };
  const withoutId: DialecticBaseJobPayload = {
    sessionId: "session-1",
    projectId: "project-1",
    walletId: "wallet-1",
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
    model_id: "model-1",
  };
  assertEquals(withId.source_prompt_resource_id, "resource-1");
  assertEquals(withoutId.source_prompt_resource_id, undefined);
});

Deno.test("Contract: stageSlug, iterationNumber and model_slug are required on DialecticCompressJobPayload where DialecticBaseJobPayload declares them optional", () => {
  const base: DialecticBaseJobPayload = {
    sessionId: "session-1",
    projectId: "project-1",
    walletId: "wallet-1",
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
    model_id: "model-1",
  };
  assertEquals(base.stageSlug, undefined);
  assertEquals(base.iterationNumber, undefined);
  assertEquals(base.model_slug, undefined);

  const compress: DialecticCompressJobPayload = {
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
    user_jwt: "jwt-1",
    idempotencyKey: "idem-1",
  };
  assertEquals(compress.stageSlug, DialecticStageSlug.Thesis);
  assertEquals(compress.iterationNumber, 1);
  assertEquals(compress.model_slug, "gpt-4o");
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
