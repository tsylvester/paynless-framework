import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isCompressJobEnqueueError,
  isCompressJobEnqueueErrorConstructorParams,
  isCompressJobValidationError,
  isCompressJobValidationErrorConstructorParams,
  isDialecticCompressJobPayload,
  isenqueueCompressJobsDeps,
  isenqueueCompressJobsErrorReturn,
  isenqueueCompressJobsParams,
  isenqueueCompressJobsPayload,
  isenqueueCompressJobsSuccessReturn,
  isenqueueCompressJobsVictim,
} from "./enqueueCompressJobs.guard.ts";
import {
  buildCompressJobEnqueueError,
  buildCompressJobEnqueueErrorConstructorParams,
  buildCompressJobValidationError,
  buildCompressJobValidationErrorConstructorParams,
  buildDialecticCompressJobPayload,
  buildenqueueCompressJobsDeps,
  buildenqueueCompressJobsErrorReturn,
  buildenqueueCompressJobsParams,
  buildenqueueCompressJobsPayload,
  buildenqueueCompressJobsSuccessReturn,
  buildenqueueCompressJobsVictim,
  invalidateCompressJobEnqueueErrorConstructorParams,
  invalidateCompressJobValidationErrorConstructorParams,
  invalidateDialecticCompressJobPayload,
  invalidateEnqueueCompressJobsDeps,
  invalidateEnqueueCompressJobsErrorReturn,
  invalidateEnqueueCompressJobsParams,
  invalidateEnqueueCompressJobsPayload,
  invalidateEnqueueCompressJobsVictim,
} from "./enqueueCompressJobs.mock.ts";

Deno.test("isDialecticCompressJobPayload accepts full contribution payload", () => {
  assertEquals(isDialecticCompressJobPayload(buildDialecticCompressJobPayload()), true);
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
  assertEquals(isDialecticCompressJobPayload(buildDialecticCompressJobPayload()), true);
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

Deno.test("isDialecticCompressJobPayload rejects a corrupted output_type", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ output_type: 123 })), Error, 'Missing or invalid output_type.');
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
  const { docType: _docType, sourceStageSlug: _sourceStageSlug, ...textOnly } = buildDialecticCompressJobPayload();
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


Deno.test("isenqueueCompressJobsPayload accepts full contribution victim", () => {
  assertEquals(isenqueueCompressJobsPayload(buildenqueueCompressJobsPayload()), true);
});

Deno.test("isenqueueCompressJobsPayload rejects missing mode", () => {
  const { mode: _, ...withoutMode } = buildenqueueCompressJobsVictim();
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: withoutMode })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects unknown sourceType", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ sourceType: "unknown" }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects missing content", () => {
  const { content: _, ...withoutContent } = buildenqueueCompressJobsVictim();
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: withoutContent })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects empty content", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ content: "" }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects contribution missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ documentKey: null }) })), false);
});

Deno.test("isenqueueCompressJobsPayload accepts full feedback victim", () => {
  assertEquals(isenqueueCompressJobsPayload(buildenqueueCompressJobsPayload({ victim: buildenqueueCompressJobsVictim({ sourceType: "feedback" }) })), true);
});

Deno.test("isenqueueCompressJobsPayload accepts full history victim", () => {
  assertEquals(isenqueueCompressJobsPayload(buildenqueueCompressJobsPayload({ victim: buildenqueueCompressJobsVictim({ sourceType: "history", sourceId: "history-1", role: "assistant" }) })), true);
});

Deno.test("isenqueueCompressJobsPayload rejects feedback missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ sourceType: "feedback", documentKey: null }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects history missing sourceId", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ sourceType: "history", role: "assistant" }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects history missing role", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ sourceType: "history", sourceId: "history-1" }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects history with a role outside Messages", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ sourceType: "history", sourceId: "history-1", role: "model" }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing documentKey", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ mode: "json", documentKey: null }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing docType", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ mode: "json", docType: null }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects json mode missing sourceStageSlug", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ victim: invalidateEnqueueCompressJobsVictim({ mode: "json", sourceStageSlug: null }) })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsPayload(null), false);
  assertEquals(isenqueueCompressJobsPayload(undefined), false);
  assertEquals(isenqueueCompressJobsPayload(42), false);
  assertEquals(isenqueueCompressJobsPayload([]), false);
});

Deno.test("isenqueueCompressJobsPayload rejects corrupted parentJob", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ parentJob: null })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects omitted parentJob", () => {
  const { parentJob: _, ...rest } = buildenqueueCompressJobsPayload();
  assertEquals(isenqueueCompressJobsPayload(rest), false);
});

Deno.test("isenqueueCompressJobsPayload rejects corrupted modelConfig", () => {
  assertEquals(isenqueueCompressJobsPayload(invalidateEnqueueCompressJobsPayload({ modelConfig: null })), false);
});

