import type { AiStreamDeps, AiStreamEvent, AiStreamPayload } from './ai-stream.interface.ts';
import {
  isAiAdapter,
  isNodeChatApiRequest,
  isNodeModelConfig,
  isNodeTokenUsage,
} from './adapters/getNodeAiAdapter.guard.ts';

function hasSupportedApiIdentifierPrefix(apiIdentifier: string): boolean {
  return (
    apiIdentifier.startsWith('openai-') ||
    apiIdentifier.startsWith('anthropic-') ||
    apiIdentifier.startsWith('google-')
  );
}

export function isAiStreamEvent(v: unknown): v is AiStreamEvent {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (
    !('job_id' in v) ||
    !('api_identifier' in v) ||
    !('extended_model_config' in v) ||
    !('chat_api_request' in v) ||
    !('user_jwt' in v)
  ) {
    return false;
  }
  const jobIdUnknown: unknown = Reflect.get(v, 'job_id');
  if (typeof jobIdUnknown !== 'string' || jobIdUnknown.length === 0) {
    return false;
  }
  const apiIdentifierUnknown: unknown = Reflect.get(v, 'api_identifier');
  if (
    typeof apiIdentifierUnknown !== 'string' ||
    apiIdentifierUnknown.length === 0
  ) {
    return false;
  }
  if (!hasSupportedApiIdentifierPrefix(apiIdentifierUnknown)) {
    return false;
  }
  const extendedModelConfigUnknown: unknown = Reflect.get(
    v,
    'extended_model_config',
  );
  if (!isNodeModelConfig(extendedModelConfigUnknown)) {
    return false;
  }
  const chatApiRequestUnknown: unknown = Reflect.get(v, 'chat_api_request');
  if (!isNodeChatApiRequest(chatApiRequestUnknown)) {
    return false;
  }
  const userJwtUnknown: unknown = Reflect.get(v, 'user_jwt');
  if (typeof userJwtUnknown !== 'string' || userJwtUnknown.length === 0) {
    return false;
  }
  return true;
}

export function isAiStreamPayload(v: unknown): v is AiStreamPayload {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (
    !('job_id' in v) ||
    !('assembled_content' in v) ||
    !('token_usage' in v)
  ) {
    return false;
  }
  const jobIdUnknown: unknown = Reflect.get(v, 'job_id');
  if (typeof jobIdUnknown !== 'string' || jobIdUnknown.length === 0) {
    return false;
  }
  const assembledContentUnknown: unknown = Reflect.get(v, 'assembled_content');
  if (typeof assembledContentUnknown !== 'string') {
    return false;
  }
  const tokenUsageUnknown: unknown = Reflect.get(v, 'token_usage');
  if (tokenUsageUnknown === null) {
    return true;
  }
  return isNodeTokenUsage(tokenUsageUnknown);
}

export function isAiStreamDeps(v: unknown): v is AiStreamDeps {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (
    !('openaiAdapter' in v) ||
    !('anthropicAdapter' in v) ||
    !('googleAdapter' in v) ||
    !('Url' in v) ||
    !('getApiKey' in v)
  ) {
    return false;
  }
  const openaiAdapterUnknown: unknown = Reflect.get(v, 'openaiAdapter');
  if (!isAiAdapter(openaiAdapterUnknown)) {
    return false;
  }
  const anthropicAdapterUnknown: unknown = Reflect.get(v, 'anthropicAdapter');
  if (!isAiAdapter(anthropicAdapterUnknown)) {
    return false;
  }
  const googleAdapterUnknown: unknown = Reflect.get(v, 'googleAdapter');
  if (!isAiAdapter(googleAdapterUnknown)) {
    return false;
  }
  const urlUnknown: unknown = Reflect.get(v, 'Url');
  if (typeof urlUnknown !== 'string' || urlUnknown.length === 0) {
    return false;
  }
  const getApiKeyUnknown: unknown = Reflect.get(v, 'getApiKey');
  if (typeof getApiKeyUnknown !== 'function') {
    return false;
  }
  return true;
}
