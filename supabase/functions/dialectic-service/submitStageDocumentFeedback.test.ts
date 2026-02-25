import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { isUserFeedbackContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
import { DocumentKey, FileType } from '../_shared/types/file_manager.types.ts';
import {
  SubmitStageDocumentFeedbackPayload,
} from './dialectic.interface.ts';
import { submitStageDocumentFeedback } from './submitStageDocumentFeedback.ts';
import { createMockFileManagerService } from '../_shared/services/file_manager.mock.ts';

const USER_ID = 'user-abc-123';
const PROJECT_ID = 'project-xyz-789';
const RESOURCE_ROW_TIMESTAMP = new Date('2026-02-11T00:00:00.000Z').toISOString();
const FEEDBACK_ROW_TIMESTAMP = new Date('2026-02-11T00:00:01.000Z').toISOString();
const DOCUMENT_KEY: DocumentKey = FileType.business_case;

const mockPayload: SubmitStageDocumentFeedbackPayload = {
  sessionId: 'session-123',
  stageSlug: 'synthesis',
  iterationNumber: 1,
  documentKey: DOCUMENT_KEY,
  modelId: 'model-a',
  feedbackContent: 'This is the feedback content.',
  feedbackType: 'user_feedback',
  userId: USER_ID,
  projectId: PROJECT_ID,
  sourceContributionId: 'contrib-feedback-source',
};

Deno.test('submitStageDocumentFeedback - delegates to FileManager and returns its success response', async () => {
  const mockFileManager = createMockFileManagerService();
  const originalRenderedStoragePath = 'projects/p1/sessions/session-123/iteration_1/3_synthesis/rendered_documents';
  const originalRenderedFileName = 'this_is_the_actual_rendered_doc_name.md';
  const expectedOriginalBaseName = 'this_is_the_actual_rendered_doc_name';

  const mockFileRecord: Database['public']['Tables']['dialectic_feedback']['Row'] = {
    id: 'feedback-record-id-1',
    project_id: PROJECT_ID,
    session_id: mockPayload.sessionId,
    user_id: USER_ID,
    stage_slug: mockPayload.stageSlug,
    iteration_number: mockPayload.iterationNumber,
    storage_bucket: 'test-bucket',
    storage_path: originalRenderedStoragePath,
    file_name: `${expectedOriginalBaseName}_feedback.md`,
    mime_type: 'text/markdown',
    size_bytes: 100,
    feedback_type: 'user_feedback',
    resource_description: { document_key: mockPayload.documentKey, model_id: mockPayload.modelId },
    created_at: FEEDBACK_ROW_TIMESTAMP,
    updated_at: FEEDBACK_ROW_TIMESTAMP,
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-1',
            storage_path: originalRenderedStoragePath,
            file_name: originalRenderedFileName,
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });

  const deps = {
    fileManager: mockFileManager,
    logger: {
      log: spy(),
      error: spy(),
      warn: spy(),
      info: spy(),
      debug: spy(),
    },
  };

  const result = await submitStageDocumentFeedback(
    mockPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.data);
  assertEquals(result.data, mockFileRecord);
  assertEquals(result.error, undefined);

  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);

  const uploadCall = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
  assertExists(uploadCall);

  // Prove the handler does not "make up" original placement inputs:
  // it must fetch the actual rendered_document row and pass its location + derived base name into FileManager.
  assertEquals(uploadCall.pathContext.originalStoragePath, originalRenderedStoragePath);
  assertEquals(uploadCall.pathContext.originalBaseName, expectedOriginalBaseName);
  assertEquals(uploadCall.pathContext.sourceContributionId, mockPayload.sourceContributionId);

  // Prove the handler passes the logical doc identity through to FileManager for DB upsert scoping.
  if (!isUserFeedbackContext(uploadCall)) {
    throw new Error('Expected upload context to be UserFeedbackUploadContext.');
  }

  assertExists(uploadCall.resourceDescriptionForDb);
  assertEquals(uploadCall.resourceDescriptionForDb, {
    document_key: mockPayload.documentKey,
    model_id: mockPayload.modelId,
  });
  assertEquals(uploadCall.feedbackTypeForDb, mockPayload.feedbackType);

  // Assert no direct DB writes were made from this handler
  const insertSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_feedback',
  )?.insert;
  assert(insertSpy === undefined || insertSpy.calls.length === 0);
  const updateSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_feedback',
  )?.update;
  assert(updateSpy === undefined || updateSpy.calls.length === 0);
});

