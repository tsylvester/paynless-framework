// supabase/functions/dialectic-worker/index.integration.test.ts
// Integration tests for the handleSaveResponse HTTP handler.
// Real: handleSaveResponse routing/parsing/dep construction + saveResponse business logic.
// Mocked at boundaries: Supabase client, enqueueRenderJob (via admin client mock), notificationService, fileManager, debitTokens.

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { handleSaveResponse } from './index.ts';
import type { CreateUserDbClientFn } from './index.ts';
import { saveResponse } from './saveResponse/saveResponse.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import {
  mockNotificationService,
  resetMockNotificationService,
} from '../_shared/utils/notification.service.mock.ts';
import { buildIJobContext } from './createJobContext/JobContext.mock.ts';
import type { IJobContext } from './createJobContext/JobContext.interface.ts';
import type { DebitTokens } from '../_shared/utils/debitTokens.interface.ts';
import {
  createMockContributionRow,
  createMockFileManager,
  saveResponseTestPayloadDocumentArtifact,
} from './saveResponse/saveResponse.mock.ts';
import type { SaveResponseRequestBody } from './saveResponse/saveResponse.interface.ts';
import type { DialecticExecuteJobPayload } from '../dialectic-service/dialectic.interface.ts';
import { isJson } from '../_shared/utils/type_guards.ts';

// ---------------------------------------------------------------------------
// Row factories (mirrors saveResponse.integration.test.ts)
// ---------------------------------------------------------------------------

