import {
  assertEquals,
  assertExists,
  assertRejects,
  assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts'
import { stub, Stub, spy } from 'https://deno.land/std@0.190.0/testing/mock.ts'
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts'
import {
  createMockSupabaseClient,
  MockSupabaseClientSetup,
  MockSupabaseDataConfig,
  IMockStorageFileOptions,
} from '../supabase.mock.ts'
import { FileManagerService } from './file_manager.ts'
import {
  UploadContext,
  ModelContributionUploadContext,
  ResourceUploadContext,
  FileType,
  ContributionMetadata,
  PathContext,
  UserFeedbackUploadContext,
} from '../types/file_manager.types.ts'
import { constructStoragePath } from '../utils/path_constructor.ts'
import { 
  SupabaseClient, 
  PostgrestError 
} from '@supabase/supabase-js'
import { 
  Database, 
  Json 
} from '../../types_db.ts'
import { isRecord, isPostgrestError } from '../utils/type_guards.ts'
import { 
  isStorageError, 
  isServiceError 
} from '../utils/type-guards/type_guards.file_manager.ts'
import { MockLogger } from '../logger.mock.ts'

Deno.test('FileManagerService', async (t) => {
  let setup: MockSupabaseClientSetup
  let fileManager: FileManagerService
  let envStub: any
  let originalEnvGet: typeof Deno.env.get
  let logger: MockLogger

  const beforeEach = (config: MockSupabaseDataConfig = {}) => {
    originalEnvGet = Deno.env.get.bind(Deno.env);
    envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
      if (key === 'SB_CONTENT_STORAGE_BUCKET') {
        return 'test-bucket'
      }
      return originalEnvGet(key)
    })

    setup = createMockSupabaseClient('test-user-id', config)
    logger = new MockLogger()
    fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, { constructStoragePath, logger })
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
          async () => new FileManagerService(mockSupabase.client as unknown as SupabaseClient<Database>, { constructStoragePath, logger }),
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

  await t.step('uploadAndRegisterFile returns structured error and cleans up on DB insert failure (project_export_zip)',
    async () => {
      try {
        const projectId = 'project-uuid-err';
        const originalZipName = 'Fail Export.zip';
        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: FileType.ProjectExportZip,
            projectId,
            originalFileName: originalZipName,
          },
          fileContent: 'zip-bytes',
          mimeType: 'application/zip',
          sizeBytes: 9999,
          description: 'Project export archive (should fail insert)',
        };

        const expectedPathParts = constructStoragePath(context.pathContext);
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        const postgrestStyleError: PostgrestError = { name: 'PostgrestError', message: 'insert failed', code: 'PGRST116', details: 'constraint violation on resource_description', hint: '' };

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: null, error: postgrestStyleError },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null },
            removeResult: { data: [], error: null },
          },
        };
        beforeEach(config);
        const storageBucket = setup.spies.storage.from('test-bucket');
        const listSpy = storageBucket.listSpy;
        const removeSpy = storageBucket.removeSpy;

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(record, null);
        assertExists(error);
        assertEquals(error?.message, 'Database registration failed after successful upload.');
        if (isPostgrestError(error)) {
          assertExists(error.details, 'PostgrestError should have details');
          assert(typeof error.details === 'string', 'error.details should be a string');
          const detailsText = error.details;
          assert(detailsText.includes('PGRST116') || detailsText.includes('constraint'));
        } else if (isServiceError(error) && error.details && typeof error.details === 'string') {
          const detailsText = error.details;
          assert(detailsText.includes('PGRST116') || detailsText.includes('constraint'));
        }

        // Cleanup must target only the specific uploaded file; must not use list()
        assert(listSpy.calls.length === 0, 'Cleanup must not call storage.list');
        assertExists(removeSpy, 'Remove spy should exist');
        assertEquals(removeSpy.calls.length, 1, 'Remove should have been called exactly once');
        assertEquals(removeSpy.calls[0].args[0], [expectedFullPath], 'Remove must be called with only the uploaded file path');
      } finally {
        afterEach();
      }
    },
  )

  await t.step('uploadAndRegisterFile should use bucket from environment variable',
    async () => {
      try {
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: [{ id: 'resource-123' }], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: 'test/path' }, error: null },
          },
        };
        beforeEach(config);
        // Initialize spy before the call so it tracks the upload
        const storageBucket = setup.spies.storage.from('test-bucket');
        const uploadSpy = storageBucket.uploadSpy;
        await fileManager.uploadAndRegisterFile(baseUploadContext)
        assertExists(uploadSpy.calls[0])
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
              upsert: { data: [{ 
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
        const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert
        assertExists(upsertSpy);
        const upsertArgs = upsertSpy.calls[0].args;
        const insertData = upsertArgs[0];
        assertEquals(insertData.project_id, 'project-uuid-123')
        
        // constructStoragePath now returns an object
        const expectedPathParts = constructStoragePath(context.pathContext);
        assertEquals(insertData.storage_path, expectedPathParts.storagePath);
        assertEquals(insertData.file_name, expectedPathParts.fileName);
        assert(typeof insertData.resource_description === 'object' && insertData.resource_description !== null, 'resource_description should be an object');
        assertEquals(insertData.resource_description, { type: context.pathContext.fileType, originalDescription: context.description });
        
        // Assert full column contract - resource_type must always be written
        assertEquals(insertData.resource_type, String(context.pathContext.fileType));
        // For GeneralResource without explicit session metadata, session_id should be present if provided, or undefined if not
        assertEquals(insertData.session_id, context.pathContext.sessionId);
        assertEquals(insertData.stage_slug, context.pathContext.stageSlug);
        assertEquals(insertData.iteration_number, context.pathContext.iteration);
        assertEquals(insertData.source_contribution_id, null);
      } finally {
        afterEach()
      }
    },
  )

  await t.step('uploadAndRegisterFile should register a seed prompt resource with session metadata', async () => {
    try {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            upsert: { data: [{ id: 'seed-resource-id' }], error: null },
          },
        },
      };
      beforeEach(config);

      const seedPromptPathContext: ResourceUploadContext['pathContext'] = {
        projectId: 'project-seed-contract',
        sessionId: 'session-seed-contract',
        iteration: 2,
        stageSlug: 'thesis',
        fileType: FileType.SeedPrompt,
        // sourceContributionId should be null for this test case
      };

      const seedPromptContext: ResourceUploadContext = {
        ...baseUploadContext,
        pathContext: seedPromptPathContext,
        fileContent: '# Seed prompt content',
        mimeType: 'text/markdown',
        description: 'Seed prompt for thesis stage',
        resourceTypeForDb: 'seed_prompt',
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(seedPromptContext);

      assertEquals(error, null);
      assertExists(record);

      const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert;
      assertExists(upsertSpy);
      const upsertArgs = upsertSpy.calls[0].args;
      const insertData = upsertArgs[0];

      // Assert full column contract for SeedPrompt with session metadata
      assertEquals(insertData.resource_type, 'seed_prompt');
      assertEquals(insertData.session_id, seedPromptPathContext.sessionId);
      assertEquals(insertData.stage_slug, seedPromptPathContext.stageSlug);
      assertEquals(insertData.iteration_number, seedPromptPathContext.iteration);
      assertEquals(insertData.source_contribution_id, null);
    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile should register a project export zip at project root',
    async () => {
      try {
        const projectId = 'project-uuid-zip';
        const originalZipName = 'My Export.zip';
        const zipContext: UploadContext = {
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

        const expectedPathParts = constructStoragePath(zipContext.pathContext);
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: [{ id: 'zip-res-123' }], error: null },
            },
          },
          storageMock: {
            uploadResult: (bucketId: string, path: string, _body: unknown, options?: IMockStorageFileOptions) => {
              assertEquals(bucketId, 'test-bucket');
              assertEquals(path, expectedFullPath);
              // Ensure storage upload uses upsert: true for overwrite semantics
              assertEquals(options?.upsert, true);
              return Promise.resolve({ data: { path }, error: null });
            },
          },
        };
        beforeEach(config);
        // Initialize spy before the call so it tracks the upload
        const storageBucket = setup.spies.storage.from('test-bucket');
        const uploadSpy = storageBucket.uploadSpy;

        const { record, error } = await fileManager.uploadAndRegisterFile(zipContext);

        assertEquals(error, null);
        assertExists(record);
        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_project_resources');

        const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert;
        assertExists(upsertSpy);
        const upsertArgs = upsertSpy.calls[0].args;
        const insertData = upsertArgs[0];
        assertEquals(insertData.project_id, projectId);
        assertEquals(insertData.storage_path, expectedPathParts.storagePath);
        assertEquals(insertData.file_name, expectedPathParts.fileName);
        assertEquals(insertData.mime_type, 'application/zip');
        const upsertOptions: { onConflict?: string } | undefined = upsertArgs[1];
        assertExists(upsertOptions);
        assertEquals(upsertOptions?.onConflict, 'storage_bucket,storage_path,file_name');

        assertExists(uploadSpy, "Upload spy should exist");
        assertExists(uploadSpy.calls[0], "Upload should have been called");
        assertEquals(uploadSpy.calls[0].args[0], expectedFullPath);
      } finally {
        afterEach();
      }
    },
  );

  await t.step('uploadAndRegisterFile should register a contribution correctly (no collision)',
    async () => {
      try {
        const resourceFileName = 'test.pdf';
        const resourceContextPath = 'projects/project-uuid-123/general_resource'; // As per constructStoragePath logic

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: [{ 
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
        const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert
        assertExists(upsertSpy);
        const upsertArgs = upsertSpy.calls[0].args;
        const insertData = upsertArgs[0];
        assertEquals(insertData.project_id, 'project-uuid-123')
        
        // constructStoragePath now returns an object
        const expectedPathParts = constructStoragePath(context.pathContext);
        assertEquals(insertData.storage_path, expectedPathParts.storagePath);
        assertEquals(insertData.file_name, expectedPathParts.fileName);
        assertEquals(insertData.resource_description, { type: context.pathContext.fileType, originalDescription: context.description });
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
        const zipContext: UploadContext = {
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

        const expectedPathParts = constructStoragePath(zipContext.pathContext);
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: [{ id: 'zip-res-123' }], error: null },
            },
          },
          storageMock: {
            uploadResult: (bucketId: string, path: string, _body: unknown, options?: IMockStorageFileOptions) => {
              assertEquals(bucketId, 'test-bucket');
              assertEquals(path, expectedFullPath);
              // Ensure storage upload uses upsert: true for overwrite semantics
              assertEquals(options?.upsert, true);
              return Promise.resolve({ data: { path }, error: null });
            },
          },
        };
        beforeEach(config);
        // Initialize spy before the call so it tracks the upload
        const storageBucket = setup.spies.storage.from('test-bucket');
        const uploadSpy = storageBucket.uploadSpy;

        const { record, error } = await fileManager.uploadAndRegisterFile(zipContext);

        assertEquals(error, null);
        assertExists(record);
        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_project_resources');

        const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert;
        assertExists(upsertSpy);
        const upsertArgs = upsertSpy.calls[0].args;
        const insertData = upsertArgs[0];
        assertEquals(insertData.project_id, projectId);
        assertEquals(insertData.storage_path, expectedPathParts.storagePath);
        assertEquals(insertData.file_name, expectedPathParts.fileName);
        assertEquals(insertData.mime_type, 'application/zip');
        const upsertOptions: { onConflict?: string } | undefined = upsertArgs[1];
        assertExists(upsertOptions);
        assertEquals(upsertOptions?.onConflict, 'storage_bucket,storage_path,file_name');

        assertExists(uploadSpy, "Upload spy should exist");
        assertExists(uploadSpy.calls[0], "Upload should have been called");
        assertEquals(uploadSpy.calls[0].args[0], expectedFullPath);
      } finally {
        afterEach();
      }
    },
  );

  await t.step('uploadAndRegisterFile for business_case should register a contribution correctly (no collision)',
    async () => {
      try {
        const pathContextAttempt0: ModelContributionUploadContext['pathContext'] = {
            fileType: FileType.business_case,
            projectId: 'project-uuid-123',
            sessionId: 'session-uuid-456',
            iteration: 2,
            stageSlug: '2_antithesis',
            modelSlug: 'claude-3-sonnet',
            attemptCount: 0,
            documentKey: 'business_case',
        };
        const expectedPathPartsAttempt0 = constructStoragePath(pathContextAttempt0);
        const expectedFullUploadPathAttempt0 = `${expectedPathPartsAttempt0.storagePath}/${expectedPathPartsAttempt0.fileName}`;

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

        const contributionMetadata: ContributionMetadata = {
          iterationNumber: 2,
          modelIdUsed: 'model-id-sonnet',
          modelNameDisplay: 'Claude 3 Sonnet',
          sessionId: 'session-uuid-456',
          stageSlug: '2_antithesis',
        };

        const context: ModelContributionUploadContext = {
          ...baseUploadContext,
          pathContext: pathContextAttempt0,
          fileContent: '# Business Case Content',
          mimeType: 'text/markdown',
          contributionMetadata,
        }

        const { record, error } = await fileManager.uploadAndRegisterFile(context)

        assertEquals(error, null)
        assertExists(record)
        assertEquals(record?.id, 'contrib-123')

        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_contributions')

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert
        assertExists(insertSpy);
        const insertData = insertSpy.calls[0].args[0];
        assertEquals(insertData.session_id, 'session-uuid-456')
        assertEquals(insertData.stage, '2_antithesis')
        assertEquals(insertData.file_name, expectedPathPartsAttempt0.fileName);
        assertEquals(insertData.storage_path, expectedPathPartsAttempt0.storagePath);
        // raw_response_storage_path now points to the same file (fileContent IS the raw JSON)
        const expectedFullStoragePath = `${expectedPathPartsAttempt0.storagePath}/${expectedPathPartsAttempt0.fileName}`;
        assertEquals(insertData.raw_response_storage_path, expectedFullStoragePath);

      } finally {
        afterEach()
      }
    },
  )

  await t.step('uploadAndRegisterFile should place intermediate files in a _work directory',
    async () => {
      try {
        const pathContext: ModelContributionUploadContext['pathContext'] = {
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
        // Initialize spy before the call so it tracks the upload
        const storageBucket = setup.spies.storage.from('test-bucket');
        const uploadSpy = storageBucket.uploadSpy;

        const contributionMetadata: ContributionMetadata = {
          iterationNumber: 1,
          modelIdUsed: 'model-id-123',
          modelNameDisplay: 'Test Model',
          sessionId: 'session-intermediate',
          stageSlug: 'synthesis',
          document_relationships: { derived_from: ['id-a', 'id-b'] },
        };

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext,
          contributionMetadata,
        };
        
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        await fileManager.uploadAndRegisterFile(context);

        assertExists(uploadSpy, "Upload spy should exist");
        assertExists(uploadSpy.calls[0], "Upload should have been called");
        assertEquals(uploadSpy.calls[0].args[0], expectedFullPath, "File was not uploaded to the expected _work directory path.");
        assert(expectedFullPath.includes('/_work/'), "The final path should contain a '/_work/' directory.");


      } finally {
        afterEach();
      }
    },
  );

  await t.step('uploadAndRegisterFile for business_case should handle filename collision and retry',
    async () => {
      try {
        const baseRetryPathContext: ModelContributionUploadContext['pathContext'] = {
          fileType: FileType.business_case,
          projectId: 'project-retry-proj',
          sessionId: 'session-retry-sess',
          iteration: 1,
          stageSlug: 'thesis',
          modelSlug: 'claude-opus',
          documentKey: 'business_case',
        };

        const failedAttempt0PathContext: ModelContributionUploadContext['pathContext'] = {
          ...baseRetryPathContext,
          attemptCount: 0,
        };
        const expectedFailedPathParts0 = constructStoragePath(failedAttempt0PathContext);
        const expectedFullFailedPath0 = `${expectedFailedPathParts0.storagePath}/${expectedFailedPathParts0.fileName}`;

        const successAttempt1PathContext: ModelContributionUploadContext['pathContext'] = {
          ...baseRetryPathContext,
          attemptCount: 1,
        };
        const expectedSuccessfulPathParts1 = constructStoragePath(successAttempt1PathContext);
        const expectedFullSuccessfulMainPath1 = `${expectedSuccessfulPathParts1.storagePath}/${expectedSuccessfulPathParts1.fileName}`;
        const expectedSuccessfulMainFileName1 = expectedSuccessfulPathParts1.fileName;

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
          console.error(`mockUploadFn: Unexpected upload call: count ${uploadCallCount}, path ${path}, contentType ${options?.contentType}`);
          return { error: {message: "Unexpected upload call pattern in mockUploadFn", name: "TestError"}, data: null };
        };

        const originalStorageFrom = setup.client.storage.from;
        setup.client.storage.from = (bucketName: string) => {
          const bucket = originalStorageFrom(bucketName);
          bucket.upload = mockUploadFn; 
          return bucket;
        };

        const contributionMetadata: ContributionMetadata = {
          iterationNumber: 1,
          modelIdUsed: 'model-id-opus',
          modelNameDisplay: 'Claude Opus',
          sessionId: 'session-retry-sess',
          stageSlug: 'thesis',
        };

        const context: ModelContributionUploadContext = {
          ...baseUploadContext,
          pathContext: baseRetryPathContext, // Use the base for the initial call, attemptCount is handled internally by FileManagerService
          mimeType: 'text/markdown',
          fileContent: '# continuation without link',
          contributionMetadata,
          userId: 'user-missing-link',
        };

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        const errorDetails = error 
          ? (isPostgrestError(error) ? error.details 
            : isServiceError(error) && typeof error.details === 'string' ? error.details 
            : isStorageError(error) ? error.error 
            : undefined)
          : undefined;
        assertEquals(error, null, `Upload failed: ${error?.message}, Details: ${errorDetails}`); 
        assertExists(record);
        assertEquals(record?.id, 'contrib-retry-123');
        assertEquals(uploadCallCount, 2, "Expected 2 upload attempts (1 fail, 1 success) - no separate raw JSON upload");

        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
        assertExists(insertSpy);
        const insertData = insertSpy.calls[0].args[0];
        assertEquals(insertData.file_name, expectedSuccessfulMainFileName1);
        assertEquals(insertData.storage_path, expectedSuccessfulPathParts1.storagePath); 
        // raw_response_storage_path now points to the same file (fileContent IS the raw JSON)
        const expectedFullStoragePath = `${expectedSuccessfulPathParts1.storagePath}/${expectedSuccessfulMainFileName1}`;
        assertEquals(insertData.raw_response_storage_path, expectedFullStoragePath);

      } finally {
        afterEach();
      }
    },
  );

  await t.step('uploadAndRegisterFile should register user_feedback correctly',
    async () => {
      try {
        const feedbackDataMock = { id: 'feedback-123', project_id: 'project-feedback-proj' };
        const projectId = 'project-feedback-proj';
        const sessionId = 'session-feedback-sess';
        const iteration = 3;
        const stageSlug = '3_synthesis';
        const sourceDocPathContext: PathContext = {
          projectId,
          sessionId,
          iteration,
          stageSlug,
          modelSlug: 'claude-3-opus',
          attemptCount: 0,
          documentKey: 'business_case',
          fileType: FileType.business_case,
        };
        const sourceDocPath = constructStoragePath(sourceDocPathContext);
        const originalStoragePath = sourceDocPath.storagePath;
        const originalBaseName = sourceDocPath.fileName.endsWith('.md') ? sourceDocPath.fileName.slice(0, -3) : sourceDocPath.fileName;
        const pathContext: PathContext & { fileType: FileType.UserFeedback } = {
          fileType: FileType.UserFeedback,
          projectId,
          sessionId,
          iteration,
          stageSlug,
          originalStoragePath,
          originalBaseName,
          documentKey: 'business_case',
          modelSlug: 'claude-3-opus',
        };
        const context: UserFeedbackUploadContext = {
          ...baseUploadContext,
          pathContext,
          mimeType: 'text/markdown',
          fileContent: '# My Feedback Content',
          userId: 'user-feedback-user-id',
          feedbackTypeForDb: 'some-feedback-type',
          resourceDescriptionForDb: { description: "A test feedback resource" }
        };
        const expectedPath = constructStoragePath(context.pathContext);
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_feedback: {
              insert: { data: [feedbackDataMock], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedPath.storagePath }, error: null },
          },
        };
        beforeEach(config);

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
        
        assertEquals(insertData.file_name, expectedPath.fileName);
        assertEquals(insertData.storage_path, expectedPath.storagePath);
        assertEquals(insertData.mime_type, context.mimeType);

      } finally {
        afterEach()
      }
    });

  await t.step('uploadAndRegisterFile user_feedback with no existing logical doc row inserts a new row',
    async () => {
      try {
        const documentKey = 'synthesis_document_business_case';
        const modelId = 'model-abc-123';
        const newRow = { id: 'new-feedback-id', project_id: 'proj-upsert', session_id: 'sess-upsert' };
        const projectId = 'proj-upsert';
        const sessionId = 'sess-upsert';
        const iteration = 2;
        const stageSlug = '2_synthesis';
        const sourceDocPathContext: PathContext = {
          projectId,
          sessionId,
          iteration,
          stageSlug,
          modelSlug: 'model-abc',
          attemptCount: 0,
          documentKey,
          fileType: FileType.synthesis_document_business_case,
        };
        const sourceDocPath = constructStoragePath(sourceDocPathContext);
        const originalStoragePath = sourceDocPath.storagePath;
        const originalBaseName = sourceDocPath.fileName.endsWith('.md') ? sourceDocPath.fileName.slice(0, -3) : sourceDocPath.fileName;
        const pathContext: PathContext & { fileType: FileType.UserFeedback } = {
          fileType: FileType.UserFeedback,
          projectId,
          sessionId,
          iteration,
          stageSlug,
          originalStoragePath,
          originalBaseName,
          documentKey,
          modelSlug: modelId,
        };
        const context: UserFeedbackUploadContext = {
          ...baseUploadContext,
          pathContext,
          mimeType: 'text/markdown',
          fileContent: '# New feedback',
          userId: 'user-upsert',
          feedbackTypeForDb: 'general-feedback',
          resourceDescriptionForDb: { document_key: documentKey, model_id: modelId },
        };
        const expectedPath = constructStoragePath(context.pathContext);
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_feedback: {
              select: { data: [], error: null },
              insert: { data: [newRow], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedPath.storagePath }, error: null },
          },
        };
        beforeEach(config);

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null, error?.message);
        assertExists(record);
        assertEquals(record?.id, newRow.id);

        const selectHistoric = setup.spies.getHistoricQueryBuilderSpies?.('dialectic_feedback', 'select') ?? { callCount: 0, callsArgs: [] };
        assert(selectHistoric.callCount >= 1, 'dialectic_feedback select (logical doc lookup) should have been called');
        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_feedback')?.insert;
        assertExists(insertSpy, 'Insert spy for dialectic_feedback not found');
        assertEquals(insertSpy.calls.length, 1, 'Insert should be called exactly once when no existing row');
      } finally {
        afterEach();
      }
    });

  await t.step('uploadAndRegisterFile user_feedback with existing logical doc row updates that row (no second insert)',
    async () => {
      try {
        const documentKey = 'business_case';
        const modelId = 'model-existing';
        const existingId = 'existing-feedback-uuid';
        const updatedRow = { id: existingId, project_id: 'proj-upd', session_id: 'sess-upd', file_name: 'updated_feedback.md' };
        const projectId = 'proj-upd';
        const sessionId = 'sess-upd';
        const iteration = 1;
        const stageSlug = '1_thesis';
        const sourceDocPathContext: PathContext = {
          projectId,
          sessionId,
          iteration,
          stageSlug,
          modelSlug: 'model-upd',
          attemptCount: 0,
          documentKey,
          fileType: FileType.business_case,
        };
        const sourceDocPath = constructStoragePath(sourceDocPathContext);
        const originalStoragePath = sourceDocPath.storagePath;
        const originalBaseName = sourceDocPath.fileName.endsWith('.md') ? sourceDocPath.fileName.slice(0, -3) : sourceDocPath.fileName;
        const pathContext: PathContext & { fileType: FileType.UserFeedback } = {
          fileType: FileType.UserFeedback,
          projectId,
          sessionId,
          iteration,
          stageSlug,
          originalStoragePath,
          originalBaseName,
          documentKey,
          modelSlug: modelId,
        };
        const context: UserFeedbackUploadContext = {
          ...baseUploadContext,
          pathContext,
          mimeType: 'text/markdown',
          fileContent: '# Updated feedback content',
          userId: 'user-upd',
          feedbackTypeForDb: 'general-feedback',
          resourceDescriptionForDb: { document_key: documentKey, model_id: modelId },
        };
        const expectedPath = constructStoragePath(context.pathContext);
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_feedback: {
              select: { data: [{ id: existingId }], error: null },
              update: { data: [updatedRow], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedPath.storagePath }, error: null },
          },
        };
        beforeEach(config);

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null, error?.message);
        assertExists(record);
        assertEquals(record?.id, existingId);

        const updateSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_feedback')?.update;
        assertExists(updateSpy, 'Update spy for dialectic_feedback not found');
        assertEquals(updateSpy.calls.length, 1, 'Update should be called exactly once when existing row found');
        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_feedback')?.insert;
        const insertCalls = insertSpy?.calls.length ?? 0;
        assertEquals(insertCalls, 0, 'Insert must not be called when updating existing feedback row');
      } finally {
        afterEach();
      }
    });

  await t.step('uploadAndRegisterFile user_feedback logical doc lookup filters by session_id project_id stage_slug iteration_number document_key model_id',
    async () => {
      try {
        const documentKey = 'feature_spec';
        const modelId = 'model-filter-test';
        const projectId = 'p';
        const sessionId = 's';
        const iteration = 1;
        const stageSlug = '1_thesis';
        const sourceDocPathContext: PathContext = {
          projectId,
          sessionId,
          iteration,
          stageSlug,
          modelSlug: 'model-f',
          attemptCount: 0,
          documentKey,
          fileType: FileType.feature_spec,
        };
        const sourceDocPath = constructStoragePath(sourceDocPathContext);
        const originalStoragePath = sourceDocPath.storagePath;
        const originalBaseName = sourceDocPath.fileName.endsWith('.md') ? sourceDocPath.fileName.slice(0, -3) : sourceDocPath.fileName;
        const pathContext: PathContext & { fileType: FileType.UserFeedback } = {
          fileType: FileType.UserFeedback,
          projectId,
          sessionId,
          iteration,
          stageSlug,
          originalStoragePath,
          originalBaseName,
          documentKey,
          modelSlug: modelId,
        };
        const context: UserFeedbackUploadContext = {
          ...baseUploadContext,
          pathContext,
          mimeType: 'text/markdown',
          fileContent: '# Feedback',
          userId: 'u',
          feedbackTypeForDb: 'general-feedback',
          resourceDescriptionForDb: { document_key: documentKey, model_id: modelId },
        };
        const expectedPath = constructStoragePath(context.pathContext);
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_feedback: {
              select: { data: [], error: null },
              insert: { data: [{ id: 'filter-test-id' }], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedPath.storagePath }, error: null },
          },
        };
        beforeEach(config);

        await fileManager.uploadAndRegisterFile(context);

        const eqSpy = setup.spies.getHistoricQueryBuilderSpies?.('dialectic_feedback', 'eq') ?? { callCount: 0, callsArgs: [] };
        const filterSpy = setup.spies.getHistoricQueryBuilderSpies?.('dialectic_feedback', 'filter') ?? { callCount: 0, callsArgs: [] };
        assert(eqSpy.callCount >= 4, 'Logical doc lookup must filter by session_id, project_id, stage_slug, iteration_number');
        const eqCalls = eqSpy.callsArgs;
        const hasSessionId = eqCalls.some((args) => args[0] === 'session_id' && args[1] === context.pathContext.sessionId);
        const hasProjectId = eqCalls.some((args) => args[0] === 'project_id' && args[1] === context.pathContext.projectId);
        const hasStageSlug = eqCalls.some((args) => args[0] === 'stage_slug' && args[1] === context.pathContext.stageSlug);
        const hasIteration = eqCalls.some((args) => args[0] === 'iteration_number' && args[1] === context.pathContext.iteration);
        assert(hasSessionId, 'Lookup must include eq(session_id, ...)');
        assert(hasProjectId, 'Lookup must include eq(project_id, ...)');
        assert(hasStageSlug, 'Lookup must include eq(stage_slug, ...)');
        assert(hasIteration, 'Lookup must include eq(iteration_number, ...)');
        assert(filterSpy.callCount >= 2, 'Logical doc lookup must filter by resource_description document_key and model_id');
        const filterCalls = filterSpy.callsArgs;
        const hasDocumentKey = filterCalls.some(
          (args) => typeof args[0] === 'string' && args[0].includes('document_key') && args[2] === documentKey
        );
        const hasModelId = filterCalls.some(
          (args) => typeof args[0] === 'string' && args[0].includes('model_id') && args[2] === modelId
        );
        assert(hasDocumentKey, 'Lookup must include filter on resource_description document_key');
        assert(hasModelId, 'Lookup must include filter on resource_description model_id');
      } finally {
        afterEach();
      }
    });

  await t.step('uploadAndRegisterFile user_feedback storage upload uses existing deterministic path from constructStoragePath',
    async () => {
      try {
        const projectId = 'path-proj';
        const sessionId = 'path-sess';
        const iteration = 2;
        const stageSlug = '2_synthesis';
        const sourceDocPathContext: PathContext = {
          projectId,
          sessionId,
          iteration,
          stageSlug,
          modelSlug: 'path-model',
          attemptCount: 0,
          documentKey: 'synthesis_document_feature_spec',
          fileType: FileType.synthesis_document_feature_spec,
        };
        const sourceDocPath = constructStoragePath(sourceDocPathContext);
        const originalStoragePath = sourceDocPath.storagePath;
        const originalBaseName = sourceDocPath.fileName.endsWith('.md') ? sourceDocPath.fileName.slice(0, -3) : sourceDocPath.fileName;
        const pathContext: PathContext & { fileType: FileType.UserFeedback } = {
          fileType: FileType.UserFeedback,
          projectId,
          sessionId,
          iteration,
          stageSlug,
          originalStoragePath,
          originalBaseName,
          documentKey: 'synthesis_document_feature_spec',
          modelSlug: 'path-model',
        };
        const context: UserFeedbackUploadContext = {
          ...baseUploadContext,
          pathContext,
          mimeType: 'text/markdown',
          fileContent: '# Path test',
          userId: 'path-user',
          feedbackTypeForDb: 'general-feedback',
          resourceDescriptionForDb: { document_key: 'synthesis_document_feature_spec', model_id: 'path-model' },
        };
        const expectedPath = constructStoragePath(context.pathContext);
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_feedback: {
              select: { data: [], error: null },
              insert: { data: [{ id: 'path-test-id' }], error: null },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedPath.storagePath }, error: null },
          },
        };
        beforeEach(config);
        const storageBucket = setup.spies.storage.from('test-bucket');

        const { error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(error, null, error?.message);
        assertExists(storageBucket.uploadSpy);
        assertEquals(storageBucket.uploadSpy.calls.length, 1, 'Storage upload should be called once');
        const uploadPathArgRaw: unknown = storageBucket.uploadSpy.calls[0].args[0];
        assert(typeof uploadPathArgRaw === 'string', 'Upload path must be a string');
        const uploadPathArg: string = uploadPathArgRaw;
        const lastSlash = uploadPathArg.lastIndexOf('/');
        const uploadDir = lastSlash >= 0 ? uploadPathArg.slice(0, lastSlash) : '';
        const uploadFile = lastSlash >= 0 ? uploadPathArg.slice(lastSlash + 1) : uploadPathArg;
        assertEquals(uploadDir, expectedPath.storagePath, 'Upload path directory must match constructStoragePath storagePath');
        assertEquals(uploadFile, expectedPath.fileName, 'Upload path filename must match constructStoragePath fileName');
        assert(
          expectedPath.fileName.endsWith('_feedback.md'),
          'user_feedback fileName must follow (originalBaseName)_feedback.md pattern'
        );
      } finally {
        afterEach();
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
        // Storage errors don't have details, they have error and statusCode
        if (isStorageError(error)) {
          assertEquals(error.error, 'Upload failed')
        } else if (isServiceError(error) && typeof error.details === 'string') {
          assertEquals(error.details, 'Upload failed')
        } else {
          assert(false, 'Expected StorageError or ServiceError for storage upload failure')
        }
        assertEquals(setup.spies.fromSpy.calls.length, 0)
      } finally {
        afterEach()
      }
    },
  )

  await t.step('uploadAndRegisterFile should handle DB insert errors and attempt cleanup',
    async () => {
      try {
        const dbErrorContext: UploadContext = {
          ...baseUploadContext,
          pathContext: { // Using simpler initial_user_prompt for this DB error test
            fileType: FileType.InitialUserPrompt,
            projectId: 'project-db-error',
            originalFileName: 'db_error_test.txt',
          },
          description: "DB error test",
        };

        const expectedPathParts = constructStoragePath(dbErrorContext.pathContext);
        const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: { // Simulating this table for initial_user_prompt
              upsert: { data: null, error: (() => {
                const dbError: PostgrestError = { message: 'Simulated DB insert error', code: 'XXYYZ', details: '', hint: '', name: 'PostgrestError' };
                return dbError;
              })() },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null },
            removeResult: { data: [], error: null },
          },
        };
        beforeEach(config);
        const storageBucket = setup.spies.storage.from('test-bucket');
        const listSpy = storageBucket.listSpy;
        const removeSpy = storageBucket.removeSpy;

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: FileType.InitialUserPrompt,
            projectId: 'project-db-error',
            originalFileName: 'db_error_test.txt',
          },
          description: "DB error test",
        };

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertExists(error);
        if (isPostgrestError(error)) {
          assertEquals(error.message, 'Simulated DB insert error');
          assertEquals(error.code, 'XXYYZ');
        } else if (isServiceError(error)) {
          assertEquals(error.message, 'Database registration failed after successful upload.');
          assertExists(error.details);
        } else {
          assert(false, 'Expected PostgrestError or ServiceError');
        }
        assertEquals(record, null);

        // Sibling files preserved: cleanup must not use list(); only the specific uploaded file path is removed
        assert(listSpy.calls.length === 0, 'Cleanup must not call storage.list');
        assertExists(removeSpy);
        assertEquals(removeSpy.calls.length, 1, 'Remove should have been called exactly once');
        assertEquals(removeSpy.calls[0].args[0], [expectedFullPath], 'Remove must be called with only the uploaded file path');

      } finally {
        afterEach();
      }
    },
  )

  await t.step('uploadAndRegisterFile should use pathContext.isContinuation to determine continuation status and reject when target_contribution_id is missing',
    async () => {
      try {
        const pathContext: ModelContributionUploadContext['pathContext'] = {
          fileType: FileType.business_case,
          projectId: 'project-missing-link',
          sessionId: 'session-missing-link',
          iteration: 1,
          stageSlug: 'thesis',
          modelSlug: 'test-model',
          attemptCount: 0,
          documentKey: 'business_case',
          isContinuation: true,
          turnIndex: 1,
        };

        const config: MockSupabaseDataConfig = {
          storageMock: {
            uploadResult: { data: { path: 'any-path' }, error: null },
            removeResult: { data: [{ name: 'test-bucket' }], error: null },
          },
        };
        beforeEach(config);
        const storageBucket = setup.spies.storage.from('test-bucket');
        const removeSpy = storageBucket.removeSpy;

        const constructStoragePathSpy = spy(constructStoragePath);
        fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, { constructStoragePath: constructStoragePathSpy, logger });

        const contributionMetadata: ContributionMetadata = {
          iterationNumber: 1,
          modelIdUsed: 'model-id-test',
          modelNameDisplay: 'Test Model',
          sessionId: 'session-missing-link',
          stageSlug: 'thesis',
        };
        
        assertEquals(contributionMetadata.isContinuation, undefined);

        const missingLinkContext: UploadContext = {
          ...baseUploadContext,
          pathContext,
          mimeType: 'text/markdown',
          fileContent: '# continuation without link',
          contributionMetadata,
          userId: 'user-missing-link',
        };

        const { record, error } = await fileManager.uploadAndRegisterFile(missingLinkContext);

        assertEquals(constructStoragePathSpy.calls.length, 1);
        const capturedPathContext = constructStoragePathSpy.calls[0].args[0];
        assertEquals(capturedPathContext.isContinuation, true);
        assertEquals(capturedPathContext.turnIndex, 1);

        assertExists(error);
        assertEquals(record, null);
        assert(!setup.spies.fromSpy.calls.map((c: { args: unknown[] }) => c.args[0]).includes('dialectic_contributions'));

        const capturedMainPathParts = constructStoragePathSpy.calls[0].returned;
        assertExists(capturedMainPathParts);
        const capturedMainFullPath = `${capturedMainPathParts.storagePath}/${capturedMainPathParts.fileName}`;

        // 3. Assert that the cleanup logic attempted to remove the exact path that was generated
        assertExists(removeSpy, 'Expected storage.remove to be called for cleanup');
        assert(removeSpy.calls.length > 0, 'Remove should have been called');
        const removedPaths = removeSpy.calls.map(c => c.args[0]).flat();

        assert(removedPaths.includes(capturedMainFullPath), `Cleanup should have removed the file at the generated path: ${capturedMainFullPath}`);

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
        const contributionMetadata: ContributionMetadata = {
          target_contribution_id: 'anchor-contrib-id-123',
          iterationNumber: 1,
          modelIdUsed: 'model-id-opus',
          modelNameDisplay: 'Claude Opus',
          sessionId: 'session-chunk-test',
          stageSlug: '1_thesis',
          contributionType: 'thesis',
        };
      const continuationContext: UploadContext = {
        ...baseUploadContext,
        fileContent: 'This is the new content.',
        pathContext: { // This context is for metadata, the path logic is what we test
          fileType: FileType.business_case,
          projectId: 'project-chunk-test',
          sessionId: 'session-chunk-test',
          stageSlug: '1_thesis',
          iteration: 1,
          modelSlug: 'Claude Opus', // Correctly provide modelSlug in the base path context
          contributionType: 'thesis', // Correctly provide contributionType in the base path context
          documentKey: 'business_case',
          isContinuation: true,
          turnIndex: 1,
        },
        contributionMetadata,
        userId: 'user-chunk-test-id'
      };

      // 3. Setup: Define the expected path for the continuation chunk file.
      const expectedChunkPathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.business_case,
        projectId: 'project-chunk-test',
        sessionId: 'session-chunk-test',
        iteration: 1,
        stageSlug: '1_thesis',
        modelSlug: contributionMetadata.modelNameDisplay,
        attemptCount: 0,
        documentKey: 'business_case',
        isContinuation: true,
        turnIndex: 1,
      };
      const expectedPathParts = constructStoragePath({
        ...expectedChunkPathContext,
        contributionType: contributionMetadata.contributionType,
      });
      const expectedChunkFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

      let passedPathContext: PathContext | undefined;
      const mockConstructStoragePath = (context: PathContext): { storagePath: string; fileName: string; } => {
        passedPathContext = context;
        const pathParts = constructStoragePath(context);
        return pathParts;
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: { data: [anchorRecord], error: null },
            insert: { data: [{ id: 'new-contrib-456' }], error: null },
          },
        },
        storageMock: {
          uploadResult: { data: { path: 'any-path' }, error: null },
        }
      };
      beforeEach(config);
      fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, { constructStoragePath: mockConstructStoragePath, logger });
      
      const storageBucket = setup.spies.storage.from('test-bucket');
      const uploadSpy = storageBucket.uploadSpy;

      await fileManager.uploadAndRegisterFile(continuationContext);

      assertExists(passedPathContext);
      assertEquals(passedPathContext.isContinuation, continuationContext.pathContext.isContinuation);
      assertEquals(passedPathContext.turnIndex, continuationContext.pathContext.turnIndex);
      
      assertExists(uploadSpy, "Upload spy should exist");
      assertExists(uploadSpy.calls[0], "Upload should have been called");
      
      const actualUploadPath = uploadSpy.calls[0].args[0];

      assert(actualUploadPath.includes('/_work/'), "The upload path must be in a '_work' directory for chunks.");
      assert(actualUploadPath.includes('_continuation_1'), "The upload path must include the continuation turn index.");

      // parent latest edit should be cleared for continuation
      const updateHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
      assertExists(updateHistory, "Expected to track updates to dialectic_contributions");
      assert(updateHistory!.callCount >= 1, 'Expected an update to clear prior latest edit on parent contribution');
      const updatedLatestFalse = updateHistory!.callsArgs.some(args => {
        const updatePayload = args[0];
        return isRecord(updatePayload) && 'is_latest_edit' in updatePayload && updatePayload.is_latest_edit === false;
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

  await t.step('should handle PlannerPrompt correctly', async () => {
    try {
      const fileType: FileType = FileType.PlannerPrompt;
      if (!fileType) {
        throw new Error('fileType is null');
      }
      const stepName = 'generate_plan';
      const plannerPathContext: ResourceUploadContext['pathContext'] = {
        fileType: FileType.PlannerPrompt,
        projectId: 'project-doc-centric',
        sessionId: 'session-doc-centric',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'test-model',
        stepName,
        sourceContributionId: 'planner-source-contrib-123',
      };

      const expectedPathParts = {
        storagePath: `projects/project-doc-centric/sessions/session-doc-centric/iteration_1/1_thesis`,
        fileName: `${FileType.PlannerPrompt}_test.json`,
      };

      let passedContext: PathContext | undefined;
      const mockConstructStoragePath = (context: PathContext) => {
        passedContext = context;
        return expectedPathParts;
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            upsert: { data: [{ id: `contrib-${fileType}` }], error: null },
          },
        },
      };

      // Custom setup for spy injection
      originalEnvGet = Deno.env.get.bind(Deno.env);
      envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
        if (key === 'SB_CONTENT_STORAGE_BUCKET') return 'test-bucket';
        return originalEnvGet(key);
      });
      setup = createMockSupabaseClient('test-user-id', config);
      fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, {
        constructStoragePath: mockConstructStoragePath,
        logger,
      });

      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-123',
        modelNameDisplay: 'Test Model',
        sessionId: 'session-doc-centric',
        stageSlug: 'thesis',
      };

      const plannerContext: ResourceUploadContext = {
        ...baseUploadContext,
        pathContext: {
          ...plannerPathContext,
          fileType: FileType.PlannerPrompt,
        },
        fileContent: '{}',
        mimeType: 'application/json',
        description: `Test for ${fileType}`,
        resourceTypeForDb: 'planner_prompt',
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(plannerContext);

      assertEquals(error, null, `Upload failed for ${fileType}: ${error?.message}`);
      assertExists(record, `Record should be created for ${fileType}`);
      
      assertEquals(record.id, `contrib-${fileType}`);

      // 2. Verify the correct DB table was targeted
      const fromSpyCalls = setup.spies.fromSpy.calls;
      const contributionTableCall = fromSpyCalls.find((call) => call.args[0] === 'dialectic_project_resources');
      assertExists(contributionTableCall, `'dialectic_project_resources' table was not targeted for ${fileType}`);

      const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert;
      assertExists(upsertSpy, "Upsert spy for 'dialectic_project_resources' should exist");
      const upsertArgs = upsertSpy.calls[0].args;
      const insertData = upsertArgs[0];
      
      // Assert full column contract for continuation-backed planner prompt
      assertEquals(insertData.resource_type, 'planner_prompt');
      assertEquals(insertData.session_id, plannerPathContext.sessionId);
      assertEquals(insertData.stage_slug, plannerPathContext.stageSlug);
      assertEquals(insertData.iteration_number, plannerPathContext.iteration);
      assertEquals(insertData.source_contribution_id, plannerPathContext.sourceContributionId);
    } finally {
      afterEach();
    }
  });

  await t.step('should handle TurnPrompt correctly', async () => {
    try {
      const fileType = FileType.TurnPrompt;
      const documentKey = 'business_case';
      const pathContext: ResourceUploadContext['pathContext'] = {
        fileType,
        projectId: 'project-doc-centric',
        sessionId: 'session-doc-centric',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'test-model',
        documentKey,
      };
  
      const expectedPathParts = {
        storagePath: `projects/project-doc-centric/sessions/session-doc-centric/iteration_1/1_thesis`,
        fileName: `${fileType}_test.json`,
      };
  
      let passedContext: PathContext | undefined;
      const mockConstructStoragePath = (context: PathContext) => {
        passedContext = context;
        return expectedPathParts;
      };
  
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            upsert: { data: [{ id: `contrib-${fileType}` }], error: null },
          },
        },
      };

      // Custom setup for spy injection
      originalEnvGet = Deno.env.get.bind(Deno.env);
      envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
        if (key === 'SB_CONTENT_STORAGE_BUCKET') return 'test-bucket';
        return originalEnvGet(key);
      });
      setup = createMockSupabaseClient('test-user-id', config);
      fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, {
        constructStoragePath: mockConstructStoragePath,
        logger,
      });

      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-123',
        modelNameDisplay: 'Test Model',
        sessionId: 'session-doc-centric',
        stageSlug: 'thesis',
      };

      const turnContext: ResourceUploadContext = {
        ...baseUploadContext,
        pathContext: {
          ...pathContext,
          fileType: FileType.TurnPrompt,
        },
        fileContent: '{}',
        mimeType: 'application/json',
        description: `Test for ${fileType}`,
      };
  
      const { record, error } = await fileManager.uploadAndRegisterFile(turnContext);
  
      assertEquals(error, null, `Upload failed for ${fileType}: ${error?.message}`);
      assertExists(record, `Record should be created for ${fileType}`);
      assertEquals(record.id, `contrib-${fileType}`);
  
      const fromSpyCalls = setup.spies.fromSpy.calls;
      const contributionTableCall = fromSpyCalls.find((call) => call.args[0] === 'dialectic_project_resources');
      assertExists(contributionTableCall, `'dialectic_project_resources' table was not targeted for ${fileType}`);
    } finally {
      afterEach();
    }
  });
  
  await t.step('should handle HeaderContext correctly', async () => {
    try {
      const fileType = FileType.HeaderContext;
      const pathContext: ModelContributionUploadContext['pathContext'] = {
        fileType,
        projectId: 'project-doc-centric',
        sessionId: 'session-doc-centric',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'test-model',
      };
  
      const expectedPathParts = {
        storagePath: `projects/project-doc-centric/sessions/session-doc-centric/iteration_1/1_thesis/_work`,
        fileName: `${fileType}_test.json`,
      };
  
      let passedContext: PathContext | undefined;
      const mockConstructStoragePath = (context: PathContext) => {
        passedContext = context;
        return expectedPathParts;
      };
  
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [{ id: `contrib-${fileType}` }], error: null },
          },
        },
      };
  
      originalEnvGet = Deno.env.get.bind(Deno.env);
      envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
        if (key === 'SB_CONTENT_STORAGE_BUCKET') return 'test-bucket';
        return originalEnvGet(key);
      });
      setup = createMockSupabaseClient('test-user-id', config);
      fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, {
        constructStoragePath: mockConstructStoragePath,
        logger,
        });
  
      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-123',
        modelNameDisplay: 'Test Model',
        sessionId: 'session-doc-centric',
        stageSlug: 'thesis',
      };

      const headerContext: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext: {
          ...pathContext,
          fileType: FileType.HeaderContext,
        },
        fileContent: '{}',
        mimeType: 'application/json',
        description: `Test for ${fileType}`,
        contributionMetadata,
      };
  
      const { record, error } = await fileManager.uploadAndRegisterFile(headerContext);
  
      assertEquals(error, null, `Upload failed for ${fileType}: ${error?.message}`);
      assertExists(record, `Record should be created for ${fileType}`);
      assertEquals(record.id, `contrib-${fileType}`);
  
      const fromSpyCalls = setup.spies.fromSpy.calls;
      const contributionTableCall = fromSpyCalls.find((call) => call.args[0] === 'dialectic_contributions');
      assertExists(contributionTableCall, `'dialectic_contributions' table was not targeted for ${fileType}`);
    } finally {
      afterEach();
    }
  });
  
  await t.step('should handle AssembledDocumentJson correctly', async () => {
    try {
      const fileType = FileType.AssembledDocumentJson;
      const documentKey = 'feature_spec';
      const pathContext: ResourceUploadContext['pathContext'] = {
        fileType,
        projectId: 'project-doc-centric',
        sessionId: 'session-doc-centric',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'test-model',
        documentKey,
      };
  
      const expectedPathParts = {
        storagePath: `projects/project-doc-centric/sessions/session-doc-centric/iteration_1/1_thesis/_work`,
        fileName: `${fileType}_test.json`,
      };
  
      let passedContext: PathContext | undefined;
      const mockConstructStoragePath = (context: PathContext) => {
        passedContext = context;
        return expectedPathParts;
      };
  
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            upsert: { data: [{ id: `contrib-${fileType}` }], error: null },
          },
        },
      };

      originalEnvGet = Deno.env.get.bind(Deno.env);
      envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
        if (key === 'SB_CONTENT_STORAGE_BUCKET') return 'test-bucket';
        return originalEnvGet(key);
      });
      setup = createMockSupabaseClient('test-user-id', config);
      fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, {
        constructStoragePath: mockConstructStoragePath,
        logger,
      });
  
      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-123',
        modelNameDisplay: 'Test Model',
        sessionId: 'session-doc-centric',
        stageSlug: 'thesis',
      };

      const assembledJsonContext: ResourceUploadContext = {
        ...baseUploadContext,
        pathContext: {
          ...pathContext,
          fileType: FileType.AssembledDocumentJson,
        },
        fileContent: '{}',
        mimeType: 'application/json',
        description: `Test for ${fileType}`,
      };
  
      const { record, error } = await fileManager.uploadAndRegisterFile(assembledJsonContext);
  
      assertEquals(error, null, `Upload failed for ${fileType}: ${error?.message}`);
      assertExists(record, `Record should be created for ${fileType}`);
      assertEquals(record.id, `contrib-${fileType}`);
  
      const fromSpyCalls = setup.spies.fromSpy.calls;
      const contributionTableCall = fromSpyCalls.find((call) => call.args[0] === 'dialectic_project_resources');
      assertExists(contributionTableCall, `'dialectic_project_resources' table was not targeted for ${fileType}`);
    } finally {
      afterEach();
    }
  });
  
  await t.step('should handle RenderedDocument correctly', async () => {
    try {
      const fileType = FileType.RenderedDocument;
      const documentKey = 'technical_approach';
      const pathContext: ResourceUploadContext['pathContext'] = {
        fileType,
        projectId: 'project-doc-centric',
        sessionId: 'session-doc-centric',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'test-model',
        documentKey,
      };
  
      const expectedPathParts = {
        storagePath: `projects/project-doc-centric/sessions/session-doc-centric/iteration_1/1_thesis`,
        fileName: `${fileType}_test.json`,
      };
  
      let passedContext: PathContext | undefined;
      const mockConstructStoragePath = (context: PathContext) => {
        passedContext = context;
        return expectedPathParts;
      };
  
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            upsert: { data: [{ id: `contrib-${fileType}` }], error: null },
          },
        },
      };

      originalEnvGet = Deno.env.get.bind(Deno.env);
      envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
        if (key === 'SB_CONTENT_STORAGE_BUCKET') return 'test-bucket';
        return originalEnvGet(key);
      });
      setup = createMockSupabaseClient('test-user-id', config);
      fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, {
        constructStoragePath: mockConstructStoragePath,
        logger,
      });
  
      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-123',
        modelNameDisplay: 'Test Model',
        sessionId: 'session-doc-centric',
        stageSlug: 'thesis',
      };

      const renderedDocContext: ResourceUploadContext = {
        ...baseUploadContext,
        pathContext: {
          ...pathContext,
          fileType: FileType.RenderedDocument,
        },
        fileContent: '{}',
        mimeType: 'application/json',
        description: `Test for ${fileType}`,
      };
  
      const { record, error } = await fileManager.uploadAndRegisterFile(renderedDocContext);
  
      assertEquals(error, null, `Upload failed for ${fileType}: ${error?.message}`);
      assertExists(record, `Record should be created for ${fileType}`);
      assertEquals(record.id, `contrib-${fileType}`);
  
      const fromSpyCalls = setup.spies.fromSpy.calls;
      const contributionTableCall = fromSpyCalls.find((call) => call.args[0] === 'dialectic_project_resources');
      assertExists(contributionTableCall, `'dialectic_project_resources' table was not targeted for ${fileType}`);
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

      const contributionMetadata: ContributionMetadata = {
        target_contribution_id: parentId,
        iterationNumber: 1,
        modelIdUsed: 'model-id-final',
        modelNameDisplay: 'Final Model',
        sessionId: 'sess-final-ctn',
        stageSlug: 'thesis',
        contributionType: 'thesis',
      };

      const finalContinuationContext: ModelContributionUploadContext = {
        ...baseUploadContext,
        fileContent: 'final continuation content',
        pathContext: {
          fileType: FileType.business_case,
          projectId: 'proj-final-ctn',
          sessionId: 'sess-final-ctn',
          iteration: 1,
          stageSlug: 'thesis',
          modelSlug: 'final-model',
          attemptCount: 0,
          documentKey: 'business_case',
        },
        contributionMetadata,
        mimeType: 'text/markdown',
        userId: 'user-final-ctn',
      };

      await fileManager.uploadAndRegisterFile(finalContinuationContext);

      // Assert: parent latest edit should be cleared even when isContinuation is false
      const updateHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
      assertExists(updateHistory, 'Expected an update on dialectic_contributions to clear parent latest-edit');
      const clearedLatest = updateHistory!.callsArgs.some((args) => {
        const payload = args[0];
        return isRecord(payload) && 'is_latest_edit' in payload && payload.is_latest_edit === false;
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

  await t.step('uploadAndRegisterFile for a continuation should correctly merge pathContext and initialize attemptCount', async () => {
    try {
      let passedContext: PathContext | undefined;
      const mockConstructStoragePath = (context: PathContext): { storagePath: string; fileName: string; } => {
        passedContext = context;
        return { storagePath: 'spy-path', fileName: 'spy-file.txt' };
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [{ id: 'new-contrib-789' }], error: null },
          },
        },
        storageMock: {
          uploadResult: { data: { path: 'any-path' }, error: null },
        },
      };

      // Use a custom setup for this test to inject the spy
      originalEnvGet = Deno.env.get.bind(Deno.env);
      envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
        if (key === 'SB_CONTENT_STORAGE_BUCKET') return 'test-bucket';
        return originalEnvGet(key);
      });
      setup = createMockSupabaseClient('test-user-id', config);
      // Inject the manual mock function
      fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, { constructStoragePath: mockConstructStoragePath, logger });

      // 1. Base context with FRESH turn-specific data in pathContext
      const basePathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.business_case,
        projectId: 'project-merge-test',
        sessionId: 'session-merge-test',
        stageSlug: 'test-stage',
        iteration: 1,
        modelSlug: 'base-model-slug', // This should be PRESERVED
        contributionType: 'thesis', // This should be PRESERVED. Use a valid enum member.
        isContinuation: true, // Fresh value in pathContext
        turnIndex: 1,         // Fresh value in pathContext
        attemptCount: 5,       // Stale value
      };

      const contributionMetadata: ContributionMetadata = {
        modelNameDisplay: 'metadata-model-slug', // This should NOT be used to overwrite the base
        stageSlug: 'metadata-stage-slug',         // This should NOT be used
        contributionType: 'synthesis', // This should NOT be used. Use a valid enum member.
        iterationNumber: 1,
        modelIdUsed: 'model-id-123',
        sessionId: 'session-merge-test',
      };

      // 2. UploadContext with FRESH turn-specific data in metadata
      const mergeContext: UploadContext = {
        ...baseUploadContext,
        pathContext: basePathContext,
        contributionMetadata,
        userId: 'user-merge-test',
      };

      // 4. Call the function
      await fileManager.uploadAndRegisterFile(mergeContext);

      // 5. Assert the context passed to the mock
      assertExists(passedContext, "constructStoragePath was not called");

      const errors: string[] = [];

      // a. Preserved values
      try { assertEquals(passedContext.projectId, basePathContext.projectId, "projectId should be preserved from base context"); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
      
      try { assertEquals(passedContext.sessionId, basePathContext.sessionId, "sessionId should be preserved from base context"); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }

      try { assertEquals(passedContext.modelSlug, 'base-model-slug', "modelSlug should be preserved from base context"); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }

      try { assertEquals(passedContext.stageSlug, 'test-stage', "stageSlug should be preserved from base context"); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }

      try { assertEquals(passedContext.contributionType, 'thesis', "contributionType should be preserved from base context"); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }


      try { assertEquals(passedContext.isContinuation, true); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }

      try { assertEquals(passedContext.turnIndex, 1); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }

      // c. Initialized value
      try { assertEquals(passedContext.attemptCount, 0, "attemptCount should be initialized to 0 for the new file operation"); }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }

      if (errors.length > 0) {
        throw new Error(`Multiple assertions failed:\n- ${errors.join('\n- ')}`);
      }

    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile should ignore deprecated seedPromptStoragePath', async () => {
    try {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [{ id: 'contrib-deprecation-test' }], error: null },
          },
        },
      };
      beforeEach(config);

      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-123',
        modelNameDisplay: 'Test Model',
        sessionId: 'session-deprecation-test',
        stageSlug: 'test-stage',
        // Include the new property
        source_prompt_resource_id: 'new-resource-uuid-123',
      };

      const context = {
        ...baseUploadContext,
        pathContext: {
          fileType: FileType.business_case,
          projectId: 'project-deprecation-test',
          sessionId: 'session-deprecation-test',
          iteration: 1,
          stageSlug: 'test-stage',
          modelSlug: 'test-model',
          documentKey: 'business_case',
        },
        contributionMetadata: {
          ...contributionMetadata,
          ['seedPromptStoragePath']: 'path/to/a/',
        },
      } as UploadContext;

      await fileManager.uploadAndRegisterFile(context);

      const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
      assertExists(insertSpy, "Insert spy for 'dialectic_contributions' should exist");
      
      const insertData = insertSpy.calls[0].args[0];
      
      // This is the failing assertion.
      // We expect seed_prompt_url to be null or undefined because seedPromptStoragePath is deprecated.
      // The current implementation will incorrectly populate it.
      assertEquals(insertData.seed_prompt_url, undefined, "seed_prompt_url should be undefined as it is populated by a deprecated property");
      
    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile should upload fileContent as raw JSON with FileType.ModelContributionRawJson and mimeType application/json', async () => {
    try {
      const pathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-raw-json-test',
        sessionId: 'session-raw-json-test',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        attemptCount: 0,
        documentKey: 'business_case',
      };
      const expectedPathParts = constructStoragePath(pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

      const validatedJsonString = '{"content": "# Business Case\\n\\nThis is the business case content."}';

      const contributionDataMock = { id: 'contrib-raw-json-123', file_name: expectedPathParts.fileName };
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [contributionDataMock], error: null },
          },
        },
        storageMock: {
          uploadResult: { data: { path: expectedFullPath }, error: null },
        },
      };
      beforeEach(config);

      let uploadCallCount = 0;
      let uploadedPath: string | null = null;
      let uploadedContentType: string | null = null;
      let uploadedContent: string | null = null;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalUpload = bucket.upload;
        bucket.upload = async (path: string, content: unknown, options?: IMockStorageFileOptions) => {
          uploadCallCount++;
          uploadedPath = path;
          uploadedContentType = options?.contentType || null;
          uploadedContent = typeof content === 'string' ? content : null;
          return { data: { path }, error: null };
        };
        return bucket;
      };

      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-raw-json-test',
        stageSlug: 'thesis',
      };

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: validatedJsonString,
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(error, null);
      assertExists(record);
      assertEquals(record?.id, 'contrib-raw-json-123');

      // Assert only ONE file was uploaded (not two separate files)
      assertEquals(uploadCallCount, 1, 'Expected only one file upload, not separate main and raw JSON files');

      // Assert file is uploaded to raw_responses/ folder
      assertExists(uploadedPath, 'Expected uploadedPath to be set');
      if (uploadedPath === null) {
        throw new Error('uploadedPath is null');
      }
      const verifiedPath: string = uploadedPath;
      assert(verifiedPath.includes('/raw_responses/'), `Expected path to include '/raw_responses/', got: ${verifiedPath}`);

      // Assert filename is {modelSlug}_{attemptCount}_{documentKey}_raw.json
      const expectedFileNamePattern = /claude-3-sonnet_\d+_business_case_raw\.json/;
      assert(expectedFileNamePattern.test(verifiedPath), `Expected filename pattern {modelSlug}_{attemptCount}_{documentKey}_raw.json, got: ${verifiedPath}`);

      // Assert upload uses contentType: "application/json"
      assertEquals(uploadedContentType, 'application/json', 'Expected contentType to be application/json');

      // Assert uploaded content is the validated JSON string
      assertEquals(uploadedContent, validatedJsonString, 'Expected uploaded content to be the validated JSON string');

      const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
      assertExists(insertSpy);
      const insertData = insertSpy.calls[0].args[0];

      // Assert contribution record has storage_path, file_name, and raw_response_storage_path all pointing to the same file
      const expectedFullStoragePath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
      assertEquals(insertData.storage_path, expectedPathParts.storagePath, 'storage_path should point to the raw_responses directory');
      assertEquals(insertData.file_name, expectedPathParts.fileName, 'file_name should be the _raw.json filename');
      assertEquals(insertData.raw_response_storage_path, expectedFullStoragePath, 'raw_response_storage_path should point to the same file as storage_path/file_name');

      // Assert mime_type field is "application/json"
      assertEquals(insertData.mime_type, 'application/json', 'mime_type should be application/json');

    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile should handle continuation paths correctly with FileType.ModelContributionRawJson', async () => {
    try {
      const pathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-continuation-raw-json',
        sessionId: 'session-continuation-raw-json',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        documentKey: 'business_case',
        isContinuation: true,
        turnIndex: 2,
      };
      const expectedPathParts = constructStoragePath({
        ...pathContext,
        isContinuation: true,
        turnIndex: 2,
        attemptCount: 0,
      });
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

      const validatedJsonString = '{"content": "# Business Case Continuation\\n\\nMore content."}';

      const contributionDataMock = { id: 'contrib-continuation-raw-json-123', file_name: expectedPathParts.fileName };
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [contributionDataMock], error: null },
          },
        },
        storageMock: {
          uploadResult: { data: { path: expectedFullPath }, error: null },
        },
      };
      beforeEach(config);

      let uploadedPath: string | null = null;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalUpload = bucket.upload;
        bucket.upload = async (path: string, content: unknown, options?: IMockStorageFileOptions) => {
          uploadedPath = path;
          return { data: { path }, error: null };
        };
        return bucket;
      };

      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-continuation-raw-json',
        stageSlug: 'thesis',
        target_contribution_id: 'parent-contrib-id-123',
      };

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: validatedJsonString,
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(error, null);
      assertExists(record);
      assertEquals(record?.id, 'contrib-continuation-raw-json-123');

      // Assert file is uploaded to _work/raw_responses/ folder (continuation path)
      assertExists(uploadedPath, 'Expected uploadedPath to be set');
      if (uploadedPath === null) {
        throw new Error('uploadedPath is null');
      }
      const verifiedPath: string = uploadedPath;
      assert(verifiedPath.includes('/_work/raw_responses/'), `Expected path to include '/_work/raw_responses/', got: ${verifiedPath}`);

      // Assert filename includes _continuation_2 suffix
      assert(verifiedPath.includes('_continuation_2'), `Expected filename to include '_continuation_2' suffix, got: ${verifiedPath}`);

      // Use getHistoricQueryBuilderSpies to get the insert spy, since getLatestQueryBuilderSpies
      // might return the update spy (which is called after insert to clear parent latest_edit)
      const insertHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'insert');
      assertExists(insertHistory, 'Expected insert spy history to exist');
      assert(insertHistory.callCount > 0, 'Expected insert spy to have been called');
      assert(insertHistory.callsArgs.length > 0, 'Expected insert spy to have call arguments');
      const insertDataRaw = insertHistory.callsArgs[0][0];
      assert(isRecord(insertDataRaw), 'Expected insertData to be a record');
      const insertData = insertDataRaw;

      // Assert continuation logic still works correctly
      assertEquals(insertData.target_contribution_id, 'parent-contrib-id-123', 'target_contribution_id should be set for continuation');

      // Assert all paths point to the same continuation file
      const expectedFullStoragePath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
      assertEquals(insertData.storage_path, expectedPathParts.storagePath, 'storage_path should point to continuation directory');
      assertEquals(insertData.file_name, expectedPathParts.fileName, 'file_name should be the continuation filename');
      assertEquals(insertData.raw_response_storage_path, expectedFullStoragePath, 'raw_response_storage_path should point to the same continuation file');

    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile should return error when fileContent is missing for model contribution', async () => {
    try {
      const pathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-missing-content',
        sessionId: 'session-missing-content',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        documentKey: 'business_case',
      };

      beforeEach();

      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-missing-content',
        stageSlug: 'thesis',
      };

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: '', // Missing fileContent
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      // This test should pass initially - fileContent is required
      // The function should return an error when fileContent is missing
      assertExists(error, 'Expected error when fileContent is missing');
      assertEquals(record, null, 'Expected no record when fileContent is missing');

    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile should NOT execute separate raw JSON upload block when fileContent is present', async () => {
    try {
      const pathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-no-separate-upload',
        sessionId: 'session-no-separate-upload',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        attemptCount: 0,
        documentKey: 'business_case',
      };
      const expectedPathParts = constructStoragePath(pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

      const validatedJsonString = '{"content": "# Business Case\\n\\nContent."}';

      const contributionDataMock = { id: 'contrib-no-separate-123', file_name: expectedPathParts.fileName };
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: { data: [contributionDataMock], error: null },
          },
        },
        storageMock: {
          uploadResult: { data: { path: expectedFullPath }, error: null },
        },
      };
      beforeEach(config);

      let uploadCallCount = 0;
      const uploadedPaths: string[] = [];

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalUpload = bucket.upload;
        bucket.upload = async (path: string, content: unknown, options?: IMockStorageFileOptions) => {
          uploadCallCount++;
          uploadedPaths.push(path);
          return { data: { path }, error: null };
        };
        return bucket;
      };

      const contributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-no-separate-upload',
        stageSlug: 'thesis',
        // Include rawJsonResponseContent to test that separate upload block is NOT executed
      };

      const context: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext,
        fileContent: validatedJsonString, // fileContent IS the raw JSON
        mimeType: 'application/json',
        contributionMetadata,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(error, null);
      assertExists(record);

      // Assert only ONE file was uploaded (the fileContent, not a separate raw JSON file)
      assertEquals(uploadCallCount, 1, `Expected only ONE file upload, but got ${uploadCallCount} uploads. The separate raw JSON upload block should NOT execute.`);

      // Assert the uploaded file is the fileContent (not the rawJsonResponseContent)
      assert(uploadedPaths.length === 1, `Expected exactly one upload, got ${uploadedPaths.length}`);
      assert(uploadedPaths[0] === expectedFullPath, `Expected upload to ${expectedFullPath}, got ${uploadedPaths[0]}`);

      // Assert raw_response_storage_path points to the same file (not a separate file)
      const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
      assertExists(insertSpy);
      const insertData = insertSpy.calls[0].args[0];
      const expectedFullStoragePath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
      assertEquals(insertData.raw_response_storage_path, expectedFullStoragePath, 'raw_response_storage_path should point to the same file as storage_path/file_name, not a separate file');

    } finally {
      afterEach();
    }
  });

  await t.step('PostgrestError case returns PostgrestError directly', async () => {
    try {
      const context: ResourceUploadContext = {
        pathContext: {
          fileType: FileType.GeneralResource,
          projectId: 'project-uuid-test',
          sessionId: 'session-uuid-test',
          iteration: 1,
          originalFileName: 'test-resource.txt',
        },
        fileContent: 'test content',
        mimeType: 'text/plain',
        sizeBytes: 100,
        userId: 'user-uuid-test',
        description: 'test resource',
      };

      const expectedPathParts = constructStoragePath(context.pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;

      const postgrestErrorObject: PostgrestError = {
        message: 'insert or update on table "dialectic_project_resources" violates foreign key constraint',
        code: '23503',
        details: 'Key (source_contribution_id)=(test-id) is not present in table "dialectic_contributions".',
        hint: 'Ensure the referenced record exists.',
        name: 'PostgrestError',
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            upsert: { data: null, error: postgrestErrorObject },
          },
        },
        storageMock: {
          uploadResult: { data: { path: expectedFullPath }, error: null },
          listResult: { data: [{ name: expectedPathParts.fileName }], error: null },
          removeResult: { data: [], error: null },
        },
      };
      beforeEach(config);

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(record, null);
      assertExists(error);
      // When upload succeeds but DB fails, PostgrestError is wrapped with descriptive message
      if (isPostgrestError(error)) {
        // If somehow PostgrestError is returned directly, verify it has the expected properties
        assertExists(error.details);
        assert(typeof error.details === 'string', 'error.details must be a string');
        assertEquals(error.code, '23503');
        assertEquals(error.details, 'Key (source_contribution_id)=(test-id) is not present in table "dialectic_contributions".');
        assertEquals(error.message, 'insert or update on table "dialectic_project_resources" violates foreign key constraint');
      } else if (isServiceError(error)) {
        // Expected: wrapped error when upload succeeds
        assertEquals(error.message, 'Database registration failed after successful upload.');
        assertExists(error.details);
        const detailsText = String(error.details);
        // Details should contain either the error code, the details text, or the message
        assert(
          detailsText.includes('23503') || 
          detailsText.includes('foreign key') || 
          detailsText.includes('Key (source_contribution_id)') ||
          detailsText.includes('dialectic_contributions')
        );
      } else {
        assert(false, 'Expected PostgrestError or ServiceError');
      }
    } finally {
      afterEach();
    }
  });

  await t.step('PostgrestError with code and details returns PostgrestError directly', async () => {
    try {
      const context: ResourceUploadContext = {
        pathContext: {
          fileType: FileType.GeneralResource,
          projectId: 'project-uuid-test',
          sessionId: 'session-uuid-test',
          iteration: 1,
          originalFileName: 'test-resource.txt',
        },
        fileContent: 'test content',
        mimeType: 'text/plain',
        sizeBytes: 100,
        userId: 'user-uuid-test',
        description: 'test resource',
      };

      const expectedPathParts = constructStoragePath(context.pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
        const postgrestErrorObject: PostgrestError = {
          message: 'Failed to connect to database',
          code: 'DB_ERROR',
          details: 'Database connection timeout',
          hint: '',
          name: 'PostgrestError',
        };

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: null, error: postgrestErrorObject },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null },
            listResult: { data: [{ name: expectedPathParts.fileName }], error: null },
            removeResult: { data: [], error: null },
          },
        };
        beforeEach(config);

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(record, null);
        assertExists(error);
        // When upload succeeds but DB fails, PostgrestError is wrapped with descriptive message
        if (isPostgrestError(error)) {
          assertExists(error.details);
          assert(typeof error.details === 'string', 'error.details must be a string');
          assertEquals(error.code, 'DB_ERROR');
          assertEquals(error.details, 'Database connection timeout');
          assertEquals(error.message, 'Failed to connect to database');
        } else if (isServiceError(error)) {
          // Expected: wrapped error when upload succeeds
          assertEquals(error.message, 'Database registration failed after successful upload.');
          assertExists(error.details);
          const detailsText = String(error.details);
          assert(detailsText.includes('DB_ERROR') || detailsText.includes('Database connection timeout'));
        } else {
          assert(false, 'Expected PostgrestError or ServiceError');
        }
      } finally {
        afterEach();
      }
    });

  await t.step('PostgrestError without code and details returns PostgrestError directly', async () => {
    try {
      const context: ResourceUploadContext = {
        pathContext: {
          fileType: FileType.GeneralResource,
          projectId: 'project-uuid-test',
          sessionId: 'session-uuid-test',
          iteration: 1,
          originalFileName: 'test-resource.txt',
        },
        fileContent: 'test content',
        mimeType: 'text/plain',
        sizeBytes: 100,
        userId: 'user-uuid-test',
        description: 'test resource',
      };

      const expectedPathParts = constructStoragePath(context.pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
        const postgrestErrorObject: PostgrestError = {
          message: 'Simple error message',
          code: '',
          details: '',
          hint: '',
          name: 'PostgrestError',
        };

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: null, error: postgrestErrorObject },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null },
            listResult: { data: [{ name: expectedPathParts.fileName }], error: null },
            removeResult: { data: [], error: null },
          },
        };
        beforeEach(config);

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(record, null);
        assertExists(error);
        // When upload succeeds but DB fails, PostgrestError is wrapped with descriptive message
        if (isPostgrestError(error)) {
          assertExists(error.details);
          assert(typeof error.details === 'string', 'error.details must be a string');
          assertEquals(error.code, '');
          assertEquals(error.details, '');
          assertEquals(error.message, 'Simple error message');
        } else if (isServiceError(error)) {
          // Expected: wrapped error when upload succeeds
          assertEquals(error.message, 'Database registration failed after successful upload.');
          assertExists(error.details);
          const detailsText = String(error.details);
          assert(detailsText.includes('Simple error message') || detailsText.length > 0);
        } else {
          assert(false, 'Expected PostgrestError or ServiceError');
        }
      } finally {
        afterEach();
      }
    });

  await t.step('Error instance returns ServiceError with wrapped message', async () => {
    try {
      const context: ResourceUploadContext = {
        pathContext: {
          fileType: FileType.GeneralResource,
          projectId: 'project-uuid-test',
          sessionId: 'session-uuid-test',
          iteration: 1,
          originalFileName: 'test-resource.txt',
        },
        fileContent: 'test content',
        mimeType: 'text/plain',
        sizeBytes: 100,
        userId: 'user-uuid-test',
        description: 'test resource',
      };

      const expectedPathParts = constructStoragePath(context.pathContext);
      const expectedFullPath = `${expectedPathParts.storagePath}/${expectedPathParts.fileName}`;
        const errorInstance: Error = new Error('Generic error occurred');

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_project_resources: {
              upsert: { data: null, error: errorInstance },
            },
          },
          storageMock: {
            uploadResult: { data: { path: expectedFullPath }, error: null },
            listResult: { data: [{ name: expectedPathParts.fileName }], error: null },
            removeResult: { data: [], error: null },
          },
        };
        beforeEach(config);

        const { record, error } = await fileManager.uploadAndRegisterFile(context);

        assertEquals(record, null);
        assertExists(error);
        // Error instance should be converted to ServiceError
        assert(isServiceError(error), 'Expected ServiceError for Error instance conversion');
        assertEquals(error.message, 'Database registration failed after successful upload.');
        if (error.details && typeof error.details === 'string') {
          assertEquals(error.details, 'Generic error occurred');
        }
      } finally {
        afterEach();
      }
    });

  await t.step('root file is corrupted when continuation chunk uploads after root chunk', async () => {
    try {
      // 14.c.i: Create a mock storage that tracks all upload calls
      const storageFiles = new Map<string, string>(); // path -> content
      
      const rootContent = '{"content":"# Root Chunk"}';
      const continuationContent = '{"content":"\\n\\n## Continuation"}';

      // Setup root chunk path context
      const rootPathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-corruption-test',
        sessionId: 'session-corruption-test',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        attemptCount: 0,
        documentKey: 'business_case',
        isContinuation: false,
        turnIndex: undefined,
      };
      const rootPathParts = constructStoragePath(rootPathContext);
      const rootFullPath = `${rootPathParts.storagePath}/${rootPathParts.fileName}`;

      // Setup continuation chunk path context
      const continuationPathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-corruption-test',
        sessionId: 'session-corruption-test',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        documentKey: 'business_case',
        isContinuation: true,
        turnIndex: 1,
      };
      const continuationPathParts = constructStoragePath({
        ...continuationPathContext,
        attemptCount: 0,
      });
      const continuationFullPath = `${continuationPathParts.storagePath}/${continuationPathParts.fileName}`;

      const rootContributionId = 'root-contrib-123';
      const continuationContributionId = 'continuation-contrib-456';

      const insertCallState = { count: 0 };
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: async (state) => {
              insertCallState.count++;
              if (insertCallState.count === 1) {
                return { data: [{ id: rootContributionId }], error: null };
              } else if (insertCallState.count === 2) {
                return { data: [{ id: continuationContributionId }], error: null };
              }
              return { data: [{ id: rootContributionId }], error: null };
            },
          },
        },
      };
      beforeEach(config);

      // Override storage.upload to track uploads
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalUpload = bucket.upload;
        bucket.upload = async (path: string, content: unknown, options?: IMockStorageFileOptions) => {
          let contentString: string;
          if (typeof content === 'string') {
            contentString = content;
          } else if (content instanceof ArrayBuffer) {
            contentString = new TextDecoder().decode(content);
          } else if (content instanceof Buffer) {
            contentString = content.toString('utf-8');
          } else {
            contentString = String(content);
          }
          storageFiles.set(path, contentString);
          return { data: { path }, error: null };
        };
        return bucket;
      };

      // 1. Create and upload root chunk
      const rootContributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-corruption-test',
        stageSlug: 'thesis',
      };

      const rootContext: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext: rootPathContext,
        fileContent: rootContent,
        mimeType: 'application/json',
        contributionMetadata: rootContributionMetadata,
      };

      const rootResult = await fileManager.uploadAndRegisterFile(rootContext);
      assertEquals(rootResult.error, null);
      assertExists(rootResult.record);
      assertEquals(rootResult.record.id, rootContributionId);

      // Capture root file's storage path
      const rootInsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
      assertExists(rootInsertSpy);
      const rootInsertDataRaw = rootInsertSpy.calls[0]?.args[0];
      assertExists(rootInsertDataRaw);
      assert(isRecord(rootInsertDataRaw), 'rootInsertDataRaw should be a record');
      assert('raw_response_storage_path' in rootInsertDataRaw, 'rootInsertDataRaw should have raw_response_storage_path');
      const rootStoragePathValue = rootInsertDataRaw.raw_response_storage_path;
      assert(typeof rootStoragePathValue === 'string', 'raw_response_storage_path should be a string');
      const rootStoragePath = rootStoragePathValue;
      assertExists(rootStoragePath);

      // 2. Create and upload continuation chunk
      const continuationContributionMetadata: ContributionMetadata = {
        target_contribution_id: rootContributionId,
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-corruption-test',
        stageSlug: 'thesis',
      };

      const continuationContext: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext: continuationPathContext,
        fileContent: continuationContent,
        mimeType: 'application/json',
        contributionMetadata: continuationContributionMetadata,
      };

      const continuationResult = await fileManager.uploadAndRegisterFile(continuationContext);
      assertEquals(continuationResult.error, null);
      assertExists(continuationResult.record);
      assertEquals(continuationResult.record.id, continuationContributionId);

      // 3. Query mock storage to get root file's content
      const rootFileContent = storageFiles.get(rootStoragePath);
      assertExists(rootFileContent, `Root file should exist at path: ${rootStoragePath}`);

      // 4. Assert root file's content equals rootContent (not concatenated)
      assertEquals(rootFileContent, rootContent, 'Root file content should not be corrupted');

      // 5. Query mock storage to get continuation file's content
      const continuationInsertHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'insert');
      assertExists(continuationInsertHistory, 'Expected insert spy history to exist');
      assert(continuationInsertHistory.callCount >= 2, 'Expected at least 2 insert calls (root and continuation)');
      const continuationInsertDataRaw = continuationInsertHistory.callsArgs[continuationInsertHistory.callsArgs.length - 1][0];
      assertExists(continuationInsertDataRaw);
      assert(isRecord(continuationInsertDataRaw), 'continuationInsertDataRaw should be a record');
      assert('raw_response_storage_path' in continuationInsertDataRaw, 'continuationInsertDataRaw should have raw_response_storage_path');
      const rawResponseStoragePathValue = continuationInsertDataRaw.raw_response_storage_path;
      assert(typeof rawResponseStoragePathValue === 'string', 'raw_response_storage_path should be a string');
      const continuationStoragePath = rawResponseStoragePathValue;
      assertExists(continuationStoragePath);
      const continuationFileContent = storageFiles.get(continuationStoragePath);
      assertExists(continuationFileContent, `Continuation file should exist at path: ${continuationStoragePath}`);

      // 6. Assert continuation file's content equals continuationContent
      assertEquals(continuationFileContent, continuationContent, 'Continuation file content should match');

      // 7. Assert root file's content does NOT equal continuation file's content
      assert(rootFileContent !== continuationFileContent, 'Root and continuation files should have different content');

      // 8. Verify from mock storage that no upload attempt targeted the root file's path during continuation chunk upload
      // Check all storage files to ensure no continuation upload targeted root path
      const allUploadPaths = Array.from(storageFiles.keys());
      const continuationUploadPaths = allUploadPaths.filter(path => path !== rootStoragePath);
      assert(continuationUploadPaths.length > 0, 'Continuation chunk should have uploaded to its own path');
      assert(!continuationUploadPaths.includes(rootStoragePath), 'Continuation chunk should not attempt to upload to root file path');

    } finally {
      afterEach();
    }
  });

  await t.step('continuation chunk upload attempts are logged with correct path context', async () => {
    try {
      // 14.c.ii: Create a mock logger that captures all log calls
      const logCalls: string[] = [];
      const originalConsoleLog = console.log;
      console.log = (...args: unknown[]) => {
        const logMessage = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
        logCalls.push(logMessage);
        originalConsoleLog(...args);
      };

      try {
        const rootContent = '{"content":"# Root Chunk"}';
        const continuationContent = '{"content":"\\n\\n## Continuation"}';

        const rootPathContext: ModelContributionUploadContext['pathContext'] = {
          fileType: FileType.ModelContributionRawJson,
          projectId: 'project-logging-test',
          sessionId: 'session-logging-test',
          iteration: 1,
          stageSlug: 'thesis',
          modelSlug: 'claude-3-sonnet',
          attemptCount: 0,
          documentKey: 'business_case',
          isContinuation: false,
          turnIndex: undefined,
        };

        const continuationPathContext: ModelContributionUploadContext['pathContext'] = {
          fileType: FileType.ModelContributionRawJson,
          projectId: 'project-logging-test',
          sessionId: 'session-logging-test',
          iteration: 1,
          stageSlug: 'thesis',
          modelSlug: 'claude-3-sonnet',
          documentKey: 'business_case',
          isContinuation: true,
          turnIndex: 1,
        };

        const rootContributionId = 'root-contrib-logging-123';
        const continuationContributionId = 'continuation-contrib-logging-456';

        const insertCallState = { count: 0 };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              insert: async (state) => {
                insertCallState.count++;
                if (insertCallState.count === 1) {
                  return { data: [{ id: rootContributionId }], error: null };
                } else if (insertCallState.count === 2) {
                  return { data: [{ id: continuationContributionId }], error: null };
                }
                return { data: [{ id: rootContributionId }], error: null };
              },
            },
          },
        };
        beforeEach(config);

        // 1. Create and upload root chunk
        const rootContributionMetadata: ContributionMetadata = {
          iterationNumber: 1,
          modelIdUsed: 'model-id-sonnet',
          modelNameDisplay: 'Claude 3 Sonnet',
          sessionId: 'session-logging-test',
          stageSlug: 'thesis',
        };

        const rootContext: ModelContributionUploadContext = {
          ...baseUploadContext,
          pathContext: rootPathContext,
          fileContent: rootContent,
          mimeType: 'application/json',
          contributionMetadata: rootContributionMetadata,
        };

        await fileManager.uploadAndRegisterFile(rootContext);

        // 2. Create and upload continuation chunk
        const continuationContributionMetadata: ContributionMetadata = {
          target_contribution_id: rootContributionId,
          iterationNumber: 1,
          modelIdUsed: 'model-id-sonnet',
          modelNameDisplay: 'Claude 3 Sonnet',
          sessionId: 'session-logging-test',
          stageSlug: 'thesis',
        };

        const continuationContext: ModelContributionUploadContext = {
          ...baseUploadContext,
          pathContext: continuationPathContext,
          fileContent: continuationContent,
          mimeType: 'application/json',
          contributionMetadata: continuationContributionMetadata,
        };

        await fileManager.uploadAndRegisterFile(continuationContext);

        // 3. Verify logger captured upload attempt logs for continuation chunk
        const continuationLogs = logCalls.filter(log => 
          log.includes('[FileManagerService] UPLOAD_ATTEMPT') && 
          log.includes('isContinuation=true')
        );
        assert(continuationLogs.length > 0, 'Expected upload attempt logs for continuation chunk');

        // 4. Verify each log entry includes required fields
        for (const log of continuationLogs) {
          assert(log.includes('attemptCount='), 'Log should include attemptCount');
          assert(log.includes('isContinuation=true'), 'Log should include isContinuation=true');
          assert(log.includes('turnIndex=1'), 'Log should include turnIndex=1');
          assert(log.includes('fullPathForUpload='), 'Log should include fullPathForUpload');
          assert(log.includes('fileContentLength='), 'Log should include fileContentLength');
        }

        // 5. Verify that no upload attempt log shows a path matching the root chunk's path
        const rootPathParts = constructStoragePath(rootPathContext);
        const rootFullPath = `${rootPathParts.storagePath}/${rootPathParts.fileName}`;
        const logsWithRootPath = continuationLogs.filter(log => log.includes(rootFullPath));
        assertEquals(logsWithRootPath.length, 0, 'No continuation upload attempt should target root chunk path');

        // 6. Verify that all upload attempt paths for continuation chunk include /_work/raw_responses/ and _continuation_1 suffix
        const continuationPathParts = constructStoragePath({
          ...continuationPathContext,
          attemptCount: 0,
        });
        const continuationFullPath = `${continuationPathParts.storagePath}/${continuationPathParts.fileName}`;
        const logsWithContinuationPath = continuationLogs.filter(log => 
          log.includes('/_work/raw_responses/') && log.includes('_continuation_1')
        );
        assert(logsWithContinuationPath.length > 0, 'Continuation upload attempts should include /_work/raw_responses/ and _continuation_1 suffix');

      } finally {
        console.log = originalConsoleLog;
      }
    } finally {
      afterEach();
    }
  });

  await t.step('continuation chunk upload with collision retry does not corrupt root file', async () => {
    try {
      // 14.c.iii: Create a mock storage that returns 409 collision errors for first attempt, then succeeds
      const storageFiles = new Map<string, string>(); // path -> content
      
      const rootContent = '{"content":"# Root Chunk"}';
      const continuationContent = '{"content":"\\n\\n## Continuation"}';

      const rootPathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-collision-test',
        sessionId: 'session-collision-test',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        attemptCount: 0,
        documentKey: 'business_case',
        isContinuation: false,
        turnIndex: undefined,
      };
      const rootPathParts = constructStoragePath(rootPathContext);
      const rootFullPath = `${rootPathParts.storagePath}/${rootPathParts.fileName}`;

      const continuationPathContext: ModelContributionUploadContext['pathContext'] = {
        fileType: FileType.ModelContributionRawJson,
        projectId: 'project-collision-test',
        sessionId: 'session-collision-test',
        iteration: 1,
        stageSlug: 'thesis',
        modelSlug: 'claude-3-sonnet',
        documentKey: 'business_case',
        isContinuation: true,
        turnIndex: 1,
      };

      // Calculate paths for attempt 0 (collision) and attempt 1 (success)
      const continuationPathParts0 = constructStoragePath({
        ...continuationPathContext,
        attemptCount: 0,
      });
      const continuationFullPath0 = `${continuationPathParts0.storagePath}/${continuationPathParts0.fileName}`;

      const continuationPathParts1 = constructStoragePath({
        ...continuationPathContext,
        attemptCount: 1,
      });
      const continuationFullPath1 = `${continuationPathParts1.storagePath}/${continuationPathParts1.fileName}`;

      const rootContributionId = 'root-contrib-collision-123';
      const continuationContributionId = 'continuation-contrib-collision-456';

      const insertCallState = { count: 0 };
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            insert: async (state) => {
              insertCallState.count++;
              if (insertCallState.count === 1) {
                return { data: [{ id: rootContributionId }], error: null };
              } else if (insertCallState.count === 2) {
                return { data: [{ id: continuationContributionId }], error: null };
              }
              return { data: [{ id: rootContributionId }], error: null };
            },
          },
        },
      };
      beforeEach(config);

      let uploadCallCount = 0;
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalUpload = bucket.upload;
        bucket.upload = async (path: string, content: unknown, options?: IMockStorageFileOptions) => {
          uploadCallCount++;
          let contentString: string;
          if (typeof content === 'string') {
            contentString = content;
          } else if (content instanceof ArrayBuffer) {
            contentString = new TextDecoder().decode(content);
          } else if (content instanceof Buffer) {
            contentString = content.toString('utf-8');
          } else {
            contentString = String(content);
          }

          // For continuation chunk, return 409 on first attempt (attemptCount=0), success on second (attemptCount=1)
          if (path === continuationFullPath0 && uploadCallCount === 2) {
            return { error: { message: 'The resource already exists', name: 'StorageConflict', statusCode: '409' }, data: null };
          }
          if (path === continuationFullPath1 && uploadCallCount === 3) {
            storageFiles.set(path, contentString);
            return { data: { path }, error: null };
          }

          // For root chunk, always succeed
          if (path === rootFullPath) {
            storageFiles.set(path, contentString);
            return { data: { path }, error: null };
          }

          // Default: succeed
          storageFiles.set(path, contentString);
          return { data: { path }, error: null };
        };
        return bucket;
      };

      // 1. Create and upload root chunk
      const rootContributionMetadata: ContributionMetadata = {
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-collision-test',
        stageSlug: 'thesis',
      };

      const rootContext: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext: rootPathContext,
        fileContent: rootContent,
        mimeType: 'application/json',
        contributionMetadata: rootContributionMetadata,
      };

      const rootResult = await fileManager.uploadAndRegisterFile(rootContext);
      assertEquals(rootResult.error, null);
      assertExists(rootResult.record);
      assertEquals(rootResult.record.id, rootContributionId);

      const rootInsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert;
      assertExists(rootInsertSpy);
      const rootInsertDataRaw = rootInsertSpy.calls[0]?.args[0];
      assertExists(rootInsertDataRaw);
      assert(isRecord(rootInsertDataRaw), 'rootInsertDataRaw should be a record');
      assert('raw_response_storage_path' in rootInsertDataRaw, 'rootInsertDataRaw should have raw_response_storage_path');
      const rootStoragePathValue = rootInsertDataRaw.raw_response_storage_path;
      assert(typeof rootStoragePathValue === 'string', 'raw_response_storage_path should be a string');
      const rootStoragePath = rootStoragePathValue;
      assertExists(rootStoragePath);

      // 2. Create and upload continuation chunk (will trigger collision retry)
      const continuationContributionMetadata: ContributionMetadata = {
        target_contribution_id: rootContributionId,
        iterationNumber: 1,
        modelIdUsed: 'model-id-sonnet',
        modelNameDisplay: 'Claude 3 Sonnet',
        sessionId: 'session-collision-test',
        stageSlug: 'thesis',
      };

      const continuationContext: ModelContributionUploadContext = {
        ...baseUploadContext,
        pathContext: continuationPathContext,
        fileContent: continuationContent,
        mimeType: 'application/json',
        contributionMetadata: continuationContributionMetadata,
      };

      const continuationResult = await fileManager.uploadAndRegisterFile(continuationContext);
      assertEquals(continuationResult.error, null);
      assertExists(continuationResult.record);
      assertEquals(continuationResult.record.id, continuationContributionId);

      // 3. Verify root file's content is still correct (not corrupted)
      const rootFileContent = storageFiles.get(rootStoragePath);
      assertExists(rootFileContent, `Root file should exist at path: ${rootStoragePath}`);
      assertEquals(rootFileContent, rootContent, 'Root file content should not be corrupted after continuation chunk upload with collision retry');

      // 4. Verify continuation chunk's database record shows correct path (with attemptCount=1 in filename)
      const continuationInsertHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'insert');
      assertExists(continuationInsertHistory, 'Expected insert spy history to exist');
      assert(continuationInsertHistory.callCount >= 2, 'Expected at least 2 insert calls (root and continuation)');
      const continuationInsertDataRaw = continuationInsertHistory.callsArgs[continuationInsertHistory.callsArgs.length - 1][0];
      assertExists(continuationInsertDataRaw);
      assert(isRecord(continuationInsertDataRaw), 'continuationInsertDataRaw should be a record');
      assert('raw_response_storage_path' in continuationInsertDataRaw, 'continuationInsertDataRaw should have raw_response_storage_path');
      const rawResponseStoragePathValue = continuationInsertDataRaw.raw_response_storage_path;
      assert(typeof rawResponseStoragePathValue === 'string', 'raw_response_storage_path should be a string');
      const continuationStoragePath = rawResponseStoragePathValue;
      assertExists(continuationStoragePath);
      assert(continuationStoragePath.includes('_1_'), 'Continuation chunk path should include attemptCount=1 in filename');

      // 5. Verify from mock storage that first upload attempt (attemptCount=0) targeted a path that does NOT match root chunk's path
      assert(continuationFullPath0 !== rootFullPath, 'First continuation upload attempt should target a different path than root chunk');

      // 6. Verify second upload attempt (attemptCount=1) succeeded and targeted continuation chunk's unique path
      const continuationFileContent = storageFiles.get(continuationFullPath1);
      assertExists(continuationFileContent, `Continuation file should exist at path: ${continuationFullPath1}`);
      assertEquals(continuationFileContent, continuationContent, 'Continuation file content should match');

    } finally {
      afterEach();
    }
  });

  await t.step('should correctly upload and register a ResourceUploadContext file', async () => {
    beforeEach({
      genericMockResults: {
        dialectic_project_resources: {
          upsert: {
            data: [{
              id: 'resource-uuid-123',
              project_id: 'project-uuid-123',
              session_id: 'session-uuid-456',
              user_id: 'user-uuid-789',
              stage_slug: 'test-stage',
              iteration_number: 1,
              resource_type: 'rendered_document',
              file_name: 'test-file.md',
              mime_type: 'text/markdown',
              size_bytes: 12,
              storage_bucket: 'test-bucket',
              storage_path: 'project-uuid-123/session-uuid-456/iteration_1/test-stage/documents',
              resource_description: {},
              source_contribution_id: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }], error: null, count: 1, status: 201, statusText: 'Created'
          }
        }
      }
    });

    try {

      const pathContext: ResourceUploadContext['pathContext'] = {
        fileType: FileType.RenderedDocument,
        projectId: 'project-uuid-123',
        sessionId: 'session-uuid-456',
        iteration: 1,
        stageSlug: 'test-stage',
        documentKey: 'test-doc',
        modelSlug: 'test-model',
        attemptCount: 0,
      };
      const resourceContext: ResourceUploadContext = {
        pathContext: pathContext,
        fileContent: 'test content',
        mimeType: 'text/markdown',
        sizeBytes: 12,
        userId: 'user-uuid-789',
        description: 'A rendered document',
        resourceTypeForDb: FileType.RenderedDocument,
      };

      const expectedPathParts = constructStoragePath(resourceContext.pathContext);

      const result = await fileManager.uploadAndRegisterFile(resourceContext);

      assertEquals(result.error, null);
      assertExists(result.record);

      const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert;
      assertExists(upsertSpy, "Upsert spy for 'dialectic_project_resources' should exist");
      assertEquals(upsertSpy.calls.length, 1, "Upsert should have been called once");
      
      const upsertArg = upsertSpy.calls[0].args[0];
      assert(isRecord(upsertArg), "Upsert argument should be a record object");

      assert('file_name' in upsertArg, "Upsert argument must have a file_name property");
      assert('storage_path' in upsertArg, "Upsert argument must have a storage_path property");

      assertEquals(upsertArg.file_name, expectedPathParts.fileName, "file_name in upsert data is incorrect");
      assertEquals(upsertArg.storage_path, expectedPathParts.storagePath, "storage_path in upsert data is incorrect");

    } finally {
      afterEach();
    }
  });

  await t.step('uploadAndRegisterFile resource_description includes merged resourceDescriptionForDb when provided (step 10.c.i)', async () => {
    try {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_project_resources: {
            upsert: { data: [{ id: 'resource-merged-desc-id' }], error: null },
          },
        },
      };
      beforeEach(config);

      const extraFields: { documentKey: string; sourceContributionId: string } = {
        documentKey: 'feature_spec',
        sourceContributionId: 'contrib-uuid-merge-test',
      };
      const resourceDescriptionForDb: Json = extraFields;

      const pathContext: ResourceUploadContext['pathContext'] = {
        fileType: FileType.RenderedDocument,
        projectId: 'project-uuid-123',
        sessionId: 'session-uuid-456',
        iteration: 1,
        stageSlug: 'thesis',
        documentKey: 'feature_spec',
        modelSlug: 'test-model',
        attemptCount: 0,
      };

      const context: ResourceUploadContext = {
        ...baseUploadContext,
        pathContext,
        description: 'Rendered document for feature spec',
        resourceDescriptionForDb,
      };

      const { record, error } = await fileManager.uploadAndRegisterFile(context);

      assertEquals(error, null);
      assertExists(record);

      const upsertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.upsert;
      assertExists(upsertSpy);
      const upsertArgs = upsertSpy.calls[0].args;
      const insertData = upsertArgs[0];

      assert(isRecord(insertData.resource_description), 'resource_description should be an object');
      const desc: Record<string, unknown> = insertData.resource_description;
      assertEquals(desc.type, context.pathContext.fileType, 'resource_description must preserve type');
      assertEquals(desc.originalDescription, context.description, 'resource_description must preserve originalDescription');
      assertEquals(desc.documentKey, extraFields.documentKey, 'resource_description must include merged resourceDescriptionForDb.documentKey');
      assertEquals(desc.sourceContributionId, extraFields.sourceContributionId, 'resource_description must include merged resourceDescriptionForDb.sourceContributionId');
    } finally {
      afterEach();
    }
  });
});