Deno.test('submitStageDocumentFeedback - Selects latest rendered resource when multiple exist for same sourceContributionId', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord: Database['public']['Tables']['dialectic_feedback']['Row'] = {
    id: 'feedback-record-id-multi-resource',
    project_id: PROJECT_ID,
    session_id: mockPayload.sessionId,
    user_id: USER_ID,
    stage_slug: mockPayload.stageSlug,
    iteration_number: mockPayload.iterationNumber,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    file_name: 'feedback.md',
    mime_type: 'text/markdown',
    size_bytes: 100,
    feedback_type: 'user_feedback',
    resource_description: {
      document_key: mockPayload.documentKey,
      model_id: mockPayload.modelId,
    },
    created_at: FEEDBACK_ROW_TIMESTAMP,
    updated_at: FEEDBACK_ROW_TIMESTAMP,
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const payloadWithSource: SubmitStageDocumentFeedbackPayload = {
    ...mockPayload,
    sourceContributionId: 'contrib-multi',
  };

  const sameUpdatedAt = new Date('2026-02-11T02:00:00.000Z').toISOString();
  const olderCreatedAt = new Date('2026-02-11T01:00:00.000Z').toISOString();
  const newerCreatedAt = new Date('2026-02-11T02:00:01.000Z').toISOString();

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [
            {
              id: 'res-1',
              storage_path: 'path/old',
              file_name: 'old.md',
              source_contribution_id: payloadWithSource.sourceContributionId,
              updated_at: sameUpdatedAt,
              created_at: olderCreatedAt,
            },
            {
              id: 'res-2',
              storage_path: 'path/newer',
              file_name: 'newer.md',
              source_contribution_id: payloadWithSource.sourceContributionId,
              updated_at: sameUpdatedAt,
              created_at: newerCreatedAt,
            },
            {
              id: 'res-3',
              storage_path: 'path/newest',
              file_name: 'newest.md',
              source_contribution_id: payloadWithSource.sourceContributionId,
              updated_at: sameUpdatedAt,
              created_at: newerCreatedAt,
            },
          ],
          error: null,
        },
      },
    },
  });

  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };

  const result = await submitStageDocumentFeedback(
    payloadWithSource,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.data);
  assertEquals(result.data, mockFileRecord);
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);

  const uploadCall = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
  assertExists(uploadCall);
  assertEquals(uploadCall.pathContext.originalStoragePath, 'path/newest');
  assertEquals(uploadCall.pathContext.originalBaseName, 'newest');
});

Deno.test('submitStageDocumentFeedback - returns error and does not call FileManager when sourceContributionId is missing', async () => {
  const mockFileManager = createMockFileManagerService();
  const payloadWithoutSource: SubmitStageDocumentFeedbackPayload = {
    ...mockPayload,
    sourceContributionId: undefined,
  };

  const mockSupabase = createMockSupabaseClient(USER_ID, {});

  const deps = {
    fileManager: mockFileManager,
    logger: {
      log: spy(),
      error: spy(),
      warn: spy(),
      info: spy(),
      debug: spy(),
    },
  };

  const result = await submitStageDocumentFeedback(
    payloadWithoutSource,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.error);
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0);
});

Deno.test('submitStageDocumentFeedback - existing feedbackId in payload does not cause update, delegates to FileManager', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord: Database['public']['Tables']['dialectic_feedback']['Row'] = {
    id: 'feedback-record-id-2',
    project_id: PROJECT_ID,
    session_id: mockPayload.sessionId,
    user_id: USER_ID,
    stage_slug: mockPayload.stageSlug,
    iteration_number: mockPayload.iterationNumber,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    file_name: 'feedback-updated.md',
    mime_type: 'text/markdown',
    size_bytes: 150,
    feedback_type: 'user_feedback',
    resource_description: { document_key: mockPayload.documentKey, model_id: mockPayload.modelId },
    created_at: FEEDBACK_ROW_TIMESTAMP,
    updated_at: FEEDBACK_ROW_TIMESTAMP,
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const payloadWithId: SubmitStageDocumentFeedbackPayload = {
    ...mockPayload,
    feedbackId: 'existing-feedback-id',
  };
  
  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-2',
            storage_path: 'test/path',
            file_name: 'feedback.md',
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });

  const deps = {
    fileManager: mockFileManager,
    logger: {
      log: spy(),
      error: spy(),
      warn: spy(),
      info: spy(),
      debug: spy(),
    },
  };

  const result = await submitStageDocumentFeedback(
    payloadWithId,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.data);
  assertEquals(result.data, mockFileRecord);
  
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);

  const updateSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_feedback',
  )?.update;
  assert(updateSpy === undefined || updateSpy.calls.length === 0, 'Handler must not call update directly');
});

