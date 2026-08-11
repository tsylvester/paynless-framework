// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.test.ts

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import {
  createMockSupabaseClient,
  type MockQueryBuilderState,
  type MockSupabaseDataConfig,
} from "../../_shared/supabase.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import type { ShouldEnqueueRenderJobResult } from "../../_shared/types/shouldEnqueueRenderJob.interface.ts";
import { RenderJobEnqueueError, RenderJobValidationError } from "../../_shared/utils/errors.ts";
import {
  resolveTemplateFilename,
  TemplateResolutionError,
} from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobReturn,
} from "./enqueueRenderJob.interface.ts";
import { enqueueRenderJob } from "./enqueueRenderJob.ts";
import { isFileType } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import {
  buildEnqueueRenderCompressedContextPayload,
  buildEnqueueRenderJobDeps,
  buildEnqueueRenderJobParams,
  buildEnqueueRenderJobPayload,
} from "./enqueueRenderJob.mock.ts";
import { isDialecticRenderCompressedContextJobPayload } from "./enqueueRenderJob.guards.ts";
import { buildDialecticJobRow } from "../../_shared/dialectic.mock.ts";
import { mockStageRow, mockTemplateStepRow, recipeChainConfig } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.mock.ts";

function setupMockClient(
  configOverrides: NonNullable<MockSupabaseDataConfig["genericMockResults"]> = {},
): ReturnType<typeof createMockSupabaseClient> {
  return createMockSupabaseClient("user-789", {
    genericMockResults: {
      ...configOverrides,
    },
  });
}

Deno.test(
  "enqueueRenderJob: when payload.needsContinuation is true, returns success with renderJobId null without calling shouldEnqueueRenderJob or inserting",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "is_json",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ needsContinuation: true }),
    );

    assertEquals(shouldEnqueueRenderJob.calls.length, 0);
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);

Deno.test(
  "enqueueRenderJob: when shouldEnqueueRenderJob returns is_json, returns success with renderJobId null and logs skip",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "is_json",
      }),
    );
    const mockLogger = new MockLogger();
    const infoSpy = spy(mockLogger, "info");
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      logger: mockLogger,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals(shouldEnqueueRenderJob.calls.length, 1);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
    assertEquals(infoSpy.calls.length >= 1, true);
    infoSpy.restore();
  },
);

Deno.test(
  "enqueueRenderJob: when shouldEnqueueRenderJob returns stage_not_found, returns EnqueueRenderJobErrorReturn",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "stage_not_found",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobEnqueueError, true);
      assertEquals(result.retriable, false);
    }
  },
);

Deno.test(
  "enqueueRenderJob: when shouldEnqueueRenderJob returns is_markdown, inserts RENDER job and returns success with inserted renderJobId",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-inserted-id" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, "render-inserted-id");
    }
  },
);

Deno.test(
  "enqueueRenderJob: RENDER insert includes idempotency_key, job_type RENDER, status pending, parent_job_id",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-shape-id" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    await enqueueRenderJob(deps, buildEnqueueRenderJobParams({ jobId: "parent-job-x" }), buildEnqueueRenderJobPayload());

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount >= 1, true);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    assertEquals(inserted["idempotency_key"], "parent-job-x_render");
    assertEquals(inserted["job_type"], "RENDER");
    assertEquals(inserted["status"], "pending");
    assertEquals(inserted["parent_job_id"], "parent-job-x");
  },
);

Deno.test(
  "enqueueRenderJob: duplicate idempotency_key 23505 recovers via select and returns success with recovered renderJobId",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const recovered = buildDialecticJobRow({
      id: "recovered-render-id",
      idempotency_key: "exec-job-1_render",
    });
    const duplicateError = {
      name: "PostgresError",
      message:
        'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key" (idempotency_key)',
      code: "23505",
      details: "",
      hint: "",
    };
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: async () => ({
          data: null,
          error: duplicateError,
        }),
        select: async (state: MockQueryBuilderState) => {
          const idem = state.filters.find((f) => f.column === "idempotency_key");
          if (idem && idem.value === "exec-job-1_render") {
            return { data: [recovered], error: null };
          }
          return { data: [], error: null };
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, "recovered-render-id");
    }
  },
);

Deno.test(
  "enqueueRenderJob: 23505 when recovery select fails returns EnqueueRenderJobErrorReturn with RenderJobEnqueueError",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const duplicateError = {
      name: "PostgresError",
      message:
        'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key" (idempotency_key)',
      code: "23505",
      details: "",
      hint: "",
    };
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: async () => ({
          data: null,
          error: duplicateError,
        }),
        select: async () => ({
          data: null,
          error: {
            name: "PostgresError",
            message: "recovery select failed",
            code: "PGRST116",
            details: "",
            hint: "",
          },
        }),
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobEnqueueError, true);
    }
  },
);

