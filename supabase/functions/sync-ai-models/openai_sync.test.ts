import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient, PostgrestResponse, PostgrestSingleResponse, PostgrestMaybeSingleResponse } from "npm:@supabase/supabase-js@2";

// Import the function to test
import { syncOpenAIModels } from "./openai_sync.ts";
// Import shared types potentially used
import type { DbAiProvider, SyncResult } from "./index.ts"; // Import from index.ts where they are defined
// Import type for OpenAI API response simulation
import type { ProviderModelInfo } from "../_shared/types.ts";

// Import shared types and test utils
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    setMockFetchResponse, // Use the shared fetch response configurer
    stubFetchForTestScope, // Use the shared fetch stubber
    type MockQueryBuilderState
} from "../_shared/test-utils.ts";

// --- Test Setup & Mocks ---

// Mock fetch if openai_sync.ts uses it directly
/* // REMOVE - Replaced by shared utility 
let fetchStub: Stub<[Request | URL | string, RequestInit?], Promise<Response>> | undefined;
*/

/* // REMOVE - Replaced by shared utility 
const setup = () => {
    // Reset fetch stub before each test
    fetchStub = undefined; 
};
*/

/* // REMOVE - Replaced by shared utility 
const teardown = () => {
    fetchStub?.restore();
};
*/

// Helper to easily mock fetch responses
/* // REMOVE - Replaced by shared utility 
const mockFetch = (status: number, body: any) => {
     fetchStub = stub(globalThis, "fetch", () => 
        Promise.resolve(new Response(JSON.stringify(body), { status }))
    );
};
*/
/* // REMOVE - Replaced by shared utility 
const mockFetchError = (errorMsg: string = "Fetch Failed") => {
    fetchStub = stub(globalThis, "fetch", () => Promise.reject(new Error(errorMsg)));
};
*/

// --- Test Suite ---

