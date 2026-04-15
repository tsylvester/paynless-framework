export interface OpenAIChoiceDeltaInner {
  content?: string | null;
}

export interface OpenAIChoiceDelta {
  delta: OpenAIChoiceDeltaInner;
}

export interface OpenAIUsageDelta {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatCompletionChunk {
  choices: OpenAIChoiceDelta[];
  usage?: OpenAIUsageDelta | null;
}
