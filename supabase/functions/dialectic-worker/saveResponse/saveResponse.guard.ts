import type {
  SaveResponseDeps,
  SaveResponseErrorReturn,
  SaveResponseParams,
  SaveResponsePayload,
  SaveResponseRequestBody,
  SaveResponseSuccessReturn,
} from './saveResponse.interface.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';

function isNodeTokenUsageShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.prompt_tokens === 'number' &&
    typeof value.completion_tokens === 'number' &&
    typeof value.total_tokens === 'number'
  );
}

function isTokenUsageOrNull(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  return isNodeTokenUsageShape(value);
}

export function isSaveResponseRequestBody(
  v: unknown,
): v is SaveResponseRequestBody {
  if (!isRecord(v)) {
    return false;
  }
  if (!('job_id' in v) || typeof v.job_id !== 'string') {
    return false;
  }
  if (!('assembled_content' in v) || typeof v.assembled_content !== 'string') {
    return false;
  }
  if (!('token_usage' in v)) {
    return false;
  }
  if (!isTokenUsageOrNull(v.token_usage)) {
    return false;
  }
  if (!('finish_reason' in v)) {
    return false;
  }
  if (v.finish_reason !== null && typeof v.finish_reason !== 'string') {
    return false;
  }
  return true;
}

export function isSaveResponseParams(v: unknown): v is SaveResponseParams {
  if (!isRecord(v)) {
    return false;
  }
  if (!('job_id' in v) || typeof v.job_id !== 'string') {
    return false;
  }
  if (!('dbClient' in v)) {
    return false;
  }
  const dbClient: unknown = v.dbClient;
  if (
    dbClient === null ||
    typeof dbClient !== 'object' ||
    Array.isArray(dbClient)
  ) {
    return false;
  }
  return true;
}

export function isSaveResponsePayload(v: unknown): v is SaveResponsePayload {
  if (!isRecord(v)) {
    return false;
  }
  if (!('assembled_content' in v) || typeof v.assembled_content !== 'string') {
    return false;
  }
  if (!('token_usage' in v)) {
    return false;
  }
  if (!isTokenUsageOrNull(v.token_usage)) {
    return false;
  }
  if (!('finish_reason' in v)) {
    return false;
  }
  if (v.finish_reason !== null && typeof v.finish_reason !== 'string') {
    return false;
  }
  return true;
}

export function isSaveResponseDeps(v: unknown): v is SaveResponseDeps {
  if (!isRecord(v)) {
    return false;
  }
  const keys: (keyof SaveResponseDeps)[] = [
    'logger',
    'fileManager',
    'notificationService',
    'continueJob',
    'retryJob',
    'resolveFinishReason',
    'isIntermediateChunk',
    'determineContinuation',
    'buildUploadContext',
    'debitTokens',
    'sanitizeJsonContent',
    'enqueueRenderJob',
  ];
  for (let i = 0; i < keys.length; i++) {
    const key: keyof SaveResponseDeps = keys[i];
    if (!(key in v)) {
      return false;
    }
  }
  if (
    typeof v.logger !== 'object' ||
    v.logger === null ||
    Array.isArray(v.logger)
  ) {
    return false;
  }
  if (
    typeof v.fileManager !== 'object' ||
    v.fileManager === null ||
    Array.isArray(v.fileManager)
  ) {
    return false;
  }
  if (
    typeof v.notificationService !== 'object' ||
    v.notificationService === null ||
    Array.isArray(v.notificationService)
  ) {
    return false;
  }
  if (typeof v.continueJob !== 'function') {
    return false;
  }
  if (typeof v.retryJob !== 'function') {
    return false;
  }
  if (typeof v.resolveFinishReason !== 'function') {
    return false;
  }
  if (typeof v.isIntermediateChunk !== 'function') {
    return false;
  }
  if (typeof v.determineContinuation !== 'function') {
    return false;
  }
  if (typeof v.buildUploadContext !== 'function') {
    return false;
  }
  if (typeof v.debitTokens !== 'function') {
    return false;
  }
  if (typeof v.sanitizeJsonContent !== 'function') {
    return false;
  }
  if (typeof v.enqueueRenderJob !== 'function') {
    return false;
  }
  return true;
}

export function isSaveResponseSuccessReturn(
  v: unknown,
): v is SaveResponseSuccessReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!('status' in v) || typeof v.status !== 'string') {
    return false;
  }
  if (
    v.status !== 'completed' &&
    v.status !== 'needs_continuation' &&
    v.status !== 'continuation_limit_reached'
  ) {
    return false;
  }
  return true;
}

export function isSaveResponseErrorReturn(
  v: unknown,
): v is SaveResponseErrorReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!('error' in v) || !(v.error instanceof Error)) {
    return false;
  }
  if (!('retriable' in v) || typeof v.retriable !== 'boolean') {
    return false;
  }
  return true;
}
