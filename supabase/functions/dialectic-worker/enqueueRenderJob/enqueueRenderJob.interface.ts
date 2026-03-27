import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { ILogger } from '../../_shared/types.ts';
import type { ShouldEnqueueRenderJobFn } from '../../_shared/types/shouldEnqueueRenderJob.interface.ts';
import type { RenderJobEnqueueError, RenderJobValidationError } from '../../_shared/utils/errors.ts';
import type { FileType, ModelContributionFileTypes, DialecticStageSlug } from '../../_shared/types/file_manager.types.ts';

export interface EnqueueRenderJobDeps {
  dbClient: SupabaseClient<Database>;
  logger: ILogger;
  shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn;
}

export interface EnqueueRenderJobParams {
  jobId: string;
  sessionId: string;
  stageSlug: DialecticStageSlug;
  iterationNumber: number;
  outputType: ModelContributionFileTypes;
  projectId: string;
  projectOwnerUserId: string;
  userAuthToken: string;
  modelId: string;
  walletId: string;
  isTestJob: boolean;
}

export interface EnqueueRenderJobPayload {
  contributionId: string;
  needsContinuation: boolean;
  documentKey: FileType | undefined;
  stageRelationshipForStage: string | undefined;
  fileType: ModelContributionFileTypes;
  storageFileType: FileType;
}

export type EnqueueRenderJobSuccessReturn = {
  renderJobId: string | null;
};

export type EnqueueRenderJobErrorReturn = {
  error: RenderJobValidationError | RenderJobEnqueueError;
  retriable: boolean;
};

export type EnqueueRenderJobReturn =
  | EnqueueRenderJobSuccessReturn
  | EnqueueRenderJobErrorReturn;

export type EnqueueRenderJobFn = (
  deps: EnqueueRenderJobDeps,
  params: EnqueueRenderJobParams,
  payload: EnqueueRenderJobPayload,
) => Promise<EnqueueRenderJobReturn>;

export type BoundEnqueueRenderJobFn = (
  params: EnqueueRenderJobParams,
  payload: EnqueueRenderJobPayload,
) => Promise<EnqueueRenderJobReturn>;
