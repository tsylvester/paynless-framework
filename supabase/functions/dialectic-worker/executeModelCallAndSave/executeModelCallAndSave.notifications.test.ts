/**
 * Job lifecycle notifications for executeModelCallAndSave (execute_chunk_completed;
 * execute_completed remains processSimpleJob for EXECUTE jobs).
 */
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { AiProviderAdapterInstance } from '../../_shared/types.ts';
import type { DialecticExecuteJobPayload } from '../../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { isJson } from '../../_shared/utils/type_guards.ts';
import {
  mockNotificationService,
  resetMockNotificationService,
} from '../../_shared/utils/notification.service.mock.ts';
import { ExecuteChunkCompletedPayload } from '../../_shared/types/notification.service.types.ts';
import {
  createMockAiProviderAdapterInstance,
  createMockDialecticContributionRow,
  createMockExecuteModelCallAndSaveDeps,
  createMockExecuteModelCallAndSaveParams,
  createMockExecuteModelCallAndSavePayload,
  createMockChatApiRequest,
  createMockFileManagerForEmcas,
  createMockSendMessageStreamFromParams,
  testPayload,
  testPayloadDocumentArtifact,
} from './executeModelCallAndSave.mock.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
} from './executeModelCallAndSave.interface.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';

function adapterWithFinish(finishReason: 'stop' | 'length'): AiProviderAdapterInstance {
  return createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"ok": true}'],
      finishReason,
    }),
  });
}

