export type OpenAIFinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'function_call';

export interface OpenAIDelta {
  content?: string | null;
}

export interface OpenAIChoice {
  delta: OpenAIDelta;
  finish_reason: OpenAIFinishReason | null;
}

export interface OpenAIUsageDelta {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatCompletionChunk {
  choices: OpenAIChoice[];
  usage?: OpenAIUsageDelta | null;
}