Deno.test(
  "enqueueRenderJob: DB insert programmer error (FK) returns EnqueueRenderJobErrorReturn with RenderJobEnqueueError",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const fkError = {
      name: "PostgresError",
      message: "insert or update on table violates foreign key constraint",
      code: "23503",
      details: "",
      hint: "",
    };
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: async () => ({
          data: null,
          error: fkError,
        }),
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobEnqueueError, true);
      assertEquals(result.retriable, false);
    }
  },
);

Deno.test(
  "enqueueRenderJob: DB insert transient error returns RenderJobEnqueueError with retriable true",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const transientErr = {
      name: "PostgresError",
      message: "connection reset by peer",
      code: "08006",
      details: "",
      hint: "",
    };
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: async () => ({
          data: null,
          error: transientErr,
        }),
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobEnqueueError, true);
      assertEquals(result.retriable, true);
    }
  },
);

Deno.test(
  "enqueueRenderJob: invalid documentKey returns EnqueueRenderJobErrorReturn with RenderJobValidationError",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ documentKey: undefined }),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobValidationError, true);
      assertEquals(result.retriable, false);
    }
  },
);

Deno.test(
  "enqueueRenderJob: invalid stageRelationshipForStage returns EnqueueRenderJobErrorReturn with RenderJobValidationError",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ stageRelationshipForStage: undefined }),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobValidationError, true);
      assertEquals(result.retriable, false);
    }
  },
);

Deno.test(
  "enqueueRenderJob: template_filename extraction uses dialectic_stage_recipe_steps when instance is_cloned",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-cloned" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(true),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename: (params, payload) =>
        resolveTemplateFilename({}, { dbClient: params.dbClient }, payload),
    });

    await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    const fromSpy = mockSetup.spies.fromSpy;
    const tableNames: string[] = fromSpy.calls.map((c) => String(c.args[0]));
    assertEquals(tableNames.includes("dialectic_stage_recipe_steps"), true);
    assertEquals(tableNames.includes("dialectic_recipe_template_steps"), false);
  },
);

Deno.test(
  "enqueueRenderJob: template_filename extraction uses dialectic_recipe_template_steps when instance is not cloned",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-template" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename: (params, payload) =>
        resolveTemplateFilename({}, { dbClient: params.dbClient }, payload),
    });

    await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    const fromSpy = mockSetup.spies.fromSpy;
    const tableNames: string[] = fromSpy.calls.map((c) => String(c.args[0]));
    assertEquals(tableNames.includes("dialectic_recipe_template_steps"), true);
    assertEquals(tableNames.includes("dialectic_stage_recipe_steps"), false);
  },
);

Deno.test(
  "enqueueRenderJob: a resolveTemplateFilename failure surfaces through enqueueRenderJob as the exact TemplateResolutionError object, untouched",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const stageNoActive = { ...mockStageRow, active_recipe_instance_id: null };
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_stages: { select: { data: [stageNoActive], error: null } },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename: (params, payload) =>
        resolveTemplateFilename({}, { dbClient: params.dbClient }, payload),
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload(),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof TemplateResolutionError, true);
      assertEquals(result.retriable, false);
      assert(
        result.error.message.includes(
          `Stage '${DialecticStageSlug.Thesis}' has no active recipe instance`,
        ),
      );
    }
  },
);

Deno.test(
  "enqueueRenderJob: RENDER payload includes template_filename from files_to_generate matching documentKey",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-payload-check" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload({ documentKey: FileType.business_case }));

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const payload = inserted["payload"];
    assert(isRecord(payload));
    assertEquals(payload["template_filename"], "thesis_business_case.md");
  },
);

/**
 * Asserts one insert into `dialectic_generation_jobs` with `job_type: RENDER`,
 * parent linked to the completed EXECUTE job, and renderer identity on the row payload
 * (no deprecated `step_info`).
 */
Deno.test(
  "schedules RENDER job with renderer identity payload",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({
      id: "render-job-456",
      idempotency_key: "job-id-123_render",
      parent_job_id: "job-id-123",
      session_id: "session-456",
      user_id: "user-789",
    });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const documentIdentityFromSavedContribution: string = "contrib-123";

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({
        jobId: "job-id-123",
        sessionId: "session-456",
        projectId: "project-abc",
        projectOwnerUserId: "user-789",
        userAuthToken: "jwt.token.here",
        modelId: "model-def",
        walletId: "wallet-ghi",
      }),
      buildEnqueueRenderJobPayload({
        contributionId: documentIdentityFromSavedContribution,
        stageRelationshipForStage: documentIdentityFromSavedContribution,
        documentKey: FileType.business_case,
        needsContinuation: false,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1, "Expected a single insert for the scheduled RENDER job");

    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));

    assertEquals(inserted["job_type"], "RENDER");
    assertEquals(inserted["parent_job_id"], "job-id-123", "Parent job id must point to completed EXECUTE job");

    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["projectId"], "project-abc");
    assertEquals(pl["sessionId"], "session-456");
    assertEquals(pl["iterationNumber"], 1);
    assertEquals(pl["stageSlug"], DialecticStageSlug.Thesis);
    assertEquals(pl["documentIdentity"], documentIdentityFromSavedContribution);
    assert(!("step_info" in pl), "Payload must not include deprecated step_info");
  },
);

