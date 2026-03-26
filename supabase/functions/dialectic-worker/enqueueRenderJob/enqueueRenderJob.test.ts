// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.test.ts

import {
  assert,
  assertEquals,
  assertExists,
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
} from "./enqueueRenderJob.interface.ts";
import { enqueueRenderJob } from "./enqueueRenderJob.ts";

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
  const emptyJson: Json = {};
  const cloned: Tables<"dialectic_stage_recipe_steps"> = {
    id: "cloned-step-1",
    instance_id: "instance-1",
    branch_key: t.branch_key,
    config_override: emptyJson,
    created_at: t.created_at,
    execution_order: 1,
    granularity_strategy: t.granularity_strategy,
    inputs_relevance: t.inputs_relevance,
    inputs_required: t.inputs_required,
    is_skipped: false,
    job_type: t.job_type,
    object_filter: emptyJson,
    output_overrides: emptyJson,
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
    const inserted = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
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
    const inserted = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(inserted));
    const payload = inserted["payload"];
    assert(isRecord(payload));
    assertEquals(payload["template_filename"], "thesis_business_case.md");
  },
);