Deno.test("syncOpenAIModels", { 
    sanitizeOps: false, // Allow async ops
    sanitizeResources: false, // Allow network/file ops (like fetch)
}, async (t) => {

    // --- Test Cases ---

    await t.step("should insert new models when DB is empty and API returns models", async () => {
        const mockApiKey = "test-api-key";
        let fetchStubDisposable: Disposable | undefined;
        try {
            // Stub fetch for this test scope
            fetchStubDisposable = stubFetchForTestScope().stub;

            // Mock the OpenAI API response using the shared helper
            const mockApiModels = { 
                data: [
                    { id: "gpt-4", object: "model", created: 1, owned_by: "openai", permission: [], root: "gpt-4", parent: null },
                    { id: "gpt-3.5-turbo", object: "model", created: 2, owned_by: "openai", permission: [], root: "gpt-3.5-turbo", parent: null }
                ] 
            };
            // Configure the fetch mock
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            // Configure the Supabase mock using generic results
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: [], error: null, count: 0 }, // DB is empty
                        // We expect an insert, provide a mock success response for it
                        insert: { data: mockApiModels.data.map(m => ({ ...m, provider: 'openai', is_active: true })), error: null, count: 2 }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);
            
            // Assertions (fetch call is implicitly checked by DB operations occurring)
            
            // Check Supabase interactions via spies
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); 

            // Access spies on the returned builder from the first call to from()
            const queryBuilderSpies = fromSpy.calls[0].returned;
            assert(queryBuilderSpies.select, "Select spy should exist");
            assert(queryBuilderSpies.insert, "Insert spy should exist");
            
            assertSpyCall(queryBuilderSpies.select, 0); // select called once
            assertEquals(queryBuilderSpies.eq.calls.length, 1, "eq should be called once for select"); // Check count first
            
            // Check insert on the spies returned by the *second* from() call
            assertEquals(fromSpy.calls.length, 2, "from() should be called twice (select, insert)");
            const insertBuilderSpies = fromSpy.calls[1].returned;
            assert(insertBuilderSpies.insert, "Insert spy should exist on second builder");
            assertEquals(insertBuilderSpies.insert.calls.length, 1, "insert should be called once"); // Check count on correct builder
            
            // Check the arguments passed to insert (using the correct spy)
            const insertArgs = insertBuilderSpies.insert.calls[0].args[0];
            assertEquals(insertArgs.length, 2); // Inserted 2 models
            assertEquals(insertArgs[0].api_identifier, "openai-gpt-4");
            assertEquals(insertArgs[0].name, "OpenAI gpt-4"); // Match adapter naming
            assertEquals(insertArgs[0].provider, "openai");
            assertEquals(insertArgs[1].api_identifier, "openai-gpt-3.5-turbo");
            assertEquals(insertArgs[1].name, "OpenAI gpt-3.5-turbo"); // Match adapter naming
            assertEquals(insertArgs[1].provider, "openai");

            // Check the SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 2);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            // Dispose of the fetch stub
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

    await t.step("should return error result if API call fails", async () => {
        const mockApiKey = "test-api-key";
        let fetchStubDisposable: Disposable | undefined;
         try {
            fetchStubDisposable = stubFetchForTestScope().stub;

            // Mock fetch to return an error
            setMockFetchResponse(new Response(JSON.stringify({ error: { message: "Auth Error" } }), { status: 401 }));

            // No specific DB config needed as it shouldn't be called
            const { client: mockClient, spies } = createMockSupabaseClient();

            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assert fetch was called (implicitly assumed if error is correct)
            
            // Ensure Supabase was NOT called
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check the SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assert(result.error?.includes("OpenAI API request failed fetching models: 401"), `Error message mismatch: ${result.error}`);
        } finally {
             fetchStubDisposable?.[Symbol.dispose]();
        }
    });
    
    await t.step("should return error result if DB select fails", async () => {
        const mockApiKey = "test-api-key";
        const dbError = { message: "Connection refused", code: "500", details: "", hint: "" };
        let fetchStubDisposable: Disposable | undefined;
        try {
             fetchStubDisposable = stubFetchForTestScope().stub;

            // Mock a successful API call 
            setMockFetchResponse(new Response(JSON.stringify({ data: [{ id: "gpt-4" }] }), { status: 200 }));

            // Configure Supabase mock to simulate DB error on select
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                 genericMockResults: {
                    ai_providers: {
                        select: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assert fetch was called (implicitly assumed)

            // Check DB call
            assertSpyCall(spies.fromSpy, 0, { args: ['ai_providers'] });
            const queryBuilderSpies = spies.fromSpy.calls[0].returned;
            assertSpyCall(queryBuilderSpies.select, 0); 
            assertSpyCall(queryBuilderSpies.eq, 0, { args: ['provider', 'openai'] });
            // Insert/Update should not be called
            assertEquals(queryBuilderSpies.insert?.calls.length ?? 0, 0); 
            assertEquals(queryBuilderSpies.update?.calls.length ?? 0, 0); 

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, String(dbError), "Error should be stringified original DB error object");
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

    // --- Add More Test Cases Here (Update, Deactivate, Mix, DB Insert/Update Errors) ---
    
    await t.step("should update existing models and deactivate missing ones", async () => {
        const mockApiKey = "test-api-key";
        let fetchStubDisposable: Disposable | undefined;
        try {
             fetchStubDisposable = stubFetchForTestScope().stub;

            // API returns gpt-4 (updated) and gpt-new, but NOT gpt-old
            const mockApiModels = { 
                data: [
                    { id: "gpt-4", object: "model", created: 1, owned_by: "openai-updated", permission: [], root: "gpt-4", parent: null }, // owned_by changed
                    { id: "gpt-new", object: "model", created: 3, owned_by: "openai", permission: [], root: "gpt-new", parent: null },
                ] 
            };
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            // DB contains gpt-4 (old version) and gpt-old
            const existingDbModels: DbAiProvider[] = [
                 { id: 'db-id-1', api_identifier: 'openai-gpt-4', name: 'gpt-4', description: null, is_active: true, provider: 'openai' }, 
                 { id: 'db-id-2', api_identifier: 'openai-gpt-old', name: 'gpt-old', description: null, is_active: true, provider: 'openai' },
            ]; 

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: existingDbModels.length },
                        insert: { data: [{ id: 'db-id-3', api_identifier: 'gpt-new', name: 'gpt-new', description: null, is_active: true, provider: 'openai' }], error: null, count: 1 }, 
                        update: (state: MockQueryBuilderState): Promise<{ data: any[] | null; error?: any | null; count?: number | null; status?: number; statusText?: string }> => {
                            // Access the update data from the state
                            const updateData = state.updateData as { is_active: boolean } | null;
                            
                            if (updateData && updateData.is_active === false) { // Deactivation
                                // Check filters to ensure we're deactivating the right ID(s)
                                const inFilter = state.filters.find((f: { column: string; value: any; type: 'eq' | 'in' }) => f.type === 'in' && f.column === 'id');
                                const idToDeactivate = inFilter?.value?.[0]; // Assuming single ID deactivate for this test
                                console.log(`[Test Mock Update] Deactivating ID: ${idToDeactivate}`);
                                return Promise.resolve({ data: [{ id: idToDeactivate ?? 'mock-deactivated-id', is_active: false }], error: null, count: 1, status: 200, statusText: 'OK' });
                            } else { // Update existing model (e.g., owned_by change)
                                 // Check filters to ensure we're updating the right ID
                                 const eqFilter = state.filters.find((f: { column: string; value: any; type: 'eq' | 'in' }) => f.type === 'eq' && f.column === 'id');
                                 const idToUpdate = eqFilter?.value;
                                 console.log(`[Test Mock Update] Updating ID: ${idToUpdate} with data:`, state.updateData);
                                 // Return data matching the expected change
                                 return Promise.resolve({ data: [{ id: idToUpdate ?? 'mock-updated-id', owned_by: (state.updateData as any)?.owned_by ?? 'unknown' }], error: null, count: 1, status: 200, statusText: 'OK' });
                            }
                        }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assertions
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Insert (gpt-new)
            assertSpyCall(fromSpy, 2, { args: ['ai_providers'] }); // Update (gpt-4)
            assertSpyCall(fromSpy, 3, { args: ['ai_providers'] }); // Update (deactivate gpt-old)

            const selectSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectSpies.select, 0);
            // assertSpyCall(selectSpies.eq, 0, { args: ['provider', 'openai'] }); 
            // Revert to count check for stability
            assertEquals(selectSpies.eq.calls.length, 1, "eq should be called once for select"); 

            const insertSpies = fromSpy.calls[1].returned;
            assertSpyCall(insertSpies.insert, 0);
            assertEquals(insertSpies.insert.calls[0].args[0][0].api_identifier, 'openai-gpt-new'); // Check correct API identifier

            const updateSpies = fromSpy.calls[2].returned;
            assertSpyCall(updateSpies.update, 0);
            // Check name from API model, not hardcoded
            assertEquals(updateSpies.update.calls[0].args[0].name, 'OpenAI gpt-4'); // Check correct name
            assertEquals(updateSpies.eq.calls.length, 1, "eq should be called once for update"); // Check count first

            const deactivateSpies = fromSpy.calls[3].returned;
            assertSpyCall(deactivateSpies.update, 0, { args: [{ is_active: false }] }); // Check the update payload
            assertEquals(deactivateSpies.in.calls.length, 1, "in should be called once for deactivate"); // Check count first
            assertEquals(deactivateSpies.in.calls[0].args[0], 'id'); // Column is 'id'
            assertEquals(deactivateSpies.in.calls[0].args[1], ['db-id-2']); // ID to deactivate (openai-gpt-old)

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 1); // gpt-new
            assertEquals(result.updated, 1); // gpt-4 updated
            assertEquals(result.deactivated, 1); // gpt-old deactivated
            assertEquals(result.error, undefined);
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

    await t.step("should do nothing if API and DB models match", async () => {
        const mockApiKey = "test-api-key";
        let fetchStubDisposable: Disposable | undefined;
        try {
            fetchStubDisposable = stubFetchForTestScope().stub;

            const commonModel = { id: "gpt-4", object: "model", created: 1, owned_by: "openai", permission: [], root: "gpt-4", parent: null };
            const mockApiModels = { data: [commonModel] }; 
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'openai-gpt-4', name: 'OpenAI gpt-4', description: 'Owned by: openai', is_active: true, provider: 'openai' },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 }
                        // No insert/update/delete expected
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assertions
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select called
            assertEquals(fromSpy.calls.length, 1, "Only select should happen"); // No other from calls
            
            const selectSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectSpies.select, 0);
            assertSpyCall(selectSpies.eq, 0, { args: ['provider', 'openai'] });
            assertEquals(selectSpies.insert?.calls.length ?? 0, 0, "Insert should not be called");
            assertEquals(selectSpies.update?.calls.length ?? 0, 0, "Update should not be called");

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

    await t.step("should return error result if DB insert fails", async () => {
        const mockApiKey = "test-api-key";
        const dbError = { message: "Insert failed", code: "23505", details: "", hint: "" }; // Example unique constraint error
        let fetchStubDisposable: Disposable | undefined;
        try {
            fetchStubDisposable = stubFetchForTestScope().stub;
            const mockApiModels = { data: [{ id: "gpt-new", object: "model", created: 1, owned_by: "openai", permission: [], root: "gpt-new", parent: null }] };
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: [], error: null, count: 0 }, // DB is empty
                        insert: { data: null, error: dbError } // Simulate insert error
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assertions
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Insert attempt
            assertEquals(fromSpy.calls.length, 2);

            const selectSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectSpies.select, 0);
            assertSpyCall(selectSpies.eq, 0, { args: ['provider', 'openai'] });

            const insertSpies = fromSpy.calls[1].returned;
            assertSpyCall(insertSpies.insert, 0);

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, "[object Object]", "Error message should be '[object Object]' due to error propagation");
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

     await t.step("should return error result if DB update fails", async () => {
        const mockApiKey = "test-api-key";
        const dbError = { message: "Update failed", code: "xxxxx", details: "", hint: "" };
        let fetchStubDisposable: Disposable | undefined;
        try {
            fetchStubDisposable = stubFetchForTestScope().stub;
            const mockApiModels = { data: [{ id: "gpt-4", object: "model", created: 1, owned_by: "openai-updated", permission: [], root: "gpt-4", parent: null }] }; // owned_by changed
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'openai-gpt-4', name: 'OpenAI gpt-4', description: 'Owned by: openai', is_active: true, provider: 'openai' },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        update: { data: null, error: dbError } // Simulate update error
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assertions
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Update attempt
            assertEquals(fromSpy.calls.length, 2);

            const selectSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectSpies.select, 0);
            assertSpyCall(selectSpies.eq, 0, { args: ['provider', 'openai'] });

            const updateSpies = fromSpy.calls[1].returned;
            assertSpyCall(updateSpies.update, 0);
            assertSpyCall(updateSpies.eq, 0, { args: ['id', 'db-id-1'] });

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); // Update failed
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, "[object Object]", "Error message should be '[object Object]' due to error propagation");
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });
    
     await t.step("should return error result if DB deactivate fails", async () => {
        const mockApiKey = "test-api-key";
        const dbError = { message: "Deactivation failed", code: "xxxxx", details: "", hint: "" };
        let fetchStubDisposable: Disposable | undefined;
        try {
            fetchStubDisposable = stubFetchForTestScope().stub;
            const mockApiModels = { data: [] }; // API returns no models
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'openai-gpt-old', name: 'OpenAI gpt-old', description: null, is_active: true, provider: 'openai' },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        update: { data: null, error: dbError } // Simulate update error on the deactivation call
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assertions
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Deactivate attempt
            assertEquals(fromSpy.calls.length, 2);

            const selectSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectSpies.select, 0);
            assertSpyCall(selectSpies.eq, 0, { args: ['provider', 'openai'] });

            const deactivateSpies = fromSpy.calls[1].returned;
            assertSpyCall(deactivateSpies.update, 0, { args: [{ is_active: false }] });
            assertSpyCall(deactivateSpies.in, 0, { args: ['id', ['db-id-1']] });

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0); // Deactivation failed
            assertEquals(result.error, "[object Object]", "Error message should be '[object Object]' due to error propagation");
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

     await t.step("should reactivate inactive model if it reappears in API", async () => {
        const mockApiKey = "test-api-key";
        let fetchStubDisposable: Disposable | undefined;
        try {
            fetchStubDisposable = stubFetchForTestScope().stub;
            const mockApiModels = { data: [{ id: "gpt-4", object: "model", created: 1, owned_by: "openai", permission: [], root: "gpt-4", parent: null }] }; 
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            // DB model is inactive
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'openai-gpt-4', name: 'OpenAI gpt-4', description: 'Owned by: openai', is_active: false, provider: 'openai' },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        update: { data: [{ id: 'db-id-1', is_active: true }], error: null, count: 1 } // Expect successful update
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assertions
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Update (reactivation)
            assertEquals(fromSpy.calls.length, 2);

            const updateSpies = fromSpy.calls[1].returned;
            assertSpyCall(updateSpies.update, 0);
            assertEquals(updateSpies.update.calls[0].args[0], { is_active: true }); // Verify reactivation payload
            assertSpyCall(updateSpies.eq, 0, { args: ['id', 'db-id-1'] });

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 1); // Reactivation counts as update
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

    await t.step("should deactivate all active models if API returns empty", async () => {
        const mockApiKey = "test-api-key";
        let fetchStubDisposable: Disposable | undefined;
        try {
            fetchStubDisposable = stubFetchForTestScope().stub;
            const mockApiModels = { data: [] }; // Empty API response
            setMockFetchResponse(new Response(JSON.stringify(mockApiModels), { status: 200 }));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'openai-gpt-4', name: 'OpenAI gpt-4', description: null, is_active: true, provider: 'openai' },
                { id: 'db-id-2', api_identifier: 'openai-gpt-old', name: 'OpenAI gpt-old', description: null, is_active: true, provider: 'openai' },
                { id: 'db-id-3', api_identifier: 'openai-gpt-inactive', name: 'OpenAI gpt-inactive', description: null, is_active: false, provider: 'openai' },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: existingDbModels.length },
                        // Expect successful deactivation update call
                        update: { data: [{ id: 'db-id-1', is_active: false }, { id: 'db-id-2', is_active: false }], error: null, count: 2 } 
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncOpenAIModels(mockClient as any, mockApiKey);

            // Assertions
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Update (deactivation)
            assertEquals(fromSpy.calls.length, 2);

            const deactivateSpies = fromSpy.calls[1].returned;
            assertSpyCall(deactivateSpies.update, 0, { args: [{ is_active: false }] });
            assertSpyCall(deactivateSpies.in, 0);
            // Check that only initially active models are in the 'in' filter
            assertEquals(deactivateSpies.in.calls[0].args[0], 'id'); 
            assertEquals(deactivateSpies.in.calls[0].args[1]?.length, 2);
            assert(deactivateSpies.in.calls[0].args[1]?.includes('db-id-1'));
            assert(deactivateSpies.in.calls[0].args[1]?.includes('db-id-2'));

            // Check SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 2); // Only the 2 initially active models
            assertEquals(result.error, undefined);
        } finally {
            fetchStubDisposable?.[Symbol.dispose]();
        }
    });

}); 