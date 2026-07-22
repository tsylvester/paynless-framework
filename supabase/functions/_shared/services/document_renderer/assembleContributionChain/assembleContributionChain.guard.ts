import { isRecord } from "../../../utils/type-guards/type_guards.common.ts";
import { isDialecticStageSlug } from "../../../utils/type-guards/type_guards.file_manager.ts";
import type {
  AssembleContributionChainErrorReturn,
  AssembleContributionChainParams,
  AssembleContributionChainPayload,
  AssembleContributionChainSuccessReturn,
} from "./assembleContributionChain.interface.ts";

export function isAssembleContributionChainParams(
  value: unknown,
): value is AssembleContributionChainParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("dbClient" in value)) {
    return false;
  }
  return isRecord(value.dbClient);
}

export function isAssembleContributionChainPayload(
  value: unknown,
): value is AssembleContributionChainPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !("sessionId" in value) ||
    !("stageSlug" in value) ||
    !("documentIdentity" in value) ||
    !("iterationNumber" in value)
  ) {
    return false;
  }
  if (typeof value.sessionId !== "string" || value.sessionId === "") {
    return false;
  }
  if (typeof value.documentIdentity !== "string" || value.documentIdentity === "") {
    return false;
  }
  if (!isDialecticStageSlug(value.stageSlug)) {
    return false;
  }
  if (typeof value.iterationNumber !== "number") {
    return false;
  }
  return true;
}

export function isAssembleContributionChainSuccessReturn(
  value: unknown,
): value is AssembleContributionChainSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("error" in value) {
    return false;
  }
  if (!("orderedChunks" in value) || !Array.isArray(value.orderedChunks)) {
    return false;
  }
  if (typeof value.modelSlug !== "string") {
    return false;
  }
  if (typeof value.attemptCount !== "number") {
    return false;
  }
  if (!(value.sourceGroupFragment === undefined || typeof value.sourceGroupFragment === "string")) {
    return false;
  }
  if (
    !(value.sourceAnchorModelSlug === undefined || typeof value.sourceAnchorModelSlug === "string")
  ) {
    return false;
  }
  return true;
}

export function isAssembleContributionChainErrorReturn(
  value: unknown,
): value is AssembleContributionChainErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("orderedChunks" in value) {
    return false;
  }
  if (!("error" in value) || !("retriable" in value)) {
    return false;
  }
  if (!(value.error instanceof Error)) {
    return false;
  }
  if (typeof value.retriable !== "boolean") {
    return false;
  }
  return true;
}
