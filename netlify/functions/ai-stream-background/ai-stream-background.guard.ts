import type {
  AiStreamDeps,
  AiStreamEvent,
  AiStreamPayload,
} from './ai-stream-background.interface.ts';
import {
  isNodeChatApiRequest,
  isNodeModelConfig,
  isNodeTokenUsage,
  isPlainRecord,
} from './adapters/getNodeAiAdapter.guard.ts';

export function isAiStreamEvent(v: unknown): v is AiStreamEvent {
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
  return true;
}

export function isAiStreamPayload(v: unknown): v is AiStreamPayload {
  if (!isPlainRecord(v)) {
    return false;
  }
  const jobIdValue: unknown = v['job_id'];
  const assembledContentValue: unknown = v['assembled_content'];
  if (typeof jobIdValue !== 'string') {
    return false;
  }
  if (typeof assembledContentValue !== 'string') {
    return false;
  }
  if (!('token_usage' in v)) {
    return false;
  }
  const tokenUsageValue: unknown = v['token_usage'];
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
  if (!('sig' in v)) {
    return false;
  }
  const sigValue: unknown = v['sig'];
  if (typeof sigValue !== 'string') {
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
