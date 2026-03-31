import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import type { ResourceDocuments } from "../../_shared/types.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  DialecticContributionRow,
  DialecticFeedbackRow,
  DialecticProjectResourceRow,
  InputRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  GatherArtifactsDeps,
  GatherArtifactsErrorReturn,
  GatherArtifactsFn,
  GatherArtifactsParams,
  GatherArtifactsPayload,
  GatherArtifactsReturn,
  GatherArtifactsSuccessReturn,
} from "./gatherArtifacts.interface.ts";

export type GatherArtifactsMockCall = {
  deps: GatherArtifactsDeps;
  params: GatherArtifactsParams;
  payload: GatherArtifactsPayload;
};

export type CreateGatherArtifactsMockOptions = {
  handler?: GatherArtifactsFn;
  result?: GatherArtifactsReturn;
  successArtifacts?: Required<ResourceDocuments[number]>[];
  error?: Error;
  retriable?: boolean;
};

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
  };

  return {
    ...base,
    ...overrides,
  };
}

export function buildGatherArtifactsParams(
  dbClient: SupabaseClient<Database>,
  overrides?: Partial<GatherArtifactsParams>,
): GatherArtifactsParams {
  const base: GatherArtifactsParams = {
    dbClient,
    projectId: "project-abc",
    sessionId: "session-456",
    iterationNumber: 1,
  };

  return {
    ...base,
    ...overrides,
  };
}

export function buildGatherArtifactsPayload(
  inputsRequired?: InputRule[],
): GatherArtifactsPayload {
  return {
    inputsRequired: inputsRequired ?? [],
  };
}

export function buildDocumentRule(
  overrides?: Partial<InputRule>,
): InputRule {
  return {
    type: "document",
    slug: "thesis",
    document_key: FileType.business_case,
    required: true,
    ...overrides,
  };
}

export function buildFeedbackRule(
  overrides?: Partial<InputRule>,
): InputRule {
  return {
    type: "feedback",
    slug: "thesis",
    document_key: FileType.UserFeedback,
    required: true,
    ...overrides,
  };
}

export function buildSeedPromptRule(
  overrides?: Partial<InputRule>,
): InputRule {
  return {
    type: "seed_prompt",
    slug: "thesis",
    document_key: FileType.SeedPrompt,
    required: true,
    ...overrides,
  };
}

export function buildProjectResourceRule(
  overrides?: Partial<InputRule>,
): InputRule {
  return {
    type: "project_resource",
    slug: "project",
    document_key: FileType.InitialUserPrompt,
    required: true,
    ...overrides,
  };
}

export function buildHeaderContextRule(
  overrides?: Partial<InputRule>,
): InputRule {
  return {
    type: "header_context",
    slug: "thesis",
    document_key: FileType.HeaderContext,
    required: true,
    ...overrides,
  };
}

export function buildDialecticProjectResourceRow(
  overrides?: Partial<DialecticProjectResourceRow>,
): DialecticProjectResourceRow {
  const now = new Date().toISOString();
  return {
    id: "resource-1",
    project_id: "project-abc",
    session_id: "session-456",
    iteration_number: 1,
    stage_slug: "thesis",
    resource_type: "rendered_document",
    storage_bucket: "dialectic-contributions",
    storage_path: "project-abc/session_session-456/iteration_1/thesis/documents",
    file_name: "model-collect_1_business_case.md",
    mime_type: "text/markdown",
    size_bytes: 100,
    user_id: "user-1",
    source_contribution_id: null,
    resource_description: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function buildDialecticFeedbackRow(
  overrides?: Partial<DialecticFeedbackRow>,
): DialecticFeedbackRow {
  const now = new Date().toISOString();
  return {
    id: "feedback-1",
    project_id: "project-abc",
    session_id: "session-456",
    iteration_number: 1,
    stage_slug: "thesis",
    feedback_type: "user_feedback",
    storage_bucket: "dialectic-contributions",
    storage_path: "project-abc/session_session-456/iteration_1/thesis",
    file_name: "user_feedback_thesis.md",
    mime_type: "text/markdown",
    size_bytes: 80,
    user_id: "user-1",
    target_contribution_id: null,
    resource_description: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function buildDialecticContributionRow(
  overrides?: Partial<DialecticContributionRow>,
): DialecticContributionRow {
  const now = new Date().toISOString();
  return {
    id: "contribution-1",
    session_id: "session-456",
    stage: "thesis",
    iteration_number: 1,
    model_id: "model-1",
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: "model_contribution_main",
    created_at: now,
    error: null,
    file_name: "model-collect_1_header_context.json",
    mime_type: "application/json",
    model_name: "Model 1",
    original_model_contribution_id: null,
    processing_time_ms: 10,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 120,
    storage_bucket: "dialectic-contributions",
    storage_path: "project-abc/session_session-456/iteration_1/thesis/documents",
    target_contribution_id: null,
    tokens_used_input: 5,
    tokens_used_output: 10,
    updated_at: now,
    user_id: "user-1",
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
    ...overrides,
  };
}

export function buildGatherArtifact(
  overrides?: Partial<Required<ResourceDocuments[number]>>,
): Required<ResourceDocuments[number]> {
  return {
    id: "artifact-1",
    content: "artifact-content",
    document_key: FileType.HeaderContext,
    stage_slug: "thesis",
    type: "document",
    ...overrides,
  };
}

export function buildGatherArtifactsSuccessReturn(
  artifacts?: Required<ResourceDocuments[number]>[],
): GatherArtifactsSuccessReturn {
  return {
    artifacts: artifacts ?? [buildGatherArtifact()],
  };
}

export function buildGatherArtifactsErrorReturn(
  error?: Error,
  retriable?: boolean,
): GatherArtifactsErrorReturn {
  return {
    error: error ?? new Error("gatherArtifacts failed"),
    retriable: retriable ?? false,
  };
}

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

export function createGatherArtifactsMock(
  options?: CreateGatherArtifactsMockOptions,
): {
  gatherArtifacts: GatherArtifactsFn;
  calls: GatherArtifactsMockCall[];
} {
  const calls: GatherArtifactsMockCall[] = [];

  const gatherArtifactsMock: GatherArtifactsFn = async (
    deps: GatherArtifactsDeps,
    params: GatherArtifactsParams,
    payload: GatherArtifactsPayload,
  ): Promise<GatherArtifactsReturn> => {
    calls.push({ deps, params, payload });

    if (options?.handler) {
      return options.handler(deps, params, payload);
    }
    if (options?.result) {
      return options.result;
    }
    if (options?.error) {
      return buildGatherArtifactsErrorReturn(options.error, options.retriable);
    }

    return buildGatherArtifactsSuccessReturn(options?.successArtifacts);
  };

  return {
    gatherArtifacts: gatherArtifactsMock,
    calls,
  };
}
