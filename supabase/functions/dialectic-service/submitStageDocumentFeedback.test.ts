import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import {
  SubmitStageDocumentFeedbackPayload,
} from './dialectic.interface.ts';
import { submitStageDocumentFeedback } from './submitStageDocumentFeedback.ts';
import { createMockFileManagerService } from '../_shared/services/file_manager.mock.ts';

const USER_ID = 'user-abc-123';
const PROJECT_ID = 'project-xyz-789';
const RESOURCE_ROW_TIMESTAMP = new Date('2026-02-11T00:00:00.000Z').toISOString();

const mockPayload: SubmitStageDocumentFeedbackPayload = {
  sessionId: 'session-123',
  stageSlug: 'synthesis',
  iterationNumber: 1,
  documentKey: 'doc-a',
  modelId: 'model-a',
  feedbackContent: 'This is the feedback content.',
  feedbackType: 'user_feedback',
  userId: USER_ID,
  projectId: PROJECT_ID,
  sourceContributionId: 'contrib-feedback-source',
};

Deno.test('submitStageDocumentFeedback - Happy Path: creates a new feedback record', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord = {
    id: 'feedback-record-id-1',
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const mockDbRecord = {
    id: 'feedback-new-id',
    ...mockPayload,
  };
  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-1',
            storage_path: 'test/path',
            file_name: 'feedback.md',
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        insert: { data: [mockDbRecord], error: null },
        update: { data: null, error: new Error('Update should not be called') },
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
  assertEquals(result.data!.id, 'feedback-new-id');

  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);

  const uploadCall = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
  assertExists(uploadCall);
  assertEquals(uploadCall.pathContext.sourceContributionId, mockPayload.sourceContributionId);

  const insertSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_feedback',
  )?.insert;
  assertExists(insertSpy);
  assertEquals(insertSpy.calls.length, 1);
});

Deno.test('submitStageDocumentFeedback - Selects latest rendered resource when multiple exist for same sourceContributionId', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord = {
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
      dialectic_feedback: {
        select: { data: [{ id: 'feedback-new-id-multi', ...payloadWithSource }], error: null },
        insert: { data: [{ id: 'feedback-new-id-multi', ...payloadWithSource }], error: null },
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
  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);

  const uploadCall = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
  assertExists(uploadCall);
  assertEquals(uploadCall.pathContext.originalStoragePath, 'path/newest');
  assertEquals(uploadCall.pathContext.originalBaseName, 'newest');
});

Deno.test('submitStageDocumentFeedback - Happy Path: creates feedback when no sourceContributionId is provided', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord = {
    id: 'feedback-record-id-1b',
    project_id: PROJECT_ID,
    session_id: mockPayload.sessionId,
    user_id: USER_ID,
    stage_slug: mockPayload.stageSlug,
    iteration_number: mockPayload.iterationNumber,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    file_name: 'feedback-no-source.md',
    mime_type: 'text/markdown',
    size_bytes: 110,
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

  const payloadWithoutSource: SubmitStageDocumentFeedbackPayload = {
    ...mockPayload,
    sourceContributionId: null,
  };

  const mockDbRecord = {
    id: 'feedback-new-id-2',
    ...payloadWithoutSource,
  };
  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        insert: { data: [mockDbRecord], error: null },
        update: { data: null, error: new Error('Update should not be called') },
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
    payloadWithoutSource,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
  );

  assertExists(result.data);
  assertEquals(result.data!.id, 'feedback-new-id-2');

  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);

  const uploadCall = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
  assertExists(uploadCall);
  assertEquals(uploadCall.pathContext.sourceContributionId, null);
});

Deno.test('submitStageDocumentFeedback - Happy Path: updates an existing feedback record', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord = {
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
    resource_description: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const payloadWithId: SubmitStageDocumentFeedbackPayload = {
    ...mockPayload,
    feedbackId: 'existing-feedback-id',
  };
  const mockDbRecord = {
    id: 'existing-feedback-id',
    ...payloadWithId,
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
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        update: { data: [mockDbRecord], error: null },
        insert: { data: null, error: new Error('Insert should not be called') },
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
  assertEquals(result.data!.id, 'existing-feedback-id');

  assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);

  const updateSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_feedback',
  )?.update;
  assertExists(updateSpy);
  assertEquals(updateSpy.calls.length, 1);

  const eqSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_feedback',
  )?.eq;
  assertExists(eqSpy);
  assertEquals(eqSpy.calls[0].args, ['id', 'existing-feedback-id']);
});

Deno.test('submitStageDocumentFeedback - Error Case: returns 500 on fileManager failure', async () => {
  const mockFileManager = createMockFileManagerService();
  mockFileManager.setUploadAndRegisterFileResponse(null, { message: 'Upload failed' });

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
  assertEquals(result.error.message, 'Failed to upload and register feedback file.');
});

Deno.test('submitStageDocumentFeedback - Error Case: returns 500 on database insert failure', async () => {
  const mockFileManager = createMockFileManagerService();
  const mockFileRecord = {
    id: 'feedback-record-id-3',
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
    resource_description: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    target_contribution_id: null,
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      dialectic_project_resources: {
        select: {
          data: [{
            id: 'resource-feedback-source-4',
            storage_path: 'test/path',
            file_name: 'feedback.md',
            updated_at: RESOURCE_ROW_TIMESTAMP,
            created_at: RESOURCE_ROW_TIMESTAMP,
          }],
          error: null,
        },
      },
      dialectic_feedback: {
        insert: { data: null, error: new Error('DB insert error') },
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
  assertEquals(result.error.message, 'DB insert error');
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
  const mockDbRecord = {
    id: 'feedback-new-id-iter0',
    ...payloadWithZeroIteration,
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
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        insert: { data: [mockDbRecord], error: null },
        update: { data: null, error: new Error('Update should not be called') },
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
  const mockDbRecord = {
    id: 'feedback-new-id-iter1',
    ...payloadWithOneIteration,
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
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        insert: { data: [mockDbRecord], error: null },
        update: { data: null, error: new Error('Update should not be called') },
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
  const mockDbRecord = {
    id: 'feedback-new-id-res',
    ...mockPayload,
  };
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
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        insert: { data: [mockDbRecord], error: null },
        update: { data: null, error: new Error('Update should not be called') },
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
  const mockDbRecord = { id: 'feedback-new-id-osp', ...mockPayload };
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
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        insert: { data: [mockDbRecord], error: null },
        update: { data: null, error: new Error('Update should not be called') },
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
  const mockDbRecord = { id: 'feedback-new-id-obn', ...mockPayload };
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
      dialectic_feedback: {
        select: { data: [mockDbRecord], error: null },
        insert: { data: [mockDbRecord], error: null },
        update: { data: null, error: new Error('Update should not be called') },
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
