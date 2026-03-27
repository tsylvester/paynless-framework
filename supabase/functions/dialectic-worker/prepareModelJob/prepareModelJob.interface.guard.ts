import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
  isDialecticContribution,
  isDialecticJobRow,
  isDialecticSessionRow,
  isInputRuleArray,
  isRelevanceRuleArray,
} from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobSuccessReturn,
} from './prepareModelJob.interface.ts';

function isSupabaseClientShape(value: unknown): value is SupabaseClient<Database> {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.from === 'function';
}

function isPromptConstructionPayloadShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (!('conversationHistory' in value) || !Array.isArray(value.conversationHistory)) {
    return false;
  }
  if (!('resourceDocuments' in value) || !Array.isArray(value.resourceDocuments)) {
    return false;
  }
  if (!('currentUserPrompt' in value) || typeof value.currentUserPrompt !== 'string') {
    return false;
  }
  return true;
}

function isLoggerShape(value: unknown): value is PrepareModelJobDeps['logger'] {
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

function isTokenWalletServiceShape(
  value: unknown,
): value is PrepareModelJobDeps['tokenWalletService'] {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.getBalance === 'function';
}

function isRagServiceShape(value: unknown): value is PrepareModelJobDeps['ragService'] {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.getContextForModel === 'function';
}

function isEmbeddingClientShape(
  value: unknown,
): value is PrepareModelJobDeps['embeddingClient'] {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.getEmbedding === 'function';
}

export function isPrepareModelJobDeps(value: unknown): value is PrepareModelJobDeps {
  if (!isRecord(value)) {
    return false;
  }
  const keys: (keyof PrepareModelJobDeps)[] = [
    'logger',
    'pickLatest',
    'downloadFromStorage',
    'applyInputsRequiredScope',
    'countTokens',
    'tokenWalletService',
    'validateWalletBalance',
    'validateModelCostRates',
    'ragService',
    'embeddingClient',
    'executeModelCallAndSave',
    'enqueueRenderJob',
  ];
  for (const key of keys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (!isLoggerShape(value.logger)) {
    return false;
  }
  if (typeof value.pickLatest !== 'function') {
    return false;
  }
  if (typeof value.downloadFromStorage !== 'function') {
    return false;
  }
  if (typeof value.applyInputsRequiredScope !== 'function') {
    return false;
  }
  if (typeof value.countTokens !== 'function') {
    return false;
  }
  if (!isTokenWalletServiceShape(value.tokenWalletService)) {
    return false;
  }
  if (typeof value.validateWalletBalance !== 'function') {
    return false;
  }
  if (typeof value.validateModelCostRates !== 'function') {
    return false;
  }
  if (!isRagServiceShape(value.ragService)) {
    return false;
  }
  if (!isEmbeddingClientShape(value.embeddingClient)) {
    return false;
  }
  if (typeof value.executeModelCallAndSave !== 'function') {
    return false;
  }
  if (typeof value.enqueueRenderJob !== 'function') {
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

export function isPrepareModelJobParams(value: unknown): value is PrepareModelJobParams {
  if (!isRecord(value)) {
    return false;
  }
  const keys: (keyof PrepareModelJobParams)[] = [
    'dbClient',
    'authToken',
    'job',
    'projectOwnerUserId',
    'providerRow',
    'sessionData',
  ];
  for (const key of keys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (!isSupabaseClientShape(value.dbClient)) {
    return false;
  }
  if (typeof value.authToken !== 'string' || value.authToken === '') {
    return false;
  }
  if (!isDialecticJobRow(value.job)) {
    return false;
  }
  if (typeof value.projectOwnerUserId !== 'string' || value.projectOwnerUserId === '') {
    return false;
  }
  if (!isAiProvidersRowShape(value.providerRow)) {
    return false;
  }
  if (!isDialecticSessionRow(value.sessionData)) {
    return false;
  }
  return true;
}

export function isPrepareModelJobPayload(value: unknown): value is PrepareModelJobPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!('promptConstructionPayload' in value) || !('compressionStrategy' in value)) {
    return false;
  }
  if (!isPromptConstructionPayloadShape(value.promptConstructionPayload)) {
    return false;
  }
  if (typeof value.compressionStrategy !== 'function') {
    return false;
  }
  if ('inputsRelevance' in value && value.inputsRelevance !== undefined) {
    if (!isRelevanceRuleArray(value.inputsRelevance)) {
      return false;
    }
  }
  if ('inputsRequired' in value && value.inputsRequired !== undefined) {
    if (!isInputRuleArray(value.inputsRequired)) {
      return false;
    }
  }
  return true;
}

export function isPrepareModelJobSuccessReturn(
  value: unknown,
): value is PrepareModelJobSuccessReturn {
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
  if (!('renderJobId' in value)) {
    return false;
  }
  const renderJobId = value.renderJobId;
  if (renderJobId !== null && typeof renderJobId !== 'string') {
    return false;
  }
  return true;
}

export function isPrepareModelJobErrorReturn(
  value: unknown,
): value is PrepareModelJobErrorReturn {
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
