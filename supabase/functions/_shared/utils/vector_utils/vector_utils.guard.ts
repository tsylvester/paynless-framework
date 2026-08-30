import { isRecord } from "../../utils/type-guards/type_guards.common.ts";
import { isCompressionSourceType } from "../../utils/type-guards/type_guards.file_manager.ts";
import { isMessages, isAiModelExtendedConfig } from "../../utils/type-guards/type_guards.chat.ts";
import { isResourceDocument } from "../resolveCompressionSource/resolveCompressionSource.provides.ts";
import type {
  CompressionCandidate,
  GetSortedCompressionCandidatesDeps,
  GetSortedCompressionCandidatesParams,
  GetSortedCompressionCandidatesPayload,
  GetSortedCompressionCandidatesSuccessReturn,
  GetSortedCompressionCandidatesErrorReturn,
} from "./vector_utils.interface.ts";

export function isCompressionCandidate(value: unknown): value is CompressionCandidate {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.content !== 'string') return false;
  if (!isCompressionSourceType(value.sourceType)) return false;
  if (typeof value.originalIndex !== 'number') return false;
  if (typeof value.valueScore !== 'number') return false;
  if (typeof value.effectiveScore !== 'number') return false;
  if (typeof value.tokenCount !== 'number') return false;
  return true;
}

export function isGetSortedCompressionCandidatesDeps(
  value: unknown,
): value is GetSortedCompressionCandidatesDeps {
  if (!isRecord(value)) return false;
  if (!('logger' in value)) return false;
  const logger = value.logger;
  if (!isRecord(logger)) return false;
  if (typeof logger.debug !== 'function') return false;
  if (typeof logger.info !== 'function') return false;
  if (typeof logger.warn !== 'function') return false;
  if (typeof logger.error !== 'function') return false;
  if (typeof value.countTokens !== 'function') return false;
  if (typeof value.resolveCompressionSource !== 'function') return false;
  return true;
}

export function isGetSortedCompressionCandidatesParams(
  value: unknown,
): value is GetSortedCompressionCandidatesParams {
  if (!isRecord(value)) return false;
  if ('inputsRelevance' in value) {
    if (!Array.isArray(value.inputsRelevance)) return false;
  }
  if (!isAiModelExtendedConfig(value.modelConfig)) return false;
  return true;
}

export function isGetSortedCompressionCandidatesPayload(
  value: unknown,
): value is GetSortedCompressionCandidatesPayload {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.documents)) return false;
  if (!value.documents.every((d: unknown) => isResourceDocument(d))) return false;
  if (!Array.isArray(value.history)) return false;
  if (!value.history.every((m: unknown) => isMessages(m))) return false;
  return true;
}

export function isGetSortedCompressionCandidatesSuccessReturn(
  value: unknown,
): value is GetSortedCompressionCandidatesSuccessReturn {
  if (!isRecord(value)) return false;
  if ('error' in value) return false;
  if (!Array.isArray(value.candidates)) return false;
  if (!value.candidates.every((c: unknown) => isCompressionCandidate(c))) return false;
  return true;
}

export function isGetSortedCompressionCandidatesErrorReturn(
  value: unknown,
): value is GetSortedCompressionCandidatesErrorReturn {
  if (!isRecord(value)) return false;
  if ('candidates' in value) return false;
  if (!(value.error instanceof Error)) return false;
  if (typeof value.retriable !== 'boolean') return false;
  return true;
}
