import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { Database } from "../types_db.ts";
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
    config: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

Deno.test("listModelCatalog should fetch and return catalog entries successfully", async () => {
  const mockRows: AiProvidersRow[] = [
    aiProviderRow({ id: "a", name: "Alpha", provider: "openai", is_default_generation: true }),
    aiProviderRow({ id: "b", name: "Beta", provider: "anthropic", is_default_generation: false }),
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
  assertEquals(data?.length, 2);
  assertEquals(data?.[0].id, "a");
  assertEquals(data?.[0].model_name, "Alpha");
  assertEquals(data?.[0].provider_name, "openai");
  assertEquals(data?.[0].is_default_generation, true);
  assertEquals(data?.[1].id, "b");
  assertEquals(data?.[1].model_name, "Beta");
  assertEquals(data?.[1].provider_name, "anthropic");
  assertEquals(data?.[1].is_default_generation, false);
});

Deno.test("listModelCatalog should return entries ordered by name ascending", async () => {
  const mockRows: AiProvidersRow[] = [
    aiProviderRow({ id: "z", name: "Zeta" }),
    aiProviderRow({ id: "a", name: "Alpha" }),
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
  assertEquals(data?.[1].model_name, "Zeta");
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

Deno.test("listModelCatalog should map row with null provider to provider_name empty string", async () => {
  const rowWithNullProvider = aiProviderRow({ id: "n", name: "NullProvider", provider: null });
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
  assertEquals(data?.length, 1);
  assertEquals(data?.[0].provider_name, "");
  assertEquals(data?.[0].model_name, "NullProvider");
});
