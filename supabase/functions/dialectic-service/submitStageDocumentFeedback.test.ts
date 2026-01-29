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
