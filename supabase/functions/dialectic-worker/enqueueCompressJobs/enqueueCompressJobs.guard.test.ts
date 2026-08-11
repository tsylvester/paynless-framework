import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isDialecticCompressJobPayload,
  isenqueueCompressJobsDeps,
  isenqueueCompressJobsErrorReturn,
  isenqueueCompressJobsParams,
  isenqueueCompressJobsPayload,
  isenqueueCompressJobsSuccessReturn,
} from "./enqueueCompressJobs.guard.ts";
import {
  buildCompressJobEnqueueError,
  buildCompressJobValidationError,
  buildDialecticCompressJobPayload,
  buildenqueueCompressJobsDeps,
  buildenqueueCompressJobsErrorReturn,
  buildenqueueCompressJobsParams,
  buildenqueueCompressJobsPayload,
  buildenqueueCompressJobsSuccessReturn,
  invalidateDialecticCompressJobPayload,
  invalidateEnqueueCompressJobsDeps,
  invalidateEnqueueCompressJobsErrorReturn,
  invalidateEnqueueCompressJobsParams,
  invalidateEnqueueCompressJobsPayload,
} from "./enqueueCompressJobs.mock.ts";

const baseDialectic = buildDialecticCompressJobPayload();

Deno.test("isDialecticCompressJobPayload accepts full contribution payload", () => {
  assertEquals(isDialecticCompressJobPayload(baseDialectic), true);
});

Deno.test("isDialecticCompressJobPayload accepts full resource payload", () => {
  assertEquals(isDialecticCompressJobPayload(buildDialecticCompressJobPayload({ sourceType: "resource" })), true);
});

Deno.test("isDialecticCompressJobPayload accepts full feedback payload", () => {
  assertEquals(isDialecticCompressJobPayload(buildDialecticCompressJobPayload({ sourceType: "feedback" })), true);
});

Deno.test("isDialecticCompressJobPayload accepts full history payload", () => {
  assertEquals(isDialecticCompressJobPayload(buildDialecticCompressJobPayload({ sourceType: "history", sourceId: "history-1", role: "assistant" })), true);
});

Deno.test("isDialecticCompressJobPayload rejects contribution missing documentKey", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ documentKey: null })), Error, 'Missing or invalid documentKey.');
});

Deno.test("isDialecticCompressJobPayload rejects resource missing documentKey", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ sourceType: "resource", documentKey: null })), Error, 'Missing or invalid documentKey.');
});

Deno.test("isDialecticCompressJobPayload rejects feedback missing documentKey", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ sourceType: "feedback", documentKey: null })), Error, 'Missing or invalid documentKey.');
});

Deno.test("isDialecticCompressJobPayload rejects history missing sourceId", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ sourceType: "history", role: "assistant" })), Error, 'Missing or invalid sourceId.');
});

Deno.test("isDialecticCompressJobPayload rejects history missing role", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ sourceType: "history", sourceId: "history-1" })), Error, 'Missing or invalid role.');
});

Deno.test("isDialecticCompressJobPayload rejects history with a role outside Messages", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ sourceType: "history", sourceId: "history-1", role: "model" })), Error, 'Missing or invalid role.');
});

Deno.test("isDialecticCompressJobPayload rejects a missing model_slug", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ model_slug: undefined })), Error, 'Invalid model_slug.');
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ model_slug: "" })), Error, 'Missing or invalid model_slug.');
});

Deno.test("isDialecticCompressJobPayload accepts a continuation payload", () => {
  assertEquals(isDialecticCompressJobPayload(buildDialecticCompressJobPayload({ continuation_count: 1 })), true);
});

Deno.test("isDialecticCompressJobPayload accepts a payload with continuation_count absent", () => {
  assertEquals(isDialecticCompressJobPayload(baseDialectic), true);
});

Deno.test("isDialecticCompressJobPayload rejects a non-integer continuation_count", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ continuation_count: "one" })), Error, 'Invalid continuation_count.');
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ continuation_count: -1 })), Error, 'Invalid continuation_count.');
});

Deno.test("isDialecticCompressJobPayload rejects unknown sourceType", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ sourceType: "unknown" })), Error, 'Missing or invalid sourceType.');
});

Deno.test("isDialecticCompressJobPayload rejects a corrupted mode", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ mode: "invalid" })), Error, 'Missing or invalid mode.');
});

