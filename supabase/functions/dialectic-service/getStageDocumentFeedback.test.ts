import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  createMockSupabaseClient,
  type IMockStorageDownloadResponse,
  type MockSupabaseClientSetup,
} from '../_shared/supabase.mock.ts';
import type { ILogger } from '../_shared/types.ts';
import { MockLogger } from '../_shared/logger.mock.ts';
import type { PathContext } from '../_shared/types/file_manager.types.ts';
import { DocumentKey, FileType } from '../_shared/types/file_manager.types.ts';
import {
  constructStoragePath,
  type ConstructedPath,
} from '../_shared/utils/path_constructor.ts';
import type {
  DialecticFeedbackRow,
  DialecticServiceResponse,
  GetStageDocumentFeedbackPayload,
  GetStageDocumentFeedbackResponse,
  StageDocumentFeedback,
  GetStageDocumentFeedbackDeps,
} from './dialectic.interface.ts';
import {
  getStageDocumentFeedback,
} from './getStageDocumentFeedback.ts';

const USER_ID = 'user-feedback-fetch-123';
const FEEDBACK_ROW_TIMESTAMP = new Date(
  '2026-02-11T00:00:01.000Z',
).toISOString();
const DOCUMENT_KEY: DocumentKey = FileType.business_case;

const validPayload: GetStageDocumentFeedbackPayload = {
  sessionId: 'session-get-fb',
  stageSlug: 'thesis',
  iterationNumber: 1,
  modelId: 'model-a',
  documentKey: DOCUMENT_KEY,
};

Deno.test('getStageDocumentFeedback - returns feedback record with content when feedback exists for the logical doc key', async () => {
  const feedbackRow: DialecticFeedbackRow = {
    id: 'feedback-id-with-content',
    project_id: 'proj-123',
    session_id: 'session-get-fb',
    user_id: USER_ID,
    stage_slug: 'thesis',
    iteration_number: 1,
    storage_bucket: 'dialectic-contributions',
    storage_path: 'projects/p1/sessions/session-get-fb/iteration_1/1_thesis',
    file_name: 'business_case_feedback.md',
    mime_type: 'text/markdown',
    size_bytes: 50,
    feedback_type: 'user_feedback',
    resource_description: {
      document_key: DOCUMENT_KEY,
      model_id: 'model-a',
    },
    created_at: FEEDBACK_ROW_TIMESTAMP,
    updated_at: FEEDBACK_ROW_TIMESTAMP,
    target_contribution_id: null,
  };

  const expectedContent = 'Saved feedback markdown content.';
  const storageDownloadSuccess: IMockStorageDownloadResponse = {
    data: new Blob([expectedContent], { type: 'text/markdown' }),
    error: null,
  };

  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
    USER_ID,
    {
      genericMockResults: {
        dialectic_feedback: {
          select: { data: [feedbackRow], error: null },
        },
      },
      storageMock: {
        downloadResult: (): Promise<IMockStorageDownloadResponse> =>
          Promise.resolve(storageDownloadSuccess),
      },
    },
  );

  const mockLogger: ILogger = new MockLogger();
  const dbClient: SupabaseClient<Database> = mockSupabase
    .client as unknown as SupabaseClient<Database>;
  const deps: GetStageDocumentFeedbackDeps = { logger: mockLogger };

  const result: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(validPayload, dbClient, deps);

  assertEquals(result.error, undefined);
  assertExists(result.data);
  assert(Array.isArray(result.data));
  assertEquals(result.data.length, 1);
  const item: StageDocumentFeedback = result.data[0];
  assertEquals(item.id, feedbackRow.id);
  assertEquals(item.content, expectedContent);
  assertEquals(item.createdAt, feedbackRow.created_at);
});

Deno.test('getStageDocumentFeedback - returns empty array when no feedback exists for the logical doc key', async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
    USER_ID,
    {
      genericMockResults: {
        dialectic_feedback: {
          select: { data: [], error: null },
        },
      },
    },
  );

  const mockLogger: ILogger = new MockLogger();
  const dbClient: SupabaseClient<Database> = mockSupabase
    .client as unknown as SupabaseClient<Database>;
  const deps: GetStageDocumentFeedbackDeps = { logger: mockLogger };

  const result: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(validPayload, dbClient, deps);

  assertEquals(result.error, undefined);
  assertExists(result.data);
  assertEquals(result.data, []);
});

