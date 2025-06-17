// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertNotEquals, assert, assertInstanceOf } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { spy, stub, restore } from "https://deno.land/std@0.190.0/testing/mock.ts";
import type { Spy } from "https://deno.land/std@0.190.0/testing/mock.ts";
import type { User } from "npm:@supabase/supabase-js";
import { uploadProjectResourceFileHandler } from "./uploadProjectResourceFile.ts";
import type { DialecticProjectResource } from "./dialectic.interface.ts";
import {
  createMockSupabaseClient,
} from "../_shared/supabase.mock.ts";
import { logger as testLoggerInstance, Logger } from "../_shared/logger.ts"; // Assuming default instance is fine
import type { MockSupabaseClientSetup, MockSupabaseDataConfig, MockQueryBuilderState, IMockStorageUploadResponse, IMockStorageBasicResponse } from "../_shared/supabase.mock.ts"; // For typing mock client setup

// Define testUserOwnsProject for use in this test file
const testUserOwnsProject: User = {
  id: "user-owns-project",
  aud: "authenticated",
  role: "authenticated",
  email: "user-owns-project@example.com",
  created_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
};

// Dummy user for tests that don't focus on specific user ownership but require a User object
const genericTestUser: User = {
  id: "test-user-generic",
  aud: "authenticated",
  role: "authenticated",
  email: "generic@example.com",
  created_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
};

// Mock DI Interfaces (should ideally be imported from a shared testing mock file)
// interface User { id: string; } // Will use SupabaseUser from npm:@supabase/supabase-js
interface AuthError { message: string; status?: number; details?: string; } // Can be removed if not used elsewhere
// interface GetUserFnResult { data: { user: User | null }; error: AuthError | null; } // Adjusted to SupabaseUser - No longer needed for direct User pass
// interface GetUserFn { (): Promise<GetUserFnResult>; } // No longer needed

// const mockLogger: ILogger = { // REMOVED - using testLoggerInstance
//     debug: (message: string, metadata?: LogMetadata) => console.debug("[DEBUG]", message, metadata || ''),
//     info: (message: string, metadata?: LogMetadata) => console.log("[INFO]", message, metadata || ''),
//     warn: (message: string, metadata?: LogMetadata) => console.warn("[WARN]", message, metadata || ''),
//     error: (message: string | Error, metadata?: LogMetadata) => console.error("[ERROR]", message, metadata || ''),
// };

// --- Mock Implementations --- (REMOVED - Will use createMockSupabaseClient)

// Helper to create a mock FormData object
function createMockFormData(
    fileData?: { name: string, type: string, content: string, size?: number }, 
    projectId?: string, 
    resourceDescription?: string
): FormData {
    const fd = new FormData();
    if (fileData) {
        const blob = new Blob([fileData.content], { type: fileData.type });
        Object.defineProperty(blob, 'size', { value: fileData.size !== undefined ? fileData.size : blob.size, configurable: true });
        fd.append('resourceFile', blob, fileData.name);
    }
    if (projectId) fd.append('projectId', projectId);
    if (resourceDescription) fd.append('resourceDescription', resourceDescription);
    return fd;
}

// Helper to create a mock Request object - NO LONGER DIRECTLY USED BY HANDLER CALL
// function createMockRequest(method: string, formData?: FormData, headers?: Record<string, string>): Request {
//     const body = formData;
//     return new Request('http://localhost/test', {
//         method,
//         body,
//         headers: { ...(formData ? {} : {'Content-Type': 'application/json'}), ...headers }, // FormData sets its own Content-Type
//     });
// }

