import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { Database } from "../types_db.ts";
import { listModelCatalog } from "./listModelCatalog.ts";
import type { AiProvidersRow } from "./dialectic.interface.ts";

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

Deno.test("listModelCatalog should return ai_providers rows from the database without reshaping", async () => {
  const mockRows: AiProvidersRow[] = [
    aiProviderRow({ id: "a", name: "Alpha", provider: "openai", is_default_generation: true, min_plan_tier_level: 0 }),
    aiProviderRow({ id: "b", name: "Beta", provider: "anthropic", is_default_generation: false, min_plan_tier_level: 10 }),
  ];
  const sortedRows: AiProvidersRow[] = [...mockRows].sort((a, b) => a.name.localeCompare(b.name));

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
  assertEquals(data?.length, 2);
  assertEquals(data, sortedRows);
});

Deno.test("listModelCatalog should return entries ordered by name ascending", async () => {
  const mockRows: AiProvidersRow[] = [
    aiProviderRow({ id: "z", name: "Zeta", min_plan_tier_level: 20 }),
    aiProviderRow({ id: "a", name: "Alpha", min_plan_tier_level: 0 }),
  ];
  const sortedRows: AiProvidersRow[] = [...mockRows].sort((a, b) => a.name.localeCompare(b.name));

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
  assertEquals(data, sortedRows);
  assertEquals(data?.[0].name, "Alpha");
  assertEquals(data?.[0].min_plan_tier_level, 0);
  assertEquals(data?.[1].name, "Zeta");
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

Deno.test("listModelCatalog should return ai_providers rows including null provider values from the database", async () => {
  const rowWithNullProvider: AiProvidersRow = aiProviderRow({
    id: "n",
    name: "NullProvider",
    provider: null,
    min_plan_tier_level: 30,
  });
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

  assert(error === undefined);
  assertExists(data);
  assertEquals(data, [rowWithNullProvider]);
});

Deno.test("listModelCatalog should return ai_providers rows with config JSON preserved", async () => {
  const geminiFlashRow: AiProvidersRow = aiProviderRow({
    id: "gemini-flash",
    name: "Gemini 3 Flash Preview",
    api_identifier: "google-gemini-3-flash-preview",
    provider: "google",
    is_default_generation: true,
    config: {
      api_identifier: "google-gemini-3-flash-preview",
      context_window_tokens: 1048576,
      hard_cap_output_tokens: 65536,
      provider_max_output_tokens: 65536,
    },
  });
  const mockSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [geminiFlashRow], error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const { data, error } = await listModelCatalog(mockSupabaseClient);

  assert(error === undefined);
  assertExists(data);
  assertEquals(data, [geminiFlashRow]);
  assertEquals(data?.[0].config, geminiFlashRow.config);
});
