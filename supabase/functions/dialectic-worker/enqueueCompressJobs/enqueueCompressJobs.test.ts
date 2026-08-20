import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PostgrestError } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { sanitizeForPath, constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import { enqueueCompressJobs } from "./enqueueCompressJobs.ts";
import { isDialecticCompressJobPayload } from "./enqueueCompressJobs.guard.ts";
import {
  buildenqueueCompressJobsDeps,
  buildenqueueCompressJobsParams,
  buildenqueueCompressJobsPayload,
  invalidateEnqueueCompressJobsPayload
} from "./enqueueCompressJobs.mock.ts";
import { CompressJobValidationError } from "./enqueueCompressJobs.interface.ts";

Deno.test("enqueueCompressJobs: existing artifact returns createdCount 0 and does not insert",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: {
            data: [{ id: "existing-resource-id" }],
            error: null,
          },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload();

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 0);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test("enqueueCompressJobs: existence check error returns retriable true and does not insert",
  async () => {
    const resourceError: PostgrestError = {
      name: "PostgrestError",
      message: "resource lookup failed",
      code: "PGRST116",
      details: "",
      hint: "",
    };
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: {
            data: null,
            error: resourceError,
          },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload();

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.retriable, true);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test("enqueueCompressJobs: under-budget victim inserts one COMPRESS row with no chunk fields",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload();

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 1);

    const firstRow = insertedRows[0];
    assert(isRecord(firstRow));
    assertEquals(firstRow.job_type, "COMPRESS");
    assertEquals(firstRow.parent_job_id, params.parentJob.id);
    assertEquals(firstRow.status, "pending");
    assert(isRecord(firstRow.payload));
    assertEquals(firstRow.payload.chunk_index, undefined);
    assertEquals(firstRow.payload.chunk_total, undefined);
  },
);

Deno.test("enqueueCompressJobs: over-budget victim splits into text-mode chunks with chunk_index and chunk_total",
  async () => {
    const splitText = spy(async (_text: string) => ["chunk1", "chunk2", "chunk3"]);
    const countTokens = spy(() => 1000);
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps({
      countTokens,
      textSplitter: { splitText },
    });
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload({
      victim: {
        mode: "json",
        content: "some content that is over budget",
        sourceType: "contribution",
      },
    });

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 3);
    }

    assertEquals(splitText.calls.length, 1);
    assertEquals(splitText.calls[0].args[0], payload.victim.content);

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 3);

    for (let i = 0; i < 3; i += 1) {
      const row = insertedRows[i];
      assert(isRecord(row));
      assert(isRecord(row.payload));
      assertEquals(row.payload.mode, "text");
      assertEquals(row.payload.chunk_index, i + 1);
      assertEquals(row.payload.chunk_total, 3);
    }
  },
);

Deno.test("enqueueCompressJobs: insert failure returns retriable false and issues no recovery select",
  async () => {
    const duplicateError: PostgrestError = {
      name: "PostgrestError",
      message: "duplicate key value",
      code: "23505",
      details: "",
      hint: "",
    };
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: {
            data: null,
            error: duplicateError,
          },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload();

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.retriable, false);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);

    const selectCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "select",
    );
    assertExists(selectCalls);
    assertEquals(selectCalls.callCount, 0);
  },
);

Deno.test("enqueueCompressJobs: idempotency keys are deterministic and match the documented derivation",
  async () => {
    const splitText = spy(async (_text: string) => ["chunk1", "chunk2", "chunk3"]);
    const countTokens = spy(() => 1000);
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps({
      countTokens,
      textSplitter: { splitText },
    });
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload();

    await enqueueCompressJobs(deps, params, payload);
    await enqueueCompressJobs(deps, params, payload);

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 2);
    assertExists(insertCalls.callsArgs[0]);
    assertExists(insertCalls.callsArgs[1]);

    const firstRows = insertCalls.callsArgs[0][0];
    const secondRows = insertCalls.callsArgs[1][0];
    assert(Array.isArray(firstRows));
    assert(Array.isArray(secondRows));
    assertEquals(firstRows.length, secondRows.length);

    const documentKey = payload.victim.documentKey;
    assert(documentKey);
    const baseKey =
      `${params.parentJob.id}_compress_${payload.victim.sourceType}_${documentKey}_${sanitizeForPath(params.output_type)}`;

    for (let i = 0; i < firstRows.length; i += 1) {
      const firstRow = firstRows[i];
      const secondRow = secondRows[i];
      assert(isRecord(firstRow));
      assert(isRecord(secondRow));

      const expectedKey = `${baseKey}_chunk_${i + 1}of${firstRows.length}`;
      assertEquals(firstRow.idempotency_key, expectedKey);
      assertEquals(secondRow.idempotency_key, expectedKey);
    }
  },
);

