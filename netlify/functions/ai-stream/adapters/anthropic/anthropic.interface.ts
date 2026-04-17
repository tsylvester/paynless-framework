export type AnthropicStopReason =
  | 'end_turn'
  | 'stop_sequence'
  | 'max_tokens'
  | 'tool_use';

export interface AnthropicTextDelta {
  type: 'text_delta';
  text: string;
}

export interface AnthropicContentBlockDeltaEvent {
  type: 'content_block_delta';
  delta: AnthropicTextDelta;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicFinalMessage {
  usage: AnthropicUsage;
  stop_reason: AnthropicStopReason | null;
}
