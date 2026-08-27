import { isRecord } from "../type-guards/type_guards.common.ts";
import { isFileType, isCompressionSourceType } from "../type-guards/type_guards.file_manager.ts";
import { isInputRuleType } from "../type-guards/type_guards.dialectic.ts";
import type {
  ResourceDocument,
  CompressibleInputRuleType,
  ResolveCompressionSourceDeps,
  ResolveCompressionSourceParams,
  ResolveCompressionSourcePayload,
  CompressibleSourceReturn,
  NotCompressibleSourceReturn,
  ResolveCompressionSourceSuccessReturn,
  ResolveCompressionSourceErrorReturn,
} from "./resolveCompressionSource.interface.ts";

export function isResourceDocument(value: unknown): value is ResourceDocument {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.content !== 'string') return false;
  if (!isFileType(value.document_key)) return false;
  if (typeof value.stage_slug !== 'string') return false;
  if (!isInputRuleType(value.type)) return false;
  return true;
}

export function isCompressibleInputRuleType(value: unknown): value is CompressibleInputRuleType {
  return value === 'document' || value === 'feedback' || value === 'project_resource';
}

export function isResolveCompressionSourceDeps(value: unknown): value is ResolveCompressionSourceDeps {
  if (!isRecord(value)) return false;
  if (!('logger' in value)) return false;
  const logger = value.logger;
  if (!isRecord(logger)) return false;
  if (typeof logger.debug !== 'function') return false;
  if (typeof logger.info !== 'function') return false;
  if (typeof logger.warn !== 'function') return false;
  if (typeof logger.error !== 'function') return false;
  return true;
}

export function isResolveCompressionSourceParams(value: unknown): value is ResolveCompressionSourceParams {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 0;
}

export function isResolveCompressionSourcePayload(value: unknown): value is ResolveCompressionSourcePayload {
  if (!isRecord(value)) return false;
  if (!('document' in value)) return false;
  if (!isResourceDocument(value.document)) return false;
  return true;
}

export function isCompressibleSourceReturn(value: unknown): value is CompressibleSourceReturn {
  if (!isRecord(value)) return false;
  if (value.compressible !== true) return false;
  if (!isCompressionSourceType(value.sourceType)) return false;
  if (!isFileType(value.documentKey)) return false;
  return true;
}

export function isNotCompressibleSourceReturn(value: unknown): value is NotCompressibleSourceReturn {
  if (!isRecord(value)) return false;
  if (value.compressible !== false) return false;
  return true;
}

export function isResolveCompressionSourceSuccessReturn(value: unknown): value is ResolveCompressionSourceSuccessReturn {
  return isCompressibleSourceReturn(value) || isNotCompressibleSourceReturn(value);
}

export function isResolveCompressionSourceErrorReturn(value: unknown): value is ResolveCompressionSourceErrorReturn {
  if (!isRecord(value)) return false;
  if (!(value.error instanceof Error)) return false;
  if (typeof value.retriable !== 'boolean') return false;
  return true;
}
