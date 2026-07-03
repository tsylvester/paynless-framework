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

export type AnthropicEmbeddingVectorItem = number;

export interface AnthropicEmbeddingUsage {
  input_tokens: number;
  total_tokens: number;
}

export interface AnthropicEmbeddingResponse {
  embedding: AnthropicEmbeddingVectorItem[];
  usage: AnthropicEmbeddingUsage;
}

export interface AnthropicFinalMessage {
  usage: AnthropicUsage;
  stop_reason: AnthropicStopReason | null;
}
