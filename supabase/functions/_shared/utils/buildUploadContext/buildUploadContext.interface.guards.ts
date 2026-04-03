import type { CanonicalPathParams } from "../../types/file_manager.types.ts";
import type {
  BuildUploadContextAiResponseSlice,
  BuildUploadContextParams,
  BuildUploadContextProviderDetails,
} from "./buildUploadContext.interface.ts";
import { isContributionType } from "../type-guards/type_guards.dialectic.ts";
import { isJson, isRecord } from "../type-guards/type_guards.common.ts";
import { isModelContributionFileType } from "../type-guards/type_guards.file_manager.ts";

/**
 * Validates `restOfCanonicalPathParams` after `contributionType` is split out: requires `stageSlug` per `CanonicalPathParams`.
 */
function isRestOfCanonicalPathParams(
  value: unknown,
): value is Omit<CanonicalPathParams, "contributionType"> {
  if (!isRecord(value)) {
    return false;
  }
  if (!("stageSlug" in value) || typeof value.stageSlug !== "string") {
    return false;
  }
  if (value.stageSlug.trim() === "") {
    return false;
  }
  if (
    "sourceModelSlugs" in value &&
    value.sourceModelSlugs !== undefined
  ) {
    if (!Array.isArray(value.sourceModelSlugs)) {
      return false;
    }
    if (!value.sourceModelSlugs.every((item: unknown) => typeof item === "string")) {
      return false;
    }
  }
  return true;
}

function isBuildUploadContextProviderDetails(
  value: unknown,
): value is BuildUploadContextProviderDetails {
  if (!isRecord(value)) {
    return false;
  }
  if (!("id" in value) || typeof value.id !== "string") {
    return false;
  }
  if (!("name" in value) || typeof value.name !== "string") {
    return false;
  }
  const keys: string[] = Object.keys(value);
  if (keys.length !== 2) {
    return false;
  }
  return true;
}

function isBuildUploadContextAiResponseSlice(
  value: unknown,
): value is BuildUploadContextAiResponseSlice {
  if (!isRecord(value)) {
    return false;
  }
  const allowedKeys: Set<string> = new Set([
    "inputTokens",
    "outputTokens",
    "processingTimeMs",
  ]);
  const keys: string[] = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const key: string = keys[i];
    if (!allowedKeys.has(key)) {
      return false;
    }
  }
  if ("inputTokens" in value && value.inputTokens !== undefined) {
    if (typeof value.inputTokens !== "number") {
      return false;
    }
  }
  if ("outputTokens" in value && value.outputTokens !== undefined) {
    if (typeof value.outputTokens !== "number") {
      return false;
    }
  }
  if ("processingTimeMs" in value && value.processingTimeMs !== undefined) {
    if (typeof value.processingTimeMs !== "number") {
      return false;
    }
  }
  return true;
}

/**
 * Validates that `value` satisfies `BuildUploadContextParams`: all fields present with correct types.
 */
export function isBuildUploadContextParams(
  value: unknown,
): value is BuildUploadContextParams {
  if (!isRecord(value)) {
    return false;
  }

  if (!("projectId" in value) || typeof value.projectId !== "string") {
    return false;
  }
  if (
    !("storageFileType" in value) ||
    !isModelContributionFileType(value.storageFileType)
  ) {
    return false;
  }
  if (!("sessionId" in value) || typeof value.sessionId !== "string") {
    return false;
  }
  if (
    !("iterationNumber" in value) ||
    typeof value.iterationNumber !== "number"
  ) {
    return false;
  }
  if (!("modelSlug" in value) || typeof value.modelSlug !== "string") {
    return false;
  }
  if (!("attemptCount" in value) || typeof value.attemptCount !== "number") {
    return false;
  }
  if (
    !("restOfCanonicalPathParams" in value) ||
    !isRestOfCanonicalPathParams(value.restOfCanonicalPathParams)
  ) {
    return false;
  }
  if (!("documentKey" in value) || typeof value.documentKey !== "string") {
    return false;
  }
  if (!("contributionType" in value)) {
    return false;
  }
  const contributionType: unknown = value.contributionType;
  if (contributionType !== undefined) {
    if (typeof contributionType !== "string" || !isContributionType(contributionType)) {
      return false;
    }
  }
  if (
    !("isContinuationForStorage" in value) ||
    typeof value.isContinuationForStorage !== "boolean"
  ) {
    return false;
  }
  if (!("continuationCount" in value)) {
    return false;
  }
  const continuationCount: unknown = value.continuationCount;
  if (
    continuationCount !== undefined &&
    typeof continuationCount !== "number"
  ) {
    return false;
  }
  if (!("sourceGroupFragment" in value)) {
    return false;
  }
  const sourceGroupFragment: unknown = value.sourceGroupFragment;
  if (
    sourceGroupFragment !== undefined &&
    typeof sourceGroupFragment !== "string"
  ) {
    return false;
  }
  if (!("contentForStorage" in value) || typeof value.contentForStorage !== "string") {
    return false;
  }
  if (
    !("projectOwnerUserId" in value) ||
    typeof value.projectOwnerUserId !== "string"
  ) {
    return false;
  }
  if (!("description" in value) || typeof value.description !== "string") {
    return false;
  }
  if (
    !("providerDetails" in value) ||
    !isBuildUploadContextProviderDetails(value.providerDetails)
  ) {
    return false;
  }
  if (
    !("aiResponse" in value) ||
    !isBuildUploadContextAiResponseSlice(value.aiResponse)
  ) {
    return false;
  }
  if (!("sourcePromptResourceId" in value)) {
    return false;
  }
  const sourcePromptResourceId: unknown = value.sourcePromptResourceId;
  if (
    sourcePromptResourceId !== undefined &&
    typeof sourcePromptResourceId !== "string"
  ) {
    return false;
  }
  if (!("targetContributionId" in value)) {
    return false;
  }
  const targetContributionId: unknown = value.targetContributionId;
  if (
    targetContributionId !== undefined &&
    typeof targetContributionId !== "string"
  ) {
    return false;
  }
  if (!("documentRelationships" in value)) {
    return false;
  }
  const documentRelationships: unknown = value.documentRelationships;
  if (documentRelationships !== null && !isJson(documentRelationships)) {
    return false;
  }
  if (!("isIntermediate" in value) || typeof value.isIntermediate !== "boolean") {
    return false;
  }

  return true;
}
