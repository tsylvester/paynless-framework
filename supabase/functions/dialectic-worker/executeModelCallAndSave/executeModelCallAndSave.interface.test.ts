import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json, Tables } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
} from "../../_shared/types.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { debitTokens } from "../../_shared/utils/debitTokens.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
} from "../../dialectic-service/dialectic.interface.ts";
import { buildGuardTestIJobContext } from "../createJobContext/JobContext.mock.ts";
import type { IJobContext } from "../createJobContext/JobContext.interface.ts";
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveErrorReturn,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSavePayload,
  ExecuteModelCallAndSaveSuccessReturn,
} from "./executeModelCallAndSave.interface.ts";

function sliceExecuteModelCallAndSaveDeps(root: IJobContext): ExecuteModelCallAndSaveDeps {
  return {
    logger: root.logger,
    fileManager: root.fileManager,
    getAiProviderAdapter: root.getAiProviderAdapter,
    tokenWalletService: root.tokenWalletService,
    notificationService: root.notificationService,
    continueJob: root.continueJob,
    retryJob: root.retryJob,
    resolveFinishReason: root.resolveFinishReason,
    isIntermediateChunk: root.isIntermediateChunk,
    determineContinuation: root.determineContinuation,
    buildUploadContext: root.buildUploadContext,
    debitTokens,
  };
}

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
  const config: AiModelExtendedConfig = {
    tokenization_strategy: { type: "rough_char_count" },
    context_window_tokens: 10000,
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
    api_identifier: "contract-api-v1",
  };
  const configJson: unknown = JSON.parse(JSON.stringify(config));
  if (!isJson(configJson)) {
    throw new Error("Contract test config must be Json-compatible");
  }
  return {
    id: "model-contract",
    provider: "contract-provider",
    name: "Contract AI",
    api_identifier: "contract-api-v1",
    config: configJson,
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

function buildChatApiRequest(): ChatApiRequest {
  return {
    message: "contract message",
    providerId: "model-contract",
    promptId: "__none__",
    walletId: "wallet-contract",
    isDialectic: true,
  };
}

Deno.test(
  "Contract: ExecuteModelCallAndSaveDeps accepts a valid deps object with all required fields",
  () => {
    const root: IJobContext = buildGuardTestIJobContext();
    const deps: ExecuteModelCallAndSaveDeps = sliceExecuteModelCallAndSaveDeps(root);

    assertEquals(typeof deps.logger.info, "function");
    assertEquals(typeof deps.fileManager, "object");
    assertEquals(typeof deps.getAiProviderAdapter, "function");
    assertEquals(typeof deps.tokenWalletService.getBalance, "function");
    assertEquals(typeof deps.notificationService.sendJobNotificationEvent, "function");
    assertEquals(typeof deps.debitTokens, "function");
    assertEquals(typeof deps.continueJob, "function");
    assertEquals(typeof deps.retryJob, "function");
    assertEquals(typeof deps.resolveFinishReason, "function");
    assertEquals(typeof deps.isIntermediateChunk, "function");
    assertEquals(typeof deps.determineContinuation, "function");
    assertEquals(typeof deps.buildUploadContext, "function");
  },
);

Deno.test(
  "Contract: ExecuteModelCallAndSaveParams accepts all required fields without a nested deps field",
  async (t) => {
    await t.step("all keys present and typed; params do not include deps", () => {
      const mockSetup = createMockSupabaseClient(undefined, {});
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
      const job: DialecticJobRow = buildDialecticJobRow(executePayload);

      const params: ExecuteModelCallAndSaveParams = {
        dbClient,
        job,
        providerRow: buildAiProvidersRow(),
        userAuthToken: "token-contract",
        sessionData: buildDialecticSessionRow(),
        projectOwnerUserId: "owner-contract",
        stageSlug: "thesis",
        iterationNumber: 1,
        projectId: "project-contract",
        sessionId: "session-contract",
        model_id: "model-contract",
        walletId: "wallet-contract",
        output_type: FileType.HeaderContext,
        sourcePromptResourceId: "source-prompt-resource-id",
      };

      assertEquals("deps" in params, false);
      assertEquals(typeof params.dbClient.from, "function");
      assertEquals(params.job.id, job.id);
      assertEquals(params.stageSlug, "thesis");
      assertEquals(params.iterationNumber, 1);
      assertEquals(typeof params.userAuthToken, "string");
    });
  },
);

Deno.test(
  "Contract: ExecuteModelCallAndSavePayload requires chatApiRequest and preflightInputTokens",
  () => {
    const payload: ExecuteModelCallAndSavePayload = {
      chatApiRequest: buildChatApiRequest(),
      preflightInputTokens: 500,
    };
    assertEquals("chatApiRequest" in payload, true);
    assertEquals(payload.chatApiRequest.message, "contract message");
    assertEquals(payload.chatApiRequest.providerId, "model-contract");
    assertEquals(payload.preflightInputTokens, 500);
  },
);

Deno.test(
  "Contract: ExecuteModelCallAndSaveSuccessReturn accepts a valid success object",
  () => {
    const success: ExecuteModelCallAndSaveSuccessReturn = {
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: "rel-contract",
      documentKey: "header_context",
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    };

    assertEquals(success.needsContinuation, false);
    assertEquals(success.contribution.id, "contrib-contract-1");
    assertEquals("stageRelationshipForStage" in success, true);
    assertEquals("documentKey" in success, true);
  },
);

Deno.test(
  "Contract: ExecuteModelCallAndSaveErrorReturn accepts error and retriable",
  () => {
    const err: ExecuteModelCallAndSaveErrorReturn = {
      error: new Error("contract failure"),
      retriable: true,
    };

    assertEquals(err.error instanceof Error, true);
    assertEquals(err.retriable, true);
    assertEquals("error" in err, true);
    assertEquals("retriable" in err, true);
  },
);

Deno.test(
  "Contract: ExecuteModelCallAndSaveDeps.debitTokens is the shared debitTokens implementation",
  () => {
    const root: IJobContext = buildGuardTestIJobContext();
    const deps: ExecuteModelCallAndSaveDeps = sliceExecuteModelCallAndSaveDeps(root);
    assertEquals(deps.debitTokens, debitTokens);
  },
);