Deno.test(
  "'uploadProjectResourceFileHandler - successful upload'",
  async (t) => {
    const currentTestUserId = "user-owns-project";
    const testProjectId = "project-123";
    const mockFile = new File(["content"], "test.md", {
      type: "text/markdown",
    });
    const mockResourceDescription = "Test description";
    const formData = new FormData();
    formData.append("projectId", testProjectId);
    formData.append("resourceFile", mockFile);
    formData.append("resourceDescription", mockResourceDescription);

    const generatedResourceId = "a1b2c3d4-e5f6-7890-1234-567890abcdef";

    let mockSetup: MockSupabaseClientSetup | undefined;

    const mockSupabaseConfigObj: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_projects: {
            select: async () => ({
              data: [{ id: testProjectId, user_id: currentTestUserId }],
              error: null,
              count: 1,
              status: 200,
              statusText: "OK",
            }),
          },
          dialectic_project_resources: {
            insert: async (state: MockQueryBuilderState): Promise<{ data: DialecticProjectResource[] | null; error: any; count?: number | null; status?: number; statusText?: string }> => {
              const resourceToInsert = state.insertData as DialecticProjectResource;
              const insertedResource: DialecticProjectResource = {
                id: generatedResourceId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: "active",
                project_id: resourceToInsert.project_id || testProjectId,
                user_id: resourceToInsert.user_id,
                file_name: resourceToInsert.file_name || mockFile.name,
                storage_bucket: resourceToInsert.storage_bucket || "dialectic-contributions",
                storage_path: resourceToInsert.storage_path || `projects/${testProjectId}/resources/${generatedResourceId}/${mockFile.name}`,
                mime_type: resourceToInsert.mime_type || mockFile.type,
                size_bytes: resourceToInsert.size_bytes || mockFile.size,
                resource_description: resourceToInsert.resource_description || mockResourceDescription,
                embeddings_status: "pending",
                last_embedded_at: null,
                checksum: null,
                processing_status: "pending",
                processing_error: null,
                metadata: null,
              };
              return { data: [insertedResource], error: null, count: 1, status: 201, statusText: "Created" };
            },
          },
        },
        storageMock: {
          defaultBucket: "dialectic-contributions",
          uploadResult: async (): Promise<IMockStorageUploadResponse> => ({
            data: {
              path:
                `projects/${testProjectId}/resources/${generatedResourceId}/${mockFile.name}`,
            },
            error: null,
          }),
          removeResult: async (): Promise<IMockStorageBasicResponse> => ({ data: null, error: null }),
        },
      };

    stub(crypto, "randomUUID", () => generatedResourceId as any);

    try {
      mockSetup = createMockSupabaseClient(currentTestUserId, mockSupabaseConfigObj as any);
      const { client: mockDbClient, spies: mockSpies } = mockSetup;

      const result = await uploadProjectResourceFileHandler(
        formData,
        mockDbClient as any, 
        testUserOwnsProject, 
        testLoggerInstance,
      );

      assert(result, "Result should be defined");
      assertEquals(result.error, undefined, "Expected no error on successful upload"); 
      assertExists(result.data, "Expected data for successful upload");
      assertEquals(result.data?.project_id, testProjectId);
      assertEquals(result.data?.file_name, mockFile.name);
      assertEquals(
        result.data?.resource_description,
        mockResourceDescription,
      );
      assertEquals(result.data?.id, generatedResourceId);
      assertEquals(result.data?.status, "active"); 

      const storageAPI = mockDbClient.storage.from("dialectic-contributions");
      const removeSpy = storageAPI.remove as Spy<any>; 
      assert(
        removeSpy.calls.length === 0,
        "Storage remove should not be called on successful insert",
      );
    } finally {
      restore(); 
      if (mockSetup && mockSetup.clearAllStubs) {
        mockSetup.clearAllStubs(); 
      }
    }
  },
);

Deno.test('uploadProjectResourceFileHandler - error when resourceFile is missing', async () => {
    const { client: mockDbClient, clearAllStubs } = createMockSupabaseClient('test-user');
    const mockUserForTest: User = { id: 'test-user', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };
    
    const formData = createMockFormData(undefined, 'project-123'); // No file
    const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

    assertExists(result.error, "Error should exist when file is missing");
    assertEquals(result.data, undefined);
    assertEquals(result.error?.message, 'resourceFile is required.');
    assertEquals(result.error?.status, 400);
    if (clearAllStubs) clearAllStubs();
});

