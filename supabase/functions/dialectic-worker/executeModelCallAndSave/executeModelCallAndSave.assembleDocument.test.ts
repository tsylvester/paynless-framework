/**
 * Final-chunk assembly behavior: `assembleAndSaveFinalDocument` invocation rules for slim
 * `executeModelCallAndSave` (migrated from executeModelCallAndSave.assembleDocument.test.ts).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { AiProviderAdapterInstance } from '../../_shared/types.ts';
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
} from '../../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { isJson } from '../../_shared/utils/type_guards.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
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
} from './executeModelCallAndSave.mock.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
} from './executeModelCallAndSave.interface.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';

function adapterStopWithContent(contentJson: string): AiProviderAdapterInstance {
  return createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: [contentJson],
      finishReason: 'stop',
    }),
  });
}

function adapterWithFinishReason(
  contentJson: string,
  finishReason: 'stop' | 'length',
): AiProviderAdapterInstance {
  return createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: [contentJson],
      finishReason,
    }),
  });
}

Deno.test(
  'executeModelCallAndSave — should NOT call assembleAndSaveFinalDocument for final chunk with markdown document (root relationships normalize to contribution id)',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const rootContributionId: string = 'root-contrib-123';
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        thesis: rootContributionId,
      },
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: savedContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithContent('{"content": "AI response"}'),
      fileManager,
    });
    const markdownPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.business_case,
      document_key: 'business_case',
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        thesis: rootContributionId,
      },
    };
    if (!isJson(markdownPayload)) {
      throw new Error('test fixture: markdownPayload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: markdownPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls.length,
      0,
      'assembleAndSaveFinalDocument should NOT be called when persisted stage relationship equals contribution id (single effective root chunk)',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — should NOT call assembleAndSaveFinalDocument for final JSON-only chunk when rootIdFromSaved equals contribution id',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () =>
        adapterStopWithContent('{"header": "Header Context", "context": {"key": "value"}}'),
      fileManager,
    });
    const jsonOnlyPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.HeaderContext,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
    };
    if (!isJson(jsonOnlyPayload)) {
      throw new Error('test fixture: jsonOnlyPayload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'header_context',
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: jsonOnlyPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls.length,
      0,
      'assembleAndSaveFinalDocument should NOT be called for single-chunk JSON artifacts (rootIdFromSaved === contribution.id)',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — should NOT call assembleAndSaveFinalDocument for non-final chunk (resolvedFinish !== stop)',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const rootContributionId: string = 'root-contrib-789';
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'contrib-continuation-1',
      document_relationships: {
        thesis: rootContributionId,
        source_group: '550e8400-e29b-41d4-a716-446655440001',
      },
      target_contribution_id: rootContributionId,
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: savedContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () =>
        adapterWithFinishReason('{"content": "Partial AI response"}', 'length'),
      fileManager,
    });
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.HeaderContext,
      target_contribution_id: rootContributionId,
      continueUntilComplete: true,
      continuation_count: 1,
      document_relationships: {
        thesis: rootContributionId,
        source_group: '550e8400-e29b-41d4-a716-446655440001',
      },
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuationPayload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'header_context',
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: continuationPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'Continue' }),
      }),
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls.length,
      0,
      'assembleAndSaveFinalDocument should NOT be called for non-final chunks (resolvedFinish !== stop)',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — should NOT call assembleAndSaveFinalDocument when document_relationships on saved record is null (no rootIdFromSaved after persistence rules)',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      document_relationships: null,
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: savedContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () =>
        adapterStopWithContent('{"header": "Header Context", "context": {"key": "value"}}'),
      fileManager,
    });
    const jsonOnlyPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.HeaderContext,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
    };
    if (!isJson(jsonOnlyPayload)) {
      throw new Error('test fixture: jsonOnlyPayload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'header_context',
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: jsonOnlyPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls.length,
      0,
      'assembleAndSaveFinalDocument should NOT be called when document_relationships cannot yield rootIdFromSaved distinct from contribution id',
    );
  },
);
