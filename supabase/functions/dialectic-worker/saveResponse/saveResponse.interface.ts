import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { ILogger } from '../../_shared/types.ts';
import type { BoundRetryJobFn } from '../retryJob/retryJob.interface.ts';
import type { BoundLoadJobContextFn } from '../loadJobContext/loadJobContext.interface.ts';
import type { BoundAssembleAiResponseFn } from '../assembleAiResponse/assembleAiResponse.interface.ts';
import type { BoundDebitForResponseFn } from '../debitForResponse/debitForResponse.interface.ts';
import type { BoundPrepareResponseContentFn } from '../prepareResponseContent/prepareResponseContent.interface.ts';
import type { BoundSaveContributionResponseFn } from '../saveContributionResponse/saveContributionResponse.interface.ts';
import type { BoundSaveCompressedResponseFn } from '../saveCompressedResponse/saveCompressedResponse.interface.ts';

export interface NodeTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface SaveResponseParams {
  job_id: string;
  dbClient: SupabaseClient<Database>;
}

export interface SaveResponsePayload {
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
  finish_reason: string | null;
  processingTimeMs: number;
}

export interface SaveResponseRequestBody {
  job_id: string;
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
  finish_reason: string | null;
}

export interface SaveResponseDeps {
  logger: ILogger;
  retryJob: BoundRetryJobFn;
  loadJobContext: BoundLoadJobContextFn;
  assembleAiResponse: BoundAssembleAiResponseFn;
  debitForResponse: BoundDebitForResponseFn;
  prepareResponseContent: BoundPrepareResponseContentFn;
  saveContributionResponse: BoundSaveContributionResponseFn;
  saveCompressedResponse: BoundSaveCompressedResponseFn;
}

export type SaveResponseSuccessReturn = {
  status: 'completed' | 'needs_continuation' | 'continuation_limit_reached' | 'waiting_for_children';
};

export type SaveResponseErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type SaveResponseReturn = SaveResponseSuccessReturn | SaveResponseErrorReturn;

export type SaveResponseFn = (
  deps: SaveResponseDeps,
  params: SaveResponseParams,
  payload: SaveResponsePayload,
) => Promise<SaveResponseReturn>;

export type BoundSaveResponseFn = (
  params: SaveResponseParams,
  payload: SaveResponsePayload,
) => Promise<SaveResponseReturn>;
