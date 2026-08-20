// supabase/functions/dialectic-worker/type-guards/enqueueRenderJob.type_guards.ts

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import { DialecticStageSlug } from '../../_shared/types/file_manager.types.ts';
import { RenderJobEnqueueError, RenderJobValidationError } from '../../_shared/utils/errors.ts';
import { TemplateResolutionError } from '../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts';
import { isCompressionSourceType, isFileType, isModelContributionFileType, isDialecticStageSlug } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { isRecord, isLoggerShape, isSupabaseClientShape, isNonNegativeInteger, isNonEmptyString } from '../../_shared/utils/type-guards/type_guards.common.ts';
import { isDialecticBaseJobPayload, dialecticBaseJobPayloadAllowedKeys } from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import type {
  DialecticRenderCompressedContextJobPayload,
  EnqueueRenderCompressedContextPayload,
  EnqueueRenderJobDeps,
  EnqueueRenderJobErrorReturn,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobSuccessReturn,
} from './enqueueRenderJob.interface.ts';


export function isEnqueueRenderJobDeps(value: unknown): value is EnqueueRenderJobDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!('dbClient' in value) || !('logger' in value) || !('shouldEnqueueRenderJob' in value) || !('resolveTemplateFilename' in value)) {
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
  if (typeof value.resolveTemplateFilename !== 'function') {
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
  return err instanceof RenderJobValidationError || err instanceof RenderJobEnqueueError || err instanceof TemplateResolutionError;
}

export function isEnqueueRenderCompressedContextPayload(value: unknown): value is EnqueueRenderCompressedContextPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !('sourceType' in value) ||
    !('documentKey' in value) ||
    !('docType' in value) ||
    !('sourceStageSlug' in value) ||
    !('output_type' in value)
  ) {
    return false;
  }
  if (!isCompressionSourceType(value.sourceType)) {
    return false;
  }
  if (value.sourceType !== 'contribution' && value.sourceType !== 'resource') {
    return false;
  }
  if (!isFileType(value.documentKey)) {
    return false;
  }
  if (!isModelContributionFileType(value.docType)) {
    return false;
  }
  if (!isModelContributionFileType(value.output_type)) {
    return false;
  }
  if (!isDialecticStageSlug(value.sourceStageSlug)) {
    return false;
  }
  return true;
}

export function isDialecticRenderCompressedContextJobPayload(value: unknown): value is DialecticRenderCompressedContextJobPayload {
  if (!isRecord(value)) {
    throw new Error('Payload must be a non-null object.');
  }

  // Base Payload Checks (delegated — does not catch)
  isDialecticBaseJobPayload(value);

  // Narrowing checks: required where the base leaves optional
  if (!('stageSlug' in value) || !isDialecticStageSlug(value.stageSlug)) throw new Error('Missing or invalid stageSlug.');
  if (!('iterationNumber' in value) || !isNonNegativeInteger(value.iterationNumber)) throw new Error('Missing or invalid iterationNumber.');

  // Arm-specific required members
  if (!('output_type' in value) || !isModelContributionFileType(value.output_type)) throw new Error('Missing or invalid output_type.');
  if (!('sourceType' in value) || !isCompressionSourceType(value.sourceType) || (value.sourceType !== 'contribution' && value.sourceType !== 'resource')) throw new Error('Missing or invalid sourceType.');
  if (!('documentKey' in value) || !isFileType(value.documentKey)) throw new Error('Missing or invalid documentKey.');
  if (!('template_filename' in value) || !isNonEmptyString(value.template_filename)) throw new Error('Missing or invalid template_filename.');

  // Final check for extraneous properties to enforce a strict shape.
  const allowedKeys = new Set<string>([
    ...dialecticBaseJobPayloadAllowedKeys,
    'output_type', 'sourceType', 'documentKey', 'template_filename',
  ]);

  const unknownKeys = Object.keys(value).filter(key => !allowedKeys.has(key));

  if (unknownKeys.length > 0) {
    throw new Error(`Payload contains unknown properties: ${unknownKeys.join(', ')}`);
  }

  return true;
}

export function isCompressedRenderPayloadShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (!('output_type' in value) || !('sourceType' in value)) {
    return false;
  }
  if ('documentIdentity' in value || 'sourceContributionId' in value) {
    return false;
  }
  return true;
}
