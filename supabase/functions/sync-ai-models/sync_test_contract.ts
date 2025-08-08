// supabase/functions/sync-ai-models/sync_test_contract.ts
/**
 * This file defines a generic test suite for any AI Model Sync Function.
 * It ensures that all sync functions, regardless of the provider,
 * behave identically in their core logic: fetching data, diffing it with the DB,
 * and executing inserts, updates, and deactivations.
 *
 * To use this, a provider-specific test file (e.g., openai_sync.test.ts) will:
 * 1. Import this function.
 * 2. Create a parent `Deno.test` block.
 * 3. Within that block, create a `MockProviderData` object with provider-specific test data.
 * 4. `await` this function, passing the test context `t`, the sync function itself,
 *    the mock data, and the provider's name.
 */
import { assertSpyCall, assertSpyCalls, spy, stub, type Spy, type SpyCall } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ConfigAssembler, type AssembledModelConfig } from "./config_assembler.ts";
import { type DbAiProvider, type SyncResult } from "./index.ts";
import type { ProviderModelInfo } from "../_shared/types.ts";
import type { Database } from "../types_db.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";

// --- Generic Test Setup ---

/**
 * Defines the shape of the provider-specific data required by the test contract.
 */
export interface MockProviderData {
  apiModels: AssembledModelConfig[];
  dbModel: DbAiProvider;
  staleDbModel: DbAiProvider;
  inactiveDbModel: DbAiProvider;
  reactivateApiModel: AssembledModelConfig;
  newApiModel: AssembledModelConfig;
  updatedApiModel: AssembledModelConfig;
}

// Helper to create mock dependencies for any sync function.
type Spied<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
      ? Spy<unknown, A, R>
      : T[K];
  };

  export interface SyncDeps {
    listProviderModels: (apiKey: string) => Promise<{ models: ProviderModelInfo[], raw: unknown }>;
    getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  }
  type SpiedSyncDeps = Spied<SyncDeps>;
  
  // Helper to create mock dependencies, following the established pattern.
  const createMockSyncDeps = (overrides: Partial<SpiedSyncDeps> = {}): SpiedSyncDeps => ({
      listProviderModels: spy(async (_apiKey: string) => ({ models: [], raw: {} })),
      getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => []),
      log: spy(() => {}),
      error: spy(() => {}),
      ...overrides,
  });


// --- The Test Contract ---

