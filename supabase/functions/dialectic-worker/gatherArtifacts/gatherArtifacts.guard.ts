import { isInputRuleArray } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
  GatherArtifactsDeps,
  GatherArtifactsErrorReturn,
  GatherArtifactsParams,
  GatherArtifactsPayload,
  GatherArtifactsSuccessReturn,
} from "./gatherArtifacts.interface.ts";

function isLoggerShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.debug === "function" &&
    typeof value.info === "function" &&
    typeof value.warn === "function" &&
    typeof value.error === "function"
  );
}

function isSupabaseClientShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.from === "function";
}

export function isGatherArtifactsDeps(value: unknown): value is GatherArtifactsDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!("logger" in value) || !isLoggerShape(value.logger)) {
    return false;
  }
  if (!("pickLatest" in value) || typeof value.pickLatest !== "function") {
    return false;
  }
  if (
    !("downloadFromStorage" in value) ||
    typeof value.downloadFromStorage !== "function"
  ) {
    return false;
  }
  return true;
}

export function isGatherArtifactsParams(value: unknown): value is GatherArtifactsParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("dbClient" in value) || !isSupabaseClientShape(value.dbClient)) {
    return false;
  }
  if (!("projectId" in value) || typeof value.projectId !== "string" || value.projectId === "") {
    return false;
  }
  if (!("sessionId" in value) || typeof value.sessionId !== "string" || value.sessionId === "") {
    return false;
  }
  if (!("iterationNumber" in value) || typeof value.iterationNumber !== "number") {
    return false;
  }
  return true;
}

export function isGatherArtifactsPayload(value: unknown): value is GatherArtifactsPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("inputsRequired" in value)) {
    return false;
  }
  return isInputRuleArray(value.inputsRequired);
}

export function isGatherArtifactsSuccessReturn(
  value: unknown,
): value is GatherArtifactsSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("artifacts" in value) || !Array.isArray(value.artifacts)) {
    return false;
  }
  if ("error" in value || "retriable" in value) {
    return false;
  }
  return true;
}

export function isGatherArtifactsErrorReturn(
  value: unknown,
): value is GatherArtifactsErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("error" in value) || !(value.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in value) || typeof value.retriable !== "boolean") {
    return false;
  }
  if ("artifacts" in value) {
    return false;
  }
  return true;
}
