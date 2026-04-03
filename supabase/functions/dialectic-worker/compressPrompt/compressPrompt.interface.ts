// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.interface.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  ILogger,
  Messages,
  ResourceDocuments,
} from "../../_shared/types.ts";
import type { CountTokensDeps, CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { IEmbeddingClient } from "../../_shared/services/indexing_service.interface.ts";
import type { IRagService } from "../../_shared/services/rag_service.interface.ts";
import type { ITokenWalletService } from "../../_shared/types/tokenWallet.types.ts";
import type { RelevanceRule } from "../../dialectic-service/dialectic.interface.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";

export interface CompressPromptDeps {
  logger: ILogger;
  ragService: IRagService;
  embeddingClient: IEmbeddingClient;
  tokenWalletService: ITokenWalletService;
  countTokens: CountTokensFn;
}

export interface CompressPromptParams {
  dbClient: SupabaseClient<Database>;
  jobId: string;
  projectOwnerUserId: string;
  sessionId: string;
  stageSlug: string;
  walletId: string;
  extendedModelConfig: AiModelExtendedConfig;
  inputsRelevance: RelevanceRule[];
  inputRate: number;
  outputRate: number;
  isContinuationFlowInitial: boolean;
  finalTargetThreshold: number;
  balanceAfterCompression: number;
  walletBalance: number;
}

export interface CompressPromptPayload {
  compressionStrategy: ICompressionStrategy;
  resourceDocuments: ResourceDocuments;
  conversationHistory: Messages[];
  currentUserPrompt: string;
  chatApiRequest: ChatApiRequest;
  tokenizerDeps: CountTokensDeps;
}

export interface CompressPromptSuccessReturn {
  chatApiRequest: ChatApiRequest;
  resolvedInputTokenCount: number;
  resourceDocuments: ResourceDocuments;
}

export interface CompressPromptErrorReturn {
  error: Error;
  retriable: boolean;
}

export type CompressPromptReturn =
  | CompressPromptSuccessReturn
  | CompressPromptErrorReturn;

export type CompressPromptFn = (
  deps: CompressPromptDeps,
  params: CompressPromptParams,
  payload: CompressPromptPayload,
) => Promise<CompressPromptReturn>;

export type BoundCompressPromptFn = (
  params: CompressPromptParams,
  payload: CompressPromptPayload,
) => Promise<CompressPromptReturn>;