Deno.test("isenqueueCompressJobsPayload rejects omitted modelConfig", () => {
  const { modelConfig: _, ...rest } = buildenqueueCompressJobsPayload();
  assertEquals(isenqueueCompressJobsPayload(rest), false);
});

Deno.test("isenqueueCompressJobsDeps accepts full deps", () => {
  assertEquals(isenqueueCompressJobsDeps(buildenqueueCompressJobsDeps()), true);
});

Deno.test("isenqueueCompressJobsDeps rejects missing logger", () => {
  const { logger: _, ...withoutLogger } = buildenqueueCompressJobsDeps();
  assertEquals(isenqueueCompressJobsDeps(withoutLogger), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing textSplitter", () => {
  const { textSplitter: _, ...withoutTextSplitter } = buildenqueueCompressJobsDeps();
  assertEquals(isenqueueCompressJobsDeps(withoutTextSplitter), false);
});

Deno.test("isenqueueCompressJobsDeps rejects textSplitter without splitText", () => {
  assertEquals(isenqueueCompressJobsDeps(invalidateEnqueueCompressJobsDeps({ textSplitter: {} })), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing countTokens", () => {
  const { countTokens: _, ...withoutCountTokens } = buildenqueueCompressJobsDeps();
  assertEquals(isenqueueCompressJobsDeps(withoutCountTokens), false);
});

Deno.test("isenqueueCompressJobsDeps rejects missing constructStoragePath", () => {
  const { constructStoragePath: _, ...withoutConstructStoragePath } = buildenqueueCompressJobsDeps();
  assertEquals(isenqueueCompressJobsDeps(withoutConstructStoragePath), false);
});

Deno.test("isenqueueCompressJobsDeps rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsDeps(null), false);
  assertEquals(isenqueueCompressJobsDeps(undefined), false);
  assertEquals(isenqueueCompressJobsDeps(42), false);
  assertEquals(isenqueueCompressJobsDeps([]), false);
});

Deno.test("isenqueueCompressJobsParams accepts full params", () => {
  assertEquals(isenqueueCompressJobsParams(buildenqueueCompressJobsParams()), true);
});

Deno.test("isenqueueCompressJobsParams rejects missing dbClient", () => {
  const { dbClient: _, ...withoutDbClient } = buildenqueueCompressJobsParams();
  assertEquals(isenqueueCompressJobsParams(withoutDbClient), false);
});

Deno.test("isenqueueCompressJobsParams rejects dbClient without from", () => {
  assertEquals(isenqueueCompressJobsParams(invalidateEnqueueCompressJobsParams({ dbClient: {} })), false);
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

Deno.test("isDialecticCompressJobPayload rejects output_type that is not a ModelContributionFileType", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ output_type: "not-a-model-contribution" })), Error, 'Missing or invalid output_type.');
});

Deno.test("isDialecticCompressJobPayload rejects stageSlug that is not a DialecticStageSlug", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ stageSlug: "not-a-stage" })), Error, 'Missing or invalid stageSlug.');
});

Deno.test("isDialecticCompressJobPayload rejects sourceStageSlug that is not a DialecticStageSlug", () => {
  assertThrows(() => isDialecticCompressJobPayload(invalidateDialecticCompressJobPayload({ mode: "json", sourceStageSlug: "not-a-stage" })), Error, 'Missing or invalid sourceStageSlug.');
});

Deno.test("isenqueueCompressJobsVictim accepts full contribution victim", () => {
  assertEquals(isenqueueCompressJobsVictim(buildenqueueCompressJobsVictim()), true);
});

Deno.test("isenqueueCompressJobsVictim rejects missing mode", () => {
  const { mode: _, ...withoutMode } = buildenqueueCompressJobsVictim();
  assertEquals(isenqueueCompressJobsVictim(withoutMode), false);
});

Deno.test("isenqueueCompressJobsVictim rejects missing content", () => {
  const { content: _, ...withoutContent } = buildenqueueCompressJobsVictim();
  assertEquals(isenqueueCompressJobsVictim(withoutContent), false);
});

Deno.test("isenqueueCompressJobsVictim rejects missing sourceType", () => {
  const { sourceType: _, ...withoutSourceType } = buildenqueueCompressJobsVictim();
  assertEquals(isenqueueCompressJobsVictim(withoutSourceType), false);
});

Deno.test("isenqueueCompressJobsVictim rejects unknown sourceType", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ sourceType: "unknown" })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects empty content", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ content: "" })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects contribution missing documentKey", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ documentKey: null })), false);
});

Deno.test("isenqueueCompressJobsVictim accepts full feedback victim", () => {
  assertEquals(isenqueueCompressJobsVictim(buildenqueueCompressJobsVictim({ sourceType: "feedback" })), true);
});

Deno.test("isenqueueCompressJobsVictim accepts full history victim", () => {
  assertEquals(isenqueueCompressJobsVictim(buildenqueueCompressJobsVictim({ sourceType: "history", sourceId: "history-1", role: "assistant" })), true);
});

