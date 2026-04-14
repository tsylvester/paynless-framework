import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
  NodeProviderMap,
  NodeTokenUsage,
} from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';

export function isNodeChatMessage(v: unknown): v is NodeChatMessage {
  if (v === null || typeof v !== 'object') {
    return false;
  }
  if (!('role' in v) || !('content' in v)) {
    return false;
  }
  const role: unknown = Reflect.get(v, 'role');
  const content: unknown = Reflect.get(v, 'content');
  if (role !== 'user' && role !== 'assistant' && role !== 'system') {
    return false;
  }
  if (typeof content !== 'string') {
    return false;
  }
  return true;
}

export function isNodeChatApiRequest(v: unknown): v is NodeChatApiRequest {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const messagesUnknown: unknown = Reflect.get(v, 'messages');
  if (!Array.isArray(messagesUnknown) || messagesUnknown.length === 0) {
    return false;
  }
  for (const message of messagesUnknown) {
    if (!isNodeChatMessage(message)) {
      return false;
    }
  }
  const modelUnknown: unknown = Reflect.get(v, 'model');
  if (typeof modelUnknown !== 'string') {
    return false;
  }
  const maxTokensUnknown: unknown = Reflect.get(v, 'max_tokens');
  if (typeof maxTokensUnknown !== 'number') {
    return false;
  }
  const systemUnknown: unknown = Reflect.get(v, 'system');
  if (systemUnknown !== undefined && typeof systemUnknown !== 'string') {
    return false;
  }
  return true;
}

export function isNodeModelConfig(v: unknown): v is NodeModelConfig {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const modelIdUnknown: unknown = Reflect.get(v, 'model_identifier');
  if (typeof modelIdUnknown !== 'string' || modelIdUnknown.length === 0) {
    return false;
  }
  const maxTokensUnknown: unknown = Reflect.get(v, 'max_tokens');
  if (
    typeof maxTokensUnknown !== 'number' ||
    !Number.isInteger(maxTokensUnknown) ||
    maxTokensUnknown <= 0
  ) {
    return false;
  }
  return true;
}

export function isNodeTokenUsage(v: unknown): v is NodeTokenUsage {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const promptUnknown: unknown = Reflect.get(v, 'prompt_tokens');
  if (typeof promptUnknown !== 'number' || !Number.isInteger(promptUnknown) || promptUnknown < 0) {
    return false;
  }
  const completionUnknown: unknown = Reflect.get(v, 'completion_tokens');
  if (
    typeof completionUnknown !== 'number' ||
    !Number.isInteger(completionUnknown) ||
    completionUnknown < 0
  ) {
    return false;
  }
  const totalUnknown: unknown = Reflect.get(v, 'total_tokens');
  if (typeof totalUnknown !== 'number' || !Number.isInteger(totalUnknown) || totalUnknown < 0) {
    return false;
  }
  return true;
}

export function isAiAdapterParams(v: unknown): v is AiAdapterParams {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const chatUnknown: unknown = Reflect.get(v, 'chatApiRequest');
  if (!isNodeChatApiRequest(chatUnknown)) {
    return false;
  }
  const modelConfigUnknown: unknown = Reflect.get(v, 'modelConfig');
  if (!isNodeModelConfig(modelConfigUnknown)) {
    return false;
  }
  const apiKeyUnknown: unknown = Reflect.get(v, 'apiKey');
  if (typeof apiKeyUnknown !== 'string' || apiKeyUnknown.length === 0) {
    return false;
  }
  return true;
}

export function isAiAdapterResult(v: unknown): v is AiAdapterResult {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const assembledUnknown: unknown = Reflect.get(v, 'assembled_content');
  if (typeof assembledUnknown !== 'string') {
    return false;
  }
  const tokenUsageUnknown: unknown = Reflect.get(v, 'token_usage');
  if (tokenUsageUnknown === null) {
    return true;
  }
  return isNodeTokenUsage(tokenUsageUnknown);
}

export function isAiAdapter(v: unknown): v is AiAdapter {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const streamUnknown: unknown = Reflect.get(v, 'stream');
  if (typeof streamUnknown !== 'function') {
    return false;
  }
  return true;
}

export function isNodeProviderMap(v: unknown): v is NodeProviderMap {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const keys: string[] = Object.keys(v);
  if (keys.length === 0) {
    return false;
  }
  for (const key of keys) {
    const factoryUnknown: unknown = Reflect.get(v, key);
    if (typeof factoryUnknown !== 'function') {
      return false;
    }
  }
  return true;
}

export function isGetNodeAiAdapterDeps(v: unknown): v is GetNodeAiAdapterDeps {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (!('providerMap' in v)) {
    return false;
  }
  const providerMapUnknown: unknown = Reflect.get(v, 'providerMap');
  return isNodeProviderMap(providerMapUnknown);
}

export function isGetNodeAiAdapterParams(v: unknown): v is GetNodeAiAdapterParams {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const apiIdentifierUnknown: unknown = Reflect.get(v, 'apiIdentifier');
  if (typeof apiIdentifierUnknown !== 'string' || apiIdentifierUnknown.length === 0) {
    return false;
  }
  const apiKeyUnknown: unknown = Reflect.get(v, 'apiKey');
  if (typeof apiKeyUnknown !== 'string' || apiKeyUnknown.length === 0) {
    return false;
  }
  return true;
}
