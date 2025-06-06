// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
// import { SupabaseClient } from '@supabase/supabase-js'; // Assuming this type is available. Will be provided by mock.
import type { User, SupabaseClient } from "npm:@supabase/supabase-js@^2.43.4";
import { uploadProjectResourceFileHandler } from './uploadProjectResourceFile.ts';
import {
    // DialecticProjectResource, // Not directly used in this test's assertions after refactor
    // UploadProjectResourceFileSuccessResponse // Not directly used in this test's assertions after refactor
} from './dialectic.interface.ts';
import {
    createMockSupabaseClient,
    type MockSupabaseClientSetup,
    type MockSupabaseDataConfig,
} from '../_shared/supabase.mock.ts';
import type { ILogger, LogMetadata } from '../_shared/types.ts';


// Mock DI Interfaces (should ideally be imported from a shared testing mock file)
// interface User { id: string; } // Will use SupabaseUser from npm:@supabase/supabase-js
interface AuthError { message: string; status?: number; details?: string; } // Can be removed if not used elsewhere
interface GetUserFnResult { data: { user: User | null }; error: AuthError | null; } // Adjusted to SupabaseUser
interface GetUserFn { (): Promise<GetUserFnResult>; }

const mockLogger: ILogger = {
    debug: (message: string, metadata?: LogMetadata) => console.debug("[DEBUG]", message, metadata || ''),
    info: (message: string, metadata?: LogMetadata) => console.log("[INFO]", message, metadata || ''),
    warn: (message: string, metadata?: LogMetadata) => console.warn("[WARN]", message, metadata || ''),
    error: (message: string | Error, metadata?: LogMetadata) => console.error("[ERROR]", message, metadata || ''),
};

// --- Mock Implementations --- (REMOVED - Will use createMockSupabaseClient)
// let mockUser: User | null = { id: 'test-user-id' };
// let mockUserError: AuthError | null = null;
// const mockGetUser: GetUserFn = async () => ({ data: { user: mockUser }, error: mockUserError });

// let mockProjectData: any = { id: 'test-project-id', user_id: 'test-user-id' };
// let mockProjectError: any = null;
// let mockDbInsertData: any = null;
// let mockDbInsertError: any = null;
// let mockUploadError: Error | null = null;
// const mockMetadataResult: { size?: number; mimeType?: string; error: Error | null } = { size: 12345, error: null };
// let mockListResult: { data: any[] | null, error: Error | null } = { data: [], error: null };

// const mockDbAdminClient = { ... } as unknown as SupabaseClient; // REMOVED

// Mock external utilities if they are not part of SupabaseClient passed to handler
// For now, assuming uploadToStorage and getFileMetadata are simple wrappers around dbAdminClient.storage.from()...
// If they are more complex, they should be mocked directly via import mockery.

// Helper to create a mock FormData object
function createMockFormData(fileData?: { name: string, type: string, content: string }, projectId?: string, resourceDescription?: string): FormData {
    const fd = new FormData();
    if (fileData) {
        const blob = new Blob([fileData.content], { type: fileData.type });
        fd.append('file', blob, fileData.name);
    }
    if (projectId) fd.append('projectId', projectId);
    if (resourceDescription) fd.append('resourceDescription', resourceDescription);
    return fd;
}

// Helper to create a mock Request object
function createMockRequest(method: string, formData?: FormData, headers?: Record<string, string>): Request {
    const body = formData;
    return new Request('http://localhost/test', {
        method,
        body,
        headers: { ...(formData ? {} : {'Content-Type': 'application/json'}), ...headers }, // FormData sets its own Content-Type
    });
}

