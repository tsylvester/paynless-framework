import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";
import { mockBoundResolveCompressionSource } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import type {
  ApplyCompressionOverlayDeps,
  ApplyCompressionOverlayParams,
  ApplyCompressionOverlayPayload,
  ApplyCompressionOverlaySuccessReturn,
  ApplyCompressionOverlayErrorReturn,
  ApplyCompressionOverlayFn,
  BoundApplyCompressionOverlayFn,
} from "./applyCompressionOverlay.interface.ts";

// --- ApplyCompressionOverlayDeps ---

export type ApplyCompressionOverlayDepsOverrides =
  Partial<ApplyCompressionOverlayDeps>;

export function buildApplyCompressionOverlayDeps(
  overrides?: ApplyCompressionOverlayDepsOverrides,
): ApplyCompressionOverlayDeps {
  const contentBytes = new TextEncoder().encode("compressed-content");
  const contentBuffer = new ArrayBuffer(contentBytes.byteLength);
  new Uint8Array(contentBuffer).set(contentBytes);

  const base: ApplyCompressionOverlayDeps = {
    logger: new MockLogger(),
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: contentBuffer,
    }),
    resolveCompressionSource: mockBoundResolveCompressionSource,
  };

  return overrides ? { ...base, ...overrides } : base;
}

export type ApplyCompressionOverlayDepsCorruptions = {
  [K in keyof ApplyCompressionOverlayDeps]?: unknown;
};

export function invalidateApplyCompressionOverlayDeps(
  corruptions: ApplyCompressionOverlayDepsCorruptions,
): unknown {
  return { ...buildApplyCompressionOverlayDeps(), ...corruptions };
}

// --- ApplyCompressionOverlayParams ---

export type ApplyCompressionOverlayParamsOverrides =
  Partial<ApplyCompressionOverlayParams>;

export function buildApplyCompressionOverlayParams(
  overrides?: ApplyCompressionOverlayParamsOverrides,
): ApplyCompressionOverlayParams {
  const mockSetup = createMockSupabaseClient("apply-compression-overlay");
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: ApplyCompressionOverlayParams = {
    dbClient,
    projectId: "project-abc",
    sessionId: "session-456",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
  };

  return overrides ? { ...base, ...overrides } : base;
}

export type ApplyCompressionOverlayParamsCorruptions = {
  [K in keyof ApplyCompressionOverlayParams]?: unknown;
};

export function invalidateApplyCompressionOverlayParams(
  corruptions: ApplyCompressionOverlayParamsCorruptions,
): unknown {
  return {
    ...buildApplyCompressionOverlayParams(),
    ...corruptions,
  };
}

// --- ApplyCompressionOverlayPayload ---

export type ApplyCompressionOverlayPayloadOverrides =
  Partial<ApplyCompressionOverlayPayload>;

export function buildApplyCompressionOverlayPayload(
  overrides?: ApplyCompressionOverlayPayloadOverrides,
): ApplyCompressionOverlayPayload {
  const base: ApplyCompressionOverlayPayload = {
    resourceDocuments: [],
    conversationHistory: [],
  };

  return overrides ? { ...base, ...overrides } : base;
}

export type ApplyCompressionOverlayPayloadCorruptions = {
  [K in keyof ApplyCompressionOverlayPayload]?: unknown;
};

export function invalidateApplyCompressionOverlayPayload(
  corruptions: ApplyCompressionOverlayPayloadCorruptions,
): unknown {
  return { ...buildApplyCompressionOverlayPayload(), ...corruptions };
}

// --- ApplyCompressionOverlaySuccessReturn ---

export type ApplyCompressionOverlaySuccessReturnOverrides =
  Partial<ApplyCompressionOverlaySuccessReturn>;

export function buildApplyCompressionOverlaySuccessReturn(
  overrides?: ApplyCompressionOverlaySuccessReturnOverrides,
): ApplyCompressionOverlaySuccessReturn {
  const base: ApplyCompressionOverlaySuccessReturn = {
    resourceDocuments: [],
    conversationHistory: [],
    overlaidCount: 0,
  };

  return overrides ? { ...base, ...overrides } : base;
}

export type ApplyCompressionOverlaySuccessReturnCorruptions = {
  [K in keyof ApplyCompressionOverlaySuccessReturn]?: unknown;
};

export function invalidateApplyCompressionOverlaySuccessReturn(
  corruptions: ApplyCompressionOverlaySuccessReturnCorruptions,
): unknown {
  return { ...buildApplyCompressionOverlaySuccessReturn(), ...corruptions };
}

// --- ApplyCompressionOverlayErrorReturn ---

export type ApplyCompressionOverlayErrorReturnOverrides =
  Partial<ApplyCompressionOverlayErrorReturn>;

export function buildApplyCompressionOverlayErrorReturn(
  overrides?: ApplyCompressionOverlayErrorReturnOverrides,
): ApplyCompressionOverlayErrorReturn {
  const base: ApplyCompressionOverlayErrorReturn = {
    error: new Error("applyCompressionOverlay failed"),
    retriable: false,
  };

  return overrides ? { ...base, ...overrides } : base;
}

export type ApplyCompressionOverlayErrorReturnCorruptions = {
  [K in keyof ApplyCompressionOverlayErrorReturn]?: unknown;
};

export function invalidateApplyCompressionOverlayErrorReturn(
  corruptions: ApplyCompressionOverlayErrorReturnCorruptions,
): unknown {
  return { ...buildApplyCompressionOverlayErrorReturn(), ...corruptions };
}

// --- ApplyCompressionOverlayFn ---

export const mockApplyCompressionOverlay: ApplyCompressionOverlayFn = async (
  _deps,
  _params,
  _payload,
) => {
  return buildApplyCompressionOverlaySuccessReturn();
};

// --- BoundApplyCompressionOverlayFn ---

export const mockBoundApplyCompressionOverlay: BoundApplyCompressionOverlayFn = async (
  _params,
  payload,
) => {
  return buildApplyCompressionOverlaySuccessReturn({
    resourceDocuments: payload.resourceDocuments,
    conversationHistory: payload.conversationHistory,
  });
};
