import { assert, assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { createProject } from "../../dialectic-service/createProject.ts";
import { startSession } from "../../dialectic-service/startSession.ts";
import { testProviderMap } from "../../_shared/ai_service/factory.ts";
import type { StartSessionPayload, SelectedModels } from "../../dialectic-service/dialectic.interface.ts";
import { getEncoding } from "npm:js-tiktoken@1.0.7";
import type { Database, Tables } from "../../types_db.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import { isKnownTiktokenEncoding, isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import { renderPrompt } from "../../_shared/prompt-renderer.ts";
import { downloadFromStorage } from "../../_shared/supabase_storage_utils.ts";
import { FileManagerService } from "../../_shared/services/file_manager.ts";
import { assembleChunks } from "../../_shared/utils/assembleChunks/assembleChunks.provides.ts";
import { gatherContinuationInputs } from "../../_shared/prompt-assembler/gatherContinuationInputs/gatherContinuationInputs.ts";
import { assembleContinuationPrompt } from "../../_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.ts";
import { assembleCompressionPrompt } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.ts";
import { isAssembleContinuationPromptErrorReturn } from "../../_shared/prompt-assembler/prompt-assembler.guard.ts";
import { enqueueCompressJobs } from "../enqueueCompressJobs/enqueueCompressJobs.ts";
import { isDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.guard.ts";
import { continueJob } from "./continueJob.ts";
import {
  isContinueJobEnqueuedReturn,
  isContinueJobErrorReturn,
  isContinueJobLimitReachedReturn,
} from "./continueJob.guard.ts";
import { LangchainTextSplitter } from "../../_shared/utils/text_splitter.ts";
import {
  buildenqueueCompressJobsDeps,
  buildenqueueCompressJobsParams,
  buildDialecticCompressJobPayload,
} from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
  buildContinueJobDeps,
  buildContinueJobParams,
  buildContinueJobPayload,
} from "./continueJob.mock.ts";
import {
  buildDialecticContributionRow,
  buildDialecticExecuteJobPayload,
  buildOutputRule,
} from "../../_shared/dialectic.mock.ts";
import { createMockJobRow } from "../saveResponse/saveResponse.mock.ts";
import {
  buildProjectContext,
  buildSessionContext,
  buildStageContext,
} from "../../_shared/prompt-assembler/prompt-assembler.mock.ts";
import { buildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.ts";
import {
  buildBuildUploadContextResourceParams,
} from "../../_shared/utils/buildUploadContext/buildUploadContext.mock.ts";
import {
  initializeTestDeps,
  initializeSupabaseAdminClient,
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  registerUndoAction,
} from "../../_shared/_integration.test.utils.ts";

// --- DB environment setup ---

interface IntegrationTestEnv {
  admin: SupabaseClient<Database>;
  primaryUserId: string;
  testProjectId: string;
  testSessionId: string;
  testWalletId: string;
  testStageId: string;
  providerRowId: string;
  providerApiIdentifier: string;
  providerConfig: AiModelExtendedConfig;
  tokenizerDeps: CountTokensDeps;
  boundaryContents: { justUnder: string; justOver: string };
  contentStorageBucket: string;
  userJwt: string;
  fileManager: FileManagerService;
}

async function setupEnv(): Promise<IntegrationTestEnv> {
  initializeTestDeps();
  const admin = initializeSupabaseAdminClient();

  const contentStorageBucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
  if (!contentStorageBucket) {
    throw new Error("SB_CONTENT_STORAGE_BUCKET env var is not set");
  }

  const PROVIDER_MAX_INPUT_TOKENS = 1000;
  const TOKEN_BUDGET = PROVIDER_MAX_INPUT_TOKENS - 500 - 32;

  const { userId: primaryUserId, userClient: primaryUserClient, jwt: primaryUserJwt } =
    await coreCreateAndSetupTestUser(undefined, "local", { minModelsPerProject: 1, tierLevel: 10 });
  await coreEnsureTestUserAndWallet(primaryUserId, 100_000, "local");

  const { data: eligibleProviders, error: providersErr } = await admin
    .from("ai_providers")
    .select("id, name, api_identifier, config, min_plan_tier_level")
    .eq("is_active", true)
    .eq("is_enabled", true)
    .eq("is_default_embedding", false)
    .lte("min_plan_tier_level", 10);
  if (providersErr || !eligibleProviders || eligibleProviders.length === 0) {
    throw new Error(`No eligible ai_providers found: ${providersErr?.message ?? "empty result"}`);
  }

  let providerRowId = "";
  let providerApiIdentifier = "";
  let resolvedConfig: AiModelExtendedConfig | null = null;
  for (const row of eligibleProviders) {
    if (isAiModelExtendedConfig(row.config)) {
      providerRowId = row.id;
      providerApiIdentifier = row.api_identifier;
      const baseConfig: AiModelExtendedConfig = row.config;
      resolvedConfig = {
        ...baseConfig,
        provider_max_input_tokens: PROVIDER_MAX_INPUT_TOKENS,
      };
      break;
    }
  }
  if (resolvedConfig === null) {
    throw new Error(
      `No eligible ai_provider with a valid AiModelExtendedConfig found among ${eligibleProviders.length} providers`,
    );
  }
  const providerConfig: AiModelExtendedConfig = resolvedConfig;

  const selectedModels: SelectedModels[] = [{
    id: providerRowId,
    displayName: eligibleProviders.find((p) => p.id === providerRowId)!.name,
  }];

  const tokenizerDeps: CountTokensDeps = {
    getEncoding: (encodingName: string) => {
      if (!isKnownTiktokenEncoding(encodingName)) {
        throw new Error(`Unknown tiktoken encoding: ${encodingName}`);
      }
      return getEncoding(encodingName);
    },
    countTokensAnthropic: () => 0,
    logger: new MockLogger(),
  };

  function realTokenCount(content: string): number {
    return countTokens(tokenizerDeps, { message: content }, providerConfig);
  }

  function buildBoundaryContents(): { justUnder: string; justOver: string } {
    let index = 1;
    let content = `word${index}`;
    let previous = content;
    while (realTokenCount(content) <= TOKEN_BUDGET) {
      previous = content;
      index += 1;
      content = `${content} word${index}`;
    }
    return { justUnder: previous, justOver: content };
  }

  const boundaryContents = buildBoundaryContents();

  const userResponse = await primaryUserClient.auth.getUser();
  if (userResponse.error || !userResponse.data.user) {
    throw new Error("Test user could not be fetched");
  }
  const testUser: User = userResponse.data.user;

  const { data: domain, error: domainErr } = await admin
    .from("dialectic_domains")
    .select("id")
    .eq("name", "Software Development")
    .single();
  if (domainErr || !domain) {
    throw new Error("Software Development domain missing — seed the DB first.");
  }

  const { data: association, error: assocErr } = await admin
    .from("domain_process_associations")
    .select("process_template_id")
    .eq("domain_id", domain.id)
    .eq("is_default_for_domain", true)
    .single();
  if (assocErr || !association) {
    throw new Error("Default domain_process_associations row not found for Software Development");
  }
  const defaultProcessTemplateId = association.process_template_id;

  const projectFormData = new FormData();
  projectFormData.append("projectName", `continueJob IT ${crypto.randomUUID().slice(0, 8)}`);
  projectFormData.append("initialUserPromptText", "Integration test project for continueJob.");
  projectFormData.append("selectedDomainId", domain.id);
  projectFormData.append("processTemplateId", defaultProcessTemplateId);
  projectFormData.append("idempotencyKey", crypto.randomUUID());

  const projectResult = await createProject(projectFormData, admin, testUser);
  if (projectResult.error || !projectResult.data) {
    throw new Error(`createProject failed: ${projectResult.error?.message}`);
  }
  const testProjectId = projectResult.data.id;
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_projects",
    criteria: { id: testProjectId },
    scope: "local",
  });

  const sessionPayload: StartSessionPayload = {
    projectId: testProjectId,
    selectedModels,
    sessionDescription: "continueJob integration test session",
    idempotencyKey: crypto.randomUUID(),
  };
  const sessionResult = await startSession(testUser, admin, primaryUserClient, sessionPayload, {
    providerMap: testProviderMap,
    embeddingApiKey: "test-key",
  });
  if (sessionResult.error || !sessionResult.data) {
    throw new Error(`startSession failed: ${sessionResult.error?.message}`);
  }
  const testSessionId = sessionResult.data.id;
  const testStageId = sessionResult.data.current_stage_id;
  if (testStageId === null) {
    throw new Error("startSession returned a session with null current_stage_id");
  }
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_sessions",
    criteria: { id: testSessionId },
    scope: "local",
  });

  const { data: wallet, error: walletErr } = await admin
    .from("token_wallets")
    .select("wallet_id")
    .eq("user_id", primaryUserId)
    .is("organization_id", null)
    .single();
  if (walletErr || !wallet) {
    throw new Error("Test wallet not found.");
  }

  const fileManager = new FileManagerService(admin, {
    constructStoragePath,
    logger: new MockLogger(),
    assembleChunks,
  });

  return {
    admin,
    primaryUserId,
    testProjectId,
    testSessionId,
    testWalletId: wallet.wallet_id,
    testStageId,
    providerRowId,
    providerApiIdentifier,
    providerConfig,
    tokenizerDeps,
    boundaryContents,
    contentStorageBucket,
    userJwt: primaryUserJwt,
    fileManager,
  };
}