function makeProviderRow() {
  return {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
    config: {
      tokenization_strategy: { type: 'rough_char_count' },
      context_window_tokens: 10000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      provider_max_input_tokens: 100,
      provider_max_output_tokens: 50,
      api_identifier: 'mock-ai-v1',
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
    id: 'session-456',
    project_id: 'project-abc',
    session_description: 'A mock session',
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_ids: ['model-def'],
    status: 'in-progress',
    associated_chat_id: 'chat-789',
    current_stage_id: 'stage-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    idempotency_key: 'session-456_render',
    viewing_stage_id: null,
  };
}

function makeWalletRow() {
  return {
    wallet_id: 'wallet-ghi',
    user_id: 'user-789',
    organization_id: null,
    balance: 10000,
    currency: 'AI_TOKEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds an IJobContext suitable for integration tests:
 * - real utility functions (resolveFinishReason, sanitizeJsonContent, etc.) from buildIJobContext
 * - mock debitTokens that returns success
 * - mock notificationService
 * Callers may override any field via `overrides`.
 */
function buildIntegrationDeps(overrides?: Partial<IJobContext>): IJobContext {
  const mockDebitTokens: DebitTokens = async () => ({
    result: {
      userMessage: {
        id: crypto.randomUUID(),
        chat_id: null,
        user_id: null,
        role: 'user',
        content: 'mock-user-message',
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
        role: 'assistant',
        content: 'mock-assistant-message',
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
  });

  const base: IJobContext = {
    ...buildIJobContext(),
    notificationService: mockNotificationService,
    debitTokens: mockDebitTokens,
  };

  if (!overrides) return base;
  return { ...base, ...overrides };
}

/**
 * Builds a mock Supabase client pre-wired with all tables that saveResponse queries
 * via the user-scoped DB client.
 */
function buildUserMockSupabase(
  jobPayload: DialecticExecuteJobPayload,
  jobRowOverrides?: Record<string, unknown>,
): ReturnType<typeof createMockSupabaseClient> {
  if (!isJson(jobPayload)) {
    throw new Error('Test payload is not valid JSON.');
  }
  const jobRow = {
    id: 'job-id-123',
    session_id: 'session-456',
    stage_slug: 'thesis',
    iteration_number: 1,
    status: 'queued',
    user_id: 'user-789',
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
    payload: jobPayload,
    is_test_job: false,
    job_type: 'EXECUTE',
    idempotency_key: null,
    ...jobRowOverrides,
  };
  return createMockSupabaseClient('index-integration-user', {
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

/**
 * Creates a POST /saveResponse HTTP request with an Authorization header.
 */
function createSaveResponseRequest(
  body: SaveResponseRequestBody,
  authorization: string = 'Bearer test-integration-jwt',
): Request {
  return new Request('http://localhost/saveResponse', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  'index.integration: full handler chain - valid JWT and body → handler parses → constructs deps → calls real saveResponse → returns 200',
  async () => {
    resetMockNotificationService();

    const contribution = createMockContributionRow({
      id: 'contrib-handler-chain-1',
      document_relationships: {
        thesis: 'contrib-handler-chain-1',
        source_group: '00000000-0000-4000-8000-000000000001',
      },
    });
    const fm = createMockFileManager({ outcome: 'success', contribution });
    const deps = buildIntegrationDeps({ fileManager: fm });

    const userMockSetup = buildUserMockSupabase(saveResponseTestPayloadDocumentArtifact);
    const userDbClient: SupabaseClient<Database> =
      userMockSetup.client as unknown as SupabaseClient<Database>;

    // Admin client: no dialectic_stages set up → shouldEnqueueRenderJob returns stage_not_found
    // → enqueueRenderJob returns error → shouldRender = false (logged, execution continues)
    const adminMockSetup = createMockSupabaseClient('admin-handler-chain-1');
    const adminClient: SupabaseClient<Database> =
      adminMockSetup.client as unknown as SupabaseClient<Database>;

    const createUserDbClientFn: CreateUserDbClientFn = (_auth) => userDbClient;

    const reqBody: SaveResponseRequestBody = {
      job_id: 'job-id-123',
      assembled_content: JSON.stringify({ result: 'valid content' }),
      token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      finish_reason: 'stop',
    };
    const req = createSaveResponseRequest(reqBody);

    const res = await handleSaveResponse(
      req,
      adminClient,
      deps,
      saveResponse,
      createUserDbClientFn,
    );

    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody.status, 'completed');
  },
);

Deno.test(
  'index.integration: render chain - terminal completion (finish_reason stop) on final continuation chunk → enqueueRenderJob called → assembleAndSaveFinalDocument gated by shouldRender',
  async () => {
    resetMockNotificationService();

    // Simulate the final chunk of a multi-chunk sequence.
    // target_contribution_id set → isContinuationForStorage = true
    // After the isContinuationForStorage block, contribution.document_relationships.thesis
    // points to 'root-contrib-render-gate-test' (≠ contribution.id 'final-chunk-contrib'),
    // so the isFinalChunk block triggers assembleAndSaveFinalDocument when shouldRender = false.
    const finalContinuationPayload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
      target_contribution_id: 'root-contrib-render-gate-test',
      continuation_count: 1,
      document_relationships: {
        thesis: 'root-contrib-render-gate-test',
        source_group: '00000000-0000-4000-8000-000000000002',
      },
    };

    const contribution = createMockContributionRow({
      id: 'final-chunk-contrib',
      document_relationships: {
        thesis: 'root-contrib-render-gate-test',
        source_group: '00000000-0000-4000-8000-000000000002',
      },
      target_contribution_id: 'root-contrib-render-gate-test',
    });
    const fm = createMockFileManager({ outcome: 'success', contribution });
    const deps = buildIntegrationDeps({ fileManager: fm });

    const userMockSetup = buildUserMockSupabase(finalContinuationPayload, {
      target_contribution_id: 'root-contrib-render-gate-test',
    });
    const userDbClient: SupabaseClient<Database> =
      userMockSetup.client as unknown as SupabaseClient<Database>;

    // Admin client has no dialectic_stages → shouldEnqueueRenderJob returns stage_not_found
    // → enqueueRenderJob returns { error, retriable: false } (not an isEnqueueRenderJobSuccessReturn)
    // → shouldRender stays false → assembleAndSaveFinalDocument IS called
    const adminMockSetup = createMockSupabaseClient('admin-render-chain-2');
    const adminClient: SupabaseClient<Database> =
      adminMockSetup.client as unknown as SupabaseClient<Database>;

    const createUserDbClientFn: CreateUserDbClientFn = (_auth) => userDbClient;

    const reqBody: SaveResponseRequestBody = {
      job_id: 'job-id-123',
      assembled_content: JSON.stringify({ result: 'final chunk content' }),
      token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      finish_reason: 'stop',
    };
    const req = createSaveResponseRequest(reqBody);

    const res = await handleSaveResponse(
      req,
      adminClient,
      deps,
      saveResponse,
      createUserDbClientFn,
    );

    assertEquals(res.status, 200);
    assertEquals(
      fm.assembleAndSaveFinalDocument.calls.length,
      1,
      'assembleAndSaveFinalDocument must be called when shouldRender=false (enqueueRenderJob did not dispatch a render job)',
    );
    assertEquals(
      fm.assembleAndSaveFinalDocument.calls[0].args[0],
      'root-contrib-render-gate-test',
      'assembleAndSaveFinalDocument must receive the root contribution ID from document_relationships',
    );
  },
);

Deno.test(
  'index.integration: error chain - empty assembled_content → real saveResponse returns retriable error → handler returns 503',
  async () => {
    resetMockNotificationService();

    const deps = buildIntegrationDeps();

    const userMockSetup = buildUserMockSupabase(saveResponseTestPayloadDocumentArtifact);
    const userDbClient: SupabaseClient<Database> =
      userMockSetup.client as unknown as SupabaseClient<Database>;

    const adminMockSetup = createMockSupabaseClient('admin-error-chain-3');
    const adminClient: SupabaseClient<Database> =
      adminMockSetup.client as unknown as SupabaseClient<Database>;

    const createUserDbClientFn: CreateUserDbClientFn = (_auth) => userDbClient;

    const reqBody: SaveResponseRequestBody = {
      job_id: 'job-id-123',
      assembled_content: '', // empty → contentString = null → aiResponse.content = null → retriable error
      token_usage: null,
      finish_reason: null,
    };
    const req = createSaveResponseRequest(reqBody);

    const res = await handleSaveResponse(
      req,
      adminClient,
      deps,
      saveResponse,
      createUserDbClientFn,
    );

    assertEquals(res.status, 503);
    const resBody = await res.json();
    assertExists(resBody.error);
  },
);

Deno.test(
  'index.integration: regression - job-queue POST body (missing saveResponse fields) rejected by isSaveResponseRequestBody guard → 400',
  async () => {
    const deps = buildIntegrationDeps();

    const adminMockSetup = createMockSupabaseClient('admin-regression-4');
    const adminClient: SupabaseClient<Database> =
      adminMockSetup.client as unknown as SupabaseClient<Database>;

    const createUserDbClientFn: CreateUserDbClientFn = (_auth) =>
      adminMockSetup.client as unknown as SupabaseClient<Database>;

    // A job-queue shaped body lacks assembled_content, token_usage, and finish_reason.
    // isSaveResponseRequestBody rejects it, proving the handler does not process job-queue payloads.
    const jobQueueBody = {
      job_id: 'job-id-123',
      session_id: 'session-456',
      model_id: 'model-def',
      stage_slug: 'thesis',
    };
    const req = new Request('http://localhost/saveResponse', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobQueueBody),
    });

    const res = await handleSaveResponse(
      req,
      adminClient,
      deps,
      saveResponse,
      createUserDbClientFn,
    );

    assertEquals(res.status, 400);
  },
);
