export interface GoogleUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface GoogleStreamChunk {
  text(): string;
  usageMetadata?: GoogleUsageMetadata;
}
