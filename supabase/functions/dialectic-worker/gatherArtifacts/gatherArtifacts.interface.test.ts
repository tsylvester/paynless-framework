import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  GatherArtifactsDeps,
  GatherArtifactsParams,
  GatherArtifactsPayload,
  GatherArtifactsSuccessReturn,
  GatherArtifactsErrorReturn,
  GatherArtifactsReturn,
  GatherArtifactsFn,
  BoundGatherArtifactsFn,
} from "./gatherArtifacts.interface.ts";

/** Contract: GatherArtifactsDeps requires exactly logger, pickLatest, downloadFromStorage, and applyCompressionOverlay. */
Deno.test("GatherArtifactsDeps has the required surface", () => {
  const surface: Record<keyof GatherArtifactsDeps, true> = {
    logger: true,
    pickLatest: true,
    downloadFromStorage: true,
    applyCompressionOverlay: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

/** Contract: GatherArtifactsParams requires exactly dbClient, projectId, sessionId, iterationNumber, stageSlug, and output_type. */
Deno.test("GatherArtifactsParams has the required surface", () => {
  const surface: Record<keyof GatherArtifactsParams, true> = {
    dbClient: true,
    projectId: true,
    sessionId: true,
    iterationNumber: true,
    stageSlug: true,
    output_type: true,
  };
  assertEquals(Object.keys(surface).length, 6);
});

/** Contract: GatherArtifactsParams.stageSlug is DialecticStageSlug. */
Deno.test("GatherArtifactsParams.stageSlug is DialecticStageSlug", () => {
  const stageSlug: GatherArtifactsParams["stageSlug"] = DialecticStageSlug.Thesis;
  assertEquals(stageSlug, DialecticStageSlug.Thesis);
});

/** Contract: GatherArtifactsParams.output_type is FileType. */
Deno.test("GatherArtifactsParams.output_type is FileType", () => {
  const output_type: GatherArtifactsParams["output_type"] = FileType.business_case;
  assertEquals(output_type, FileType.business_case);
});

/** Contract: GatherArtifactsPayload requires exactly inputsRequired. */
Deno.test("GatherArtifactsPayload has the required surface", () => {
  const surface: Record<keyof GatherArtifactsPayload, true> = {
    inputsRequired: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: GatherArtifactsSuccessReturn requires exactly artifacts. */
Deno.test("GatherArtifactsSuccessReturn has the required surface", () => {
  const surface: Record<keyof GatherArtifactsSuccessReturn, true> = {
    artifacts: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: GatherArtifactsErrorReturn requires exactly error and retriable. */
Deno.test("GatherArtifactsErrorReturn has the required surface", () => {
  const surface: Record<keyof GatherArtifactsErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: GatherArtifactsSuccessReturn is a member of GatherArtifactsReturn. */
Deno.test("GatherArtifactsSuccessReturn is a member of GatherArtifactsReturn", () => {
  const success: GatherArtifactsSuccessReturn = { artifacts: [] };
  const declared: GatherArtifactsReturn = success;
  assertEquals(declared === success, true);
});

/** Contract: GatherArtifactsErrorReturn is a member of GatherArtifactsReturn. */
Deno.test("GatherArtifactsErrorReturn is a member of GatherArtifactsReturn", () => {
  const error: GatherArtifactsErrorReturn = {
    error: new Error("interface test"),
    retriable: false,
  };
  const declared: GatherArtifactsReturn = error;
  assertEquals(declared === error, true);
});

/** Contract: GatherArtifactsFn resolves to its declared success type. */
Deno.test("GatherArtifactsFn resolves to its declared success type", () => {
  const success: GatherArtifactsSuccessReturn = { artifacts: [] };
  const returned: ReturnType<GatherArtifactsFn> = Promise.resolve(success);
  const declared: Promise<GatherArtifactsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** Contract: GatherArtifactsFn resolves to its declared error type. */
Deno.test("GatherArtifactsFn resolves to its declared error type", () => {
  const error: GatherArtifactsErrorReturn = {
    error: new Error("interface test"),
    retriable: false,
  };
  const returned: ReturnType<GatherArtifactsFn> = Promise.resolve(error);
  const declared: Promise<GatherArtifactsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** Contract: BoundGatherArtifactsFn resolves to its declared success type. */
Deno.test("BoundGatherArtifactsFn resolves to its declared success type", () => {
  const success: GatherArtifactsSuccessReturn = { artifacts: [] };
  const returned: ReturnType<BoundGatherArtifactsFn> = Promise.resolve(success);
  const declared: Promise<GatherArtifactsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** Contract: BoundGatherArtifactsFn resolves to its declared error type. */
Deno.test("BoundGatherArtifactsFn resolves to its declared error type", () => {
  const error: GatherArtifactsErrorReturn = {
    error: new Error("interface test"),
    retriable: false,
  };
  const returned: ReturnType<BoundGatherArtifactsFn> = Promise.resolve(error);
  const declared: Promise<GatherArtifactsReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});
