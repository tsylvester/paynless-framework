// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the function to test
import { syncGoogleModels } from "./google_sync.ts"; 

// Import the adapter to mock its method
import { googleAdapter } from "../_shared/ai_service/google_adapter.ts";

// Import shared types and test utils
import type { DbAiProvider, SyncResult } from "./index.ts"; 
import type { ProviderModelInfo } from "../_shared/types.ts";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type MockQueryBuilderState 
} from "../_shared/test-utils.ts";

// Constants for Google
const PROVIDER_NAME = 'google';
const GOOGLE_API_KEY = "test-google-key"; // Use a placeholder key for tests

// --- Test Suite ---

Deno.test("syncGoogleModels", { 
    sanitizeOps: false, 
    sanitizeResources: false, 
}, async (t) => {

    await t.step("should insert new models when DB is empty and adapter returns models", async () => {
        let listModelsStub: Stub | undefined;
        try {
            // Mock the adapter response (example Google models)
            const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: 'Most capable model' },
                { api_identifier: 'google-gemini-1.5-flash-latest', name: 'Google Gemini 1.5 Flash', description: 'Fast and versatile model' },
            ];
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve(mockApiModels));
            
            // Configure the Supabase mock
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: [], error: null, count: 0 }, // DB empty
                        insert: { data: mockApiModels.map(m => ({ ...m, provider: PROVIDER_NAME, is_active: true })), error: null, count: mockApiModels.length }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);
            
            // Assertions 
            assertSpyCall(listModelsStub, 0, { args: [GOOGLE_API_KEY] }); // Adapter called

            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 2, "from() should be called twice (select, insert)");

            const selectBuilderSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectBuilderSpies.select, 0);
            assertEquals(selectBuilderSpies.eq.calls.length, 1);
            assertSpyCall(selectBuilderSpies.eq, 0, { args: ['provider', PROVIDER_NAME] });

            const insertBuilderSpies = fromSpy.calls[1].returned;
            assertEquals(insertBuilderSpies.insert.calls.length, 1);
            const insertArgs = insertBuilderSpies.insert.calls[0].args[0];
            assertEquals(insertArgs.length, mockApiModels.length);
            assertEquals(insertArgs[0].api_identifier, mockApiModels[0].api_identifier);
            assertEquals(insertArgs[0].name, mockApiModels[0].name);
            assertEquals(insertArgs[0].provider, PROVIDER_NAME);
            assertEquals(insertArgs[1].api_identifier, mockApiModels[1].api_identifier);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, mockApiModels.length);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);

        } finally {
            listModelsStub?.restore(); // Restore original adapter method
        }
    });

    await t.step("should return error result if adapter call fails", async () => {
        let listModelsStub: Stub | undefined;
        const adapterError = new Error("Google API Key Invalid");
        try {
            // Mock googleAdapter.listModels to throw an error
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.reject(adapterError));
            
            const { client: mockClient, spies } = createMockSupabaseClient();

            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);
            
            assertSpyCall(listModelsStub, 0, { args: [GOOGLE_API_KEY] });

            // Ensure Supabase was NOT called
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, adapterError.message); 

        } finally {
            listModelsStub?.restore();
        }
    });
    
    await t.step("should return error result if DB select fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "DB Connection refused", code: "500" };
        try {
            // Mock adapter to return successfully
             const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: 'Most capable model' },
             ];
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve(mockApiModels));

            // Configure Supabase mock for select error
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                 genericMockResults: {
                    ai_providers: {
                        select: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);

            assertSpyCall(listModelsStub, 0, { args: [GOOGLE_API_KEY] });

            // Check DB call
            assertSpyCall(spies.fromSpy, 0, { args: ['ai_providers'] });
            const queryBuilderSpies = spies.fromSpy.calls[0].returned;
            assertSpyCall(queryBuilderSpies.select, 0); 
            assertSpyCall(queryBuilderSpies.eq, 0, { args: ['provider', PROVIDER_NAME] });

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            // The error should be the stringified DB error object
            assertEquals(result.error, String(dbError));

        } finally {
            listModelsStub?.restore();
        }
    });

    await t.step("should do nothing if API and DB models match", async () => {
        let listModelsStub: Stub | undefined;
        try {
            const commonModel = { api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: 'Most capable model' };
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve([commonModel]));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-g1', api_identifier: commonModel.api_identifier, name: commonModel.name, description: commonModel.description, is_active: true, provider: PROVIDER_NAME },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); 
            assertEquals(fromSpy.calls.length, 1, "Only select should happen");
            
            const selectSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectSpies.select, 0);
            assertSpyCall(selectSpies.eq, 0, { args: ['provider', PROVIDER_NAME] });
            assertEquals(selectSpies.insert?.calls.length ?? 0, 0);
            assertEquals(selectSpies.update?.calls.length ?? 0, 0);

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            listModelsStub?.restore();
        }
    });

    await t.step("should return error result if DB insert fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "Insert failed", code: "23505" };
        try {
            const mockApiModels = [{ api_identifier: 'google-new-model', name: 'Google New Model', description: undefined }];
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve(mockApiModels));

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: [], error: null, count: 0 },
                        insert: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] });
            assertEquals(fromSpy.calls.length, 2);
            assertSpyCall(fromSpy.calls[1].returned.insert, 0);

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            // Match the error handling in syncGoogleModels which stringifies the error
            assertEquals(result.error, `Insert failed for ${PROVIDER_NAME}: ${dbError.message}`); 
        } finally {
            listModelsStub?.restore();
        }
    });

     await t.step("should return error result if DB update fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "Update failed", code: "xxxxx" };
        const modelId = 'db-id-g1';
        try {
            const mockApiModels = [{ api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro UPDATED', description: undefined }];
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve(mockApiModels));

            const existingDbModels: DbAiProvider[] = [
                { id: modelId, api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: null, is_active: true, provider: PROVIDER_NAME },
            ];

            // Simulate multiple calls for update - one per update needed
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                 genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        // Simulate update failure
                        update: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            // Expect a call to 'from' for each update attempt
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); 
            assertEquals(fromSpy.calls.length, 2); // select + update attempt
            assertSpyCall(fromSpy.calls[1].returned.update, 0);
            assertSpyCall(fromSpy.calls[1].returned.eq, 0, { args: ['id', modelId] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); // Update failed
            assertEquals(result.deactivated, 0);
            // Match the adjusted error handling in syncGoogleModels for update loops
            assertEquals(result.error, `Update process failed for ${PROVIDER_NAME}: ${dbError.message}`); 
        } finally {
            listModelsStub?.restore();
        }
    });
    
     await t.step("should return error result if DB deactivate fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "Deactivation failed", code: "xxxxx" };
        try {
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve([])); // Empty API response

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-g1', api_identifier: 'google-old-model', name: 'Google Old', description: null, is_active: true, provider: PROVIDER_NAME },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                 genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        update: { data: null, error: dbError } // Fail the update (deactivation)
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Select + Deactivate attempt
            assertEquals(fromSpy.calls.length, 2);

            const deactivateSpies = fromSpy.calls[1].returned;
            assertSpyCall(deactivateSpies.update, 0, { args: [{ is_active: false }] });
            assertSpyCall(deactivateSpies.in, 0, { args: ['id', ['db-id-g1']] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0); // Deactivation failed
            // Match the error handling in syncGoogleModels
            assertEquals(result.error, `Deactivation failed for ${PROVIDER_NAME}: ${dbError.message}`); 
        } finally {
            listModelsStub?.restore();
        }
    });

     await t.step("should reactivate inactive model if it reappears in API", async () => {
        let listModelsStub: Stub | undefined;
        const modelId = 'db-id-g1';
        try {
             const mockApiModels = [{ api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: 'Most capable model' }];
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve(mockApiModels));

            const existingDbModels: DbAiProvider[] = [
                { id: modelId, api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: null, is_active: false, provider: PROVIDER_NAME }, // Initially inactive, description differs
            ];

            // Mock config: Select finds the inactive model, Update succeeds
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        // Simulate successful update for the one model
                        update: { data: [{ id: modelId, is_active: true }], error: null, count: 1 } 
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Update attempt
            assertEquals(fromSpy.calls.length, 2); 

            const updateSpies = fromSpy.calls[1].returned;
            assertSpyCall(updateSpies.update, 0);
            // Expect both description and is_active to be updated
            assertEquals(updateSpies.update.calls[0].args[0], { description: 'Most capable model', is_active: true });
            assertSpyCall(updateSpies.eq, 0, { args: ['id', modelId] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 1); // One model updated (reactivated + description change)
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            listModelsStub?.restore();
        }
    });

    await t.step("should deactivate all active models if API returns empty", async () => {
        let listModelsStub: Stub | undefined;
        try {
            listModelsStub = stub(googleAdapter, "listModels", () => Promise.resolve([])); // Empty API response

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-g1', api_identifier: 'google-gemini-pro', name: 'Google Gemini Pro', description: null, is_active: true, provider: PROVIDER_NAME },
                { id: 'db-id-g2', api_identifier: 'google-gemini-flash', name: 'Google Gemini Flash', description: null, is_active: true, provider: PROVIDER_NAME },
                { id: 'db-id-g3', api_identifier: 'google-inactive', name: 'Google Inactive', description: null, is_active: false, provider: PROVIDER_NAME }, // Already inactive
         ];
             const activeModelIds = ['db-id-g1', 'db-id-g2'];

            // Mock config: Select finds models, Update (deactivate) succeeds
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: existingDbModels.length },
                        update: { data: activeModelIds.map(id => ({ id, is_active: false })), error: null, count: activeModelIds.length } 
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); // Select
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] }); // Deactivate attempt
            assertEquals(fromSpy.calls.length, 2);

            const deactivateSpies = fromSpy.calls[1].returned;
            assertSpyCall(deactivateSpies.update, 0, { args: [{ is_active: false }] });
            assertSpyCall(deactivateSpies.in, 0);
            assertEquals(deactivateSpies.in.calls[0].args[0], 'id'); 
            // Check the list of IDs passed to 'in'
            const idsToDeactivate = deactivateSpies.in.calls[0].args[1] as string[];
            assertEquals(idsToDeactivate?.length, activeModelIds.length);
            assert(idsToDeactivate?.includes('db-id-g1'));
            assert(idsToDeactivate?.includes('db-id-g2'));

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, activeModelIds.length); // Only the 2 initially active models
            assertEquals(result.error, undefined);
        } finally {
            listModelsStub?.restore();
        }
    });

    // --- Additional Google Specific Tests (Optional) ---
    // Add any tests specific to Google's API behavior or model properties if needed.

}); 