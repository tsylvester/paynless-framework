import type { GoogleStreamChunk, GoogleUsageMetadata } from './google.interface.ts';

export function isGoogleUsageMetadata(v: unknown): v is GoogleUsageMetadata {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (
    !('promptTokenCount' in v) ||
    !('candidatesTokenCount' in v) ||
    !('totalTokenCount' in v)
  ) {
    return false;
  }
  const promptTokenCount: unknown = Reflect.get(v, 'promptTokenCount');
  const candidatesTokenCount: unknown = Reflect.get(v, 'candidatesTokenCount');
  const totalTokenCount: unknown = Reflect.get(v, 'totalTokenCount');
  if (typeof promptTokenCount !== 'number') {
    return false;
  }
  if (typeof candidatesTokenCount !== 'number') {
    return false;
  }
  if (typeof totalTokenCount !== 'number') {
    return false;
  }
  if (!Number.isInteger(promptTokenCount) || promptTokenCount < 0) {
    return false;
  }
  if (!Number.isInteger(candidatesTokenCount) || candidatesTokenCount < 0) {
    return false;
  }
  if (!Number.isInteger(totalTokenCount) || totalTokenCount < 0) {
    return false;
  }
  return true;
}

export function isGoogleStreamChunk(v: unknown): v is GoogleStreamChunk {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (!('text' in v)) {
    return false;
  }
  const text: unknown = Reflect.get(v, 'text');
  if (typeof text !== 'function') {
    return false;
  }
  if ('usageMetadata' in v) {
    const usageMetadata: unknown = Reflect.get(v, 'usageMetadata');
    if (usageMetadata !== undefined && !isGoogleUsageMetadata(usageMetadata)) {
      return false;
    }
  }
  return true;
}
