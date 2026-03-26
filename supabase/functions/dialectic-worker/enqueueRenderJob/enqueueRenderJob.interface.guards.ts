// supabase/functions/dialectic-worker/type-guards/enqueueRenderJob.type_guards.ts

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import { DialecticStageSlug } from '../../_shared/types/file_manager.types.ts';
import { RenderJobEnqueueError, RenderJobValidationError } from '../../_shared/utils/errors.ts';
import { isFileType, isModelContributionFileType } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import type {
  EnqueueRenderJobDeps,
  EnqueueRenderJobErrorReturn,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobSuccessReturn,
} from './enqueueRenderJob.interface.ts';

function isDialecticStageSlug(value: unknown): value is DialecticStageSlug {
  if (typeof value !== 'string') {
    return false;
  }
  for (const slug of Object.values(DialecticStageSlug)) {
    if (slug === value) {
      return true;
    }
  }
  return false;
}

function isSupabaseClientShape(value: unknown): value is SupabaseClient<Database> {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.from === 'function';
}

function isLoggerShape(value: unknown): value is EnqueueRenderJobDeps['logger'] {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.debug === 'function' &&
    typeof value.info === 'function' &&
    typeof value.warn === 'function' &&
    typeof value.error === 'function'
  );
}

export function isEnqueueRenderJobDeps(value: unknown): value is EnqueueRenderJobDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!('dbClient' in value) || !('logger' in value) || !('shouldEnqueueRenderJob' in value)) {
    return false;
  }
  if (!isSupabaseClientShape(value.dbClient)) {
    return false;
  }
  if (!isLoggerShape(value.logger)) {
    return false;
  }
  if (typeof value.shouldEnqueueRenderJob !== 'function') {
    return false;
  }
  return true;
}

export function isEnqueueRenderJobParams(value: unknown): value is EnqueueRenderJobParams {
  if (!isRecord(value)) {
    return false;
  }
  const keys: (keyof EnqueueRenderJobParams)[] = [
    'jobId',
    'sessionId',
    'stageSlug',
    'iterationNumber',
    'outputType',
    'projectId',
    'projectOwnerUserId',
    'userAuthToken',
    'modelId',
    'walletId',
    'isTestJob',
  ];
  for (const key of keys) {
    if (!(key in value)) {
      return false;
    }
  }
  const jobId = value.jobId;
  const sessionId = value.sessionId;
  const stageSlug = value.stageSlug;
  const iterationNumber = value.iterationNumber;
  const outputType = value.outputType;
  const projectId = value.projectId;
  const projectOwnerUserId = value.projectOwnerUserId;
  const userAuthToken = value.userAuthToken;
  const modelId = value.modelId;
  const walletId = value.walletId;
  const isTestJob = value.isTestJob;
  if (typeof jobId !== 'string' || jobId === '') {
    return false;
  }
  if (typeof sessionId !== 'string' || sessionId === '') {
    return false;
  }
  if (!isDialecticStageSlug(stageSlug)) {
    return false;
  }
  if (typeof iterationNumber !== 'number' || !Number.isInteger(iterationNumber) || iterationNumber < 0) {
    return false;
  }
  if (!isModelContributionFileType(outputType)) {
    return false;
  }
  if (typeof projectId !== 'string' || projectId === '') {
    return false;
  }
  if (typeof projectOwnerUserId !== 'string' || projectOwnerUserId === '') {
    return false;
  }
  if (typeof userAuthToken !== 'string' || userAuthToken === '') {
    return false;
  }
  if (typeof modelId !== 'string' || modelId === '') {
    return false;
  }
  if (typeof walletId !== 'string' || walletId === '') {
    return false;
  }
  if (typeof isTestJob !== 'boolean') {
    return false;
  }
  return true;
}

export function isEnqueueRenderJobPayload(value: unknown): value is EnqueueRenderJobPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !('contributionId' in value) ||
    !('needsContinuation' in value) ||
    !('documentKey' in value) ||
    !('stageRelationshipForStage' in value) ||
    !('fileType' in value) ||
    !('storageFileType' in value)
  ) {
    return false;
  }
  const contributionId = value.contributionId;
  const needsContinuation = value.needsContinuation;
  const documentKey = value.documentKey;
  const stageRelationshipForStage = value.stageRelationshipForStage;
  const fileType = value.fileType;
  const storageFileType = value.storageFileType;
  if (typeof contributionId !== 'string' || contributionId === '') {
    return false;
  }
  if (typeof needsContinuation !== 'boolean') {
    return false;
  }
  if (documentKey !== undefined && !isFileType(documentKey)) {
    return false;
  }
  if (stageRelationshipForStage !== undefined && (typeof stageRelationshipForStage !== 'string' || stageRelationshipForStage === '')) {
    return false;
  }
  if (!isModelContributionFileType(fileType)) {
    return false;
  }
  if (!isFileType(storageFileType)) {
    return false;
  }
  return true;
}

export function isEnqueueRenderJobSuccessReturn(value: unknown): value is EnqueueRenderJobSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!('renderJobId' in value)) {
    return false;
  }
  if ('error' in value) {
    return false;
  }
  const renderJobId = value.renderJobId;
  return renderJobId === null || typeof renderJobId === 'string';
}

export function isEnqueueRenderJobErrorReturn(value: unknown): value is EnqueueRenderJobErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!('error' in value) || !('retriable' in value)) {
    return false;
  }
  const err = value.error;
  if (typeof value.retriable !== 'boolean') {
    return false;
  }
  return err instanceof RenderJobValidationError || err instanceof RenderJobEnqueueError;
}