Deno.test('getStageDocumentFeedback - queries by session_id AND stage_slug AND iteration_number AND resource_description document_key AND model_id', async () => {
  const feedbackRow: DialecticFeedbackRow = {
    id: 'fb-query-check',
    project_id: 'proj-123',
    session_id: 'session-get-fb',
    user_id: USER_ID,
    stage_slug: 'thesis',
    iteration_number: 1,
    storage_bucket: 'dialectic-contributions',
    storage_path: 'path',
    file_name: 'f.md',
    mime_type: 'text/markdown',
    size_bytes: 0,
    feedback_type: 'user_feedback',
    resource_description: {
      document_key: DOCUMENT_KEY,
      model_id: 'model-a',
    },
    created_at: FEEDBACK_ROW_TIMESTAMP,
    updated_at: FEEDBACK_ROW_TIMESTAMP,
    target_contribution_id: null,
  };

  const storageDownloadX: IMockStorageDownloadResponse = {
    data: new Blob(['x']),
    error: null,
  };

  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
    USER_ID,
    {
      genericMockResults: {
        dialectic_feedback: {
          select: { data: [feedbackRow], error: null },
        },
      },
      storageMock: {
        downloadResult: (): Promise<IMockStorageDownloadResponse> =>
          Promise.resolve(storageDownloadX),
      },
    },
  );

  const mockLogger: ILogger = new MockLogger();
  const dbClient: SupabaseClient<Database> = mockSupabase
    .client as unknown as SupabaseClient<Database>;
  const deps: GetStageDocumentFeedbackDeps = { logger: mockLogger };

  await getStageDocumentFeedback(validPayload, dbClient, deps);

  const eqHistoric = mockSupabase.spies.getHistoricQueryBuilderSpies(
    'dialectic_feedback',
    'eq',
  );
  assertExists(eqHistoric);
  assert(eqHistoric.callCount >= 3);
  const eqCalls = eqHistoric.callsArgs;
  const sessionEq = eqCalls.find((args) => args[0] === 'session_id');
  const stageEq = eqCalls.find((args) => args[0] === 'stage_slug');
  const iterEq = eqCalls.find((args) => args[0] === 'iteration_number');
  assertExists(sessionEq);
  assertEquals(sessionEq[1], validPayload.sessionId);
  assertExists(stageEq);
  assertEquals(stageEq[1], validPayload.stageSlug);
  assertExists(iterEq);
  assertEquals(iterEq[1], validPayload.iterationNumber);

  const filterHistoric = mockSupabase.spies.getHistoricQueryBuilderSpies(
    'dialectic_feedback',
    'filter',
  );
  assertExists(filterHistoric);
  assert(filterHistoric.callCount >= 2);
  const filterCalls = filterHistoric.callsArgs;
  const docKeyFilter = filterCalls.find(
    (args) =>
      args[0] === 'resource_description->>document_key' && args[1] === 'eq',
  );
  const modelIdFilter = filterCalls.find(
    (args) =>
      args[0] === 'resource_description->>model_id' && args[1] === 'eq',
  );
  assertExists(docKeyFilter);
  assertEquals(docKeyFilter[2], validPayload.documentKey);
  assertExists(modelIdFilter);
  assertEquals(modelIdFilter[2], validPayload.modelId);
});

Deno.test('getStageDocumentFeedback - downloads content from correct storage_bucket storage_path file_name path', async () => {
  const pathContext: PathContext & { fileType: FileType.UserFeedback } = {
    projectId: 'p1',
    fileType: FileType.UserFeedback,
    originalStoragePath: 'projects/p1/sessions/s1/iteration_1/1_thesis',
    originalBaseName: 'business_case',
  };
  const constructedPath: ConstructedPath =
    constructStoragePath(pathContext);

  const feedbackRow: DialecticFeedbackRow = {
    id: 'fb-download-path',
    project_id: 'proj-123',
    session_id: 'session-get-fb',
    user_id: USER_ID,
    stage_slug: 'thesis',
    iteration_number: 1,
    storage_bucket: 'dialectic-contributions',
    storage_path: constructedPath.storagePath,
    file_name: constructedPath.fileName,
    mime_type: 'text/markdown',
    size_bytes: 10,
    feedback_type: 'user_feedback',
    resource_description: {
      document_key: DOCUMENT_KEY,
      model_id: 'model-a',
    },
    created_at: FEEDBACK_ROW_TIMESTAMP,
    updated_at: FEEDBACK_ROW_TIMESTAMP,
    target_contribution_id: null,
  };

  let capturedPath: string | null = null;
  let capturedBucket: string | null = null;
  const storageDownloadCapture: IMockStorageDownloadResponse = {
    data: new Blob(['content']),
    error: null,
  };

  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
    USER_ID,
    {
      genericMockResults: {
        dialectic_feedback: {
          select: { data: [feedbackRow], error: null },
        },
      },
      storageMock: {
        downloadResult: (
          bucketId: string,
          path: string,
        ): Promise<IMockStorageDownloadResponse> => {
          capturedBucket = bucketId;
          capturedPath = path;
          return Promise.resolve(storageDownloadCapture);
        },
      },
    },
  );

  const mockLogger: ILogger = new MockLogger();
  const dbClient: SupabaseClient<Database> = mockSupabase
    .client as unknown as SupabaseClient<Database>;
  const deps: GetStageDocumentFeedbackDeps = { logger: mockLogger };

  await getStageDocumentFeedback(validPayload, dbClient, deps);

  const expectedDownloadPath = `${constructedPath.storagePath}/${constructedPath.fileName}`;
  assertEquals(capturedBucket, 'dialectic-contributions');
  assertEquals(capturedPath, expectedDownloadPath);
});

