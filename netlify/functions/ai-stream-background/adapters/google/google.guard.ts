import type {
  GoogleCandidate,
  GoogleContent,
  GoogleEmbeddingResponse,
  GoogleFinalResponse,
  GoogleFinishReason,
  GooglePart,
  GoogleStreamChunk,
  GoogleTokenCountResponse,
  GoogleUsageMetadata,
} from './google.interface.ts';
import { isPlainRecord } from '../getNodeAiAdapter.guard.ts';

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isGoogleFinishReason(v: unknown): v is GoogleFinishReason {
  if (typeof v !== 'string') {
    return false;
  }
  if (v === 'STOP') {
    return true;
  }
  if (v === 'MAX_TOKENS') {
    return true;
  }
  if (v === 'SAFETY') {
    return true;
  }
  if (v === 'RECITATION') {
    return true;
  }
  return false;
}

export function isGooglePart(v: unknown): v is GooglePart {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('text' in v)) {
    return true;
  }
  const textValue: unknown = v['text'];
  if (textValue === undefined) {
    return true;
  }
  return typeof textValue === 'string';
}

export function isGoogleContent(v: unknown): v is GoogleContent {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('parts' in v)) {
    return false;
  }
  const partsValue: unknown = v['parts'];
  if (!Array.isArray(partsValue)) {
    return false;
  }
  for (const element of partsValue) {
    if (!isGooglePart(element)) {
      return false;
    }
  }
  return true;
}

export function isGoogleCandidate(v: unknown): v is GoogleCandidate {
  if (!isPlainRecord(v)) {
    return false;
  }
  if ('finishReason' in v) {
    const finishReasonValue: unknown = v['finishReason'];
    if (finishReasonValue !== undefined && !isGoogleFinishReason(finishReasonValue)) {
      return false;
    }
  }
  if ('content' in v) {
    const contentValue: unknown = v['content'];
    if (contentValue !== undefined && !isGoogleContent(contentValue)) {
      return false;
    }
  }
  return true;
}

export function isGoogleUsageMetadata(v: unknown): v is GoogleUsageMetadata {
  if (!isPlainRecord(v)) {
    return false;
  }
  const promptTokenCount: unknown = v['promptTokenCount'];
  const candidatesTokenCount: unknown = v['candidatesTokenCount'];
  const totalTokenCount: unknown = v['totalTokenCount'];
  if (
    !isNonNegativeInteger(promptTokenCount) ||
    !isNonNegativeInteger(candidatesTokenCount) ||
    !isNonNegativeInteger(totalTokenCount)
  ) {
    return false;
  }
  return true;
}

export function isGoogleStreamChunk(v: unknown): v is GoogleStreamChunk {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('candidates' in v)) {
    return true;
  }
  const candidatesValue: unknown = v['candidates'];
  if (candidatesValue === undefined) {
    return true;
  }
  if (!Array.isArray(candidatesValue)) {
    return false;
  }
  for (const element of candidatesValue) {
    if (!isGoogleCandidate(element)) {
      return false;
    }
  }
  return true;
}

export function isGoogleFinalResponse(v: unknown): v is GoogleFinalResponse {
  if (!isPlainRecord(v)) {
    return false;
  }
  if ('candidates' in v) {
    const candidatesValue: unknown = v['candidates'];
    if (candidatesValue !== undefined) {
      if (!Array.isArray(candidatesValue)) {
        return false;
      }
      for (const element of candidatesValue) {
        if (!isGoogleCandidate(element)) {
          return false;
        }
      }
    }
  }
  if ('usageMetadata' in v) {
    const usageMetadataValue: unknown = v['usageMetadata'];
    if (usageMetadataValue !== null && usageMetadataValue !== undefined) {
      if (!isGoogleUsageMetadata(usageMetadataValue)) {
        return false;
      }
    }
  }
  return true;
}

export function isGoogleEmbeddingResponse(v: unknown): v is GoogleEmbeddingResponse {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('embedding' in v)) {
    return false;
  }
  const embeddingValue: unknown = v['embedding'];
  if (!isPlainRecord(embeddingValue)) {
    return false;
  }
  if (!('values' in embeddingValue)) {
    return false;
  }
  const valuesValue: unknown = embeddingValue['values'];
  if (!Array.isArray(valuesValue)) {
    return false;
  }
  for (const element of valuesValue) {
    if (typeof element !== 'number') {
      return false;
    }
  }
  return true;
}

export function isGoogleTokenCountResponse(v: unknown): v is GoogleTokenCountResponse {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('totalTokenCount' in v)) {
    return false;
  }
  const totalTokenCount: unknown = v['totalTokenCount'];
  return isNonNegativeInteger(totalTokenCount);
}
