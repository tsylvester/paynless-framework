import type {
  ResolveContributionIdentityDeps,
  ResolveContributionIdentityParams,
  ResolveContributionIdentityPayload,
  ResolveContributionIdentitySuccessReturn,
  ResolveContributionIdentityErrorReturn,
  DocumentKeyErrorParams,
  ProviderIdentifierErrorParams,
  RelationshipsErrorParams,
  ContinuationCountErrorParams,
  RawProviderResponseErrorParams,
  SourceGroupErrorParams,
  RecipeStepReadErrorParams,
} from './resolveContributionIdentity.interface.ts';
import {
  ResolveContributionIdentityDocumentKeyError,
  ResolveContributionIdentityProviderIdentifierError,
  ResolveContributionIdentityRelationshipsError,
  ResolveContributionIdentityContinuationCountError,
  ResolveContributionIdentityRawProviderResponseError,
  ResolveContributionIdentitySourceGroupError,
  ResolveContributionIdentityRecipeStepReadError,
} from './resolveContributionIdentity.interface.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
  isDialecticExecuteJobPayload,
  isDialecticJobRow,
} from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isSelectedAiProvider } from '../../_shared/utils/type-guards/type_guards.chat.ts';
import {
  isCanonicalPathParams,
  isModelContributionFileType,
} from '../../_shared/utils/type-guards/type_guards.file_manager.ts';

// --- Deps (behavior type: presence-of-method only) ---

export function isResolveContributionIdentityDeps(
  value: unknown,
): value is ResolveContributionIdentityDeps {
  if (!isRecord(value)) return false;
  if (!('logger' in value)) return false;
  if (!isRecord(value.logger)) return false;
  if (!('info' in value.logger) || typeof value.logger.info !== 'function') return false;
  return true;
}

// --- Params ---

export function isResolveContributionIdentityParams(
  value: unknown,
): value is ResolveContributionIdentityParams {
  if (!isRecord(value)) return false;
  if (!('dbClient' in value) || !isRecord(value.dbClient)) return false;
  if (!('job' in value) || !isDialecticJobRow(value.job)) return false;
  if (!('providerRow' in value) || !isSelectedAiProvider(value.providerRow)) return false;
  if (!('aiResponse' in value) || !isRecord(value.aiResponse)) return false;
  return true;
}

// --- Payload (wraps the throwing arm guard, then narrows canonicalPathParams) ---

export function isResolveContributionIdentityPayload(
  value: unknown,
): value is ResolveContributionIdentityPayload {
  try {
    if (!isDialecticExecuteJobPayload(value)) return false;
  } catch {
    return false;
  }
  if (!isCanonicalPathParams(value.canonicalPathParams)) return false;
  return true;
}

// --- SuccessReturn ---

export function isResolveContributionIdentitySuccessReturn(
  value: unknown,
): value is ResolveContributionIdentitySuccessReturn {
  if (!isRecord(value)) return false;
  if (!('restOfCanonicalPathParams' in value) || !isCanonicalPathParams(value.restOfCanonicalPathParams)) return false;
  if (!('storageFileType' in value) || !isModelContributionFileType(value.storageFileType)) return false;
  if (!('isContinuationForStorage' in value) || typeof value.isContinuationForStorage !== 'boolean') return false;
  if (!('description' in value) || typeof value.description !== 'string' || value.description.length === 0) return false;
  if ('sourceGroupFragment' in value && value.sourceGroupFragment !== undefined) {
    if (typeof value.sourceGroupFragment !== 'string' || value.sourceGroupFragment.length === 0) return false;
  }
  if ('targetContributionId' in value && value.targetContributionId !== undefined) {
    if (typeof value.targetContributionId !== 'string' || value.targetContributionId.length === 0) return false;
  }
  return true;
}

// --- ErrorReturn ---