Deno.test('uploadProjectResourceFileHandler - error when projectId is missing', async () => {
    const { client: mockDbClient, clearAllStubs } = createMockSupabaseClient('test-user');
    const mockUserForTest: User = { id: 'test-user', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };

    const formData = createMockFormData({ name: 'test.txt', type: 'text/plain', content: 'test' }); // No projectId
    const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

    assertExists(result.error, "Error should exist when projectId is missing");
    assertEquals(result.data, undefined);
    assertEquals(result.error?.message, 'projectId is required.');
    assertEquals(result.error?.status, 400);
    if (clearAllStubs) clearAllStubs();
});

Deno.test('uploadProjectResourceFileHandler - project not found or user does not own project', async () => {
    const currentTestUserId = 'user-does-not-own-project';
    const otherUserId = 'actual-owner-id';
    const testProjectId = 'project-owned-by-other';
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': {
                select: async (state: MockQueryBuilderState) => { // Project ownership check
                    if (state.filters.find((f: {column?: string; value?: unknown}) => f.column === 'id' && f.value === testProjectId)) {
                        // Simulate project exists but is owned by someone else
                        return { data: [{ id: testProjectId, user_id: otherUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    // Simulate project not found
                    return { data: null, error: { name: "PostgrestError", message: 'Project not found', code: 'PGRST116', details: '', hint:'' }, count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    };
    const { client: mockDbClient, spies, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: 'test.txt', type: 'text/plain', content: 'test', size: 4 }, testProjectId);
    
    const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

    assertExists(result.error);
    assertEquals(result.data, undefined);
    assertEquals(result.error?.message, 'Permission denied: You do not own this project.');
    assertEquals(result.error?.status, 403);
    
    // Check that from('dialectic_projects').select was called
    const projectSelectSpy = spies.getLatestQueryBuilderSpies('dialectic_projects')?.select;
    assertExists(projectSelectSpy);
    assertEquals(projectSelectSpy?.calls.length, 1);

    if (clearAllStubs) clearAllStubs();
});


Deno.test('uploadProjectResourceFileHandler - project check returns PGRST116 (project not found)', async () => {
    const currentTestUserId = 'user-id';
    const testProjectId = 'non-existent-project';
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': {
                select: async (_state: MockQueryBuilderState) => { // Project ownership check
                     // Simulate project not found by PostgREST
                    return { data: null, error: { name: "PostgrestError", message: '0 rows found', code: 'PGRST116', details: '', hint:'' }, count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    };
    const { client: mockDbClient, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: 'test.txt', type: 'text/plain', content: 'test', size:4 }, testProjectId);
    
    const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

    assertExists(result.error);
    assertEquals(result.data, undefined);
    assertEquals(result.error?.message, 'Project not found or user does not have permission to upload to this project.');
    assertEquals(result.error?.status, 404);
    if (clearAllStubs) clearAllStubs();
});


Deno.test('uploadProjectResourceFileHandler - storage upload fails', async () => {
    const currentTestUserId = 'user-owns-project-storage-fail';
    const testProjectId = 'project-storage-fail';
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': { // Simulate project ownership check passes
                select: async () => ({ data: [{ id: testProjectId, user_id: currentTestUserId }], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        },
        storageMock: {
            defaultBucket: 'dialectic-contributions',
            uploadResult: async () => ({ data: null, error: new Error('Simulated storage upload failure') })
        }
    };
    const { client: mockDbClient, spies, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: 'fail.txt', type: 'text/plain', content: 'fail content', size: 12 }, testProjectId);
    
    const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

    assertExists(result.error);
    assertEquals(result.data, undefined);
    assertEquals(result.error?.message, 'Failed to upload resource file to storage.');
    assertEquals(result.error?.details, 'Simulated storage upload failure');
    assertEquals(result.error?.status, 500);

    const uploadSpy = spies.storage.from('dialectic-contributions').uploadSpy;
    assertExists(uploadSpy);
    assertEquals(uploadSpy.calls.length, 1);
    
    if (clearAllStubs) clearAllStubs();
});

Deno.test('uploadProjectResourceFileHandler - database insert for resource fails (with storage cleanup)', async () => {
    const currentTestUserId = 'user-db-insert-fail';
    const testProjectId = 'project-db-fail';
    const testFileName = 'db_fail.md';
    const generatedResourceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
    const storagePath = `projects/${testProjectId}/resources/${generatedResourceId}/${testFileName}`;
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };


    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': { // Project ownership check passes
                select: async () => ({ data: [{ id: testProjectId, user_id: currentTestUserId }], error: null, count: 1, status: 200, statusText: 'OK' })
            },
            'dialectic_project_resources': { // DB insert fails
                insert: async () => ({ data: null, error: { name: "PostgrestError", message: 'Simulated DB insert error', code: 'DBFAIL', details: 'Constraint violation', hint: '' }, status: 500, statusText: 'Error' })
            }
        },
        storageMock: {
            defaultBucket: 'dialectic-contributions',
            uploadResult: async () => ({ data: { path: storagePath }, error: null }), // Storage upload succeeds
            removeResult: async (_bucket: string, paths: string[]) => { // Mock storage remove
                if (paths.includes(storagePath)) return { data: null, error: null };
                return {data: null, error: new Error("Mock remove failed: path not found")};
            }
        }
    };

    const { client: mockDbClient, spies, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: testFileName, type: 'text/markdown', content: '# DB Fail Test', size: 15 }, testProjectId);

    const originalCryptoRandomUUID = crypto.randomUUID;
    globalThis.crypto.randomUUID = () => generatedResourceId;
    
    try {
        const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

        assertExists(result.error);
        assertEquals(result.data, undefined);
        assertEquals(result.error?.message, 'Failed to record resource file metadata in database.');
        assertEquals(result.error?.details, 'Simulated DB insert error');
        assertEquals(result.error?.status, 500);

        const uploadSpy = spies.storage.from('dialectic-contributions').uploadSpy;
        const removeSpy = spies.storage.from('dialectic-contributions').removeSpy;
        const resourceInsertSpy = spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.insert;

        assertExists(uploadSpy);
        assertEquals(uploadSpy.calls.length, 1, "Storage upload should have been called");
        assertExists(resourceInsertSpy);
        assertEquals(resourceInsertSpy?.calls.length, 1, "Resource insert should have been attempted");
        assertExists(removeSpy);
        assertEquals(removeSpy.calls.length, 1, "Storage remove (cleanup) should have been called");
        assertEquals(removeSpy.calls[0].args[0], [storagePath], "Cleanup called with correct path");

    } finally {
        globalThis.crypto.randomUUID = originalCryptoRandomUUID;
        if (clearAllStubs) clearAllStubs();
    }
});


