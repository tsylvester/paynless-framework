import {
  assertEquals,
  assertExists,
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
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../types_db.ts'

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

  await t.step('constructor should throw if bucket environment variable is not set',
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

  await t.step('uploadAndRegisterFile should use bucket from environment variable',
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

  await t.step('uploadAndRegisterFile should register a project resource correctly',
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

  await t.step('uploadAndRegisterFile should register a project export zip at project root',
    async () => {
      try {
        const projectId = 'project-uuid-zip';
        const originalZipName = 'My Export.zip';
        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: FileType.ProjectExportZip,
            projectId,
            originalFileName: originalZipName,
          },
          fileContent: 'zip-bytes',
          mimeType: 'application/zip',
          sizeBytes: 45678,
          description: 'Project export archive',
        };

        const expectedPathParts = constructStoragePath(context.pathContext);
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              insert: { data: [{ id: 'zip-res-123' }], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null },
          },
        };
        beforeEach(config);

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null);
        assertExists(record);
        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_project_resources');

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.insert;
        assertExists(insertSpy);
        const insertData = insertSpy.calls[0].args[0];
        assertEquals(insertData.project_id, projectId);
        assertEquals(insertData.storage_path, expectedPathParts.storagePath);
        assertEquals(insertData.file_name, expectedPathParts.fileName);
        assertEquals(insertData.mime_type, 'application/zip');

        const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;
        assertExists(uploadSpy);
        assertEquals(uploadSpy.calls[0].args[0], expectedFullPath);
      } finally {
        afterEach();
      }
    },
  );

  await t.step('uploadAndRegisterFile should register a contribution correctly (no collision)',
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

  await t.step('uploadAndRegisterFile should place intermediate files in a _work directory',
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
          pairedModelSlug: 'model-b',
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

  await t.step('uploadAndRegisterFile for model_contribution_main should handle filename collision and retry',
    async () => {
      try {
        const baseRetryPathContext: PathContext = {
          fileType: FileType.ModelContributionMain,
          projectId: 'project-retry-proj',
          sessionId: 'session-retry-sess',
          iteration: 1,
          // stageSlug will be mapped by mapStageSlugToDirName, ensure consistency
          stageSlug: 'thesis', // Raw slug, path_constructor will map it to '1_thesis'
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
            stageSlug: 'thesis',
            rawJsonResponseContent: '{"raw":"mock for retry"}',
            seedPromptStoragePath: 'projects/project-retry-proj/sessions/session-retry-sess/iteration_1/thesis/seed_prompt.md',
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

  await t.step('uploadAndRegisterFile should register user_feedback correctly',
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

  await t.step('uploadAndRegisterFile should handle storage upload errors',
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

  await t.step('uploadAndRegisterFile should handle DB insert errors and attempt cleanup',
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

  await t.step('uploadAndRegisterFile should reject continuation without target_contribution_id and cleanup uploaded files',
    async () => {
      try {
        const pathContext: PathContext = {
          fileType: FileType.ModelContributionMain,
          projectId: 'project-missing-link',
          sessionId: 'session-missing-link',
          iteration: 1,
          stageSlug: 'thesis',
          modelSlug: 'test-model',
          attemptCount: 0,
        };
        const expectedPathParts = constructStoragePath(pathContext);
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            // Intentionally do NOT configure dialectic_contributions.insert; we expect no insert
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null },
            listResult: { data: [{ 
              name: expectedPathParts.fileName, 
              id: 'file-id-for-cleanup',
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              last_accessed_at: new Date().toISOString(),
              metadata: { 'e-tag': 'abc'} 
            }], error: null },
            removeResult: { data: [{ name: 'test-bucket' }], error: null },
          },
        };
        beforeEach(config);

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext,
          mimeType: 'text/markdown',
          fileContent: '# continuation without link',
          contributionMetadata: {
            // Missing target_contribution_id on purpose
            isContinuation: true,
            iterationNumber: 1,
            modelIdUsed: 'model-id-test',
            modelNameDisplay: 'Test Model',
            sessionId: 'session-missing-link',
            stageSlug: 'thesis',
            rawJsonResponseContent: '{}',
            seedPromptStoragePath: `${expectedPathParts.storagePath}/seed.md`,
          },
          userId: 'user-missing-link',
        };

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        // Expected: rejection with error and no DB insert
        assertExists(error, 'Expected an error for missing target_contribution_id');
        assertEquals(record, null);

        // Ensure no insert to dialectic_contributions occurred
        const fromCalls = setup.spies.fromSpy.calls.map(c => c.args[0]);
        assert(!fromCalls.includes('dialectic_contributions'), 'Should not attempt DB insert when target_contribution_id is missing');

        // Ensure cleanup removal was attempted (we remove known paths directly)
        const removeSpy = setup.spies.storage.from('test-bucket').removeSpy;
        assertExists(removeSpy, 'Expected storage.remove to be called for cleanup');
        const removedArgs = removeSpy.calls.map(c => c.args[0]).flat();
        assert(Array.isArray(removedArgs), 'Expected remove to be called with path arrays');

        // Build expected continuation (_work) path exactly as path_constructor would
        const expectedWorkParts = constructStoragePath({
          ...pathContext,
          isContinuation: true,
          turnIndex: 0,
          // mirror file manager: modelSlug comes from modelNameDisplay and will be normalized by path constructor
          modelSlug: 'Test Model',
          stageSlug: 'thesis',
          attemptCount: 0,
        });
        const expectedWorkFullPath = `${expectedWorkParts.storagePath}/${expectedWorkParts.fileName}`;

        assert(
          removedArgs.includes(expectedWorkFullPath),
          `Expected continuation file to be removed during cleanup: ${expectedWorkFullPath}`,
        );

      } finally {
        afterEach();
      }
    },
  )
  
  await t.step('uploadAndRegisterFile for a continuation should save the file as an atomic chunk in a _work directory', async () => {
    try {
      // 1. Setup: Define the "original" file that is being continued.
      const anchorRecord = {
        id: 'anchor-contrib-id-123',
        storage_bucket: 'test-bucket',
        storage_path: 'projects/project-chunk-test/sessions/session-chunk-test/iteration_1/1_thesis',
        file_name: 'claude-opus_1_thesis_20250101T000000Z.md',
        mime_type: 'text/markdown',
        edit_version: 1,
        document_relationships: { "thesis": "self-id" },
      };

      // 2. Setup: Create the context for the fileManager call
      const continuationContext: UploadContext = {
        ...baseUploadContext,
        fileContent: 'This is the new content.',
        pathContext: { // This context is for metadata, the path logic is what we test
          fileType: FileType.ModelContributionMain,
          projectId: 'project-chunk-test',
          sessionId: 'session-chunk-test',
          stageSlug: '1_thesis',
          iteration: 1, // This was the missing piece of context
        },
        contributionMetadata: {
          target_contribution_id: 'anchor-contrib-id-123', // This triggers the continuation logic
          iterationNumber: 1,
          modelIdUsed: 'model-id-opus',
          modelNameDisplay: 'Claude Opus',
          sessionId: 'session-chunk-test',
          stageSlug: '1_thesis',
          contributionType: 'thesis',
          rawJsonResponseContent: '{"content": "This is the new content."}',
          seedPromptStoragePath: 'projects/project-chunk-test/sessions/session-chunk-test/iteration_1/1_thesis/claude-opus_1_thesis_20250101T000000Z.md',
          // New metadata for chunking
          isContinuation: true,
          turnIndex: 1,
        },
        userId: 'user-chunk-test-id'
      };

      // 3. Setup: Define the expected path for the NEW chunk file.
      // This is what we WANT, but the current code doesn't produce it.
      const expectedChunkPathContext: PathContext = {
        fileType: FileType.ModelContributionMain,
        projectId: 'project-chunk-test',
        sessionId: 'session-chunk-test',
        iteration: 1,
        stageSlug: '1_thesis',
        modelSlug: continuationContext.contributionMetadata?.modelNameDisplay, // Align with implementation
        attemptCount: 0,
        isContinuation: continuationContext.contributionMetadata?.isContinuation,
        turnIndex: continuationContext.contributionMetadata?.turnIndex,
      };
      // The path_constructor does not yet support these new flags, but we write the test
      // as if it does, to prove that the overall system fails. The expected path
      // should contain `_work` and the `_continuation_1` suffix.
      const expectedPathParts = constructStoragePath({
        ...expectedChunkPathContext,
        contributionType: continuationContext.contributionMetadata?.contributionType,
      });
      const expectedChunkFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            // Mock the SELECT call that finds the anchor record
            select: { data: [anchorRecord], error: null },
            // Mock the INSERT call for the new contribution record
            insert: { data: [{ id: 'new-contrib-456' }], error: null },
          },
        },
        storageMock: {
          // The upload should succeed, we are testing the PATH it uses.
          uploadResult: { data: { path: 'any-path' }, error: null },
        }
      };
      beforeEach(config);

      // 4. Execute: Call the function
      await fileManager.uploadAndRegisterFile(continuationContext);

      // 5. Assert: Check the path used for the upload
      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;
      assertExists(uploadSpy, "Upload spy should exist");
      
      const actualUploadPath = uploadSpy.calls[0].args[0];

      // This assertion is designed to FAIL.
      // We expect a new path with `_work` and `_continuation_1`, but the current code
      // will use the old path: `projects/.../claude-opus_....md`
      assert(actualUploadPath.includes('/_work/'), "The upload path must be in a '_work' directory for chunks.");
      assert(actualUploadPath.includes('_continuation_1'), "The upload path must include the continuation turn index.");
      assertEquals(actualUploadPath, expectedChunkFullPath, "The upload path does not match the expected atomic chunk path.");

      // parent latest edit should be cleared for continuation
      const updateHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
      assertExists(updateHistory, "Expected to track updates to dialectic_contributions");
      assert(updateHistory!.callCount >= 1, 'Expected an update to clear prior latest edit on parent contribution');
      const updatedLatestFalse = updateHistory!.callsArgs.some(args => {
        const updatePayload = args[0] as Record<string, unknown>;
        return updatePayload && (updatePayload as { is_latest_edit?: boolean }).is_latest_edit === false;
      });
      assert(updatedLatestFalse, 'Expected an update setting is_latest_edit=false for the parent contribution');

      const eqHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'eq');
      assertExists(eqHistory, 'Expected to find an eq filter call to target the parent ID');
      const eqHasParentId = eqHistory!.callsArgs.some(args => args[0] === 'id' && args[1] === 'anchor-contrib-id-123');
      assert(eqHasParentId, 'Expected eq("id", parentId) for clearing parent latest edit');

    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile should clear parent latest-edit when saving final continuation chunk (isContinuation=false)', async () => {
    try {
      const parentId = 'parent-final-0001';

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [{ id: 'final-cont-0002' }], error: null },
          },
        },
      };
      beforeEach(config);

      const context: UploadContext = {
        ...baseUploadContext,
        fileContent: 'final continuation content',
        pathContext: {
          fileType: FileType.ModelContributionMain,
          projectId: 'proj-final-ctn',
          sessionId: 'sess-final-ctn',
          iteration: 1,
          stageSlug: 'thesis',
          modelSlug: 'final-model',
          attemptCount: 0,
        },
        mimeType: 'text/markdown',
        contributionMetadata: {
          // Critical: continuation parent reference present, but isContinuation is false/omitted
          target_contribution_id: parentId,
          iterationNumber: 1,
          modelIdUsed: 'model-id-final',
          modelNameDisplay: 'Final Model',
          sessionId: 'sess-final-ctn',
          stageSlug: 'thesis',
          contributionType: 'thesis',
          rawJsonResponseContent: '{}',
          seedPromptStoragePath: 'projects/proj-final-ctn/sessions/sess-final-ctn/iteration_1/thesis/seed.md',
          // Explicitly ensure isContinuation is not true
          isContinuation: false,
        },
        userId: 'user-final-ctn',
      };

      await fileManager.uploadAndRegisterFile(context);

      // Assert: parent latest edit should be cleared even when isContinuation is false
      const updateHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
      assertExists(updateHistory, 'Expected an update on dialectic_contributions to clear parent latest-edit');
      const clearedLatest = updateHistory!.callsArgs.some((args) => {
        const payload = args[0] as Record<string, unknown>;
        return payload && (payload as { is_latest_edit?: boolean }).is_latest_edit === false;
      });
      assert(clearedLatest, 'Expected is_latest_edit=false update for parent contribution');

      const eqHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'eq');
      assertExists(eqHistory, 'Expected an eq filter to target the parent by id');
      const targetedParent = eqHistory!.callsArgs.some((args) => args[0] === 'id' && args[1] === parentId);
      assert(targetedParent, 'Expected eq("id", parentId) to scope the latest-edit clearing to the parent');

    } finally {
      afterEach();
    }
  });
});