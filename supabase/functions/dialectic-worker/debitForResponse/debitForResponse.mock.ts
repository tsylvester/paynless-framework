import type {
  DebitForResponseDeps,
  DebitForResponseParams,
  DebitForResponsePayload,
  DebitForResponseSuccessReturn,
  DebitForResponseErrorReturn,
  DebitForResponseFn,
  DebitForResponseWalletReadErrorConstructorParams,
  DebitForResponseWalletNotFoundErrorConstructorParams,
  DebitForResponseWalletCurrencyErrorConstructorParams,
  DebitForResponseWalletBalanceErrorConstructorParams,
  DebitForResponseTokenUsageErrorConstructorParams,
} from "./debitForResponse.interface.ts";
import {
  DebitForResponseWalletReadError,
  DebitForResponseWalletNotFoundError,
  DebitForResponseWalletCurrencyError,
  DebitForResponseWalletBalanceError,
  DebitForResponseTokenUsageError,
} from "./debitForResponse.interface.ts";
import type { BoundDebitTokens } from "../../_shared/utils/debitTokens.interface.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { buildDebitTokensSuccess } from "../../_shared/utils/debitTokens.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildMockProvider, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";

// --- DebitForResponseDeps ---

const defaultDebitTokens: BoundDebitTokens = async (_params, _payload) => {
  return buildDebitTokensSuccess();
};

export type DebitForResponseDepsOverrides = Partial<DebitForResponseDeps>;