Deno.test(
  "should not enqueue RENDER job for header_context output type",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "is_json",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({ outputType: FileType.HeaderContext }),
      buildEnqueueRenderJobPayload({ fileType: FileType.HeaderContext }),
    );

    assertEquals(shouldEnqueueRenderJob.calls.length, 1);
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0, "Target: non-markdown output type must not enqueue RENDER");
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);

Deno.test(
  "should enqueue RENDER job for markdown document output type (single complete chunk)",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({
      id: "render-job-123",
      idempotency_key: "job-id-123_render",
      parent_job_id: "job-id-123",
    });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const businessCaseProjectId: string = "project-abc";
    const businessCaseSessionId: string = "session-456";
    const documentIdentityFromSavedContribution: string = "contrib-123";

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({
        jobId: "job-id-123",
        sessionId: businessCaseSessionId,
        projectId: businessCaseProjectId,
        outputType: FileType.business_case,
      }),
      buildEnqueueRenderJobPayload({
        contributionId: documentIdentityFromSavedContribution,
        stageRelationshipForStage: documentIdentityFromSavedContribution,
        documentKey: FileType.business_case,
        fileType: FileType.business_case,
        needsContinuation: false,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(
      insertCalls.callCount,
      1,
      "Target: single complete chunk with markdown output must enqueue exactly one RENDER job",
    );
    assertEquals(insertCalls.callsArgs.length, 1);
    const firstInsertArgs: unknown[] = insertCalls.callsArgs[0];
    assertEquals(firstInsertArgs.length, 1);
    const inserted: unknown = firstInsertArgs[0];
    assert(isRecord(inserted));

    assertEquals(inserted["job_type"], "RENDER", "RENDER job must have job_type: RENDER");
    assertEquals(inserted["parent_job_id"], "job-id-123", "Parent job id must point to completed EXECUTE job");
    assertEquals(inserted["idempotency_key"], "job-id-123_render", "RENDER job insert must include idempotency_key derived as jobId_render");

    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["projectId"], businessCaseProjectId, "Payload must include projectId");
    assertEquals(pl["sessionId"], businessCaseSessionId, "Payload must include sessionId");
    assertEquals(pl["iterationNumber"], 1, "Payload must include iterationNumber");
    assertEquals(pl["stageSlug"], DialecticStageSlug.Thesis, "Payload must include stageSlug");
    assertEquals(
      pl["documentIdentity"],
      documentIdentityFromSavedContribution,
      "Payload must include documentIdentity derived from document_relationships[stageSlug] after initialization for root chunks",
    );
  },
);

Deno.test(
  "should NOT enqueue RENDER job for intermediate continuation chunk when needsContinuation is true",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ needsContinuation: true }),
    );

    assertEquals(shouldEnqueueRenderJob.calls.length, 0);
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);

Deno.test("intermediate continuation must not enqueue RENDER (Zone H)",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ needsContinuation: true }),
    );

    assertEquals(shouldEnqueueRenderJob.calls.length, 0);
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);

Deno.test("RENDER insert payload includes documentKey from payload.documentKey",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-doc-key" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ documentKey: FileType.business_case }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    const dk: unknown = pl["documentKey"];
    assert(isFileType(dk));
    assertEquals(dk, FileType.business_case);
  },
);

