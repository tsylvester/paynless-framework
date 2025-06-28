import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { spy, assertSpyCall, Spy } from 'https://deno.land/std@0.177.0/testing/mock.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js';

// Import the handler and its original dependencies interface
import { requestHandler } from './index.ts';

// Define an interface for the spied dependencies
interface SpiedStorageCleanupHandlerDependencies {
  handleCorsPreflightRequest: Spy<unknown, [Request], Response | null>;
  createErrorResponse: Spy<unknown, [message: string, status: number, request: Request, error?: Error | unknown], Response>;
  createSuccessResponse: Spy<unknown, [data: unknown, status: number, request: Request], Response>;
  createSupabaseAdminClient: Spy<unknown, [], SupabaseClient>;
  deleteFromStorage: Spy<unknown, [client: SupabaseClient, bucket: string, paths: string[]], Promise<{ error: Error | null }>>;
}

// --- Mock Implementations for Dependencies ---
let actualPreflightResponse: Response | null = null;
const mockHandleCorsPreflightRequestFn = (req: Request) => actualPreflightResponse; // Added req parameter to match signature

const mockDeleteFromStorageResult = { error: null as Error | null };
const mockSupabaseAdminClientInstance = { storage: {} } as unknown as SupabaseClient;

// Create the mock dependencies object using spies, typed with the Spied interface
const mockDependencies: SpiedStorageCleanupHandlerDependencies = {
  handleCorsPreflightRequest: spy(mockHandleCorsPreflightRequestFn),
  createErrorResponse: spy((message: string, status: number, _req: Request, _error?: Error | unknown) => new Response(JSON.stringify({ error: message }), { status })),
  createSuccessResponse: spy((data: unknown, status: number, _req: Request) => new Response(JSON.stringify(data), { status })),
  createSupabaseAdminClient: spy(() => mockSupabaseAdminClientInstance),
  deleteFromStorage: spy(async (_client: SupabaseClient, _bucket: string, _paths: string[]) => mockDeleteFromStorageResult), // Added params to match sig
};

// Helper to reset all spies before each test
function resetAllSpies() {
  mockDependencies.handleCorsPreflightRequest.calls.length = 0;
  mockDependencies.createErrorResponse.calls.length = 0;
  mockDependencies.createSuccessResponse.calls.length = 0;
  mockDependencies.createSupabaseAdminClient.calls.length = 0;
  mockDependencies.deleteFromStorage.calls.length = 0;
  // Reset any externally controlled mock state if necessary
  actualPreflightResponse = null;
  mockDeleteFromStorageResult.error = null;
}

// Mock Deno.env before running tests that might use it
const originalSupabaseUrl = Deno.env.get("SUPABASE_URL");
const originalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");


Deno.test('storage-cleanup-service - OPTIONS request', async () => {
    resetAllSpies();
    actualPreflightResponse = new Response(null, { status: 204 }); // Correct 204 response

    const request = new Request('http://localhost/storage-cleanup-service', { method: 'OPTIONS' });
    const response = await requestHandler(request, mockDependencies);

    assertEquals(response.status, 204);
    assertSpyCall(mockDependencies.handleCorsPreflightRequest, 0, { args: [request] });
});

Deno.test('storage-cleanup-service - valid POST request', async () => {
    resetAllSpies();
    // actualPreflightResponse is already null via resetAllSpies

    const payload = { bucket: 'test-bucket', paths: ['file1.txt', 'file2.txt'] };
    const request = new Request('http://localhost/storage-cleanup-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    await requestHandler(request, mockDependencies);

    assertSpyCall(mockDependencies.createSupabaseAdminClient, 0);
    assertSpyCall(mockDependencies.deleteFromStorage, 0, { args: [mockSupabaseAdminClientInstance, payload.bucket, payload.paths] });
    assertSpyCall(mockDependencies.createSuccessResponse, 0, {
        args: [
            { success: true, message: `${payload.paths.length} file(s) scheduled for deletion from bucket ${payload.bucket}.` },
            200,
            request,
        ],
    });
});

Deno.test('storage-cleanup-service - POST request with missing bucket', async () => {
    resetAllSpies();

    const payload = { paths: ['file1.txt'] }; // Missing bucket
    const request = new Request('http://localhost/storage-cleanup-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    await requestHandler(request, mockDependencies);
    assertSpyCall(mockDependencies.createErrorResponse, 0, {
        args: ['Missing bucket or paths in payload, or paths array is empty.', 400, request],
    });
});

Deno.test('storage-cleanup-service - POST request with missing paths', async () => {
    resetAllSpies();

    const payload = { bucket: 'test-bucket' }; 
    const request = new Request('http://localhost/storage-cleanup-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    await requestHandler(request, mockDependencies);
    assertSpyCall(mockDependencies.createErrorResponse, 0, {
        args: ['Missing bucket or paths in payload, or paths array is empty.', 400, request],
    });
});

Deno.test('storage-cleanup-service - POST request with empty paths array', async () => {
    resetAllSpies();

    const payload = { bucket: 'test-bucket', paths: [] };
    const request = new Request('http://localhost/storage-cleanup-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    await requestHandler(request, mockDependencies);
    assertSpyCall(mockDependencies.createErrorResponse, 0, {
        args: ['Missing bucket or paths in payload, or paths array is empty.', 400, request],
    });
});

Deno.test('storage-cleanup-service - deleteFromStorage returns error', async () => {
    resetAllSpies();
    mockDeleteFromStorageResult.error = new Error('Storage delete failed');

    const payload = { bucket: 'test-bucket', paths: ['file1.txt'] };
    const request = new Request('http://localhost/storage-cleanup-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    await requestHandler(request, mockDependencies);

    assertSpyCall(mockDependencies.deleteFromStorage, 0, { args: [mockSupabaseAdminClientInstance, payload.bucket, payload.paths] });
    assertSpyCall(mockDependencies.createErrorResponse, 0, {
        args: [
            `Failed to delete files: ${mockDeleteFromStorageResult.error.message}`,
            500,
            request,
            mockDeleteFromStorageResult.error
        ],
    });
});

Deno.test('storage-cleanup-service - non-JSON payload', async () => {
    resetAllSpies();

    const request = new Request('http://localhost/storage-cleanup-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, 
        body: 'not json',
    });

    await requestHandler(request, mockDependencies);
    const errorSpyCall = mockDependencies.createErrorResponse.calls[0];
    assertEquals(errorSpyCall.args[1], 500); 
    assertEquals(errorSpyCall.args[2], request);
    // Error message for JSON parsing can be brittle to test exactly, so we check that an error was created.
});

// Restore original Deno.env values after all tests if they were set
if (originalSupabaseUrl !== undefined) {
    Deno.env.set("SUPABASE_URL", originalSupabaseUrl);
} else {
    Deno.env.delete("SUPABASE_URL");
}
if (originalServiceKey !== undefined) {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", originalServiceKey);
} else {
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
} 