// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.mock.ts

import type { DialecticContributionRow } from "../../dialectic-service/dialectic.interface.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";

export type PrepareModelJobMockCall = {
  deps: PrepareModelJobDeps;
  params: PrepareModelJobParams;
  payload: PrepareModelJobPayload;
};

/**
 * Options for {@link createPrepareModelJobMock}. Supply either `handler` or `result` to
 * fully control behavior; otherwise a configurable success fallback is used.
 */
export type CreatePrepareModelJobMockOptions = {
  /** When set, invoked after recording the call; overrides `result` and default success. */
  handler?: PrepareModelJobFn;
  /** When set (and no `handler`), returned after recording the call. */
  result?: PrepareModelJobReturn;
  /** Contribution row for the default success path (no `handler` / `result`). */
  successContribution?: DialecticContributionRow;
  /** Default success only: `needsContinuation` (defaults to `false`). */
  needsContinuation?: boolean;
  /** Default success only: `renderJobId` (defaults to `null`). */
  renderJobId?: string | null;
};

function defaultMockContribution(): DialecticContributionRow {
  const now: string = new Date().toISOString();
  return {
    id: "mock-prepare-model-job-contribution",
    session_id: "mock-session",
    stage: "thesis",
    iteration_number: 1,
    model_id: "mock-model",
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: "model_contribution_main",
    created_at: now,
    error: null,
    file_name: "mock.txt",
    mime_type: "text/plain",
    model_name: "Mock Model",
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 0,
    storage_bucket: "mock-bucket",
    storage_path: "mock/path",
    target_contribution_id: null,
    tokens_used_input: 0,
    tokens_used_output: 0,
    updated_at: now,
    user_id: "mock-user",
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
  };
}

/**
 * Factory for a test double of {@link PrepareModelJobFn}: records each invocation
 * and returns a configured result, delegates to an optional handler, or defaults
 * to a success return with a stub contribution.
 */
export function createPrepareModelJobMock(
  options?: CreatePrepareModelJobMockOptions,
): {
  prepareModelJob: PrepareModelJobFn;
  calls: PrepareModelJobMockCall[];
} {
  const calls: PrepareModelJobMockCall[] = [];

  const prepareModelJob: PrepareModelJobFn = async (
    deps: PrepareModelJobDeps,
    params: PrepareModelJobParams,
    payload: PrepareModelJobPayload,
  ): Promise<PrepareModelJobReturn> => {
    calls.push({ deps, params, payload });
    if (options?.handler !== undefined) {
      return await options.handler(deps, params, payload);
    }
    if (options?.result !== undefined) {
      return options.result;
    }
    const contribution: DialecticContributionRow = options?.successContribution !== undefined
      ? options.successContribution
      : defaultMockContribution();
    const needsContinuation: boolean = options?.needsContinuation !== undefined
      ? options.needsContinuation
      : false;
    const renderJobId: string | null = options?.renderJobId !== undefined
      ? options.renderJobId
      : null;
    const fallback: PrepareModelJobSuccessReturn = {
      contribution,
      needsContinuation,
      renderJobId,
    };
    return fallback;
  };

  return { prepareModelJob, calls };
}
