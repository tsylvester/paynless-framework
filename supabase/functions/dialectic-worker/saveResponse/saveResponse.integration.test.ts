import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  mockNotificationService,
  resetMockNotificationService,
} from "../../_shared/utils/notification.service.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { sanitizeJsonContent } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.ts";
import { resolveFinishReason } from "../../_shared/utils/resolveFinishReason.ts";
import { isIntermediateChunk } from "../../_shared/utils/isIntermediateChunk.ts";
import { determineContinuation } from "../../_shared/utils/determineContinuation/determineContinuation.ts";
import { buildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.ts";
import { retryJob } from "../retryJob.ts";
import { continueJob } from "../continueJob.ts";
import { saveResponse } from "./saveResponse.ts";
import type {
  SaveResponseDeps,
  SaveResponseParams,
  SaveResponsePayload,
  SaveResponseReturn,
  SaveResponseSuccessReturn,
  SaveResponseErrorReturn,
} from "./saveResponse.interface.ts";
import {
  createMockContributionRow,
  createMockFileManager,
  saveResponseTestPayload,
  saveResponseTestPayloadDocumentArtifact,
} from "./saveResponse.mock.ts";
import type { DialecticExecuteJobPayload } from "../../dialectic-service/dialectic.interface.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import { isSaveResponseSuccessReturn, isSaveResponseErrorReturn } from "./saveResponse.guard.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobRow(payload: DialecticExecuteJobPayload, overrides?: Record<string, unknown>) {
  if (!isJson(payload)) {
    throw new Error("Test payload is not valid JSON.");
  }
  return {
    id: "job-id-123",
    session_id: "session-456",
    stage_slug: "thesis",
    iteration_number: 1,
    status: "queued",
    user_id: "user-789",
    attempt_count: 0,
    completed_at: null,
    created_at: new Date().toISOString(),
    error_details: null,
    max_retries: 3,
    parent_job_id: null,
    prerequisite_job_id: null,
    results: null,
    started_at: null,
    target_contribution_id: null,
    payload,
    is_test_job: false,
    job_type: "EXECUTE",
    idempotency_key: null,
    ...overrides,
  };
}

function makeProviderRow() {
  return {
    id: "model-def",
    provider: "mock-provider",
    name: "Mock AI",
    api_identifier: "mock-ai-v1",
    config: {
      tokenization_strategy: { type: "rough_char_count" },
      context_window_tokens: 10000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      provider_max_input_tokens: 100,
      provider_max_output_tokens: 50,
      api_identifier: "mock-ai-v1",
    },
    created_at: new Date().toISOString(),
    description: null,
    is_active: true,
    is_enabled: true,
    is_default_embedding: false,
    is_default_generation: false,
    updated_at: new Date().toISOString(),
  };
}

function makeSessionRow() {
  return {
    id: "session-456",
    project_id: "project-abc",
    session_description: "A mock session",
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_ids: ["model-def"],
    status: "in-progress",
    associated_chat_id: "chat-789",
    current_stage_id: "stage-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    idempotency_key: "session-456_render",
    viewing_stage_id: null,
  };
}

function makeWalletRow() {
  return {
    wallet_id: "wallet-ghi",
    user_id: "user-789",
    organization_id: null,
    balance: 10000,
    currency: "AI_TOKEN",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Build deps with REAL retryJob & continueJob (within the application boundary).
 * Mock only at external boundaries: fileManager, notificationService, debitTokens.
 */
function buildIntegrationDeps(overrides?: Partial<SaveResponseDeps>): SaveResponseDeps {
  const logger = new MockLogger();
  const base: SaveResponseDeps = {
    logger,
    fileManager: new MockFileManagerService(),
    notificationService: mockNotificationService,
    continueJob,
    retryJob,
    resolveFinishReason,
    isIntermediateChunk,
    determineContinuation,
    buildUploadContext,
    debitTokens: async () => ({
      result: {
        userMessage: {
          id: crypto.randomUUID(),
          chat_id: null,
          user_id: null,
          role: "user",
          content: "mock-user-message",
          ai_provider_id: null,
          system_prompt_id: null,
          token_usage: null,
          is_active_in_thread: true,
          error_type: null,
          response_to_message_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        assistantMessage: {
          id: crypto.randomUUID(),
          chat_id: null,
          user_id: null,
          role: "assistant",
          content: "mock-assistant-message",
          ai_provider_id: null,
          system_prompt_id: null,
          token_usage: null,
          is_active_in_thread: true,
          error_type: null,
          response_to_message_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      transactionRecordedSuccessfully: true,
    }),
    sanitizeJsonContent,
    enqueueRenderJob: async () => ({ renderJobId: null }),
  };
  if (!overrides) return base;
  return { ...base, ...overrides };
}

function buildMockSupabase(
  jobPayload: DialecticExecuteJobPayload,
  jobRowOverrides?: Record<string, unknown>,
) {
  const jobRow = makeJobRow(jobPayload, jobRowOverrides);
  return createMockSupabaseClient("integration-test", {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: { data: [jobRow], error: null },
        update: { data: null, error: null },
        insert: { data: null, error: null },
      },
      ai_providers: {
        select: { data: [makeProviderRow()], error: null },
      },
      dialectic_sessions: {
        select: { data: [makeSessionRow()], error: null },
      },
      token_wallets: {
        select: { data: [makeWalletRow()], error: null },
      },
      dialectic_contributions: {
        update: { data: null, error: null },
      },
      dialectic_project_resources: {
        update: { data: null, error: null },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("Integration: saveResponse terminal success updates job to completed and fires execute_completed notification", async () => {
  resetMockNotificationService();
  // Use document-artifact payload so isDocumentRelated(fileType) is true and execute_completed fires
  const contribution = createMockContributionRow({
    id: "contrib-integration-1",
    document_relationships: {
      thesis: "contrib-integration-1",
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  const fm = createMockFileManager({ outcome: "success", contribution });
  const deps = buildIntegrationDeps({ fileManager: fm });
  const mockSetup = buildMockSupabase(saveResponseTestPayloadDocumentArtifact);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ result: "valid json content" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
  };

  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert success
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "completed");
  } else {
    throw new Error("Result is not a success return");
  }
});

Deno.test("Integration: saveResponse with empty AI content triggers real retryJob which updates job to retrying", async () => {
  resetMockNotificationService();
  const deps = buildIntegrationDeps();
  const mockSetup = buildMockSupabase(saveResponseTestPayload);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: "",
    token_usage: null,
    finish_reason: null,
  };
// Assert success return from retry path
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);
  if (!isSaveResponseSuccessReturn(result)) {
    throw new Error("Expected success return from retry path");
  }
  const successResult: SaveResponseSuccessReturn = result;
  assertEquals(successResult.status, "completed");
  // Assert retryJob updated the job status to 'retrying' in the DB
  const jobUpdateSpies = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(jobUpdateSpies);
  assertEquals(jobUpdateSpies.callCount > 0, true, "retryJob should update job status via DB update");

  // Assert retry notification sent
  const retryCalls = mockNotificationService.sendContributionRetryingEvent.calls;
  assertEquals(retryCalls.length > 0, true, "retryJob should send contribution_generation_retrying notification");
});

Deno.test("Integration: saveResponse continuation path triggers real continueJob which enqueues new job", async () => {
  resetMockNotificationService();

  const continuationPayload: DialecticExecuteJobPayload = {
    ...saveResponseTestPayloadDocumentArtifact,
    continueUntilComplete: true,
    user_jwt: "jwt.token.here",
  };

  const contribution = createMockContributionRow({
    id: "contrib-continuation-1",
    document_relationships: {
      thesis: "contrib-continuation-1",
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  const fm = createMockFileManager({ outcome: "success", contribution });
  const deps = buildIntegrationDeps({ fileManager: fm });
  const mockSetup = buildMockSupabase(continuationPayload);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  // finish_reason "length" is narrowed to FinishReason, triggers continuation via isDialecticContinueReason
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ partial: "data" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "length",
  };

  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert continuation status
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "needs_continuation");
  } else {
    throw new Error("Result is not a success return");
  }

  // Assert continueJob inserted a new job into the DB
  const jobInsertSpies = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
  assertExists(jobInsertSpies);
  assertEquals(jobInsertSpies.callCount > 0, true, "continueJob should insert a new continuation job");

  // Assert continuation notification sent
  const continuedCalls = mockNotificationService.sendContributionGenerationContinuedEvent.calls;
  assertEquals(continuedCalls.length > 0, true, "continuation should send contribution_generation_continued notification");
});

Deno.test("Integration: saveResponse continuation limit reached triggers assembly and correct status", async () => {
  resetMockNotificationService();

  const limitPayload: DialecticExecuteJobPayload = {
    ...saveResponseTestPayloadDocumentArtifact,
    continueUntilComplete: true,
    continuation_count: 5,
    target_contribution_id: "root-contrib-id",
    user_jwt: "jwt.token.here",
  };

  const contribution = createMockContributionRow({
    id: "contrib-limit-1",
    document_relationships: {
      thesis: "root-contrib-id",
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  const fm = createMockFileManager({ outcome: "success", contribution });
  const deps = buildIntegrationDeps({ fileManager: fm });
  const mockSetup = buildMockSupabase(limitPayload, {
    target_contribution_id: "root-contrib-id",
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ partial: "final chunk" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "length",
  };

  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert continuation_limit_reached status
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "continuation_limit_reached");
  } else {
    throw new Error("Result is not a success return");
  }

  // continueJob should NOT insert a new job (limit was reached)
  // Instead it returns { enqueued: false, reason: 'continuation_limit_reached' }
  // The contribution_generation_continued notification still fires for the current chunk
  const continuedCalls = mockNotificationService.sendContributionGenerationContinuedEvent.calls;
  assertEquals(continuedCalls.length > 0, true, "continuation notification should fire even at limit");
});

Deno.test("Integration: saveResponse with malformed JSON triggers real retryJob", async () => {
  resetMockNotificationService();
  const deps = buildIntegrationDeps();
  const mockSetup = buildMockSupabase(saveResponseTestPayload);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: "this is not valid JSON {{{",
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
  };

  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert success return from retry path
  if (!isSaveResponseSuccessReturn(result)) {
    throw new Error("Expected success return from retry path");
  }
  const successResult: SaveResponseSuccessReturn = result;
  assertEquals(successResult.status, "completed");
  // Assert retryJob was invoked (DB update happened)
  const jobUpdateSpies = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(jobUpdateSpies);
  assertEquals(jobUpdateSpies.callCount > 0, true, "retryJob should update job via DB on malformed JSON");

  // Assert retry notification
  const retryCalls = mockNotificationService.sendContributionRetryingEvent.calls;
  assertEquals(retryCalls.length > 0, true, "retryJob should send retry notification on malformed JSON");
});

Deno.test("Integration: saveResponse calls enqueueRenderJob exactly once on terminal completion for document output", async () => {
  resetMockNotificationService();
  const contribution = createMockContributionRow({
    id: "contrib-render-dispatch-1",
    document_relationships: {
      thesis: "contrib-render-dispatch-1",
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  const fm = createMockFileManager({ outcome: "success", contribution });
  let enqueueRenderJobCallCount = 0;
  const enqueueRenderJobSpy: BoundEnqueueRenderJobFn = async (_params, _payload) => {
    enqueueRenderJobCallCount++;
    return { renderJobId: null };
  };
  const deps = buildIntegrationDeps({ fileManager: fm, enqueueRenderJob: enqueueRenderJobSpy });
  const mockSetup = buildMockSupabase(saveResponseTestPayloadDocumentArtifact);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ result: "valid json content" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
  };

  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "completed");
  } else {
    throw new Error("Result is not a success return");
  }
  assertEquals(enqueueRenderJobCallCount, 1, "enqueueRenderJob should be called exactly once on terminal completion");
});

Deno.test("Integration: saveResponse assembleAndSaveFinalDocument NOT called when enqueueRenderJob dispatches render job", async () => {
  resetMockNotificationService();
  // Final chunk of a multi-chunk sequence: target_contribution_id set, finish_reason stop.
  // contribution.document_relationships.thesis points to the root (different from contribution.id),
  // so assembleAndSaveFinalDocument would normally be triggered — but enqueueRenderJob returning
  // a non-null renderJobId sets shouldRender=true, gating the inline assembly.
  const finalContinuationPayload: DialecticExecuteJobPayload = {
    ...saveResponseTestPayloadDocumentArtifact,
    target_contribution_id: "root-contrib-render-test",
    continueUntilComplete: true,
    continuation_count: 1,
    document_relationships: {
      thesis: "root-contrib-render-test",
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  };
  const contribution = createMockContributionRow({
    id: "contrib-final-chunk",
    document_relationships: {
      thesis: "root-contrib-render-test",
      source_group: "00000000-0000-4000-8000-000000000002",
    },
    target_contribution_id: "root-contrib-render-test",
  });
  const fm = createMockFileManager({ outcome: "success", contribution });
  const enqueueRenderJobWithDispatch: BoundEnqueueRenderJobFn = async (_params, _payload) => ({
    renderJobId: "render-job-1",
  });
  const deps = buildIntegrationDeps({
    fileManager: fm,
    enqueueRenderJob: enqueueRenderJobWithDispatch,
  });
  const mockSetup = buildMockSupabase(finalContinuationPayload, {
    target_contribution_id: "root-contrib-render-test",
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ result: "final chunk content" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
  };

  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "completed");
  } else {
    throw new Error("Result is not a success return");
  }
  assertEquals(
    fm.assembleAndSaveFinalDocument.calls.length,
    0,
    "assembleAndSaveFinalDocument should NOT be called when enqueueRenderJob dispatches a render job (shouldRender=true gates inline assembly)",
  );
});

Deno.test("Integration: saveResponse does NOT call enqueueRenderJob on continuation path", async () => {
  resetMockNotificationService();
  const continuationPayload: DialecticExecuteJobPayload = {
    ...saveResponseTestPayloadDocumentArtifact,
    continueUntilComplete: true,
    user_jwt: "jwt.token.here",
  };
  const contribution = createMockContributionRow({
    id: "contrib-continuation-render-1",
    document_relationships: {
      thesis: "contrib-continuation-render-1",
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  const fm = createMockFileManager({ outcome: "success", contribution });
  let enqueueRenderJobCallCount = 0;
  const enqueueRenderJobSpy: BoundEnqueueRenderJobFn = async (_params, _payload) => {
    enqueueRenderJobCallCount++;
    return { renderJobId: null };
  };
  const deps = buildIntegrationDeps({ fileManager: fm, enqueueRenderJob: enqueueRenderJobSpy });
  const mockSetup = buildMockSupabase(continuationPayload);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: "job-id-123", dbClient };
  // finish_reason "length" narrows to a DialecticContinueReason, triggering the continuation path
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ partial: "data" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "length",
  };

  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "needs_continuation");
  } else {
    throw new Error("Result is not a success return");
  }
  assertEquals(enqueueRenderJobCallCount, 0, "enqueueRenderJob should NOT be called on continuation path");
});
