import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { ILogger } from '../../_shared/types.ts';
import type { ShouldEnqueueRenderJobFn } from '../../_shared/types/shouldEnqueueRenderJob.interface.ts';
import type { RenderJobEnqueueError, RenderJobValidationError } from '../../_shared/utils/errors.ts';
import type { BoundResolveTemplateFilenameFn } from '../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts';
import type { TemplateResolutionError } from '../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts';
import type { FileType, ModelContributionFileTypes, DialecticStageSlug, CompressionSourceType } from '../../_shared/types/file_manager.types.ts';

export interface EnqueueRenderJobDeps {
  dbClient: SupabaseClient<Database>;
  logger: ILogger;
  shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn;
  resolveTemplateFilename: BoundResolveTemplateFilenameFn;
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
  error: RenderJobValidationError | RenderJobEnqueueError | TemplateResolutionError;
  retriable: boolean;
};

export type EnqueueRenderJobReturn =
  | EnqueueRenderJobSuccessReturn
  | EnqueueRenderJobErrorReturn;

export interface EnqueueRenderCompressedContextPayload {
  sourceType: CompressionSourceType;
  documentKey: FileType;
  docType: ModelContributionFileTypes;
  sourceStageSlug: DialecticStageSlug;
  targetKey: ModelContributionFileTypes;
}

export interface DialecticRenderCompressedContextJobPayload {
  idempotencyKey: string;
  projectId: string;
  sessionId: string;
  iterationNumber: number;
  stageSlug: DialecticStageSlug;
  targetKey: ModelContributionFileTypes;
  sourceType: CompressionSourceType;
  documentKey: FileType;
  template_filename: string;
  user_jwt: string;
  model_id: string;
  walletId: string;
}

export type EnqueueRenderJobFn = (
  deps: EnqueueRenderJobDeps,
  params: EnqueueRenderJobParams,
  payload: EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload,
) => Promise<EnqueueRenderJobReturn>;

export type BoundEnqueueRenderJobFn = (
  params: EnqueueRenderJobParams,
  payload: EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload,
) => Promise<EnqueueRenderJobReturn>;
