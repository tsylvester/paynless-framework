import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../../../types_db.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import { createMockDownloadFromStorage } from "../../../supabase_storage_utils.mock.ts";
import type { DownloadFromStorageFn } from "../../../supabase_storage_utils.ts";
import type {
  LoadDocumentTemplateDeps,
  LoadDocumentTemplateFn,
  LoadDocumentTemplateParams,
  LoadDocumentTemplatePayload,
  LoadDocumentTemplateReturn,
  LoadDocumentTemplateSuccessReturn,
  LoadDocumentTemplateErrorReturn,
} from "./loadDocumentTemplate.interface.ts";

export type LoadDocumentTemplateDepsOverrides = Partial<LoadDocumentTemplateDeps>;

export type LoadDocumentTemplateParamsOverrides = Partial<LoadDocumentTemplateParams>;

export type LoadDocumentTemplatePayloadOverrides = Partial<LoadDocumentTemplatePayload>;

export type LoadDocumentTemplateSuccessReturnOverrides = Partial<LoadDocumentTemplateSuccessReturn>;

export type LoadDocumentTemplateErrorReturnOverrides = Partial<LoadDocumentTemplateErrorReturn>;

export type LoadDocumentTemplateDepsCorruptions = {
  [K in keyof LoadDocumentTemplateDeps]?: unknown;
};

export type LoadDocumentTemplateParamsCorruptions = {
  [K in keyof LoadDocumentTemplateParams]?: unknown;
};

export type LoadDocumentTemplatePayloadCorruptions = {
  [K in keyof LoadDocumentTemplatePayload]?: unknown;
};

export type LoadDocumentTemplateSuccessReturnCorruptions = {
  [K in keyof LoadDocumentTemplateSuccessReturn]?: unknown;
};

export type LoadDocumentTemplateErrorReturnCorruptions = {
  [K in keyof LoadDocumentTemplateErrorReturn]?: unknown;
};

const defaultDownloadFromStorage: DownloadFromStorageFn = createMockDownloadFromStorage({
  mode: "success",
  data: new ArrayBuffer(0),
});

export function buildLoadDocumentTemplateDeps(
  overrides?: LoadDocumentTemplateDepsOverrides,
): LoadDocumentTemplateDeps {
  const base: LoadDocumentTemplateDeps = {
    downloadFromStorage: defaultDownloadFromStorage,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildLoadDocumentTemplateParams(
  overrides?: LoadDocumentTemplateParamsOverrides,
): LoadDocumentTemplateParams {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: LoadDocumentTemplateParams = { dbClient };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildLoadDocumentTemplatePayload(
  overrides?: LoadDocumentTemplatePayloadOverrides,
): LoadDocumentTemplatePayload {
  const base: LoadDocumentTemplatePayload = {
    projectId: "project_123",
    templateFilename: "thesis_business_case.md",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildLoadDocumentTemplateSuccessReturn(
  overrides?: LoadDocumentTemplateSuccessReturnOverrides,
): LoadDocumentTemplateSuccessReturn {
  const base: LoadDocumentTemplateSuccessReturn = {
    templateText: "mock template text",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildLoadDocumentTemplateErrorReturn(
  overrides?: LoadDocumentTemplateErrorReturnOverrides,
): LoadDocumentTemplateErrorReturn {
  const base: LoadDocumentTemplateErrorReturn = {
    error: new Error("mock error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateLoadDocumentTemplateDeps(
  corruptions: LoadDocumentTemplateDepsCorruptions,
): unknown {
  return { ...buildLoadDocumentTemplateDeps(), ...corruptions };
}

export function invalidateLoadDocumentTemplateParams(
  corruptions: LoadDocumentTemplateParamsCorruptions,
): unknown {
  return { ...buildLoadDocumentTemplateParams(), ...corruptions };
}

export function invalidateLoadDocumentTemplatePayload(
  corruptions: LoadDocumentTemplatePayloadCorruptions,
): unknown {
  return { ...buildLoadDocumentTemplatePayload(), ...corruptions };
}

export function invalidateLoadDocumentTemplateSuccessReturn(
  corruptions: LoadDocumentTemplateSuccessReturnCorruptions,
): unknown {
  return { ...buildLoadDocumentTemplateSuccessReturn(), ...corruptions };
}

export function invalidateLoadDocumentTemplateErrorReturn(
  corruptions: LoadDocumentTemplateErrorReturnCorruptions,
): unknown {
  return { ...buildLoadDocumentTemplateErrorReturn(), ...corruptions };
}

/**
 * Mock implementation of {@link LoadDocumentTemplateFn}.
 * Returns a default success return; tests that need variation compose their own
 * `LoadDocumentTemplateFn` from the builders above.
 */
export const mockLoadDocumentTemplate: LoadDocumentTemplateFn = async (
  _deps: LoadDocumentTemplateDeps,
  _params: LoadDocumentTemplateParams,
  _payload: LoadDocumentTemplatePayload,
): Promise<LoadDocumentTemplateReturn> => {
  return buildLoadDocumentTemplateSuccessReturn();
};

// Real template structure from docs/templates/thesis/thesis_business_case.md
export const REAL_THESIS_BUSINESS_CASE_TEMPLATE = Deno.readTextFileSync(
  new URL("../../../../../../../docs/templates/thesis/thesis_business_case.md", import.meta.url),
);

export function mockProjectRow(domainId: string): Tables<"dialectic_projects"> {
  const now = new Date().toISOString();
  return {
    id: "project_123",
    created_at: now,
    updated_at: now,
    selected_domain_id: domainId,
    idempotency_key: null,
    initial_prompt_resource_id: null,
    initial_user_prompt: "",
    process_template_id: null,
    project_name: "Mock Project",
    repo_url: null,
    selected_domain_overlay_id: null,
    status: "active",
    user_domain_overlay_values: null,
    user_id: "user_123",
  };
}

export function mockDocumentTemplateRow(
  overrides?: Partial<Tables<"dialectic_document_templates">>,
): Tables<"dialectic_document_templates"> {
  const now = new Date().toISOString();
  const base: Tables<"dialectic_document_templates"> = {
    id: "template-id-1",
    created_at: now,
    description: null,
    domain_id: "domain-1",
    file_name: "thesis_business_case.md",
    is_active: true,
    name: "thesis_business_case",
    storage_bucket: "prompt-templates",
    storage_path: "templates/thesis",
    updated_at: now,
  };
  return overrides ? { ...base, ...overrides } : base;
}
