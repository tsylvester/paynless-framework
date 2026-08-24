import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { BoundDebitTokens } from "../../_shared/utils/debitTokens.interface.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type {
  AiProvidersRow,
  UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";

export interface DebitForResponseDeps {
  debitTokens: BoundDebitTokens;
}

export interface DebitForResponseParams {
  dbClient: SupabaseClient<Database>;
  jobId: string;
  walletId: string;
  providerRow: AiProvidersRow;
  modelConfig: AiModelExtendedConfig;
  projectOwnerUserId: string;
}

export interface DebitForResponsePayload {
  aiResponse: UnifiedAIResponse;
}

export type DebitForResponseSuccessReturn = { debited: true };

export type DebitForResponseErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type DebitForResponseReturn =
  | DebitForResponseSuccessReturn
  | DebitForResponseErrorReturn;

export type DebitForResponseFn = (
  deps: DebitForResponseDeps,
  params: DebitForResponseParams,
  payload: DebitForResponsePayload,
) => Promise<DebitForResponseReturn>;

export type BoundDebitForResponseFn = (
  params: DebitForResponseParams,
  payload: DebitForResponsePayload,
) => Promise<DebitForResponseReturn>;

export interface DebitForResponseWalletReadErrorConstructorParams {
  walletId: string;
  driverMessage: string;
}

export class DebitForResponseWalletReadError extends Error {
  readonly walletId: string;
  readonly driverMessage: string;
  constructor(params: DebitForResponseWalletReadErrorConstructorParams) {
    super(`walletId: ${params.walletId}, driverMessage: ${params.driverMessage}`);
    this.name = "DebitForResponseWalletReadError";
    this.walletId = params.walletId;
    this.driverMessage = params.driverMessage;
  }
}

export interface DebitForResponseWalletNotFoundErrorConstructorParams {
  walletId: string;
}

export class DebitForResponseWalletNotFoundError extends Error {
  readonly walletId: string;
  constructor(params: DebitForResponseWalletNotFoundErrorConstructorParams) {
    super(`walletId: ${params.walletId}`);
    this.name = "DebitForResponseWalletNotFoundError";
    this.walletId = params.walletId;
  }
}

export interface DebitForResponseWalletCurrencyErrorConstructorParams {
  walletId: string;
  currency: string;
}

export class DebitForResponseWalletCurrencyError extends Error {
  readonly walletId: string;
  readonly currency: string;
  constructor(params: DebitForResponseWalletCurrencyErrorConstructorParams) {
    super(`walletId: ${params.walletId}, currency: ${params.currency}`);
    this.name = "DebitForResponseWalletCurrencyError";
    this.walletId = params.walletId;
    this.currency = params.currency;
  }
}

export interface DebitForResponseWalletBalanceErrorConstructorParams {
  walletId: string;
}

export class DebitForResponseWalletBalanceError extends Error {
  readonly walletId: string;
  constructor(params: DebitForResponseWalletBalanceErrorConstructorParams) {
    super(`walletId: ${params.walletId}`);
    this.name = "DebitForResponseWalletBalanceError";
    this.walletId = params.walletId;
  }
}

export interface DebitForResponseTokenUsageErrorConstructorParams {
  jobId: string;
}

export class DebitForResponseTokenUsageError extends Error {
  readonly jobId: string;
  constructor(params: DebitForResponseTokenUsageErrorConstructorParams) {
    super(`jobId: ${params.jobId}`);
    this.name = "DebitForResponseTokenUsageError";
    this.jobId = params.jobId;
  }
}
