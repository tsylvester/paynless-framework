import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  GatherArtifactsReturn,
} from "./gatherArtifacts.interface.ts";
import { isGatherArtifactsSuccessReturn, isGatherArtifactsErrorReturn } from "./gatherArtifacts.guard.ts";
import {
  buildGatherArtifact,
  buildGatherArtifactsErrorReturn,
  buildGatherArtifactsPayload,
  buildGatherArtifactsParams,
  buildGatherArtifactsSuccessReturn,
  buildGatherArtifactsDeps,
  createGatherArtifactsMock,
} from "./gatherArtifacts.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";

Deno.test("Valid: inputsRequired undefined -> success with empty artifacts", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload();
  const { gatherArtifacts: fn } = createGatherArtifactsMock({
    result: buildGatherArtifactsSuccessReturn([]),
  });
  const result = await fn(deps, params, payload);
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 0);
  }
});

Deno.test("Valid: inputsRequired empty array -> success with empty artifacts", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload([]);
  const { gatherArtifacts: fn } = createGatherArtifactsMock({
    result: buildGatherArtifactsSuccessReturn([]),
  });
  const result = await fn(deps, params, payload);
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 0);
  }
});

Deno.test("Valid: document rule with content -> success artifact shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload([]);
  const artifact = buildGatherArtifact({
    id: "doc-1",
    content: "content-doc-1",
  });
  const { gatherArtifacts: fn } = createGatherArtifactsMock({
    result: buildGatherArtifactsSuccessReturn([artifact]),
  });
  const result = await fn(deps, params, payload);
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts[0].id, "doc-1");
    assertEquals(result.artifacts[0].content, "content-doc-1");
    assertEquals(result.artifacts[0].document_key, "header_context");
    assertEquals(result.artifacts[0].stage_slug, "thesis");
    assertEquals(result.artifacts[0].type, "document");
  }
});

Deno.test("Valid: optional rule miss -> success with empty artifacts", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload([]);
  const { gatherArtifacts: fn } = createGatherArtifactsMock({
    result: buildGatherArtifactsSuccessReturn([]),
  });
  const result = await fn(deps, params, payload);
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts, []);
  }
});

Deno.test("Invalid: required rule DB miss -> error return retriable false", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload([]);
  const resultValue: GatherArtifactsReturn = buildGatherArtifactsErrorReturn(
    new Error("required rule missing"),
    false,
  );
  const { gatherArtifacts: fn } = createGatherArtifactsMock({
    result: resultValue,
  });
  const result = await fn(deps, params, payload);
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("Invalid: required rule storage download failure -> error return", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload([]);
  const { gatherArtifacts: fn } = createGatherArtifactsMock({
    result: buildGatherArtifactsErrorReturn(new Error("download failed"), false),
  });
  const result = await fn(deps, params, payload);
  assertEquals(isGatherArtifactsErrorReturn(result), true);
});

Deno.test("Valid: duplicate artifact ids -> success deduplicated to one", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const params = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload([]);
  const { gatherArtifacts: fn } = createGatherArtifactsMock({
    result: buildGatherArtifactsSuccessReturn([
      buildGatherArtifact({ id: "dup-1" }),
    ]),
  });
  const result = await fn(deps, params, payload);
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "dup-1");
  }
});
