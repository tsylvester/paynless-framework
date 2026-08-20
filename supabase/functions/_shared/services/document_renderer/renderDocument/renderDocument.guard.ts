import type { RenderCompressedContextParams } from "./renderDocument.interface.ts";
import { isRecord } from "../../../utils/type_guards.ts";
import {
  isCompressionSourceType,
  isDialecticStageSlug,
  isFileType,
  isModelContributionFileType,
} from "../../../utils/type-guards/type_guards.file_manager.ts";

export function isRenderCompressedContextParams(
  value: unknown,
): value is RenderCompressedContextParams {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.projectId !== "string" || value.projectId === "") {
    return false;
  }
  if (typeof value.sessionId !== "string" || value.sessionId === "") {
    return false;
  }
  if (typeof value.iterationNumber !== "number") {
    return false;
  }
  if (!isDialecticStageSlug(value.stageSlug)) {
    return false;
  }
  if (!isModelContributionFileType(value.output_type)) {
    return false;
  }
  if (!isCompressionSourceType(value.sourceType)) {
    return false;
  }
  if (value.sourceType !== "contribution" && value.sourceType !== "resource") {
    return false;
  }
  if (!isFileType(value.documentKey)) {
    return false;
  }
  if (typeof value.template_filename !== "string" || value.template_filename === "") {
    return false;
  }
  return true;
}
