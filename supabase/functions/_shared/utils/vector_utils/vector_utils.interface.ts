import type { RelevanceRule } from '../../../dialectic-service/dialectic.interface.ts';
import type { ILogger, Messages, AiModelExtendedConfig } from '../../types.ts';
import type { BoundCountTokensFn } from '../../types/tokenizer.types.ts';
import type { CompressionSourceType } from '../../types/file_manager.types.ts';
import type {
  ResourceDocuments,
  BoundResolveCompressionSourceFn,
} from '../resolveCompressionSource/resolveCompressionSource.provides.ts';

export interface CompressionCandidate {
  id: string;
  content: string;
  sourceType: CompressionSourceType;
  originalIndex: number;
  valueScore: number;
  effectiveScore: number;
  tokenCount: number;
}

export interface GetSortedCompressionCandidatesDeps {
  logger: ILogger;
  countTokens: BoundCountTokensFn;
  resolveCompressionSource: BoundResolveCompressionSourceFn;
}

export interface GetSortedCompressionCandidatesParams {
  inputsRelevance?: RelevanceRule[];
  modelConfig: AiModelExtendedConfig;
}

export interface GetSortedCompressionCandidatesPayload {
  documents: ResourceDocuments;
  history: Messages[];
}

export interface GetSortedCompressionCandidatesSuccessReturn {
  candidates: CompressionCandidate[];
}

export interface GetSortedCompressionCandidatesErrorReturn {
  error: Error;
  retriable: boolean;
}

export type GetSortedCompressionCandidatesReturn =
  | GetSortedCompressionCandidatesSuccessReturn
  | GetSortedCompressionCandidatesErrorReturn;

export type GetSortedCompressionCandidatesFn = (
  deps: GetSortedCompressionCandidatesDeps,
  params: GetSortedCompressionCandidatesParams,
  payload: GetSortedCompressionCandidatesPayload,
) => Promise<GetSortedCompressionCandidatesReturn>;

export type BoundGetSortedCompressionCandidatesFn = (
  params: GetSortedCompressionCandidatesParams,
  payload: GetSortedCompressionCandidatesPayload,
) => Promise<GetSortedCompressionCandidatesReturn>;
