/**
 * Tests that FileManagerService retries transient errors on storage upload and
 * DB insert a bounded number of times, and does not retry non-transient errors.
 * These constants must match the retry limits in file_manager.ts when implemented.
 */
const MAX_TRANSIENT_RETRIES = 3;
const EXPECTED_MAX_UPLOAD_ATTEMPTS = 1 + MAX_TRANSIENT_RETRIES;
const EXPECTED_MAX_INSERT_ATTEMPTS = 1 + MAX_TRANSIENT_RETRIES;

import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import { stub, type Stub } from 'https://deno.land/std@0.190.0/testing/mock.ts';
import {
  createMockSupabaseClient,
  MockSupabaseClientSetup,
  MockSupabaseDataConfig,
  IMockStorageFileOptions,
} from '../supabase.mock.ts';
import { FileManagerService } from './file_manager.ts';
import {
  UploadContext,
  ModelContributionUploadContext,
  FileType,
  ContributionMetadata,
} from '../types/file_manager.types.ts';
import { constructStoragePath } from '../utils/path_constructor.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../../types_db.ts';
import { PostgrestError } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../logger.mock.ts';

Deno.test('FileManagerService transient error retry behavior', async (t) => {
  let setup: MockSupabaseClientSetup;
  let fileManager: FileManagerService;
  let envStub: Stub<typeof Deno.env, [string], string | undefined>;
  let originalEnvGet: (key: string) => string | undefined;

  const beforeEach = (config: MockSupabaseDataConfig = {}) => {
    originalEnvGet = Deno.env.get.bind(Deno.env);
    envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
      if (key === 'SB_CONTENT_STORAGE_BUCKET') {
        return 'test-bucket';
      }
      return originalEnvGet(key);
    });
    const logger: MockLogger = new MockLogger();
    setup = createMockSupabaseClient('test-user-id', config);
    fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, {
      constructStoragePath,
      logger,
    });
  };

  const afterEach = () => {
    if (envStub && typeof envStub.restore === 'function') {
      try {
        envStub.restore();
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (err.message !== 'instance method already restored') throw e;
      }
    }
    if (originalEnvGet && Deno.env.get !== originalEnvGet) {
      Deno.env.get = originalEnvGet;
    }
  };

  const baseUploadContext: UploadContext = {
    pathContext: {
      fileType: FileType.InitialUserPrompt,
      projectId: 'project-uuid-123',
      sessionId: 'session-uuid-456',
      iteration: 1,
      originalFileName: 'test.pdf',
    },
    fileContent: 'test content',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    userId: 'user-uuid-789',
    description: 'test description',
  };

  const pathContext: ModelContributionUploadContext['pathContext'] = {
    fileType: FileType.business_case,
    projectId: 'project-uuid-123',
    sessionId: 'session-uuid-456',
    iteration: 2,
    stageSlug: '2_antithesis',
    modelSlug: 'claude-3-sonnet',
    attemptCount: 0,
    documentKey: 'business_case',
  };

  const contributionMetadata: ContributionMetadata = {
    iterationNumber: 2,
    modelIdUsed: 'model-id-sonnet',
    modelNameDisplay: 'Claude 3 Sonnet',
    sessionId: 'session-uuid-456',
    stageSlug: '2_antithesis',
  };

  const successContributionRecord: { id: string; file_name: string } = {
    id: 'contrib-123',
    file_name: 'placeholder.json',
  };

  await t.step('upload: transient error then success returns record and upload is called more than once', async () => {
    try {
      const expectedPathParts = constructStoragePath(pathContext);
      let uploadCallCount = 0;

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [successContributionRecord], error: null },
          },
        },
        storageMock: {
          uploadResult: (
            _bucketId: string,
            path: string,
            _body: unknown,
            _options?: IMockStorageFileOptions
          ): Promise<{ data: { path: string } | null; error: Error | null }> => {
            uploadCallCount++;
            if (uploadCallCount === 1) {
              return Promise.resolve({ data: null, error: new Error('Bad Gateway') });
            }
            return Promise.resolve({ data: { path }, error: null });
          },
        },
      };
      beforeEach(config);
      const storageBucket = setup.spies.storage.from('test-bucket');
      const uploadSpy = storageBucket.uploadSpy;

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: '# Business case content',
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(error, null);
      assertExists(record);
      assertEquals(record?.id, successContributionRecord.id);
      assert(uploadSpy.calls.length > 1, 'Upload should have been called more than once (retry occurred)');
      assertEquals(uploadCallCount, uploadSpy.calls.length);
    } finally {
      afterEach();
    }
  });

  await t.step('upload: transient error exhausts retries then returns error and upload called expected times', async () => {
    try {
      let uploadCallCount = 0;

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [successContributionRecord], error: null },
          },
        },
        storageMock: {
          uploadResult: (): Promise<{ data: null; error: Error }> => {
            uploadCallCount++;
            return Promise.resolve({ data: null, error: new Error('Bad Gateway') });
          },
        },
      };
      beforeEach(config);
      const storageBucket = setup.spies.storage.from('test-bucket');
      const uploadSpy = storageBucket.uploadSpy;

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: '# Business case content',
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(record, null);
      assertExists(error);
      assertEquals(
        uploadSpy.calls.length,
        EXPECTED_MAX_UPLOAD_ATTEMPTS,
        `Upload should be called exactly ${EXPECTED_MAX_UPLOAD_ATTEMPTS} times (initial + ${MAX_TRANSIENT_RETRIES} retries)`
      );
      assertEquals(uploadCallCount, EXPECTED_MAX_UPLOAD_ATTEMPTS);
    } finally {
      afterEach();
    }
  });

  await t.step('upload: non-transient error is not retried, upload called exactly once', async () => {
    try {
      let uploadCallCount = 0;

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [successContributionRecord], error: null },
          },
        },
        storageMock: {
          uploadResult: (
            _bucketId: string,
            _path: string,
            _body: unknown,
            _options?: IMockStorageFileOptions
          ): Promise<{ data: { path: string } | null; error: Error }> => {
            uploadCallCount++;
            return Promise.resolve({ data: null, error: new Error('Invalid payload or validation failed') });
          },
        },
      };
      beforeEach(config);
      const storageBucket = setup.spies.storage.from('test-bucket');
      const uploadSpy = storageBucket.uploadSpy;

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: '# Business case content',
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(record, null);
      assertExists(error);
      assertEquals(uploadSpy.calls.length, 1, 'Upload must be called exactly once when error is non-transient');
      assertEquals(uploadCallCount, 1);
    } finally {
      afterEach();
    }
  });

  await t.step('insert: transient error then success returns record and insert is called more than once', async () => {
    try {
      const expectedPathParts = constructStoragePath(pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
      let insertCallCount = 0;

      const transientError: PostgrestError = {
        name: 'PostgrestError',
        message: 'Bad Gateway',
        code: '502',
        details: '',
        hint: '',
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: async () => {
              insertCallCount++;
              if (insertCallCount === 1) {
                return { data: null, error: transientError };
              }
              return { data: [successContributionRecord], error: null };
            },
          },
        },
        storageMock: {
          uploadResult: { data: { path: expectedFullPath }, error: null },
        },
      };
      beforeEach(config);

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: '# Business case content',
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(error, null);
      assertExists(record);
      assertEquals(record?.id, successContributionRecord.id);
      const insertHistoric = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'insert');
      assertExists(insertHistoric);
      assert(
        insertHistoric.callCount > 1,
        'Insert should have been called more than once (retry occurred)'
      );
      assertEquals(insertCallCount, insertHistoric.callCount);
    } finally {
      afterEach();
    }
  });

  await t.step('insert: transient error exhausts retries then returns error and insert called expected times', async () => {
    try {
      const expectedPathParts = constructStoragePath(pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
      let insertCallCount = 0;

      const transientError: PostgrestError = {
        name: 'PostgrestError',
        message: 'Bad Gateway',
        code: '502',
        details: '',
        hint: '',
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: async () => {
              insertCallCount++;
              return { data: null, error: transientError };
            },
          },
        },
        storageMock: {
          uploadResult: { data: { path: expectedFullPath }, error: null },
          removeResult: { data: [], error: null },
        },
      };
      beforeEach(config);

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: '# Business case content',
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(record, null);
      assertExists(error);
      const insertHistoric = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'insert');
      assertExists(insertHistoric);
      assertEquals(
        insertHistoric.callCount,
        EXPECTED_MAX_INSERT_ATTEMPTS,
        `Insert should be called exactly ${EXPECTED_MAX_INSERT_ATTEMPTS} times (initial + ${MAX_TRANSIENT_RETRIES} retries)`
      );
      assertEquals(insertCallCount, EXPECTED_MAX_INSERT_ATTEMPTS);
    } finally {
      afterEach();
    }
  });

  await t.step('insert: non-transient error is not retried, insert called exactly once', async () => {
    try {
      const expectedPathParts = constructStoragePath(pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

      const constraintError: PostgrestError = {
        name: 'PostgrestError',
        message: 'duplicate key value violates unique constraint',
        code: '23505',
        details: 'Key (session_id, stage, iteration_number)=(...) already exists.',
        hint: '',
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: null, error: constraintError },
          },
        },
        storageMock: {
          uploadResult: { data: { path: expectedFullPath }, error: null },
          removeResult: { data: [], error: null },
        },
      };
      beforeEach(config);

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: '# Business case content',
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(record, null);
      assertExists(error);
      const insertHistoric = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'insert');
      assertExists(insertHistoric);
      assertEquals(insertHistoric.callCount, 1, 'Insert must be called exactly once when error is non-transient');
    } finally {
      afterEach();
    }
  });
});
