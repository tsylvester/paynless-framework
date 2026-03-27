import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { ILogger } from "../../_shared/types.ts";
import type { IEmbeddingClient } from "../../_shared/services/indexing_service.interface.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { createMockTokenWalletService } from "../../_shared/services/tokenWalletService.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { applyInputsRequiredScope } from "../../_shared/utils/applyInputsRequiredScope.ts";
import { pickLatest } from "../../_shared/utils/pickLatest.ts";
import { validateWalletBalance } from "../../_shared/utils/validateWalletBalance.ts";
import { validateModelCostRates } from "../../_shared/utils/validateModelCostRates.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
  InputRule,
  PromptConstructionPayload,
  RelevanceRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  BoundExecuteModelCallAndSaveFn,
} from "../executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";
import {
  isPrepareModelJobDeps,
  isPrepareModelJobErrorReturn,
  isPrepareModelJobParams,
  isPrepareModelJobPayload,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.guard.ts";

function buildExecuteJobPayload(): DialecticExecuteJobPayload {
  return {
    prompt_template_id: "contract-pt",
    inputs: {},
    output_type: FileType.HeaderContext,
    document_key: "header_context",
    projectId: "project-contract",
    sessionId: "session-contract",
    stageSlug: "thesis",
    model_id: "model-contract",
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: "wallet-contract",
    user_jwt: "jwt.contract",
    canonicalPathParams: {
      contributionType: "thesis",
      stageSlug: "thesis",
    },
    idempotencyKey: "contract-idem",
  };
}

function buildDialecticJobRow(payload: DialecticExecuteJobPayload): DialecticJobRow {
  if (!isJson(payload)) {
    throw new Error("Contract test payload must be Json-compatible");
  }
  const base: Tables<"dialectic_generation_jobs"> = {
    id: "job-contract-1",
    session_id: "session-contract",
    stage_slug: "thesis",
    iteration_number: 1,
    status: "pending",
    user_id: "user-contract",
    attempt_count: 0,
    completed_at: null,
    created_at: new Date().toISOString(),
    error_details: null,
    max_retries: 3,
    parent_job_id: null,
    payload,
    prerequisite_job_id: null,
    results: null,
    started_at: null,
    target_contribution_id: null,
    is_test_job: false,
    job_type: "EXECUTE",
    idempotency_key: null,
  };
  return base;
}

function buildDialecticSessionRow(): DialecticSessionRow {
  return {
    id: "session-contract",
    project_id: "project-contract",
    session_description: "contract session",
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_ids: ["model-contract"],
    status: "in-progress",
    associated_chat_id: null,
    current_stage_id: "stage-contract-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    viewing_stage_id: null,
    idempotency_key: "session-contract-idem",
  };
}

function buildAiProvidersRow(): Tables<"ai_providers"> {
  return {
    id: "model-contract",
    provider: "contract-provider",
    name: "Contract AI",
    api_identifier: "contract-api-v1",
    config: {
      tokenization_strategy: { type: "rough_char_count" },
      context_window_tokens: 10000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      provider_max_input_tokens: 100,
      provider_max_output_tokens: 50,
      api_identifier: "contract-api-v1",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: null,
    is_active: true,
    is_default_embedding: false,
    is_default_generation: false,
    is_enabled: true,
  };
}

function buildDialecticContributionRow(): DialecticContributionRow {
  return {
    id: "contrib-contract-1",
    session_id: "session-contract",
    stage: "thesis",
    iteration_number: 1,
    model_id: "model-contract",
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: "model_contribution_main",
    created_at: new Date().toISOString(),
    error: null,
    file_name: "contract.txt",
    mime_type: "text/plain",
    model_name: "Contract AI",
    original_model_contribution_id: null,
    processing_time_ms: 10,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 10,
    storage_bucket: "contract-bucket",
    storage_path: "contract/path",
    target_contribution_id: null,
    tokens_used_input: 1,
    tokens_used_output: 2,
    updated_at: new Date().toISOString(),
    user_id: "user-contract",
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
  };
}

function buildPromptConstructionPayload(): PromptConstructionPayload {
  return {
    conversationHistory: [],
    resourceDocuments: [],
    currentUserPrompt: "contract user prompt",
    source_prompt_resource_id: "source-prompt-resource-id",
  };
}

const contractCompressionStrategy: ICompressionStrategy = async () => [];

function buildBoundExecuteModelCallAndSaveStub(): BoundExecuteModelCallAndSaveFn {
  return async () => ({
    contribution: buildDialecticContributionRow(),
    needsContinuation: false,
    stageRelationshipForStage: undefined,
    documentKey: undefined,
    fileType: FileType.HeaderContext,
    storageFileType: FileType.ModelContributionRawJson,
  });
}

function buildBoundEnqueueRenderJobStub(): BoundEnqueueRenderJobFn {
  return async () => ({ renderJobId: null });
}

function buildPrepareModelJobDepsContract(): PrepareModelJobDeps {
  const logger: ILogger = new MockLogger();
  const mockDownloadFn = createMockDownloadFromStorage({
    mode: "success",
    data: new ArrayBuffer(0),
  });
  const ragService = new MockRagService();
  const tokenWalletService = createMockTokenWalletService().instance;
  const embeddingClient: IEmbeddingClient = {
    getEmbedding: async () => ({
      embedding: [],
      usage: { prompt_tokens: 0, total_tokens: 0 },
    }),
  };
  return {
    logger,
    pickLatest,
    downloadFromStorage: mockDownloadFn,
    applyInputsRequiredScope,
    countTokens: () => 0,
    tokenWalletService,
    validateWalletBalance,
    validateModelCostRates,
    ragService,
    embeddingClient,
    executeModelCallAndSave: buildBoundExecuteModelCallAndSaveStub(),
    enqueueRenderJob: buildBoundEnqueueRenderJobStub(),
  };
}

Deno.test(
  "`PrepareModelJobDeps` interface accepts all twelve dependency fields with correct shapes",
  () => {
    const deps: PrepareModelJobDeps = buildPrepareModelJobDepsContract();

    assertEquals(typeof deps.logger, "object");
    assertEquals(typeof deps.logger.info, "function");
    assertEquals(typeof deps.pickLatest, "function");
    assertEquals(typeof deps.downloadFromStorage, "function");
    assertEquals(typeof deps.applyInputsRequiredScope, "function");
    assertEquals(typeof deps.countTokens, "function");
    assertEquals(typeof deps.tokenWalletService, "object");
    assertEquals(typeof deps.validateWalletBalance, "function");
    assertEquals(typeof deps.validateModelCostRates, "function");
    assertEquals(typeof deps.ragService, "object");
    assertEquals(typeof deps.embeddingClient.getEmbedding, "function");
    assertEquals(typeof deps.executeModelCallAndSave, "function");
    assertEquals(typeof deps.enqueueRenderJob, "function");
  },
);

Deno.test(
  "`PrepareModelJobParams` interface accepts a valid params object with all job context fields",
  async (t) => {
    await t.step("all keys present with typed values", () => {
      const mockSetup = createMockSupabaseClient(undefined, {});
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
      const job: DialecticJobRow = buildDialecticJobRow(executePayload);

      const params: PrepareModelJobParams = {
        dbClient,
        authToken: "token-contract",
        job,
        projectOwnerUserId: "owner-contract",
        providerRow: buildAiProvidersRow(),
        sessionData: buildDialecticSessionRow(),
      };

      assertEquals("dbClient" in params, true);
      assertEquals("authToken" in params, true);
      assertEquals("job" in params, true);
      assertEquals("projectOwnerUserId" in params, true);
      assertEquals("providerRow" in params, true);
      assertEquals("sessionData" in params, true);
      assertEquals(typeof params.dbClient.from, "function");
      assertEquals(typeof params.authToken, "string");
      assertEquals(params.job.id, job.id);
      assertEquals(params.projectOwnerUserId, "owner-contract");
      assertEquals(params.providerRow.id, "model-contract");
      assertEquals(params.sessionData.id, "session-contract");
    });
  },
);

Deno.test(
  "`PrepareModelJobPayload` interface accepts a valid payload object with `promptConstructionPayload`, `compressionStrategy`, optional `inputsRelevance`, optional `inputsRequired`",
  async (t) => {
    await t.step("minimal payload without optional arrays", () => {
      const payload: PrepareModelJobPayload = {
        promptConstructionPayload: buildPromptConstructionPayload(),
        compressionStrategy: contractCompressionStrategy,
      };

      assertEquals("promptConstructionPayload" in payload, true);
      assertEquals("compressionStrategy" in payload, true);
      assertEquals("inputsRelevance" in payload, false);
      assertEquals("inputsRequired" in payload, false);
    });

    await t.step("payload with inputsRelevance and inputsRequired", () => {
      const inputsRelevance: RelevanceRule[] = [
        { document_key: FileType.HeaderContext, relevance: 0.5 },
      ];
      const inputsRequired: InputRule[] = [
        { type: "document", slug: "thesis", required: true },
      ];

      const payload: PrepareModelJobPayload = {
        promptConstructionPayload: buildPromptConstructionPayload(),
        compressionStrategy: contractCompressionStrategy,
        inputsRelevance,
        inputsRequired,
      };

      assertEquals(payload.inputsRelevance?.length, 1);
      assertEquals(payload.inputsRequired?.length, 1);
    });
  },
);

Deno.test(
  "`PrepareModelJobSuccessReturn` interface accepts a valid success return object",
  () => {
    const withId: PrepareModelJobSuccessReturn = {
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      renderJobId: "render-job-1",
    };
    const skipped: PrepareModelJobSuccessReturn = {
      contribution: buildDialecticContributionRow(),
      needsContinuation: true,
      renderJobId: null,
    };

    assertEquals(withId.renderJobId, "render-job-1");
    assertEquals(skipped.renderJobId, null);
    assertEquals("renderJobId" in withId, true);
    assertEquals("renderJobId" in skipped, true);
  },
);

Deno.test(
  "`PrepareModelJobErrorReturn` interface accepts a valid error return object",
  () => {
    const notRetriable: PrepareModelJobErrorReturn = {
      error: new Error("prepare contract failure"),
      retriable: false,
    };
    const retriable: PrepareModelJobErrorReturn = {
      error: new Error("transient failure"),
      retriable: true,
    };

    assertEquals(notRetriable.error instanceof Error, true);
    assertEquals(notRetriable.retriable, false);
    assertEquals(retriable.retriable, true);
    assertEquals("error" in notRetriable, true);
    assertEquals("retriable" in notRetriable, true);
    assertEquals("error" in retriable, true);
    assertEquals("retriable" in retriable, true);
  },
);

Deno.test(
  "Contract: PrepareModelJobReturn is PrepareModelJobSuccessReturn or PrepareModelJobErrorReturn",
  () => {
    const success: PrepareModelJobReturn = {
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      renderJobId: "job-1",
    };
    const failure: PrepareModelJobReturn = {
      error: new Error("failure"),
      retriable: false,
    };

    assertEquals("renderJobId" in success, true);
    assertEquals("error" in failure, true);
    assertEquals("contribution" in success, true);
    assertEquals("retriable" in failure, true);
  },
);

Deno.test(
  "Contract: PrepareModelJobFn matches (deps, params, payload) => Promise<PrepareModelJobReturn>",
  async () => {
    const mockSetup = createMockSupabaseClient(undefined, {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);

    const deps: PrepareModelJobDeps = buildPrepareModelJobDepsContract();

    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "token-fn",
      job,
      projectOwnerUserId: "owner-fn",
      providerRow: buildAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };

    const payload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };

    const fn: PrepareModelJobFn = async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      renderJobId: null,
    });

    const result: PrepareModelJobReturn = await fn(deps, params, payload);
    assertEquals("contribution" in result, true);
    assertEquals("needsContinuation" in result, true);
    assertEquals("renderJobId" in result, true);
    if ("renderJobId" in result) {
      assertEquals(result.renderJobId, null);
    }
  },
);
Deno.test("isPrepareModelJobDeps", () => {
  const deps: PrepareModelJobDeps = buildPrepareModelJobDepsContract();
  assertEquals(isPrepareModelJobDeps(deps), true);
  assertEquals(isPrepareModelJobDeps(null), false);
  assertEquals(isPrepareModelJobDeps({}), false);
  assertEquals(
    isPrepareModelJobDeps({
      executeModelCallAndSave: buildBoundExecuteModelCallAndSaveStub(),
    }),
    false,
  );
  assertEquals(
    isPrepareModelJobDeps({
      enqueueRenderJob: buildBoundEnqueueRenderJobStub(),
    }),
    false,
  );
});