Deno.test("RENDER insert payload contains all required DialecticRenderJobPayload fields",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-all-fields" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const jobId: string = "job-all-fields";
    const projectId: string = "project-all";
    const sessionId: string = "session-all";
    const userJwt: string = "jwt-all-fields";
    const modelId: string = "model-all";
    const walletId: string = "wallet-all";
    const contributionId: string = "contrib-all";
    const stageRel: string = contributionId;

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({
        jobId,
        sessionId,
        projectId,
        userAuthToken: userJwt,
        modelId,
        walletId,
      }),
      buildEnqueueRenderJobPayload({
        contributionId,
        stageRelationshipForStage: stageRel,
        documentKey: FileType.business_case,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const plUnknown: unknown = inserted["payload"];
    assert(isRecord(plUnknown));

    const projectIdUnknown: unknown = plUnknown["projectId"];
    const sessionIdUnknown: unknown = plUnknown["sessionId"];
    const modelIdUnknown: unknown = plUnknown["model_id"];
    const walletIdUnknown: unknown = plUnknown["walletId"];
    const userJwtPl: unknown = plUnknown["user_jwt"];
    const stageSlugUnknown: unknown = plUnknown["stageSlug"];
    const iterationUnknown: unknown = plUnknown["iterationNumber"];
    const documentIdentityUnknown: unknown = plUnknown["documentIdentity"];
    const documentKeyUnknown: unknown = plUnknown["documentKey"];
    const sourceContributionIdUnknown: unknown = plUnknown["sourceContributionId"];
    const templateFilenameUnknown: unknown = plUnknown["template_filename"];
    const idempotencyUnknown: unknown = plUnknown["idempotencyKey"];

    assert(typeof projectIdUnknown === "string");
    assert(typeof sessionIdUnknown === "string");
    assert(typeof modelIdUnknown === "string");
    assert(typeof walletIdUnknown === "string");
    assert(typeof userJwtPl === "string");
    assert(typeof stageSlugUnknown === "string");
    assert(typeof iterationUnknown === "number");
    assert(typeof documentIdentityUnknown === "string");
    assert(isFileType(documentKeyUnknown));
    assert(typeof sourceContributionIdUnknown === "string");
    assert(typeof templateFilenameUnknown === "string");
    assert(typeof idempotencyUnknown === "string");

    assertEquals(projectIdUnknown, projectId);
    assertEquals(sessionIdUnknown, sessionId);
    assertEquals(modelIdUnknown, modelId);
    assertEquals(walletIdUnknown, walletId);
    assertEquals(userJwtPl, userJwt);
    assertEquals(stageSlugUnknown, DialecticStageSlug.Thesis);
    assertEquals(iterationUnknown, 1);
    assertEquals(documentIdentityUnknown, stageRel);
    assertEquals(documentKeyUnknown, FileType.business_case);
    assertEquals(sourceContributionIdUnknown, contributionId);
    assertEquals(templateFilenameUnknown, "thesis_business_case.md");
    assertEquals(idempotencyUnknown, `${jobId}_render`);
  },
);

Deno.test("sourceContributionId is actual contribution id, not semantic documentIdentity",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-source-id" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const actualContributionId: string = "contrib-actual-7";
    const semanticIdentity: string = "semantic-doc-999";

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({
        contributionId: actualContributionId,
        stageRelationshipForStage: semanticIdentity,
        documentKey: FileType.business_case,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["sourceContributionId"], actualContributionId);
    assertEquals(pl["documentIdentity"], semanticIdentity);
    assert(pl["sourceContributionId"] !== pl["documentIdentity"]);
  },
);

Deno.test("root and continuation final chunks each enqueue RENDER with distinct sourceContributionId",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-root-cont" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const rootContributionId: string = "contrib-root-123";
    const continuationContributionId: string = "contrib-continuation-456";
    const documentChainIdentity: string = rootContributionId;

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({ jobId: "exec-root-8" }),
      buildEnqueueRenderJobPayload({
        contributionId: rootContributionId,
        stageRelationshipForStage: rootContributionId,
        documentKey: FileType.business_case,
        needsContinuation: false,
      }),
    );

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({ jobId: "exec-cont-8" }),
      buildEnqueueRenderJobPayload({
        contributionId: continuationContributionId,
        stageRelationshipForStage: documentChainIdentity,
        documentKey: FileType.business_case,
        needsContinuation: false,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 2);

    const firstArg: unknown = insertCalls.callsArgs[0][0];
    const secondArg: unknown = insertCalls.callsArgs[1][0];
    let firstInserted: unknown = firstArg;
    let secondInserted: unknown = secondArg;
    if (Array.isArray(firstArg)) {
      firstInserted = firstArg[0];
    }
    if (Array.isArray(secondArg)) {
      secondInserted = secondArg[0];
    }
    assert(isRecord(firstInserted));
    assert(isRecord(secondInserted));
    const pl1: unknown = firstInserted["payload"];
    const pl2: unknown = secondInserted["payload"];
    assert(isRecord(pl1));
    assert(isRecord(pl2));

    assertEquals(pl1["sourceContributionId"], rootContributionId);
    assertEquals(pl1["documentIdentity"], rootContributionId);
    assertEquals(pl1["sourceContributionId"], pl1["documentIdentity"]);

    assertEquals(pl2["sourceContributionId"], continuationContributionId);
    assertEquals(pl2["documentIdentity"], documentChainIdentity);
    assert(pl2["sourceContributionId"] !== pl2["documentIdentity"]);

    assertEquals(pl1["documentIdentity"], pl2["documentIdentity"]);
    assert(pl1["sourceContributionId"] !== pl2["sourceContributionId"]);
  },
);

