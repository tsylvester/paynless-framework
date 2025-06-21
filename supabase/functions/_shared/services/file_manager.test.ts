import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertRejects,
  assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts'
import { stub, type Stub } from 'https://deno.land/std@0.190.0/testing/mock.ts'
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
  type MockSupabaseDataConfig,
} from '../supabase.mock.ts'
import { FileManagerService } from './file_manager.ts'
import type { UploadContext, PathContext } from '../types/file_manager.types.ts'
import { constructStoragePath } from '../utils/path_constructor.ts'
import type { TablesInsert, Json } from '../../types_db.ts'

Deno.test('FileManagerService', async (t) => {
  let setup: MockSupabaseClientSetup
  let fileManager: FileManagerService
  let envStub: any
  let originalEnvGet: typeof Deno.env.get

  const beforeEach = (config: MockSupabaseDataConfig = {}) => {
    originalEnvGet = Deno.env.get.bind(Deno.env);
    envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
      if (key === 'SB_CONTENT_STORAGE_BUCKET') {
        return 'test-bucket'
      }
      return originalEnvGet(key)
    })

    setup = createMockSupabaseClient('test-user-id', config)
    fileManager = new FileManagerService(setup.client as any)
  }

  const afterEach = () => {
    if (envStub && typeof envStub.restore === 'function') {
      try {
        envStub.restore()
      } catch (e: any) {
        if (e.message !== "instance method already restored") throw e;
      }
    }
    if (originalEnvGet && Deno.env.get !== originalEnvGet) {
        Deno.env.get = originalEnvGet;
    }
  }

  const baseUploadContext: UploadContext = {
    pathContext: {
      fileType: 'user_prompt',
      projectId: 'project-uuid-123',
      sessionId: 'session-uuid-456',
      iteration: 1,
      originalFileName: 'test.pdf',
    },
    fileContent: 'test content',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    userId: 'user-uuid-789',
  }

  await t.step(
    'constructor should throw if bucket environment variable is not set',
    () => {
      const currentOriginalGet = Deno.env.get.bind(Deno.env);
      let tempDenoEnvGetStub: Stub<typeof Deno.env, [string], string | undefined> | null = null;
      try {
        const mockSupabase = createMockSupabaseClient('test-user-id', {}); 
        tempDenoEnvGetStub = stub(Deno.env, 'get', (key: string): string | undefined => {
          if (key === 'SB_CONTENT_STORAGE_BUCKET') {
            return undefined;
          }
          return currentOriginalGet(key);
        });

        assertRejects(
          async () => new FileManagerService(mockSupabase.client as any),
          Error,
          'SB_CONTENT_STORAGE_BUCKET environment variable is not set.',
        );
      } finally {
        if (tempDenoEnvGetStub) {
          tempDenoEnvGetStub.restore();
        }
        if (Deno.env.get !== currentOriginalGet) {
            Deno.env.get = currentOriginalGet;
        }
      }
    },
  )

  await t.step(
    'uploadAndRegisterFile should use bucket from environment variable',
    async () => {
      try {
        beforeEach()
        await fileManager.uploadAndRegisterFile(baseUploadContext)
        const storageFromSpy = setup.spies.storage.from('test-bucket').uploadSpy
        assertExists(storageFromSpy!.calls[0])
      } finally {
        afterEach()
      }
    },
  )

  await t.step(
    'uploadAndRegisterFile should register a project resource correctly',
    async () => {
      try {
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              insert: { data: [{ id: 'resource-123', project_id: 'project-uuid-123', user_id: 'user-uuid-789', file_name: 'test.pdf', mime_type: 'application/pdf', size_bytes: 12345, storage_bucket: 'test-bucket', storage_path: 'projects/project-uuid-123/sessions/session-for-proj-res/iteration_0/0_seed_inputs/general_resource/test.pdf', resource_description: 'A test PDF file.' }], error: null },
            },
          },
        }
        beforeEach(config)

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: 'general_resource',
            projectId: 'project-uuid-123',
            originalFileName: 'test.pdf',
            sessionId: 'session-for-proj-res',
            iteration: 0,
          },
          description: 'A test PDF file.',
        }

        const { record, error } = await fileManager.uploadAndRegisterFile(context)

        assertEquals(error, null)
        assertExists(record)
        assertEquals(record?.id, 'resource-123')

        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_project_resources')
        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.insert
        assertExists(insertSpy);
        const insertData = insertSpy.calls[0].args[0] as TablesInsert<'dialectic_project_resources'>;
        assertEquals(insertData.project_id, 'project-uuid-123')
        const expectedPath = constructStoragePath(context.pathContext);
        assertEquals(insertData.storage_path, expectedPath);
        assertEquals(insertData.resource_description, JSON.stringify({ type: context.pathContext.fileType, originalDescription: context.description }))
      } finally {
        afterEach()
      }
    },
  )

  await t.step(
    'uploadAndRegisterFile should register a contribution correctly (no collision)',
    async () => {
      try {
        const pathContextAttempt0: PathContext = {
            fileType: 'model_contribution_main',
            projectId: 'project-uuid-123',
            sessionId: 'session-uuid-456',
            iteration: 2,
            stageSlug: '2_antithesis',
            modelSlug: 'claude-3-sonnet',
            originalFileName: 'claude_contribution.md',
            attemptCount: 0
        };
        const expectedPathAttempt0 = constructStoragePath(pathContextAttempt0);
        const expectedFileNameAttempt0 = expectedPathAttempt0.split('/').pop()!;

        const pathContextRawAttempt0: PathContext = {
            ...pathContextAttempt0,
            fileType: 'model_contribution_raw_json',
            originalFileName: expectedFileNameAttempt0.replace(/(\.\w+)$/, '_raw.json')
        };
        const expectedRawPathAttempt0 = constructStoragePath(pathContextRawAttempt0);

        const contributionDataMock = { id: 'contrib-123', file_name: expectedFileNameAttempt0 };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              insert: { data: [contributionDataMock], error: null },
            },
          },
           storageMock: { 
            uploadResult: { data: { path: expectedPathAttempt0 }, error: null },
          },
        }
        beforeEach(config)

        let rawJsonUploadCalledCorrectly = false;
        const originalStorageFrom = setup.client.storage.from;
        setup.client.storage.from = (bucketName: string) => {
            const bucket = originalStorageFrom(bucketName);
            const originalUpload = bucket.upload;
            (bucket as any).upload = async (path: string, content: any, options: any) => {
                if (path === expectedRawPathAttempt0) {
                    rawJsonUploadCalledCorrectly = true;
                    return { data: { path: expectedRawPathAttempt0 }, error: null };
                }
                if (path === expectedPathAttempt0 && options.contentType !== 'application/json') {
                    return config.storageMock?.uploadResult ?? {data: {path}, error: null} ;
                }
                return originalUpload.call(bucket, path, content, options);
            };
            return bucket;
        };

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: 'model_contribution_main',
            projectId: 'project-uuid-123',
            sessionId: 'session-uuid-456',
            iteration: 2,
            stageSlug: '2_antithesis',
            modelSlug: 'claude-3-sonnet',
            originalFileName: 'claude_contribution.md',
          },
          contributionMetadata: {
            iterationNumber: 2,
            modelIdUsed: 'model-id-sonnet',
            modelNameDisplay: 'Claude 3 Sonnet',
            sessionId: 'session-uuid-456',
            stageSlug: '2_antithesis',
            rawJsonResponseContent: '{"raw":"mock raw json response"}',
          },
        }

        const { record, error } = await fileManager.uploadAndRegisterFile(context)

        assertEquals(error, null)
        assertExists(record)
        assertEquals(record?.id, 'contrib-123')
        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_contributions')
        
        assert(rawJsonUploadCalledCorrectly, "Raw JSON upload was not called with the correct path");

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert
        assertExists(insertSpy);
        const insertData = insertSpy.calls[0].args[0] as TablesInsert<'dialectic_contributions'>;
        assertEquals(insertData.session_id, 'session-uuid-456')
        assertEquals(insertData.stage, '2_antithesis')
        assertEquals(insertData.file_name, expectedFileNameAttempt0);
        assertEquals(insertData.storage_path, expectedPathAttempt0);
        assertEquals(insertData.raw_response_storage_path, expectedRawPathAttempt0);

      } finally {
        afterEach()
      }
    },
  )

  await t.step(
    'uploadAndRegisterFile for model_contribution_main should handle filename collision and retry',
    async () => {
      let uploadCallCount = 0;

      const baseRetryPathContext: Omit<PathContext, 'attemptCount' | 'fileType' | 'originalFileName'> = {
        projectId: 'project-retry-proj',
        sessionId: 'session-retry-sess',
        iteration: 1,
        stageSlug: '1_hypothesis',
        modelSlug: 'claude-opus',
      };

      const failedAttempt0PathContext: PathContext = {
        ...baseRetryPathContext,
        fileType: 'model_contribution_main',
        originalFileName: 'claude_contribution.md',
        attemptCount: 0,
      };

      const successAttempt1PathContext: PathContext = {
        ...baseRetryPathContext,
        fileType: 'model_contribution_main',
        originalFileName: 'claude_contribution.md',
        attemptCount: 1,
      };
      const expectedSuccessfulMainPathAttempt1 = constructStoragePath(successAttempt1PathContext);
      const expectedSuccessfulMainFileNameAttempt1 = expectedSuccessfulMainPathAttempt1.split('/').pop()!;

      const successRawJsonPathContextAttempt1: PathContext = {
        ...baseRetryPathContext,
        fileType: 'model_contribution_raw_json',
        originalFileName: expectedSuccessfulMainFileNameAttempt1.replace(/(\.\w+)$/, '_raw.json'),
        attemptCount: 1, 
      };
      const expectedSuccessfulRawJsonPathAttempt1 = constructStoragePath(successRawJsonPathContextAttempt1);

      let originalUpload: any;

      const mockUploadFn = async (path: string, _content: any, options: any) => {
        uploadCallCount++;
        if (uploadCallCount === 1 && path === constructStoragePath(failedAttempt0PathContext)) {
          return { error: { message: 'The resource already exists', status: 409 }, data: null };
        }
        if (uploadCallCount === 2 && path === expectedSuccessfulMainPathAttempt1) {
          return { error: null, data: { path: expectedSuccessfulMainPathAttempt1 } };
        }
        if (uploadCallCount === 3 && path === expectedSuccessfulRawJsonPathAttempt1 && options?.contentType === 'application/json') { 
            return { error: null, data: { path: expectedSuccessfulRawJsonPathAttempt1 } };
        }
        console.error(`Unexpected upload call: count ${uploadCallCount}, path ${path}, contentType ${options?.contentType}`);
        return { error: new Error('Unexpected upload call pattern in mockUploadFn'), data: null }; 
      };
      
      try {
        const contributionDataMock = { id: 'contrib-retry-123', file_name: expectedSuccessfulMainFileNameAttempt1 };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              insert: { data: [contributionDataMock], error: null },
            },
          },
        };
        beforeEach(config);

        const storageFromInstance = setup.client.storage.from('test-bucket');
        originalUpload = storageFromInstance.upload; 
        (storageFromInstance as any).upload = mockUploadFn;

        const context: UploadContext = {
          ...baseUploadContext,
          fileContent: '# Test Content',
          mimeType: 'text/markdown',
          pathContext: {
            fileType: 'model_contribution_main',
            projectId: 'project-retry-proj',
            sessionId: 'session-retry-sess',
            iteration: 1,
            stageSlug: '1_hypothesis',
            modelSlug: 'claude-opus',
            originalFileName: 'claude_contribution.md',
          },
          contributionMetadata: {
            iterationNumber: 1,
            modelIdUsed: 'model-id-opus',
            modelNameDisplay: 'Claude 3 Opus',
            sessionId: 'session-retry-sess',
            stageSlug: '1_hypothesis',
            rawJsonResponseContent: '{"raw":"data for retry"}',
          },
          userId: 'user-retry-user',
        };

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null, `Upload failed: ${error?.details}`);
        assertExists(record);
        assertEquals(record?.id, contributionDataMock.id);

        assertEquals(uploadCallCount, 3, "Storage upload should have been called 3 times (main attempt 0, main attempt 1, raw json attempt 1)");

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
        assertExists(insertSpy);
        const insertData = insertSpy.calls[0].args[0] as TablesInsert<'dialectic_contributions'>;

        assertEquals(insertData.file_name, expectedSuccessfulMainFileNameAttempt1);
        assertEquals(insertData.storage_path, expectedSuccessfulMainPathAttempt1);
        assertEquals(insertData.raw_response_storage_path, expectedSuccessfulRawJsonPathAttempt1);

      } finally {
        const storageFromInstance = setup.client.storage.from('test-bucket');
        if (originalUpload && (storageFromInstance as any).upload === mockUploadFn) { 
            (storageFromInstance as any).upload = originalUpload;
        }
        afterEach();
        uploadCallCount = 0; 
      }
    });

  await t.step(
    'uploadAndRegisterFile should register user_feedback correctly',
    async () => {
      try {
        const feedbackDataMock = { id: 'feedback-123', project_id: 'project-feedback-proj' };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_feedback: { 
              insert: { data: [feedbackDataMock], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: 'projects/project-feedback-proj/sessions/session-feedback-sess/iteration_3/3_synthesis/user_feedback_3_synthesis.md' }, error: null },
          }
        };
        beforeEach(config);

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: 'user_feedback',
            projectId: 'project-feedback-proj',
            sessionId: 'session-feedback-sess',
            iteration: 3,
            stageSlug: '3_synthesis',
            originalFileName: 'user_feedback_3_synthesis.md',
          },
          mimeType: 'text/markdown',
          fileContent: '# My Feedback Content',
          customMetadata: {
            feedbackType: 'positive_suggestion',
            resourceDescription: JSON.stringify({ rating: 5, comment: 'Excellent!' }),
          },
          userId: 'user-feedback-user-id',
        };
        
        const expectedPath = constructStoragePath(context.pathContext);
        config.storageMock!.uploadResult = {data: {path: expectedPath}, error: null}

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null, error?.message);
        assertExists(record);
        assertEquals(record?.id, feedbackDataMock.id);

        const fromSpyCalls = setup.spies.fromSpy.calls;
        const feedbackTableCall = fromSpyCalls.find(call => call.args[0] === 'dialectic_feedback');
        assertExists(feedbackTableCall, "'dialectic_feedback' table was not called for insert");

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_feedback')?.insert;
        assertExists(insertSpy, "Insert spy for 'dialectic_feedback' not found");
        const insertData = insertSpy.calls[0].args[0] as TablesInsert<'dialectic_feedback'>;

        assertEquals(insertData.project_id, context.pathContext.projectId);
        assertEquals(insertData.session_id, context.pathContext.sessionId);
        assertEquals(insertData.stage_slug, context.pathContext.stageSlug);
        assertEquals(insertData.iteration_number, context.pathContext.iteration);
        assertEquals(insertData.user_id, context.userId);
        assertEquals(insertData.feedback_type, context.customMetadata?.feedbackType);
        
        const actualResourceDesc = insertData.resource_description;
        const expectedResourceDesc = context.customMetadata!.resourceDescription!;
        if (typeof actualResourceDesc === 'string') {
            assertEquals(actualResourceDesc, expectedResourceDesc);
        } else {
            assert(false, `Expected resource_description to be a string, but got ${typeof actualResourceDesc}`);
        }
        
        const derivedFileName = expectedPath.split('/').pop();
        assertEquals(insertData.file_name, derivedFileName);
        assertEquals(insertData.storage_path, expectedPath);
        assertEquals(insertData.mime_type, context.mimeType);

      } finally {
        afterEach()
      }
    });

  await t.step(
    'uploadAndRegisterFile should handle storage upload errors',
    async () => {
      try {
        const config: MockSupabaseDataConfig = {
          storageMock: {
            uploadResult: { data: null, error: new Error('Upload failed') },
          },
        }
        beforeEach(config)
        const { record, error } = await fileManager.uploadAndRegisterFile(baseUploadContext)

        assertExists(error)
        assertEquals(record, null)
        assertEquals(error.message, 'Main content storage upload failed')
        assertEquals(error.details, 'Upload failed')
        assertEquals(setup.spies.fromSpy.calls.length, 0)
      } finally {
        afterEach()
      }
    },
  )

  await t.step(
    'uploadAndRegisterFile should handle DB insert errors and attempt cleanup',
    async () => {
      try {
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: { 
              insert: { data: null, error: new Error('DB insert failed') },
            },
          },
          storageMock: { 
            uploadResult: {data: { path: 'path/to/test.pdf'}, error: null}
          }
        }
        beforeEach(config)
        const removeSpy = setup.spies.storage.from('test-bucket').removeSpy
        assertExists(removeSpy);

        const { record, error } = await fileManager.uploadAndRegisterFile(baseUploadContext)

        assertExists(error)
        assertEquals(record, null)
        assertEquals(error.message, 'Database insert failed')
        assertEquals(error.details, 'DB insert failed')
        assertEquals(removeSpy.calls.length, 1)
        assertExists(removeSpy.calls[0].args[0]);
        assertEquals(removeSpy.calls[0].args[0][0], constructStoragePath(baseUploadContext.pathContext));

      } finally {
        afterEach()
      }
    },
  )
  
  await t.step('getFileSignedUrl should retrieve a URL successfully', async () => {
    try {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            select: { data: [{ storage_path: 'mock/path.md' }], error: null },
          },
        },
        storageMock: {
          createSignedUrlResult: {
            data: { signedUrl: 'http://mock.url/signed' },
            error: null,
          },
        },
      }
      beforeEach(config)
      const { signedUrl, error } = await fileManager.getFileSignedUrl(
        'file-id-123',
        'dialectic_project_resources',
      )
      assertExists(signedUrl)
      assertEquals(error, null)
      assertEquals(signedUrl, 'http://mock.url/signed')
    } finally {
      afterEach()
    }
  })
  
  await t.step('getFileSignedUrl should handle errors when file not found', async () => {
    try {
       const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: { 
            select: { data: null, error: new Error('Not found') }, 
          },
        },
      }
      beforeEach(config)
      const { signedUrl, error } = await fileManager.getFileSignedUrl(
        'non-existent-file-id',
        'dialectic_project_resources',
      )
      assertEquals(signedUrl, null)
      assertExists(error)
      assertEquals(error.message, 'File record not found.')
    } finally {
      afterEach()
    }
  })
  
  await t.step('getFileSignedUrl should handle errors from createSignedUrl', async () => {
    try {
      const config: MockSupabaseDataConfig = {
         genericMockResults: {
          dialectic_project_resources: { 
            select: { data: [{ storage_path: 'mock/path.to.file' }], error: null }, 
          },
        },
        storageMock: {
          createSignedUrlResult: { 
            data: null,
            error: new Error('Storage permission denied'),
          },
        },
      }
      beforeEach(config)
      const { signedUrl, error } = await fileManager.getFileSignedUrl(
        'file-id-xyz',
        'dialectic_project_resources',
      )
      assertEquals(signedUrl, null)
      assertExists(error)
      assertEquals(error.message, 'Storage permission denied')
    } finally {
      afterEach()
    }
  })

  await t.step('getFileSignedUrl should retrieve a URL for dialectic_feedback successfully', async () => {
    try {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_feedback: {
            select: { data: [{ storage_path: 'mock/feedback/path.txt' }], error: null },
          },
        },
        storageMock: {
          createSignedUrlResult: {
            data: { signedUrl: 'http://mock.url/signed-feedback' },
            error: null,
          },
        },
      }
      beforeEach(config)
      const { signedUrl, error } = await fileManager.getFileSignedUrl(
        'feedback-file-id-456',
        'dialectic_feedback',
      )
      assertExists(signedUrl)
      assertEquals(error, null)
      assertEquals(signedUrl, 'http://mock.url/signed-feedback')

      const selectSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_feedback')?.select
      assertExists(selectSpy, "Select spy for dialectic_feedback should exist");
      assertEquals(selectSpy.calls.length, 1, "Select should have been called once on dialectic_feedback");
      assertEquals(selectSpy.calls[0].args[0], 'storage_path', "Should select storage_path");

      const eqSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_feedback')?.eq;
      assertExists(eqSpy, "eq spy for dialectic_feedback should exist");
      assertEquals(eqSpy.calls[0].args[0], 'id');
      assertEquals(eqSpy.calls[0].args[1], 'feedback-file-id-456');

      const createSignedUrlSpy = setup.spies.storage.from('test-bucket').createSignedUrlSpy;
      assertExists(createSignedUrlSpy, "createSignedUrl spy should exist");
      assertEquals(createSignedUrlSpy.calls[0].args[0], 'mock/feedback/path.txt');

    } finally {
      afterEach()
    }
  })

});