async function readJobByIdempotencyKey(
  env: IntegrationTestEnv,
  idempotencyKey: string,
): Promise<Tables<"dialectic_generation_jobs">> {
  const { data, error } = await env.admin
    .from("dialectic_generation_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .single();
  if (error || !data) {
    throw new Error(`Failed to read job by idempotency_key ${idempotencyKey}: ${error?.message}`);
  }
  return data;
}

// =====================================================================
// Case 1: fitting victim through the whole chain
// =====================================================================

/**
 * Contract: a fitting victim run through enqueueCompressJobs → continueJob
 *   produces a successor whose payload passes isDialecticCompressJobPayload,
 *   carries user_jwt from the parent, idempotencyKey equal to its own row's
 *   idempotency_key, and carries neither job_type nor user_id while the row
 *   carries both.
 * Boundary: enqueueCompressJobs → COMPRESS row → continueJob → successor row.
 *   Every function in that chain runs real against the local Supabase stack.
 * Mocked: nothing. No function in this chain calls a model.
 * Arrange: a parent job and a contribution inserted as preconditions; a
 *   fitting json victim under the token budget.
 * Act: enqueueCompressJobs with the fitting victim; read back the COMPRESS
 *   row; continueJob over that row and the contribution; read back the
 *   successor.
 * Assert: the successor payload passes isDialecticCompressJobPayload, carries
 *   user_jwt, idempotencyKey equals the row's column, and carries neither
 *   job_type nor user_id; the row carries both.
 */
Deno.test({
  name: "continueJob integration: fitting victim through whole chain",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const env = await setupEnv();
    try {
      // Arrange
      const parentJobId = crypto.randomUUID();
      const parentJobRow = createMockJobRow(
        buildDialecticExecuteJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${parentJobId}_initial`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          output_type: FileType.business_case,
          document_key: FileType.business_case,
        }),
        {
          id: parentJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "EXECUTE",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: parentJob, error: parentJobErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(parentJobRow)
        .select("*")
        .single();
      if (parentJobErr || !parentJob) {
        throw new Error(`Failed to insert parent job: ${parentJobErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: parentJobId },
        scope: "local",
      });

      const contributionId = crypto.randomUUID();
      const contributionRow = buildDialecticContributionRow({
        id: contributionId,
        session_id: env.testSessionId,
        user_id: env.primaryUserId,
        stage: DialecticStageSlug.Thesis,
        iteration_number: 1,
        model_id: env.providerRowId,
        contribution_type: FileType.business_case,
        storage_bucket: env.contentStorageBucket,
        storage_path: `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`,
        file_name: "business_case.json",
        mime_type: "application/json",
        document_relationships: {},
        prompt_template_id_used: null,
      });
      const { data: contribution, error: contributionErr } = await env.admin
        .from("dialectic_contributions")
        .insert(contributionRow)
        .select("*")
        .single();
      if (contributionErr || !contribution) {
        throw new Error(`Failed to insert contribution: ${contributionErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: contributionId },
        scope: "local",
      });

      // Act
      const enqueueResult = await enqueueCompressJobs(
        buildenqueueCompressJobsDeps({
          countTokens,
          textSplitter: new LangchainTextSplitter(),
        }),
        buildenqueueCompressJobsParams({
          dbClient: env.admin,
          parentJob,
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          iterationNumber: 1,
          modelId: env.providerRowId,
          modelSlug: env.providerApiIdentifier,
          userJwt: env.userJwt,
          walletId: env.testWalletId,
          modelConfig: env.providerConfig,
          tokenizerDeps: env.tokenizerDeps,
        }),
        {
          victim: {
            mode: "json",
            content: '{"product": "widget", "price": 100}',
            sourceType: "contribution",
            documentKey: FileType.business_case,
            docType: FileType.business_case,
            sourceStageSlug: DialecticStageSlug.Thesis,
          },
        },
      );

      // Assert
      assert("createdCount" in enqueueResult, "enqueueCompressJobs returned an error");
      assertEquals(enqueueResult.createdCount, 1);

      // Act — read back the COMPRESS row and drive continueJob over it
      const baseIdempotencyKey =
        `${parentJob.id}_compress_contribution_business_case_business_case`;
      const compressRow = await readJobByIdempotencyKey(env, baseIdempotencyKey);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressRow.id },
        scope: "local",
      });

      const continueResult = await continueJob(
        buildContinueJobDeps(),
        buildContinueJobParams({
          dbClient: env.admin,
          projectOwnerUserId: env.primaryUserId,
        }),
        buildContinueJobPayload({
          job: compressRow,
          savedOutput: contribution,
        }),
      );

      // Assert
      assert(isContinueJobEnqueuedReturn(continueResult), "continueJob did not return enqueued");

      // Act — read back the successor row
      const successorKey = `${compressRow.id}_continue_${contribution.id}`;
      const successorRow = await readJobByIdempotencyKey(env, successorKey);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: successorRow.id },
        scope: "local",
      });

      // Assert — the successor payload passes the compress guard
      assert(isDialecticCompressJobPayload(successorRow.payload), "successor payload is not a valid compress job payload");

      // Assert — carries user_jwt from the parent
      assertEquals(successorRow.payload.user_jwt, env.userJwt);

      // Assert — idempotencyKey equal to its own row's column
      assertEquals(successorRow.payload.idempotencyKey, successorRow.idempotency_key);

      // Assert — carries neither job_type nor user_id in the payload
      assert(!("job_type" in successorRow.payload), "payload should not carry job_type");
      assert(!("user_id" in successorRow.payload), "payload should not carry user_id");

      // Assert — the row carries both
      assert(typeof successorRow.job_type === "string");
      assert(typeof successorRow.user_id === "string");
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});

// =====================================================================
// Case 2: oversized victim — chunk_index and chunk_total survive round trip
// =====================================================================

/**
 * Contract: an oversized victim run through enqueueCompressJobs produces
 *   multiple chunked COMPRESS rows, and each chunk's continuation successor
 *   carries chunk_index and chunk_total as conditional members, with each
 *   chunk's idempotencyKey equal to its own row's column rather than the
 *   first chunk's.
 * Boundary: enqueueCompressJobs → chunked COMPRESS rows → continueJob per
 *   chunk → successor rows. Every function runs real.
 * Mocked: nothing.
 * Arrange: a parent job and a contribution; an oversized json victim that
 *   exceeds the token budget.
 * Act: enqueueCompressJobs with the oversized victim; for each COMPRESS row,
 *   continueJob and read back the successor.
 * Assert: each successor carries chunk_index and chunk_total as numbers, and
 *   each successor's idempotencyKey is its own row's column, not the first
 *   chunk's.
 */
Deno.test({
  name: "continueJob integration: oversized victim chunk round trip",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const env = await setupEnv();
    try {
      // Arrange
      const parentJobId = crypto.randomUUID();
      const parentJobRow = createMockJobRow(
        buildDialecticExecuteJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${parentJobId}_initial`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          output_type: FileType.business_case,
          document_key: FileType.business_case,
        }),
        {
          id: parentJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "EXECUTE",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: parentJob, error: parentJobErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(parentJobRow)
        .select("*")
        .single();
      if (parentJobErr || !parentJob) {
        throw new Error(`Failed to insert parent job: ${parentJobErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: parentJobId },
        scope: "local",
      });

      const contributionId = crypto.randomUUID();
      const contributionRow = buildDialecticContributionRow({
        id: contributionId,
        session_id: env.testSessionId,
        user_id: env.primaryUserId,
        stage: DialecticStageSlug.Thesis,
        iteration_number: 1,
        model_id: env.providerRowId,
        contribution_type: FileType.business_case,
        storage_bucket: env.contentStorageBucket,
        storage_path: `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`,
        file_name: "business_case.json",
        mime_type: "application/json",
        document_relationships: {},
        prompt_template_id_used: null,
      });
      const { data: contribution, error: contributionErr } = await env.admin
        .from("dialectic_contributions")
        .insert(contributionRow)
        .select("*")
        .single();
      if (contributionErr || !contribution) {
        throw new Error(`Failed to insert contribution: ${contributionErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: contributionId },
        scope: "local",
      });

      // Act
      const enqueueResult = await enqueueCompressJobs(
        buildenqueueCompressJobsDeps({
          countTokens,
          textSplitter: new LangchainTextSplitter(),
        }),
        buildenqueueCompressJobsParams({
          dbClient: env.admin,
          parentJob,
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          iterationNumber: 1,
          modelId: env.providerRowId,
          modelSlug: env.providerApiIdentifier,
          userJwt: env.userJwt,
          walletId: env.testWalletId,
          modelConfig: env.providerConfig,
          tokenizerDeps: env.tokenizerDeps,
        }),
        {
          victim: {
            mode: "json",
            content: env.boundaryContents.justOver,
            sourceType: "contribution",
            documentKey: FileType.business_case,
            docType: FileType.business_case,
            sourceStageSlug: DialecticStageSlug.Thesis,
          },
        },
      );

      // Assert
      assert("createdCount" in enqueueResult, "enqueueCompressJobs returned an error");
      assert(enqueueResult.createdCount > 1, "expected chunked output");

      // Act — read back all COMPRESS rows for this parent
      const { data: compressRows, error: compressErr } = await env.admin
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("parent_job_id", parentJob.id)
        .eq("job_type", "COMPRESS");
      if (compressErr || !compressRows) {
        throw new Error(`Failed to read compress rows: ${compressErr?.message}`);
      }
      assert(compressRows.length > 1, "expected multiple compress rows");

      // Act — for each chunk, drive continueJob and read back the successor
      for (const compressRow of compressRows) {
        registerUndoAction({
          type: "DELETE_CREATED_ROW",
          tableName: "dialectic_generation_jobs",
          criteria: { id: compressRow.id },
          scope: "local",
        });
        const continueResult = await continueJob(
          buildContinueJobDeps(),
          buildContinueJobParams({
            dbClient: env.admin,
            projectOwnerUserId: env.primaryUserId,
          }),
          buildContinueJobPayload({
            job: compressRow,
            savedOutput: contribution,
          }),
        );

        // Assert
        assert(isContinueJobEnqueuedReturn(continueResult), "continueJob did not return enqueued");

        const successorKey = `${compressRow.id}_continue_${contribution.id}`;
        const successorRow = await readJobByIdempotencyKey(env, successorKey);
        registerUndoAction({
          type: "DELETE_CREATED_ROW",
          tableName: "dialectic_generation_jobs",
          criteria: { id: successorRow.id },
          scope: "local",
        });

        assert(isDialecticCompressJobPayload(successorRow.payload), "successor payload is not a valid compress job payload");

        // Assert — chunk_index and chunk_total survive the round trip
        assert(typeof successorRow.payload.chunk_index === "number", "chunk_index missing");
        assert(typeof successorRow.payload.chunk_total === "number", "chunk_total missing");

        // Assert — each chunk's idempotencyKey is its own row's column, not the first chunk's
        assertEquals(successorRow.payload.idempotencyKey, successorRow.idempotency_key);
        assertNotEquals(successorRow.payload.idempotencyKey, compressRows[0].idempotency_key);
      }
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});

// =====================================================================
// Case 3: COMPRESS and EXECUTE rows — each inserts successor of own job_type
// =====================================================================

/**
 * Contract: a COMPRESS row and an EXECUTE row carrying a payload
 *   isDialecticCompressJobPayload would reject, each insert a successor of
 *   their own job_type rather than the compress guard's diagnostic being
 *   reported.
 * Boundary: continueJob over both rows → successor rows. Both rows are
 *   arranged in the one block so neither assertion can hold if arm selection
 *   were deleted.
 * Mocked: nothing.
 * Arrange: a contribution; a COMPRESS row produced by enqueueCompressJobs;
 *   an EXECUTE row carrying an execute payload, inserted directly as a
 *   precondition.
 * Act: continueJob over each row.
 * Assert: the COMPRESS successor has job_type COMPRESS; the EXECUTE successor
 *   has job_type EXECUTE.
 */
Deno.test({
  name: "continueJob integration: COMPRESS and EXECUTE rows insert successors of own job_type",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const env = await setupEnv();
    try {
      // Arrange
      const contributionId = crypto.randomUUID();
      const contributionRow = buildDialecticContributionRow({
        id: contributionId,
        session_id: env.testSessionId,
        user_id: env.primaryUserId,
        stage: DialecticStageSlug.Thesis,
        iteration_number: 1,
        model_id: env.providerRowId,
        contribution_type: FileType.business_case,
        storage_bucket: env.contentStorageBucket,
        storage_path: `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`,
        file_name: "business_case.json",
        mime_type: "application/json",
        document_relationships: {},
        prompt_template_id_used: null,
      });
      const { data: contribution, error: contributionErr } = await env.admin
        .from("dialectic_contributions")
        .insert(contributionRow)
        .select("*")
        .single();
      if (contributionErr || !contribution) {
        throw new Error(`Failed to insert contribution: ${contributionErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: contributionId },
        scope: "local",
      });

      const parentJobId = crypto.randomUUID();
      const parentJobRow = createMockJobRow(
        buildDialecticExecuteJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${parentJobId}_initial`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          output_type: FileType.business_case,
          document_key: FileType.business_case,
        }),
        {
          id: parentJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "EXECUTE",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: parentJob, error: parentJobErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(parentJobRow)
        .select("*")
        .single();
      if (parentJobErr || !parentJob) {
        throw new Error(`Failed to insert parent job: ${parentJobErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: parentJobId },
        scope: "local",
      });

      // Act — produce a COMPRESS row via enqueueCompressJobs
      const enqueueResult = await enqueueCompressJobs(
        buildenqueueCompressJobsDeps({
          countTokens,
          textSplitter: new LangchainTextSplitter(),
        }),
        buildenqueueCompressJobsParams({
          dbClient: env.admin,
          parentJob,
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          iterationNumber: 1,
          modelId: env.providerRowId,
          modelSlug: env.providerApiIdentifier,
          userJwt: env.userJwt,
          walletId: env.testWalletId,
          modelConfig: env.providerConfig,
          tokenizerDeps: env.tokenizerDeps,
        }),
        {
          victim: {
            mode: "json",
            content: '{"product": "widget"}',
            sourceType: "contribution",
            documentKey: FileType.business_case,
            docType: FileType.business_case,
            sourceStageSlug: DialecticStageSlug.Thesis,
          },
        },
      );
      assert("createdCount" in enqueueResult, "enqueueCompressJobs returned an error");
      const baseIdempotencyKey =
        `${parentJob.id}_compress_contribution_business_case_business_case`;
      const compressRow = await readJobByIdempotencyKey(env, baseIdempotencyKey);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressRow.id },
        scope: "local",
      });

      // Arrange — an EXECUTE row carrying an execute payload the compress guard would reject
      const executeJobId = crypto.randomUUID();
      const executeJob = createMockJobRow(
        buildDialecticExecuteJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${executeJobId}_execute_direct`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          output_type: FileType.business_case,
          document_key: FileType.business_case,
          document_relationships: { [DialecticStageSlug.Thesis]: contribution.id },
        }),
        {
          id: executeJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "EXECUTE",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: insertedExecuteJob, error: executeErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(executeJob)
        .select("*")
        .single();
      if (executeErr || !insertedExecuteJob) {
        throw new Error(`Failed to insert execute job: ${executeErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: executeJobId },
        scope: "local",
      });

      // Act — drive continueJob over both rows
      const compressContinueResult = await continueJob(
        buildContinueJobDeps(),
        buildContinueJobParams({
          dbClient: env.admin,
          projectOwnerUserId: env.primaryUserId,
        }),
        buildContinueJobPayload({
          job: compressRow,
          savedOutput: contribution,
        }),
      );
      const executeContinueResult = await continueJob(
        buildContinueJobDeps(),
        buildContinueJobParams({
          dbClient: env.admin,
          projectOwnerUserId: env.primaryUserId,
        }),
        buildContinueJobPayload({
          job: insertedExecuteJob,
          savedOutput: contribution,
        }),
      );

      // Assert
      assert(isContinueJobEnqueuedReturn(compressContinueResult), "COMPRESS continueJob did not return enqueued");
      assert(isContinueJobEnqueuedReturn(executeContinueResult), "EXECUTE continueJob did not return enqueued");

      const compressSuccessor = await readJobByIdempotencyKey(env, `${compressRow.id}_continue_${contribution.id}`);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressSuccessor.id },
        scope: "local",
      });
      const executeSuccessor = await readJobByIdempotencyKey(env, `${insertedExecuteJob.id}_continue_${contribution.id}`);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: executeSuccessor.id },
        scope: "local",
      });

      // Assert — each successor has its own job_type
      assertEquals(compressSuccessor.job_type, "COMPRESS");
      assertEquals(executeSuccessor.job_type, "EXECUTE");
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});

// =====================================================================
// Case 4: corrupted member in stored payload — error arm, no row
// =====================================================================

/**
 * Contract: a COMPRESS row whose stored payload jsonb carries one corrupted
 *   member (user_jwt set to an empty string) causes continueJob to return the
 *   error arm carrying that member's own diagnostic from the base guard, with
 *   retriable: false and no row written.
 * Boundary: a real row with real untrusted data read back out of a real
 *   column → continueJob → error arm.
 * Mocked: nothing.
 * Arrange: a contribution; a COMPRESS row inserted directly with a payload
 *   built by buildDialecticCompressJobPayload carrying user_jwt: ''.
 * Act: continueJob over that row and the contribution.
 * Assert: isContinueJobErrorReturn, retriable: false, the error message
 *   mentions user_jwt, and no successor row was written.
 */
Deno.test({
  name: "continueJob integration: corrupted payload member returns error arm",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const env = await setupEnv();
    try {
      // Arrange
      const contributionId = crypto.randomUUID();
      const contributionRow = buildDialecticContributionRow({
        id: contributionId,
        session_id: env.testSessionId,
        user_id: env.primaryUserId,
        stage: DialecticStageSlug.Thesis,
        iteration_number: 1,
        model_id: env.providerRowId,
        contribution_type: FileType.business_case,
        storage_bucket: env.contentStorageBucket,
        storage_path: `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`,
        file_name: "business_case.json",
        mime_type: "application/json",
        document_relationships: {},
        prompt_template_id_used: null,
      });
      const { data: contribution, error: contributionErr } = await env.admin
        .from("dialectic_contributions")
        .insert(contributionRow)
        .select("*")
        .single();
      if (contributionErr || !contribution) {
        throw new Error(`Failed to insert contribution: ${contributionErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: contributionId },
        scope: "local",
      });
      const compressJobId = crypto.randomUUID();
      const compressJob = createMockJobRow(
        buildDialecticCompressJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: "",
          idempotencyKey: `${compressJobId}_corrupt`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          targetKey: FileType.business_case,
          mode: "text",
          content: "some content",
          sourceType: "contribution",
          documentKey: FileType.business_case,
        }),
        {
          id: compressJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "COMPRESS",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: insertedCompressJob, error: compressErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(compressJob)
        .select("*")
        .single();
      if (compressErr || !insertedCompressJob) {
        throw new Error(`Failed to insert corrupt compress job: ${compressErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressJobId },
        scope: "local",
      });

      // Act
      const continueResult = await continueJob(
        buildContinueJobDeps(),
        buildContinueJobParams({
          dbClient: env.admin,
          projectOwnerUserId: env.primaryUserId,
        }),
        buildContinueJobPayload({
          job: insertedCompressJob,
          savedOutput: contribution,
        }),
      );

      // Assert
      assert(isContinueJobErrorReturn(continueResult), "continueJob did not return error arm");
      assertEquals(continueResult.retriable, false, "retriable should be false");
      assert(continueResult.error instanceof Error);
      assert(
        continueResult.error.message.includes("user_jwt"),
        `error message should mention user_jwt, got: ${continueResult.error.message}`,
      );

      // Assert — no successor row was written
      const successorKey = `${insertedCompressJob.id}_continue_${contribution.id}`;
      const { data: successorRow } = await env.admin
        .from("dialectic_generation_jobs")
        .select("id")
        .eq("idempotency_key", successorKey)
        .maybeSingle();
      assertEquals(successorRow, null, "no successor row should have been written");
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});

// =====================================================================
// Case 5: continuation_count at the bound — limit-reached, no row
// =====================================================================

/**
 * Contract: a COMPRESS row whose stored payload carries continuation_count at
 *   the bound (5) causes continueJob to return the limit-reached arm with no
 *   row written.
 * Boundary: a real row with continuation_count 5 → continueJob →
 *   limit-reached arm.
 * Mocked: nothing.
 * Arrange: a contribution; a COMPRESS row inserted directly with a payload
 *   built by buildDialecticCompressJobPayload carrying continuation_count: 5.
 * Act: continueJob over that row and the contribution.
 * Assert: isContinueJobLimitReachedReturn, and no successor row was written.
 */
Deno.test({
  name: "continueJob integration: continuation_count at bound returns limit-reached",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const env = await setupEnv();
    try {
      // Arrange
      const contributionId = crypto.randomUUID();
      const contributionRow = buildDialecticContributionRow({
        id: contributionId,
        session_id: env.testSessionId,
        user_id: env.primaryUserId,
        stage: DialecticStageSlug.Thesis,
        iteration_number: 1,
        model_id: env.providerRowId,
        contribution_type: FileType.business_case,
        storage_bucket: env.contentStorageBucket,
        storage_path: `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`,
        file_name: "business_case.json",
        mime_type: "application/json",
        document_relationships: {},
        prompt_template_id_used: null,
      });
      const { data: contribution, error: contributionErr } = await env.admin
        .from("dialectic_contributions")
        .insert(contributionRow)
        .select("*")
        .single();
      if (contributionErr || !contribution) {
        throw new Error(`Failed to insert contribution: ${contributionErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: contributionId },
        scope: "local",
      });
      const compressJobId = crypto.randomUUID();
      const compressJob = createMockJobRow(
        buildDialecticCompressJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${compressJobId}_at_bound`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          targetKey: FileType.business_case,
          mode: "text",
          content: "some content",
          sourceType: "contribution",
          documentKey: FileType.business_case,
          continuation_count: 5,
        }),
        {
          id: compressJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "COMPRESS",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: insertedCompressJob, error: compressErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(compressJob)
        .select("*")
        .single();
      if (compressErr || !insertedCompressJob) {
        throw new Error(`Failed to insert compress job at bound: ${compressErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressJobId },
        scope: "local",
      });

      // Act
      const continueResult = await continueJob(
        buildContinueJobDeps(),
        buildContinueJobParams({
          dbClient: env.admin,
          projectOwnerUserId: env.primaryUserId,
        }),
        buildContinueJobPayload({
          job: insertedCompressJob,
          savedOutput: contribution,
        }),
      );

      // Assert
      assert(isContinueJobLimitReachedReturn(continueResult), "continueJob did not return limit-reached");

      // Assert — no successor row was written
      const successorKey = `${insertedCompressJob.id}_continue_${contribution.id}`;
      const { data: successorRow } = await env.admin
        .from("dialectic_generation_jobs")
        .select("id")
        .eq("idempotency_key", successorKey)
        .maybeSingle();
      assertEquals(successorRow, null, "no successor row should have been written");
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});

// =====================================================================
// Case 6: same continuation twice — 23505 → enqueued; other failure → error
// =====================================================================

/**
 * Contract: driving the same continuation twice so the second insert raises a
 *   genuine 23505 on the idempotency_key unique constraint returns the
 *   enqueued arm; a different insert failure returns the error arm with
 *   retriable: true. The constraint is the database's, which is why this
 *   branch is provable here and nowhere else.
 * Boundary: continueJob twice over the same row → 23505 → enqueued; a third
 *   call with a non-existent session_id → foreign key violation → error arm.
 * Mocked: nothing.
 * Arrange: a contribution; a COMPRESS row produced by enqueueCompressJobs.
 * Act: continueJob three times — first succeeds, second hits 23505, third
 *   uses an in-memory row with a bad session_id to trigger a different insert
 *   failure.
 * Assert: first and second return isContinueJobEnqueuedReturn; third returns
 *   isContinueJobErrorReturn with retriable: true.
 */
Deno.test({
  name: "continueJob integration: 23505 idempotency_key violation returns enqueued; other insert failure returns error arm",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const env = await setupEnv();
    try {
      // Arrange
      const contributionId = crypto.randomUUID();
      const contributionRow = buildDialecticContributionRow({
        id: contributionId,
        session_id: env.testSessionId,
        user_id: env.primaryUserId,
        stage: DialecticStageSlug.Thesis,
        iteration_number: 1,
        model_id: env.providerRowId,
        contribution_type: FileType.business_case,
        storage_bucket: env.contentStorageBucket,
        storage_path: `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`,
        file_name: "business_case.json",
        mime_type: "application/json",
        document_relationships: {},
        prompt_template_id_used: null,
      });
      const { data: contribution, error: contributionErr } = await env.admin
        .from("dialectic_contributions")
        .insert(contributionRow)
        .select("*")
        .single();
      if (contributionErr || !contribution) {
        throw new Error(`Failed to insert contribution: ${contributionErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: contributionId },
        scope: "local",
      });

      const parentJobId = crypto.randomUUID();
      const parentJobRow = createMockJobRow(
        buildDialecticExecuteJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${parentJobId}_initial`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          output_type: FileType.business_case,
          document_key: FileType.business_case,
        }),
        {
          id: parentJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "EXECUTE",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: parentJob, error: parentJobErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(parentJobRow)
        .select("*")
        .single();
      if (parentJobErr || !parentJob) {
        throw new Error(`Failed to insert parent job: ${parentJobErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: parentJobId },
        scope: "local",
      });

      const enqueueResult = await enqueueCompressJobs(
        buildenqueueCompressJobsDeps({
          countTokens,
          textSplitter: new LangchainTextSplitter(),
        }),
        buildenqueueCompressJobsParams({
          dbClient: env.admin,
          parentJob,
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          iterationNumber: 1,
          modelId: env.providerRowId,
          modelSlug: env.providerApiIdentifier,
          userJwt: env.userJwt,
          walletId: env.testWalletId,
          modelConfig: env.providerConfig,
          tokenizerDeps: env.tokenizerDeps,
        }),
        {
          victim: {
            mode: "json",
            content: '{"product": "widget"}',
            sourceType: "contribution",
            documentKey: FileType.business_case,
            docType: FileType.business_case,
            sourceStageSlug: DialecticStageSlug.Thesis,
          },
        },
      );
      assert("createdCount" in enqueueResult, "enqueueCompressJobs returned an error");
      const baseIdempotencyKey =
        `${parentJob.id}_compress_contribution_business_case_business_case`;
      const compressRow = await readJobByIdempotencyKey(env, baseIdempotencyKey);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressRow.id },
        scope: "local",
      });

      const continueDeps = buildContinueJobDeps();
      const continueParams = buildContinueJobParams({
        dbClient: env.admin,
        projectOwnerUserId: env.primaryUserId,
      });
      const continuePayload = buildContinueJobPayload({
        job: compressRow,
        savedOutput: contribution,
      });

      // Act — first call inserts the successor
      const firstResult = await continueJob(continueDeps, continueParams, continuePayload);
      assert(isContinueJobEnqueuedReturn(firstResult), "first continueJob did not return enqueued");

      // Act — second call hits 23505 on the same idempotency_key
      const secondResult = await continueJob(continueDeps, continueParams, continuePayload);
      assert(isContinueJobEnqueuedReturn(secondResult), "23505 violation should return enqueued");

      // Act — third call with a non-existent session_id to produce a different insert failure
      const badSessionJobId = crypto.randomUUID();
      const jobWithBadSession = createMockJobRow(
        buildDialecticCompressJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${badSessionJobId}_bad_session`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          targetKey: FileType.business_case,
          mode: "text",
          content: "some content",
          sourceType: "contribution",
          documentKey: FileType.business_case,
        }),
        {
          id: badSessionJobId,
          session_id: crypto.randomUUID(),
          user_id: compressRow.user_id,
          stage_slug: compressRow.stage_slug,
          iteration_number: compressRow.iteration_number,
          job_type: "COMPRESS",
          status: "completed",
          attempt_count: compressRow.attempt_count,
          max_retries: compressRow.max_retries,
          parent_job_id: compressRow.parent_job_id,
          is_test_job: compressRow.is_test_job,
          idempotency_key: `${badSessionJobId}_bad_session`,
        },
      );
      const thirdResult = await continueJob(
        continueDeps,
        continueParams,
        buildContinueJobPayload({
          job: jobWithBadSession,
          savedOutput: contribution,
        }),
      );

      // Assert
      assert(isContinueJobErrorReturn(thirdResult), "insert failure should return error arm");
      assertEquals(thirdResult.retriable, true, "retriable should be true for insert failure");
      assert(thirdResult.error instanceof Error, "error should be an Error");
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});

// =====================================================================
// Case 7: assembleContinuationPrompt over COMPRESS and EXECUTE successors
// =====================================================================

/**
 * Contract: assembleContinuationPrompt over the stored COMPRESS successor and
 *   one over the stored EXECUTE successor, arranged together, each takes its
 *   own branch and returns an AssembledPrompt.
 * Boundary: enqueueCompressJobs → COMPRESS row → continueJob → COMPRESS
 *   successor → assembleContinuationPrompt (COMPRESS branch); an EXECUTE row
 *   → continueJob → EXECUTE successor → assembleContinuationPrompt (EXECUTE
 *   branch). Every function runs real, including gatherContinuationInputs and
 *   assembleChunks.
 * Mocked: nothing. The only external boundary this repo mocks is the AI
 *   provider adapter, and no function in this chain calls a model.
 * Arrange: a contribution with storage content; a seed_prompt resource with
 *   storage content (for the EXECUTE branch's gatherContinuationInputs); a
 *   CompressionPrompt and CompressedContextRawJson artifact (for the COMPRESS
 *   branch's two canonical reads); a COMPRESS successor and an EXECUTE
 *   successor, both produced by continueJob.
 * Act: assembleContinuationPrompt over each successor.
 * Assert: each returns an AssembledPrompt (not an error return).
 */
Deno.test({
  name: "continueJob integration: assembleContinuationPrompt over COMPRESS and EXECUTE successors",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const env = await setupEnv();
    try {
      // Arrange — contribution with storage content
      const contributionId = crypto.randomUUID();
      const contributionRow = buildDialecticContributionRow({
        id: contributionId,
        session_id: env.testSessionId,
        user_id: env.primaryUserId,
        stage: DialecticStageSlug.Thesis,
        iteration_number: 1,
        model_id: env.providerRowId,
        contribution_type: FileType.business_case,
        storage_bucket: env.contentStorageBucket,
        storage_path: `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`,
        file_name: "business_case.json",
        mime_type: "application/json",
        document_relationships: {},
        prompt_template_id_used: null,
      });
      const { data: contribution, error: contributionErr } = await env.admin
        .from("dialectic_contributions")
        .insert(contributionRow)
        .select("*")
        .single();
      if (contributionErr || !contribution) {
        throw new Error(`Failed to insert contribution: ${contributionErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: contributionId },
        scope: "local",
      });
      const storageBucket = env.contentStorageBucket;
      const contributionStoragePath = `projects/${env.testProjectId}/sessions/${env.testSessionId}/iterations/1`;
      const contributionFileName = "business_case.json";
      const contributionContent = '{"product": "widget", "price": 100}';
      await env.admin.storage
        .from(storageBucket)
        .upload(`${contributionStoragePath}/${contributionFileName}`, contributionContent, {
          contentType: "application/json",
          upsert: true,
        });

      // Arrange — produce a COMPRESS successor via enqueueCompressJobs → continueJob
      const parentJobId = crypto.randomUUID();
      const parentJobRow = createMockJobRow(
        buildDialecticExecuteJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${parentJobId}_initial`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          output_type: FileType.business_case,
          document_key: FileType.business_case,
        }),
        {
          id: parentJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "EXECUTE",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: parentJob, error: parentJobErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(parentJobRow)
        .select("*")
        .single();
      if (parentJobErr || !parentJob) {
        throw new Error(`Failed to insert parent job: ${parentJobErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: parentJobId },
        scope: "local",
      });
      const enqueueResult = await enqueueCompressJobs(
        buildenqueueCompressJobsDeps({
          countTokens,
          textSplitter: new LangchainTextSplitter(),
        }),
        buildenqueueCompressJobsParams({
          dbClient: env.admin,
          parentJob,
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          iterationNumber: 1,
          modelId: env.providerRowId,
          modelSlug: env.providerApiIdentifier,
          userJwt: env.userJwt,
          walletId: env.testWalletId,
          modelConfig: env.providerConfig,
          tokenizerDeps: env.tokenizerDeps,
        }),
        {
          victim: {
            mode: "json",
            content: '{"product": "widget"}',
            sourceType: "contribution",
            documentKey: FileType.business_case,
            docType: FileType.business_case,
            sourceStageSlug: DialecticStageSlug.Thesis,
          },
        },
      );
      assert("createdCount" in enqueueResult, "enqueueCompressJobs returned an error");
      const baseIdempotencyKey =
        `${parentJob.id}_compress_contribution_business_case_business_case`;
      const compressRow = await readJobByIdempotencyKey(env, baseIdempotencyKey);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressRow.id },
        scope: "local",
      });

      const compressContinueResult = await continueJob(
        buildContinueJobDeps(),
        buildContinueJobParams({
          dbClient: env.admin,
          projectOwnerUserId: env.primaryUserId,
        }),
        buildContinueJobPayload({
          job: compressRow,
          savedOutput: contribution,
        }),
      );
      assert(isContinueJobEnqueuedReturn(compressContinueResult), "COMPRESS continueJob did not return enqueued");
      const compressSuccessor = await readJobByIdempotencyKey(
        env,
        `${compressRow.id}_continue_${contribution.id}`,
      );
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: compressSuccessor.id },
        scope: "local",
      });

      // Arrange — CompressionPrompt artifact via the application function assembleCompressionPrompt
      const compressPayload = compressSuccessor.payload;
      if (!isDialecticCompressJobPayload(compressPayload)) {
        throw new Error("compressSuccessor payload is not a valid compress job payload");
      }
      const promptAssembleResult = await assembleCompressionPrompt(
        {
          dbClient: env.admin,
          renderPromptFn: renderPrompt,
          logger: new MockLogger(),
          fileManager: env.fileManager,
          constructStoragePath,
        },
        {
          consumingStep: {
            outputs_required: buildOutputRule(),
            step_description: "Compress the business case for downstream use.",
          },
          projectId: compressPayload.projectId,
          sessionId: compressPayload.sessionId,
          iterationNumber: compressPayload.iterationNumber,
          stageSlug: compressPayload.stageSlug,
          targetKey: compressPayload.targetKey,
          sourceType: compressPayload.sourceType,
          documentKey: compressPayload.documentKey,
          modelSlug: compressPayload.model_slug,
          attemptCount: compressSuccessor.attempt_count,
          userId: env.primaryUserId,
        },
        {
          mode: compressPayload.mode,
          content: compressPayload.content,
        },
      );
      if ("error" in promptAssembleResult) {
        throw new Error(`assembleCompressionPrompt failed: ${promptAssembleResult.error.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_project_resources",
        criteria: { id: promptAssembleResult.source_prompt_resource_id },
        scope: "local",
      });

      const responseContent = '{"product": "widget"}';
      const responseContext = buildUploadContext(
        buildBuildUploadContextResourceParams({
          projectId: env.testProjectId,
          storageFileType: FileType.CompressedContextRawJson,
          sessionId: env.testSessionId,
          iterationNumber: 1,
          stageSlug: DialecticStageSlug.Thesis,
          targetKey: FileType.business_case,
          sourceType: "contribution",
          documentKey: FileType.business_case,
          contentForStorage: responseContent,
          projectOwnerUserId: env.primaryUserId,
          description: "Partial compressed response for integration test",
        }),
      );
      const responseUpload = await env.fileManager.uploadAndRegisterFile(responseContext);
      if (responseUpload.error) {
        throw new Error(`Failed to upload compressed response: ${responseUpload.error}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_project_resources",
        criteria: { id: responseUpload.record.id },
        scope: "local",
      });

      // Act — assembleContinuationPrompt over the COMPRESS successor
      const compressAssembleResult = await assembleContinuationPrompt({
        dbClient: env.admin,
        fileManager: env.fileManager,
        job: compressSuccessor,
        downloadFromStorage: (bucket: string, path: string) =>
          downloadFromStorage(env.admin, bucket, path),
        constructStoragePath,
      });

      // Assert — COMPRESS branch returns an AssembledPrompt
      if (isAssembleContinuationPromptErrorReturn(compressAssembleResult)) {
        throw new Error(`COMPRESS assembleContinuationPrompt returned error: ${compressAssembleResult.error.message}`);
      }
      assert(typeof compressAssembleResult.promptContent === "string");
      assertExists(compressAssembleResult.source_prompt_resource_id);

      // Arrange — an EXECUTE row → continueJob → EXECUTE successor
      const executeJobId = crypto.randomUUID();
      const executeJob = createMockJobRow(
        buildDialecticExecuteJobPayload({
          sessionId: env.testSessionId,
          projectId: env.testProjectId,
          model_id: env.providerRowId,
          walletId: env.testWalletId,
          user_jwt: env.userJwt,
          idempotencyKey: `${executeJobId}_for_assemble`,
          stageSlug: DialecticStageSlug.Thesis,
          iterationNumber: 1,
          model_slug: env.providerApiIdentifier,
          output_type: FileType.business_case,
          document_key: FileType.business_case,
          document_relationships: { [DialecticStageSlug.Thesis]: contribution.id },
        }),
        {
          id: executeJobId,
          session_id: env.testSessionId,
          user_id: env.primaryUserId,
          stage_slug: DialecticStageSlug.Thesis,
          job_type: "EXECUTE",
          status: "completed",
          attempt_count: 1,
        },
      );
      const { data: insertedExecuteJob, error: executeErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert(executeJob)
        .select("*")
        .single();
      if (executeErr || !insertedExecuteJob) {
        throw new Error(`Failed to insert execute job: ${executeErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: executeJobId },
        scope: "local",
      });

      const executeContinueResult = await continueJob(
        buildContinueJobDeps(),
        buildContinueJobParams({
          dbClient: env.admin,
          projectOwnerUserId: env.primaryUserId,
        }),
        buildContinueJobPayload({
          job: insertedExecuteJob,
          savedOutput: contribution,
        }),
      );
      assert(isContinueJobEnqueuedReturn(executeContinueResult), "EXECUTE continueJob did not return enqueued");
      const executeSuccessor = await readJobByIdempotencyKey(
        env,
        `${insertedExecuteJob.id}_continue_${contribution.id}`,
      );
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: executeSuccessor.id },
        scope: "local",
      });

      // Act — assembleContinuationPrompt over the EXECUTE successor
      const executeAssembleResult = await assembleContinuationPrompt({
        dbClient: env.admin,
        fileManager: env.fileManager,
        job: executeSuccessor,
        project: buildProjectContext({
          id: env.testProjectId,
          user_id: env.primaryUserId,
        }),
        session: buildSessionContext({
          id: env.testSessionId,
          project_id: env.testProjectId,
          selected_model_ids: [env.providerRowId],
          iteration_count: 1,
        }),
        stage: buildStageContext({
          slug: DialecticStageSlug.Thesis,
        }),
        gatherContinuationInputs,
        assembleChunks,
        downloadFromStorage: (bucket: string, path: string) =>
          downloadFromStorage(env.admin, bucket, path),
        constructStoragePath,
      });

      // Assert — EXECUTE branch returns an AssembledPrompt
      if (isAssembleContinuationPromptErrorReturn(executeAssembleResult)) {
        throw new Error(`EXECUTE assembleContinuationPrompt returned error: ${executeAssembleResult.error.message}`);
      }
      assert(typeof executeAssembleResult.promptContent === "string");
      assertExists(executeAssembleResult.source_prompt_resource_id);
    } finally {
      await coreCleanupTestResources("local");
    }
  },
});