Deno.test("RENDER payload includes user_jwt and all renderer identity fields",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-jwt-9" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const testJwt: string = "test-jwt-token-12345";
    const paramsIn: EnqueueRenderJobParams = buildEnqueueRenderJobParams({
      projectId: "proj-9",
      sessionId: "sess-9",
      userAuthToken: testJwt,
      modelId: "model-9",
      walletId: "wallet-9",
    });
    const contribId: string = "contrib-9";

    await enqueueRenderJob(
      deps,
      paramsIn,
      buildEnqueueRenderJobPayload({
        contributionId: contribId,
        stageRelationshipForStage: contribId,
        documentKey: FileType.business_case,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["user_jwt"], testJwt);
    assertEquals(pl["projectId"], paramsIn.projectId);
    assertEquals(pl["sessionId"], paramsIn.sessionId);
    assertEquals(pl["model_id"], paramsIn.modelId);
    assertEquals(pl["walletId"], paramsIn.walletId);
    assertEquals(pl["iterationNumber"], paramsIn.iterationNumber);
    assertEquals(pl["stageSlug"], paramsIn.stageSlug);
    assertEquals(pl["documentIdentity"], contribId);
    assertEquals(pl["sourceContributionId"], contribId);
    assertEquals(pl["documentKey"], FileType.business_case);
    assertEquals(typeof pl["template_filename"], "string");
  },
);

Deno.test("empty userAuthToken fails DialecticRenderJobPayload validation",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    await assertRejects(
      () =>
        enqueueRenderJob(
          deps,
          buildEnqueueRenderJobParams({ userAuthToken: "" }),
          buildEnqueueRenderJobPayload(),
        ),
      Error,
    );
  },
);

Deno.test("user_jwt on RENDER payload matches params.userAuthToken exactly",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-jwt-11" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const specificToken: string = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.specific.token.value";

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({ userAuthToken: specificToken }),
      buildEnqueueRenderJobPayload(),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["user_jwt"], specificToken);
  },
);

Deno.test("documentIdentity matches stageRelationshipForStage for root-equivalent payload",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-12" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const rootId: string = "root-id-12";

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({
        contributionId: rootId,
        stageRelationshipForStage: rootId,
        documentKey: FileType.business_case,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["documentIdentity"], rootId);
    assertEquals(pl["sourceContributionId"], rootId);
  },
);

Deno.test("continuation chunk — documentIdentity is chain root, sourceContributionId is this chunk",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-13" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const rootContributionId: string = "root-id-13";
    const continuationContributionId: string = "continuation-id-13";

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({
        contributionId: continuationContributionId,
        stageRelationshipForStage: rootContributionId,
        documentKey: FileType.business_case,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["documentIdentity"], rootContributionId);
    assertEquals(pl["sourceContributionId"], continuationContributionId);
    assert(pl["documentIdentity"] !== pl["sourceContributionId"]);
  },
);

Deno.test("documentIdentity is caller-provided stageRelationshipForStage (single resolved value)",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-14" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const thesisIdentity: string = "thesis-correct-id";
    const wrongOtherStage: string = "wrong-antithesis-id";

    await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({ stageSlug: DialecticStageSlug.Thesis }),
      buildEnqueueRenderJobPayload({
        contributionId: thesisIdentity,
        stageRelationshipForStage: thesisIdentity,
        documentKey: FileType.business_case,
      }),
    );

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["documentIdentity"], thesisIdentity);
    assert(pl["documentIdentity"] !== wrongOtherStage);
  },
);

Deno.test("missing documentIdentity (stageRelationshipForStage) returns validation error",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ stageRelationshipForStage: undefined }),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobValidationError, true);
    }
  },
);

Deno.test("undefined documentKey returns validation error (no RENDER)",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload({ documentKey: undefined }),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobValidationError, true);
    }
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test("skips insert when shouldEnqueueRenderJob returns is_json",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "is_json",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals(shouldEnqueueRenderJob.calls.length, 1);
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);

Deno.test("shouldEnqueueRenderJob stage_not_found returns EnqueueRenderJobErrorReturn",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "stage_not_found",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobEnqueueError, true);
    }
  },
);

Deno.test("template_filename on insert payload comes from recipe step files_to_generate",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const customTemplateRow: Tables<"dialectic_recipe_template_steps"> = {
      ...mockTemplateStepRow(),
      outputs_required: {
        files_to_generate: [
          {
            from_document_key: "business_case",
            template_filename: "antithesis_business_case_critique.md",
          },
        ],
      },
    };
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_recipe_template_steps: {
        select: { data: [customTemplateRow], error: null },
      },
      dialectic_generation_jobs: {
        insert: { data: [buildDialecticJobRow({ id: "render-19" })], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename: (params, payload) =>
        resolveTemplateFilename({}, { dbClient: params.dbClient }, payload),
    });

    await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isRecord(pl));
    assertEquals(pl["template_filename"], "antithesis_business_case_critique.md");
  },
);

