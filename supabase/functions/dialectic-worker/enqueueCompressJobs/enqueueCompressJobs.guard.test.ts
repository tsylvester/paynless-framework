import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CompressJobEnqueueError,
  CompressJobValidationError,
} from "./enqueueCompressJobs.interface.ts";
import {
  isDialecticCompressJobPayload,
  isenqueueCompressJobsDeps,
  isenqueueCompressJobsErrorReturn,
  isenqueueCompressJobsParams,
  isenqueueCompressJobsPayload,
  isenqueueCompressJobsSuccessReturn,
} from "./enqueueCompressJobs.guard.ts";

const baseDialecticPayload = {
  job_type: "COMPRESS" ,
  sessionId: "session-1",
  projectId: "project-1",
  stageSlug: "THESIS",
  targetKey: "business_case",
  iterationNumber: 1,
  model_id: "model-1",
  mode: "text" ,
  content: "some content",
  sourceType: "contribution" ,
  documentKey: "business_case",
  walletId: "wallet-1",
  user_id: "user-1",
};

Deno.test("isDialecticCompressJobPayload accepts full contribution payload", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "contribution" , documentKey: "business_case" }), true);
});

Deno.test("isDialecticCompressJobPayload accepts full resource payload", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "resource" , documentKey: "general_resource" }), true);
});

Deno.test("isDialecticCompressJobPayload accepts full feedback payload", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "feedback" , sourceId: "feedback-1" }), true);
});

Deno.test("isDialecticCompressJobPayload accepts full history payload", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "history" , sourceId: "history-1" }), true);
});

Deno.test("isDialecticCompressJobPayload rejects contribution missing documentKey", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "contribution" , documentKey: undefined }), false);
});

Deno.test("isDialecticCompressJobPayload rejects resource missing documentKey", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "resource" , documentKey: undefined }), false);
});

Deno.test("isDialecticCompressJobPayload rejects feedback missing sourceId", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "feedback" , sourceId: undefined }), false);
});

Deno.test("isDialecticCompressJobPayload rejects history missing sourceId", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "history" , sourceId: undefined }), false);
});

Deno.test("isDialecticCompressJobPayload rejects unknown sourceType", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, sourceType: "unknown"  }), false);
});

Deno.test("isDialecticCompressJobPayload rejects missing job_type", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, job_type: "RENDER"  }), false);
});

Deno.test("isDialecticCompressJobPayload rejects json mode missing documentKey", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, mode: "json" , docType: "business_case", sourceStageSlug: "THESIS", documentKey: undefined }), false);
});

Deno.test("isDialecticCompressJobPayload rejects json mode missing docType", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, mode: "json" , documentKey: "business_case", sourceStageSlug: "THESIS", docType: undefined }), false);
});

Deno.test("isDialecticCompressJobPayload rejects json mode missing sourceStageSlug", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, mode: "json" , documentKey: "business_case", docType: "business_case", sourceStageSlug: undefined }), false);
});

Deno.test("isDialecticCompressJobPayload accepts text mode without docType or sourceStageSlug", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, mode: "text" , docType: undefined, sourceStageSlug: undefined }), true);
});

Deno.test("isDialecticCompressJobPayload rejects empty content", () => {
  assertEquals(isDialecticCompressJobPayload({ ...baseDialecticPayload, content: "" }), false);
});

Deno.test("isDialecticCompressJobPayload rejects non-record roots", () => {
  assertEquals(isDialecticCompressJobPayload(null), false);
  assertEquals(isDialecticCompressJobPayload("x"), false);
});

const baseVictim = {
  mode: "text" ,
  content: "some content",
  sourceType: "contribution" ,
  documentKey: "business_case",
};

Deno.test("isenqueueCompressJobsPayload accepts full contribution victim", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim } }), true);
});

Deno.test("isenqueueCompressJobsPayload rejects missing mode", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, mode: undefined } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects unknown sourceType", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, sourceType: "unknown"  } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects missing content", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, content: undefined } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects empty content", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, content: "" } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects contribution missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, documentKey: undefined } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects feedback missing sourceId", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { mode: "text" , content: "x", sourceType: "feedback" , sourceId: undefined } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, mode: "json" , docType: "business_case", sourceStageSlug: "THESIS", documentKey: undefined } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing docType", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, mode: "json" , documentKey: "business_case", sourceStageSlug: "THESIS", docType: undefined } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing sourceStageSlug", () => {
  assertEquals(isenqueueCompressJobsPayload({ victim: { ...baseVictim, mode: "json" , documentKey: "business_case", docType: "business_case", sourceStageSlug: undefined } }), false);
});

Deno.test("isenqueueCompressJobsPayload rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsPayload(null), false);
  assertEquals(isenqueueCompressJobsPayload("x"), false);
});

