import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts'
import { stub, type Stub } from 'https://deno.land/std@0.190.0/testing/mock.ts'
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
  type MockSupabaseDataConfig,
} from '../supabase.mock.ts'
import { FileManagerService } from './file_manager.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types_db.ts'
import { constructStoragePath } from '../utils/path_constructor.ts'

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
    fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, { constructStoragePath })
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
      // Initialize spy before the call so it tracks the createSignedUrl call
      const storageBucket = setup.spies.storage.from('test-bucket');
      const createSignedUrlSpy = storageBucket.createSignedUrlSpy;
      
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

      // Verify the createSignedUrl call was made (spy was initialized before the call)
      assertExists(createSignedUrlSpy, "createSignedUrl spy should exist");
      assert(createSignedUrlSpy.calls.length > 0, "createSignedUrl should have been called");
      assertEquals(createSignedUrlSpy.calls[0].args[0], 'mock/feedback/path.txt');

    } finally {
      afterEach()
    }
  })
});