Deno.test("23505 on idempotency_key recovers existing render job id",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const recovered = buildDialecticJobRow({
      id: "recovered-render-20",
      idempotency_key: "exec-job-20_render",
    });
    const duplicateError = {
      name: "PostgresError",
      message:
        'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key" (idempotency_key)',
      code: "23505",
      details: "",
      hint: "",
    };
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: async () => ({
          data: null,
          error: duplicateError,
        }),
        select: async (state: MockQueryBuilderState) => {
          const idem = state.filters.find((f) => f.column === "idempotency_key");
          if (idem && idem.value === "exec-job-20_render") {
            return { data: [recovered], error: null };
          }
          return { data: [], error: null };
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams({ jobId: "exec-job-20" }),
      buildEnqueueRenderJobPayload(),
    );

    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, "recovered-render-20");
    }
  },
);

Deno.test(
  "RENDER job database insert failure returns RenderJobEnqueueError (e.g. RLS 42501)",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const rlsMessage: string =
      "RLS policy violation: User does not have permission to insert RENDER job";
    const rlsCode: string = "42501";
    const rlsError: Error = new Error(rlsMessage);
    rlsError.name = "PostgresError";
    Object.assign(rlsError, { code: rlsCode });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: null, error: rlsError },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result: EnqueueRenderJobReturn = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderJobPayload(),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobEnqueueError, true);
      const msg: string = result.error.message;
      assert(
        msg.includes("Failed to insert RENDER job due to database constraint violation"),
      );
      assert(msg.includes(rlsMessage));
      assert(msg.includes(rlsCode));
    }
  },
);

Deno.test(
  "shouldEnqueueRenderJob rejection propagates (e.g. database connection failure)",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => {
        throw new Error("Database connection failed: timeout after 30s");
      },
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    await assertRejects(
      async () => {
        await enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderJobPayload());
      },
      Error,
      "Database connection failed",
    );
  },
);

Deno.test(
  "COMPRESS-dispatch happy path: enqueues RENDER with source coordinates and DialecticRenderCompressedContextJobPayload",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const resolveTemplateFilename = spy(
      async () => ({ templateFilename: "thesis_business_case.md" }),
    );
    const insertedRow = buildDialecticJobRow({ id: "compress-render-1" });
    const mockSetup = setupMockClient({
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename,
    });
    const params = buildEnqueueRenderJobParams();
    const payload = buildEnqueueRenderCompressedContextPayload();

    const result = await enqueueRenderJob(deps, params, payload);

    assertEquals(shouldEnqueueRenderJob.calls.length, 1);
    const decisionArgs = shouldEnqueueRenderJob.calls[0].args as unknown[];
    assert(isRecord(decisionArgs[1]));
    assertEquals(decisionArgs[1]["outputType"], payload.docType);
    assertEquals(decisionArgs[1]["stageSlug"], payload.sourceStageSlug);

    assertEquals(resolveTemplateFilename.calls.length, 1);
    const templateArgs = resolveTemplateFilename.calls[0].args as unknown[];
    assert(isRecord(templateArgs[1]));
    assertEquals(templateArgs[1]["stageSlug"], payload.sourceStageSlug);
    assertEquals(templateArgs[1]["outputType"], payload.docType);
    assertEquals(templateArgs[1]["documentKey"], payload.documentKey);

    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    assertEquals(inserted["job_type"], "RENDER");
    assertEquals(inserted["parent_job_id"], params.jobId);
    assertEquals(inserted["stage_slug"], params.stageSlug);
    const expectedIdempotencyKey = `${params.sessionId}_${params.iterationNumber}_${params.stageSlug}_compress_render_${payload.sourceType}_${payload.documentKey}_${payload.targetKey}`;
    assertEquals(inserted["idempotency_key"], expectedIdempotencyKey);

    const pl: unknown = inserted["payload"];
    assert(isDialecticRenderCompressedContextJobPayload(pl));
    assertEquals(pl.template_filename, "thesis_business_case.md");
    assertEquals(pl.stageSlug, params.stageSlug);

    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, "compress-render-1");
    }
  },
);

Deno.test(
  "COMPRESS-dispatch: not renderable (is_json) returns renderJobId null, insert never called",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "is_json",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderCompressedContextPayload(),
    );

    assertEquals(shouldEnqueueRenderJob.calls.length, 1);
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);