Deno.test('uploadProjectResourceFileHandler - successful upload', async () => {
    const currentTestUserId = 'user-owns-project';
    const testProjectId = 'project-123';
    const testFileName = 'test.md';
    const testFileSize = 100;
    const testMimeType = 'text/markdown';
    const resourceDescription = 'Test description';
    const generatedResourceId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Valid v4 UUID format

    // Expected data for the dialectic_project_resources table insert
    const expectedResourceInsert = {
        project_id: testProjectId,
        user_id: currentTestUserId,
        file_name: testFileName,
        storage_bucket: 'dialectic-contributions',
        mime_type: testMimeType,
        size_bytes: testFileSize,
        resource_description: resourceDescription,
    };

    const mockDbInsertResultData = {
        ...expectedResourceInsert,
        id: generatedResourceId, 
        storage_path: `projects/${testProjectId}/resources/${generatedResourceId}/${testFileName}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: {
            id: currentTestUserId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'test@example.com'
        } as User,
        genericMockResults: {
            'dialectic_projects': { 
                select: async (state) => {
                    const projectIdFilter = state.filters.find(f => f.column === 'id' && f.value === testProjectId);
                    const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === currentTestUserId);
                    if (projectIdFilter && userIdFilter) {
                        return {
                            data: [{ id: testProjectId, user_id: currentTestUserId }],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK'
                        };
                    }
                    return { data: null, error: new Error('Project not found or not owned by user'), count: 0, status: 404, statusText: 'Not Found' };
                },
                update: async (state) => {
                    const projectIdFilter = state.filters.find(f => f.column === 'id' && f.value === testProjectId);
                    if (projectIdFilter && (state.updateData as Partial<{ initial_prompt_resource_id: string }>)?.initial_prompt_resource_id === generatedResourceId) {
                        return {
                            data: [{ id: testProjectId, initial_prompt_resource_id: generatedResourceId }],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK'
                        };
                    }
                    return { data: null, error: new Error('Update mock failure: project ID not found or resource ID mismatch'), count: 0, status: 400, statusText: 'Bad Request' };
                }
            },
            'dialectic_project_resources': { 
                insert: async (_state) => { 
                    return {
                        data: [mockDbInsertResultData], 
                        error: null,
                        count: 1,
                        status: 201,
                        statusText: 'Created'
                    };
                }
            }
        },
        storageMock: {
            defaultBucket: 'dialectic-contributions',
            uploadResult: async (bucketId, path, _body, _options) => {
                if (bucketId === 'dialectic-contributions' && path.startsWith(`projects/${testProjectId}/resources/${generatedResourceId}/`)) {
                    return { data: { path }, error: null };
                }
                return { data: null, error: new Error('Storage upload mock failure: incorrect path or bucket') };
            },
            listResult: async (bucketId, pathPrefix, _options) => {
                if (bucketId === 'dialectic-contributions' && pathPrefix === `projects/${testProjectId}/resources/${generatedResourceId}`) {
                    return {
                        data: [{
                            name: testFileName,
                            id: 'mock-storage-file-id',
                            updated_at: new Date().toISOString(),
                            created_at: new Date().toISOString(),
                            last_accessed_at: new Date().toISOString(),
                            metadata: {
                                size: testFileSize,
                                mimetype: testMimeType,
                                eTag: "some-etag",
                                cacheControl: "max-age=3600",
                                lastModified: new Date().toISOString(),
                                httpStatusCode: 200
                            }
                        }],
                        error: null
                    };
                }
                return { data: [], error: new Error('Storage list mock failure: incorrect path or bucket for list') };
            }
        }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);

    const formData = createMockFormData({ name: testFileName, type: testMimeType, content: '# Test' }, testProjectId, resourceDescription);
    const req = createMockRequest('POST', formData);

    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const originalCryptoRandomUUID = crypto.randomUUID;
    globalThis.crypto.randomUUID = () => generatedResourceId;

    const result = await uploadProjectResourceFileHandler(
        req, 
        mockSupabase.client as unknown as SupabaseClient, // Cast to SupabaseClient
        getUserFnForTest, 
        mockLogger
    );

    globalThis.crypto.randomUUID = originalCryptoRandomUUID;

    assertExists(result.data, 'Expected data for successful upload');
    assertEquals(result.error, undefined, `Unexpected error: ${result.error?.message}`);
    assertEquals(result.data?.message, 'File uploaded and resource created successfully.');
    assertExists(result.data?.resource, "Resource object should exist in successful response");

    if (result.data?.resource) {
        assertEquals(result.data.resource.id, generatedResourceId);
        assertEquals(result.data.resource.project_id, testProjectId);
        assertEquals(result.data.resource.user_id, currentTestUserId);
        assertEquals(result.data.resource.file_name, testFileName);
        assertEquals(result.data.resource.storage_bucket, 'dialectic-contributions');
        assertEquals(result.data.resource.storage_path, `projects/${testProjectId}/resources/${generatedResourceId}/${testFileName}`);
        assertEquals(result.data.resource.mime_type, testMimeType);
        assertEquals(result.data.resource.size_bytes, testFileSize);
        assertEquals(result.data.resource.resource_description, resourceDescription);
    }

    const { fromSpy, storage: storageSpies } = mockSupabase.spies;
    
    const projectQuerySpiesCollection = mockSupabase.spies.getAllQueryBuilderSpies('dialectic_projects');
    const projectSelectSpy = projectQuerySpiesCollection && projectQuerySpiesCollection.length > 0 ? projectQuerySpiesCollection[0]?.select : undefined;
    const projectUpdateSpy = projectQuerySpiesCollection && projectQuerySpiesCollection.length > 1 ? projectQuerySpiesCollection[1]?.update : undefined;

    const resourceInsertSpy = mockSupabase.spies.getLatestQueryBuilderSpies('dialectic_project_resources')?.insert;
    const uploadSpy = storageSpies.from('dialectic-contributions').uploadSpy;
    const listSpy = storageSpies.from('dialectic-contributions').listSpy;

    assertEquals((fromSpy as any).calls.length, 3, "Supabase.from should be called thrice (project check, resource insert, project update)");
    assertEquals((projectSelectSpy as any)?.calls.length, 1, "Select on dialectic_projects should be called for ownership check");
    assertEquals((resourceInsertSpy as any)?.calls.length, 1, "Insert on dialectic_project_resources should be called");
    assertEquals((projectUpdateSpy as any)?.calls.length, 1, "Update on dialectic_projects should be called to link resource");
    assertEquals((uploadSpy as any).calls.length, 1, "Storage upload should be called");
    assertEquals((listSpy as any).calls.length, 1, "Storage list should be called by getFileMetadata");

    if (mockSupabase.clearAllStubs) {
      mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error when file is missing', async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(); // No specific config needed as error is pre-DB
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const formData = createMockFormData(undefined, 'project-123');
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req, 
        mockSupabase.client as unknown as SupabaseClient, 
        getUserFnForTest, 
        mockLogger
    );

    assertExists(result.error, 'Expected error when file is missing');
    assertEquals(result.data, undefined);
    assertEquals(result.error?.status, 400);
    assertEquals(result.error?.code, 'MISSING_FILE');

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error when projectId is missing', async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(); // No specific config needed
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const formData = createMockFormData({ name: 'test.md', type: 'text/plain', content: 'abc' });
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req, 
        mockSupabase.client as unknown as SupabaseClient, 
        getUserFnForTest, 
        mockLogger
    );

    assertExists(result.error, 'Expected error when projectId is missing');
    assertEquals(result.data, undefined);
    assertEquals(result.error?.status, 400);
    assertEquals(result.error?.code, 'MISSING_PROJECT_ID');

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error when user not authenticated', async () => {
    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: null, // Simulate no user authenticated
        // or use simulateAuthError: { message: 'Auth failed', status: 401 }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(undefined, mockSupabaseConfig);
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const formData = createMockFormData({ name: 'test.md', type: 'text/plain', content: 'abc' }, 'project-123');
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req, 
        mockSupabase.client as unknown as SupabaseClient, 
        getUserFnForTest, 
        mockLogger
    );

    assertExists(result.error, 'Expected error for unauthenticated user');
    assertEquals(result.error?.status, 401);
    assertEquals(result.error?.code, 'AUTH_ERROR');
    // No need to reset mockUser/mockUserError as they are scoped by createMockSupabaseClient

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error when project not found or not owned', async () => {
    const currentTestUserId = 'other-user';
    const testProjectId = 'project-does-not-exist';

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: { 
            id: currentTestUserId, 
            aud: 'authenticated', 
            role: 'authenticated', 
            email: 'other@example.com' 
        } as User,
        genericMockResults: {
            'dialectic_projects': { // Table for project ownership check
                select: async (state) => {
                    // Simulate project not found or not owned by this user
                    const projectIdFilter = state.filters.find(f => f.column === 'id' && f.value === testProjectId);
                    // const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === currentTestUserId);
                    if (projectIdFilter) { // Query is for the project, but we'll return not found
                        return {
                            data: null, 
                            error: { name: 'PGRSTError', message: 'JWSError JWSInvalidSignature', code: 'PGRST116' }, // Simulate PostgREST error for not found
                            count: 0, 
                            status: 406, // Or 404, depending on how Supabase client translates this error type
                            statusText: 'Not Acceptable' 
                        };
                    }
                    // Fallback if the query wasn't what we expected for this test (should not happen ideally)
                    return { data: null, error: new Error('Unexpected project query in mock'), count: 0, status: 500, statusText: 'Internal Server Error' };
                }
            }
        }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const formData = createMockFormData({ name: 'test.md', type: 'text/plain', content: 'abc' }, testProjectId);
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req, 
        mockSupabase.client as unknown as SupabaseClient, 
        getUserFnForTest, 
        mockLogger
    );

    assertExists(result.error, 'Expected error for project not found/owned');
    assertEquals(result.error?.status, 404); // Handler should normalize to 404
    assertEquals(result.error?.code, 'PROJECT_NOT_FOUND_OR_FORBIDDEN');
    // No need to reset global mocks

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error when user is not authenticated', async () => {
    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: null, // Simulate unauthenticated user
        // No genericMockResults or storageMock needed as auth should fail first
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient('unauth-user', mockSupabaseConfig);
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const formData = createMockFormData({ name: 'test.txt', type: 'text/plain', content: 'data' }, 'project-id');
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req,
        mockSupabase.client as unknown as SupabaseClient,
        getUserFnForTest,
        mockLogger // ensure mockLogger is passed
    );

    assertExists(result.error, 'Expected error when user is not authenticated');
    assertEquals(result.error?.status, 401);
    assertEquals(result.error?.code, 'AUTH_ERROR');

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error when project does not exist or not owned by user', async () => {
    const currentTestUserId = 'user-without-project-access';
    const testProjectId = 'non-existent-project';

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com' } as User,
        genericMockResults: {
            'dialectic_projects': {
                select: async (state) => { // Mock to return no project
                    const projectIdFilter = state.filters.find(f => f.column === 'id' && f.value === testProjectId);
                    const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === currentTestUserId);
                    if (projectIdFilter && userIdFilter) { // This condition should ideally not be met
                        return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
                    }
                    // More accurate mock for "not found"
                    return { data: null, error: new Error('Project not found or not owned by user'), count: 0, status: 404, statusText: 'Not Found' };

                }
            }
        }
        // No storageMock needed as project check should fail first
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const formData = createMockFormData({ name: 'test.txt', type: 'text/plain', content: 'data' }, testProjectId);
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req,
        mockSupabase.client as unknown as SupabaseClient,
        getUserFnForTest,
        mockLogger // ensure mockLogger is passed
    );

    assertExists(result.error, 'Expected error when project is not found or not owned by user');
    assertEquals(result.error?.status, 404);
    assertEquals(result.error?.code, 'PROJECT_NOT_FOUND_OR_FORBIDDEN');

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error during file upload to storage', async () => {
    const currentTestUserId = 'user-upload-fail';
    const testProjectId = 'project-upload-fail';
    const testFileName = 'fail.txt';
    const generatedResourceId = globalThis.crypto.randomUUID();

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com' } as User,
        genericMockResults: {
            'dialectic_projects': { // Assume project exists and is owned
                select: async () => ({ data: [{ id: testProjectId, user_id: currentTestUserId }], error: null, count: 1, status: 200, statusText: 'OK' })
            }
            // dialectic_project_resources insert will not be reached if upload fails
        },
        storageMock: {
            defaultBucket: 'dialectic-contributions',
            uploadResult: async () => ({ data: null, error: new Error('Simulated storage upload failure') }) // Simulate upload error
            // listResult not needed if upload fails
        }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const originalCryptoRandomUUID = crypto.randomUUID;
    globalThis.crypto.randomUUID = () => generatedResourceId;

    const formData = createMockFormData({ name: testFileName, type: 'text/plain', content: 'data' }, testProjectId);
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req,
        mockSupabase.client as unknown as SupabaseClient,
        getUserFnForTest,
        mockLogger // ensure mockLogger is passed
    );

    globalThis.crypto.randomUUID = originalCryptoRandomUUID;

    assertExists(result.error, 'Expected error during file upload to storage');
    assertEquals(result.error?.status, 500);
    assertEquals(result.error?.code, 'STORAGE_UPLOAD_ERROR');

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

Deno.test('uploadProjectResourceFileHandler - error during database insert of resource metadata', async () => {
    const currentTestUserId = 'user-db-insert-fail';
    const testProjectId = 'project-db-insert-fail';
    const testFileName = 'db_fail.txt';
    const testFileSize = 50;
    const testMimeType = 'text/plain';
    const generatedResourceId = globalThis.crypto.randomUUID();

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: { id: currentTestUserId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com' } as User,
        genericMockResults: {
            'dialectic_projects': {
                select: async () => ({ data: [{ id: testProjectId, user_id: currentTestUserId }], error: null, count: 1, status: 200, statusText: 'OK' })
            },
            'dialectic_project_resources': {
                insert: async () => ({ data: null, error: new Error('Simulated database insert failure'), count: 0, status: 500, statusText: 'Internal Server Error' })
            }
        },
        storageMock: { // Assume upload is successful for this test case
            defaultBucket: 'dialectic-contributions',
            uploadResult: async (bucketId, path, _body, _options) => ({ data: { path }, error: null }),
            listResult: async (bucketId, pathPrefix, _options) => ({ // Simulate file exists after (mocked) successful upload
                data: [{ name: testFileName, id: 'mock-id', metadata: { size: testFileSize, mimetype: testMimeType } } as any], // Cast to any for brevity
                error: null
            })
        }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(currentTestUserId, mockSupabaseConfig);
    const getUserFnForTest: GetUserFn = () => mockSupabase.client.auth.getUser() as Promise<GetUserFnResult>;

    const originalCryptoRandomUUID = crypto.randomUUID;
    globalThis.crypto.randomUUID = () => generatedResourceId;

    const formData = createMockFormData({ name: testFileName, type: testMimeType, content: 'db insert fail data' }, testProjectId);
    const req = createMockRequest('POST', formData);
    const result = await uploadProjectResourceFileHandler(
        req,
        mockSupabase.client as unknown as SupabaseClient,
        getUserFnForTest,
        mockLogger // ensure mockLogger is passed
    );

    globalThis.crypto.randomUUID = originalCryptoRandomUUID;

    assertExists(result.error, 'Expected error during database insert of resource metadata');
    assertEquals(result.error?.status, 500);
    assertEquals(result.error?.code, 'DB_INSERT_ERROR');

    if (mockSupabase.clearAllStubs) {
        mockSupabase.clearAllStubs();
    }
});

// Add more tests for:
// - Storage upload failure (mockUploadError)
// - DB insert failure (mockDbInsertError)
// - getFileMetadata failure (mockMetadataResult.error)
// - Invalid HTTP method
