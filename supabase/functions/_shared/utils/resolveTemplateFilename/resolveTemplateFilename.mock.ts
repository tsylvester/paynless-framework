// supabase/functions/_shared/utils/resolveTemplateFilename/resolveTemplateFilename.mock.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../../types_db.ts";
import { DialecticStageSlug, FileType } from "../../types/file_manager.types.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../../supabase.mock.ts";
import type {
  ResolveTemplateFilenameDeps,
  ResolveTemplateFilenameFn,
  ResolveTemplateFilenameParams,
  ResolveTemplateFilenamePayload,
  ResolveTemplateFilenameReturn,
  ResolveTemplateFilenameSuccessReturn,
  ResolveTemplateFilenameErrorReturn,
} from "./resolveTemplateFilename.interface.ts";

export type ResolveTemplateFilenameDepsOverrides = Partial<ResolveTemplateFilenameDeps>;

export type ResolveTemplateFilenameParamsOverrides = Partial<ResolveTemplateFilenameParams>;

export type ResolveTemplateFilenamePayloadOverrides = Partial<ResolveTemplateFilenamePayload>;

export type ResolveTemplateFilenameSuccessReturnOverrides =
  Partial<ResolveTemplateFilenameSuccessReturn>;

export type ResolveTemplateFilenameErrorReturnOverrides =
  Partial<ResolveTemplateFilenameErrorReturn>;

export type ResolveTemplateFilenameDepsCorruptions = {
  [K in keyof ResolveTemplateFilenameDeps]?: unknown;
};

export type ResolveTemplateFilenameParamsCorruptions = {
  [K in keyof ResolveTemplateFilenameParams]?: unknown;
};

export type ResolveTemplateFilenamePayloadCorruptions = {
  [K in keyof ResolveTemplateFilenamePayload]?: unknown;
};

export type ResolveTemplateFilenameSuccessReturnCorruptions = {
  [K in keyof ResolveTemplateFilenameSuccessReturn]?: unknown;
};

export type ResolveTemplateFilenameErrorReturnCorruptions = {
  [K in keyof ResolveTemplateFilenameErrorReturn]?: unknown;
};

export function buildResolveTemplateFilenameDeps(
  overrides?: ResolveTemplateFilenameDepsOverrides,
): ResolveTemplateFilenameDeps {
  const base: ResolveTemplateFilenameDeps = {};
  return overrides ? { ...base, ...overrides } : base;
}

