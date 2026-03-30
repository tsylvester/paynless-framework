/**
 * HeaderContext plan output: saved JSON shape, type-guard rejection paths, and
 * contribution / pathContext fileType.
 */
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { AiProviderAdapterInstance } from '../../_shared/types.ts';
import type {
  ContextForDocument,
  ContentToInclude,
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  HeaderContext,
  HeaderContextArtifact,
  SystemMaterials,
} from '../../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { isJson, isRecord } from '../../_shared/utils/type_guards.ts';
import { isHeaderContext } from '../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionContext } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import {
  createMockAiProviderAdapterInstance,
  createMockAiProvidersRow,
  createMockDialecticContributionRow,
  createMockDialecticSessionRow,
  createMockExecuteModelCallAndSaveDeps,
  createMockExecuteModelCallAndSaveParams,
  createMockExecuteModelCallAndSavePayload,
  createMockChatApiRequest,
  createMockSendMessageStreamFromParams,
  testPayload,
  type DialecticJobRowOverrides,
} from './executeModelCallAndSave.mock.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
} from './executeModelCallAndSave.interface.ts';
import {
  isExecuteModelCallAndSaveSuccessReturn,
} from './executeModelCallAndSave.interface.guard.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';

function planValidationDbClient(): SupabaseClient<Database> {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
    undefined,
    {},
  );
  return mockSetup.client as unknown as SupabaseClient<Database>;
}

function createHeaderContextExecutePayload(): DialecticExecuteJobPayload {
  return {
    ...testPayload,
    idempotencyKey: 'job-id-123_execute',
  };
}

function buildPlanValidationParams(
  dbClient: SupabaseClient<Database>,
  jobPayload: DialecticExecuteJobPayload,
  paramsPatch: Partial<ExecuteModelCallAndSaveParams> = {},
  jobRowOverrides: DialecticJobRowOverrides = {},
): ExecuteModelCallAndSaveParams {
  if (!isJson(jobPayload)) {
    throw new Error('planValidation tests: job payload must be Json');
  }
  return createMockExecuteModelCallAndSaveParams(
    {
      dbClient,
      projectId: jobPayload.projectId,
      sessionId: jobPayload.sessionId,
      iterationNumber: jobPayload.iterationNumber,
      stageSlug: jobPayload.stageSlug,
      walletId: jobPayload.walletId,
      model_id: jobPayload.model_id,
      userAuthToken: jobPayload.user_jwt,
      output_type: String(jobPayload.output_type),
      sourcePromptResourceId: '',
      providerRow: createMockAiProvidersRow(),
      sessionData: createMockDialecticSessionRow({
        id: jobPayload.sessionId,
        project_id: jobPayload.projectId,
      }),
      ...paramsPatch,
    },
    {
      dbClient,
      jobRowOverrides: {
        job_type: 'EXECUTE',
        attempt_count: 0,
        payload: jobPayload,
        ...jobRowOverrides,
      },
    },
  );
}

function createValidHeaderContext(): HeaderContext {
  const systemMaterials: SystemMaterials = {
    agent_notes_to_self: 'Test executive summary',
    input_artifacts_summary: 'Test input artifacts summary',
    stage_rationale: 'Test stage rationale',
  };

  const headerContextArtifact: HeaderContextArtifact = {
    type: 'header_context',
    document_key: FileType.HeaderContext,
    artifact_class: 'header_context',
    file_type: 'json',
  };

  const contentToInclude: ContentToInclude = {
    field1: 'filled value 1',
    field2: ['item1', 'item2'],
  };

  const contextForDocuments: ContextForDocument[] = [
    {
      document_key: FileType.business_case,
      content_to_include: contentToInclude,
    },
  ];

  return {
    system_materials: systemMaterials,
    header_context_artifact: headerContextArtifact,
    context_for_documents: contextForDocuments,
  };
}

function adapterStopWithText(text: string): AiProviderAdapterInstance {
  return createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: [text],
      finishReason: 'stop',
    }),
  });
}

