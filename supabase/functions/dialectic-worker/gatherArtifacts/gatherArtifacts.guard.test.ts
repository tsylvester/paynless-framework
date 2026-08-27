import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  GatherArtifactsDeps,
  GatherArtifactsErrorReturn,
  GatherArtifactsParams,
  GatherArtifactsPayload,
  GatherArtifactsSuccessReturn,
} from "./gatherArtifacts.interface.ts";
import {
  isGatherArtifactsDeps,
  isGatherArtifactsParams,
  isGatherArtifactsPayload,
  isGatherArtifactsSuccessReturn,
  isGatherArtifactsErrorReturn,
} from "./gatherArtifacts.guard.ts";
import {
  buildGatherArtifactsDeps,
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
  buildGatherArtifactsSuccessReturn,
  buildGatherArtifactsErrorReturn,
  invalidateGatherArtifactsDeps,
  invalidateGatherArtifactsParams,
  invalidateGatherArtifactsPayload,
  invalidateGatherArtifactsSuccessReturn,
  invalidateGatherArtifactsErrorReturn,
} from "./gatherArtifacts.mock.ts";

/** Contract: isGatherArtifactsDeps accepts builder output and rejects null, empty, each property omitted, and each property corrupted. */
Deno.test("isGatherArtifactsDeps accepts builder output and rejects null, empty, omissions, and corruptions", () => {
  const valid: GatherArtifactsDeps = buildGatherArtifactsDeps();
  assertEquals(isGatherArtifactsDeps(valid), true);

  assertEquals(isGatherArtifactsDeps(null), false);
  assertEquals(isGatherArtifactsDeps({}), false);

  const { logger: _omitLogger, ...omitLogger } = buildGatherArtifactsDeps();
  assertEquals(isGatherArtifactsDeps(omitLogger), false);
  const { pickLatest: _omitPickLatest, ...omitPickLatest } = buildGatherArtifactsDeps();
  assertEquals(isGatherArtifactsDeps(omitPickLatest), false);
  const { downloadFromStorage: _omitDownload, ...omitDownload } = buildGatherArtifactsDeps();
  assertEquals(isGatherArtifactsDeps(omitDownload), false);
  const { applyCompressionOverlay: _omitOverlay, ...omitOverlay } = buildGatherArtifactsDeps();
  assertEquals(isGatherArtifactsDeps(omitOverlay), false);

  assertEquals(isGatherArtifactsDeps(invalidateGatherArtifactsDeps({ logger: "not-a-logger" })), false);
  assertEquals(isGatherArtifactsDeps(invalidateGatherArtifactsDeps({ pickLatest: "not-a-function" })), false);
  assertEquals(isGatherArtifactsDeps(invalidateGatherArtifactsDeps({ downloadFromStorage: "not-a-function" })), false);
  assertEquals(isGatherArtifactsDeps(invalidateGatherArtifactsDeps({ applyCompressionOverlay: "not-a-function" })), false);
});

/** Contract: isGatherArtifactsParams accepts builder output (carrying DialecticStageSlug.Thesis and FileType.business_case) and rejects null, empty, each property omitted, and each property corrupted. */
Deno.test("isGatherArtifactsParams accepts builder output and rejects null, empty, omissions, and corruptions", () => {
  const valid: GatherArtifactsParams = buildGatherArtifactsParams();
  assertEquals(valid.stageSlug, DialecticStageSlug.Thesis);
  assertEquals(valid.output_type, FileType.business_case);
  assertEquals(isGatherArtifactsParams(valid), true);

  assertEquals(isGatherArtifactsParams(null), false);
  assertEquals(isGatherArtifactsParams({}), false);

  const { dbClient: _omitDbClient, ...omitDbClient } = buildGatherArtifactsParams();
  assertEquals(isGatherArtifactsParams(omitDbClient), false);
  const { projectId: _omitProjectId, ...omitProjectId } = buildGatherArtifactsParams();
  assertEquals(isGatherArtifactsParams(omitProjectId), false);
  const { sessionId: _omitSessionId, ...omitSessionId } = buildGatherArtifactsParams();
  assertEquals(isGatherArtifactsParams(omitSessionId), false);
  const { iterationNumber: _omitIteration, ...omitIteration } = buildGatherArtifactsParams();
  assertEquals(isGatherArtifactsParams(omitIteration), false);
  const { stageSlug: _omitStageSlug, ...omitStageSlug } = buildGatherArtifactsParams();
  assertEquals(isGatherArtifactsParams(omitStageSlug), false);
  const { output_type: _omitOutputType, ...omitOutputType } = buildGatherArtifactsParams();
  assertEquals(isGatherArtifactsParams(omitOutputType), false);

  assertEquals(isGatherArtifactsParams(invalidateGatherArtifactsParams({ dbClient: "not-a-client" })), false);
  assertEquals(isGatherArtifactsParams(invalidateGatherArtifactsParams({ projectId: "" })), false);
  assertEquals(isGatherArtifactsParams(invalidateGatherArtifactsParams({ sessionId: "" })), false);
  assertEquals(isGatherArtifactsParams(invalidateGatherArtifactsParams({ iterationNumber: "not-a-number" })), false);
  assertEquals(isGatherArtifactsParams(invalidateGatherArtifactsParams({ stageSlug: "not-a-stage" })), false);
  assertEquals(isGatherArtifactsParams(invalidateGatherArtifactsParams({ output_type: "not-a-file-type" })), false);
});

