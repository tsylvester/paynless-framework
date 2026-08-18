import type { DialecticJobRow, AiProvidersRow } from "../../dialectic-service/dialectic.interface.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type { Database } from "../../types_db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface LoadJobContextDeps {}

export interface LoadJobContextParams {
  dbClient: SupabaseClient<Database>;
}

export interface LoadJobContextPayload {
  jobId: string;
}

export interface LoadJobContextJobReadErrorConstructorParams {
  jobId: string;
  driverMessage: string;
}

export class LoadJobContextJobReadError extends Error {
  readonly jobId: string;
  readonly driverMessage: string;
  constructor(params: LoadJobContextJobReadErrorConstructorParams) {
    super(`jobId: ${params.jobId}, driverMessage: ${params.driverMessage}`);
    this.name = "LoadJobContextJobReadError";
    this.jobId = params.jobId;
    this.driverMessage = params.driverMessage;
  }
}

export interface LoadJobContextJobNotFoundErrorConstructorParams {
  jobId: string;
}

export class LoadJobContextJobNotFoundError extends Error {
  readonly jobId: string;
  constructor(params: LoadJobContextJobNotFoundErrorConstructorParams) {
    super(`jobId: ${params.jobId}`);
    this.name = "LoadJobContextJobNotFoundError";
    this.jobId = params.jobId;
  }
}

export interface LoadJobContextProviderReadErrorConstructorParams {
  modelId: string;
  driverMessage: string;
}

export class LoadJobContextProviderReadError extends Error {
  readonly modelId: string;
  readonly driverMessage: string;
  constructor(params: LoadJobContextProviderReadErrorConstructorParams) {
    super(`modelId: ${params.modelId}, driverMessage: ${params.driverMessage}`);
    this.name = "LoadJobContextProviderReadError";
    this.modelId = params.modelId;
    this.driverMessage = params.driverMessage;
  }
}

export interface LoadJobContextProviderNotFoundErrorConstructorParams {
  modelId: string;
}

export class LoadJobContextProviderNotFoundError extends Error {
  readonly modelId: string;
  constructor(params: LoadJobContextProviderNotFoundErrorConstructorParams) {
    super(`modelId: ${params.modelId}`);
    this.name = "LoadJobContextProviderNotFoundError";
    this.modelId = params.modelId;
  }
}

export interface LoadJobContextProviderInvalidErrorConstructorParams {
  modelId: string;
}

export class LoadJobContextProviderInvalidError extends Error {
  readonly modelId: string;
  constructor(params: LoadJobContextProviderInvalidErrorConstructorParams) {
    super(`modelId: ${params.modelId}`);
    this.name = "LoadJobContextProviderInvalidError";
    this.modelId = params.modelId;
  }
}

export interface LoadJobContextConfigInvalidErrorConstructorParams {
  modelId: string;
}

export class LoadJobContextConfigInvalidError extends Error {
  readonly modelId: string;
  constructor(params: LoadJobContextConfigInvalidErrorConstructorParams) {
    super(`modelId: ${params.modelId}`);
    this.name = "LoadJobContextConfigInvalidError";
    this.modelId = params.modelId;
  }
}

export type LoadJobContextSuccessReturn = {
  job: DialecticJobRow;
  providerRow: AiProvidersRow;
  modelConfig: AiModelExtendedConfig;
  walletId: string;
  projectId: string;
};

export type LoadJobContextErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type LoadJobContextReturn =
  | LoadJobContextSuccessReturn
  | LoadJobContextErrorReturn;

export type LoadJobContextFn = (
  deps: LoadJobContextDeps,
  params: LoadJobContextParams,
  payload: LoadJobContextPayload,
) => Promise<LoadJobContextReturn>;
