/**
 * Raw JSON document upload context: pathContext.fileType, mimeType, fileContent,
 * contributionMetadata (no rawJsonResponseContent), and persisted contribution paths
 * (migrated from executeModelCallAndSave.rawJsonOnly.test.ts).
 */
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { AiProviderAdapterInstance } from '../../_shared/types.ts';
import type { DialecticContributionRow } from '../../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { isDialecticContribution, isJson, isRecord } from '../../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import {
  createMockAiProviderAdapterInstance,
  createMockDialecticContributionRow,
  createMockExecuteModelCallAndSaveDeps,
  createMockExecuteModelCallAndSaveParams,
  createMockExecuteModelCallAndSavePayload,
  createMockChatApiRequest,
  createMockFileManagerForEmcas,
  createMockSendMessageStreamFromParams,
  testPayloadDocumentArtifact,
} from './executeModelCallAndSave.mock.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
} from './executeModelCallAndSave.interface.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';

const sanitizedJson: string =
  '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';

function adapterStopWithText(text: string): AiProviderAdapterInstance {
  return createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: [text],
      finishReason: 'stop',
    }),
  });
}

function buildDocumentArtifactParams(
  dbClient: SupabaseClient<Database>,
): ExecuteModelCallAndSaveParams {
  if (!isJson(testPayloadDocumentArtifact)) {
    throw new Error('test fixture: testPayloadDocumentArtifact must be Json');
  }
  return createMockExecuteModelCallAndSaveParams(
    {
      output_type: 'business_case',
      sourcePromptResourceId: '',
    },
    {
      dbClient,
      jobRowOverrides: {
        job_type: 'EXECUTE',
        payload: testPayloadDocumentArtifact,
      },
    },
  );
}

Deno.test(
  '49.b.i: executeModelCallAndSave passes FileType.ModelContributionRawJson to file manager (not document key fileType)',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'contrib-123',
      file_name: 'mock-ai-v1_0_business_case_raw.json',
      mime_type: 'application/json',
      raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
      storage_path: 'raw_responses',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(sanitizedJson),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildDocumentArtifactParams(dbClient);
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext = uploadCall.args[0];
    assert(
      isModelContributionContext(uploadContext),
      'Upload context should be a ModelContributionUploadContext',
    );
    assertEquals(
      uploadContext.pathContext.fileType,
      FileType.ModelContributionRawJson,
      `Expected fileType to be FileType.ModelContributionRawJson, but got ${uploadContext.pathContext.fileType}. The function currently passes the document key fileType (e.g., FileType.business_case) instead of FileType.ModelContributionRawJson.`,
    );
  },
);

Deno.test(
  '49.b.ii: executeModelCallAndSave passes mimeType "application/json" to file manager (not "text/markdown")',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'contrib-123',
      file_name: 'mock-ai-v1_0_business_case_raw.json',
      mime_type: 'application/json',
      raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
      storage_path: 'raw_responses',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(sanitizedJson),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildDocumentArtifactParams(dbClient);
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext = uploadCall.args[0];
    assert(
      isModelContributionContext(uploadContext),
      'Upload context should be a ModelContributionUploadContext',
    );
    assertEquals(
      uploadContext.mimeType,
      'application/json',
      `Expected mimeType to be "application/json", but got "${uploadContext.mimeType}". The function currently passes aiResponse.contentType || "text/markdown" instead of "application/json".`,
    );
  },
);

Deno.test(
  '49.b.iii: executeModelCallAndSave passes sanitized JSON string as fileContent to file manager',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'contrib-123',
      file_name: 'mock-ai-v1_0_business_case_raw.json',
      mime_type: 'application/json',
      raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
      storage_path: 'raw_responses',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(sanitizedJson),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildDocumentArtifactParams(dbClient);
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext = uploadCall.args[0];
    assert(
      isModelContributionContext(uploadContext),
      'Upload context should be a ModelContributionUploadContext',
    );
    assertEquals(
      uploadContext.fileContent,
      sanitizedJson,
      `Expected fileContent to be the sanitized JSON string like '{"content": "# Business Case\\n\\n..."}', not the raw provider response object.`,
    );
    assert(
      typeof uploadContext.fileContent === 'string',
      'fileContent should be a string (the sanitized JSON), not an object',
    );
  },
);

Deno.test(
  '49.b.iv: executeModelCallAndSave does NOT include rawJsonResponseContent in upload context',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const contributionRow: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'contrib-123',
      file_name: 'mock-ai-v1_0_business_case_raw.json',
      mime_type: 'application/json',
      raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
      storage_path: 'raw_responses',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: contributionRow,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(sanitizedJson),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildDocumentArtifactParams(dbClient);
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext = uploadCall.args[0];
    assert(
      isModelContributionContext(uploadContext),
      'Upload context should be a ModelContributionUploadContext',
    );
    assert(
      !('rawJsonResponseContent' in uploadContext.contributionMetadata),
      `Expected rawJsonResponseContent to NOT be present in contributionMetadata. It's redundant - fileContent IS the raw JSON content. The function currently sets rawJsonResponseContent: aiResponse.rawProviderResponse.`,
    );
    const contributionMetadataUnknown: unknown = uploadContext.contributionMetadata;
    assert(isRecord(contributionMetadataUnknown), 'contributionMetadata should be a record');
    assert(
      !('rawJsonResponseContent' in contributionMetadataUnknown),
      'rawJsonResponseContent should not be in contributionMetadata',
    );
  },
);

Deno.test(
  '49.b.v: executeModelCallAndSave creates contribution record with correct file_name, storage_path, and mime_type',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
      Database
    >;
    const expectedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'contrib-123',
      file_name: 'mock-ai-v1_0_business_case_raw.json',
      storage_path: 'raw_responses',
      raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
      mime_type: 'application/json',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: expectedContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(sanitizedJson),
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = buildDocumentArtifactParams(dbClient);
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext = uploadCall.args[0];
    assert(
      isModelContributionContext(uploadContext),
      'Upload context should be a ModelContributionUploadContext',
    );
    const result = await fileManager.uploadAndRegisterFile(uploadContext);
    assert(!result.error, 'File upload should succeed');
    assertExists(result.record, 'Contribution record should be returned');
    if (isDialecticContribution(result.record)) {
      const contribution: DialecticContributionRow = result.record;
      assert(
        contribution.storage_path !== null &&
          contribution.storage_path.includes('raw_responses'),
        `Expected storage_path to contain 'raw_responses/' (not 'documents/'), but got '${contribution.storage_path}'`,
      );
      if (contribution.file_name) {
        assert(
          contribution.file_name.endsWith('_raw.json'),
          `Expected file_name to end with '_raw.json' (not '.md'), but got '${contribution.file_name}'`,
        );
      } else {
        throw new Error('Expected file_name to be non-null');
      }
      assertEquals(
        contribution.mime_type,
        'application/json',
        `Expected mime_type to be "application/json" (not "text/markdown"), but got "${contribution.mime_type}"`,
      );
      assert(
        contribution.raw_response_storage_path !== null &&
          contribution.raw_response_storage_path.includes('_raw.json'),
        `Expected raw_response_storage_path to point to the _raw.json file, but got '${contribution.raw_response_storage_path}'`,
      );
    }
  },
);
