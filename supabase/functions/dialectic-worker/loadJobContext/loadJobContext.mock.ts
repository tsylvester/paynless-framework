import type {
  LoadJobContextDeps,
  LoadJobContextParams,
  LoadJobContextPayload,
  LoadJobContextJobReadErrorConstructorParams,
  LoadJobContextJobReadError,
  LoadJobContextJobNotFoundErrorConstructorParams,
  LoadJobContextJobNotFoundError,
  LoadJobContextProviderReadErrorConstructorParams,
  LoadJobContextProviderReadError,
  LoadJobContextProviderNotFoundErrorConstructorParams,
  LoadJobContextProviderNotFoundError,
  LoadJobContextProviderInvalidErrorConstructorParams,
  LoadJobContextProviderInvalidError,
  LoadJobContextConfigInvalidErrorConstructorParams,
  LoadJobContextConfigInvalidError,
  LoadJobContextSuccessReturn,
  LoadJobContextErrorReturn,
  LoadJobContextFn,
  BoundLoadJobContextFn,
} from "./loadJobContext.interface.ts";
import {
  LoadJobContextJobReadError as LoadJobContextJobReadErrorClass,
  LoadJobContextJobNotFoundError as LoadJobContextJobNotFoundErrorClass,
  LoadJobContextProviderReadError as LoadJobContextProviderReadErrorClass,
  LoadJobContextProviderNotFoundError as LoadJobContextProviderNotFoundErrorClass,
  LoadJobContextProviderInvalidError as LoadJobContextProviderInvalidErrorClass,
  LoadJobContextConfigInvalidError as LoadJobContextConfigInvalidErrorClass,
} from "./loadJobContext.interface.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildDialecticJobRow } from "../../_shared/dialectic.mock.ts";
import { buildMockProvider, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";

// --- LoadJobContextDeps ---

export type LoadJobContextDepsOverrides = Partial<LoadJobContextDeps>;

export function buildLoadJobContextDeps(
  overrides?: LoadJobContextDepsOverrides,
): LoadJobContextDeps {
  const base: LoadJobContextDeps = {};
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextDepsCorruptions = {
  [K in keyof LoadJobContextDeps]?: unknown;
};

export function invalidateLoadJobContextDeps(
  corruptions: LoadJobContextDepsCorruptions,
): unknown {
  return { ...buildLoadJobContextDeps(), ...corruptions };
}

// --- LoadJobContextParams ---

const { client: defaultDbClient } = createMockSupabaseClient(undefined, {});

export type LoadJobContextParamsOverrides = Partial<LoadJobContextParams>;

export function buildLoadJobContextParams(
  overrides?: LoadJobContextParamsOverrides,
): LoadJobContextParams {
  const base: LoadJobContextParams = {
    dbClient: defaultDbClient as unknown as SupabaseClient<Database>,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextParamsCorruptions = {
  [K in keyof LoadJobContextParams]?: unknown;
};

export function invalidateLoadJobContextParams(
  corruptions: LoadJobContextParamsCorruptions,
): unknown {
  return { ...buildLoadJobContextParams(), ...corruptions };
}

// --- LoadJobContextPayload ---

export type LoadJobContextPayloadOverrides = Partial<LoadJobContextPayload>;

export function buildLoadJobContextPayload(
  overrides?: LoadJobContextPayloadOverrides,
): LoadJobContextPayload {
  const base: LoadJobContextPayload = {
    jobId: buildDialecticJobRow().id,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextPayloadCorruptions = {
  [K in keyof LoadJobContextPayload]?: unknown;
};

export function invalidateLoadJobContextPayload(
  corruptions: LoadJobContextPayloadCorruptions,
): unknown {
  return { ...buildLoadJobContextPayload(), ...corruptions };
}

// --- LoadJobContextJobReadErrorConstructorParams ---

export type LoadJobContextJobReadErrorConstructorParamsOverrides =
  Partial<LoadJobContextJobReadErrorConstructorParams>;

export function buildLoadJobContextJobReadErrorConstructorParams(
  overrides?: LoadJobContextJobReadErrorConstructorParamsOverrides,
): LoadJobContextJobReadErrorConstructorParams {
  const base: LoadJobContextJobReadErrorConstructorParams = {
    jobId: "job-1",
    driverMessage: "driver error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextJobReadErrorConstructorParamsCorruptions = {
  [K in keyof LoadJobContextJobReadErrorConstructorParams]?: unknown;
};

export function invalidateLoadJobContextJobReadErrorConstructorParams(
  corruptions: LoadJobContextJobReadErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildLoadJobContextJobReadErrorConstructorParams(),
    ...corruptions,
  };
}

// --- LoadJobContextJobReadError ---

export function buildLoadJobContextJobReadError(
  overrides?: LoadJobContextJobReadErrorConstructorParamsOverrides,
): LoadJobContextJobReadError {
  return new LoadJobContextJobReadErrorClass(
    buildLoadJobContextJobReadErrorConstructorParams(overrides),
  );
}

// --- LoadJobContextJobNotFoundErrorConstructorParams ---

export type LoadJobContextJobNotFoundErrorConstructorParamsOverrides =
  Partial<LoadJobContextJobNotFoundErrorConstructorParams>;

export function buildLoadJobContextJobNotFoundErrorConstructorParams(
  overrides?: LoadJobContextJobNotFoundErrorConstructorParamsOverrides,
): LoadJobContextJobNotFoundErrorConstructorParams {
  const base: LoadJobContextJobNotFoundErrorConstructorParams = {
    jobId: "job-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextJobNotFoundErrorConstructorParamsCorruptions = {
  [K in keyof LoadJobContextJobNotFoundErrorConstructorParams]?: unknown;
};

export function invalidateLoadJobContextJobNotFoundErrorConstructorParams(
  corruptions: LoadJobContextJobNotFoundErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildLoadJobContextJobNotFoundErrorConstructorParams(),
    ...corruptions,
  };
}

// --- LoadJobContextJobNotFoundError ---

export function buildLoadJobContextJobNotFoundError(
  overrides?: LoadJobContextJobNotFoundErrorConstructorParamsOverrides,
): LoadJobContextJobNotFoundError {
  return new LoadJobContextJobNotFoundErrorClass(
    buildLoadJobContextJobNotFoundErrorConstructorParams(overrides),
  );
}

// --- LoadJobContextProviderReadErrorConstructorParams ---

export type LoadJobContextProviderReadErrorConstructorParamsOverrides =
  Partial<LoadJobContextProviderReadErrorConstructorParams>;

export function buildLoadJobContextProviderReadErrorConstructorParams(
  overrides?: LoadJobContextProviderReadErrorConstructorParamsOverrides,
): LoadJobContextProviderReadErrorConstructorParams {
  const base: LoadJobContextProviderReadErrorConstructorParams = {
    modelId: "model-1",
    driverMessage: "driver error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextProviderReadErrorConstructorParamsCorruptions = {
  [K in keyof LoadJobContextProviderReadErrorConstructorParams]?: unknown;
};

export function invalidateLoadJobContextProviderReadErrorConstructorParams(
  corruptions: LoadJobContextProviderReadErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildLoadJobContextProviderReadErrorConstructorParams(),
    ...corruptions,
  };
}

// --- LoadJobContextProviderReadError ---

export function buildLoadJobContextProviderReadError(
  overrides?: LoadJobContextProviderReadErrorConstructorParamsOverrides,
): LoadJobContextProviderReadError {
  return new LoadJobContextProviderReadErrorClass(
    buildLoadJobContextProviderReadErrorConstructorParams(overrides),
  );
}

// --- LoadJobContextProviderNotFoundErrorConstructorParams ---

export type LoadJobContextProviderNotFoundErrorConstructorParamsOverrides =
  Partial<LoadJobContextProviderNotFoundErrorConstructorParams>;

export function buildLoadJobContextProviderNotFoundErrorConstructorParams(
  overrides?: LoadJobContextProviderNotFoundErrorConstructorParamsOverrides,
): LoadJobContextProviderNotFoundErrorConstructorParams {
  const base: LoadJobContextProviderNotFoundErrorConstructorParams = {
    modelId: "model-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextProviderNotFoundErrorConstructorParamsCorruptions = {
  [K in keyof LoadJobContextProviderNotFoundErrorConstructorParams]?: unknown;
};

export function invalidateLoadJobContextProviderNotFoundErrorConstructorParams(
  corruptions: LoadJobContextProviderNotFoundErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildLoadJobContextProviderNotFoundErrorConstructorParams(),
    ...corruptions,
  };
}

// --- LoadJobContextProviderNotFoundError ---

export function buildLoadJobContextProviderNotFoundError(
  overrides?: LoadJobContextProviderNotFoundErrorConstructorParamsOverrides,
): LoadJobContextProviderNotFoundError {
  return new LoadJobContextProviderNotFoundErrorClass(
    buildLoadJobContextProviderNotFoundErrorConstructorParams(overrides),
  );
}

// --- LoadJobContextProviderInvalidErrorConstructorParams ---

export type LoadJobContextProviderInvalidErrorConstructorParamsOverrides =
  Partial<LoadJobContextProviderInvalidErrorConstructorParams>;

export function buildLoadJobContextProviderInvalidErrorConstructorParams(
  overrides?: LoadJobContextProviderInvalidErrorConstructorParamsOverrides,
): LoadJobContextProviderInvalidErrorConstructorParams {
  const base: LoadJobContextProviderInvalidErrorConstructorParams = {
    modelId: "model-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextProviderInvalidErrorConstructorParamsCorruptions = {
  [K in keyof LoadJobContextProviderInvalidErrorConstructorParams]?: unknown;
};

export function invalidateLoadJobContextProviderInvalidErrorConstructorParams(
  corruptions: LoadJobContextProviderInvalidErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildLoadJobContextProviderInvalidErrorConstructorParams(),
    ...corruptions,
  };
}

// --- LoadJobContextProviderInvalidError ---

export function buildLoadJobContextProviderInvalidError(
  overrides?: LoadJobContextProviderInvalidErrorConstructorParamsOverrides,
): LoadJobContextProviderInvalidError {
  return new LoadJobContextProviderInvalidErrorClass(
    buildLoadJobContextProviderInvalidErrorConstructorParams(overrides),
  );
}

// --- LoadJobContextConfigInvalidErrorConstructorParams ---

export type LoadJobContextConfigInvalidErrorConstructorParamsOverrides =
  Partial<LoadJobContextConfigInvalidErrorConstructorParams>;

export function buildLoadJobContextConfigInvalidErrorConstructorParams(
  overrides?: LoadJobContextConfigInvalidErrorConstructorParamsOverrides,
): LoadJobContextConfigInvalidErrorConstructorParams {
  const base: LoadJobContextConfigInvalidErrorConstructorParams = {
    modelId: "model-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextConfigInvalidErrorConstructorParamsCorruptions = {
  [K in keyof LoadJobContextConfigInvalidErrorConstructorParams]?: unknown;
};

export function invalidateLoadJobContextConfigInvalidErrorConstructorParams(
  corruptions: LoadJobContextConfigInvalidErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildLoadJobContextConfigInvalidErrorConstructorParams(),
    ...corruptions,
  };
}

// --- LoadJobContextConfigInvalidError ---

export function buildLoadJobContextConfigInvalidError(
  overrides?: LoadJobContextConfigInvalidErrorConstructorParamsOverrides,
): LoadJobContextConfigInvalidError {
  return new LoadJobContextConfigInvalidErrorClass(
    buildLoadJobContextConfigInvalidErrorConstructorParams(overrides),
  );
}

// --- LoadJobContextSuccessReturn ---

export type LoadJobContextSuccessReturnOverrides =
  Partial<LoadJobContextSuccessReturn>;

export function buildLoadJobContextSuccessReturn(
  overrides?: LoadJobContextSuccessReturnOverrides,
): LoadJobContextSuccessReturn {
  const base: LoadJobContextSuccessReturn = {
    job: buildDialecticJobRow(),
    providerRow: buildMockProvider(),
    modelConfig: buildExtendedModelConfig(),
    walletId: "wallet-1",
    projectId: "project-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextSuccessReturnCorruptions = {
  [K in keyof LoadJobContextSuccessReturn]?: unknown;
};

export function invalidateLoadJobContextSuccessReturn(
  corruptions: LoadJobContextSuccessReturnCorruptions,
): unknown {
  return { ...buildLoadJobContextSuccessReturn(), ...corruptions };
}

// --- LoadJobContextErrorReturn ---

export type LoadJobContextErrorReturnOverrides =
  Partial<LoadJobContextErrorReturn>;

export function buildLoadJobContextErrorReturn(
  overrides?: LoadJobContextErrorReturnOverrides,
): LoadJobContextErrorReturn {
  const base: LoadJobContextErrorReturn = {
    error: buildLoadJobContextJobNotFoundError(),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type LoadJobContextErrorReturnCorruptions = {
  [K in keyof LoadJobContextErrorReturn]?: unknown;
};

export function invalidateLoadJobContextErrorReturn(
  corruptions: LoadJobContextErrorReturnCorruptions,
): unknown {
  return { ...buildLoadJobContextErrorReturn(), ...corruptions };
}

// --- Function mock ---

export const mockLoadJobContext: LoadJobContextFn = async (
  _deps,
  _params,
  _payload,
) => {
  return buildLoadJobContextSuccessReturn();
};

// --- BoundLoadJobContextFn (function mock — no configuration) ---

export const mockBoundLoadJobContextFn: BoundLoadJobContextFn = async (
  _params,
  _payload,
) => {
  return buildLoadJobContextSuccessReturn();
};