Deno.test("isPrepareModelJobParams", async (t) => {
  await t.step("valid params", () => {
    const mockSetup = createMockSupabaseClient(undefined, {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "token-guard",
      job,
      projectOwnerUserId: "owner-guard",
      providerRow: buildAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    assertEquals(isPrepareModelJobParams(params), true);
  });
  await t.step("invalid", () => {
    assertEquals(isPrepareModelJobParams(null), false);
    assertEquals(isPrepareModelJobParams({}), false);
  });
});

Deno.test("isPrepareModelJobPayload", async (t) => {
  await t.step("minimal and full", () => {
    const minimal: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    assertEquals(isPrepareModelJobPayload(minimal), true);
    const inputsRelevance: RelevanceRule[] = [
      { document_key: FileType.HeaderContext, relevance: 0.5 },
    ];
    const inputsRequired: InputRule[] = [
      { type: "document", slug: "thesis", required: true },
    ];
    const full: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
      inputsRelevance,
      inputsRequired,
    };
    assertEquals(isPrepareModelJobPayload(full), true);
  });
  await t.step("invalid", () => {
    assertEquals(isPrepareModelJobPayload(null), false);
    assertEquals(isPrepareModelJobPayload({}), false);
  });
});

Deno.test("isPrepareModelJobSuccessReturn", () => {
  const success: PrepareModelJobSuccessReturn = {
    contribution: buildDialecticContributionRow(),
    needsContinuation: false,
    renderJobId: "render-1",
  };
  assertEquals(isPrepareModelJobSuccessReturn(success), true);
  assertEquals(isPrepareModelJobSuccessReturn(null), false);
  assertEquals(isPrepareModelJobSuccessReturn({ error: new Error("x"), retriable: false }), false);
});

Deno.test("isPrepareModelJobErrorReturn", () => {
  const err: PrepareModelJobErrorReturn = {
    error: new Error("guard err"),
    retriable: true,
  };
  assertEquals(isPrepareModelJobErrorReturn(err), true);
  assertEquals(isPrepareModelJobErrorReturn(null), false);
  assertEquals(
    isPrepareModelJobErrorReturn({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      renderJobId: null,
    }),
    false,
  );
});

