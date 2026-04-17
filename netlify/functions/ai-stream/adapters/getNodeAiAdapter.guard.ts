import type {
  AiAdapter,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
  NodeOutboundDocument,
  NodeProviderMap,
  NodeTokenUsage,
} from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return true;
}

export function isNodeChatMessage(v: unknown): v is NodeChatMessage {
  if (!isPlainRecord(v)) {
    return false;
  }
  const roleValue: unknown = v['role'];
  const contentValue: unknown = v['content'];
  if (
    roleValue !== 'user' &&
    roleValue !== 'assistant' &&
    roleValue !== 'system'
  ) {
    return false;
  }
  if (typeof contentValue !== 'string') {
    return false;
  }
  return true;
}

export function isNodeOutboundDocument(v: unknown): v is NodeOutboundDocument {
  if (!isPlainRecord(v)) {
    return false;
  }
  const idValue: unknown = v['id'];
  const contentValue: unknown = v['content'];
  if (typeof idValue !== 'string' || typeof contentValue !== 'string') {
    return false;
  }
  if ('document_key' in v && v['document_key'] !== undefined) {
    if (typeof v['document_key'] !== 'string') {
      return false;
    }
  }
  if ('stage_slug' in v && v['stage_slug'] !== undefined) {
    if (typeof v['stage_slug'] !== 'string') {
      return false;
    }
  }
  return true;
}

export function isNodeChatApiRequest(v: unknown): v is NodeChatApiRequest {
  if (!isPlainRecord(v)) {
    return false;
  }
  const messageValue: unknown = v['message'];
  const providerIdValue: unknown = v['providerId'];
  const promptIdValue: unknown = v['promptId'];
  if (
    typeof messageValue !== 'string' ||
    typeof providerIdValue !== 'string' ||
    typeof promptIdValue !== 'string'
  ) {
    return false;
  }
  if ('messages' in v && v['messages'] !== undefined) {
    const messagesValue: unknown = v['messages'];
    if (!Array.isArray(messagesValue)) {
      return false;
    }
    for (const item of messagesValue) {
      if (!isNodeChatMessage(item)) {
        return false;
      }
    }
  }
  if ('resourceDocuments' in v && v['resourceDocuments'] !== undefined) {
    const docsValue: unknown = v['resourceDocuments'];
    if (!Array.isArray(docsValue)) {
      return false;
    }
    for (const item of docsValue) {
      if (!isNodeOutboundDocument(item)) {
        return false;
      }
    }
  }
  if ('max_tokens_to_generate' in v && v['max_tokens_to_generate'] !== undefined) {
    if (typeof v['max_tokens_to_generate'] !== 'number') {
      return false;
    }
  }
  return true;
}

export function isNodeModelConfig(v: unknown): v is NodeModelConfig {
  if (!isPlainRecord(v)) {
    return false;
  }
  const apiIdentifierValue: unknown = v['api_identifier'];
  if (typeof apiIdentifierValue !== 'string') {
    return false;
  }
  if (!('input_token_cost_rate' in v)) {
    return false;
  }
  const inputRate: unknown = v['input_token_cost_rate'];
  if (typeof inputRate !== 'number' && inputRate !== null) {
    return false;
  }
  if (!('output_token_cost_rate' in v)) {
    return false;
  }
  const outputRate: unknown = v['output_token_cost_rate'];
  if (typeof outputRate !== 'number' && outputRate !== null) {
    return false;
  }
  if (
    'provider_max_input_tokens' in v &&
    v['provider_max_input_tokens'] !== undefined
  ) {
    if (typeof v['provider_max_input_tokens'] !== 'number') {
      return false;
    }
  }
  if (
    'context_window_tokens' in v &&
    v['context_window_tokens'] !== undefined
  ) {
    const cw: unknown = v['context_window_tokens'];
    if (typeof cw !== 'number' && cw !== null) {
      return false;
    }
  }
  if (
    'hard_cap_output_tokens' in v &&
    v['hard_cap_output_tokens'] !== undefined
  ) {
    if (typeof v['hard_cap_output_tokens'] !== 'number') {
      return false;
    }
  }
  if (
    'provider_max_output_tokens' in v &&
    v['provider_max_output_tokens'] !== undefined
  ) {
    if (typeof v['provider_max_output_tokens'] !== 'number') {
      return false;
    }
  }
  return true;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isNodeTokenUsage(v: unknown): v is NodeTokenUsage {
  if (!isPlainRecord(v)) {
    return false;
  }
  const promptTokens: unknown = v['prompt_tokens'];
  const completionTokens: unknown = v['completion_tokens'];
  const totalTokens: unknown = v['total_tokens'];
  if (
    !isNonNegativeInteger(promptTokens) ||
    !isNonNegativeInteger(completionTokens) ||
    !isNonNegativeInteger(totalTokens)
  ) {
    return false;
  }
  return true;
}

export function isNodeAdapterStreamChunk(
  v: unknown,
): v is NodeAdapterStreamChunk {
  if (!isPlainRecord(v)) {
    return false;
  }
  const typeValue: unknown = v['type'];
  if (typeValue === 'text_delta') {
    const textValue: unknown = v['text'];
    return typeof textValue === 'string';
  }
  if (typeValue === 'usage') {
    const tokenUsageValue: unknown = v['tokenUsage'];
    return isNodeTokenUsage(tokenUsageValue);
  }
  if (typeValue === 'done') {
    const finishReason: unknown = v['finish_reason'];
    return typeof finishReason === 'string';
  }
  return false;
}

export function isAiAdapter(v: unknown): v is AiAdapter {
  if (!isPlainRecord(v)) {
    return false;
  }
  const streamValue: unknown = v['sendMessageStream'];
  return typeof streamValue === 'function';
}

export function isNodeProviderMap(v: unknown): v is NodeProviderMap {
  if (!isPlainRecord(v)) {
    return false;
  }
  const keys: string[] = Object.keys(v);
  if (keys.length === 0) {
    return false;
  }
  for (const key of keys) {
    const factoryValue: unknown = v[key];
    if (typeof factoryValue !== 'function') {
      return false;
    }
  }
  return true;
}

export function isGetNodeAiAdapterDeps(v: unknown): v is GetNodeAiAdapterDeps {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('providerMap' in v)) {
    return false;
  }
  const mapValue: unknown = v['providerMap'];
  return isNodeProviderMap(mapValue);
}

export function isGetNodeAiAdapterParams(
  v: unknown,
): v is GetNodeAiAdapterParams {
  if (!isPlainRecord(v)) {
    return false;
  }
  const apiIdentifierValue: unknown = v['apiIdentifier'];
  const apiKeyValue: unknown = v['apiKey'];
  const modelConfigValue: unknown = v['modelConfig'];
  if (typeof apiIdentifierValue !== 'string' || apiIdentifierValue.length === 0) {
    return false;
  }
  if (typeof apiKeyValue !== 'string' || apiKeyValue.length === 0) {
    return false;
  }
  return isNodeModelConfig(modelConfigValue);
}