export function buildResolveTemplateFilenameParams(
  overrides?: ResolveTemplateFilenameParamsOverrides,
): ResolveTemplateFilenameParams {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: ResolveTemplateFilenameParams = { dbClient };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildResolveTemplateFilenamePayload(
  overrides?: ResolveTemplateFilenamePayloadOverrides,
): ResolveTemplateFilenamePayload {
  const base: ResolveTemplateFilenamePayload = {
    stageSlug: DialecticStageSlug.Thesis,
    outputType: FileType.business_case,
    documentKey: FileType.business_case,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildResolveTemplateFilenameSuccessReturn(
  overrides?: ResolveTemplateFilenameSuccessReturnOverrides,
): ResolveTemplateFilenameSuccessReturn {
  const base: ResolveTemplateFilenameSuccessReturn = {
    templateFilename: "mock_template.md",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildResolveTemplateFilenameErrorReturn(
  overrides?: ResolveTemplateFilenameErrorReturnOverrides,
): ResolveTemplateFilenameErrorReturn {
  const base: ResolveTemplateFilenameErrorReturn = {
    error: new Error("mock error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateResolveTemplateFilenameDeps(
  corruptions: ResolveTemplateFilenameDepsCorruptions,
): unknown {
  return { ...buildResolveTemplateFilenameDeps(), ...corruptions };
}

export function invalidateResolveTemplateFilenameParams(
  corruptions: ResolveTemplateFilenameParamsCorruptions,
): unknown {
  return { ...buildResolveTemplateFilenameParams(), ...corruptions };
}

export function invalidateResolveTemplateFilenamePayload(
  corruptions: ResolveTemplateFilenamePayloadCorruptions,
): unknown {
  return { ...buildResolveTemplateFilenamePayload(), ...corruptions };
}

export function invalidateResolveTemplateFilenameSuccessReturn(
  corruptions: ResolveTemplateFilenameSuccessReturnCorruptions,
): unknown {
  return { ...buildResolveTemplateFilenameSuccessReturn(), ...corruptions };
}

export function invalidateResolveTemplateFilenameErrorReturn(
  corruptions: ResolveTemplateFilenameErrorReturnCorruptions,
): unknown {
  return { ...buildResolveTemplateFilenameErrorReturn(), ...corruptions };
}

/**
 * Mock implementation of {@link ResolveTemplateFilenameFn}.
 * Returns a default success return; tests that need variation compose their own
 * `ResolveTemplateFilenameFn` from the builders above.
 */
export const mockResolveTemplateFilename: ResolveTemplateFilenameFn = async (
  _deps: ResolveTemplateFilenameDeps,
  _params: ResolveTemplateFilenameParams,
  _payload: ResolveTemplateFilenamePayload,
): Promise<ResolveTemplateFilenameReturn> => {
  return buildResolveTemplateFilenameSuccessReturn();
};

// Copied verbatim from dialectic-worker/enqueueRenderJob/enqueueRenderJob.test.ts:73-202.
// These fixtures describe the four-table recipe chain used by the template resolution walk.

export const mockStageRow: Tables<"dialectic_stages"> = {
  id: "stage-1",
  slug: DialecticStageSlug.Thesis,
  display_name: "Thesis",
  description: null,
  default_system_prompt_id: null,
  recipe_template_id: "template-1",
  active_recipe_instance_id: "instance-1",
  expected_output_template_ids: [],
  created_at: new Date().toISOString(),
  minimum_balance: 0,
};

export function mockInstanceRow(
  isCloned: boolean,
): Tables<"dialectic_stage_recipe_instances"> {
  return {
    id: "instance-1",
    stage_id: "stage-1",
    template_id: "template-1",
    is_cloned: isCloned,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function mockTemplateStepRow(): Tables<"dialectic_recipe_template_steps"> {
  return {
    id: "step-1",
    template_id: "template-1",
    step_number: 1,
    step_key: "execute_business_case",
    step_slug: "execute-business-case",
    step_name: "Execute Business Case",
    step_description: null,
    job_type: "EXECUTE",
    prompt_type: "Turn",
    prompt_template_id: null,
    output_type: "business_case",
    granularity_strategy: "per_source_document",
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {
      files_to_generate: [
        {
          from_document_key: "business_case",
          template_filename: "thesis_business_case.md",
        },
      ],
    },
    parallel_group: null,
    branch_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function mockClonedStepRow(): Tables<"dialectic_stage_recipe_steps"> {
  const t = mockTemplateStepRow();
  const cloned: Tables<"dialectic_stage_recipe_steps"> = {
    id: "cloned-step-1",
    instance_id: "instance-1",
    branch_key: t.branch_key,
    config_override: {},
    created_at: t.created_at,
    execution_order: 1,
    granularity_strategy: t.granularity_strategy,
    inputs_relevance: t.inputs_relevance,
    inputs_required: t.inputs_required,
    is_skipped: false,
    job_type: t.job_type,
    object_filter: {},
    output_overrides: {},
    output_type: t.output_type,
    outputs_required: t.outputs_required,
    parallel_group: t.parallel_group,
    prompt_template_id: t.prompt_template_id,
    prompt_type: t.prompt_type,
    step_description: t.step_description,
    step_key: t.step_key,
    step_name: t.step_name,
    step_slug: t.step_slug,
    template_step_id: null,
    updated_at: t.updated_at,
  };
  return cloned;
}

export function recipeChainConfig(
  isCloned: boolean,
): NonNullable<MockSupabaseDataConfig["genericMockResults"]> {
  const instance: Tables<"dialectic_stage_recipe_instances"> = mockInstanceRow(isCloned);
  const templateSteps = {
    select: { data: [mockTemplateStepRow()], error: null as Error | null },
  };
  const clonedSteps = {
    select: { data: [mockClonedStepRow()], error: null as Error | null },
  };
  const base: NonNullable<MockSupabaseDataConfig["genericMockResults"]> = {
    dialectic_stages: { select: { data: [mockStageRow], error: null } },
    dialectic_stage_recipe_instances: { select: { data: [instance], error: null } },
  };
  if (isCloned) {
    base.dialectic_stage_recipe_steps = clonedSteps;
  } else {
    base.dialectic_recipe_template_steps = templateSteps;
  }
  return base;
}