Deno.test("enqueueCompressJobs: contribution victim missing documentKey returns validation error",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const basePayload = buildenqueueCompressJobsPayload({
      victim: {
        mode: "text",
        content: "some content",
        sourceType: "contribution",
        sourceId: "source-1",
      },
    });
    const invalidVictim: unknown = {
      ...basePayload.victim,
      documentKey: null,
    };
    const invalidPayload: unknown = invalidateEnqueueCompressJobsPayload({
      victim: invalidVictim,
    });

    const result = await enqueueCompressJobs(deps, params, invalidPayload);

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof CompressJobValidationError, true);
      assertEquals(result.retriable, false);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test("enqueueCompressJobs: feedback victim with documentKey and no sourceId succeeds",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload({
      victim: {
        sourceType: "feedback",
      },
    });

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 1);

    const firstRow = insertedRows[0];
    assert(isRecord(firstRow));
    const documentKey = payload.victim.documentKey;
    assert(documentKey);
    const expectedSegment = `_compress_feedback_${documentKey}_`;
    assertEquals(
      String(firstRow.idempotency_key).includes(expectedSegment),
      true,
    );
  },
);

Deno.test("enqueueCompressJobs: feedback victim with no documentKey returns validation error naming documentKey",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const basePayload = buildenqueueCompressJobsPayload({
      victim: {
        sourceType: "feedback",
      },
    });
    const invalidVictim: unknown = {
      ...basePayload.victim,
      documentKey: null,
    };
    const invalidPayload: unknown = invalidateEnqueueCompressJobsPayload({
      victim: invalidVictim,
    });

    const result = await enqueueCompressJobs(deps, params, invalidPayload);

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof CompressJobValidationError, true);
      assertEquals(result.retriable, false);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test("enqueueCompressJobs: history victim with sourceId and role succeeds and carries role in payload",
  async () => {
    const constructStoragePathSpy = spy(constructStoragePath);
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps({
      constructStoragePath: constructStoragePathSpy,
    });
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload({
      victim: {
        sourceType: "history",
        sourceId: "history-1",
        role: "assistant",
      },
    });

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    assertEquals(constructStoragePathSpy.calls.length, 1);
    const pathContext = constructStoragePathSpy.calls[0].args[0];
    assert(isRecord(pathContext));
    assertEquals(pathContext.sourceType, "history");
    assertEquals(pathContext.sourceId, "history-1");
    assertEquals(pathContext.role, "assistant");

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 1);

    const firstRow = insertedRows[0];
    assert(isRecord(firstRow));
    assert(isRecord(firstRow.payload));
    assertEquals(isDialecticCompressJobPayload(firstRow.payload), true);
    assertEquals(firstRow.payload.role, "assistant");
  },
);

Deno.test("enqueueCompressJobs: history victim with sourceId and no role returns validation error naming role",
  async () => {
    const constructStoragePathSpy = spy(constructStoragePath);
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps({
      constructStoragePath: constructStoragePathSpy,
    });
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload({
      victim: {
        sourceType: "history",
        sourceId: "history-1",
      },
    });

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof CompressJobValidationError, true);
      assertEquals(result.retriable, false);
    }

    assertEquals(constructStoragePathSpy.calls.length, 0);

    const selectCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_project_resources",
      "select",
    );
    assertExists(selectCalls);
    assertEquals(selectCalls.callCount, 0);

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test("enqueueCompressJobs: history victim with role outside Messages is refused",
  async () => {
    const constructStoragePathSpy = spy(constructStoragePath);
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps({
      constructStoragePath: constructStoragePathSpy,
    });
    const params = buildenqueueCompressJobsParams({ dbClient });
    const basePayload = buildenqueueCompressJobsPayload({
      victim: {
        sourceType: "history",
        sourceId: "history-1",
        role: "assistant",
      },
    });
    const invalidVictim: unknown = {
      ...basePayload.victim,
      role: "model",
    };
    const invalidPayload: unknown = invalidateEnqueueCompressJobsPayload({
      victim: invalidVictim,
    });

    const result = await enqueueCompressJobs(deps, params, invalidPayload);

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof CompressJobValidationError, true);
      assertEquals(result.retriable, false);
    }

    assertEquals(constructStoragePathSpy.calls.length, 0);

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test("enqueueCompressJobs: chunked history victim carries role and model_slug on every chunk",
  async () => {
    const splitText = spy(async (_text: string) => ["chunk1", "chunk2", "chunk3"]);
    const countTokens = spy(() => 1000);
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps({
      countTokens,
      textSplitter: { splitText },
    });
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload({
      victim: {
        mode: "text",
        content: "some content that is over budget",
        sourceType: "history",
        sourceId: "history-1",
        role: "assistant",
      },
    });

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 3);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 3);

    for (let i = 0; i < 3; i += 1) {
      const row = insertedRows[i];
      assert(isRecord(row));
      assert(isRecord(row.payload));
      assertEquals(row.payload.role, "assistant");
      assertEquals(row.payload.model_slug, params.modelSlug);
      assertEquals(row.payload.chunk_index, i + 1);
      assertEquals(row.payload.chunk_total, 3);
    }
  },
);

