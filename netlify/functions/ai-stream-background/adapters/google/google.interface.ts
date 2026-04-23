export type GoogleFinishReason =
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION';

export interface GooglePart {
  text?: string;
}

export interface GoogleContent {
  parts: GooglePart[];
}

export interface GoogleCandidate {
  content?: GoogleContent;
  finishReason?: GoogleFinishReason;
}

export interface GoogleUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface GoogleStreamChunk {
  candidates?: GoogleCandidate[];
}

export interface GoogleFinalResponse {
  candidates?: GoogleCandidate[];
  usageMetadata?: GoogleUsageMetadata | null;
}
