/**
 * Proves that executeModelCallAndSave emits all required job lifecycle notifications
 * (execute_chunk_completed only; execute_completed is emitted by processSimpleJob for EXECUTE jobs).
 */
import { assertEquals, assert, assertExists } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type {
  ExecuteModelCallAndSaveParams,
  DialecticExecuteJobPayload,
  PromptConstructionPayload,
  DocumentRelationships,
  UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType, DialecticStageSlug } from '../_shared/types/file_manager.types.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import type { IExecuteJobContext } from './JobContext.interface.ts';
import { createJobContext, createExecuteJobContext } from './createJobContext.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import type { FinishReason } from '../_shared/types.ts';
import type { Tables } from '../types_db.ts';
import {
  createMockJob,
  buildPromptPayload,
  getMockDeps,
  setupMockClient,
  testPayload,
  mockSessionData,
  mockProviderData,
  mockFullProviderData,
  mockContribution,
} from './executeModelCallAndSave.test.ts';

const stopReason: FinishReason = 'stop';
const lengthReason: FinishReason = 'length';

interface RequiredDocumentNotificationFields {
  sessionId: string;
  stageSlug: string;
  job_id: string;
  step_key: string;
  document_key: string;
  modelId: string;
  iterationNumber: number;
  type: string;
}

function assertRequiredDocumentNotificationPayload(payload: unknown, expected: RequiredDocumentNotificationFields): void {
  assert(isRecord(payload), 'payload must be a record');
  assertEquals(payload.sessionId, expected.sessionId, 'sessionId required');
  assertEquals(payload.stageSlug, expected.stageSlug, 'stageSlug required');
  assertEquals(payload.job_id, expected.job_id, 'job_id required');
  assertEquals(payload.step_key, expected.step_key, 'step_key required');
  assertEquals(payload.document_key, expected.document_key, 'document_key required');
  assertEquals(payload.modelId, expected.modelId, 'modelId required');
  assertEquals(payload.iterationNumber, expected.iterationNumber, 'iterationNumber required');
  assertEquals(payload.type, expected.type, 'type required');
}

function buildUnifiedAIResponse(finishReason: FinishReason): UnifiedAIResponse {
  return {
    content: '{"ok": true}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 5,
    processingTimeMs: 50,
    finish_reason: finishReason,
    rawProviderResponse: { finish_reason: finishReason },
  };
}