Deno.test('getStageDocumentFeedback - returns error when DB query fails', async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
    USER_ID,
    {
      genericMockResults: {
        dialectic_feedback: {
          select: {
            data: null,
            error: new Error('Simulated DB failure'),
          },
        },
      },
    },
  );

  const mockLogger: ILogger = new MockLogger();
  const dbClient: SupabaseClient<Database> = mockSupabase
    .client as unknown as SupabaseClient<Database>;
  const deps: GetStageDocumentFeedbackDeps = { logger: mockLogger };

  const result: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(validPayload, dbClient, deps);

  assertExists(result.error);
  assertEquals(result.data, undefined);
});

Deno.test('getStageDocumentFeedback - returns error when storage download fails', async () => {
  const feedbackRow: DialecticFeedbackRow = {
    id: 'fb-storage-fail',
    project_id: 'proj-123',
    session_id: 'session-get-fb',
    user_id: USER_ID,
    stage_slug: 'thesis',
    iteration_number: 1,
    storage_bucket: 'dialectic-contributions',
    storage_path: 'path',
    file_name: 'f.md',
    mime_type: 'text/markdown',
    size_bytes: 0,
    feedback_type: 'user_feedback',
    resource_description: {
      document_key: DOCUMENT_KEY,
      model_id: 'model-a',
    },
    created_at: FEEDBACK_ROW_TIMESTAMP,
    updated_at: FEEDBACK_ROW_TIMESTAMP,
    target_contribution_id: null,
  };

  const storageDownloadFailure: IMockStorageDownloadResponse = {
    data: null,
    error: new Error('Simulated storage download failure'),
  };

  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
    USER_ID,
    {
      genericMockResults: {
        dialectic_feedback: {
          select: { data: [feedbackRow], error: null },
        },
      },
      storageMock: {
        downloadResult: (): Promise<IMockStorageDownloadResponse> =>
          Promise.resolve(storageDownloadFailure),
      },
    },
  );

  const mockLogger: ILogger = new MockLogger();
  const dbClient: SupabaseClient<Database> = mockSupabase
    .client as unknown as SupabaseClient<Database>;
  const deps: GetStageDocumentFeedbackDeps = { logger: mockLogger };

  const result: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(validPayload, dbClient, deps);

  assertExists(result.error);
  assertEquals(result.data, undefined);
});

Deno.test('getStageDocumentFeedback - validates required payload fields returns error if any missing', async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
    USER_ID,
    {},
  );
  const mockLogger: ILogger = new MockLogger();
  const dbClient: SupabaseClient<Database> = mockSupabase
    .client as unknown as SupabaseClient<Database>;
  const deps: GetStageDocumentFeedbackDeps = { logger: mockLogger };

  const payloadEmptySessionId: GetStageDocumentFeedbackPayload = {
    sessionId: '',
    stageSlug: 'thesis',
    iterationNumber: 1,
    modelId: 'model-a',
    documentKey: DOCUMENT_KEY,
  };
  const resultMissingSession: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(
      payloadEmptySessionId,
      dbClient,
      deps,
    );
  assertExists(resultMissingSession.error);
  assertEquals(resultMissingSession.data, undefined);

  const payloadEmptyStageSlug: GetStageDocumentFeedbackPayload = {
    sessionId: 'session-get-fb',
    stageSlug: '',
    iterationNumber: 1,
    modelId: 'model-a',
    documentKey: DOCUMENT_KEY,
  };
  const resultMissingStage: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(
      payloadEmptyStageSlug,
      dbClient,
      deps,
    );
  assertExists(resultMissingStage.error);
  assertEquals(resultMissingStage.data, undefined);

  const payloadEmptyModelId: GetStageDocumentFeedbackPayload = {
    sessionId: 'session-get-fb',
    stageSlug: 'thesis',
    iterationNumber: 1,
    modelId: '',
    documentKey: DOCUMENT_KEY,
  };
  const resultMissingModel: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(
      payloadEmptyModelId,
      dbClient,
      deps,
    );
  assertExists(resultMissingModel.error);
  assertEquals(resultMissingModel.data, undefined);

  const payloadUndefinedIterationNumber = {
    sessionId: 'session-get-fb',
    stageSlug: 'thesis',
    iterationNumber: undefined,
    modelId: 'model-a',
    documentKey: DOCUMENT_KEY,
  };
  const resultMissingIteration: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(
      payloadUndefinedIterationNumber as unknown as GetStageDocumentFeedbackPayload,
      dbClient,
      deps,
    );
  assertExists(resultMissingIteration.error);
  assertEquals(resultMissingIteration.data, undefined);

  const payloadUndefinedDocumentKey = {
    sessionId: 'session-get-fb',
    stageSlug: 'thesis',
    iterationNumber: 1,
    modelId: 'model-a',
    documentKey: undefined,
  };
  const resultMissingDocKey: DialecticServiceResponse<GetStageDocumentFeedbackResponse> =
    await getStageDocumentFeedback(
      payloadUndefinedDocumentKey as unknown as GetStageDocumentFeedbackPayload,
      dbClient,
      deps,
    );
  assertExists(resultMissingDocKey.error);
  assertEquals(resultMissingDocKey.data, undefined);
});