const baseDeps = {
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  textSplitter: { splitText: async () => [] },
  countTokens: () => 0,
  constructStoragePath: () => ({ storagePath: "", fileName: "" }),
};

Deno.test("isenqueueCompressJobsDeps accepts full deps", () => {
  assertEquals(isenqueueCompressJobsDeps(baseDeps), true);
});

Deno.test("isenqueueCompressJobsDeps rejects missing logger", () => {
  assertEquals(isenqueueCompressJobsDeps({ ...baseDeps, logger: undefined }), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing textSplitter", () => {
  assertEquals(isenqueueCompressJobsDeps({ ...baseDeps, textSplitter: undefined }), false);
});

Deno.test("isenqueueCompressJobsDeps rejects textSplitter without splitText", () => {
  assertEquals(isenqueueCompressJobsDeps({ ...baseDeps, textSplitter: {} }), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing countTokens", () => {
  assertEquals(isenqueueCompressJobsDeps({ ...baseDeps, countTokens: undefined }), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing constructStoragePath", () => {
  assertEquals(isenqueueCompressJobsDeps({ ...baseDeps, constructStoragePath: undefined }), false);
});

Deno.test("isenqueueCompressJobsDeps rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsDeps(null), false);
  assertEquals(isenqueueCompressJobsDeps("x"), false);
});

const baseParams = {
  dbClient: { from: () => ({}) },
  parentJob: { id: "job-1", user_id: "user-1", is_test_job: false },
  sessionId: "session-1",
  projectId: "project-1",
  stageSlug: "THESIS",
  targetKey: "business_case",
  iterationNumber: 1,
  modelId: "model-1",
  walletId: "wallet-1",
  modelConfig: { provider_max_input_tokens: 1000 },
  tokenizerDeps: { getEncoding: () => ({ encode: () => [] }), countTokensAnthropic: () => 0, logger: { warn: () => {}, error: () => {} } },
};

Deno.test("isenqueueCompressJobsParams accepts full params", () => {
  assertEquals(isenqueueCompressJobsParams(baseParams), true);
});

Deno.test("isenqueueCompressJobsParams rejects missing dbClient", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, dbClient: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects dbClient without from", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, dbClient: {} }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing parentJob", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, parentJob: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects parentJob missing id", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, parentJob: { user_id: "user-1", is_test_job: false } }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing sessionId", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, sessionId: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing projectId", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, projectId: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing stageSlug", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, stageSlug: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing targetKey", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, targetKey: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects negative iterationNumber", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, iterationNumber: -1 }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing modelId", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, modelId: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing walletId", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, walletId: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing modelConfig", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, modelConfig: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing tokenizerDeps", () => {
  assertEquals(isenqueueCompressJobsParams({ ...baseParams, tokenizerDeps: undefined }), false);
});

Deno.test("isenqueueCompressJobsParams rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsParams(null), false);
  assertEquals(isenqueueCompressJobsParams("x"), false);
});

Deno.test("isenqueueCompressJobsSuccessReturn accepts createdCount", () => {
  assertEquals(isenqueueCompressJobsSuccessReturn({ createdCount: 1 }), true);
});

Deno.test("isenqueueCompressJobsSuccessReturn rejects error field", () => {
  assertEquals(isenqueueCompressJobsSuccessReturn({ createdCount: 1, error: new Error("x") }), false);
});

Deno.test("isenqueueCompressJobsSuccessReturn rejects missing createdCount", () => {
  assertEquals(isenqueueCompressJobsSuccessReturn({}), false);
});

Deno.test("isenqueueCompressJobsSuccessReturn rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsSuccessReturn(null), false);
  assertEquals(isenqueueCompressJobsSuccessReturn("x"), false);
});

Deno.test("isenqueueCompressJobsErrorReturn accepts validation error", () => {
  assertEquals(isenqueueCompressJobsErrorReturn({ error: new CompressJobValidationError("x"), retriable: false }), true);
});

Deno.test("isenqueueCompressJobsErrorReturn accepts enqueue error", () => {
  assertEquals(isenqueueCompressJobsErrorReturn({ error: new CompressJobEnqueueError("x"), retriable: true }), true);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects missing error", () => {
  assertEquals(isenqueueCompressJobsErrorReturn({ retriable: false }), false);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects missing retriable", () => {
  assertEquals(isenqueueCompressJobsErrorReturn({ error: new CompressJobValidationError("x") }), false);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects retriable not boolean", () => {
  assertEquals(isenqueueCompressJobsErrorReturn({ error: new CompressJobValidationError("x"), retriable: "no" }), false);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsErrorReturn(null), false);
  assertEquals(isenqueueCompressJobsErrorReturn("x"), false);
});