export async function testSyncContract(
    t: Deno.TestContext,
    syncFunction: (supabaseClient: SupabaseClient, apiKey: string, deps: SyncDeps) => Promise<SyncResult>,
    mockProviderData: MockProviderData,
    providerName: string
) {
    const MOCK_API_KEY = `test-key-${providerName}`;

    await t.step(`[Contract] ${providerName}: should insert new models when DB is empty`, async () => {
        const mockDeps = createMockSyncDeps({
            getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => []),
        });
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([mockProviderData.newApiModel]));

        try {
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: { ai_providers: { insert: { data: [], error: null, count: 1 } } }
            });

            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.getCurrentDbModels, 0);
            assertSpyCalls(assembleStub, 1);

            const insertSpy = spies.fromSpy.calls[0]?.returned.insert;
            assertExists(insertSpy);
            assertSpyCalls(insertSpy, 1);
            
            const insertArgs = insertSpy.calls[0].args[0];
            assertEquals(insertArgs.length, 1);
            assertEquals(insertArgs[0].api_identifier, mockProviderData.newApiModel.api_identifier);
            assertEquals(insertArgs[0].config, mockProviderData.newApiModel.config);

            assertEquals(result.inserted, 1);
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should do nothing if API and DB models match`, async () => {
        const mockDeps = createMockSyncDeps({
             getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => [mockProviderData.dbModel]),
        });
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([mockProviderData.apiModels[0]]));

        try {
            const { client: mockClient, spies } = createMockSupabaseClient();
            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);

            assertEquals(spies.fromSpy.calls.length, 0, "No DB operations should occur");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should deactivate stale models`, async () => {
        const mockDeps = createMockSyncDeps({
             getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => [mockProviderData.staleDbModel]),
        });
        // Assembler returns an empty list, making the DB model stale.
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([]));
        
        try {
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: { ai_providers: { update: { data: [], error: null, count: 1 } } }
            });

            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            const deactivateCall = spies.fromSpy.calls.find(c => c.returned.in?.calls.some((inCall: SpyCall<unknown, [string, (string | number)[]]>) => inCall.args[1]?.includes(mockProviderData.staleDbModel.id)));
            assertExists(deactivateCall, `Deactivate call for ${mockProviderData.staleDbModel.id} not found`);
            assertEquals(deactivateCall.returned.update.calls[0].args[0], { is_active: false });
            assertEquals(result.deactivated, 1);
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should reactivate inactive model if it reappears`, async () => {
        const mockDeps = createMockSyncDeps({
            getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => [mockProviderData.inactiveDbModel]),
        });
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([mockProviderData.reactivateApiModel]));

        try {
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: { ai_providers: { update: { data: [], error: null, count: 1 } } }
            });
            
            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);

            assertEquals(result.updated, 1);
            
            const updateCall = spies.fromSpy.calls[0];
            assertExists(updateCall);
            const updatePayload = updateCall.returned.update.calls[0].args[0];
            assertEquals(updatePayload.is_active, true, "is_active should be true");
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should update model if config changes`, async () => {
        const mockDeps = createMockSyncDeps({
             getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => [mockProviderData.dbModel]),
        });
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([mockProviderData.updatedApiModel]));
        
        try {
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {
                 genericMockResults: { ai_providers: { update: { data: [], error: null, count: 1 } } }
            });

            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);

            assertEquals(result.updated, 1, "Expected 1 update");
            const updateCall = spies.fromSpy.calls.find(c => c.returned.eq?.calls.some((eq: SpyCall<unknown, [string, string]>) => eq.args[1] === mockProviderData.dbModel.id));
            assertExists(updateCall, `Update call for ${mockProviderData.dbModel.id} not found`);
            const updatePayload = updateCall.returned.update.calls[0].args[0];
            assertEquals(updatePayload.name, mockProviderData.updatedApiModel.name);
            assertEquals(updatePayload.description, mockProviderData.updatedApiModel.description);
        } finally {
            assembleStub.restore();
        }
    });

     await t.step(`[Contract] ${providerName}: should handle listModels failure`, async () => {
        const apiError = new Error("API Auth Error");
        const mockDeps = createMockSyncDeps({
            listProviderModels: spy(async (_apiKey: string) => Promise.reject(apiError)),
        });
        const { client: mockClient } = createMockSupabaseClient();
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([]));

        try {
            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.listProviderModels, 0);
            assertSpyCalls(assembleStub, 0); // Assembler should not be called
            assertSpyCall(mockDeps.error, 0);
            assertEquals(result.error, apiError.message);
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should handle getCurrentDbModels failure`, async () => {
        const dbError = new Error("DB Connection Error");
        const mockDeps = createMockSyncDeps({
            getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => Promise.reject(dbError)),
        });
        const { client: mockClient } = createMockSupabaseClient();
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([]));

        try {
            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.getCurrentDbModels, 0);
            assertSpyCalls(assembleStub, 0);
            assertSpyCall(mockDeps.error, 0);
            assertEquals(result.error, dbError.message);
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should handle ConfigAssembler failure`, async () => {
        const assemblerError = new Error("Assembler failed");
        const mockDeps = createMockSyncDeps();
        const { client: mockClient } = createMockSupabaseClient();
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.reject(assemblerError));

        try {
            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            assertSpyCalls(assembleStub, 1);
            assertSpyCall(mockDeps.error, 0);
            assertEquals(result.error, assemblerError.message);
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should handle DB insert failure`, async () => {
        const dbError = { message: "DB insert violation", name: "DB Error" };
        const mockDeps = createMockSyncDeps({
            getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => []),
        });
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([mockProviderData.newApiModel]));

        try {
            const { client: mockClient } = createMockSupabaseClient(undefined, {
                genericMockResults: { ai_providers: { insert: { data: null, error: dbError } } }
            });

            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.error, 0);
            assert(result.error?.includes(dbError.message));
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should handle DB update failure`, async () => {
        const dbError = { message: "DB update violation", name: "DB Error" };
        const mockDeps = createMockSyncDeps({
             getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => [mockProviderData.dbModel]),
        });
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([mockProviderData.updatedApiModel]));
        
        try {
            const { client: mockClient } = createMockSupabaseClient(undefined, {
                 genericMockResults: { ai_providers: { update: { data: null, error: dbError } } }
            });

            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.error, 0);
            assert(result.error?.includes(dbError.message));
        } finally {
            assembleStub.restore();
        }
    });

    await t.step(`[Contract] ${providerName}: should handle DB deactivate failure`, async () => {
        const dbError = { message: "DB deactivate violation", name: "DB Error" };
        const mockDeps = createMockSyncDeps({
             getCurrentDbModels: spy(async (_client: SupabaseClient<Database>, _provider: string) => [mockProviderData.staleDbModel]),
        });
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve([]));
        
        try {
            const { client: mockClient } = createMockSupabaseClient(undefined, {
                genericMockResults: { ai_providers: { update: { data: null, error: dbError } } }
            });

            const result = await syncFunction(mockClient as unknown as SupabaseClient<Database>, MOCK_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.error, 0);
            assert(result.error?.includes(dbError.message));
        } finally {
            assembleStub.restore();
        }
    });
}
