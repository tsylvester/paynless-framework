import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { buildResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";
import { mockBoundApplyCompressionOverlay } from "../applyCompressionOverlay/applyCompressionOverlay.provides.ts";
import type {
  GatherArtifactsDeps,
  GatherArtifactsErrorReturn,
  GatherArtifactsFn,
  GatherArtifactsParams,
  GatherArtifactsPayload,
  GatherArtifactsSuccessReturn,
  BoundGatherArtifactsFn,
} from "./gatherArtifacts.interface.ts";

// --- GatherArtifactsDeps ---

export type GatherArtifactsDepsOverrides = Partial<GatherArtifactsDeps>;

export function buildGatherArtifactsDeps(
  overrides?: GatherArtifactsDepsOverrides,
): GatherArtifactsDeps {
  const contentBytes = new TextEncoder().encode("artifact-content");
  const contentBuffer = new ArrayBuffer(contentBytes.byteLength);
  new Uint8Array(contentBuffer).set(contentBytes);

  const base: GatherArtifactsDeps = {
    logger: new MockLogger(),
    pickLatest: <T extends { created_at: string }>(rows: T[]) => rows[rows.length - 1],
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: contentBuffer,
    }),
    applyCompressionOverlay: mockBoundApplyCompressionOverlay,
  };

  return {
    ...base,
    ...overrides,
  };
}

export type GatherArtifactsDepsCorruptions = { [K in keyof GatherArtifactsDeps]?: unknown };

export function invalidateGatherArtifactsDeps(corruptions: GatherArtifactsDepsCorruptions): unknown {
  return { ...buildGatherArtifactsDeps(), ...corruptions };
}

// --- GatherArtifactsParams ---

export type GatherArtifactsParamsOverrides = Partial<GatherArtifactsParams>;

export function buildGatherArtifactsParams(
  overrides?: GatherArtifactsParamsOverrides,
): GatherArtifactsParams {
  const { client } = createMockSupabaseClient("gather-artifacts");
  const dbClient = client as unknown as SupabaseClient<Database>;
  const base: GatherArtifactsParams = {
    dbClient,
    projectId: "project-abc",
    sessionId: "session-456",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherArtifactsParamsCorruptions = { [K in keyof GatherArtifactsParams]?: unknown };

export function invalidateGatherArtifactsParams(corruptions: GatherArtifactsParamsCorruptions): unknown {
  return { ...buildGatherArtifactsParams(), ...corruptions };
}

// --- GatherArtifactsPayload ---

export type GatherArtifactsPayloadOverrides = Partial<GatherArtifactsPayload>;

export function buildGatherArtifactsPayload(
  overrides?: GatherArtifactsPayloadOverrides,
): GatherArtifactsPayload {
  const base: GatherArtifactsPayload = {
    inputsRequired: [],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherArtifactsPayloadCorruptions = { [K in keyof GatherArtifactsPayload]?: unknown };

export function invalidateGatherArtifactsPayload(corruptions: GatherArtifactsPayloadCorruptions): unknown {
  return { ...buildGatherArtifactsPayload(), ...corruptions };
}

// --- GatherArtifactsSuccessReturn ---

export type GatherArtifactsSuccessReturnOverrides = Partial<GatherArtifactsSuccessReturn>;

export function buildGatherArtifactsSuccessReturn(
  overrides?: GatherArtifactsSuccessReturnOverrides,
): GatherArtifactsSuccessReturn {
  const base: GatherArtifactsSuccessReturn = {
    artifacts: [buildResourceDocument()],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherArtifactsSuccessReturnCorruptions = { [K in keyof GatherArtifactsSuccessReturn]?: unknown };

export function invalidateGatherArtifactsSuccessReturn(corruptions: GatherArtifactsSuccessReturnCorruptions): unknown {
  return { ...buildGatherArtifactsSuccessReturn(), ...corruptions };
}

// --- GatherArtifactsErrorReturn ---

export type GatherArtifactsErrorReturnOverrides = Partial<GatherArtifactsErrorReturn>;

export function buildGatherArtifactsErrorReturn(
  overrides?: GatherArtifactsErrorReturnOverrides,
): GatherArtifactsErrorReturn {
  const base: GatherArtifactsErrorReturn = {
    error: new Error("gatherArtifacts failed"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GatherArtifactsErrorReturnCorruptions = { [K in keyof GatherArtifactsErrorReturn]?: unknown };

export function invalidateGatherArtifactsErrorReturn(corruptions: GatherArtifactsErrorReturnCorruptions): unknown {
  return { ...buildGatherArtifactsErrorReturn(), ...corruptions };
}

// --- GatherArtifactsFn ---

export const mockGatherArtifacts: GatherArtifactsFn = async (
  _deps,
  _params,
  _payload,
) => {
  return buildGatherArtifactsSuccessReturn();
};

// --- BoundGatherArtifactsFn ---

export const mockBoundGatherArtifacts: BoundGatherArtifactsFn = async (
  _params,
  _payload,
) => {
  return buildGatherArtifactsSuccessReturn();
};

// --- Select helpers ---

export function buildSelectResult(
  data: object[] | null,
  error?: Error | {
    name: string;
    message: string;
    code: string;
    details?: string;
    hint?: string;
  } | null,
): {
  data: object[] | null;
  error: Error | {
    name: string;
    message: string;
    code: string;
    details?: string;
    hint?: string;
  } | null;
  count: number | null;
  status: number;
  statusText: string;
} {
  return {
    data,
    error: error ?? null,
    count: data === null ? null : data.length,
    status: 200,
    statusText: "OK",
  };
}

export function buildSelectHandler(
  data: object[] | null,
  error?: Error | {
    name: string;
    message: string;
    code: string;
    details?: string;
    hint?: string;
  } | null,
): () => Promise<{
  data: object[] | null;
  error: Error | {
    name: string;
    message: string;
    code: string;
    details?: string;
    hint?: string;
  } | null;
  count: number | null;
  status: number;
  statusText: string;
}> {
  return () => Promise.resolve(buildSelectResult(data, error));
}
