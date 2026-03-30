// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.test.ts

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json, Tables } from "../../types_db.ts";
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
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
  EnqueueRenderJobDeps,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobReturn,
} from "./enqueueRenderJob.interface.ts";
import { enqueueRenderJob } from "./enqueueRenderJob.ts";
import { isFileType } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";

function setupMockClient(
  configOverrides: NonNullable<MockSupabaseDataConfig["genericMockResults"]> = {},
): ReturnType<typeof createMockSupabaseClient> {
  return createMockSupabaseClient("user-789", {
    genericMockResults: {
      ...configOverrides,
    },
  });
}

function baseParams(overrides: Partial<EnqueueRenderJobParams> = {}): EnqueueRenderJobParams {
  const defaults: EnqueueRenderJobParams = {
    jobId: "exec-job-1",
    sessionId: "session-1",
    stageSlug: DialecticStageSlug.Thesis,
    iterationNumber: 1,
    outputType: FileType.business_case,
    projectId: "project-1",
    projectOwnerUserId: "owner-1",
    userAuthToken: "jwt-token",
    modelId: "model-1",
    walletId: "wallet-1",
    isTestJob: false,
  };
  return { ...defaults, ...overrides };
}

function basePayload(overrides: Partial<EnqueueRenderJobPayload> = {}): EnqueueRenderJobPayload {
  const defaults: EnqueueRenderJobPayload = {
    contributionId: "contrib-1",
    needsContinuation: false,
    documentKey: FileType.business_case,
    stageRelationshipForStage: "doc-identity-1",
    fileType: FileType.business_case,
    storageFileType: FileType.ModelContributionRawJson,
  };
  return { ...defaults, ...overrides };
}

const mockStageRow: Tables<"dialectic_stages"> = {
  id: "stage-1",
  slug: DialecticStageSlug.Thesis,
  display_name: "Thesis",
  description: null,
  default_system_prompt_id: null,
  recipe_template_id: "template-1",
  active_recipe_instance_id: "instance-1",
  expected_output_template_ids: [],
  created_at: new Date().toISOString(),
  minimum_balance: 0,
};