Deno.test("isenqueueCompressJobsVictim rejects feedback missing documentKey", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ sourceType: "feedback", documentKey: null })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects history missing sourceId", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ sourceType: "history", role: "assistant" })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects history missing role", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ sourceType: "history", sourceId: "history-1" })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects history with a role outside Messages", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ sourceType: "history", sourceId: "history-1", role: "model" })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects json mode missing documentKey", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ mode: "json", documentKey: null })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects json mode missing docType", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ mode: "json", docType: null })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects json mode missing sourceStageSlug", () => {
  assertEquals(isenqueueCompressJobsVictim(invalidateEnqueueCompressJobsVictim({ mode: "json", sourceStageSlug: null })), false);
});

Deno.test("isenqueueCompressJobsVictim rejects non-record roots", () => {
  assertEquals(isenqueueCompressJobsVictim(null), false);
  assertEquals(isenqueueCompressJobsVictim(undefined), false);
  assertEquals(isenqueueCompressJobsVictim(42), false);
  assertEquals(isenqueueCompressJobsVictim([]), false);
});

Deno.test("isCompressJobValidationErrorConstructorParams accepts valid params", () => {
  assertEquals(isCompressJobValidationErrorConstructorParams(buildCompressJobValidationErrorConstructorParams()), true);
});

Deno.test("isCompressJobValidationErrorConstructorParams rejects missing message", () => {
  const { message: _, ...withoutMessage } = buildCompressJobValidationErrorConstructorParams();
  assertEquals(isCompressJobValidationErrorConstructorParams(withoutMessage), false);
});

Deno.test("isCompressJobValidationErrorConstructorParams rejects empty message", () => {
  assertEquals(isCompressJobValidationErrorConstructorParams(invalidateCompressJobValidationErrorConstructorParams({ message: "" })), false);
});

Deno.test("isCompressJobValidationErrorConstructorParams rejects non-record roots", () => {
  assertEquals(isCompressJobValidationErrorConstructorParams(null), false);
  assertEquals(isCompressJobValidationErrorConstructorParams(undefined), false);
  assertEquals(isCompressJobValidationErrorConstructorParams(42), false);
  assertEquals(isCompressJobValidationErrorConstructorParams([]), false);
});

Deno.test("isCompressJobValidationError accepts a real instance", () => {
  assertEquals(isCompressJobValidationError(buildCompressJobValidationError()), true);
});

Deno.test("isCompressJobValidationError rejects a plain Error", () => {
  assertEquals(isCompressJobValidationError(new Error("plain")), false);
});

Deno.test("isCompressJobValidationError rejects non-object roots", () => {
  assertEquals(isCompressJobValidationError(null), false);
  assertEquals(isCompressJobValidationError(undefined), false);
  assertEquals(isCompressJobValidationError(42), false);
  assertEquals(isCompressJobValidationError("error"), false);
});

Deno.test("isCompressJobEnqueueErrorConstructorParams accepts valid params", () => {
  assertEquals(isCompressJobEnqueueErrorConstructorParams(buildCompressJobEnqueueErrorConstructorParams()), true);
});

Deno.test("isCompressJobEnqueueErrorConstructorParams rejects missing message", () => {
  const { message: _, ...withoutMessage } = buildCompressJobEnqueueErrorConstructorParams();
  assertEquals(isCompressJobEnqueueErrorConstructorParams(withoutMessage), false);
});

Deno.test("isCompressJobEnqueueErrorConstructorParams rejects empty message", () => {
  assertEquals(isCompressJobEnqueueErrorConstructorParams(invalidateCompressJobEnqueueErrorConstructorParams({ message: "" })), false);
});

Deno.test("isCompressJobEnqueueErrorConstructorParams rejects non-record roots", () => {
  assertEquals(isCompressJobEnqueueErrorConstructorParams(null), false);
  assertEquals(isCompressJobEnqueueErrorConstructorParams(undefined), false);
  assertEquals(isCompressJobEnqueueErrorConstructorParams(42), false);
  assertEquals(isCompressJobEnqueueErrorConstructorParams([]), false);
});

Deno.test("isCompressJobEnqueueError accepts a real instance", () => {
  assertEquals(isCompressJobEnqueueError(buildCompressJobEnqueueError()), true);
});

Deno.test("isCompressJobEnqueueError rejects a plain Error", () => {
  assertEquals(isCompressJobEnqueueError(new Error("plain")), false);
});

Deno.test("isCompressJobEnqueueError rejects non-object roots", () => {
  assertEquals(isCompressJobEnqueueError(null), false);
  assertEquals(isCompressJobEnqueueError(undefined), false);
  assertEquals(isCompressJobEnqueueError(42), false);
  assertEquals(isCompressJobEnqueueError("error"), false);
});
