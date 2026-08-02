import type {
  GatherContinuationInputsSignature,
  GatherContinuationInputsDeps,
  GatherContinuationInputsParams,
  GatherContinuationInputsPayload,
  GatherContinuationInputsSuccess,
  GatherContinuationInputsError,
} from "./gatherContinuationInputs.interface.ts";

export type GatherContinuationInputsDepsOverrides = Partial<GatherContinuationInputsDeps>;

export function buildGatherContinuationInputsDeps(overrides?: GatherContinuationInputsDepsOverrides): GatherContinuationInputsDeps {
  const base: GatherContinuationInputsDeps = {
    assembleChunks: async () => ({ success: true, mergedObject: {}, chunkCount: 0, rawGroupCount: 0, parseableCount: 0 }),
    downloadFromStorageFn: async () => ({ data: null, error: null }),
    dbClient: undefined as unknown as GatherContinuationInputsDeps["dbClient"],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherContinuationInputsDepsCorruptions = { [K in keyof GatherContinuationInputsDeps]?: unknown };

export function invalidateGatherContinuationInputsDeps(corruptions: GatherContinuationInputsDepsCorruptions): unknown {
  return { ...buildGatherContinuationInputsDeps(), ...corruptions };
}

export type GatherContinuationInputsParamsOverrides = Partial<GatherContinuationInputsParams>;

export function buildGatherContinuationInputsParams(overrides?: GatherContinuationInputsParamsOverrides): GatherContinuationInputsParams {
  const base: GatherContinuationInputsParams = {
    chunkId: "chunk-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherContinuationInputsParamsCorruptions = { [K in keyof GatherContinuationInputsParams]?: unknown };

export function invalidateGatherContinuationInputsParams(corruptions: GatherContinuationInputsParamsCorruptions): unknown {
  return { ...buildGatherContinuationInputsParams(), ...corruptions };
}

export type GatherContinuationInputsPayloadOverrides = Partial<GatherContinuationInputsPayload>;

export function buildGatherContinuationInputsPayload(overrides?: GatherContinuationInputsPayloadOverrides): GatherContinuationInputsPayload {
  const base: GatherContinuationInputsPayload = {};
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherContinuationInputsPayloadCorruptions = { [K in keyof GatherContinuationInputsPayload]?: unknown };

export function invalidateGatherContinuationInputsPayload(corruptions: GatherContinuationInputsPayloadCorruptions): unknown {
  return { ...buildGatherContinuationInputsPayload(), ...corruptions };
}

export type GatherContinuationInputsSuccessOverrides = Partial<GatherContinuationInputsSuccess>;

export function buildGatherContinuationInputsSuccess(overrides?: GatherContinuationInputsSuccessOverrides): GatherContinuationInputsSuccess {
  const base: GatherContinuationInputsSuccess = {
    success: true,
    messages: [
      { role: "user", content: "seed" },
      { role: "assistant", content: "{}" },
      { role: "user", content: "Third line continuation." },
    ],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherContinuationInputsSuccessCorruptions = { [K in keyof GatherContinuationInputsSuccess]?: unknown };

export function invalidateGatherContinuationInputsSuccess(corruptions: GatherContinuationInputsSuccessCorruptions): unknown {
  return { ...buildGatherContinuationInputsSuccess(), ...corruptions };
}

export type GatherContinuationInputsErrorOverrides = Partial<GatherContinuationInputsError>;

export function buildGatherContinuationInputsError(overrides?: GatherContinuationInputsErrorOverrides): GatherContinuationInputsError {
  const base: GatherContinuationInputsError = {
    success: false,
    error: "mock gather continuation inputs error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherContinuationInputsErrorCorruptions = { [K in keyof GatherContinuationInputsError]?: unknown };

export function invalidateGatherContinuationInputsError(corruptions: GatherContinuationInputsErrorCorruptions): unknown {
  return { ...buildGatherContinuationInputsError(), ...corruptions };
}

export const mockGatherContinuationInputs: GatherContinuationInputsSignature = async (
  _deps,
  _params,
  _payload,
) => {
  return buildGatherContinuationInputsSuccess();
};