function mockInstanceRow(isCloned: boolean): Tables<"dialectic_stage_recipe_instances"> {
  return {
    id: "instance-1",
    stage_id: "stage-1",
    template_id: "template-1",
    is_cloned: isCloned,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mockTemplateStepRow(): Tables<"dialectic_recipe_template_steps"> {
  return {
    id: "step-1",
    template_id: "template-1",
    step_number: 1,
    step_key: "execute_business_case",
    step_slug: "execute-business-case",
    step_name: "Execute Business Case",
    step_description: null,
    job_type: "EXECUTE",
    prompt_type: "Turn",
    prompt_template_id: null,
    output_type: "business_case",
    granularity_strategy: "per_source_document",
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {
      files_to_generate: [
        {
          from_document_key: "business_case",
          template_filename: "thesis_business_case.md",
        },
      ],
    },
    parallel_group: null,
    branch_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mockClonedStepRow(): Tables<"dialectic_stage_recipe_steps"> {
  const t = mockTemplateStepRow();
  const cloned: Tables<"dialectic_stage_recipe_steps"> = {
    id: "cloned-step-1",
    instance_id: "instance-1",
    branch_key: t.branch_key,
    config_override: {},
    created_at: t.created_at,
    execution_order: 1,
    granularity_strategy: t.granularity_strategy,
    inputs_relevance: t.inputs_relevance,
    inputs_required: t.inputs_required,
    is_skipped: false,
    job_type: t.job_type,
    object_filter: {},
    output_overrides: {},
    output_type: t.output_type,
    outputs_required: t.outputs_required,
    parallel_group: t.parallel_group,
    prompt_template_id: t.prompt_template_id,
    prompt_type: t.prompt_type,
    step_description: t.step_description,
    step_key: t.step_key,
    step_name: t.step_name,
    step_slug: t.step_slug,
    template_step_id: null,
    updated_at: t.updated_at,
  };
  return cloned;
}

function mockRenderJobRow(overrides: Partial<Tables<"dialectic_generation_jobs">> = {}): Tables<"dialectic_generation_jobs"> {
  const base: Tables<"dialectic_generation_jobs"> = {
    id: "render-job-new",
    idempotency_key: "exec-job-1_render",
    job_type: "RENDER",
    status: "pending",
    session_id: "session-1",
    stage_slug: DialecticStageSlug.Thesis,
    iteration_number: 1,
    parent_job_id: "exec-job-1",
    payload: {},
    is_test_job: false,
    user_id: "owner-1",
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    attempt_count: 0,
    max_retries: 3,
    prerequisite_job_id: null,
    target_contribution_id: null,
    error_details: null,
  };
  return { ...base, ...overrides };
}

function recipeChainConfig(
  isCloned: boolean,
): NonNullable<MockSupabaseDataConfig["genericMockResults"]> {
  const instance: Tables<"dialectic_stage_recipe_instances"> = mockInstanceRow(isCloned);
  const templateSteps = { select: { data: [mockTemplateStepRow()], error: null as Error | null } };
  const clonedSteps = { select: { data: [mockClonedStepRow()], error: null as Error | null } };
  const base: NonNullable<MockSupabaseDataConfig["genericMockResults"]> = {
    dialectic_stages: { select: { data: [mockStageRow], error: null } },
    dialectic_stage_recipe_instances: { select: { data: [instance], error: null } },
  };
  if (isCloned) {
    base.dialectic_stage_recipe_steps = clonedSteps;
  } else {
    base.dialectic_recipe_template_steps = templateSteps;
  }
  return base;
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
    const mockLogger = new MockLogger();
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: mockLogger,
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ needsContinuation: true }),
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: mockLogger,
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const insertedRow = mockRenderJobRow({ id: "render-inserted-id" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const insertedRow = mockRenderJobRow({ id: "render-shape-id" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await enqueueRenderJob(deps, baseParams({ jobId: "parent-job-x" }), basePayload());

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
    const recovered = mockRenderJobRow({
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ documentKey: undefined }),
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ stageRelationshipForStage: undefined }),
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
    const insertedRow = mockRenderJobRow({ id: "render-cloned" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(true),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const insertedRow = mockRenderJobRow({ id: "render-template" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await enqueueRenderJob(deps, baseParams(), basePayload());

    const fromSpy = mockSetup.spies.fromSpy;
    const tableNames: string[] = fromSpy.calls.map((c) => String(c.args[0]));
    assertEquals(tableNames.includes("dialectic_recipe_template_steps"), true);
    assertEquals(tableNames.includes("dialectic_stage_recipe_steps"), false);
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
    const insertedRow = mockRenderJobRow({ id: "render-payload-check" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await enqueueRenderJob(deps, baseParams(), basePayload({ documentKey: FileType.business_case }));

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
    const insertedRow = mockRenderJobRow({
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const documentIdentityFromSavedContribution: string = "contrib-123";

    await enqueueRenderJob(
      deps,
      baseParams({
        jobId: "job-id-123",
        sessionId: "session-456",
        projectId: "project-abc",
        projectOwnerUserId: "user-789",
        userAuthToken: "jwt.token.here",
        modelId: "model-def",
        walletId: "wallet-ghi",
      }),
      basePayload({
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams({ outputType: FileType.HeaderContext }),
      basePayload({ fileType: FileType.HeaderContext }),
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
    const insertedRow = mockRenderJobRow({
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const businessCaseProjectId: string = "project-abc";
    const businessCaseSessionId: string = "session-456";
    const documentIdentityFromSavedContribution: string = "contrib-123";

    await enqueueRenderJob(
      deps,
      baseParams({
        jobId: "job-id-123",
        sessionId: businessCaseSessionId,
        projectId: businessCaseProjectId,
        outputType: FileType.business_case,
      }),
      basePayload({
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
    const mockLogger = new MockLogger();
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: mockLogger,
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ needsContinuation: true }),
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ needsContinuation: true }),
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
    const insertedRow = mockRenderJobRow({ id: "render-doc-key" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ documentKey: FileType.business_case }),
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
    const insertedRow = mockRenderJobRow({ id: "render-all-fields" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

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
      baseParams({
        jobId,
        sessionId,
        projectId,
        userAuthToken: userJwt,
        modelId,
        walletId,
      }),
      basePayload({
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
    const insertedRow = mockRenderJobRow({ id: "render-source-id" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const actualContributionId: string = "contrib-actual-7";
    const semanticIdentity: string = "semantic-doc-999";

    await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({
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
    const insertedRow = mockRenderJobRow({ id: "render-root-cont" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const rootContributionId: string = "contrib-root-123";
    const continuationContributionId: string = "contrib-continuation-456";
    const documentChainIdentity: string = rootContributionId;

    await enqueueRenderJob(
      deps,
      baseParams({ jobId: "exec-root-8" }),
      basePayload({
        contributionId: rootContributionId,
        stageRelationshipForStage: rootContributionId,
        documentKey: FileType.business_case,
        needsContinuation: false,
      }),
    );

    await enqueueRenderJob(
      deps,
      baseParams({ jobId: "exec-cont-8" }),
      basePayload({
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
    const insertedRow = mockRenderJobRow({ id: "render-jwt-9" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const testJwt: string = "test-jwt-token-12345";
    const paramsIn: EnqueueRenderJobParams = baseParams({
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
      basePayload({
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await assertRejects(
      () =>
        enqueueRenderJob(
          deps,
          baseParams({ userAuthToken: "" }),
          basePayload(),
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
    const insertedRow = mockRenderJobRow({ id: "render-jwt-11" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const specificToken: string = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.specific.token.value";

    await enqueueRenderJob(
      deps,
      baseParams({ userAuthToken: specificToken }),
      basePayload(),
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
    const insertedRow = mockRenderJobRow({ id: "render-12" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const rootId: string = "root-id-12";

    await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({
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
    const insertedRow = mockRenderJobRow({ id: "render-13" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const rootContributionId: string = "root-id-13";
    const continuationContributionId: string = "continuation-id-13";

    await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({
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
    const insertedRow = mockRenderJobRow({ id: "render-14" });
    const mockSetup = setupMockClient({
      ...recipeChainConfig(false),
      dialectic_generation_jobs: {
        insert: { data: [insertedRow], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const thesisIdentity: string = "thesis-correct-id";
    const wrongOtherStage: string = "wrong-antithesis-id";

    await enqueueRenderJob(
      deps,
      baseParams({ stageSlug: DialecticStageSlug.Thesis }),
      basePayload({
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ stageRelationshipForStage: undefined }),
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload({ documentKey: undefined }),
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(deps, baseParams(), basePayload());

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
        insert: { data: [mockRenderJobRow({ id: "render-19" })], error: null },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await enqueueRenderJob(deps, baseParams(), basePayload());

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
    const recovered = mockRenderJobRow({
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result = await enqueueRenderJob(
      deps,
      baseParams({ jobId: "exec-job-20" }),
      basePayload(),
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    const result: EnqueueRenderJobReturn = await enqueueRenderJob(
      deps,
      baseParams(),
      basePayload(),
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
    const deps: EnqueueRenderJobDeps = {
      dbClient,
      logger: new MockLogger(),
      shouldEnqueueRenderJob,
    };

    await assertRejects(
      async () => {
        await enqueueRenderJob(deps, baseParams(), basePayload());
      },
      Error,
      "Database connection failed",
    );
  },
);
