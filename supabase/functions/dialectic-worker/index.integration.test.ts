// supabase/functions/dialectic-worker/index.integration.test.ts
// Integration tests for the netlifyResponseHandler HTTP handler.
// Real: netlifyResponseHandler routing/parsing + computeJobSig + saveResponse business logic.
// Mocked at boundaries: Supabase client, enqueueRenderJob DB queries, notificationService, fileManager, debitTokens.

import {
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import {
  mockNotificationService,
  resetMockNotificationService,
} from '../_shared/utils/notification.service.mock.ts';
import { logger } from '../_shared/logger.ts';
import type { BoundDebitTokens } from '../_shared/utils/debitTokens.interface.ts';
import type { BoundEnqueueRenderJobFn } from './enqueueRenderJob/enqueueRenderJob.interface.ts';
import { enqueueRenderJob } from './enqueueRenderJob/enqueueRenderJob.ts';
import { shouldEnqueueRenderJob } from '../_shared/utils/shouldEnqueueRenderJob.ts';
import { continueJob } from './continueJob.ts';
import { retryJob } from './retryJob.ts';
import { resolveFinishReason } from '../_shared/utils/resolveFinishReason.ts';
import { isIntermediateChunk } from '../_shared/utils/isIntermediateChunk.ts';
import { determineContinuation } from '../_shared/utils/determineContinuation/determineContinuation.ts';
import { buildUploadContext } from '../_shared/utils/buildUploadContext/buildUploadContext.ts';
import { sanitizeJsonContent } from '../_shared/utils/jsonSanitizer/jsonSanitizer.ts';
import { saveResponse } from './saveResponse/saveResponse.ts';
import type { SaveResponseDeps } from './saveResponse/saveResponse.interface.ts';
import type { DialecticExecuteJobPayload } from '../dialectic-service/dialectic.interface.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import {
  createMockContributionRow,
  createMockFileManager,
  saveResponseTestPayloadDocumentArtifact,
} from './saveResponse/saveResponse.mock.ts';
import { createComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.ts';
import type { ComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.interface.ts';
import { netlifyResponseHandler } from '../netlifyResponse/netlifyResponseHandler.ts';
import type { NetlifyResponseDeps } from '../netlifyResponse/netlifyResponse.interface.ts';

const TEST_SECRET = 'index-integration-test-hmac-secret';
const JOB_ID = 'job-id-123';
const JOB_USER_ID = 'user-789';
const JOB_CREATED_AT = new Date().toISOString();

// ---------------------------------------------------------------------------
// Row factories
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
    user_id: JOB_USER_ID,
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

function makeMockDebitTokens(): BoundDebitTokens {
  return async (_params, _payload) => ({
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
}

async function buildNetlifyDeps(
  adminClient: SupabaseClient<Database>,
  saveResponseDepsOverrides?: Partial<SaveResponseDeps>,
): Promise<{ deps: NetlifyResponseDeps; computeJobSig: ComputeJobSig }> {
  const computeJobSig = await createComputeJobSig(TEST_SECRET);

  const boundEnqueueRenderJob: BoundEnqueueRenderJobFn = (params, payload) =>
    enqueueRenderJob({ dbClient: adminClient, logger, shouldEnqueueRenderJob }, params, payload);

  const srDeps: SaveResponseDeps = {
    logger,
    fileManager: createMockFileManager({ outcome: 'success', contribution: createMockContributionRow() }),
    notificationService: mockNotificationService,
    continueJob,
    retryJob,
    resolveFinishReason,
    isIntermediateChunk,
    determineContinuation,
    buildUploadContext,
    sanitizeJsonContent,
    debitTokens: makeMockDebitTokens(),
    enqueueRenderJob: boundEnqueueRenderJob,
    ...saveResponseDepsOverrides,
  };

  const deps: NetlifyResponseDeps = {
    computeJobSig,
    adminClient,
    saveResponse,
    saveResponseDeps: srDeps,
  };

  return { deps, computeJobSig };
}

function buildAdminMockSupabase(
  jobPayload: DialecticExecuteJobPayload,
  clientId: string,
  jobRowOverrides?: Record<string, unknown>,
): ReturnType<typeof createMockSupabaseClient> {
  if (!isJson(jobPayload)) {
    throw new Error('Test payload is not valid JSON.');
  }
  const jobRow = {
    id: JOB_ID,
    session_id: 'session-456',
    stage_slug: 'thesis',
    iteration_number: 1,
    status: 'queued',
    user_id: JOB_USER_ID,
    attempt_count: 0,
    completed_at: null,
    created_at: JOB_CREATED_AT,
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
  return createMockSupabaseClient(clientId, {
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

async function buildNetlifyRequest(
  body: Record<string, unknown>,
  computeJobSig: ComputeJobSig,
): Promise<Request> {
  const sig = await computeJobSig(JOB_ID, JOB_USER_ID, JOB_CREATED_AT);
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, sig }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  'index.integration: full handler chain - valid sig and body → handler parses → constructs deps → calls real saveResponse → returns 200',
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

    const adminMockSetup = buildAdminMockSupabase(saveResponseTestPayloadDocumentArtifact, 'admin-handler-chain-1');
    const adminClient = adminMockSetup.client as unknown as SupabaseClient<Database>;

    const { deps, computeJobSig } = await buildNetlifyDeps(adminClient, { fileManager: fm });

    const req = await buildNetlifyRequest({
      job_id: JOB_ID,
      assembled_content: JSON.stringify({ result: 'valid content' }),
      token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      finish_reason: 'stop',
    }, computeJobSig);

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody.status, 'completed');
  },
);

Deno.test(
  'index.integration: render chain - terminal completion (finish_reason stop) on final continuation chunk → enqueueRenderJob called → assembleAndSaveFinalDocument gated by shouldRender',
  async () => {
    resetMockNotificationService();

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

    const adminMockSetup = buildAdminMockSupabase(
      finalContinuationPayload,
      'admin-render-chain-2',
      { target_contribution_id: 'root-contrib-render-gate-test' },
    );
    const adminClient = adminMockSetup.client as unknown as SupabaseClient<Database>;

    const { deps, computeJobSig } = await buildNetlifyDeps(adminClient, { fileManager: fm });

    const req = await buildNetlifyRequest({
      job_id: JOB_ID,
      assembled_content: JSON.stringify({ result: 'final chunk content' }),
      token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      finish_reason: 'stop',
    }, computeJobSig);

    const res = await netlifyResponseHandler(deps, req);
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
  'index.integration: empty assembled_content → saveResponse calls retryJob internally → handler returns 200',
  async () => {
    resetMockNotificationService();

    let retryJobCallCount = 0;

    const adminMockSetup = buildAdminMockSupabase(saveResponseTestPayloadDocumentArtifact, 'admin-error-chain-3');
    const adminClient = adminMockSetup.client as unknown as SupabaseClient<Database>;

    const { deps, computeJobSig } = await buildNetlifyDeps(adminClient, {
      retryJob: async () => { retryJobCallCount++; return {}; },
    });

    const req = await buildNetlifyRequest({
      job_id: JOB_ID,
      assembled_content: '',
      token_usage: null,
      finish_reason: null,
    }, computeJobSig);

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 200);
    assertEquals(retryJobCallCount, 1, 'retryJob must be called once for empty assembled_content');
  },
);

Deno.test(
  'index.integration: regression - job-queue POST body (missing sig and saveResponse fields) rejected by isNetlifyResponseBody guard → 400',
  async () => {
    const adminMockSetup = createMockSupabaseClient('admin-regression-4');
    const adminClient = adminMockSetup.client as unknown as SupabaseClient<Database>;

    const { deps } = await buildNetlifyDeps(adminClient);

    // A job-queue shaped body lacks assembled_content, token_usage, finish_reason, and sig.
    // isNetlifyResponseBody rejects it, proving the handler does not process job-queue payloads.
    const jobQueueBody = {
      job_id: JOB_ID,
      session_id: 'session-456',
      model_id: 'model-def',
      stage_slug: 'thesis',
    };
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobQueueBody),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 400);
    assertEquals(adminMockSetup.spies.fromSpy.calls.length, 0);
  },
);