Deno.test("isDialecticCompressJobPayload rejects a corrupted sourceType", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ sourceType: 123 })), Error, 'Missing or invalid sourceType.');
});

Deno.test("isDialecticCompressJobPayload rejects corrupted content", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ content: 123 })), Error, 'Missing or invalid content.');
});

Deno.test("isDialecticCompressJobPayload rejects a corrupted targetKey", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ targetKey: 123 })), Error, 'Missing or invalid targetKey.');
});

Deno.test("isDialecticCompressJobPayload rejects json mode missing documentKey", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ mode: "json", documentKey: null })), Error, 'Missing or invalid documentKey.');
});

Deno.test("isDialecticCompressJobPayload rejects json mode missing docType", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ mode: "json", docType: null })), Error, 'Missing or invalid docType.');
});

Deno.test("isDialecticCompressJobPayload rejects json mode missing sourceStageSlug", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ mode: "json", sourceStageSlug: null })), Error, 'Missing or invalid sourceStageSlug.');
});

Deno.test("isDialecticCompressJobPayload accepts text mode without docType or sourceStageSlug", () => {
  const { docType: _docType, sourceStageSlug: _sourceStageSlug, ...textOnly } = baseDialectic;
  assertEquals(isDialecticCompressJobPayload(textOnly), true);
});

Deno.test("isDialecticCompressJobPayload rejects empty content", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ content: "" })), Error, 'Missing or invalid content.');
});

Deno.test("isDialecticCompressJobPayload rejects non-record roots", () => {
  assertThrows(() => isDialecticCompressJobPayload(null), Error, 'Payload must be a non-null object.');
  assertThrows(() => isDialecticCompressJobPayload(undefined), Error, 'Payload must be a non-null object.');
  assertThrows(() => isDialecticCompressJobPayload(42), Error, 'Payload must be a non-null object.');
  assertThrows(() => isDialecticCompressJobPayload([]), Error, 'Payload must be a non-null object.');
});

Deno.test("isDialecticCompressJobPayload rejects a payload missing user_jwt", () => {
  const { user_jwt: _omit, ...rest } = buildDialecticCompressJobPayload();
  assertThrows(() => isDialecticCompressJobPayload(rest), Error, 'Missing or invalid user_jwt.');
});

Deno.test("isDialecticCompressJobPayload rejects a payload missing idempotencyKey", () => {
  const { idempotencyKey: _omit, ...rest } = buildDialecticCompressJobPayload();
  assertThrows(() => isDialecticCompressJobPayload(rest), Error, 'Missing or invalid idempotencyKey.');
});

Deno.test("isDialecticCompressJobPayload rejects a payload carrying job_type", () => {
  assertThrows(() => isDialecticCompressJobPayload({ ...buildDialecticCompressJobPayload(), job_type: "COMPRESS" }), Error, 'Payload contains unknown properties: job_type');
});

Deno.test("isDialecticCompressJobPayload rejects a payload carrying user_id", () => {
  assertThrows(() => isDialecticCompressJobPayload({ ...buildDialecticCompressJobPayload(), user_id: "user-1" }), Error, 'Payload contains unknown properties: user_id');
});

const basePayload = buildenqueueCompressJobsPayload();
const baseVictim = basePayload.victim;

Deno.test("isenqueueCompressJobsPayload accepts full contribution victim", () => {
  assertEquals(isenqueueCompressJobsPayload(basePayload), true);
});

Deno.test("isenqueueCompressJobsPayload rejects missing mode", () => {
  const { mode: _, ...withoutMode } = baseVictim;
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: withoutMode })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects unknown sourceType", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, sourceType: "unknown" } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects missing content", () => {
  const { content: _, ...withoutContent } = baseVictim;
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: withoutContent })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects empty content", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, content: "" } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects contribution missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, documentKey: null } })), false);
});

Deno.test("isenqueueCompressJobsPayload accepts full feedback victim", () => {
  assertEquals(isenqueueCompressJobsPayload(buildenqueueCompressJobsPayload({ victim: { sourceType: "feedback" } })), true);
});

Deno.test("isenqueueCompressJobsPayload accepts full history victim", () => {
  assertEquals(isenqueueCompressJobsPayload(buildenqueueCompressJobsPayload({ victim: { sourceType: "history", sourceId: "history-1", role: "assistant" } })), true);
});

