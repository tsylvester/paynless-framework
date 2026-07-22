import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import { DialecticStageSlug } from "../../../types/file_manager.types.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import type {
  AssembleContributionChainDeps,
  AssembleContributionChainErrorReturn,
  AssembleContributionChainFn,
  AssembleContributionChainParams,
  AssembleContributionChainPayload,
  AssembleContributionChainSuccessReturn,
} from "./assembleContributionChain.interface.ts";

export type AssembleContributionChainDepsOverrides = Partial<AssembleContributionChainDeps>;

export type AssembleContributionChainParamsOverrides = Partial<AssembleContributionChainParams>;

export type AssembleContributionChainPayloadOverrides = Partial<AssembleContributionChainPayload>;

export type AssembleContributionChainSuccessReturnOverrides =
  Partial<AssembleContributionChainSuccessReturn>;

export type AssembleContributionChainErrorReturnOverrides =
  Partial<AssembleContributionChainErrorReturn>;

export type AssembleContributionChainDepsCorruptions = {
  [K in keyof AssembleContributionChainDeps]?: unknown;
};

export type AssembleContributionChainParamsCorruptions = {
  [K in keyof AssembleContributionChainParams]?: unknown;
};

export type AssembleContributionChainPayloadCorruptions = {
  [K in keyof AssembleContributionChainPayload]?: unknown;
};

export type AssembleContributionChainSuccessReturnCorruptions = {
  [K in keyof AssembleContributionChainSuccessReturn]?: unknown;
};

export type AssembleContributionChainErrorReturnCorruptions = {
  [K in keyof AssembleContributionChainErrorReturn]?: unknown;
};

export function buildAssembleContributionChainDeps(
  overrides?: AssembleContributionChainDepsOverrides,
): AssembleContributionChainDeps {
  const base: AssembleContributionChainDeps = {};
  return overrides ? { ...base, ...overrides } : base;
}

export function buildAssembleContributionChainParams(
  overrides?: AssembleContributionChainParamsOverrides,
): AssembleContributionChainParams {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: AssembleContributionChainParams = { dbClient };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildAssembleContributionChainPayload(
  overrides?: AssembleContributionChainPayloadOverrides,
): AssembleContributionChainPayload {
  const base: AssembleContributionChainPayload = {
    sessionId: "session_abc",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    documentIdentity: "root-id-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildAssembleContributionChainSuccessReturn(
  overrides?: AssembleContributionChainSuccessReturnOverrides,
): AssembleContributionChainSuccessReturn {
  const base: AssembleContributionChainSuccessReturn = {
    orderedChunks: [],
    modelSlug: "mock-model",
    attemptCount: 0,
    sourceGroupFragment: undefined,
    sourceAnchorModelSlug: undefined,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildAssembleContributionChainErrorReturn(
  overrides?: AssembleContributionChainErrorReturnOverrides,
): AssembleContributionChainErrorReturn {
  const base: AssembleContributionChainErrorReturn = {
    error: new Error("mock error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildContributionRow(
  overrides?: Partial<Database["public"]["Tables"]["dialectic_contributions"]["Row"]>,
): Database["public"]["Tables"]["dialectic_contributions"]["Row"] {
  const now = new Date().toISOString();
  const base: Database["public"]["Tables"]["dialectic_contributions"]["Row"] = {
    id: "mock-contribution-id",
    session_id: "session_abc",
    stage: "THESIS",
    iteration_number: 1,
    model_id: null,
    model_name: null,
    storage_bucket: "content",
    storage_path: "proj_x/session_s/iteration_1/thesis/documents",
    file_name: "mock-model_0_business_case_raw.json",
    raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/mock-model_0_business_case_raw.json",
    mime_type: "text/markdown",
    document_relationships: { thesis: "root-id-1" },
    created_at: now,
    updated_at: now,
    target_contribution_id: null,
    edit_version: 1,
    is_latest_edit: true,
    user_id: null,
    contribution_type: null,
    citations: null,
    error: null,
    is_header: false,
    original_model_contribution_id: null,
    processing_time_ms: null,
    prompt_template_id_used: null,
    seed_prompt_url: null,
    size_bytes: null,
    source_prompt_resource_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateAssembleContributionChainDeps(
  corruptions: AssembleContributionChainDepsCorruptions,
): unknown {
  return { ...buildAssembleContributionChainDeps(), ...corruptions };
}

export function invalidateAssembleContributionChainParams(
  corruptions: AssembleContributionChainParamsCorruptions,
): unknown {
  return { ...buildAssembleContributionChainParams(), ...corruptions };
}

export function invalidateAssembleContributionChainPayload(
  corruptions: AssembleContributionChainPayloadCorruptions,
): unknown {
  return { ...buildAssembleContributionChainPayload(), ...corruptions };
}

export function invalidateAssembleContributionChainSuccessReturn(
  corruptions: AssembleContributionChainSuccessReturnCorruptions,
): unknown {
  return { ...buildAssembleContributionChainSuccessReturn(), ...corruptions };
}

export function invalidateAssembleContributionChainErrorReturn(
  corruptions: AssembleContributionChainErrorReturnCorruptions,
): unknown {
  return { ...buildAssembleContributionChainErrorReturn(), ...corruptions };
}

/**
 * Mock implementation of {@link AssembleContributionChainFn}.
 * Returns a default success return; tests that need variation compose their own
 * `AssembleContributionChainFn` from the builders above.
 */
export const mockAssembleContributionChain: AssembleContributionChainFn = async (
  _deps: AssembleContributionChainDeps,
  _params: AssembleContributionChainParams,
  _payload: AssembleContributionChainPayload,
) => {
  return buildAssembleContributionChainSuccessReturn();
};
