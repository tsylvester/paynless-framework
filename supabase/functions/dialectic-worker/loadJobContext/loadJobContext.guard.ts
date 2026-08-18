import type {
  LoadJobContextDeps,
  LoadJobContextParams,
  LoadJobContextPayload,
  LoadJobContextSuccessReturn,
  LoadJobContextErrorReturn,
} from "./loadJobContext.interface.ts";
import {
  LoadJobContextJobReadError,
  LoadJobContextJobNotFoundError,
  LoadJobContextProviderReadError,
  LoadJobContextProviderNotFoundError,
  LoadJobContextProviderInvalidError,
  LoadJobContextConfigInvalidError,
} from "./loadJobContext.interface.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticJobRow } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isSelectedAiProvider, isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";

export function isLoadJobContextDeps(value: unknown): value is LoadJobContextDeps {
  return isRecord(value);
}

export function isLoadJobContextParams(value: unknown): value is LoadJobContextParams {
  if (!isRecord(value)) return false;
  return isRecord(value.dbClient);
}

export function isLoadJobContextPayload(value: unknown): value is LoadJobContextPayload {
  if (!isRecord(value)) return false;
  if (typeof value.jobId !== "string") return false;
  if (value.jobId.trim() === "") return false;
  return true;
}

export function isLoadJobContextSuccessReturn(value: unknown): value is LoadJobContextSuccessReturn {
  if (!isRecord(value)) return false;
  if (!isDialecticJobRow(value.job)) return false;
  if (!isSelectedAiProvider(value.providerRow)) return false;
  if (!isAiModelExtendedConfig(value.modelConfig)) return false;
  if (typeof value.walletId !== "string" || value.walletId.trim() === "") return false;
  if (typeof value.projectId !== "string" || value.projectId.trim() === "") return false;
  return true;
}

export function isLoadJobContextErrorReturn(value: unknown): value is LoadJobContextErrorReturn {
  if (!isRecord(value)) return false;
  if (!(value.error instanceof Error)) return false;
  if (typeof value.retriable !== "boolean") return false;
  return true;
}

export function isLoadJobContextJobReadError(value: unknown): value is LoadJobContextJobReadError {
  return value instanceof LoadJobContextJobReadError;
}

export function isLoadJobContextJobNotFoundError(value: unknown): value is LoadJobContextJobNotFoundError {
  return value instanceof LoadJobContextJobNotFoundError;
}

export function isLoadJobContextProviderReadError(value: unknown): value is LoadJobContextProviderReadError {
  return value instanceof LoadJobContextProviderReadError;
}

export function isLoadJobContextProviderNotFoundError(value: unknown): value is LoadJobContextProviderNotFoundError {
  return value instanceof LoadJobContextProviderNotFoundError;
}

export function isLoadJobContextProviderInvalidError(value: unknown): value is LoadJobContextProviderInvalidError {
  return value instanceof LoadJobContextProviderInvalidError;
}

export function isLoadJobContextConfigInvalidError(value: unknown): value is LoadJobContextConfigInvalidError {
  return value instanceof LoadJobContextConfigInvalidError;
}
