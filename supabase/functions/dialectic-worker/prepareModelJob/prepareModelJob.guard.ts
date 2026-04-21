
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
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

export function isPrepareModelJobDeps(value: unknown): value is PrepareModelJobDeps {
  if (!isRecord(value)) {
    return false;
  }
  const keys: (keyof PrepareModelJobDeps)[] = [
    'logger',
    'applyInputsRequiredScope',
    'tokenWalletService',
    'validateWalletBalance',
    'validateModelCostRates',
    'calculateAffordability',
    'enqueueModelCall',
  ];
  for (const key of keys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (value.logger === null || value.logger === undefined) {
    return false;
  }
  if (typeof value.logger !== 'object') {
    return false;
  }
  if (typeof value.applyInputsRequiredScope !== 'function') {
    return false;
  }
  if (value.tokenWalletService === null || value.tokenWalletService === undefined) {
    return false;
  }
  if (typeof value.tokenWalletService !== 'object') {
    return false;
  }
  if (typeof value.validateWalletBalance !== 'function') {
    return false;
  }
  if (typeof value.validateModelCostRates !== 'function') {
    return false;
  }
  if (typeof value.calculateAffordability !== 'function') {
    return false;
  }
  if (typeof value.enqueueModelCall !== 'function') {
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
  if (value.dbClient === null || value.dbClient === undefined) {
    return false;
  }
  if (typeof value.dbClient !== 'object') {
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
  if (!('queued' in value) || value.queued !== true) {
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
