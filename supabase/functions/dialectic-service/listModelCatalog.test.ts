import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { Database } from "../types_db.ts";
import type { AIModelCatalogEntry } from "./dialectic.interface.ts";
import { listModelCatalog } from "./listModelCatalog.ts";

type AiProvidersRow = Database["public"]["Tables"]["ai_providers"]["Row"];

function aiProviderRow(overrides: Partial<AiProvidersRow>): AiProvidersRow {
  return {
    id: "id-1",
    name: "Model One",
    api_identifier: "provider-model-one",
    provider: "openai",
    description: "First model",
    is_active: true,
    is_default_generation: false,
    is_default_embedding: false,
    is_enabled: true,
    min_plan_tier_level: 0,
    config: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

Deno.test("listModelCatalog should fetch and return catalog entries successfully", async () => {
  const mockRows: AiProvidersRow[] = [
    aiProviderRow({ id: "a", name: "Alpha", provider: "openai", is_default_generation: true, min_plan_tier_level: 0 }),
    aiProviderRow({ id: "b", name: "Beta", provider: "anthropic", is_default_generation: false, min_plan_tier_level: 10 }),
  ];
  const sortedRows = [...mockRows].sort((a, b) => a.name.localeCompare(b.name));

  const mockSupabaseClient = {
    from: (table: string) => {
      assertEquals(table, "ai_providers");
      return {
        select: (query: string) => {
          assertEquals(query, "*");
          return {
            eq: (field: string, value: boolean) => {
              assertEquals(field, "is_active");
              assertEquals(value, true);
              return {
                eq: (field2: string, value2: boolean) => {
                  assertEquals(field2, "is_enabled");
                  assertEquals(value2, true);
                  return {
                    order: (orderField: string, options: { ascending: boolean }) => {
                      assertEquals(orderField, "name");
                      assertEquals(options.ascending, true);
                      return Promise.resolve({ data: sortedRows, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  const { data, error } = await listModelCatalog(mockSupabaseClient);

  assert(error === undefined, "Expected no error");
  assertExists(data, "Expected data to be returned");
  const expectedEntries: AIModelCatalogEntry[] = [
    {
      id: "a",
      provider_name: "openai",
      model_name: "Alpha",
      api_identifier: "provider-model-one",
      description: "First model",
      strengths: null,
      weaknesses: null,
      context_window_tokens: null,
      input_token_cost_usd_millionths: null,
      output_token_cost_usd_millionths: null,
      max_output_tokens: null,
      is_active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      is_default_generation: true,
      min_plan_tier_level: 0,
    },
    {
      id: "b",
      provider_name: "anthropic",
      model_name: "Beta",
      api_identifier: "provider-model-one",
      description: "First model",
      strengths: null,
      weaknesses: null,
      context_window_tokens: null,
      input_token_cost_usd_millionths: null,
      output_token_cost_usd_millionths: null,
      max_output_tokens: null,
      is_active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      is_default_generation: false,
      min_plan_tier_level: 10,
    },
  ];
  assertEquals(data?.length, 2);
  assertEquals(data, expectedEntries);
});

Deno.test("listModelCatalog should return entries ordered by name ascending", async () => {
  const mockRows: AiProvidersRow[] = [
    aiProviderRow({ id: "z", name: "Zeta", min_plan_tier_level: 20 }),
    aiProviderRow({ id: "a", name: "Alpha", min_plan_tier_level: 0 }),
  ];
  const sortedRows = [...mockRows].sort((a, b) => a.name.localeCompare(b.name));

  const mockSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: sortedRows, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const { data } = await listModelCatalog(mockSupabaseClient);

  assertExists(data);
  assertEquals(data?.[0].model_name, "Alpha");
  assertEquals(data?.[0].min_plan_tier_level, 0);
  assertEquals(data?.[1].model_name, "Zeta");
  assertEquals(data?.[1].min_plan_tier_level, 20);
});

Deno.test("listModelCatalog should return empty array when no active providers", async () => {
  const mockSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const { data, error } = await listModelCatalog(mockSupabaseClient);

  assert(error === undefined);
  assertExists(data);
  assertEquals(data?.length, 0);
});

Deno.test("listModelCatalog should return error when database call fails", async () => {
  const dbError = { message: "Connection failed", code: "500", details: "some details", hint: "" };
  const mockSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: dbError }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const { data, error } = await listModelCatalog(mockSupabaseClient);

  assert(data === undefined, "Expected no data to be returned");
  assertExists(error, "Expected an error to be returned");
  assertEquals(error?.status, 500);
  assertEquals(error?.code, "DB_FETCH_FAILED");
  assertEquals(error?.message, "Could not fetch AI model catalog.");
});

Deno.test("listModelCatalog should return error when provider is null", async () => {
  const rowWithNullProvider = aiProviderRow({ id: "n", name: "NullProvider", provider: null, min_plan_tier_level: 30 });
  const mockSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [rowWithNullProvider], error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const { data, error } = await listModelCatalog(mockSupabaseClient);

  assert(data === undefined, "Expected no data to be returned");
  assertExists(error, "Expected an error to be returned");
  assertEquals(error?.status, 500);
  assertEquals(error?.code, "LIST_MODEL_CATALOG_FAILED");
  assertEquals(error?.message, "Invalid row data for catalog entry.");
  assertEquals(error?.details, "Invalid row data for catalog entry.");
});

Deno.test("listModelCatalog should include min_plan_tier_level in returned entry shape", async () => {
  const tieredRow: AiProvidersRow = aiProviderRow({
    id: "tiered-model",
    name: "Tiered Model",
    provider: "openai",
    min_plan_tier_level: 10,
    is_default_generation: true,
  });
  const mockSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [tieredRow], error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const { data, error } = await listModelCatalog(mockSupabaseClient);

  assert(error === undefined);
  assertExists(data);
  const expectedEntry: AIModelCatalogEntry = {
    id: "tiered-model",
    provider_name: "openai",
    model_name: "Tiered Model",
    api_identifier: "provider-model-one",
    description: "First model",
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    is_default_generation: true,
    min_plan_tier_level: 10,
  };
  assertEquals(typeof data?.[0].min_plan_tier_level, "number");
  assertEquals(data?.[0].min_plan_tier_level, 10);
  assertEquals(data?.[0], expectedEntry);
});
