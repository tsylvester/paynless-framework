import type {
  AiStreamDeps,
  AiWorkloadEvent,
  AiWorkloadOperation,
  AiWorkloadPayload,
} from './ai-stream-background.interface.ts';
import {
  isNodeChatApiRequest,
  isNodeModelConfig,
  isNodeTokenUsage,
  isNodeUserConfig,
  isPlainRecord,
} from './adapters/getNodeAiAdapter.guard.ts';

function isAiWorkloadOperation(value: unknown): value is AiWorkloadOperation {
  return value === 'stream' || value === 'embedding';
}

function isNodeEmbeddingRequest(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  if (!('input' in value)) {
    return false;
  }
  const inputValue: unknown = value['input'];
  if (typeof inputValue !== 'string') {
    return false;
  }
  return inputValue.length > 0;
}

function isNodeEmbeddingVector(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length === 0) {
    return false;
  }
  for (const item of value) {
    if (typeof item !== 'number') {
      return false;
    }
  }
  return true;
}

export function isAiWorkloadEvent(v: unknown): v is AiWorkloadEvent {
  if (!isPlainRecord(v)) {
    return false;
  }
  const jobIdValue: unknown = v['job_id'];
  const apiIdentifierValue: unknown = v['api_identifier'];
  const sigValue: unknown = v['sig'];
  if (typeof jobIdValue !== 'string') {
    return false;
  }
  if (typeof apiIdentifierValue !== 'string') {
    return false;
  }
  if (typeof sigValue !== 'string') {
    return false;
  }
  if (!('model_config' in v)) {
    return false;
  }
  const modelConfigValue: unknown = v['model_config'];
  if (!isNodeModelConfig(modelConfigValue)) {
    return false;
  }
  if (!('user_config' in v) || !isNodeUserConfig(v['user_config'])) {
    return false;
  }
  if (!('operation' in v)) {
    return false;
  }
  const operationValue: unknown = v['operation'];
  if (!isAiWorkloadOperation(operationValue)) {
    return false;
  }
  if (operationValue === 'stream') {
    if (!('chat_api_request' in v)) {
      return false;
    }
    const chatApiValue: unknown = v['chat_api_request'];
    if (!isNodeChatApiRequest(chatApiValue)) {
      return false;
    }
    if (chatApiValue.message.length === 0) {
      return false;
    }
    if ('embedding_api_request' in v) {
      return false;
    }
    return true;
  }
  if (!('embedding_api_request' in v)) {
    return false;
  }
  const embeddingRequestValue: unknown = v['embedding_api_request'];
  if (!isNodeEmbeddingRequest(embeddingRequestValue)) {
    return false;
  }
  if ('chat_api_request' in v) {
    return false;
  }
  return true;
}

export function isAiWorkloadPayload(v: unknown): v is AiWorkloadPayload {
  if (!isPlainRecord(v)) {
    return false;
  }
  const jobIdValue: unknown = v['job_id'];
  const sigValue: unknown = v['sig'];
  if (typeof jobIdValue !== 'string' || typeof sigValue !== 'string') {
    return false;
  }
  if (!('operation' in v)) {
    return false;
  }
  const operationValue: unknown = v['operation'];
  if (!isAiWorkloadOperation(operationValue)) {
    return false;
  }
  if (!('token_usage' in v)) {
    return false;
  }
  const tokenUsageValue: unknown = v['token_usage'];

  if (operationValue === 'stream') {
    if (!('assembled_content' in v)) {
      return false;
    }
    const assembledContentValue: unknown = v['assembled_content'];
    if (typeof assembledContentValue !== 'string') {
      return false;
    }
    if (tokenUsageValue !== null && !isNodeTokenUsage(tokenUsageValue)) {
      return false;
    }
    if (!('finish_reason' in v)) {
      return false;
    }
    const finishReasonValue: unknown = v['finish_reason'];
    if (finishReasonValue !== null && typeof finishReasonValue !== 'string') {
      return false;
    }
    if ('embedding' in v) {
      return false;
    }
    return true;
  }

  if (!isNodeTokenUsage(tokenUsageValue)) {
    return false;
  }
  if (!('embedding' in v)) {
    return false;
  }
  const embeddingValue: unknown = v['embedding'];
  if (!isNodeEmbeddingVector(embeddingValue)) {
    return false;
  }
  if ('assembled_content' in v || 'finish_reason' in v) {
    return false;
  }
  return true;
}

function isAiStreamDepsProviderMap(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const keys: string[] = Object.keys(value);
  for (const key of keys) {
    const factoryValue: unknown = value[key];
    if (typeof factoryValue !== 'function') {
      return false;
    }
  }
  return true;
}

export function isAiStreamDeps(v: unknown): v is AiStreamDeps {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('providerMap' in v)) {
    return false;
  }
  const providerMapValue: unknown = v['providerMap'];
  if (!isAiStreamDepsProviderMap(providerMapValue)) {
    return false;
  }
  if (!('saveResponseUrl' in v)) {
    return false;
  }
  const saveResponseUrlValue: unknown = v['saveResponseUrl'];
  if (typeof saveResponseUrlValue !== 'string') {
    return false;
  }
  if (!('getApiKey' in v)) {
    return false;
  }
  const getApiKeyValue: unknown = v['getApiKey'];
  if (typeof getApiKeyValue !== 'function') {
    return false;
  }
  return true;
}