Deno.test(
  'executeModelCallAndSave — plan validation — header_context saves with context_for_documents and no files_to_generate',
  async () => {
    const validHeaderContext: HeaderContext = createValidHeaderContext();
    const headerJson: string = JSON.stringify(validHeaderContext);
    const dbClient: SupabaseClient<Database> = planValidationDbClient();
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      contribution_type: 'header_context',
      file_name: 'header_context.json',
      mime_type: 'application/json',
    });
    const fileManager: MockFileManagerService = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerJson),
      fileManager,
    });
    const jobPayload: DialecticExecuteJobPayload = createHeaderContextExecutePayload();
    const params: ExecuteModelCallAndSaveParams = buildPlanValidationParams(dbClient, jobPayload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      isExecuteModelCallAndSaveSuccessReturn(result),
      'Expected success return for valid header_context save',
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'FileManager.uploadAndRegisterFile should be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext: unknown = uploadCall.args[0];
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.fileContent, 'Upload context should have fileContent');
    assert(typeof uploadContext.fileContent === 'string', 'fileContent must be a string');
    assert(
      uploadContext.fileContent.includes('context_for_documents'),
      'Saved content should contain context_for_documents',
    );
    assert(
      !uploadContext.fileContent.includes('files_to_generate'),
      'Saved content should NOT contain files_to_generate',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — plan validation — header_context with files_to_generate fails isHeaderContext',
  async () => {
    const invalidHeaderContext = {
      ...createValidHeaderContext(),
      files_to_generate: [
        {
          from_document_key: FileType.business_case,
          template_filename: 'test.md',
        },
      ],
    } as HeaderContext;

    const headerJson: string = JSON.stringify(invalidHeaderContext);
    const dbClient: SupabaseClient<Database> = planValidationDbClient();
    const fileManager: MockFileManagerService = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(createMockDialecticContributionRow(), null);
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerJson),
      fileManager,
    });
    const jobPayload: DialecticExecuteJobPayload = createHeaderContextExecutePayload();
    const params: ExecuteModelCallAndSaveParams = buildPlanValidationParams(dbClient, jobPayload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      isExecuteModelCallAndSaveSuccessReturn(result),
      'Expected success return after save of invalid-shaped JSON',
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'FileManager.uploadAndRegisterFile should be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext: unknown = uploadCall.args[0];
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.fileContent, 'Upload context should have fileContent');
    assert(typeof uploadContext.fileContent === 'string', 'fileContent must be a string');
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(uploadContext.fileContent);
    } catch (e) {
      throw new Error(
        `Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    assert(
      !isHeaderContext(parsedContent),
      'HeaderContext with files_to_generate should fail type guard validation',
    );
    assert(isRecord(parsedContent), 'Parsed content should be a record');
    assert(
      'files_to_generate' in parsedContent,
      'Parsed content should have files_to_generate property (proving invalid structure)',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — plan validation — header_context missing context_for_documents fails isHeaderContext',
  async () => {
    const invalidHeaderContext: HeaderContext = {
      system_materials: {
        agent_notes_to_self: 'Test executive summary',
        input_artifacts_summary: 'Test input artifacts summary',
        stage_rationale: 'Test stage rationale',
      },
      header_context_artifact: {
        type: 'header_context',
        document_key: FileType.HeaderContext,
        artifact_class: 'header_context',
        file_type: 'json',
      },
    } as HeaderContext;

    const headerJson: string = JSON.stringify(invalidHeaderContext);
    const dbClient: SupabaseClient<Database> = planValidationDbClient();
    const fileManager: MockFileManagerService = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(createMockDialecticContributionRow(), null);
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerJson),
      fileManager,
    });
    const jobPayload: DialecticExecuteJobPayload = createHeaderContextExecutePayload();
    const params: ExecuteModelCallAndSaveParams = buildPlanValidationParams(dbClient, jobPayload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      isExecuteModelCallAndSaveSuccessReturn(result),
      'Expected success return after save of invalid-shaped JSON',
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'FileManager.uploadAndRegisterFile should be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext: unknown = uploadCall.args[0];
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.fileContent, 'Upload context should have fileContent');
    assert(typeof uploadContext.fileContent === 'string', 'fileContent must be a string');
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(uploadContext.fileContent);
    } catch (e) {
      throw new Error(
        `Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    assert(
      !isHeaderContext(parsedContent),
      'HeaderContext missing context_for_documents should fail type guard validation',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — plan validation — header_context output saves with fileType HeaderContext on pathContext',
  async () => {
    const validHeaderContext: HeaderContext = createValidHeaderContext();
    const headerJson: string = JSON.stringify(validHeaderContext);
    const dbClient: SupabaseClient<Database> = planValidationDbClient();
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      contribution_type: 'header_context',
      file_name: 'header_context.json',
      mime_type: 'application/json',
    });
    const fileManager: MockFileManagerService = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerJson),
      fileManager,
    });
    const jobPayload: DialecticExecuteJobPayload = createHeaderContextExecutePayload();
    const params: ExecuteModelCallAndSaveParams = buildPlanValidationParams(dbClient, jobPayload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      isExecuteModelCallAndSaveSuccessReturn(result),
      'Expected success return for header_context fileType check',
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'FileManager.uploadAndRegisterFile should be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext: unknown = uploadCall.args[0];
    assert(
      isModelContributionContext(uploadContext),
      'Upload context should be ModelContributionUploadContext',
    );
    assertEquals(
      uploadContext.pathContext.fileType,
      FileType.HeaderContext,
      'PLAN-derived header_context job should save with fileType HeaderContext',
    );
  },
);