Deno.test(
  "COMPRESS-dispatch: decision-query failure returns RenderJobEnqueueError, retriable false, insert never called",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "stage_not_found",
      }),
    );
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderCompressedContextPayload(),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof RenderJobEnqueueError, true);
      assertEquals(result.retriable, false);
    }
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test(
  "COMPRESS-dispatch: template failure returns the exact TemplateResolutionError object, insert never called",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const templateError = new TemplateResolutionError(
      "Failed to query stage for template_filename extraction: stage not found",
    );
    const resolveTemplateFilename = spy(async () => ({
      error: templateError,
      retriable: false,
    }));
    const mockSetup = setupMockClient({});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename,
    });

    const result = await enqueueRenderJob(
      deps,
      buildEnqueueRenderJobParams(),
      buildEnqueueRenderCompressedContextPayload(),
    );

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error instanceof TemplateResolutionError, true);
      assertEquals(result.error, templateError);
      assertEquals(result.error.message, templateError.message);
    }
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 0);
  },
);

Deno.test(
  "COMPRESS-dispatch: idempotent re-dispatch recovers via source-identity key, not jobId_render",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const params = buildEnqueueRenderJobParams();
    const payload = buildEnqueueRenderCompressedContextPayload();
    const expectedIdempotencyKey = `${params.sessionId}_${params.iterationNumber}_${params.stageSlug}_compress_render_${payload.sourceType}_${payload.documentKey}_${payload.targetKey}`;
    const recovered = buildDialecticJobRow({
      id: "recovered-compress-render",
      idempotency_key: expectedIdempotencyKey,
    });
    const duplicateError = {
      name: "PostgresError",
      message:
        'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key" (idempotency_key)',
      code: "23505",
      details: "",
      hint: "",
    };
    const mockSetup = setupMockClient({
      dialectic_generation_jobs: {
        insert: async () => ({
          data: null,
          error: duplicateError,
        }),
        select: async (state: MockQueryBuilderState) => {
          const idem = state.filters.find((f) => f.column === "idempotency_key");
          if (idem && idem.value === expectedIdempotencyKey) {
            return { data: [recovered], error: null };
          }
          return { data: [], error: null };
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
    });

    const result = await enqueueRenderJob(deps, params, payload);

    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, "recovered-compress-render");
    }
  },
);

Deno.test(
  "COMPRESS-dispatch: discrimination — EnqueueRenderJobPayload drives EXECUTE branch, compressed payload never reads needsContinuation/contributionId",
  async () => {
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const resolveTemplateFilename = spy(
      async () => ({ templateFilename: "thesis_business_case.md" }),
    );
    const insertedRow = buildDialecticJobRow({ id: "render-discrimination" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename,
    });
    const params = buildEnqueueRenderJobParams();

    await enqueueRenderJob(deps, params, buildEnqueueRenderJobPayload());

    assertEquals(shouldEnqueueRenderJob.calls.length, 1);
    const execArgs = shouldEnqueueRenderJob.calls[0].args as unknown[];
    assert(isRecord(execArgs[1]));
    assertEquals(execArgs[1]["outputType"], params.outputType);
    assertEquals(execArgs[1]["stageSlug"], params.stageSlug);

    shouldEnqueueRenderJob.calls.length = 0;
    resolveTemplateFilename.calls.length = 0;

    const compressPayload = buildEnqueueRenderCompressedContextPayload({
      sourceStageSlug: DialecticStageSlug.Antithesis,
    });
    await enqueueRenderJob(deps, params, compressPayload);

    assertEquals(shouldEnqueueRenderJob.calls.length, 1);
    const compressArgs = shouldEnqueueRenderJob.calls[0].args as unknown[];
    assert(isRecord(compressArgs[1]));
    assertEquals(compressArgs[1]["outputType"], compressPayload.docType);
    assertEquals(compressArgs[1]["stageSlug"], compressPayload.sourceStageSlug);
    assert(compressArgs[1]["stageSlug"] !== params.stageSlug);
  },
);

/**
 * Contract: given a COMPRESS-dispatch call, the inserted DialecticRenderCompressedContextJobPayload
 *   carries user_jwt from params.userAuthToken, model_id from params.modelId and walletId from
 *   params.walletId — the members that moved from local declaration to inheritance and must still
 *   be written.
 * Arrange: params with specific userAuthToken, modelId and walletId; a built compressed context
 *   payload; a mock client that accepts the insert.
 * Act:     enqueueRenderJob with the compressed branch.
 * Assert:  the inserted payload's user_jwt equals params.userAuthToken, model_id equals
 *   params.modelId, and walletId equals params.walletId.
 */