Deno.test('uploadProjectResourceFileHandler - storage cleanup fails after DB insert error', async () => {
    const currentTestUserId = 'user-cleanup-fail';
    const testProjectId = 'project-cleanup-fail';
    const testFileName = 'cleanup_fail.txt';
    const generatedResourceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
    const storagePath = `projects/${testProjectId}/resources/${generatedResourceId}/${testFileName}`;
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': {
                select: async () => ({ data: [{ id: testProjectId, user_id: currentTestUserId }], error: null, count: 1, status: 200, statusText: 'OK' })
            },
            'dialectic_project_resources': {
                insert: async () => ({ data: null, error: { name: "PostgrestError", message: 'DB error', code: 'DBERR', details: '', hint: '' }, status: 500, statusText: 'Error' })
            }
        },
        storageMock: {
            defaultBucket: 'dialectic-contributions',
            uploadResult: async () => ({ data: { path: storagePath }, error: null }),
            removeResult: async () => ({ data: null, error: new Error('Simulated storage cleanup failure') }) // Storage remove fails
        }
    };
    const { client: mockDbClient, spies, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: testFileName, type: 'text/plain', content: 'cleanup fail', size:12 }, testProjectId);

    const originalCryptoRandomUUID = crypto.randomUUID;
    globalThis.crypto.randomUUID = () => generatedResourceId;
    const consoleErrorSpy = spy(console, "error");

    try {
        const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

        assertExists(result.error);
        assertEquals(result.data, undefined);
        assertEquals(result.error?.message, 'Failed to record resource file metadata in database.'); // Primary error is still DB error
        assertEquals(result.error?.status, 500);

        // Check that the logger caught the cleanup failure
        // This relies on the logger actually printing to console.error in the test environment
        // and the logger instance passed being the one spied on or its methods.
        // For simplicity, checking our shared testLoggerInstance.
        // This is a bit of an indirect test. A direct spy on testLoggerInstance.error would be better if easy.
        
        let loggedCleanupError = false;
        for (const call of consoleErrorSpy.calls) {
            if (typeof call.args[0] === 'string' && call.args[0].includes('Failed to remove orphaned file from storage')) {
                loggedCleanupError = true;
                assertEquals(call.args[1]?.path, storagePath);
                assertInstanceOf(call.args[1]?.error, Error);
                assertEquals(call.args[1]?.error.message, 'Simulated storage cleanup failure');
                break;
            }
        }
        assertEquals(loggedCleanupError, true, "Expected logger to report storage cleanup failure.");


    } finally {
        globalThis.crypto.randomUUID = originalCryptoRandomUUID;
        consoleErrorSpy.restore();
        if (clearAllStubs) clearAllStubs();
    }
});