export function buildDebitForResponseDeps(
  overrides?: DebitForResponseDepsOverrides,
): DebitForResponseDeps {
  const base: DebitForResponseDeps = {
    debitTokens: defaultDebitTokens,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseDepsCorruptions = {
  [K in keyof DebitForResponseDeps]?: unknown;
};

export function invalidateDebitForResponseDeps(
  corruptions: DebitForResponseDepsCorruptions,
): unknown {
  return { ...buildDebitForResponseDeps(), ...corruptions };
}

// --- DebitForResponseParams ---

const { client: defaultDbClient } = createMockSupabaseClient(undefined, {});

export type DebitForResponseParamsOverrides = Partial<DebitForResponseParams>;

export function buildDebitForResponseParams(
  overrides?: DebitForResponseParamsOverrides,
): DebitForResponseParams {
  const base: DebitForResponseParams = {
    dbClient: defaultDbClient as unknown as SupabaseClient<Database>,
    jobId: "job-1",
    walletId: "wallet-1",
    providerRow: buildMockProvider(),
    modelConfig: buildExtendedModelConfig(),
    projectOwnerUserId: "owner-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseParamsCorruptions = {
  [K in keyof DebitForResponseParams]?: unknown;
};

export function invalidateDebitForResponseParams(
  corruptions: DebitForResponseParamsCorruptions,
): unknown {
  return { ...buildDebitForResponseParams(), ...corruptions };
}

// --- DebitForResponsePayload ---

export type DebitForResponsePayloadOverrides = Partial<DebitForResponsePayload>;

export function buildDebitForResponsePayload(
  overrides?: DebitForResponsePayloadOverrides,
): DebitForResponsePayload {
  const base: DebitForResponsePayload = {
    aiResponse: buildUnifiedAIResponse(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponsePayloadCorruptions = {
  [K in keyof DebitForResponsePayload]?: unknown;
};

export function invalidateDebitForResponsePayload(
  corruptions: DebitForResponsePayloadCorruptions,
): unknown {
  return { ...buildDebitForResponsePayload(), ...corruptions };
}

// --- DebitForResponseWalletReadErrorConstructorParams ---

export type DebitForResponseWalletReadErrorConstructorParamsOverrides =
  Partial<DebitForResponseWalletReadErrorConstructorParams>;

export function buildDebitForResponseWalletReadErrorConstructorParams(
  overrides?: DebitForResponseWalletReadErrorConstructorParamsOverrides,
): DebitForResponseWalletReadErrorConstructorParams {
  const base: DebitForResponseWalletReadErrorConstructorParams = {
    walletId: "wallet-1",
    driverMessage: "driver error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseWalletReadErrorConstructorParamsCorruptions = {
  [K in keyof DebitForResponseWalletReadErrorConstructorParams]?: unknown;
};

export function invalidateDebitForResponseWalletReadErrorConstructorParams(
  corruptions: DebitForResponseWalletReadErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildDebitForResponseWalletReadErrorConstructorParams(),
    ...corruptions,
  };
}

// --- DebitForResponseWalletReadError ---

export function buildDebitForResponseWalletReadError(
  overrides?: DebitForResponseWalletReadErrorConstructorParamsOverrides,
): DebitForResponseWalletReadError {
  return new DebitForResponseWalletReadError(
    buildDebitForResponseWalletReadErrorConstructorParams(overrides),
  );
}

// --- DebitForResponseWalletNotFoundErrorConstructorParams ---

export type DebitForResponseWalletNotFoundErrorConstructorParamsOverrides =
  Partial<DebitForResponseWalletNotFoundErrorConstructorParams>;

export function buildDebitForResponseWalletNotFoundErrorConstructorParams(
  overrides?: DebitForResponseWalletNotFoundErrorConstructorParamsOverrides,
): DebitForResponseWalletNotFoundErrorConstructorParams {
  const base: DebitForResponseWalletNotFoundErrorConstructorParams = {
    walletId: "wallet-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseWalletNotFoundErrorConstructorParamsCorruptions = {
  [K in keyof DebitForResponseWalletNotFoundErrorConstructorParams]?: unknown;
};

export function invalidateDebitForResponseWalletNotFoundErrorConstructorParams(
  corruptions: DebitForResponseWalletNotFoundErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildDebitForResponseWalletNotFoundErrorConstructorParams(),
    ...corruptions,
  };
}

// --- DebitForResponseWalletNotFoundError ---

export function buildDebitForResponseWalletNotFoundError(
  overrides?: DebitForResponseWalletNotFoundErrorConstructorParamsOverrides,
): DebitForResponseWalletNotFoundError {
  return new DebitForResponseWalletNotFoundError(
    buildDebitForResponseWalletNotFoundErrorConstructorParams(overrides),
  );
}

// --- DebitForResponseWalletCurrencyErrorConstructorParams ---

export type DebitForResponseWalletCurrencyErrorConstructorParamsOverrides =
  Partial<DebitForResponseWalletCurrencyErrorConstructorParams>;

export function buildDebitForResponseWalletCurrencyErrorConstructorParams(
  overrides?: DebitForResponseWalletCurrencyErrorConstructorParamsOverrides,
): DebitForResponseWalletCurrencyErrorConstructorParams {
  const base: DebitForResponseWalletCurrencyErrorConstructorParams = {
    walletId: "wallet-1",
    currency: "USD",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseWalletCurrencyErrorConstructorParamsCorruptions = {
  [K in keyof DebitForResponseWalletCurrencyErrorConstructorParams]?: unknown;
};

export function invalidateDebitForResponseWalletCurrencyErrorConstructorParams(
  corruptions: DebitForResponseWalletCurrencyErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildDebitForResponseWalletCurrencyErrorConstructorParams(),
    ...corruptions,
  };
}

// --- DebitForResponseWalletCurrencyError ---

export function buildDebitForResponseWalletCurrencyError(
  overrides?: DebitForResponseWalletCurrencyErrorConstructorParamsOverrides,
): DebitForResponseWalletCurrencyError {
  return new DebitForResponseWalletCurrencyError(
    buildDebitForResponseWalletCurrencyErrorConstructorParams(overrides),
  );
}

// --- DebitForResponseWalletBalanceErrorConstructorParams ---

export type DebitForResponseWalletBalanceErrorConstructorParamsOverrides =
  Partial<DebitForResponseWalletBalanceErrorConstructorParams>;

export function buildDebitForResponseWalletBalanceErrorConstructorParams(
  overrides?: DebitForResponseWalletBalanceErrorConstructorParamsOverrides,
): DebitForResponseWalletBalanceErrorConstructorParams {
  const base: DebitForResponseWalletBalanceErrorConstructorParams = {
    walletId: "wallet-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseWalletBalanceErrorConstructorParamsCorruptions = {
  [K in keyof DebitForResponseWalletBalanceErrorConstructorParams]?: unknown;
};

export function invalidateDebitForResponseWalletBalanceErrorConstructorParams(
  corruptions: DebitForResponseWalletBalanceErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildDebitForResponseWalletBalanceErrorConstructorParams(),
    ...corruptions,
  };
}

// --- DebitForResponseWalletBalanceError ---

export function buildDebitForResponseWalletBalanceError(
  overrides?: DebitForResponseWalletBalanceErrorConstructorParamsOverrides,
): DebitForResponseWalletBalanceError {
  return new DebitForResponseWalletBalanceError(
    buildDebitForResponseWalletBalanceErrorConstructorParams(overrides),
  );
}

// --- DebitForResponseTokenUsageErrorConstructorParams ---

export type DebitForResponseTokenUsageErrorConstructorParamsOverrides =
  Partial<DebitForResponseTokenUsageErrorConstructorParams>;

export function buildDebitForResponseTokenUsageErrorConstructorParams(
  overrides?: DebitForResponseTokenUsageErrorConstructorParamsOverrides,
): DebitForResponseTokenUsageErrorConstructorParams {
  const base: DebitForResponseTokenUsageErrorConstructorParams = {
    jobId: "job-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseTokenUsageErrorConstructorParamsCorruptions = {
  [K in keyof DebitForResponseTokenUsageErrorConstructorParams]?: unknown;
};

export function invalidateDebitForResponseTokenUsageErrorConstructorParams(
  corruptions: DebitForResponseTokenUsageErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildDebitForResponseTokenUsageErrorConstructorParams(),
    ...corruptions,
  };
}

// --- DebitForResponseTokenUsageError ---

export function buildDebitForResponseTokenUsageError(
  overrides?: DebitForResponseTokenUsageErrorConstructorParamsOverrides,
): DebitForResponseTokenUsageError {
  return new DebitForResponseTokenUsageError(
    buildDebitForResponseTokenUsageErrorConstructorParams(overrides),
  );
}

// --- DebitForResponseSuccessReturn ---

export type DebitForResponseSuccessReturnOverrides =
  Partial<DebitForResponseSuccessReturn>;

export function buildDebitForResponseSuccessReturn(
  overrides?: DebitForResponseSuccessReturnOverrides,
): DebitForResponseSuccessReturn {
  const base: DebitForResponseSuccessReturn = {
    debited: true,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseSuccessReturnCorruptions = {
  [K in keyof DebitForResponseSuccessReturn]?: unknown;
};

export function invalidateDebitForResponseSuccessReturn(
  corruptions: DebitForResponseSuccessReturnCorruptions,
): unknown {
  return { ...buildDebitForResponseSuccessReturn(), ...corruptions };
}

// --- DebitForResponseErrorReturn ---

export type DebitForResponseErrorReturnOverrides =
  Partial<DebitForResponseErrorReturn>;

export function buildDebitForResponseErrorReturn(
  overrides?: DebitForResponseErrorReturnOverrides,
): DebitForResponseErrorReturn {
  const base: DebitForResponseErrorReturn = {
    error: buildDebitForResponseWalletNotFoundError(),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitForResponseErrorReturnCorruptions = {
  [K in keyof DebitForResponseErrorReturn]?: unknown;
};

export function invalidateDebitForResponseErrorReturn(
  corruptions: DebitForResponseErrorReturnCorruptions,
): unknown {
  return { ...buildDebitForResponseErrorReturn(), ...corruptions };
}

// --- Function mock ---

export const mockDebitForResponse: DebitForResponseFn = async (
  _deps,
  _params,
  _payload,
) => {
  return buildDebitForResponseSuccessReturn();
};
