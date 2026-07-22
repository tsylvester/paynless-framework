import {
  isDialecticStageSlug,
  isFileType,
  isModelContributionFileType,
} from "../../utils/type-guards/type_guards.file_manager.ts";
import { isRecord } from "../../utils/type-guards/type_guards.common.ts";
import type {
  ResolveTemplateFilenameErrorReturn,
  ResolveTemplateFilenameParams,
  ResolveTemplateFilenamePayload,
  ResolveTemplateFilenameSuccessReturn,
} from "./resolveTemplateFilename.interface.ts";

export function isResolveTemplateFilenameParams(
  value: unknown,
): value is ResolveTemplateFilenameParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("dbClient" in value)) {
    return false;
  }
  return isRecord(value.dbClient);
}

export function isResolveTemplateFilenamePayload(
  value: unknown,
): value is ResolveTemplateFilenamePayload {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !("stageSlug" in value) ||
    !("outputType" in value) ||
    !("documentKey" in value)
  ) {
    return false;
  }
  if (!isDialecticStageSlug(value.stageSlug)) {
    return false;
  }
  if (!isModelContributionFileType(value.outputType)) {
    return false;
  }
  if (!isFileType(value.documentKey)) {
    return false;
  }
  return true;
}

export function isResolveTemplateFilenameSuccessReturn(
  value: unknown,
): value is ResolveTemplateFilenameSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("error" in value) {
    return false;
  }
  if (!("templateFilename" in value)) {
    return false;
  }
  return typeof value.templateFilename === "string";
}

export function isResolveTemplateFilenameErrorReturn(
  value: unknown,
): value is ResolveTemplateFilenameErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("templateFilename" in value) {
    return false;
  }
  if (!("error" in value) || !("retriable" in value)) {
    return false;
  }
  if (!(value.error instanceof Error)) {
    return false;
  }
  return typeof value.retriable === "boolean";
}