Deno.test('submitStageDocumentFeedback - Error Case: returns error on fileManager failure', async () => {
  const mockFileManager = createMockFileManagerService();
  mockFileManager.setUploadAndRegisterFileResponse(null, { message: 'Upload failed', details: 'DB insert failed.' });

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-3',
            storage_path: 'test/path',
            file_name: 'feedback.md',
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });

  const deps = {
    fileManager: mockFileManager,
    logger: {
      log: spy(),
      error: spy(),
      warn: spy(),
      info: spy(),
      debug: spy(),
    },
  };

  const result = await submitStageDocumentFeedback(
    mockPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.error);
  assertEquals(result.error.message, 'Upload failed');
  assertEquals(result.error.details, 'DB insert failed.');
});

Deno.test('submitStageDocumentFeedback - Validation: returns 400 on missing payload fields', async () => {
    const mockFileManager = createMockFileManagerService();
  const invalidPayload: Partial<SubmitStageDocumentFeedbackPayload> = {
    ...mockPayload,
    feedbackContent: undefined,
  };
  const mockSupabase = createMockSupabaseClient(USER_ID, {});
  const deps = { fileManager: mockFileManager, logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() } };

  const result = await submitStageDocumentFeedback(
    invalidPayload as SubmitStageDocumentFeedbackPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.error);
  assertEquals(result.error.message, 'Missing required fields in feedback payload.');
});

Deno.test('submitStageDocumentFeedback - Validation: returns error when iterationNumber is undefined', async () => {
  const mockFileManager = createMockFileManagerService();
  const payloadWithUndefinedIteration: Partial<SubmitStageDocumentFeedbackPayload> = {
    ...mockPayload,
    iterationNumber: undefined,
  };
  const mockSupabase = createMockSupabaseClient(USER_ID, {});
  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };

  const result = await submitStageDocumentFeedback(
    payloadWithUndefinedIteration as SubmitStageDocumentFeedbackPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.error);
  assertEquals(result.error.message, 'Missing required fields in feedback payload.');
});

Deno.test('submitStageDocumentFeedback - Validation: accepts iterationNumber of 0 as valid', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord = {
    id: 'feedback-record-iter0',
    project_id: PROJECT_ID,
    session_id: mockPayload.sessionId,
    user_id: USER_ID,
    stage_slug: mockPayload.stageSlug,
    iteration_number: 0,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    file_name: 'feedback.md',
    mime_type: 'text/markdown',
    size_bytes: 100,
    feedback_type: 'user_feedback',
    resource_description: {
      document_key: mockPayload.documentKey,
      model_id: mockPayload.modelId,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const payloadWithZeroIteration: SubmitStageDocumentFeedbackPayload = {
    ...mockPayload,
    iterationNumber: 0,
  };

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-5',
            storage_path: 'test/path',
            file_name: 'feedback.md',
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });

  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };

  const result = await submitStageDocumentFeedback(
    payloadWithZeroIteration,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.data);
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
});

Deno.test('submitStageDocumentFeedback - Validation: accepts iterationNumber of 1 as valid', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord = {
    id: 'feedback-record-iter1',
    project_id: PROJECT_ID,
    session_id: mockPayload.sessionId,
    user_id: USER_ID,
    stage_slug: mockPayload.stageSlug,
    iteration_number: 1,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    file_name: 'feedback.md',
    mime_type: 'text/markdown',
    size_bytes: 100,
    feedback_type: 'user_feedback',
    resource_description: {
      document_key: mockPayload.documentKey,
      model_id: mockPayload.modelId,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const payloadWithOneIteration: SubmitStageDocumentFeedbackPayload = {
    ...mockPayload,
    iterationNumber: 1,
  };

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-6',
            storage_path: 'test/path',
            file_name: 'feedback.md',
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });

  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };

  const result = await submitStageDocumentFeedback(
    payloadWithOneIteration,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.data);
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
});

