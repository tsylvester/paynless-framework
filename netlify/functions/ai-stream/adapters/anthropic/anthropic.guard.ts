import type {
  AnthropicMessageDeltaEvent,
  AnthropicMessageStartEvent,
  AnthropicTextDeltaEvent,
} from './anthropic.interface.ts';

export function isAnthropicMessageStartEvent(
  v: unknown,
): v is AnthropicMessageStartEvent {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const typeUnknown: unknown = Reflect.get(v, 'type');
  if (typeUnknown !== 'message_start') {
    return false;
  }
  if (!('message' in v)) {
    return false;
  }
  const message: unknown = Reflect.get(v, 'message');
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return false;
  }
  if (!('usage' in message)) {
    return false;
  }
  const usage: unknown = Reflect.get(message, 'usage');
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) {
    return false;
  }
  if (!('input_tokens' in usage)) {
    return false;
  }
  const inputTokens: unknown = Reflect.get(usage, 'input_tokens');
  if (typeof inputTokens !== 'number') {
    return false;
  }
  if (!Number.isInteger(inputTokens) || inputTokens < 0) {
    return false;
  }
  return true;
}

export function isAnthropicTextDeltaEvent(
  v: unknown,
): v is AnthropicTextDeltaEvent {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const typeUnknown: unknown = Reflect.get(v, 'type');
  if (typeUnknown !== 'content_block_delta') {
    return false;
  }
  if (!('delta' in v)) {
    return false;
  }
  const delta: unknown = Reflect.get(v, 'delta');
  if (delta === null || typeof delta !== 'object' || Array.isArray(delta)) {
    return false;
  }
  const deltaType: unknown = Reflect.get(delta, 'type');
  if (deltaType !== 'text_delta') {
    return false;
  }
  if (!('text' in delta)) {
    return false;
  }
  const text: unknown = Reflect.get(delta, 'text');
  if (typeof text !== 'string') {
    return false;
  }
  return true;
}

export function isAnthropicMessageDeltaEvent(
  v: unknown,
): v is AnthropicMessageDeltaEvent {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const typeUnknown: unknown = Reflect.get(v, 'type');
  if (typeUnknown !== 'message_delta') {
    return false;
  }
  if (!('usage' in v)) {
    return false;
  }
  const usage: unknown = Reflect.get(v, 'usage');
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) {
    return false;
  }
  if (!('output_tokens' in usage)) {
    return false;
  }
  const outputTokens: unknown = Reflect.get(usage, 'output_tokens');
  if (typeof outputTokens !== 'number') {
    return false;
  }
  if (!Number.isInteger(outputTokens) || outputTokens < 0) {
    return false;
  }
  return true;
}
