import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertRejects,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts'
import { stub } from 'https://deno.land/std@0.190.0/testing/mock.ts'
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
  type MockSupabaseDataConfig,
} from '../supabase.mock.ts'
import { FileManagerService } from './file_manager.ts'
import type { UploadContext } from '../types/file_manager.types.ts'

Deno.test('FileManagerService', async (t) => {
  let setup: MockSupabaseClientSetup
  let fileManager: FileManagerService
  let envStub: any

  const beforeEach = (config: MockSupabaseDataConfig = {}) => {
    // Stub Deno.env.get to control the bucket name for tests
    envStub = stub(Deno.env, 'get', (key: string) => {
      if (key === 'CONTENT_STORAGE_BUCKET') {
        return 'test-bucket'
      }
      return Deno.env.get(key)
    })

    setup = createMockSupabaseClient('test-user-id', config)
    fileManager = new FileManagerService(setup.client as any)
  }

  const afterEach = () => {
    if (envStub) {
      envStub.restore()
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
      try {
        beforeEach()
        // Temporarily break the stub to test the constructor guard
        envStub.restore()
        envStub = stub(Deno.env, 'get', () => undefined)
        assertRejects(
          async () => new FileManagerService(setup.client as any),
          Error,
          'CONTENT_STORAGE_BUCKET environment variable is not set.',
        )
      } finally {
        afterEach()
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
        assertExists(storageFromSpy.calls[0])
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
              insert: { data: [{ id: 'resource-123' }], error: null },
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
          },
          description: 'A test PDF file.',
        }

        const { record, error } = await fileManager.uploadAndRegisterFile(context)

        assertEquals(error, null)
        assertExists(record)
        assertEquals(record?.id, 'resource-123')

        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_project_resources')
        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.insert
        const insertData = insertSpy?.calls[0].args[0] as any
        assertEquals(insertData.project_id, 'project-uuid-123')
        assertEquals(insertData.resource_description, 'A test PDF file.')
      } finally {
        afterEach()
      }
    },
  )

  await t.step(
    'uploadAndRegisterFile should register a contribution correctly',
    async () => {
      try {
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              insert: { data: [{ id: 'contrib-123' }], error: null },
            },
          },
        }
        beforeEach(config)

        const context: UploadContext = {
          ...baseUploadContext,
          pathContext: {
            fileType: 'model_contribution',
            projectId: 'project-uuid-123',
            sessionId: 'session-uuid-456',
            iteration: 2,
            stageSlug: '2_antithesis',
            modelSlug: 'claude-3-sonnet',
            originalFileName: 'claude_contribution.md',
          },
        }

        const { record, error } = await fileManager.uploadAndRegisterFile(context)

        assertEquals(error, null)
        assertExists(record)
        assertEquals(record?.id, 'contrib-123')
        assertEquals(setup.spies.fromSpy.calls[0].args[0], 'dialectic_contributions')
        const insertSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_contributions')?.insert
        const insertData = insertSpy?.calls[0].args[0] as any
        assertEquals(insertData.session_id, 'session-uuid-456')
        assertEquals(insertData.stage, '2_antithesis')
      } finally {
        afterEach()
      }
    },
  )

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
        assertEquals(error.message, 'Storage upload failed: Upload failed')

        // DB should not have been called
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
        }
        beforeEach(config)
        const removeSpy = setup.spies.storage.from('test-bucket').removeSpy

        const { record, error } = await fileManager.uploadAndRegisterFile(baseUploadContext)

        assertExists(error)
        assertEquals(record, null)
        assertEquals(error.message, 'Database insert failed: DB insert failed')
        assertEquals(removeSpy.calls.length, 1)
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

      assertEquals(error, null)
      assertEquals(signedUrl, 'http://mock.url/signed')
      const selectSpy = setup.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.select
      assertEquals(selectSpy?.calls.length, 1)
    } finally {
      afterEach()
    }
  })

  await t.step(
    'getFileSignedUrl should handle errors when file not found',
    async () => {
      try {
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              select: { data: null, error: new Error('Not found') },
            },
          },
        }
        beforeEach(config)

        const { signedUrl, error } = await fileManager.getFileSignedUrl(
          'file-id-not-found',
          'dialectic_contributions',
        )

        assertExists(error)
        assertEquals(signedUrl, null)
        assertEquals(error.message, 'File record not found.')
      } finally {
        afterEach()
      }
    },
  )
}) 