// Add more tests:
// - Unexpected error during project permission verification
// - Storage upload returns no data (but no error)
// - DB insert returns no data (but no error)
// - resourceDescription is null or very long (if there are constraints)
// - file name with special characters (if relevant for storage path)

Deno.test('uploadProjectResourceFileHandler - unexpected error during project permission check', async () => {
    const currentTestUserId = 'user-perm-check-unexpected-error';
    const testProjectId = 'project-perm-check-unexpected-error';
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, role: 'authenticated' };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': {
                select: async (_state: MockQueryBuilderState) => {
                    throw new Error("Unexpected DB error during permission select!");
                }
            }
        }
    };
    const { client: mockDbClient, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: 'perm_error.txt', type: 'text/plain', content: 'content', size: 7 }, testProjectId);

    const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

    assertExists(result.error);
    assertEquals(result.data, undefined);
    assertEquals(result.error?.message, 'Failed to verify project ownership.');
    assertEquals(result.error?.details, 'Unexpected DB error during permission select!');
    assertEquals(result.error?.status, 500);

    if (clearAllStubs) clearAllStubs();
});

Deno.test('uploadProjectResourceFileHandler - storage upload returns no data (but no error)', async () => {
    const currentTestUserId = 'user-storage-no-data';
    const testProjectId = 'project-storage-no-data';
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, role: 'authenticated' };
    const generatedResourceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': {
                select: async () => ({ data: [{ id: testProjectId, user_id: currentTestUserId }], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        },
        storageMock: {
            defaultBucket: 'dialectic-contributions',
            uploadResult: async () => ({ data: null, error: null }) // No data, no error
        }
    };
    const { client: mockDbClient, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: 'no_data.txt', type: 'text/plain', content: 'content', size: 7 }, testProjectId);
    
    const originalCryptoRandomUUID = crypto.randomUUID;
    globalThis.crypto.randomUUID = () => generatedResourceId;

    try {
        const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

        assertExists(result.error);
        assertEquals(result.data, undefined);
        assertEquals(result.error?.message, 'Failed to upload resource file, no upload data returned from storage.');
        assertEquals(result.error?.status, 500);
    } finally {
        globalThis.crypto.randomUUID = originalCryptoRandomUUID;
        if (clearAllStubs) clearAllStubs();
    }
});


