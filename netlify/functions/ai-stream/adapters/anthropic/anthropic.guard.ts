import type {
  AnthropicContentBlockDeltaEvent,
  AnthropicFinalMessage,
  AnthropicStopReason,
  AnthropicTextDelta,
  AnthropicUsage,
} from './anthropic.interface.ts';
import { isPlainRecord } from '../getNodeAiAdapter.guard.ts';

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isAnthropicStopReason(v: unknown): v is AnthropicStopReason {
  if (typeof v !== 'string') {
    return false;
  }
  if (v === 'end_turn') {
    return true;
  }
  if (v === 'stop_sequence') {
    return true;
  }
  if (v === 'max_tokens') {
    return true;
  }
  if (v === 'tool_use') {
    return true;
  }
  return false;
}

export function isAnthropicTextDelta(v: unknown): v is AnthropicTextDelta {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('type' in v)) {
    return false;
  }
  if (!('text' in v)) {
    return false;
  }
  const typeValue: unknown = v['type'];
  const textValue: unknown = v['text'];
  if (typeValue !== 'text_delta') {
    return false;
  }
  if (typeof textValue !== 'string') {
    return false;
  }
  return true;
}

export function isAnthropicContentBlockDeltaEvent(
  v: unknown,
): v is AnthropicContentBlockDeltaEvent {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('type' in v)) {
    return false;
  }
  if (!('delta' in v)) {
    return false;
  }
  const typeValue: unknown = v['type'];
  if (typeValue !== 'content_block_delta') {
    return false;
  }
  const deltaValue: unknown = v['delta'];
  return isAnthropicTextDelta(deltaValue);
}

export function isAnthropicUsage(v: unknown): v is AnthropicUsage {
  if (!isPlainRecord(v)) {
    return false;
  }
  const inputTokens: unknown = v['input_tokens'];
  const outputTokens: unknown = v['output_tokens'];
  if (!isNonNegativeInteger(inputTokens) || !isNonNegativeInteger(outputTokens)) {
    return false;
  }
  return true;
}

export function isAnthropicFinalMessage(v: unknown): v is AnthropicFinalMessage {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('usage' in v)) {
    return false;
  }
  if (!('stop_reason' in v)) {
    return false;
  }
  const usageValue: unknown = v['usage'];
  if (!isAnthropicUsage(usageValue)) {
    return false;
  }
  const stopReasonValue: unknown = v['stop_reason'];
  if (stopReasonValue === null) {
    return true;
  }
  return isAnthropicStopReason(stopReasonValue);
}