Deno.test('submitStageDocumentFeedback - when sourceContributionId provided, queries dialectic_project_resources for original doc', async () => {
  const mockFileManager = createMockFileManagerService();
  const originalStoragePath = 'projects/p1/session_abc/iter_1/3_synthesis/rendered_documents';
  const originalFileName = 'doc-a_model-a.md';
  mockFileManager.setUploadAndRegisterFileResponse(
    {
      id: 'feedback-record-id-res',
      project_id: PROJECT_ID,
      session_id: mockPayload.sessionId,
      user_id: USER_ID,
      stage_slug: mockPayload.stageSlug,
      iteration_number: mockPayload.iterationNumber,
      storage_bucket: 'test-bucket',
      storage_path: originalStoragePath,
      file_name: 'doc-a_model-a_feedback.md',
      mime_type: 'text/markdown',
      size_bytes: 100,
      feedback_type: 'user_feedback',
      resource_description: { document_key: mockPayload.documentKey, model_id: mockPayload.modelId },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      target_contribution_id: mockPayload.sourceContributionId ?? null,
    },
    null,
  );
  
  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-7',
            storage_path: originalStoragePath,
            file_name: originalFileName,
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });
  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };
  await submitStageDocumentFeedback(
    mockPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );
  assertExists(mockSupabase.client.getLatestBuilder('dialectic_project_resources'));
});

Deno.test('submitStageDocumentFeedback - error returned if original document lookup fails', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: { data: [], error: null },
      },
    },
  });
  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };
  const result = await submitStageDocumentFeedback(
    mockPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );
  assertExists(result.error);
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0);
});

Deno.test('submitStageDocumentFeedback - pathContext includes originalStoragePath from looked-up resource', async () => {
  const mockFileManager = createMockFileManagerService();
  const originalStoragePath = 'projects/p1/session_abc/iter_1/3_synthesis/rendered_documents';
  const originalFileName = 'doc-a_model-a.md';
  mockFileManager.setUploadAndRegisterFileResponse(
    {
      id: 'feedback-record-id-osp',
      project_id: PROJECT_ID,
      session_id: mockPayload.sessionId,
      user_id: USER_ID,
      stage_slug: mockPayload.stageSlug,
      iteration_number: mockPayload.iterationNumber,
      storage_bucket: 'test-bucket',
      storage_path: originalStoragePath,
      file_name: 'doc-a_model-a_feedback.md',
      mime_type: 'text/markdown',
      size_bytes: 100,
      feedback_type: 'user_feedback',
      resource_description: { document_key: mockPayload.documentKey, model_id: mockPayload.modelId },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      target_contribution_id: mockPayload.sourceContributionId ?? null,
    },
    null,
  );
  
  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-8',
            storage_path: originalStoragePath,
            file_name: originalFileName,
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });
  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };
  await submitStageDocumentFeedback(
    mockPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
  const uploadCall = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
  assertExists(uploadCall);
  assertEquals(uploadCall.pathContext.originalStoragePath, originalStoragePath);
});

Deno.test('submitStageDocumentFeedback - pathContext includes originalBaseName derived from looked-up file_name', async () => {
  const mockFileManager = createMockFileManagerService();
  const originalStoragePath = 'projects/p1/session_abc/iter_1/3_synthesis/rendered_documents';
  const originalFileName = 'doc-a_model-a.md';
  const expectedBaseName = 'doc-a_model-a';
  mockFileManager.setUploadAndRegisterFileResponse(
    {
      id: 'feedback-record-id-obn',
      project_id: PROJECT_ID,
      session_id: mockPayload.sessionId,
      user_id: USER_ID,
      stage_slug: mockPayload.stageSlug,
      iteration_number: mockPayload.iterationNumber,
      storage_bucket: 'test-bucket',
      storage_path: originalStoragePath,
      file_name: `${expectedBaseName}_feedback.md`,
      mime_type: 'text/markdown',
      size_bytes: 100,
      feedback_type: 'user_feedback',
      resource_description: { document_key: mockPayload.documentKey, model_id: mockPayload.modelId },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      target_contribution_id: mockPayload.sourceContributionId ?? null,
    },
    null,
  );
  
  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-9',
            storage_path: originalStoragePath,
            file_name: originalFileName,
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
    },
  });
  const deps = {
    fileManager: mockFileManager,
    logger: { log: spy(), error: spy(), warn: spy(), info: spy(), debug: spy() },
  };
  await submitStageDocumentFeedback(
    mockPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
  const uploadCall = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
  assertExists(uploadCall);
  assertEquals(uploadCall.pathContext.originalBaseName, expectedBaseName);
});