Deno.test('uploadProjectResourceFileHandler - DB insert for resource returns no data (but no error)', async () => {
    const currentTestUserId = 'user-db-no-data';
    const testProjectId = 'project-db-no-data';
    const testFileName = 'db_no_data.md';
    const generatedResourceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
    const storagePath = `projects/${testProjectId}/resources/${generatedResourceId}/${testFileName}`;
    const mockUserForTest: User = { id: currentTestUserId, aud: 'authenticated', email: 'test@example.com', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, role: 'authenticated' };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockUserForTest,
        genericMockResults: {
            'dialectic_projects': {
                select: async () => ({ data: [{ id: testProjectId, user_id: currentTestUserId }], error: null, count: 1, status: 200, statusText: 'OK' })
            },
            'dialectic_project_resources': {
                insert: async () => ({ data: null, error: null, count: 0, status: 201, statusText: 'Created' }) // No data, no error
            }
        },
        storageMock: {
            defaultBucket: 'dialectic-contributions',
            uploadResult: async () => ({ data: { path: storagePath }, error: null }) // Storage upload succeeds
        }
    };
    const { client: mockDbClient, clearAllStubs } = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const formData = createMockFormData({ name: testFileName, type: 'text/markdown', content: '# DB No Data', size: 13 }, testProjectId);

    const originalCryptoRandomUUID = crypto.randomUUID;
    globalThis.crypto.randomUUID = () => generatedResourceId;
    
    try {
        const result = await uploadProjectResourceFileHandler(formData, mockDbClient as any, mockUserForTest, testLoggerInstance);

        assertExists(result.error);
        assertEquals(result.data, undefined);
        assertEquals(result.error?.message, 'Failed to record resource file metadata in database.');
        assertEquals(result.error?.status, 500);
    } finally {
        globalThis.crypto.randomUUID = originalCryptoRandomUUID;
        if (clearAllStubs) clearAllStubs();
    }
});

Deno.test(
  "uploadProjectResourceFileHandler - default resource description if not provided",
  async (t) => {
    const currentTestUserId = "user-default-desc";
    const testProjectId = "project-default-desc";
    const mockFile = new File(["content"], "file_with_default_desc.dat", { type: 'application/octet-stream', });
    Object.defineProperty(mockFile, 'size', { value: 50, configurable: true });

    const formData = new FormData();
    formData.append("projectId", testProjectId);
    formData.append("resourceFile", mockFile);
    // No resourceDescription is provided, so the handler should create a default one.

    const generatedResourceId = "a1b2c3d4-e5f6-7890-1234-567890abcdef";

    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_projects: {
          select: async () => ({
            data: [{ id: testProjectId, user_id: currentTestUserId }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          }),
        },
        dialectic_project_resources: {
          insert: async (state: MockQueryBuilderState) => {
            const resourceToInsert = state.insertData as DialecticProjectResource;
            // The core of this test: assert the default description was created.
            assertEquals(resourceToInsert.resource_description, `User uploaded file: ${mockFile.name}`);
            
            // Return a successful insertion response
            return { data: [resourceToInsert], error: null, count: 1, status: 201, statusText: "Created" };
          },
        },
      },
      storageMock: {
        defaultBucket: "dialectic-contributions",
        uploadResult: async (): Promise<IMockStorageUploadResponse> => ({
          data: {
            path:
              `projects/${testProjectId}/resources/${generatedResourceId}/${mockFile.name}`,
          },
          error: null,
        }),
      },
    };

    stub(crypto, "randomUUID", () => generatedResourceId as any);
    let mockSetup: MockSupabaseClientSetup | undefined;
    try {
        mockSetup = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig as any);
        const { client: mockDbClient } = mockSetup;
        
        const mockUserForTest: User = { 
            id: currentTestUserId, 
            aud: 'authenticated', 
            role: 'authenticated', 
            email: 'test@example.com', 
            created_at: new Date().toISOString(), 
            app_metadata: {}, 
            user_metadata: {} 
        };

        const result = await uploadProjectResourceFileHandler(
            formData,
            mockDbClient as any, 
            mockUserForTest, 
            testLoggerInstance,
        );

        assertEquals(result.error, undefined, "Expected no error on successful upload");
        assertExists(result.data, "Expected data for successful upload with default description");
        assertEquals(result.data?.resource_description, `User uploaded file: ${mockFile.name}`);
    } finally {
        restore();
        if (mockSetup && mockSetup.clearAllStubs) {
            mockSetup.clearAllStubs();
        }
    }
  },
);