export function isResolveContributionIdentityErrorReturn(
  value: unknown,
): value is ResolveContributionIdentityErrorReturn {
  if (!isRecord(value)) return false;
  if (!('error' in value) || !(value.error instanceof Error)) return false;
  if (!('retriable' in value) || typeof value.retriable !== 'boolean') return false;
  return true;
}

// --- Owned error instanceof guards ---

export function isResolveContributionIdentityDocumentKeyError(
  value: unknown,
): value is ResolveContributionIdentityDocumentKeyError {
  return value instanceof ResolveContributionIdentityDocumentKeyError;
}

export function isResolveContributionIdentityProviderIdentifierError(
  value: unknown,
): value is ResolveContributionIdentityProviderIdentifierError {
  return value instanceof ResolveContributionIdentityProviderIdentifierError;
}

export function isResolveContributionIdentityRelationshipsError(
  value: unknown,
): value is ResolveContributionIdentityRelationshipsError {
  return value instanceof ResolveContributionIdentityRelationshipsError;
}

export function isResolveContributionIdentityContinuationCountError(
  value: unknown,
): value is ResolveContributionIdentityContinuationCountError {
  return value instanceof ResolveContributionIdentityContinuationCountError;
}

export function isResolveContributionIdentityRawProviderResponseError(
  value: unknown,
): value is ResolveContributionIdentityRawProviderResponseError {
  return value instanceof ResolveContributionIdentityRawProviderResponseError;
}

export function isResolveContributionIdentitySourceGroupError(
  value: unknown,
): value is ResolveContributionIdentitySourceGroupError {
  return value instanceof ResolveContributionIdentitySourceGroupError;
}

export function isResolveContributionIdentityRecipeStepReadError(
  value: unknown,
): value is ResolveContributionIdentityRecipeStepReadError {
  return value instanceof ResolveContributionIdentityRecipeStepReadError;
}

// --- Constructor-params guards (infill: guards.md requires shape checks on constructor params) ---

export function isDocumentKeyErrorParams(
  value: unknown,
): value is DocumentKeyErrorParams {
  if (!isRecord(value)) return false;
  if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
  return true;
}

export function isProviderIdentifierErrorParams(
  value: unknown,
): value is ProviderIdentifierErrorParams {
  if (!isRecord(value)) return false;
  if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
  if (!('providerId' in value) || typeof value.providerId !== 'string' || value.providerId.length === 0) return false;
  return true;
}

export function isRelationshipsErrorParams(
  value: unknown,
): value is RelationshipsErrorParams {
  if (!isRecord(value)) return false;
  if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
  if (!('targetContributionId' in value) || typeof value.targetContributionId !== 'string' || value.targetContributionId.length === 0) return false;
  return true;
}

export function isContinuationCountErrorParams(
  value: unknown,
): value is ContinuationCountErrorParams {
  if (!isRecord(value)) return false;
  if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
  if (!('targetContributionId' in value) || typeof value.targetContributionId !== 'string' || value.targetContributionId.length === 0) return false;
  return true;
}

export function isRawProviderResponseErrorParams(
  value: unknown,
): value is RawProviderResponseErrorParams {
  if (!isRecord(value)) return false;
  if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
  return true;
}

export function isSourceGroupErrorParams(
  value: unknown,
): value is SourceGroupErrorParams {
  if (!isRecord(value)) return false;
  if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
  if (!('outputType' in value) || !isModelContributionFileType(value.outputType)) return false;
  return true;
}

export function isRecipeStepReadErrorParams(
  value: unknown,
): value is RecipeStepReadErrorParams {
  if (!isRecord(value)) return false;
  if (!('recipeStepId' in value) || typeof value.recipeStepId !== 'string' || value.recipeStepId.length === 0) return false;
  if (!('table' in value) || typeof value.table !== 'string' || value.table.length === 0) return false;
  if (!('driverMessage' in value) || typeof value.driverMessage !== 'string' || value.driverMessage.length === 0) return false;
  return true;
}