Deno.test("isenqueueCompressJobsPayload rejects feedback missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, sourceType: "feedback", documentKey: null } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects history missing sourceId", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, sourceType: "history", role: "assistant" } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects history missing role", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, sourceType: "history", sourceId: "history-1" } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects history with a role outside Messages", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, sourceType: "history", sourceId: "history-1", role: "model" } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, mode: "json", documentKey: null } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing docType", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, mode: "json", docType: null } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing sourceStageSlug", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: { ...baseVictim, mode: "json", sourceStageSlug: null } })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsPayload(null), false);
  assertEquals(isenqueueCompressJobsPayload(undefined), false);
  assertEquals(isenqueueCompressJobsPayload(42), false);
  assertEquals(isenqueueCompressJobsPayload([]), false);
});

const baseDeps = buildenqueueCompressJobsDeps();

Deno.test("isenqueueCompressJobsDeps accepts full deps", () => {
  assertEquals(isenqueueCompressJobsDeps(baseDeps), true);
});

Deno.test("isenqueueCompressJobsDeps rejects missing logger", () => {
  const { logger: _, ...withoutLogger } = baseDeps;
  assertEquals(isenqueueCompressJobsDeps(withoutLogger), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing textSplitter", () => {
  const { textSplitter: _, ...withoutTextSplitter } = baseDeps;
  assertEquals(isenqueueCompressJobsDeps(withoutTextSplitter), false);
});

Deno.test("isenqueueCompressJobsDeps rejects textSplitter without splitText", () => {
  assertEquals(isenqueueCompressJobsDeps(invalidateEnqueueCompressJobsDeps({ textSplitter: {} })), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing countTokens", () => {
  const { countTokens: _, ...withoutCountTokens } = baseDeps;
  assertEquals(isenqueueCompressJobsDeps(withoutCountTokens), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing constructStoragePath", () => {
  const { constructStoragePath: _, ...withoutConstructStoragePath } = baseDeps;
  assertEquals(isenqueueCompressJobsDeps(withoutConstructStoragePath), false);
});

Deno.test("isenqueueCompressJobsDeps rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsDeps(null), false);
  assertEquals(isenqueueCompressJobsDeps(undefined), false);
  assertEquals(isenqueueCompressJobsDeps(42), false);
  assertEquals(isenqueueCompressJobsDeps([]), false);
});

const baseParams = buildenqueueCompressJobsParams();

Deno.test("isenqueueCompressJobsParams accepts full params", () => {
  assertEquals(isenqueueCompressJobsParams(baseParams), true);
});

Deno.test("isenqueueCompressJobsParams rejects missing dbClient", () => {
  const { dbClient: _, ...withoutDbClient } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutDbClient), false);
});

Deno.test("isenqueueCompressJobsParams rejects dbClient without from", () => {
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ dbClient: {} })), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing parentJob", () => {
  const { parentJob: _, ...withoutParentJob } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutParentJob), false);
});

Deno.test("isenqueueCompressJobsParams rejects parentJob missing id", () => {
  const { id: _, ...withoutId } = baseParams.parentJob;
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ parentJob: withoutId })), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing sessionId", () => {
  const { sessionId: _, ...withoutSessionId } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutSessionId), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing projectId", () => {
  const { projectId: _, ...withoutProjectId } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutProjectId), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing stageSlug", () => {
  const { stageSlug: _, ...withoutStageSlug } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutStageSlug), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing targetKey", () => {
  const { targetKey: _, ...withoutTargetKey } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutTargetKey), false);
});

Deno.test("isenqueueCompressJobsParams rejects negative iterationNumber", () => {
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ iterationNumber: -1 })), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing modelId", () => {
  const { modelId: _, ...withoutModelId } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutModelId), false);
});

Deno.test("isenqueueCompressJobsParams rejects a missing modelSlug", () => {
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ modelSlug: undefined })), false);
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ modelSlug: "" })), false);
});

Deno.test("isenqueueCompressJobsParams rejects an absent or empty userJwt", () => {
  const { userJwt: _, ...withoutUserJwt } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutUserJwt), false);
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ userJwt: "" })), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing walletId", () => {
  const { walletId: _, ...withoutWalletId } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutWalletId), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing modelConfig", () => {
  const { modelConfig: _, ...withoutModelConfig } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutModelConfig), false);
});

