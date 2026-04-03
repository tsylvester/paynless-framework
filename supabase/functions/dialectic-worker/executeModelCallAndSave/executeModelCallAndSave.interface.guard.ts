import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
  isChatApiRequest,
} from '../../_shared/utils/type-guards/type_guards.chat.ts';
import {
  isDialecticContribution,
  isDialecticJobRow,
  isDialecticSessionRow,
} from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveErrorReturn,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSavePayload,
  ExecuteModelCallAndSaveSuccessReturn,
} from './executeModelCallAndSave.interface.ts';

function isSupabaseClientShape(value: unknown): value is SupabaseClient<Database> {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.from === 'function';
}

function isLoggerShape(value: unknown): value is ExecuteModelCallAndSaveDeps['logger'] {
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

function isFileManagerShape(value: unknown): value is ExecuteModelCallAndSaveDeps['fileManager'] {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.uploadAndRegisterFile === 'function' &&
    typeof value.assembleAndSaveFinalDocument === 'function'
  );
}

function isTokenWalletServiceShape(
  value: unknown,
): value is ExecuteModelCallAndSaveDeps['tokenWalletService'] {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.getBalance === 'function';
}

function isNotificationServiceShape(
  value: unknown,
): value is ExecuteModelCallAndSaveDeps['notificationService'] {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.sendJobNotificationEvent === 'function' &&
    typeof value.sendContributionReceivedEvent === 'function'
  );
}

export function isExecuteModelCallAndSaveDeps(value: unknown): value is ExecuteModelCallAndSaveDeps {
  if (!isRecord(value)) {
    return false;
  }
  const keys: (keyof ExecuteModelCallAndSaveDeps)[] = [
    'logger',
    'fileManager',
    'getAiProviderAdapter',
    'tokenWalletService',
    'notificationService',
    'continueJob',
    'retryJob',
    'resolveFinishReason',
    'isIntermediateChunk',
    'determineContinuation',
    'buildUploadContext',
    'debitTokens',
  ];
  for (const key of keys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (!isLoggerShape(value.logger)) {
    return false;
  }
  if (!isFileManagerShape(value.fileManager)) {
    return false;
  }
  if (typeof value.getAiProviderAdapter !== 'function') {
    return false;
  }
  if (!isTokenWalletServiceShape(value.tokenWalletService)) {
    return false;
  }
  if (!isNotificationServiceShape(value.notificationService)) {
    return false;
  }
  if (typeof value.continueJob !== 'function') {
    return false;
  }
  if (typeof value.retryJob !== 'function') {
    return false;
  }
  if (typeof value.resolveFinishReason !== 'function') {
    return false;
  }
  if (typeof value.isIntermediateChunk !== 'function') {
    return false;
  }
  if (typeof value.determineContinuation !== 'function') {
    return false;
  }
  if (typeof value.buildUploadContext !== 'function') {
    return false;
  }
  if (typeof value.debitTokens !== 'function') {
    return false;
  }
  return true;
}

function isAiProvidersRowShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== 'string' || value.id === '') {
    return false;
  }
  if (typeof value.api_identifier !== 'string' || value.api_identifier === '') {
    return false;
  }
  if (typeof value.name !== 'string') {
    return false;
  }
  if (!('config' in value)) {
    return false;
  }
  return true;
}

export function isExecuteModelCallAndSaveParams(
  value: unknown,
): value is ExecuteModelCallAndSaveParams {
  if (!isRecord(value)) {
    return false;
  }
  const keys: (keyof ExecuteModelCallAndSaveParams)[] = [
    'dbClient',
    'job',
    'providerRow',
    'userAuthToken',
    'sessionData',
    'projectOwnerUserId',
    'stageSlug',
    'iterationNumber',
    'projectId',
    'sessionId',
    'model_id',
    'walletId',
    'output_type',
    'sourcePromptResourceId',
  ];
  for (const key of keys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (!isSupabaseClientShape(value.dbClient)) {
    return false;
  }
  if (!isDialecticJobRow(value.job)) {
    return false;
  }
  if (!isAiProvidersRowShape(value.providerRow)) {
    return false;
  }
  if (typeof value.userAuthToken !== 'string' || value.userAuthToken === '') {
    return false;
  }
  if (!isDialecticSessionRow(value.sessionData)) {
    return false;
  }
  if (typeof value.projectOwnerUserId !== 'string' || value.projectOwnerUserId === '') {
    return false;
  }
  if (typeof value.stageSlug !== 'string' || value.stageSlug === '') {
    return false;
  }
  if (
    typeof value.iterationNumber !== 'number' ||
    !Number.isInteger(value.iterationNumber) ||
    value.iterationNumber < 0
  ) {
    return false;
  }
  if (typeof value.projectId !== 'string' || value.projectId === '') {
    return false;
  }
  if (typeof value.sessionId !== 'string' || value.sessionId === '') {
    return false;
  }
  if (typeof value.model_id !== 'string' || value.model_id === '') {
    return false;
  }
  if (typeof value.walletId !== 'string' || value.walletId === '') {
    return false;
  }
  if (typeof value.output_type !== 'string') {
    return false;
  }
  if (typeof value.sourcePromptResourceId !== 'string') {
    return false;
  }
  return true;
}

export function isExecuteModelCallAndSavePayload(
  value: unknown,
): value is ExecuteModelCallAndSavePayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!('chatApiRequest' in value)) {
    return false;
  }
  if (!isChatApiRequest(value.chatApiRequest)) {
    return false;
  }
  if (
    !('preflightInputTokens' in value) ||
    typeof value.preflightInputTokens !== 'number' ||
    !Number.isFinite(value.preflightInputTokens) ||
    value.preflightInputTokens < 0
  ) {
    return false;
  }
  return true;
}

export function isExecuteModelCallAndSaveSuccessReturn(
  value: unknown,
): value is ExecuteModelCallAndSaveSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ('error' in value) {
    return false;
  }
  if (!('contribution' in value) || !isDialecticContribution(value.contribution)) {
    return false;
  }
  if (!('needsContinuation' in value) || typeof value.needsContinuation !== 'boolean') {
    return false;
  }
  if (!('stageRelationshipForStage' in value)) {
    return false;
  }
  const stageRel = value.stageRelationshipForStage;
  if (stageRel !== undefined && typeof stageRel !== 'string') {
    return false;
  }
  if (!('documentKey' in value)) {
    return false;
  }
  const documentKey = value.documentKey;
  if (documentKey !== undefined && typeof documentKey !== 'string') {
    return false;
  }
  if (!('fileType' in value) || typeof value.fileType !== 'string') {
    return false;
  }
  if (!('storageFileType' in value) || typeof value.storageFileType !== 'string') {
    return false;
  }
  return true;
}

export function isExecuteModelCallAndSaveErrorReturn(
  value: unknown,
): value is ExecuteModelCallAndSaveErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!('error' in value) || !('retriable' in value)) {
    return false;
  }
  if ('contribution' in value) {
    return false;
  }
  if (!(value.error instanceof Error)) {
    return false;
  }
  if (typeof value.retriable !== 'boolean') {
    return false;
  }
  return true;
}
