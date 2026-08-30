import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FileType,
  DialecticStageSlug,
} from "../../_shared/types/file_manager.types.ts";
import {
  CompressJobEnqueueError,
  CompressJobEnqueueErrorConstructorParams,
  CompressJobValidationError,
  CompressJobValidationErrorConstructorParams,
  BoundenqueueCompressJobsFn,
  DialecticCompressJobPayload,
  enqueueCompressJobsDeps,
  enqueueCompressJobsErrorReturn,
  enqueueCompressJobsFn,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsReturn,
  enqueueCompressJobsSuccessReturn,
  enqueueCompressJobsVictim,
} from "./enqueueCompressJobs.interface.ts";
import type { DialecticBaseJobPayload } from "../../dialectic-service/dialectic.interface.ts";

Deno.test("enqueueCompressJobsDeps declares four dependency keys", () => {
  const surface: Record<keyof enqueueCompressJobsDeps, true> = {
    logger: true,
    textSplitter: true,
    countTokens: true,
    constructStoragePath: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

Deno.test("enqueueCompressJobsParams declares one field", () => {
  const surface: Record<keyof enqueueCompressJobsParams, true> = {
    dbClient: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

Deno.test("enqueueCompressJobsPayload declares three fields", () => {
  const surface: Record<keyof enqueueCompressJobsPayload, true> = {
    victim: true,
    parentJob: true,
    modelConfig: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

Deno.test("enqueueCompressJobsVictim declares its required key surface", () => {
  const surface: Record<keyof enqueueCompressJobsVictim, true> = {
    mode: true,
    content: true,
    sourceType: true,
    sourceId: true,
    role: true,
    documentKey: true,
    docType: true,
    sourceStageSlug: true,
  };
  assertEquals(Object.keys(surface).length, 8);
});

Deno.test("enqueueCompressJobsVictim literal type-checks with enum members", () => {
  const mode: enqueueCompressJobsVictim["mode"] = "json";
  const sourceType: enqueueCompressJobsVictim["sourceType"] = "contribution";
  const victim: enqueueCompressJobsVictim = {
    mode,
    content: "some content",
    sourceType,
    documentKey: FileType.business_case,
    docType: FileType.business_case,
    sourceStageSlug: DialecticStageSlug.Thesis,
  };
  assertEquals(victim.mode, "json");
  assertEquals(victim.sourceType, "contribution");
  assertEquals(victim.content, "some content");
  assertEquals(victim.documentKey, FileType.business_case);
  assertEquals(victim.docType, FileType.business_case);
  assertEquals(victim.sourceStageSlug, DialecticStageSlug.Thesis);
});

Deno.test("enqueueCompressJobsVictim carries role for history", () => {
  const role: enqueueCompressJobsVictim["role"] = "assistant";
  const victim: enqueueCompressJobsVictim = {
    mode: "text",
    content: "some content",
    sourceType: "history",
    sourceId: "history-1",
    role,
  };
  assertEquals(victim.role, "assistant");
});

Deno.test("DialecticCompressJobPayload carries role for history, with user_jwt and idempotencyKey inherited and no job_type or user_id", () => {
  const payload: DialecticCompressJobPayload = {
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
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

Deno.test("DialecticCompressJobPayload continuation_count is optional, with user_jwt and idempotencyKey inherited and no job_type or user_id", () => {
  const withContinuation: DialecticCompressJobPayload = {
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
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
    output_type: FileType.business_case,
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

Deno.test("DialecticCompressJobPayload model_slug is required, with user_jwt and idempotencyKey inherited and no job_type or user_id", () => {
  const payload: DialecticCompressJobPayload = {
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
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

Deno.test("DialecticCompressJobPayload is a member of DialecticBaseJobPayload", () => {
  const payload: DialecticCompressJobPayload = {
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
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

Deno.test("source_prompt_resource_id is an optional member of DialecticBaseJobPayload", () => {
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

Deno.test("stageSlug, iterationNumber and model_slug are required on DialecticCompressJobPayload where DialecticBaseJobPayload declares them optional", () => {
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
    output_type: FileType.business_case,
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

Deno.test("CompressJobValidationErrorConstructorParams declares one field", () => {
  const surface: Record<keyof CompressJobValidationErrorConstructorParams, true> = {
    message: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

Deno.test("CompressJobEnqueueErrorConstructorParams declares one field", () => {
  const surface: Record<keyof CompressJobEnqueueErrorConstructorParams, true> = {
    message: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

Deno.test("enqueueCompressJobsSuccessReturn and ErrorReturn form a union", () => {
  const success: enqueueCompressJobsSuccessReturn = { createdCount: 2 };
  const errorReturn: enqueueCompressJobsErrorReturn = {
    error: new CompressJobValidationError({ message: "validation failed" }),
    retriable: false,
  };
  const enqueueErrorReturn: enqueueCompressJobsErrorReturn = {
    error: new CompressJobEnqueueError({ message: "enqueue failed" }),
    retriable: true,
  };
  const result1: enqueueCompressJobsReturn = success;
  const result2: enqueueCompressJobsReturn = errorReturn;
  const result3: enqueueCompressJobsReturn = enqueueErrorReturn;
  assertEquals("createdCount" in result1, true);
  assertEquals("error" in result2, true);
  assertEquals("error" in result3, true);
});

Deno.test("enqueueCompressJobsFn resolves to its declared success type", () => {
  const success: enqueueCompressJobsSuccessReturn = { createdCount: 1 };
  const returned: ReturnType<enqueueCompressJobsFn> = Promise.resolve(success);
  const declared: Promise<enqueueCompressJobsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

Deno.test("enqueueCompressJobsFn resolves to its declared error type", () => {
  const error: enqueueCompressJobsErrorReturn = {
    error: new CompressJobValidationError({ message: "validation failed" }),
    retriable: false,
  };
  const returned: ReturnType<enqueueCompressJobsFn> = Promise.resolve(error);
  const declared: Promise<enqueueCompressJobsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

Deno.test("BoundenqueueCompressJobsFn resolves to its declared success type", () => {
  const success: enqueueCompressJobsSuccessReturn = { createdCount: 1 };
  const returned: ReturnType<BoundenqueueCompressJobsFn> = Promise.resolve(success);
  const declared: Promise<enqueueCompressJobsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

Deno.test("BoundenqueueCompressJobsFn resolves to its declared error type", () => {
  const error: enqueueCompressJobsErrorReturn = {
    error: new CompressJobEnqueueError({ message: "enqueue failed" }),
    retriable: true,
  };
  const returned: ReturnType<BoundenqueueCompressJobsFn> = Promise.resolve(error);
  const declared: Promise<enqueueCompressJobsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});