Deno.test("enqueueCompressJobs: inserted payload model_slug equals params.modelSlug not params.modelId",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({
      dbClient,
      modelId: "distinct-model-id",
      modelSlug: "distinct-model-slug",
    });
    const payload = buildenqueueCompressJobsPayload();

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 1);

    const firstRow = insertedRows[0];
    assert(isRecord(firstRow));
    assert(isRecord(firstRow.payload));
    assertEquals(firstRow.payload.model_slug, "distinct-model-slug");
    assertEquals(
      firstRow.payload.model_slug === params.modelSlug, true,
    );
    assertEquals(
      firstRow.payload.model_slug === params.modelId, false,
    );
  },
);

Deno.test("enqueueCompressJobs: inserted child payload carries user_jwt equal to params.userJwt",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload();

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 1);

    const firstRow = insertedRows[0];
    assert(isRecord(firstRow));
    assert(isRecord(firstRow.payload));
    assertEquals(firstRow.payload.user_jwt, params.userJwt);
  },
);

Deno.test("enqueueCompressJobs: child payload idempotencyKey equals row idempotency_key for fitting and chunked victims",
  async () => {
    const splitText = spy(async (_text: string) => ["chunk1", "chunk2", "chunk3"]);
    const countTokens = spy(() => 1000);

    // Fitting (single-row) victim
    const mockSetupSingle = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClientSingle = mockSetupSingle.client as unknown as SupabaseClient<Database>;
    const depsSingle = buildenqueueCompressJobsDeps();
    const paramsSingle = buildenqueueCompressJobsParams({ dbClient: dbClientSingle });
    const payloadSingle = buildenqueueCompressJobsPayload();

    await enqueueCompressJobs(depsSingle, paramsSingle, payloadSingle);

    const insertCallsSingle = mockSetupSingle.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCallsSingle);
    assertExists(insertCallsSingle.callsArgs[0]);

    const singleRows = insertCallsSingle.callsArgs[0][0];
    assert(Array.isArray(singleRows));
    assertEquals(singleRows.length, 1);
    const singleRow = singleRows[0];
    assert(isRecord(singleRow));
    assert(isRecord(singleRow.payload));
    assertEquals(singleRow.payload.idempotencyKey, singleRow.idempotency_key);

    // Chunked (split) victim
    const mockSetupChunked = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClientChunked = mockSetupChunked.client as unknown as SupabaseClient<Database>;
    const depsChunked = buildenqueueCompressJobsDeps({
      countTokens,
      textSplitter: { splitText },
    });
    const paramsChunked = buildenqueueCompressJobsParams({ dbClient: dbClientChunked });
    const payloadChunked = buildenqueueCompressJobsPayload({
      victim: {
        mode: "json",
        content: "some content that is over budget",
        sourceType: "contribution",
      },
    });

    await enqueueCompressJobs(depsChunked, paramsChunked, payloadChunked);

    const insertCallsChunked = mockSetupChunked.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCallsChunked);
    assertExists(insertCallsChunked.callsArgs[0]);

    const chunkedRows = insertCallsChunked.callsArgs[0][0];
    assert(Array.isArray(chunkedRows));
    assertEquals(chunkedRows.length, 3);

    for (let i = 0; i < 3; i += 1) {
      const row = chunkedRows[i];
      assert(isRecord(row));
      assert(isRecord(row.payload));
      assertEquals(row.payload.idempotencyKey, row.idempotency_key);
    }
  },
);

Deno.test("enqueueCompressJobs: child payload carries neither job_type nor user_id, and the row carries both",
  async () => {
    const mockSetup = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null },
        },
        dialectic_generation_jobs: {
          insert: { data: [], error: null },
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildenqueueCompressJobsDeps();
    const params = buildenqueueCompressJobsParams({ dbClient });
    const payload = buildenqueueCompressJobsPayload();

    const result = await enqueueCompressJobs(deps, params, payload);

    assertEquals("createdCount" in result, true);
    if ("createdCount" in result) {
      assertEquals(result.createdCount, 1);
    }

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
      "dialectic_generation_jobs",
      "insert",
    );
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    assertExists(insertCalls.callsArgs[0]);

    const insertedRows = insertCalls.callsArgs[0][0];
    assert(Array.isArray(insertedRows));
    assertEquals(insertedRows.length, 1);

    const firstRow = insertedRows[0];
    assert(isRecord(firstRow));
    assert(isRecord(firstRow.payload));
    assertEquals("job_type" in firstRow.payload, false);
    assertEquals("user_id" in firstRow.payload, false);
    assertEquals(firstRow.job_type, "COMPRESS");
    assertEquals(firstRow.user_id, params.parentJob.user_id);
  },
);