Deno.test("isenqueueCompressJobsParams rejects missing tokenizerDeps", () => {
  const { tokenizerDeps: _, ...withoutTokenizerDeps } = baseParams;
  assertEquals(isenqueueCompressJobsParams(withoutTokenizerDeps), false);
});

Deno.test("isenqueueCompressJobsParams rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsParams(null), false);
  assertEquals(isenqueueCompressJobsParams(undefined), false);
  assertEquals(isenqueueCompressJobsParams(42), false);
  assertEquals(isenqueueCompressJobsParams([]), false);
});

Deno.test("isenqueueCompressJobsSuccessReturn accepts createdCount", () => {
  assertEquals(isenqueueCompressJobsSuccessReturn(buildenqueueCompressJobsSuccessReturn({ createdCount: 1 })), true);
});

Deno.test("isenqueueCompressJobsSuccessReturn rejects error field", () => {
  assertEquals(isenqueueCompressJobsSuccessReturn(buildenqueueCompressJobsErrorReturn()), false);
});

Deno.test("isenqueueCompressJobsSuccessReturn rejects missing createdCount", () => {
  const { createdCount: _, ...withoutCreatedCount } = buildenqueueCompressJobsSuccessReturn();
  assertEquals(isenqueueCompressJobsSuccessReturn(withoutCreatedCount), false);
});

Deno.test("isenqueueCompressJobsSuccessReturn rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsSuccessReturn(null), false);
  assertEquals(isenqueueCompressJobsSuccessReturn(undefined), false);
  assertEquals(isenqueueCompressJobsSuccessReturn(42), false);
  assertEquals(isenqueueCompressJobsSuccessReturn([]), false);
});

Deno.test("isenqueueCompressJobsErrorReturn accepts validation error", () => {
  assertEquals(isenqueueCompressJobsErrorReturn(buildenqueueCompressJobsErrorReturn({ error: buildCompressJobValidationError() })), true);
});

Deno.test("isenqueueCompressJobsErrorReturn accepts enqueue error", () => {
  assertEquals(isenqueueCompressJobsErrorReturn(buildenqueueCompressJobsErrorReturn()), true);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects missing error", () => {
  const { error: _, ...withoutError } = buildenqueueCompressJobsErrorReturn();
  assertEquals(isenqueueCompressJobsErrorReturn(withoutError), false);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects missing retriable", () => {
  const { retriable: _, ...withoutRetriable } = buildenqueueCompressJobsErrorReturn();
  assertEquals(isenqueueCompressJobsErrorReturn(withoutRetriable), false);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects retriable not boolean", () => {
  assertEquals(isenqueueCompressJobsErrorReturn(invalidateEnqueueCompressJobsErrorReturn({ retriable: "no" })), false);
});

Deno.test("isenqueueCompressJobsErrorReturn rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsErrorReturn(null), false);
  assertEquals(isenqueueCompressJobsErrorReturn(undefined), false);
  assertEquals(isenqueueCompressJobsErrorReturn(42), false);
  assertEquals(isenqueueCompressJobsErrorReturn([]), false);
});

Deno.test("isDialecticCompressJobPayload rejects documentKey that is not a FileType", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ documentKey: "not-a-file-type" })), Error, 'Missing or invalid documentKey.');
});

Deno.test("isDialecticCompressJobPayload rejects docType that is not a ModelContributionFileType", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ mode: "json", docType: "not-a-model-contribution" })), Error, 'Missing or invalid docType.');
});

Deno.test("isDialecticCompressJobPayload rejects targetKey that is not a ModelContributionFileType", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ targetKey: "not-a-model-contribution" })), Error, 'Missing or invalid targetKey.');
});

Deno.test("isDialecticCompressJobPayload rejects stageSlug that is not a DialecticStageSlug", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ stageSlug: "not-a-stage" })), Error, 'Missing or invalid stageSlug.');
});

Deno.test("isDialecticCompressJobPayload rejects sourceStageSlug that is not a DialecticStageSlug", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ mode: "json", sourceStageSlug: "not-a-stage" })), Error, 'Missing or invalid sourceStageSlug.');
});

Deno.test("isenqueueCompressJobsParams rejects stageSlug that is not a DialecticStageSlug", () => {
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ stageSlug: "not-a-stage" })), false);
});

Deno.test("isenqueueCompressJobsParams rejects targetKey that is not a ModelContributionFileType", () => {
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ targetKey: "not-a-model-contribution" })), false);
});
