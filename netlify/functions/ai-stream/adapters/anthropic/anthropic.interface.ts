export interface AnthropicMessageStartUsage {
  input_tokens: number;
}

export interface AnthropicMessageStartMessage {
  usage: AnthropicMessageStartUsage;
}

export interface AnthropicMessageStartEvent {
  type: 'message_start';
  message: AnthropicMessageStartMessage;
}

export interface AnthropicTextDeltaInner {
  type: 'text_delta';
  text: string;
}

export interface AnthropicTextDeltaEvent {
  type: 'content_block_delta';
  delta: AnthropicTextDeltaInner;
}

export interface AnthropicMessageDeltaUsage {
  output_tokens: number;
}

export interface AnthropicMessageDeltaEvent {
  type: 'message_delta';
  usage: AnthropicMessageDeltaUsage;
}
