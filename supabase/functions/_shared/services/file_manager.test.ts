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
  type IMockStorageFileOptions,
} from '../supabase.mock.ts'
import { FileManagerService } from './file_manager.ts'
import { UploadContext, PathContext, FileType } from '../types/file_manager.types.ts'
import { constructStoragePath } from '../utils/path_constructor.ts'
import type { TablesInsert, Json } from '../../types_db.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types_db.ts'

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
    fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>)
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
          async () => new FileManagerService(mockSupabase.client as unknown as SupabaseClient<Database>),
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
        const resourceFileName = 'test.pdf';
        const resourceContextPath = 'projects/project-uuid-123/general_resource'; // As per constructStoragePath logic

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              insert: { data: [{ 
                id: 'resource-123', 
                project_id: 'project-uuid-123', 
                user_id: 'user-uuid-789', 
                file_name: resourceFileName, 
                mime_type: 'application/pdf', 
                size_bytes: 12345, 
                storage_bucket: 'test-bucket', 
                storage_path: resourceContextPath, // This is the directory path
                resource_description: 'A test PDF file.' 
              }], error: null },
            },
          },
        }
        beforeEach(config)

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: FileType.GeneralResource,
            projectId: 'project-uuid-123',
            originalFileName: resourceFileName,
            // sessionId and iteration are not strictly used by 'general_resource' path construction 
            // but are part of baseUploadContext.pathContext, let's keep them for consistency of the mock context
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
        const insertData = insertSpy.calls[0].args[0];
        assertEquals(insertData.project_id, 'project-uuid-123')
        
        // constructStoragePath now returns an object
        const expectedPathParts = constructStoragePath(context.pathContext);
        assertEquals(insertData.storage_path, expectedPathParts.storagePath);
        assertEquals(insertData.file_name, expectedPathParts.fileName);
        assertEquals(insertData.resource_description, JSON.stringify({ type: context.pathContext.fileType, originalDescription: context.description }));
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
            fileType: FileType.ModelContributionMain,
            projectId: 'project-uuid-123',
            sessionId: 'session-uuid-456',
            iteration: 2,
            stageSlug: '2_antithesis',
            modelSlug: 'claude-3-sonnet',
            originalFileName: 'claude_contribution.md', // This might not be directly used by model_contribution_main path construction
            attemptCount: 0
        };
        const expectedPathPartsAttempt0 = constructStoragePath(pathContextAttempt0);
        const expectedFullUploadPathAttempt0 = `${expectedPathPartsAttempt0.storagePath}/${expectedPathPartsAttempt0.fileName}`;

        const pathContextRawAttempt0: PathContext = {
            ...pathContextAttempt0,
            fileType: FileType.ModelContributionRawJson,
            // originalFileName for raw is derived inside file_manager.ts from the main contribution's finalFileName
            // So, for constructStoragePath here, we might need to simulate that derivation if we want a precise match
            // or accept that this specific call to constructStoragePath is for testing its own logic primarily.
            originalFileName: expectedPathPartsAttempt0.fileName.replace(/(\.\w+)$/, '_raw.json') 
        };
        const expectedRawPathPartsAttempt0 = constructStoragePath(pathContextRawAttempt0);
        const expectedFullRawUploadPathAttempt0 = `${expectedRawPathPartsAttempt0.storagePath}/${expectedRawPathPartsAttempt0.fileName}`;

        const contributionDataMock = { id: 'contrib-123', file_name: expectedPathPartsAttempt0.fileName };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              insert: { data: [contributionDataMock], error: null },
            },
          },
           storageMock: { 
            uploadResult: { data: { path: expectedFullUploadPathAttempt0 }, error: null }, // Mock uses full path
          },
        }
        beforeEach(config)

        let rawJsonUploadCalledCorrectly = false;
        const originalStorageFrom = setup.client.storage.from;
        setup.client.storage.from = (bucketName: string) => {
            const bucket = originalStorageFrom(bucketName);
            const originalUpload = bucket.upload;
            bucket.upload = async (path: string, content: unknown, options?: IMockStorageFileOptions) => {
                if (path === expectedFullRawUploadPathAttempt0) {
                    rawJsonUploadCalledCorrectly = true;
                    return { data: { path: expectedFullRawUploadPathAttempt0 }, error: null };
                }
                if (path === expectedFullUploadPathAttempt0 && options?.contentType !== 'application/json') {
                    return { data: { path }, error: null };
                }
                return originalUpload.call(bucket, path, content, options);
            };
            return bucket;
        };

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: FileType.ModelContributionMain,
            projectId: 'project-uuid-123',
            sessionId: 'session-uuid-456',
            iteration: 2,
            stageSlug: '2_antithesis',
            modelSlug: 'claude-3-sonnet',
            originalFileName: 'claude_contribution.md', // main context still has this
          },
          contributionMetadata: {
            iterationNumber: 2,
            modelIdUsed: 'model-id-sonnet',
            modelNameDisplay: 'Claude 3 Sonnet',
            sessionId: 'session-uuid-456',
            stageSlug: '2_antithesis',
            rawJsonResponseContent: '{"raw":"mock raw json response"}',
            seedPromptStoragePath: 'projects/project-uuid-123/sessions/session-uuid-456/iteration_2/2_antithesis/seed_prompt.md',
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
        const insertData = insertSpy.calls[0].args[0];
        assertEquals(insertData.session_id, 'session-uuid-456')
        assertEquals(insertData.stage, '2_antithesis')
        assertEquals(insertData.file_name, expectedPathPartsAttempt0.fileName);
        assertEquals(insertData.storage_path, expectedPathPartsAttempt0.storagePath);
        // raw_response_storage_path in the DB stores the full path to the raw JSON file
        assertEquals(insertData.raw_response_storage_path, expectedFullRawUploadPathAttempt0);

      } finally {
        afterEach()
      }
    },
  )

  await t.step(
    'uploadAndRegisterFile should place intermediate files in a _work directory',
    async () => {
      try {
        const pathContext: PathContext = {
          fileType: FileType.PairwiseSynthesisChunk,
          projectId: 'project-intermediate',
          sessionId: 'session-intermediate',
          iteration: 1,
          stageSlug: 'synthesis',
          modelSlug: 'test-model',
          sourceModelSlugs: ['model-a', 'model-b'],
          sourceAnchorType: 'thesis',
          sourceAnchorModelSlug: 'model-a',
          attemptCount: 0,
        };
        const expectedPathParts = constructStoragePath(pathContext);
        const contributionDataMock = { id: 'contrib-intermediate-123', file_name: expectedPathParts.fileName };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              insert: { data: [contributionDataMock], error: null },
            },
          },
        };
        beforeEach(config);

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext,
          contributionMetadata: {
            iterationNumber: 1,
            modelIdUsed: 'model-id-123',
            modelNameDisplay: 'Test Model',
            sessionId: 'session-intermediate',
            stageSlug: 'synthesis',
            rawJsonResponseContent: '{}',
            seedPromptStoragePath: 'path/to/seed',
            document_relationships: { derived_from: ['id-a', 'id-b'] },
          },
        };
        
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        await fileManager.uploadAndRegisterFile(context);

        const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;
        assertExists(uploadSpy, "Upload spy should exist");
        assertEquals(uploadSpy.calls[0].args[0], expectedFullPath, "File was not uploaded to the expected _work directory path.");
        assert(expectedFullPath.includes('/_work/'), "The final path should contain a '/_work/' directory.");


      } finally {
        afterEach();
      }
    },
  );

  await t.step(
    'uploadAndRegisterFile for model_contribution_main should handle filename collision and retry',
    async () => {
      try {
        const baseRetryPathContext: PathContext = {
          fileType: FileType.ModelContributionMain,
          projectId: 'project-retry-proj',
          sessionId: 'session-retry-sess',
          iteration: 1,
          // stageSlug will be mapped by mapStageSlugToDirName, ensure consistency
          stageSlug: 'hypothesis', // Raw slug, path_constructor will map it to '1_hypothesis'
          modelSlug: 'claude-opus',
          originalFileName: 'opus_contribution.md', // Used by file_manager for raw JSON derivation
        };

        const failedAttempt0PathContext: PathContext = {
          ...baseRetryPathContext,
          attemptCount: 0,
        };
        const expectedFailedPathParts0 = constructStoragePath(failedAttempt0PathContext);
        const expectedFullFailedPath0 = `${expectedFailedPathParts0.storagePath}/${expectedFailedPathParts0.fileName}`;

        const successAttempt1PathContext: PathContext = {
          ...baseRetryPathContext,
          attemptCount: 1,
        };
        const expectedSuccessfulPathParts1 = constructStoragePath(successAttempt1PathContext);
        const expectedFullSuccessfulMainPath1 = `${expectedSuccessfulPathParts1.storagePath}/${expectedSuccessfulPathParts1.fileName}`;
        const expectedSuccessfulMainFileName1 = expectedSuccessfulPathParts1.fileName;

        // rawJsonResponseContent uses the *successful* main file's attemptCount
        const successRawJsonPathContextAttempt1: PathContext = {
          ...baseRetryPathContext, // Use base, then override attemptCount and fileType
          attemptCount: 1, // Matches successful main file
          fileType: FileType.ModelContributionRawJson,
          // originalFileName for raw is derived inside file_manager.ts from the main contribution's *final* (successful) fileName
          // So, for constructStoragePath here, we use the fileName from the successful main attempt (1)
          originalFileName: expectedSuccessfulMainFileName1.replace(/(\.\w+)$/, '_raw.json'),
        };
        const expectedRawJsonPathParts1 = constructStoragePath(successRawJsonPathContextAttempt1);
        const expectedFullSuccessfulRawJsonPath1 = `${expectedRawJsonPathParts1.storagePath}/${expectedRawJsonPathParts1.fileName}`;
        
        const contributionDataMock = { id: 'contrib-retry-123', file_name: expectedSuccessfulMainFileName1 }; 
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              insert: { data: [contributionDataMock], error: null },
            },
          },
        };
        beforeEach(config);

        let uploadCallCount = 0;
        const mockUploadFn = async (path: string, _content: any, options: any) => {
          uploadCallCount++;
          if (uploadCallCount === 1 && path === expectedFullFailedPath0) {
            return { error: { message: 'The resource already exists', name: 'StorageConflict', status: 409 }, data: null };
          }
          if (uploadCallCount === 2 && path === expectedFullSuccessfulMainPath1) {
            return { error: null, data: { path: expectedFullSuccessfulMainPath1 } }; 
          }
          if (uploadCallCount === 3 && path === expectedFullSuccessfulRawJsonPath1 && options?.contentType === 'application/json') { 
            return { error: null, data: { path: expectedFullSuccessfulRawJsonPath1 } };
          }
          console.error(`mockUploadFn: Unexpected upload call: count ${uploadCallCount}, path ${path}, contentType ${options?.contentType}`);
          return { error: {message: "Unexpected upload call pattern in mockUploadFn", name: "TestError"}, data: null };
        };

        const originalStorageFrom = setup.client.storage.from;
        setup.client.storage.from = (bucketName: string) => {
          const bucket = originalStorageFrom(bucketName);
          bucket.upload = mockUploadFn; 
          return bucket;
        };

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: baseRetryPathContext, // Use the base for the initial call, attemptCount is handled internally by FileManagerService
          mimeType: 'text/markdown',
          contributionMetadata: {
            iterationNumber: 1,
            modelIdUsed: 'model-id-opus',
            modelNameDisplay: 'Claude Opus',
            sessionId: 'session-retry-sess',
            stageSlug: 'hypothesis',
            rawJsonResponseContent: '{"raw":"mock for retry"}',
            seedPromptStoragePath: 'projects/project-retry-proj/sessions/session-retry-sess/iteration_1/hypothesis/seed_prompt.md',
          },
        };

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null, `Upload failed: ${error?.message}, Details: ${error?.details}`); 
        assertExists(record);
        assertEquals(record?.id, 'contrib-retry-123');
        assertEquals(uploadCallCount, 3, "Expected 3 upload attempts (1 fail, 1 main success, 1 raw success)");

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
        assertExists(insertSpy);
        const insertData = insertSpy.calls[0].args[0];
        assertEquals(insertData.file_name, expectedSuccessfulMainFileName1);
        assertEquals(insertData.storage_path, expectedSuccessfulPathParts1.storagePath); 
        assertEquals(insertData.raw_response_storage_path, expectedFullSuccessfulRawJsonPath1);

      } finally {
        afterEach();
      }
    },
  );

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
            fileType: FileType.UserFeedback,
            projectId: 'project-feedback-proj',
            sessionId: 'session-feedback-sess',
            iteration: 3,
            stageSlug: '3_synthesis',
            originalFileName: 'user_feedback_3_synthesis.md',
          },
          mimeType: 'text/markdown',
          fileContent: '# My Feedback Content',
          userId: 'user-feedback-user-id',
          feedbackTypeForDb: 'some-feedback-type',
          resourceDescriptionForDb: { description: "A test feedback resource" }
        };
        
        const expectedPath = constructStoragePath(context.pathContext);
        config.storageMock!.uploadResult = {data: {path: expectedPath.storagePath}, error: null}

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null, error?.message);
        assertExists(record);
        assertEquals(record?.id, feedbackDataMock.id);

        const fromSpyCalls = setup.spies.fromSpy.calls;
        const feedbackTableCall = fromSpyCalls.find(call => call.args[0] === 'dialectic_feedback');
        assertExists(feedbackTableCall, "'dialectic_feedback' table was not called for insert");

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_feedback')?.insert;
        assertExists(insertSpy, "Insert spy for 'dialectic_feedback' not found");
        const insertData = insertSpy.calls[0].args[0];

        assertEquals(insertData.project_id, context.pathContext.projectId);
        assertEquals(insertData.session_id, context.pathContext.sessionId);
        assertEquals(insertData.stage_slug, context.pathContext.stageSlug);
        assertEquals(insertData.iteration_number, context.pathContext.iteration);
        assertEquals(insertData.user_id, context.userId);
        assertEquals(insertData.feedback_type, context.feedbackTypeForDb);
        
        const expectedResourceDesc: Json = context.resourceDescriptionForDb!;
        assertEquals(insertData.resource_description, expectedResourceDesc);
        
        const derivedFileName = expectedPath.fileName;
        assertEquals(insertData.file_name, derivedFileName);
        assertEquals(insertData.storage_path, expectedPath.storagePath);
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
        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: { // Using simpler initial_user_prompt for this DB error test
            fileType: FileType.InitialUserPrompt,
            projectId: 'project-db-error',
            originalFileName: 'db_error_test.txt',
          },
          description: "DB error test",
        };

        const expectedPathParts = constructStoragePath(context.pathContext);
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: { // Simulating this table for initial_user_prompt
              insert: { data: null, error: { message: 'Simulated DB insert error', name: 'XXYYZ' } },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null }, // Upload succeeds
            listResult: { data: [{ 
              name: expectedPathParts.fileName, 
              id: 'file-id-for-cleanup',
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              last_accessed_at: new Date().toISOString(),
              metadata: { 'e-tag': 'abc'} 
            }], error: null }, // Mock the list call
            removeResult: { data: [{ name: 'test-bucket' }], error: null }, // Mock the subsequent remove call
          },
        };
        beforeEach(config);

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertExists(error);
        assertEquals(error?.message, 'Database registration failed after successful upload.');
        assertEquals(error?.details, 'Simulated DB insert error');
        assertEquals(record, null);

        // Check that storage.list was called for cleanup
        const listSpy = setup.spies.storage.from('test-bucket').listSpy;
        assertExists(listSpy);
        assertEquals(listSpy.calls[0].args[0], expectedPathParts.storagePath);
        
        // Check that storage.remove was called with the correct file path
        const removeSpy = setup.spies.storage.from('test-bucket').removeSpy;
        assertExists(removeSpy);
        assertEquals(removeSpy.calls[0].args[0], [expectedFullPath]);

      } finally {
        afterEach();
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