/** Contract: isGatherArtifactsPayload accepts builder output and rejects null, empty, omission, and corruption. */
Deno.test("isGatherArtifactsPayload accepts builder output and rejects null, empty, omission, and corruption", () => {
  const valid: GatherArtifactsPayload = buildGatherArtifactsPayload();
  assertEquals(isGatherArtifactsPayload(valid), true);

  assertEquals(isGatherArtifactsPayload(null), false);
  assertEquals(isGatherArtifactsPayload({}), false);

  const { inputsRequired: _omitInputs, ...omitInputs } = buildGatherArtifactsPayload();
  assertEquals(isGatherArtifactsPayload(omitInputs), false);

  assertEquals(isGatherArtifactsPayload(invalidateGatherArtifactsPayload({ inputsRequired: "not-an-array" })), false);
});

/** Contract: isGatherArtifactsSuccessReturn accepts builder output and rejects null, empty, omission, corruption, and the error arm. */
Deno.test("isGatherArtifactsSuccessReturn accepts builder output and rejects null, empty, omission, corruption, and the error arm", () => {
  const valid: GatherArtifactsSuccessReturn = buildGatherArtifactsSuccessReturn();
  assertEquals(isGatherArtifactsSuccessReturn(valid), true);

  assertEquals(isGatherArtifactsSuccessReturn(null), false);
  assertEquals(isGatherArtifactsSuccessReturn({}), false);

  const { artifacts: _omitArtifacts, ...omitArtifacts } = buildGatherArtifactsSuccessReturn();
  assertEquals(isGatherArtifactsSuccessReturn(omitArtifacts), false);

  assertEquals(isGatherArtifactsSuccessReturn(invalidateGatherArtifactsSuccessReturn({ artifacts: "not-an-array" })), false);
  assertEquals(isGatherArtifactsSuccessReturn(buildGatherArtifactsErrorReturn()), false);
});

/** Contract: isGatherArtifactsErrorReturn accepts builder output and rejects null, empty, each property omitted, each property corrupted, and the success arm. */
Deno.test("isGatherArtifactsErrorReturn accepts builder output and rejects null, empty, omissions, corruptions, and the success arm", () => {
  const valid: GatherArtifactsErrorReturn = buildGatherArtifactsErrorReturn();
  assertEquals(isGatherArtifactsErrorReturn(valid), true);

  assertEquals(isGatherArtifactsErrorReturn(null), false);
  assertEquals(isGatherArtifactsErrorReturn({}), false);

  const { error: _omitError, ...omitError } = buildGatherArtifactsErrorReturn();
  assertEquals(isGatherArtifactsErrorReturn(omitError), false);
  const { retriable: _omitRetriable, ...omitRetriable } = buildGatherArtifactsErrorReturn();
  assertEquals(isGatherArtifactsErrorReturn(omitRetriable), false);

  assertEquals(isGatherArtifactsErrorReturn(invalidateGatherArtifactsErrorReturn({ error: "not-an-error" })), false);
  assertEquals(isGatherArtifactsErrorReturn(invalidateGatherArtifactsErrorReturn({ retriable: "not-a-boolean" })), false);
  assertEquals(isGatherArtifactsErrorReturn(buildGatherArtifactsSuccessReturn()), false);
});