function documentPayloadWithSourceGroupOnly(): DialecticExecuteJobPayload {
  return {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    document_relationships: {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
  };
}

function continuationDocumentPayload(): DialecticExecuteJobPayload {
  return {
    ...testPayloadDocumentArtifact,
    continueUntilComplete: true,
    continuation_count: 2,
    target_contribution_id: 'root-123',
    document_relationships: {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
      thesis: 'root-123',
    },
  };
}

function buildParamsFromPayload(
  dbClient: SupabaseClient<Database>,
  jobPayload: DialecticExecuteJobPayload,
  paramsPatch: Partial<ExecuteModelCallAndSaveParams> = {},
): ExecuteModelCallAndSaveParams {
  if (!isJson(jobPayload)) {
    throw new Error('notifications tests: job payload must be Json');
  }
  const outputType: string = typeof jobPayload.output_type === 'string'
    ? jobPayload.output_type
    : String(jobPayload.output_type);
  return createMockExecuteModelCallAndSaveParams(
    {
      output_type: outputType,
      sourcePromptResourceId: '',
      ...paramsPatch,
    },
    {
      dbClient,
      jobRowOverrides: {
        job_type: 'EXECUTE',
        payload: jobPayload,
      },
    },
  );
}

const defaultPayload = createMockExecuteModelCallAndSavePayload({
  chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
});

Deno.test(
  'executeModelCallAndSave - notifications: execute_chunk_completed emitted for final chunk (execute_completed is emitted only by processSimpleJob)',
  async () => {
    resetMockNotificationService();
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow = createMockDialecticContributionRow();
    const fileManager = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterWithFinish('stop'),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildParamsFromPayload(
      dbClient,
      documentPayloadWithSourceGroupOnly(),
    );
    await executeModelCallAndSave(deps, params, defaultPayload);
    assertEquals(
      mockNotificationService.sendJobNotificationEvent.calls.length,
      1,
      'Expected one execute_chunk_completed emission for final chunk',
    );
    const firstCall = mockNotificationService.sendJobNotificationEvent.calls[0];
    assertExists(firstCall, 'Expected notification call');
    const [payloadArg, targetUserId] = firstCall.args;
    const expected: ExecuteChunkCompletedPayload = {
      sessionId: 'session-456',
      stageSlug: 'thesis',
      job_id: 'job-id-123',
      step_key: 'business_case',
      document_key: 'business_case',
      modelId: 'model-def',
      iterationNumber: 1,
      type: 'execute_chunk_completed',
    };
    assertEquals(payloadArg, expected);
    assertEquals(targetUserId, 'user-789', 'targetUserId must equal projectOwnerUserId');
  },
);

Deno.test(
  'executeModelCallAndSave - notifications: execute_chunk_completed emitted with all required fields when continuation chunk and document-related',
  async () => {
    resetMockNotificationService();
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow = createMockDialecticContributionRow();
    const fileManager = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterWithFinish('length'),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildParamsFromPayload(
      dbClient,
      continuationDocumentPayload(),
    );
    await executeModelCallAndSave(deps, params, defaultPayload);
    assertEquals(
      mockNotificationService.sendJobNotificationEvent.calls.length,
      1,
      'Expected one execute_chunk_completed emission',
    );
    const firstCall = mockNotificationService.sendJobNotificationEvent.calls[0];
    assertExists(firstCall, 'Expected notification call');
    const [payloadArg, targetUserId] = firstCall.args;
    const expected: ExecuteChunkCompletedPayload = {
      sessionId: 'session-456',
      stageSlug: 'thesis',
      job_id: 'job-id-123',
      step_key: 'business_case',
      document_key: 'business_case',
      modelId: 'model-def',
      iterationNumber: 1,
      type: 'execute_chunk_completed',
    };
    assertEquals(payloadArg, expected);
    assertEquals(targetUserId, 'user-789', 'targetUserId must equal projectOwnerUserId');
  },
);

Deno.test(
  'executeModelCallAndSave - notifications: no sendJobNotificationEvent when output type is non-document (HeaderContext)',
  async () => {
    resetMockNotificationService();
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow = createMockDialecticContributionRow({
      contribution_type: 'header_context',
    });
    const fileManager = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterWithFinish('stop'),
      fileManager,
    });
    if (!isJson(testPayload)) {
      throw new Error('notifications tests: testPayload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = buildParamsFromPayload(dbClient, testPayload);
    await executeModelCallAndSave(deps, params, defaultPayload);
    assertEquals(
      mockNotificationService.sendJobNotificationEvent.calls.length,
      0,
      'Expected no sendJobNotificationEvent when output type is HeaderContext (non-document)',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - notifications: no job notification when projectOwnerUserId is empty',
  async () => {
    resetMockNotificationService();
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow = createMockDialecticContributionRow();
    const fileManager = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterWithFinish('stop'),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildParamsFromPayload(
      dbClient,
      documentPayloadWithSourceGroupOnly(),
      { projectOwnerUserId: '' },
    );
    await executeModelCallAndSave(deps, params, defaultPayload);
    assertEquals(
      mockNotificationService.sendJobNotificationEvent.calls.length,
      0,
      'Expected no sendJobNotificationEvent when projectOwnerUserId is empty',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - notifications: all sendJobNotificationEvent calls include targetUserId as second argument',
  async () => {
    resetMockNotificationService();
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow = createMockDialecticContributionRow();
    const fileManager = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterWithFinish('stop'),
      fileManager,
    });
    const projectOwnerUserId: string = 'owner-user-456';
    const params: ExecuteModelCallAndSaveParams = buildParamsFromPayload(
      dbClient,
      documentPayloadWithSourceGroupOnly(),
      { projectOwnerUserId },
    );
    await executeModelCallAndSave(deps, params, defaultPayload);
    assert(
      mockNotificationService.sendJobNotificationEvent.calls.length >= 1,
      'At least one notification expected',
    );
    for (
      let i = 0;
      i < mockNotificationService.sendJobNotificationEvent.calls.length;
      i++
    ) {
      const call = mockNotificationService.sendJobNotificationEvent.calls[i];
      assertExists(call, 'Call entry must exist');
      const args = call.args;
      assertExists(args[1], 'Second argument (targetUserId) must be present');
      assertEquals(args[1], projectOwnerUserId, 'targetUserId must equal projectOwnerUserId');
    }
  },
);