Deno.test('executeModelCallAndSave - notifications: execute_chunk_completed emitted for final chunk (execute_completed is emitted only by processSimpleJob)', async () => {
  resetMockNotificationService();

  const setup: MockSupabaseClientSetup = setupMockClient({
    ai_providers: { select: { data: [mockFullProviderData], error: null } },
  });
  const dbClient: SupabaseClient<Database> = setup.client as unknown as SupabaseClient<Database>;

  const deps: IExecuteJobContext = getMockDeps();
  stub(deps, 'callUnifiedAIModel', () => Promise.resolve(buildUnifiedAIResponse(stopReason)));

  const documentPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    document_relationships: {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient,
    deps,
    authToken: 'auth-token',
    job: createMockJob(documentPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1, 'Expected one execute_chunk_completed emission for final chunk');
  const [payloadArg, targetUserId] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
  const expected: RequiredDocumentNotificationFields = {
    sessionId: 'session-456',
    stageSlug: 'thesis',
    job_id: 'job-id-123',
    step_key: 'business_case',
    document_key: 'business_case',
    modelId: 'model-def',
    iterationNumber: 1,
    type: 'execute_chunk_completed',
  };
  assertRequiredDocumentNotificationPayload(payloadArg, expected);
  assertEquals(targetUserId, 'user-789', 'targetUserId must equal projectOwnerUserId');

  setup.clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - notifications: execute_chunk_completed emitted with all required fields when continuation chunk and document-related', async () => {
  resetMockNotificationService();

  const setup: MockSupabaseClientSetup = setupMockClient({
    ai_providers: { select: { data: [mockFullProviderData], error: null } },
  });
  const dbClient: SupabaseClient<Database> = setup.client as unknown as SupabaseClient<Database>;

  const deps: IExecuteJobContext = getMockDeps();

  const documentRelationships: DocumentRelationships = {
    source_group: '550e8400-e29b-41d4-a716-446655440000',
    [DialecticStageSlug.Thesis]: 'root-123',
  };
  const continuationPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    target_contribution_id: 'root-123',
    continuation_count: 2,
    stageSlug: DialecticStageSlug.Thesis,
    document_relationships: documentRelationships,
  };

  stub(deps, 'callUnifiedAIModel', () => Promise.resolve(buildUnifiedAIResponse(lengthReason)));

  const params: ExecuteModelCallAndSaveParams = {
    dbClient,
    deps,
    authToken: 'auth-token',
    job: createMockJob(continuationPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1, 'Expected one execute_chunk_completed emission');
  const [payloadArg, targetUserId] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
  const expected: RequiredDocumentNotificationFields = {
    sessionId: 'session-456',
    stageSlug: 'thesis',
    job_id: 'job-id-123',
    step_key: 'business_case',
    document_key: 'business_case',
    modelId: 'model-def',
    iterationNumber: 1,
    type: 'execute_chunk_completed',
  };
  assertRequiredDocumentNotificationPayload(payloadArg, expected);
  assertEquals(targetUserId, 'user-789', 'targetUserId must equal projectOwnerUserId');

  setup.clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - notifications: no sendJobNotificationEvent when output type is non-document (HeaderContext)', async () => {
  resetMockNotificationService();

  const setup: MockSupabaseClientSetup = setupMockClient({
    ai_providers: { select: { data: [mockFullProviderData], error: null } },
  });
  const dbClient: SupabaseClient<Database> = setup.client as unknown as SupabaseClient<Database>;

  const deps: IExecuteJobContext = getMockDeps();
  stub(deps, 'callUnifiedAIModel', () => Promise.resolve(buildUnifiedAIResponse(stopReason)));

  const params: ExecuteModelCallAndSaveParams = {
    dbClient,
    deps,
    authToken: 'auth-token',
    job: createMockJob(testPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  assertEquals(
    mockNotificationService.sendJobNotificationEvent.calls.length,
    0,
    'Expected no sendJobNotificationEvent when output type is HeaderContext (non-document)'
  );

  setup.clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - notifications: no job notification when projectOwnerUserId is undefined', async () => {
  resetMockNotificationService();

  const setup: MockSupabaseClientSetup = setupMockClient({
    ai_providers: { select: { data: [mockFullProviderData], error: null } },
  });
  const dbClient: SupabaseClient<Database> = setup.client as unknown as SupabaseClient<Database>;

  const fileManager = new MockFileManagerService();
  fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
  const deps: IExecuteJobContext = getMockDeps({ fileManager });
  stub(deps, 'callUnifiedAIModel', () => Promise.resolve(buildUnifiedAIResponse(stopReason)));

  const documentPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    document_relationships: {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
  };

  // Intentionally malformed params: projectOwnerUserId undefined to prove no notification is emitted (permitted cast)
  const params: ExecuteModelCallAndSaveParams = {
    dbClient,
    deps,
    authToken: 'auth-token',
    job: createMockJob(documentPayload),
    projectOwnerUserId: undefined as unknown as string,
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  assertEquals(
    mockNotificationService.sendJobNotificationEvent.calls.length,
    0,
    'Expected no sendJobNotificationEvent when projectOwnerUserId is undefined'
  );

  setup.clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - notifications: all sendJobNotificationEvent calls include targetUserId as second argument', async () => {
  resetMockNotificationService();

  const setup: MockSupabaseClientSetup = setupMockClient({
    ai_providers: { select: { data: [mockFullProviderData], error: null } },
  });
  const dbClient: SupabaseClient<Database> = setup.client as unknown as SupabaseClient<Database>;

  const deps: IExecuteJobContext = getMockDeps();
  stub(deps, 'callUnifiedAIModel', () => Promise.resolve(buildUnifiedAIResponse(stopReason)));

  const documentPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    document_relationships: {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
  };

  const projectOwnerUserId = 'owner-user-456';
  const params: ExecuteModelCallAndSaveParams = {
    dbClient,
    deps,
    authToken: 'auth-token',
    job: createMockJob(documentPayload),
    projectOwnerUserId,
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  assert(mockNotificationService.sendJobNotificationEvent.calls.length >= 1, 'At least one notification expected');
  for (const call of mockNotificationService.sendJobNotificationEvent.calls) {
    const args = call.args;
    assertExists(args[1], 'Second argument (targetUserId) must be present');
    assertEquals(args[1], projectOwnerUserId, 'targetUserId must equal projectOwnerUserId');
  }

  setup.clearAllStubs?.();
});
