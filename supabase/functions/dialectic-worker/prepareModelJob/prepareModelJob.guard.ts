
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
  isDialecticJobRow,
  isInputRuleArray,
  isPromptConstructionPayload,
  isRelevanceRuleArray,
} from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isSelectedAiProvider } from '../../_shared/utils/type-guards/type_guards.chat.ts';
import type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobPendingReturn,
  PrepareModelJobQueuedReturn,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from './prepareModelJob.interface.ts';
import { PrepareModelJobExecutionError } from './prepareModelJob.interface.ts';

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
    'compressPrompt',
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
  if (typeof value.compressPrompt !== 'function') {
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
  return true;
}

export function isPrepareModelJobPayload(value: unknown): value is PrepareModelJobPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!('job' in value) || !isDialecticJobRow(value.job)) {
    return false;
  }
  if (!('providerRow' in value) || !isSelectedAiProvider(value.providerRow)) {
    return false;
  }
  if (!('promptConstructionPayload' in value) || !isPromptConstructionPayload(value.promptConstructionPayload)) {
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

export function isPrepareModelJobQueuedReturn(
  value: unknown,
): value is PrepareModelJobQueuedReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!('queued' in value) || value.queued !== true) {
    return false;
  }
  if ('waiting_for_children' in value) {
    return false;
  }
  return true;
}

export function isPrepareModelJobPendingReturn(
  value: unknown,
): value is PrepareModelJobPendingReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!('waiting_for_children' in value) || value.waiting_for_children !== true) {
    return false;
  }
  if ('queued' in value) {
    return false;
  }
  return true;
}

export function isPrepareModelJobSuccessReturn(
  value: unknown,
): value is PrepareModelJobSuccessReturn {
  if (isPrepareModelJobQueuedReturn(value)) {
    return true;
  }
  if (isPrepareModelJobPendingReturn(value)) {
    return true;
  }
  return false;
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
  if ('queued' in value) {
    return false;
  }
  if ('waiting_for_children' in value) {
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

export function isPrepareModelJobReturn(value: unknown): value is PrepareModelJobReturn {
  if (isPrepareModelJobSuccessReturn(value)) {
    return true;
  }
  if (isPrepareModelJobErrorReturn(value)) {
    return true;
  }
  return false;
}

export function isPrepareModelJobFn(value: unknown): value is PrepareModelJobFn {
  return typeof value === 'function';
}

export function isPrepareModelJobExecutionError(
  value: unknown,
): value is PrepareModelJobExecutionError {
  return value instanceof PrepareModelJobExecutionError;
}