Deno.test(
  "COMPRESS-dispatch: inserted payload carries user_jwt, model_id and walletId from params (inherited members still written)",
  async () => {
    // Arrange
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const resolveTemplateFilename = spy(
      async () => ({ templateFilename: "thesis_business_case.md" }),
    );
    const insertedRow = buildDialecticJobRow({ id: "compress-inherited-1" });
    const mockSetup = setupMockClient({
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps = buildEnqueueRenderJobDeps({
      dbClient,
      shouldEnqueueRenderJob,
      resolveTemplateFilename,
    });
    const params = buildEnqueueRenderJobParams({
      userAuthToken: "specific-jwt-token",
      modelId: "specific-model-id",
      walletId: "specific-wallet-id",
    });
    const payload = buildEnqueueRenderCompressedContextPayload();

    // Act
    await enqueueRenderJob(deps, params, payload);

    // Assert
    const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCalls);
    assertEquals(insertCalls.callCount, 1);
    const insertedArg = insertCalls.callsArgs[0][0];
    let inserted: unknown = insertedArg;
    if (Array.isArray(insertedArg)) {
      inserted = insertedArg[0];
    }
    assert(isRecord(inserted));
    const pl: unknown = inserted["payload"];
    assert(isDialecticRenderCompressedContextJobPayload(pl));
    assertEquals(pl.user_jwt, params.userAuthToken);
    assertEquals(pl.model_id, params.modelId);
    assertEquals(pl.walletId, params.walletId);
  },
);

/**
 * Contract: given a RENDER insert on either branch, the inserted row's idempotency_key equals
 *   the inserted payload's own idempotencyKey, pinning that per-branch row construction did not
 *   drift.
 * Arrange: params, a contribution payload and a compressed context payload; a mock client per
 *   branch that accepts the insert.
 * Act:     enqueueRenderJob once per branch.
 * Assert:  on each branch, the inserted row's idempotency_key equals the inserted payload's
 *   idempotencyKey.
 */
Deno.test(
  "enqueueRenderJob: inserted row idempotency_key equals the payload's own idempotencyKey on both branches",
  async () => {
    // Arrange — contribution branch
    const shouldEnqueueRenderJob = spy(
      async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: true,
        reason: "is_markdown",
      }),
    );
    const resolveTemplateFilename = spy(
      async () => ({ templateFilename: "thesis_business_case.md" }),
    );
    const insertedRowContrib = buildDialecticJobRow({ id: "contrib-idem-check" });
    const mockSetupContrib = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRowContrib], error: null },
      },
    });
    const dbClientContrib: SupabaseClient<Database> = mockSetupContrib.client as unknown as SupabaseClient<Database>;
    const depsContrib = buildEnqueueRenderJobDeps({
      dbClient: dbClientContrib,
      shouldEnqueueRenderJob,
      resolveTemplateFilename,
    });
    const params = buildEnqueueRenderJobParams();

    // Act — contribution branch
    await enqueueRenderJob(depsContrib, params, buildEnqueueRenderJobPayload());

    // Assert — contribution branch
    const insertCallsContrib = mockSetupContrib.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCallsContrib);
    assertEquals(insertCallsContrib.callCount, 1);
    let insertedContrib: unknown = insertCallsContrib.callsArgs[0][0];
    if (Array.isArray(insertedContrib)) {
      insertedContrib = insertedContrib[0];
    }
    assert(isRecord(insertedContrib));
    const plContrib: unknown = insertedContrib["payload"];
    assert(isRecord(plContrib));
    assertEquals(insertedContrib["idempotency_key"], plContrib["idempotencyKey"]);

    // Arrange — compressed branch
    const insertedRowCompress = buildDialecticJobRow({ id: "compress-idem-check" });
    const mockSetupCompress = setupMockClient({
      dialectic_generation_jobs: {
        insert: { data: [insertedRowCompress], error: null },
      },
    });
    const dbClientCompress: SupabaseClient<Database> = mockSetupCompress.client as unknown as SupabaseClient<Database>;
    const depsCompress = buildEnqueueRenderJobDeps({
      dbClient: dbClientCompress,
      shouldEnqueueRenderJob,
      resolveTemplateFilename,
    });

    // Act — compressed branch
    await enqueueRenderJob(depsCompress, params, buildEnqueueRenderCompressedContextPayload());

    // Assert — compressed branch
    const insertCallsCompress = mockSetupCompress.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
    assertExists(insertCallsCompress);
    assertEquals(insertCallsCompress.callCount, 1);
    let insertedCompress: unknown = insertCallsCompress.callsArgs[0][0];
    if (Array.isArray(insertedCompress)) {
      insertedCompress = insertedCompress[0];
    }
    assert(isRecord(insertedCompress));
    const plCompress: unknown = insertedCompress["payload"];
    assert(isDialecticRenderCompressedContextJobPayload(plCompress));
    assertEquals(insertedCompress["idempotency_key"], plCompress["idempotencyKey"]);
  },
);
